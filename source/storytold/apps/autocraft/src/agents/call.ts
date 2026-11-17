// Starting a model call: picks the account (Claude) and records the agent run,
// in one transaction so two job processes cannot both take the last slot.
import type { DatabaseSync } from "node:sqlite";
import { boxAccounts } from "./box.ts";
import { accountHasRoom, chooseAccount, freeSlots, RUN_SLOT_MS, type Choice } from "./accounts.ts";
import { insertRun, onRunEnd, type RunStart } from "./runs.ts";
import { scrubError } from "./text.ts";
import { levelBand } from "../rank/level.ts";

/** Set by the job process: which job and step the calls belong to, and whether a cancel was asked. */
export type CallContext = { jobId: number; step: string; stage: number; /** Queue class of the step (StepDef.priority). */ class?: 0 | 1 | 2; /** The job's repo param. */ repo?: string; cancelled(): boolean; /** True once the job is cancelled or the pipeline is switched off: no new model call starts. */ stopping?(): boolean };
let context: CallContext | null = null;
export const setCallContext = (c: CallContext | null): void => void (context = c);
/** The job this process runs, or null outside a job. */
export const currentJobId = (): number | null => context?.jobId ?? null;
/** The job and step this process runs, or null outside a job. */
export const currentJob = (): { id: number; step: string } | null => (context ? { id: context.jobId, step: context.step } : null);

/** Step names for calls made outside a job (the classify and decide commands). */
const PROMPT_STEP: Record<string, { step: string; stage: number }> = {
  "classify.haiku": { step: "classify-new", stage: 2 }, "classify.jev": { step: "classify-new", stage: 2 }, "referee.sonnet": { step: "referee", stage: 2 },
  "fixup.patch": { step: "fixup", stage: 6 }, "verify.plan": { step: "verify", stage: 6 }, "verify.screenshot": { step: "verify", stage: 6 }, "verify.compare": { step: "verify-collect", stage: 6 },
  "verify.summary": { step: "verify-collect", stage: 6 }, "priority.jev": { step: "prioritize", stage: 2 }, "priority.haiku": { step: "prioritize", stage: 2 },
  "dupes.jev": { step: "dupes", stage: 3 }, "dupes.haiku": { step: "dupes", stage: 3 },
  "fixissue.triage": { step: "fixissue", stage: 7 }, "fixissue.patch": { step: "fixissue", stage: 7 }, "review.opus": { step: "opus-review", stage: 5 }, "postmerge.opus": { step: "postmerge", stage: 8 }, "premerge.opus": { step: "premerge", stage: 6 },
  "dupes.compare-prs.opus": { step: "dupes-compare", stage: 3 }, "dupes.compare-issues.sonnet": { step: "dupes-compare", stage: 3 },
  "decide.prepare": { step: "decide", stage: 3 }, "fixup.check": { step: "fixup", stage: 6 }, "fixissue.check": { step: "fixissue", stage: 7 },
  "conversation.turn": { step: "conversation", stage: 3 },
  "areas.jev": { step: "classify-new", stage: 2 }, "areas.haiku": { step: "classify-new", stage: 2 },
  "areas.propose": { step: "areas-propose", stage: 2 }, "areas.suggest": { step: "areas-suggest", stage: 2 },
  "fixup.conflict": { step: "fixup", stage: 6 }, "discord.search": { step: "discord-search", stage: 3 }, "discord.signal.jev": { step: "discord-signal", stage: 3 }, "discord.signal.haiku": { step: "discord-signal", stage: 3 },
  "discord.issue-questions": { step: "discord-issue", stage: 3 }, "discord.issue-draft": { step: "discord-issue", stage: 3 }, "discord.junk.jev": { step: "discord-issue", stage: 3 }, "discord.junk.haiku": { step: "discord-issue", stage: 3 },
  "cifix.patch": { step: "cifix", stage: 6 }, "mainfix.classify": { step: "main-fix", stage: 6 },
  "lint.reference.jev": { step: "opus-review", stage: 5 }, "lint.reference.haiku": { step: "opus-review", stage: 5 },
};

export function stepOf(promptId: string): { jobId: number | null; step: string; stage: number } {
  if (context) return { jobId: context.jobId, step: context.step, stage: context.stage };
  return { jobId: null, ...(PROMPT_STEP[promptId] ?? { step: "unknown", stage: 0 }) };
}

export const allocation = { pollMs: 3000, logEveryMs: 5 * 60_000, staleMs: 30_000 };

export class NoAccountError extends Error {}
export class CancelledError extends Error {}
/** The pipeline was switched off: the job ends as done, not failed. */
export class StoppedError extends Error {}
/** True for an error that ends a step's work without a failure row. */
export const isHalt = (e: unknown): boolean => e instanceof CancelledError || e instanceof StoppedError;

/** Queue class of a call outside a job, from the step its prompt belongs to (inside a job the step's priority is used). */
const classOfStep = (step: string): 0 | 1 | 2 =>
  step.startsWith("security-") ? 2
    : ["fixup", "cifix", "main-fix", "fixissue", "fixissue-collect", "verify", "verify-collect", "premerge", "opus-review", "decide", "conversation"].includes(step) ? 1 : 0;

