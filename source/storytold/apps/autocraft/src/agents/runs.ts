// Agent runs: one row per model call made through the prompt registry. Written
// by the callers in src/classify/run.ts, read by the API.
import { filtered, hiddenTest, type HiddenRepos } from "../hidden-sql.ts";
import { gunzipSync, gzipSync } from "node:zlib";
import type { DatabaseSync } from "node:sqlite";
import type { AgentRun, AgentRunDetail, AgentRunFilter, AgentRunPage, AgentRunState, AgentRunTool, ItemRef, ItemShown, RateBucket, Rates } from "../../web/src/api/types.ts";

export const MAX_ITEM_REFS = 50;
/** Ten years: the item history keeps every model call with its prompt and output. */
export const RUN_KEEP_MS = 3650 * 86_400_000;
/** Texts are kept as long as the runs; they are stored compressed. */
export const TEXT_KEEP_MS = RUN_KEEP_MS;
const TEXT_MAX = 1_000_000;
const ERROR_MAX = 400;

export type RunStart = {
  jobId: number | null; step: string; stage: number;
  promptId: string; promptVersion: string; provider: "claude" | "jev" | "codex"; model: string; accountId: string | null;
  reasoningEffort?: string;
  tokenBudget?: number; budgetScope?: string;
  items: ItemRef[]; prompt: string;
};

export type RunEnd = {
  state: Exclude<AgentRunState, "running">;
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  summary?: string | null; error?: string | null; output?: string | null;
  costUsd?: number | null;
  model?: string;
  providerUsage?: { inputTokens: number; cachedInputTokens: number; cacheWriteInputTokens: number; outputTokens: number; reasoningOutputTokens: number; totalTokens: number; modelProvider: string; usageComplete?: boolean };
};

/** A stored text: gzip, which SQLite keeps as a BLOB. */
export const packText = (s: string): Uint8Array => gzipSync(s);
/** Reads a stored text; rows from before compression hold plain strings. */
export const unpackText = (v: unknown): string | null => (typeof v === "string" ? v : v instanceof Uint8Array ? gunzipSync(v).toString("utf8") : null);

import { shownLookup } from "../dash/api/shown.ts";
import { scrub } from "../runner/scrub.ts";

const now = (): string => new Date().toISOString();

const endWakers = new Set<() => void>();
/** Calls `f` when a run of this process ends (a slot may be free); returns the way to stop listening. */
export function onRunEnd(f: () => void): () => void {
  endWakers.add(f);
  return () => void endWakers.delete(f);
}
const runEnded = (): void => { for (const f of [...endWakers]) f(); };

/** Inserts the running row, its item refs and its prompt text. Does not open a transaction. */
export function insertRun(db: DatabaseSync, s: RunStart): number {
  const refs = s.items.slice(0, MAX_ITEM_REFS);
  const id = Number(db.prepare(`INSERT INTO agent_runs (job_id, step, stage, prompt_id, prompt_version, provider, model, reasoning_effort, token_budget, budget_scope, account_id, items, item_count, state, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`)
    .run(s.jobId, s.step, s.stage, s.promptId, s.promptVersion, s.provider, s.model, s.reasoningEffort ?? null, s.tokenBudget ?? null, s.budgetScope ?? null, s.accountId, JSON.stringify(refs), s.items.length, now()).lastInsertRowid);
  const ins = db.prepare("INSERT OR IGNORE INTO agent_run_items (run_id, repo, number) VALUES (?, ?, ?)");
  for (const r of s.items) ins.run(id, r.repo, r.number);
  db.prepare("INSERT INTO agent_run_texts (run_id, prompt) VALUES (?, ?)").run(id, packText(scrub(s.prompt.slice(0, TEXT_MAX))));
  return id;
}

