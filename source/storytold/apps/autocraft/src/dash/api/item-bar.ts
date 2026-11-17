// The status bar at the top of the item page: one headline for what is happening to the item now, and the item's path through the
// pipeline stages as a stepper. Everything is read from rows the item already has (jobs, model calls, fix-ups, reviews, decisions,
// pre-approvals); no step is shown that no row backs, except the core stages still ahead of an open item.
import type { DatabaseSync } from "node:sqlite";
import type { ItemBar, ItemBarStep, ItemKind, ItemState, ItemStatus } from "../../../web/src/api/types.ts";
import { stagesInOrder, stageOfStep, type StageId } from "../../stages/registry.ts";
import { clip, hiddenSql, hiddenArgs, stepTitle, type Ctx } from "./trace.ts";
import { COMMENT_UNSENT_DELAYS_MS } from "../../core/rules.ts";

/** A step as people read it: its stage's short name ("Fix-up"), else its title. */
const nameOf = (step: string): string => stageOfStep(step)?.title ?? stepTitle(step);

/** core: shown while it is still ahead of an open item. seen: shown only once the item has been through it. */
type Role = "core" | "seen" | null;
const ROLE: Record<StageId, { pr: Role; issue: Role }> = {
  synced: { pr: null, issue: null }, labels: { pr: null, issue: null },
  dupes: { pr: "seen", issue: "seen" }, classify: { pr: "seen", issue: "seen" }, priority: { pr: "seen", issue: "seen" }, decide: { pr: "seen", issue: "seen" },
  review: { pr: "core", issue: null }, fix: { pr: null, issue: "seen" }, fixup: { pr: "seen", issue: null }, verify: { pr: "core", issue: null },
  merge: { pr: "core", issue: null }, act: { pr: null, issue: "seen" }, postmerge: { pr: "core", issue: null },
};

/** The stage an item's phase is in when no job says otherwise. */
const PHASE_STAGE: Partial<Record<ItemStatus["phase"], StageId>> = { Review: "review", Fixing: "fixup", Verifying: "verify", "In queue": "merge", "Waiting for a person": "decide" };
/** Phases in which AutoCraft has nothing ahead for the item. */
const INACTIVE: ItemStatus["phase"][] = ["Pipeline off", "Held", "Out of scope", "Merged", "Closed"];

/** A failure outside the stage the item is in still heads the bar for this long (phases without a stage: always). */
const RECENT_MS = 2 * 3600_000;
const POSTMERGE_MS = 24 * 3600_000;
const FAILED_JOBS_DAYS = 30;

/** Steps whose completion for an item completes their stage. Merge is done only from merged_at; fix-ups, CI fixes and verification come from their own rows. */
const COMPLETES = new Set(["dupes", "dupes-compare", "classify-new", "classify-all", "referee", "prioritize", "rank", "opus-review", "review-post", "fixissue-collect", "act", "postmerge", "postmerge-file"]);
const FAILED_OUTCOME = /^(refused|failed|error|exit \d)/i;
const HELD_OUTCOME = /^(held|skipped)/i;

/** What a finished job's row for one item says: a failure (the job failed or the outcome starts refused/failed), a completed stage, or nothing. */
export function classifyJob(j: { step: string; state: string; outcome: string | null }): "failed" | "done" | "neutral" {
  if (j.state === "failed" || FAILED_OUTCOME.test(j.outcome ?? "")) return "failed";
  return COMPLETES.has(j.step) && !HELD_OUTCOME.test(j.outcome ?? "") ? "done" : "neutral";
}

export interface Evidence { stage: StageId; state: "done" | "failed"; at: string; jobId: number | null; label: string; reason: string | null; step?: string }

