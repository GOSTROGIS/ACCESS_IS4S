// Rows of the security deep scan and their views for the API (web/src/api/types.ts).
import type { DatabaseSync } from "node:sqlite";
import { modelPolicy } from "../agents/codex/config.ts";
import { dropSessions } from "../prepush/resume.ts";
import { slugOf } from "../owners.ts";
import { securityRepo } from "./rules.ts";
import type { FindingCall, FindingRef, FindingSeverity, FindingState, FindingSummary, FindingVerification, FindingView, ScanArea, ScanCall, ScanDetail, ScanEntryPoint, ScanState, ScanTestState, FindingScanTest, ScanView, SecurityOverview } from "../../web/src/api/types.ts";

export const ACTIVE_STATES: ScanState[] = ["modeling", "scanning", "verifying"];
/** Findings in these states are the scan's own bookkeeping, never listed. */
export const INTERNAL_FINDING_STATES = ["unverified", "disproved", "duplicate"] as const;
const HIDDEN = INTERNAL_FINDING_STATES.map((s) => `'${s}'`).join(", ");
const now = (): string => new Date().toISOString();

type ScanRow = {
  id: number; repo: string; commit_sha: string | null; state: ScanState; cap_usd: number | null; cost_usd: number; estimate_usd: number | null; budget_mode: "usd" | "tokens";
  areas_total: number; areas_done: number; started_by: string; started_at: string; ended_at: string | null; error: string | null; job_id: number | null; threat_model: string | null;
};

export const scanRow = (db: DatabaseSync, id: number): ScanRow | undefined => db.prepare("SELECT * FROM security_scans WHERE id = ?").get(id) as ScanRow | undefined;