export function finishRun(db: DatabaseSync, id: number, e: RunEnd): void {
  const t = e.tokens;
  db.prepare(`UPDATE agent_runs SET state = ?, ended_at = ?, input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_write_tokens = ?, cost_usd = ?, summary = ?, error = ?, progress = NULL,
    model=COALESCE(?,model),provider_usage=?
    WHERE id = ? AND state = 'running'`)
    .run(e.state, now(), t?.input ?? null, t?.output ?? null, t?.cacheRead ?? null, t?.cacheWrite ?? null, e.costUsd ?? null, e.summary ?? null, e.error ? e.error.slice(0, ERROR_MAX) : null, e.model ?? null, e.providerUsage ? JSON.stringify(e.providerUsage) : null, id);
  if (e.output) db.prepare("UPDATE agent_run_texts SET output = ? WHERE run_id = ?").run(packText(scrub(e.output.slice(0, TEXT_MAX))), id);
  setImmediate(runEnded); // after the caller's own follow-up claim, which gets the freed slot first
}

/** The latest progress line of a running call (src/classify/progress.ts). */
export function setRunProgress(db: DatabaseSync, id: number, line: string): void {
  db.prepare("UPDATE agent_runs SET progress = ? WHERE id = ? AND state = 'running'").run(line, id);
}

/** Marks running rows as failed: all of them, or those of one job. Used when the process that made the calls is gone. */
export function failRunning(db: DatabaseSync, reason: string, jobId?: number): number {
  const r = jobId === undefined
    ? db.prepare("UPDATE agent_runs SET state = 'failed', ended_at = ?, error = ?, summary = ? WHERE state = 'running'").run(now(), reason, reason)
    : db.prepare("UPDATE agent_runs SET state = 'failed', ended_at = ?, error = ?, summary = ? WHERE state = 'running' AND job_id = ?").run(now(), reason, reason, jobId);
  return Number(r.changes);
}

// ---- reading -----------------------------------------------------------------

type RunRow = {
  id: number; job_id: number | null; step: string; stage: number; prompt_id: string; prompt_version: string; provider: string; model: string;
  account_id: string | null; account_label: string | null; items: string; item_count: number; state: AgentRunState; started_at: string; ended_at: string | null;
  reasoning_effort: string | null; provider_usage: string | null;
  input_tokens: number | null; output_tokens: number | null; cache_read_tokens: number | null; cache_write_tokens: number | null; summary: string | null; error: string | null; progress: string | null; cost_usd: number | null;
};

const SELECT = "SELECT r.*, a.label AS account_label FROM agent_runs r LEFT JOIN claude_accounts a ON a.id = r.account_id";

function refs(s: string): ItemRef[] {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? (v as ItemRef[]).filter((x) => typeof x?.repo === "string" && Number.isInteger(x?.number)) : [];
  } catch {
    return [];
  }
}

function providerUsageOf(raw: string | null): AgentRun["providerUsage"] | undefined {
  if (!raw || raw.length > 4096) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const counters = ["inputTokens", "cachedInputTokens", "cacheWriteInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens"];
    if (Object.keys(record).filter(key => key !== "usageComplete").sort().join("|") !== [...counters, "modelProvider"].sort().join("|") ||
        counters.some(key => !Number.isSafeInteger(record[key]) || (record[key] as number) < 0) ||
        (record.usageComplete !== undefined && typeof record.usageComplete !== "boolean") ||
        typeof record.modelProvider !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/.test(record.modelProvider)) return undefined;
    return record as NonNullable<AgentRun["providerUsage"]>;
  } catch { return undefined; }
}

function toRun(r: RunRow, shown: (repo: string, number: number) => ItemShown): AgentRun {
  const providerUsage = providerUsageOf(r.provider_usage);
  return {
    id: r.id, jobId: r.job_id, step: r.step, stage: r.stage, promptId: r.prompt_id, promptVersion: r.prompt_version,
    provider: r.provider === "jev" || r.provider === "codex" || r.provider === "claude" ? r.provider : "unknown", model: r.model,
    ...(r.reasoning_effort && { reasoningEffort: r.reasoning_effort }),
    ...(providerUsage && { providerUsage }),
    accountId: r.account_id, accountLabel: r.account_id ? (r.account_label ?? r.account_id) : null,
    items: refs(r.items).map((x) => ({ ...x, ...shown(x.repo, x.number) })), itemCount: r.item_count, state: r.state, startedAt: r.started_at, endedAt: r.ended_at,
    inputTokens: r.input_tokens, outputTokens: r.output_tokens, cacheReadTokens: r.cache_read_tokens, cacheWriteTokens: r.cache_write_tokens, costUsd: r.cost_usd, summary: r.summary,
    ...(r.state === "running" && r.progress && { progress: r.progress }),
  };
}

