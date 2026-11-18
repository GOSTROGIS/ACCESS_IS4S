// The security deep scan's operator actions, shared by the dashboard API and the CLI. Callers check who may act; these
// functions check the state of the scan or finding and throw a SecurityError that carries an HTTP-style status.
import type { DatabaseSync } from "node:sqlite";
import { CodexBudgetError, providerBudgetMode } from "../agents/codex/budget.ts";
import { SECURITY_BUDGET_PAUSE } from "./costs.ts";
import type { FindingAction, FindingState, FindingView, ScanView } from "../../web/src/api/types.ts";
import { featureOn } from "../build/features.ts";
import { audit } from "../dash/audit.ts";
import { TERMINAL, cancelTask, confidentialReadyAt, getTask, privateClockStart } from "../build/tasks.ts";
import { enqueue, JobError, requestCancel } from "../runner/jobs.ts";
import { securityRepo, SECURITY_STEP, REASON_MAX, MIN_VERIFY_SCORE } from "./rules.ts";
import { activeScan, ACTIVE_STATES, advance, clearRounds, finishScan, findingKey, findingRow, moveFinding, reconcileFindings, reconcileScans, reopenUnchecked, scanRow, toFinding, toScan, UNCHECKED_RESULT } from "./store.ts";

export class SecurityError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const NOT_FOUND = "not found";
/** The most a spend cap may be, in dollars. */
const CAP_MAX = 100_000;
/** Extra audit details, for example where the action came from. */
export type AuditExtra = Record<string, unknown>;
/** The actions that start a step: the states they start from, the state the finding takes at once, and the step. */
const STEPS: Partial<Record<FindingAction, { from: FindingState[]; to: FindingState | null; step: string; busy: string }>> = {
  fix: { from: ["new", "backlog"], to: "fixing", step: "security-fix", busy: "a fix" },
  land: { from: ["ready", "awaiting-admin"], to: "landing", step: "security-land", busy: "a fix that is ready or waiting for an admin" },
  advisory: { from: ["ready", "awaiting-admin"], to: "landing", step: "security-advisory", busy: "a fix that is ready or waiting for an admin" },
  publish: { from: ["landed", "advisory"], to: null, step: "security-publish", busy: "a landed fix" },
};

export async function startScanAs(db: DatabaseSync, repo: string, login: string, capUsd: unknown, extra: AuditExtra = {}): Promise<ScanView> {
  let budgetMode: "usd" | "tokens";
  try { budgetMode = providerBudgetMode(db, "Security scan"); }
  catch (error) { if (error instanceof CodexBudgetError) throw new SecurityError(400, error.message); throw error; }
  const cap = capUsd === undefined || capUsd === null ? null : capUsd;
  if (cap !== null && (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0 || cap > CAP_MAX)) throw new SecurityError(400, `capUsd must be a dollar amount above 0 and up to ${CAP_MAX}, or null for no cap`);
  if (budgetMode === "tokens" && cap !== null) throw new SecurityError(400, "Codex does not report dollar prices. Start with no dollar cap under its explicit bounded token policy.");
  reconcileScans(db, repo);
  if (activeScan(db, repo)) throw new SecurityError(409, `${repo} already has a scan running`);
  const at = new Date().toISOString();
  const id = Number(db.prepare("INSERT INTO security_scans (repo, state, cap_usd, started_by, started_at, budget_mode) VALUES (?, 'modeling', ?, ?, ?, ?)").run(repo, cap, login, at, budgetMode).lastInsertRowid);
  try {
    const job = await enqueue(db, SECURITY_STEP, { repo, scan: id }, login);
    // The job is recorded under the scan's pseudo repo, so every job listing that leaves out hidden repos leaves it out for viewers.
    db.prepare("UPDATE jobs SET repo = ? WHERE id = ?").run(securityRepo(repo), job.id);
    db.prepare("UPDATE security_scans SET job_id = ? WHERE id = ?").run(job.id, id);
  } catch (e) {
    db.prepare("DELETE FROM security_scans WHERE id = ?").run(id);
    if (e instanceof JobError) throw new SecurityError(e.status, e.message);
    throw e;
  }
  audit(db, login, "security-scan-start", `${repo}:scan:${id}`, { repo, capUsd: cap, ...extra });
  return toScan(db, scanRow(db, id)!);
}

/**
 * Continues a scan that stopped at its spend cap with a new cap (null = none) that is above what it has spent. It takes the
 * repo's one active-scan slot, keeps its pinned commit, threat model, areas and findings, and queues its job again. A
 * stopped scan is not continued: an operator ended it, and it may have no threat model.
 */