/** Steps of the stepper, in pipeline order. Pure: the rows are read by `evidenceOf`. */
export function deriveSteps(i: {
  kind: ItemKind; state: ItemState; current: StageId | null; running: boolean; evidence: Evidence[]; costs: Map<StageId, number>;
  /** Stages ahead show: the repo's pipeline is on and the phase is active. */
  ahead: boolean; /** The post-merge review is still to come: AutoCraft merged it a short while ago in a repo with the pipeline on. */ postmergeNext: boolean;
}): ItemBarStep[] {
  const latest = new Map<StageId, Evidence>();
  for (const e of i.evidence) {
    const had = latest.get(e.stage);
    if (!had || e.at >= had.at) latest.set(e.stage, e);
  }
  const roles = stagesInOrder().flatMap((s) => { const r = ROLE[s.id][i.kind === "pr" ? "pr" : "issue"]; return r ? [{ s, r }] : []; });
  const state = (id: StageId): ItemBarStep["state"] => (id === i.current && !(!i.running && latest.get(id)?.state === "failed") ? "current" : latest.get(id)?.state ?? "next");
  const last = roles.reduce((m, { s }, idx) => (state(s.id) !== "next" ? idx : m), -1);
  const out: ItemBarStep[] = [];
  roles.forEach(({ s, r }, idx) => {
    const st = state(s.id);
    const ev = latest.get(s.id);
    if (st === "next") {
      if (r !== "core" || idx < last) return;
      if (i.state === "open" ? !i.ahead : s.id !== "postmerge" || i.state !== "merged" || !i.postmergeNext) return;
    }
    out.push({ stage: s.id, title: s.title, state: st, running: st === "current" && i.running, at: st === "next" ? null : ev?.at ?? null, costUsd: i.costs.get(s.id) ?? null, jobId: ev?.jobId ?? null });
  });
  // The current step never sits before a step shown done or failed: it goes after the last one.
  const cur = out.findIndex((x) => x.state === "current");
  let lastEv = -1;
  out.forEach((x, k) => { if (x.state === "done" || x.state === "failed") lastEv = k; });
  if (cur >= 0 && cur < lastEv) out.splice(lastEv, 0, out.splice(cur, 1)[0]!);
  return out;
}

type Q = <T>(sql: string, ...args: (string | number)[]) => T[];

const FIX_DONE = /^(pushed|merged)$/;
/** The unsent comments at the row's head (and, for fix-ups, of its source and carry-over), as column `unsent`. */
const unsentCount = (table: string, head: string, same = "") => `(SELECT COUNT(*) FROM ${table} u WHERE u.repo = x.repo AND u.number = x.number AND u.${head} = x.${head}${same} AND u.state = 'comment-unsent') AS unsent`;
const FIX_FAILED = /^(failed|refused|rejected|too-large|cannot-push|push-denied|comment-failed)$/;