export class RunQueryError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const STEP_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const ACCOUNT_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const CURSOR_RE = /^[1-9][0-9]{0,15}$/;
export const AGENT_PAGE_DEFAULT = 50, AGENT_PAGE_MAX = 200;

/** Newest first, keyset on id: a page costs index reads proportional to its size, however many runs exist. */
export function listRuns(db: DatabaseSync, f: AgentRunFilter, hidden: HiddenRepos = []): AgentRunPage {
  if (f.state !== undefined && !["running", "done", "failed", "recent"].includes(f.state)) throw new RunQueryError(400, "unknown state");
  if (f.step !== undefined && !STEP_RE.test(f.step)) throw new RunQueryError(400, "bad step");
  if (f.account !== undefined && !ACCOUNT_RE.test(f.account)) throw new RunQueryError(400, "bad account");
  if (f.repo !== undefined && !REPO_RE.test(f.repo)) throw new RunQueryError(400, "bad repo");
  if (f.cursor !== undefined && !CURSOR_RE.test(f.cursor)) throw new RunQueryError(400, "bad cursor");
  if (f.limit !== undefined && (!Number.isInteger(f.limit) || f.limit < 1 || f.limit > AGENT_PAGE_MAX)) throw new RunQueryError(400, `limit must be a whole number from 1 to ${AGENT_PAGE_MAX}`);
  const limit = f.limit ?? AGENT_PAGE_DEFAULT;
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.cursor) { where.push("r.id < ?"); args.push(Number(f.cursor)); }
  if (f.state && f.state !== "recent") where.push(`r.state = '${f.state}'`);   // validated above; a literal lets the planner use the state index
  if (f.step) { where.push("r.step = ?"); args.push(f.step); }
  if (f.account) { where.push("r.account_id = ?"); args.push(f.account); }
  if (filtered(hidden)) { const t = touchesHidden(hidden); where.push(t.sql); args.push(...t.args); }
  let sql: string;
  if (f.repo) {
    // Driven by the (repo, run_id, number) index, newest run first, one row per run (the run's lowest number in the repo): no sort, stops at the limit.
    where.unshift("i.repo = ?", "i.number = (SELECT MIN(number) FROM agent_run_items j WHERE j.run_id = i.run_id AND j.repo = i.repo)");
    args.unshift(f.repo);
    sql = `SELECT r.*, a.label AS account_label FROM agent_run_items i JOIN agent_runs r ON r.id = i.run_id LEFT JOIN claude_accounts a ON a.id = r.account_id
      WHERE ${where.join(" AND ").replace("r.id < ?", "i.run_id < ?")} ORDER BY i.run_id DESC LIMIT ?`;
  } else {
    sql = `${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.id DESC LIMIT ?`;
  }
  const rows = db.prepare(sql).all(...args, limit + 1) as RunRow[];
  const shown = shownLookup(db);
  const page = rows.slice(0, limit);
  return { runs: page.map((x) => toRun(x, shown)), nextCursor: rows.length > limit ? String(page[page.length - 1]!.id) : null };
}

/**
 * SQL (with its `?` arguments) true when the run `r` may be shown under a repo filter: it is bound to an item and has no item in a
 * hidden repo. A run recorded without items is about no repo the filter can test, so only operators (no filter) see it.
 */
export const touchesHidden = (hidden: HiddenRepos): { sql: string; args: string[] } => {
  const h = hiddenTest("x.repo", hidden);
  return { sql: `EXISTS (SELECT 1 FROM agent_run_items y WHERE y.run_id = r.id) AND NOT EXISTS (SELECT 1 FROM agent_run_items x WHERE x.run_id = r.id AND ${h.sql})`, args: h.args };
};