export function toScan(db: DatabaseSync, r: ScanRow): ScanView {
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM security_findings WHERE scan_id = ? AND state NOT IN (${HIDDEN})`).get(r.id) as { n: number }).n;
  return {
    id: r.id, repo: r.repo, commit: r.commit_sha, state: r.state, capUsd: r.cap_usd, budgetMode: r.budget_mode ?? "usd",
    costUsd: r.budget_mode === "tokens" ? null : r.cost_usd, estimateUsd: r.budget_mode === "tokens" ? null : r.estimate_usd,
    areasTotal: r.areas_total, areasDone: r.areas_done, findingCount: n, startedBy: r.started_by, startedAt: r.started_at, endedAt: r.ended_at, error: r.error,
  };
}

/** The active scan of a repo, if any. Scans of one repo never overlap. */
export function activeScan(db: DatabaseSync, repo: string): ScanRow | undefined {
  return db.prepare(`SELECT * FROM security_scans WHERE repo = ? AND state IN (${ACTIVE_STATES.map((s) => `'${s}'`).join(", ")}) ORDER BY id DESC LIMIT 1`).get(repo) as ScanRow | undefined;
}

/** An active scan whose job has ended without the scan finishing (a killed runner, a cancelled job) is closed: stopped when the job was cancelled, else failed. */
export function reconcileScans(db: DatabaseSync, repo?: string): void {
  const rows = db.prepare(`SELECT s.id, j.state AS job_state FROM security_scans s JOIN jobs j ON j.id = s.job_id
    WHERE s.state IN (${ACTIVE_STATES.map((s) => `'${s}'`).join(", ")}) AND j.state IN ('done', 'failed', 'cancelled')${repo ? " AND s.repo = ?" : ""}`).all(...(repo ? [repo] : [])) as { id: number; job_state: string }[];
  // A scan whose job was never recorded (the request died between the insert and the enqueue) would block its repo for good.
  const orphans = db.prepare(`SELECT id FROM security_scans WHERE job_id IS NULL AND started_at < ? AND state IN (${ACTIVE_STATES.map((s) => `'${s}'`).join(", ")})${repo ? " AND repo = ?" : ""}`)
    .all(new Date(Date.now() - 60_000).toISOString(), ...(repo ? [repo] : [])) as { id: number }[];
  for (const o of orphans) finishScan(db, o.id, "failed", "The scan was never queued.");
  for (const r of rows) {
    const cancelled = r.job_state === "cancelled";
    finishScan(db, r.id, cancelled ? "stopped" : "failed", cancelled ? null : "The scan's job ended before the scan finished.");
  }
}

export const UNCHECKED_RESULT = "Not verified: the scan ended before this finding was checked.";

/** Findings a capped scan left unchecked, and that nobody has acted on since, go back to the scan's own bookkeeping so a continued scan verifies them. Returns how many. */
export function reopenUnchecked(db: DatabaseSync, scanId: number): number {
  return Number(db.prepare("UPDATE security_findings SET state = 'unverified', verification = NULL, updated_at = ? WHERE scan_id = ? AND state = 'new' AND json_extract(verification, '$.result') = ?").run(now(), scanId, UNCHECKED_RESULT).changes);
}

/** Ends an active scan; a scan that already ended keeps its state. Leftover unverified findings become listed findings that say so. */
export function finishScan(db: DatabaseSync, id: number, state: ScanState, error: string | null = null): void {
  db.prepare(`UPDATE security_scans SET state = ?, ended_at = ?, error = ? WHERE id = ? AND state IN (${ACTIVE_STATES.map((s) => `'${s}'`).join(", ")})`).run(state, now(), error, id);
  const unchecked = JSON.stringify({ kind: "reasoning", result: UNCHECKED_RESULT, notes: "", score: null, proposedTest: null } satisfies FindingVerification);
  db.prepare("UPDATE security_findings SET state = 'new', verification = ?, updated_at = ? WHERE scan_id = ? AND state = 'unverified'").run(unchecked, now(), id);
}

const parse = <T>(s: string | null, fallback: T): T => {
  try { return s ? JSON.parse(s) as T : fallback; } catch { return fallback; }
};

export type FindingRow = {
  repo: string; number: number; scan_id: number; area: string; title: string; severity: FindingSeverity; urgent: number; state: FindingState; refs: string;
  reach: string; impact: string; verification: string | null; fix_commit: string | null; fix_pr: number | null; ghsa_id: string | null; fork: string | null; fix_patch: string | null; fix_title: string | null; fix_summary: string | null; fix_branch: string | null; fix_files: string | null; fix_ref: string | null; note: string | null; env_wait_at: string | null; reason: string | null; decided_by: string | null; created_at: string; updated_at: string; fix_attempts: number; last_failure: string | null; serving_metadata?: string | null; fix_serving_metadata?: string | null;
};

export const findingKey = (repo: string, n: number): string => `${repo}:finding:${n}`;

const summary = (r: FindingRow): FindingSummary => ({
  repo: r.repo, number: r.number, key: findingKey(r.repo, r.number), scanId: r.scan_id, title: r.title, severity: r.severity, urgent: r.urgent === 1, area: r.area,
  state: r.state, createdAt: r.created_at, updatedAt: r.updated_at,
});

/** The finding's scan test, or null when it has none. */
export function scanTestOf(db: DatabaseSync, repo: string, n: number): FindingScanTest | null {
  const r = db.prepare("SELECT state, detail, test_path, test_source FROM security_scan_tests WHERE repo = ? AND number = ?").get(repo, n) as { state: ScanTestState; detail: string | null; test_path: string; test_source: string } | undefined;
  return r ? { state: r.state, detail: r.detail, path: r.test_path, source: r.test_source } : null;
}

/** Adds each finding's scan-test state; findings without a scan test (every finding while the switch is off) keep no key. */
function withScanTests(db: DatabaseSync, rows: FindingSummary[]): FindingSummary[] {
  if (!rows.length) return rows;
  const states = new Map((db.prepare("SELECT repo, number, state FROM security_scan_tests").all() as { repo: string; number: number; state: ScanTestState }[]).map((t) => [`${t.repo}#${t.number}`, t.state]));
  return states.size ? rows.map((r) => (states.has(`${r.repo}#${r.number}`) ? { ...r, scanTest: states.get(`${r.repo}#${r.number}`)! } : r)) : rows;
}

const SEVERITY_ORDER = "CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END";