export async function continueScanAs(db: DatabaseSync, id: number, login: string, capUsd: unknown, extra: AuditExtra = {}): Promise<ScanView> {
  const scan = scanRow(db, id);
  if (!scan) throw new SecurityError(404, NOT_FOUND);
  if (scan.state !== "capped") throw new SecurityError(409, `only a scan that stopped at its cap can be continued (this one is ${scan.state})`);
  let budgetMode: "usd" | "tokens";
  try { budgetMode = providerBudgetMode(db, "Security scan"); }
  catch (error) { if (error instanceof CodexBudgetError) throw new SecurityError(400, error.message); throw error; }
  if (budgetMode !== (scan.budget_mode ?? "usd")) throw new SecurityError(400, "Continue this scan with its original budget mode, or start a new scan.");
  const cap = capUsd === undefined || capUsd === null ? null : capUsd;
  if (cap !== null && (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0 || cap > CAP_MAX)) throw new SecurityError(400, `capUsd must be a dollar amount above 0 and up to ${CAP_MAX}, or null for no cap`);
  if (budgetMode === "tokens" && cap !== null) throw new SecurityError(400, "Codex does not report dollar prices. Continue with no dollar cap under its explicit bounded token policy.");
  if (cap !== null && cap <= scan.cost_usd) throw new SecurityError(400, `the new cap must be above the $${scan.cost_usd.toFixed(2)} the scan has spent`);
  reconcileScans(db, scan.repo);
  if (activeScan(db, scan.repo)) throw new SecurityError(409, `${scan.repo} already has a scan running`);
  const state = !scan.threat_model ? "modeling" : db.prepare("SELECT 1 FROM security_findings WHERE scan_id = ? AND state = 'new' AND json_extract(verification, '$.result') = ?").get(id, UNCHECKED_RESULT) ? "verifying" : "scanning";
  const moved = db.prepare("UPDATE security_scans SET state = ?, cap_usd = ?, ended_at = NULL, error = NULL, job_id = NULL WHERE id = ? AND state = 'capped'").run(state, cap, id).changes;
  if (!moved) throw new SecurityError(409, "the scan changed; reload and try again");
  reopenUnchecked(db, id);
  try {
    const job = await enqueue(db, SECURITY_STEP, { repo: scan.repo, scan: id }, login);
    db.prepare("UPDATE jobs SET repo = ? WHERE id = ?").run(securityRepo(scan.repo), job.id);
    db.prepare("UPDATE security_scans SET job_id = ? WHERE id = ?").run(job.id, id);
  } catch (e) {
    finishScan(db, id, "capped");
    db.prepare("UPDATE security_scans SET cap_usd = ?, job_id = ? WHERE id = ?").run(scan.cap_usd, scan.job_id, id);
    if (e instanceof JobError) throw new SecurityError(e.status, e.message);
    throw e;
  }
  audit(db, login, "security-scan-continue", `${scan.repo}:scan:${id}`, { repo: scan.repo, capUsd: cap, spentUsd: budgetMode === "tokens" ? null : scan.cost_usd, budgetMode, ...extra });
  return toScan(db, scanRow(db, id)!);
}

export function stopScanAs(db: DatabaseSync, id: number, login: string, extra: AuditExtra = {}): ScanView {
  const scan = scanRow(db, id);
  if (!scan) throw new SecurityError(404, NOT_FOUND);
  if (!ACTIVE_STATES.includes(scan.state)) throw new SecurityError(409, `the scan already ended (${scan.state})`);
  // A running job sees the state or the cancel flag before its next call and ends the scan itself.
  if (scan.job_id !== null) {
    try { requestCancel(db, scan.job_id, login); } catch (e) { if (!(e instanceof JobError)) throw e; }
  }
  finishScan(db, id, "stopped");
  audit(db, login, "security-scan-stop", `${scan.repo}:scan:${id}`, { repo: scan.repo, was: scan.state, ...extra });
  return toScan(db, scanRow(db, id)!);
}