/** A run that touches a hidden repo is not found; prompt and output text go only to `texts` viewers (operators). */
export function getRun(db: DatabaseSync, id: unknown, view: { hidden?: HiddenRepos; texts?: boolean } = { texts: true }): AgentRunDetail {
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) throw new RunQueryError(400, "not a run id");
  const r = db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as RunRow | undefined;
  if (!r) throw new RunQueryError(404, `no agent run ${id}`);
  if (view.hidden && filtered(view.hidden) && !db.prepare(`SELECT 1 FROM agent_runs r WHERE r.id = ? AND ${touchesHidden(view.hidden).sql}`).get(id, ...touchesHidden(view.hidden).args)) {
    throw new RunQueryError(404, `no agent run ${id}`);
  }
  const tools = runTools(db, id);
  // Tool arguments carry file paths and patch text: like the prompt, for operators only.
  if (!view.texts) return { ...toRun(r, shownLookup(db)), prompt: null, output: null, error: r.error ? "failed" : null, tools: tools.map((t) => ({ ...t, args: null })), textsHidden: true };
  const t = db.prepare("SELECT prompt, output FROM agent_run_texts WHERE run_id = ?").get(id) as { prompt: unknown; output: unknown } | undefined;
  return { ...toRun(r, shownLookup(db)), prompt: unpackText(t?.prompt), output: unpackText(t?.output), error: r.error, tools };
}

/** The tool uses of a run in order; a check-tool use carries its model_checks row. */
export function runTools(db: DatabaseSync, runId: number): AgentRunTool[] {
  const rows = db.prepare(`SELECT t.seq, t.tool, t.args, t.result_bytes, t.is_error, t.started_at, t.ended_at, t.check_id, c.command, c.crate, c.test_name, c.outcome
    FROM agent_run_tools t LEFT JOIN model_checks c ON c.id = t.check_id WHERE t.run_id = ? ORDER BY t.seq`).all(runId) as
    { seq: number; tool: string; args: string; result_bytes: number | null; is_error: number; started_at: string | null; ended_at: string | null; check_id: number | null; command: string | null; crate: string | null; test_name: string | null; outcome: string | null }[];
  return rows.map((r) => ({
    seq: r.seq, tool: r.tool, args: r.args, resultBytes: r.result_bytes, isError: r.is_error === 1, startedAt: r.started_at, endedAt: r.ended_at,
    check: r.check_id === null ? null : { id: r.check_id, command: r.command ?? "", crate: r.crate, testName: r.test_name, outcome: r.outcome },
  }));
}