/** Copies exact round receipts and removes the active rows. Filesystem changes happen only after SQL succeeds. */
function archiveRounds(db: DatabaseSync, repo: string, n: number): (string | null)[] {
  const f = db.prepare("SELECT fix_attempts, state FROM security_findings WHERE repo = ? AND number = ?").get(repo, n) as { fix_attempts: number; state: string } | undefined;
  const attempt = f?.fix_attempts ?? 0;
  const ended = new Date().toISOString();
  const rows = db.prepare("SELECT * FROM security_fix_rounds WHERE repo = ? AND number = ? ORDER BY round").all(repo, n) as { round: number; session: string | null; state: string; failure: string | null; title: string; created_at: string; serving_metadata: string | null }[];
  for (const r of rows) {
    db.prepare("INSERT OR REPLACE INTO security_fix_log (repo, number, attempt, round, state, failure, title, created_at, ended_at, serving_metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(repo, n, attempt, r.round, r.state === "building" && f?.state === "ready" ? "passed" : r.state, r.failure, r.title, r.created_at, ended, r.serving_metadata);
  }
  db.prepare("DELETE FROM security_fix_rounds WHERE repo = ? AND number = ?").run(repo, n);
  return rows.map(row => row.session);
}

/** The guarded acceptance, history copy and removal form one retryable SQL operation. */
function finishRounds(db: DatabaseSync, repo: string, n: number, accept: () => boolean): boolean {
  const outerTransaction = db.isTransaction;
  db.exec("SAVEPOINT security_fix_archive");
  let accepted = false, sessions: (string | null)[] = [];
  try {
    accepted = accept();
    if (accepted) sessions = archiveRounds(db, repo, n);
    db.exec("RELEASE security_fix_archive");
  } catch (error) {
    if (db.isTransaction) {
      try { db.exec("ROLLBACK TO security_fix_archive"); }
      finally { db.exec("RELEASE security_fix_archive"); }
    }
    throw error;
  }
  // An enclosing transaction may still roll back: leave its files intact for the session-store collector.
  if (!outerTransaction) for (const stored of sessions) dropSessions(stored);
  return accepted;
}

/** Forgets the rounds of a finding's fix atomically, retaining exact history and disposing sessions after commit. */
export function clearRounds(db: DatabaseSync, repo: string, n: number): void {
  finishRounds(db, repo, n, () => true);
}

/**
 * A finding that is `fixing`, or `landing` without a pull request, while no step job of it is queued or running (the job was
 * killed or cancelled) goes back to where an operator can act again. A fixing finding with a round in the build, or one
 * waiting for a confidential build environment, has no job on purpose: advanceSecurityFixes queues one when the round's
 * tasks end or the environment is ready.
 */
export function reconcileFindings(db: DatabaseSync, repo: string): void {
  const grace = new Date(Date.now() - 60_000).toISOString();
  const rows = db.prepare(`SELECT number, state FROM security_findings WHERE repo = ? AND updated_at < ? AND (state = 'fixing' OR (state = 'landing' AND fix_pr IS NULL))
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.step IN ('security-fix', 'security-land', 'security-advisory') AND j.state IN ('queued', 'running')
      AND json_extract(j.params, '$.repo') = security_findings.repo AND json_extract(j.params, '$.number') = security_findings.number)
    AND NOT EXISTS (SELECT 1 FROM security_fix_rounds r WHERE r.repo = security_findings.repo AND r.number = security_findings.number AND r.state = 'building')
    AND NOT (state = 'fixing' AND env_wait_at IS NOT NULL)`).all(repo, grace) as { number: number; state: FindingState }[];
  for (const r of rows) {
    const note = "The job ended before it finished. Try again.";
    // The rounds a dead fix job left are logged under the attempt that made them, before the next Fix counts a new one.
    if (r.state === "fixing") clearRounds(db, repo, r.number);
    advance(db, repo, r.number, [r.state], r.state === "fixing" ? "new" : "ready", r.state === "fixing" ? { note, last_failure: note } : { note });
  }
}

export function overview(db: DatabaseSync, repo: string): SecurityOverview {
  reconcileScans(db, repo);
  reconcileFindings(db, repo);
  const scans = (db.prepare("SELECT * FROM security_scans WHERE repo = ? ORDER BY id DESC LIMIT 20").all(repo) as ScanRow[]).map((r) => toScan(db, r));
  const findings = (db.prepare(`SELECT * FROM security_findings WHERE repo = ? AND state NOT IN (${HIDDEN}) ORDER BY ${SEVERITY_ORDER}, number LIMIT 500`).all(repo) as FindingRow[]).map(summary);
  return { scans, findings: withScanTests(db, findings), budgetMode: modelPolicy(db).provider === "codex" ? "tokens" : "usd" };
}

export const findingRow = (db: DatabaseSync, repo: string, n: number): FindingRow | undefined =>
  db.prepare(`SELECT * FROM security_findings WHERE repo = ? AND number = ? AND state NOT IN (${HIDDEN})`).get(repo, n) as FindingRow | undefined;

export function toFinding(db: DatabaseSync, r: FindingRow): FindingView {
  const area = db.prepare("SELECT idx FROM security_areas WHERE scan_id = ? AND name = ?").get(r.scan_id, r.area) as { idx: number } | undefined;
  const calls = db.prepare(`SELECT kind, started_at, ended_at, ok, cost_usd FROM security_calls
    WHERE scan_id = ? AND (kind = 'model' OR (kind = 'area' AND area_idx = ?) OR (kind IN ('verify', 'test', 'fix', 'review') AND finding_number = ?)) ORDER BY id`).all(r.scan_id, area?.idx ?? -1, r.number) as
    { kind: FindingCall["kind"]; started_at: string; ended_at: string | null; ok: number; cost_usd: number | null }[];
  const repeats = db.prepare("SELECT created_at FROM security_findings WHERE repo = ? AND duplicate_of = ? ORDER BY created_at").all(r.repo, r.number) as { created_at: string }[];
  const timeline: FindingCall[] = [
    ...calls.map((c) => ({ kind: c.kind, at: c.started_at, endedAt: c.ended_at, ok: c.ok === 1, costUsd: c.cost_usd })),
    ...repeats.map((d): FindingCall => ({ kind: "duplicate", at: d.created_at, endedAt: null, ok: true, costUsd: null })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return {
    ...summary(r), scanTestResult: scanTestOf(db, r.repo, r.number), refs: parse<FindingRef[]>(r.refs, []), reach: r.reach, impact: r.impact, verification: parse<FindingVerification | null>(r.verification, null),
    fixDiff: r.fix_patch, fixPr: r.fix_pr, fixPrUrl: r.fix_pr === null ? null : `https://github.com/${r.fork ?? slugOf(r.repo)}/pull/${r.fix_pr}`,
    ghsaId: r.ghsa_id, advisoryUrl: r.ghsa_id ? `https://github.com/${slugOf(r.repo)}/security/advisories/${r.ghsa_id}` : null, note: r.note,
    reason: r.reason, decidedBy: r.decided_by,
    timeline,
  };
}

/** The states a finding moves to by each operator action, and from which states. */
export const TRANSITIONS: Record<"dismiss" | "backlog" | "reopen", { from: FindingState[]; to: FindingState }> = {
  dismiss: { from: ["new", "backlog", "ready", "awaiting-admin"], to: "dismissed" },
  backlog: { from: ["new", "dismissed"], to: "backlog" },
  reopen: { from: ["dismissed", "backlog"], to: "new" },
};

export function moveFinding(db: DatabaseSync, repo: string, n: number, action: keyof typeof TRANSITIONS, by: string, reason: string | null): FindingState | null {
  const t = TRANSITIONS[action];
  const marks = t.from.map(() => "?").join(", ");
  const r = db.prepare(`UPDATE security_findings SET state = ?, reason = ?, decided_by = ?, updated_at = ? WHERE repo = ? AND number = ? AND state IN (${marks})`)
    .run(t.to, action === "dismiss" ? reason : null, by, now(), repo, n, ...t.from);
  return r.changes ? t.to : null;
}

/**
 * Moves a finding from one of the states `from` to `to` and sets more columns in the same statement. Returns false when the
 * finding is in none of them, so two requests cannot both start the same step.
 */
export function advance(db: DatabaseSync, repo: string, n: number, from: FindingState[], to: FindingState, set: Record<string, string | number | null> = {}, by?: string): boolean {
  const cols = Object.keys(set);
  const marks = from.map(() => "?").join(", ");
  const r = db.prepare(`UPDATE security_findings SET state = ?, updated_at = ?${by ? ", decided_by = ?" : ""}${cols.map((c) => `, ${c} = ?`).join("")} WHERE repo = ? AND number = ? AND state IN (${marks})`)
    .run(to, now(), ...(by ? [by] : []), ...cols.map((c) => set[c]!), repo, n, ...from);
  return r.changes > 0;
}

/** The accepted patch receipt and commit move together before any round is cleared.
 * A concurrent state change keeps the unaccepted rounds and their exact patch receipts intact. */
export function acceptFix(db: DatabaseSync, repo: string, n: number, fields: Record<string, string | number | null>): boolean {
  return finishRounds(db, repo, n, () => advance(db, repo, n, ["fixing"], "ready", fields));
}

/** The finding's row whatever its state, for the steps that work on it. */
export const rawFinding = (db: DatabaseSync, repo: string, n: number): FindingRow | undefined =>
  db.prepare("SELECT * FROM security_findings WHERE repo = ? AND number = ?").get(repo, n) as FindingRow | undefined;

/** Records one model call of a finding's fix in its timeline and returns nothing; the cost may be unknown. */
export function recordFixCall(db: DatabaseSync, scanId: number, n: number, kind: "fix" | "review", startedAt: string, ok: boolean, costUsd: number | null, resumed = false): void {
  db.prepare("INSERT INTO security_calls (scan_id, kind, finding_number, started_at, ended_at, ok, cost_usd, resumed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(scanId, kind, n, startedAt, now(), ok ? 1 : 0, costUsd, resumed ? 1 : 0);
}

/** Scans of one repo or, with none given, of the repos in `repos`, newest first. */
export function listScans(db: DatabaseSync, repos: string[], repo?: string): ScanView[] {
  const want = repo ? repos.filter((r) => r === repo) : repos;
  if (!want.length) return [];
  reconcileScans(db, repo);
  const rows = db.prepare(`SELECT * FROM security_scans WHERE repo IN (${want.map(() => "?").join(", ")}) ORDER BY id DESC LIMIT 200`).all(...want) as ScanRow[];
  return rows.map((r) => toScan(db, r));
}

/**
 * The scan with its threat model, calls and findings. A call keeps the agent run it recorded; a call without one (rows from before
 * the link, and a call still running) takes the first run of the scan that started within its time window.
 */
export function scanDetail(db: DatabaseSync, r: ScanRow): ScanDetail {
  reconcileScans(db, r.repo);
  r = scanRow(db, r.id)!;
  const model = parse<{ summary?: string; entryPoints?: ScanEntryPoint[] }>(r.threat_model, {});
  const callRows = db.prepare("SELECT * FROM security_calls WHERE scan_id = ? ORDER BY id").all(r.id) as
    { id: number; kind: FindingCall["kind"]; area_idx: number | null; finding_number: number | null; started_at: string; ended_at: string | null; ok: number; cost_usd: number | null; agent_run_id: number | null }[];
  const runFor = db.prepare(`SELECT ar.id, ar.state, ar.progress FROM agent_runs ar JOIN agent_run_items i ON i.run_id = ar.id
    WHERE i.repo = ? AND i.number = ? AND ar.started_at >= ? AND (? IS NULL OR ar.started_at <= ?) ORDER BY ar.id LIMIT 1`);
  const runById = db.prepare("SELECT id, state, progress FROM agent_runs WHERE id = ?");
  type Run = { id: number; state: string; progress: string | null };
  const pseudo = securityRepo(r.repo);
  const areaName = (idx: number | null): string | null => idx === null ? null : (db.prepare("SELECT name FROM security_areas WHERE scan_id = ? AND idx = ?").get(r.id, idx) as { name: string } | undefined)?.name ?? null;
  const live = ACTIVE_STATES.includes(r.state);
  const calls: ScanCall[] = callRows.map((c) => {
    const run = (c.agent_run_id !== null ? runById.get(c.agent_run_id) : runFor.get(pseudo, r.id, c.started_at, c.ended_at, c.ended_at)) as Run | undefined;
    const running = c.ended_at === null && live;
    return {
      id: c.id, kind: c.kind, areaName: areaName(c.area_idx), findingNumber: c.finding_number,
      state: running ? "running" : c.ok === 1 ? "done" : "failed", startedAt: c.started_at, endedAt: c.ended_at, costUsd: c.cost_usd,
      runId: run?.id ?? null, progress: running ? run?.progress ?? null : null,
    };
  });
  const runningAreas = new Set(callRows.filter((c) => c.kind === "area" && c.ended_at === null && live).map((c) => c.area_idx));
  const areas = (db.prepare("SELECT idx, name, paths, risk, why, state, cost_usd FROM security_areas WHERE scan_id = ? ORDER BY idx").all(r.id) as
    { idx: number; name: string; paths: string; risk: number; why: string | null; state: string; cost_usd: number }[])
    .map((a): ScanArea => ({ idx: a.idx, name: a.name, risk: a.risk, why: a.why, paths: parse<string[]>(a.paths, []), state: a.state === "done" || a.state === "failed" ? a.state : runningAreas.has(a.idx) ? "running" : "pending", costUsd: r.budget_mode === "tokens" ? null : a.cost_usd }));
  const findings = withScanTests(db, (db.prepare(`SELECT * FROM security_findings WHERE scan_id = ? AND state NOT IN (${HIDDEN}) ORDER BY ${SEVERITY_ORDER}, number`).all(r.id) as FindingRow[]).map(summary));
  return { scan: toScan(db, r), summary: model.summary ?? null, entryPoints: model.entryPoints ?? [], areas, calls, findings };
}