function evidenceOf(c: Ctx, q: Q, mergedAt: string | null, mergedByUs: boolean): Evidence[] {
  const { repo, n } = c;
  const out: Evidence[] = [];
  const reasonOf = (s: string | null | undefined) => (c.staff && s ? clip(s.replace(/^(refused|failed|error):\s*/i, ""), 160) : null);
  const cleared = new Map<string, string>();
  const seen = new Set<number>();
  for (const j of q<{ id: number; step: string; state: string; outcome: string | null; at: string; ended_at: string | null; error: string | null }>(
    "SELECT j.id, j.step, j.state, ji.outcome, ji.at, j.ended_at, j.error FROM job_items ji JOIN jobs j ON j.id = ji.job_id WHERE ji.repo = ? AND ji.number = ? AND j.state IN ('done', 'failed')", repo, n)) {
    seen.add(j.id);
    const stage = stageOfStep(j.step)?.id;
    const at = j.ended_at ?? j.at;
    const kind = classifyJob(j);
    if (kind === "failed") { if (stage) out.push({ stage, state: "failed", at, jobId: j.id, label: nameOf(j.step), reason: reasonOf(j.outcome || j.error), step: j.step }); continue; }
    if (HELD_OUTCOME.test(j.outcome ?? "")) continue;
    if (!(cleared.get(j.step)! >= at)) cleared.set(j.step, at);
    if (stage && kind === "done") out.push({ stage, state: "done", at, jobId: j.id, label: nameOf(j.step), reason: null, step: j.step });
  }
  // A crashed job has no job_items row: read it by its params.
  const since = new Date(Date.now() - FAILED_JOBS_DAYS * 86400_000).toISOString();
  for (const j of q<{ id: number; step: string; ended_at: string; error: string | null }>(
    "SELECT id, step, ended_at, error FROM jobs WHERE state = 'failed' AND repo = ?1 AND ended_at > ?3 AND json_extract(params, '$.number') = ?2", repo, n, since)) {
    const stage = stageOfStep(j.step)?.id;
    if (stage && !seen.has(j.id)) out.push({ stage, state: "failed", at: j.ended_at, jobId: j.id, label: nameOf(j.step), reason: reasonOf(j.error), step: j.step });
  }
  const live = out.filter((e) => !(e.state === "failed" && e.step && (cleared.get(e.step) ?? "") > e.at));
  // A comment that did not reach GitHub fails only when it was the last try (src/core/rules.ts unsentAsk); before that it is posted again.
  const failed = (x: { state: string; unsent: number }) => FIX_FAILED.test(x.state) || (x.state === "comment-unsent" && x.unsent > COMMENT_UNSENT_DELAYS_MS.length);
  // The newest row, past unsent comments that are still retried: a retry may end the older row they left open.
  const rowsOf = (label: string, stage: StageId, rows: { state: string; reason: string | null; at: string; unsent: number }[]) => {
    const top = rows.find((x) => x.state !== "comment-unsent" || failed(x));
    const r = top && (FIX_DONE.test(top.state) || failed(top)) ? top : undefined;
    if (r) live.push({ stage, state: FIX_DONE.test(r.state) ? "done" : "failed", at: r.at, jobId: null, label, reason: FIX_DONE.test(r.state) ? null : reasonOf(r.reason) });
  };
  rowsOf("Fix-up", "fixup", q(`SELECT state, reason, created_at AS at, ${unsentCount("fixups", "from_head", " AND u.source IS x.source AND u.carry_decision IS x.carry_decision")} FROM fixups x WHERE repo = ? AND number = ? AND state != 'superseded' ORDER BY created_at DESC, rowid DESC`, repo, n));
  rowsOf("CI fix", "fixup", q(`SELECT state, reason, created_at AS at, ${unsentCount("ci_fixes", "head")} FROM ci_fixes x WHERE repo = ? AND number = ? AND state != 'superseded' ORDER BY created_at DESC, rowid DESC`, repo, n));
  rowsOf("Conflict merge", "fixup", q(`SELECT state, reason, created_at AS at, ${unsentCount("conflict_merges", "from_head")} FROM conflict_merges x WHERE repo = ? AND number = ? AND state != 'superseded' ORDER BY created_at DESC, rowid DESC`, repo, n));
  for (const v of q<{ state: string; summary: string | null; at: string }>("SELECT state, summary, COALESCE(finished_at, created_at) AS at FROM verifications WHERE repo = ? AND number = ? AND state != 'stale' ORDER BY created_at DESC LIMIT 1", repo, n)) {
    if (v.state === "passed" || v.state === "ci-enough") live.push({ stage: "verify", state: "done", at: v.at, jobId: null, label: "Verify", reason: null });
    else if (v.state === "failed" || v.state === "error") live.push({ stage: "verify", state: "failed", at: v.at, jobId: null, label: "Verify", reason: reasonOf(v.summary) });
  }
  for (const r of q<{ at: string }>("SELECT MAX(answered_at) AS at FROM decisions WHERE repo = ? AND number = ? AND answer IS NOT NULL HAVING at IS NOT NULL", repo, n)) live.push({ stage: "decide", state: "done", at: r.at, jobId: null, label: "Decision", reason: null });
  if (mergedAt && mergedByUs) live.push({ stage: "merge", state: "done", at: mergedAt, jobId: null, label: "Merge", reason: null });
  return live;
}