/** Labels of the accounts each job's runs used, for a page of jobs. */
export function accountLabelsByJob(db: DatabaseSync, jobIds: number[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (!jobIds.length) return out;
  const marks = jobIds.map(() => "?").join(",");
  const rows = db.prepare(`SELECT DISTINCT r.job_id AS job, COALESCE(a.label, r.account_id) AS label FROM agent_runs r LEFT JOIN claude_accounts a ON a.id = r.account_id
    WHERE r.job_id IN (${marks}) AND r.account_id IS NOT NULL ORDER BY 1, 2`).all(...jobIds) as { job: number; label: string }[];
  for (const r of rows) out.set(r.job, [...(out.get(r.job) ?? []), r.label]);
  return out;
}

// ---- rates ---------------------------------------------------------------------

/** Items moved per stage, and usage of the enabled accounts, in hourly (24h) or daily (7d) buckets ending now (UTC). */
export async function rates(db: DatabaseSync, window: unknown, nowMs: number = Date.now(), hidden: HiddenRepos = []): Promise<Rates> {
  if (window !== "24h" && window !== "7d") throw new RunQueryError(400, "window must be 24h or 7d");
  const hourly = window === "24h", step = hourly ? 3600_000 : 86_400_000, n = hourly ? 24 : 7;
  const end = Math.floor(nowMs / step) * step + step;
  const start = end - n * step;
  const from = new Date(start).toISOString();
  const fmt = hourly ? "%Y-%m-%dT%H:00:00.000Z" : "%Y-%m-%dT00:00:00.000Z";
  const keys = Array.from({ length: n }, (_, i) => new Date(start + i * step).toISOString());

  const jobHide = hiddenTest("repo", hidden), runHide = touchesHidden(hidden);
  const empty = () => new Map<string, RateBucket>(keys.map((t) => [t, { t, items: 0, runs: 0, failed: 0 }]));
  const byStep = new Map<string, Map<string, RateBucket>>();
  const bucketsOf = (s: string) => byStep.get(s) ?? (byStep.set(s, empty()), byStep.get(s)!);

  for (const r of db.prepare(`SELECT step, strftime('${fmt}', started_at) AS t, COALESCE(SUM(items), 0) AS items FROM jobs
    WHERE started_at >= ? AND started_at < ?${filtered(hidden) ? ` AND (repo IS NULL OR NOT (${jobHide.sql}))` : ""} GROUP BY step, t`)
    .all(from, new Date(end).toISOString(), ...(filtered(hidden) ? jobHide.args : [])) as { step: string; t: string; items: number }[]) {
    const b = bucketsOf(r.step).get(r.t);
    if (b) b.items = r.items;
  }
  for (const r of db.prepare(`SELECT step, strftime('${fmt}', started_at) AS t, COUNT(*) AS runs, COALESCE(SUM(state = 'failed'), 0) AS failed FROM agent_runs r
    WHERE started_at >= ? AND started_at < ?${filtered(hidden) ? ` AND ${runHide.sql}` : ""} GROUP BY step, t`)
    .all(from, new Date(end).toISOString(), ...(filtered(hidden) ? runHide.args : [])) as { step: string; t: string; runs: number; failed: number }[]) {
    const b = bucketsOf(r.step).get(r.t);
    if (b) { b.runs = r.runs; b.failed = r.failed; }
  }
  // Loaded here: steps.ts imports modules that import the model-call code, which imports this file.
  const steps = await (await import("../runner/steps.ts")).loadSteps();
  const names = [...new Set([...steps.keys(), ...byStep.keys()])];
  const stages = names.map((s) => ({ step: s, title: steps.get(s)?.title ?? s, buckets: [...bucketsOf(s).values()] }))
    .sort((a, b) => (steps.get(a.step)?.stage ?? 99) - (steps.get(b.step)?.stage ?? 99) || a.step.localeCompare(b.step));

  const accounts = (db.prepare("SELECT id, label FROM claude_accounts WHERE enabled = 1 ORDER BY id").all() as { id: string; label: string }[]).map((a) => ({
    id: a.id, label: a.label,
    samples: (db.prepare(`SELECT strftime('${fmt}', t) AS t, MAX(five_hour_pct) AS fiveHourPct, MAX(weekly_pct) AS weeklyPct FROM account_usage_samples
      WHERE account_id = ? AND t >= ? GROUP BY 1 ORDER BY 1`).all(a.id, from) as { t: string; fiveHourPct: number | null; weeklyPct: number | null }[]),
  }));
  return { window, bucket: hourly ? "hour" : "day", stages, accounts };
}

// ---- retention -----------------------------------------------------------------

/** Drops prompt and output text and tool uses with their runs after RUN_KEEP_MS (ten years). Cutoffs are by id, found through the started_at index. */
export function pruneRuns(db: DatabaseSync, nowMs: number = Date.now()): { texts: number; runs: number } {
  const maxBefore = (ms: number): number => (db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM agent_runs WHERE started_at < ?").get(new Date(nowMs - ms).toISOString()) as { id: number }).id;
  const texts = Number(db.prepare("DELETE FROM agent_run_texts WHERE run_id <= ?").run(maxBefore(TEXT_KEEP_MS)).changes);
  const old = maxBefore(RUN_KEEP_MS);
  db.prepare("DELETE FROM agent_run_tools WHERE run_id <= ?").run(old);
  db.prepare("DELETE FROM agent_run_items WHERE run_id <= ?").run(old);
  const runs = Number(db.prepare("DELETE FROM agent_runs WHERE id <= ?").run(old).changes);
  return { texts, runs };
}