export async function actOnFindingAs(db: DatabaseSync, repo: string, n: number, login: string, b: Record<string, unknown>, extra: AuditExtra = {}): Promise<FindingView> {
  const action = b.action as FindingAction;
  const start = STEPS[action];
  if (start) return startStep(db, repo, n, login, action, start, b, extra);
  if (action !== "dismiss" && action !== "backlog" && action !== "reopen") throw new SecurityError(400, "unknown action");
  const row = findingRow(db, repo, n);
  if (!row) throw new SecurityError(404, NOT_FOUND);
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, REASON_MAX) : "";
  if (action === "dismiss" && !reason) throw new SecurityError(400, "dismissing needs a reason");
  const to = moveFinding(db, repo, n, action, login, reason || null);
  if (!to) throw new SecurityError(409, `a finding that is ${row.state} cannot be ${action === "reopen" ? "reopened" : action === "dismiss" ? "dismissed" : "moved to the backlog"}`);
  audit(db, login, `security-finding-${action}`, findingKey(repo, n), { from: row.state, to, ...(reason && { reason }), ...extra });
  return toFinding(db, findingRow(db, repo, n)!);
}

/**
 * Starts the private fix of each confirmed finding (of `repo`, or finding `n` of it) that has never had a fix job (a cancelled one does not count):
 * verify held it up, so the fix is ready when an operator opens it, and Land stays the operator's. A fix that fails
 * leaves the finding new with its note, for the operator's Fix. With the scan-tests switch on, a finding whose scan test is
 * still building, or passed on the current code, waits for a person. Returns how many fixes it queued.
 */
export async function autoFixConfirmed(db: DatabaseSync, repo?: string, n?: number): Promise<number> {
  // A fix whose job was cancelled (the pipeline was switched off) left the finding fixing; it goes back to new first.
  const repos = repo ? [repo] : (db.prepare("SELECT DISTINCT repo FROM security_findings WHERE state = 'fixing'").all() as { repo: string }[]).map((r) => r.repo);
  for (const r of repos) reconcileFindings(db, r);
  const rows = db.prepare(`SELECT repo, number FROM security_findings f WHERE state = 'new' AND json_extract(verification, '$.score') >= ?
      AND (? IS NULL OR repo = ?) AND (? IS NULL OR number = ?)
      AND NOT EXISTS (SELECT 1 FROM jobs WHERE step = 'security-fix' AND state != 'cancelled' AND json_extract(params, '$.repo') = f.repo AND json_extract(params, '$.number') = f.number)
      ${featureOn(db, "scan-tests") ? "AND NOT EXISTS (SELECT 1 FROM security_scan_tests t WHERE t.repo = f.repo AND t.number = f.number AND t.state IN ('building', 'not-shown'))" : ""}
      ORDER BY repo, number`).all(MIN_VERIFY_SCORE, repo ?? null, repo ?? null, n ?? null, n ?? null) as { repo: string; number: number }[];
  let queued = 0;
  for (const r of rows) {
    try {
      await startStep(db, r.repo, r.number, "pipeline", "fix", STEPS.fix!, {}, { auto: true });
      queued++;
    } catch (e) {
      if (!(e instanceof SecurityError)) throw e;
    }
  }
  return queued;
}

/** The longest a round's build tasks may run before the round counts as ended and its tasks are cancelled; the clock waits for a confidential environment (privateClockStart). */
export const ROUND_BUILD_LIMIT_MS = 4 * 3_600_000;

/**
 * Queues a fix job for each fixing finding whose build round has ended (its tasks are done, or it has been building past
 * ROUND_BUILD_LIMIT_MS, when the tasks are cancelled), or that waited for a confidential build environment that is now ready, and that has no fix job queued or running: the job reads the result and
 * writes the next round or the commit. The job is requested by whoever started the fix; fixes the pipeline started continue
 * only while `pipelineOn`. Returns how many jobs it queued.
 */