export function barOf(c: Ctx, it: { kind: ItemKind; state: ItemState; mergedAt: string | null; pipelineOn: boolean }, status: ItemStatus): ItemBar {
  const { db, repo, n } = c;
  const q: Q = (sql, ...args) => db.prepare(sql).all(...args) as never;
  if (c.veiled) return { headline: { tone: "idle", text: status.phase, next: null, model: null, startedAt: null, jobId: null }, steps: [] };

  // A job_items row of a running job means the item is finished, so running work is matched by the job's params and by the item's own running calls.
  const active = q<{ id: number; step: string; state: string; started_at: string | null }>(
    "SELECT id, step, state, started_at FROM jobs WHERE state IN ('running', 'queued') AND repo = ?1 AND json_extract(params, '$.number') = ?2 ORDER BY id", repo, n);
  const runs = q<{ step: string; model: string; job_id: number | null; started_at: string }>(
    "SELECT r.step, r.model, r.job_id, r.started_at FROM agent_run_items i JOIN agent_runs r ON r.id = i.run_id WHERE i.repo = ? AND i.number = ? AND r.state = 'running' ORDER BY r.id", repo, n);
  const job = active.find((j) => j.state === "running");
  const run = runs.find((r) => job && r.job_id === job.id) ?? runs[0];
  const queued = active.find((j) => j.state === "queued");

  const mergedByUs = it.state === "merged" && db.prepare("SELECT 1 FROM merges WHERE repo = ? AND number = ? AND outcome = 'merged'").get(repo, n) !== undefined;
  const evidence = evidenceOf(c, q, it.mergedAt, mergedByUs);
  const costs = new Map<StageId, number>();
  for (const r of q<{ step: string; cost: number | null }>(`SELECT r.step, r.cost_usd AS cost FROM agent_run_items i JOIN agent_runs r ON r.id = i.run_id WHERE i.repo = ? AND i.number = ? AND r.cost_usd IS NOT NULL${hiddenSql(c.hidden)}`, repo, n, ...hiddenArgs(c.hidden))) {
    const id = stageOfStep(r.step)?.id;
    if (id) costs.set(id, (costs.get(id) ?? 0) + r.cost!);
  }

  const runningStep = job?.step ?? run?.step ?? null;
  const open = it.state === "open";
  const phaseStage = PHASE_STAGE[status.phase];
  const latestFail = [...evidence].filter((e) => e.state === "failed").sort((a, b) => (a.at < b.at ? 1 : -1))
    .find((f) => !evidence.some((e) => e.stage === f.stage && e.state === "done" && e.at > f.at) && (!phaseStage || f.stage === phaseStage || Date.now() - Date.parse(f.at) < RECENT_MS));
  // A failed pre-approval heads the bar until a newer one replaces it or the PR merges.
  const pre = open ? (q<{ state: string; reason: string | null }>("SELECT state, reason FROM preapprovals WHERE repo = ? AND number = ? ORDER BY id DESC LIMIT 1", repo, n)[0]) : undefined;
  const preFailed = pre?.state === "failed" ? { label: /fix-up/i.test(pre.reason ?? "") ? "Fix-up" : "Pre-approved merge", reason: c.staff && pre.reason ? clip(pre.reason, 160) : null } : null;
  const current: StageId | null = runningStep ? stageOfStep(runningStep)?.id ?? null : queued ? stageOfStep(queued.step)?.id ?? null : open ? phaseStage ?? null : null;

  let headline: ItemBar["headline"];
  const base = { next: status.next, model: null, startedAt: null, jobId: null };
  const failText = (label: string, reason: string | null) => `${label} failed${reason ? `: ${reason}` : ""}`;
  if (open && runningStep) headline = { tone: "running", text: `${nameOf(runningStep)} running`, next: status.next, model: run?.model ?? null, startedAt: job?.started_at ?? run?.started_at ?? null, jobId: job?.id ?? run?.job_id ?? null };
  else if (open && queued) {
    const pos = (db.prepare("SELECT COUNT(*) AS k FROM jobs WHERE state = 'queued' AND step = ? AND id < ?").get(queued.step, queued.id) as { k: number }).k + 1;
    headline = { ...base, tone: "queued", text: `Queued for ${nameOf(queued.step)} · #${pos} in line`, jobId: queued.id };
  } else if (open && status.outside) headline = { ...base, tone: "waiting", text: `Waiting: ${status.waiting ?? "an operator's release"}`, outside: status.outside };
  else if (preFailed) headline = { ...base, tone: "failed", text: failText(preFailed.label, preFailed.reason) };
  else if (open && status.phase === "Waiting for a person") headline = { ...base, tone: "waiting", text: status.waiting ? `Waiting for ${status.waiting}` : "Waiting for a person" };
  else if (open && latestFail) headline = { ...base, tone: "failed", text: failText(latestFail.label, latestFail.reason), jobId: latestFail.jobId };
  else if (!open) headline = { ...base, tone: "done", text: it.state === "merged" ? "Merged" : "Closed", next: it.state === "merged" ? status.next : null };
  else headline = { ...base, tone: "idle", text: status.waiting ? `${status.phase} · waiting for ${status.waiting}` : status.phase };

  const ahead = open && it.pipelineOn && !INACTIVE.includes(status.phase);
  const mergedMs = it.mergedAt ? Date.now() - Date.parse(it.mergedAt) : Infinity;
  const postmergeNext = mergedByUs && it.pipelineOn && mergedMs < POSTMERGE_MS;
  const steps = deriveSteps({ kind: it.kind, state: it.state, current, running: headline.tone === "running", evidence, costs, ahead, postmergeNext });
  if (preFailed) {
    // The stage the pre-approval failed in shows failed, whatever else the stepper says.
    const k = steps.findIndex((x) => x.stage === (preFailed.label === "Fix-up" ? "fixup" : "merge"));
    if (k >= 0 && steps[k]!.state !== "current") steps[k] = { ...steps[k]!, state: "failed" };
  }
  return { headline, steps };
}