/** The queue class of the call being made: the job step's priority, or for calls outside a job the class of the prompt's step. */
export const currentClass = (promptId?: string): 0 | 1 | 2 =>
  context?.class ?? classOfStep(promptId ? (PROMPT_STEP[promptId]?.step ?? "unknown") : (context?.step ?? "unknown"));

/** Sleeps up to `ms`, or less when a run of this process ends (its slot may be free). */
function sleepOrWake(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let off = () => {};
    const t = setTimeout(() => { off(); resolve(); }, ms);
    off = onRunEnd(() => { clearTimeout(t); off(); resolve(); });
  });
}

type Waiter = { id: number; cls: number; level: number; step: string; repo: string | null; since: number };

const runningBy = (db: DatabaseSync, nowMs: number, col: "j.repo" | "r.step"): Map<string, number> =>
  new Map((db.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM agent_runs r LEFT JOIN jobs j ON j.id = r.job_id WHERE r.state = 'running' AND r.provider = 'claude' AND r.started_at >= ? AND ${col} IS NOT NULL GROUP BY ${col}`)
    .all(new Date(nowMs - RUN_SLOT_MS).toISOString()) as { k: string; n: number }[]).map((r) => [r.k, Number(r.n)]));

/** A waiter gains one level band for each of these minutes it has waited (at most all 4 bands), so a steady flow of P0 calls cannot starve P2 ones. Aging orders waiters; nothing waits on a timer. */
export const LEVEL_AGING_MS = 30 * 60_000;
export const agedLevel = (level: number, sinceMs: number, nowMs: number): number => level + Math.min(4, Math.floor(Math.max(0, nowMs - sinceMs) / LEVEL_AGING_MS));

/** Fresh, eligible waiters in claim order: class, then fewest running calls of the waiter's repo (one repo cannot take every slot), then the item's priority level raised by the time waited (P0 first), then fewest running calls of its step, then oldest. */
function waiterOrder(db: DatabaseSync, nowMs: number): Waiter[] {
  const rows = db.prepare("SELECT id, class AS cls, level, step, repo, since FROM model_waits WHERE provider = 'claude' AND eligible = 1 AND seen_at >= ?").all(nowMs - allocation.staleMs) as Waiter[];
  const repoN = runningBy(db, nowMs, "j.repo"), stepN = runningBy(db, nowMs, "r.step");
  return rows.sort((x, y) => y.cls - x.cls || (repoN.get(x.repo ?? "") ?? 0) - (repoN.get(y.repo ?? "") ?? 0) || agedLevel(y.level, y.since, nowMs) - agedLevel(x.level, x.since, nowMs) || (stepN.get(x.step) ?? 0) - (stepN.get(y.step) ?? 0) || x.since - y.since || x.id - y.id);
}

/** How many more Claude calls a caller may start now: free slots, minus the fresh eligible waiters that rank ahead of a new waiter of the current call's class. */
export function queueRoom(db: DatabaseSync, cls: 0 | 1 | 2 = currentClass()): number {
  const ahead = (db.prepare("SELECT COUNT(*) AS n FROM model_waits WHERE provider = 'claude' AND eligible = 1 AND seen_at >= ? AND class >= ?").get(Date.now() - allocation.staleMs, cls) as { n: number }).n;
  return Math.max(0, freeSlots(db) - Number(ahead));
}

export type Started = { runId: number; configDir: string; accountId: string };

type RunInput = Omit<RunStart, "accountId" | "jobId" | "step" | "stage">;

/**
 * One attempt to take a slot: picks the account and records the running agent run
 * in a single BEGIN IMMEDIATE transaction, so job processes that choose at the
 * same time cannot both take the last slot. Returns why it could not, if it could not.
 */
export function tryStartClaudeRun(db: DatabaseSync, s: RunInput, minTokenMs?: number): Started | Exclude<Choice, { account: unknown }> {
  db.exec("BEGIN IMMEDIATE");
  try {
    const c = chooseAccount(db, Date.now(), minTokenMs);
    if (!("account" in c)) {
      db.exec("COMMIT");
      return c;
    }
    const runId = insertRun(db, { ...s, ...stepOf(s.promptId), accountId: c.account.id });
    db.exec("COMMIT");
    return { runId, configDir: c.account.configDir, accountId: c.account.id };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch { /* already committed */ }
    throw e;
  }
}

export class WaitLimitError extends Error {}

/**
 * One poll of a waiting call, in one BEGIN IMMEDIATE: refreshes the waiter row (re-inserting it when it was deleted),
 * works out whether an account could take the call, and claims only when the call ranks within the free slots.
 * The waiter row is deleted in the same transaction as the run insert.
 */
function pollClaude(db: DatabaseSync, w: Waiter, s: RunInput, minTokenMs?: number): { started: Started } | { wait: Exclude<Choice, { account: unknown }> } {
  db.exec("BEGIN IMMEDIATE");
  try {
    const nowMs = Date.now();
    const c = chooseAccount(db, nowMs, minTokenMs);
    // Eligibility ignores full slots: a waiter that only lacks a slot still counts when ranking, one that lacks a fresh token does not.
    const eligible = "account" in chooseAccount(db, nowMs, minTokenMs, true) ? 1 : 0;
    const up = db.prepare("UPDATE model_waits SET seen_at = ?, eligible = ? WHERE id = ?").run(nowMs, eligible, w.id);
    if (Number(up.changes) === 0) db.prepare("INSERT INTO model_waits (id, provider, class, level, job_id, step, repo, since, seen_at, eligible) VALUES (?, 'claude', ?, ?, ?, ?, ?, ?, ?, ?)").run(w.id, w.cls, w.level, context?.jobId ?? null, w.step, w.repo, w.since, nowMs, eligible);
    if (!("account" in c)) {
      db.exec("COMMIT");
      return { wait: c };
    }
    const rank = waiterOrder(db, nowMs).findIndex((x) => x.id === w.id);
    if (rank < 0 || rank >= freeSlots(db, nowMs)) {
      db.exec("COMMIT");
      return { wait: { wait: "other calls are ahead in the queue" } };
    }
    const runId = insertRun(db, { ...s, ...stepOf(s.promptId), accountId: c.account.id });
    db.prepare("DELETE FROM model_waits WHERE id = ?").run(w.id);
    db.exec("COMMIT");
    return { started: { runId, configDir: c.account.configDir, accountId: c.account.id } };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch { /* already committed */ }
    throw e;
  }
}

/** Waits for an enabled account with a free slot and headroom (at most `maxWaitMs` when given, else for ever), then records the running agent run on it. Waiting calls are ordered by class (security first), then by the running calls of their repo and step, then by age. With `minTokenMs`, accounts whose login token expires sooner are skipped and the call waits for a refresh. */
export async function startClaudeRun(db: DatabaseSync, s: RunInput, log: (line: string) => void = console.log, maxWaitMs?: number, minTokenMs?: number): Promise<Started> {
  let lastLog = 0;
  const began = Date.now();
  const first = s.items[0];
  const w: Waiter = { id: 0, cls: currentClass(s.promptId), level: levelBand(db, first?.repo, first?.number), step: stepOf(s.promptId).step, repo: context?.repo ?? null, since: began };
  // The row exists before the first poll returns, so queueRoom() is exact right after a call is made.
  w.id = Number(db.prepare("INSERT INTO model_waits (provider, class, level, job_id, step, repo, since, seen_at, eligible) VALUES ('claude', ?, ?, ?, ?, ?, ?, ?, 0)").run(w.cls, w.level, context?.jobId ?? null, w.step, w.repo, began, began).lastInsertRowid);
  let claimed = false;
  try {
    for (;;) {
      if (context?.cancelled()) throw new CancelledError("cancelled while waiting for a Claude account");
      if (context?.stopping?.()) throw new StoppedError("the pipeline was switched off");
      const r = pollClaude(db, w, s, minTokenMs);
      if ("started" in r) {
        claimed = true; // the claim transaction deleted the row
        return r.started;
      }
      const c = r.wait;
      if ("none" in c) throw new NoAccountError("no Claude account is enabled; an operator enables one on the Accounts page or with `autocraft accounts set <id> --enabled yes`");
      if (maxWaitMs !== undefined && Date.now() - began >= maxWaitMs) throw new WaitLimitError("no Claude account slot became free in time");
      if (Date.now() - lastLog >= allocation.logEveryMs) {
        lastLog = Date.now();
        log(`waiting for a Claude account: ${scrubError(c.wait)}`);
      }
      await sleepOrWake(allocation.pollMs);
    }
  } finally {
    if (!claimed) db.prepare("DELETE FROM model_waits WHERE id = ?").run(w.id);
  }
}

/** Records a Jev call (no account, no slot). */
export function startJevRun(db: DatabaseSync, s: Omit<RunStart, "accountId" | "jobId" | "step" | "stage">): number {
  return insertRun(db, { ...s, ...stepOf(s.promptId), accountId: null });
}

/** Records a follow-up run on the account of an earlier call (its session lives there), or returns null when that account is no longer enabled, has no headroom or no free slot. Same transaction rule as `tryStartClaudeRun`. */
export function tryStartFollowUp(db: DatabaseSync, accountId: string, s: RunInput): number | null {
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!accountHasRoom(db, accountId)) {
      db.exec("COMMIT");
      return null;
    }
    const id = insertRun(db, { ...s, ...stepOf(s.promptId), accountId });
    db.exec("COMMIT");
    return id;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch { /* already committed */ }
    throw e;
  }
}

/** The config directory of a box account, or null when the box no longer lists it. */
export const accountConfigDir = (db: DatabaseSync, accountId: string): string | null => boxAccounts(db).find((b) => b.id === accountId)?.configDir ?? null;