export async function advanceSecurityFixes(db: DatabaseSync, pipelineOn = true): Promise<number> {
  const rows = db.prepare(`SELECT f.repo, f.number, f.decided_by AS by, r.created_at, r.head_task, r.base_task FROM security_findings f
      JOIN security_fix_rounds r ON r.repo = f.repo AND r.number = f.number AND r.state = 'building'
      WHERE f.state = 'fixing'
      AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.step = 'security-fix' AND j.state IN ('queued', 'running') AND json_extract(j.params, '$.repo') = f.repo AND json_extract(j.params, '$.number') = f.number)
      ORDER BY f.repo, f.number`).all() as { repo: string; number: number; by: string | null; created_at: string | null; head_task: number | null; base_task: number | null }[];
  // A fix that waits for a confidential build environment continues once one is ready.
  if (confidentialReadyAt(db) !== null) {
    rows.push(...db.prepare(`SELECT f.repo, f.number, f.decided_by AS by, NULL AS created_at, NULL AS head_task, NULL AS base_task FROM security_findings f
      WHERE f.state = 'fixing' AND f.env_wait_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.step = 'security-fix' AND j.state IN ('queued', 'running') AND json_extract(j.params, '$.repo') = f.repo AND json_extract(j.params, '$.number') = f.number)
      ORDER BY f.repo, f.number`).all() as typeof rows);
  }
  let queued = 0;
  for (const r of rows) {
    const by = r.by ?? "pipeline";
    if (by === "pipeline" && !pipelineOn) continue;
    const open = [r.head_task, r.base_task].filter((id): id is number => { const t = id === null ? null : getTask(db, id); return !!t && !TERMINAL.includes(t.state); });
    if (open.length) {
      const since = privateClockStart(db, r.created_at!);
      if (since === null || Date.now() - since <= ROUND_BUILD_LIMIT_MS) continue;
      for (const id of open) cancelTask(db, id, "security-fix");
    }
    try {
      const job = await enqueue(db, STEPS.fix!.step, { repo: r.repo, number: r.number }, by);
      db.prepare("UPDATE jobs SET repo = ? WHERE id = ?").run(securityRepo(r.repo), job.id);
      queued++;
    } catch (e) {
      if (!(e instanceof JobError)) throw e;
    }
  }
  return queued;
}

/** Moves the finding to the state the step works in, then queues the step; the state goes back when the queue refuses. */
async function startStep(db: DatabaseSync, repo: string, n: number, login: string, action: FindingAction, s: NonNullable<(typeof STEPS)[FindingAction]>, b: Record<string, unknown>, extra: AuditExtra): Promise<FindingView> {
  const row = findingRow(db, repo, n);
  if (!row) throw new SecurityError(404, NOT_FOUND);
  if (!s.from.includes(row.state)) throw new SecurityError(409, `a finding that is ${row.state} cannot be ${action === "fix" ? "fixed" : action === "land" ? "landed" : action === "advisory" ? "sent the advisory way" : "published"}; this needs ${s.busy}`);
  if (action === "publish" && db.prepare("SELECT 1 FROM jobs WHERE step = ? AND state IN ('queued', 'running') AND json_extract(params, '$.repo') = ? AND json_extract(params, '$.number') = ?").get(s.step, repo, n)) {
    throw new SecurityError(409, "this finding is already being published");
  }
  if (action === "fix" && !row.verification) throw new SecurityError(409, "the finding has not been verified");
  if (action === "fix") {
    try { providerBudgetMode(db, "Security fix"); }
    catch (error) { if (error instanceof CodexBudgetError) throw new SecurityError(400, error.message); throw error; }
  }
  // Land after the advisory route starts over on the public fork: the advisory's private fork and its pull request are forgotten (ghsa_id stays).
  const reset: Record<string, null> = action === "land" && row.state === "awaiting-admin" ? { fork: null, fix_pr: null } : {};
  const budgetResume = action === "fix" && row.last_failure?.startsWith(SECURITY_BUDGET_PAUSE);
  if (action === "fix" && !budgetResume) clearRounds(db, repo, n);
  if (s.to && !advance(db, repo, n, s.from, s.to, { note: null, ...reset }, login)) throw new SecurityError(409, "the finding changed; reload and try again");
  if (action === "fix") db.prepare("UPDATE security_findings SET fix_attempts = fix_attempts + ?, last_failure = NULL WHERE repo = ? AND number = ?").run(budgetResume ? 0 : 1, repo, n);
  try {
    const params: Record<string, string | number> = { repo, number: n, ...(action === "publish" && { cve: b.cve === true ? 1 : 0 }) };
    const job = await enqueue(db, s.step, params, login);
    // The job is recorded under the scan's pseudo repo, like the scan's own jobs, so job listings leave it out for viewers.
    db.prepare("UPDATE jobs SET repo = ? WHERE id = ?").run(securityRepo(repo), job.id);
  } catch (e) {
    if (s.to) advance(db, repo, n, [s.to], row.state, { fork: row.fork, fix_pr: row.fix_pr });
    if (action === "fix") db.prepare("UPDATE security_findings SET fix_attempts = ?, last_failure = ? WHERE repo = ? AND number = ?").run(row.fix_attempts, row.last_failure, repo, n);
    if (e instanceof JobError) throw new SecurityError(e.status, e.message);
    throw e;
  }
  audit(db, login, `security-finding-${action}`, findingKey(repo, n), { from: row.state, ...(action === "publish" && { cve: b.cve === true }), ...extra });
  return toFinding(db, findingRow(db, repo, n)!);
}
