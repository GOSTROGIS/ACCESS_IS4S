// Approves the Actions runs that GitHub holds for approval (`action_required`) on pull requests from outside
// contributors, once the current head has a final take or take-fix review: the review read that code, and the
// runs use GitHub's runners. The checks sync records the waiting runs per PR head from the check suites in its
// query (recordRuns); a merge refused for `action_required` marks the head for a read of its runs (markReread).
// The ci-approve step approves them (approveRuns) for repos an operator approved. Set only from the dashboard
// (src/dash/api/admin.ts).
import { jobItem } from "../runner/job-items.ts";
import type { DatabaseSync } from "node:sqlite";
import { MAX_FAILURES } from "../core/rules.ts";
import { audit } from "../dash/audit.ts";
import { effectiveCi } from "../optional-checks.ts";
import { connect } from "../db.ts";
import { planned } from "../core/select.ts";
import type { PlanSet } from "../core/plan-set.ts";
import type { Exec } from "../fixup/git.ts";
import { guard } from "../core/guard.ts";
import { CLI_BY, type By } from "../core/gates.ts";
import { ghApproveRun, type Writer } from "../github/write.ts";
import { mergeHeld } from "./holds.ts";
import { trackedNames } from "../repos.ts";
import { ghExec, type Gh } from "./safe-merge.ts";
import { slugOf } from "../owners.ts";

export type CiApproval = { by: string; at: string };
const key = (repo: string) => `ci_approved:${repo}`;

export function ciApprovalOf(db: DatabaseSync, repo: string): CiApproval | null {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(key(repo)) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as CiApproval;
  } catch {
    return null;
  }
}

// Returns false when nothing changed.
export function setCiApproval(db: DatabaseSync, by: string, repo: string, approved: boolean): boolean {
  if (!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(repo)) throw new Error(`${repo} is not tracked`);
  if ((ciApprovalOf(db, repo) !== null) === approved) return false;
  if (approved) db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?)").run(key(repo), JSON.stringify({ by, at: new Date().toISOString() }));
  else db.prepare("DELETE FROM main.settings WHERE key = ?").run(key(repo));
  audit(db, by, approved ? "ci-approve" : "ci-revoke", repo);
  return true;
}

/** The stage's audit login. */
export const ACTOR = "ci-approve";
/** Approval attempts per run before the PR is left to a person. */
export { MAX_FAILURES };
/** Refusals by GitHub that repeat when asked again; other errors (network, 5xx) are retried without counting. */
const REPEATABLE = /HTTP (403|422)/;
/** How long approved runs may stay unfinished before the PR is trusted to CI's own state again. */
const APPROVED_TTL_MS = 2 * 3_600_000;

export type WaitingRun = { id: number; name: string; event: string };
/** A workflow run's check suite as the checks query returns it. */
export type Suite = { id: number; name: string; event: string; status: string; conclusion: string | null };
type Row = { head_oid: string; cross_repo: number; runs: string; approved: string; reread: number; failed: string; approved_at: string | null };

/** Records the workflow runs waiting for approval at the PR's head, from the check suites the sync read. Called with every PR the checks job stores. */
export function recordRuns(db: DatabaseSync, c: { repo: string; number: number; head_oid: string; state: string; cross_repo?: boolean; suites?: Suite[] }, at = new Date().toISOString()): void {
  if (c.state !== "OPEN") return;
  const prev = db.prepare("SELECT * FROM ci_run_approvals WHERE repo = ? AND number = ?").get(c.repo, c.number) as Row | undefined;
  const suites = c.suites ?? [];
  const same = prev?.head_oid === c.head_oid ? prev : undefined;
  const approved = (JSON.parse(same?.approved ?? "[]") as number[]);
  const byId = new Map(suites.map((x) => [x.id, x]));
  const fresh = !!same?.approved_at && Date.now() - Date.parse(same.approved_at) < APPROVED_TTL_MS;
  // An approved run is settled once its suite completed with something other than the old action_required.
  const left = approved.filter((id) => fresh && !(byId.get(id)?.status === "COMPLETED" && byId.get(id)?.conclusion !== "ACTION_REQUIRED"));
  const waiting: WaitingRun[] = suites.filter((x) => x.conclusion === "ACTION_REQUIRED" && !approved.includes(x.id)).map((x) => ({ id: x.id, name: x.name, event: x.event }));
  if (!prev && !waiting.length) return;
  // With the approval off nothing clears a mark the suites do not confirm, so the sync does.
  const reread = same?.reread && (suites.some((x) => x.conclusion === "ACTION_REQUIRED") || ciApprovalOf(db, c.repo)) ? 1 : 0;
  db.prepare(`INSERT INTO ci_run_approvals (repo, number, head_oid, cross_repo, runs, approved, reread, failed, checked_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (repo, number) DO UPDATE SET head_oid = excluded.head_oid, cross_repo = excluded.cross_repo, runs = excluded.runs, approved = excluded.approved,
      reread = excluded.reread, failed = excluded.failed, checked_at = excluded.checked_at, approved_at = excluded.approved_at`)
    .run(c.repo, c.number, c.head_oid, c.cross_repo ? 1 : 0, JSON.stringify(waiting), JSON.stringify(left), reread, same?.failed ?? "{}", at, same?.approved_at ?? null);
}

/** A merge was refused because of `action_required` runs the sync does not list: the step reads that head's runs. */
export function markReread(db: DatabaseSync, repo: string, number: number, head: string, at = new Date().toISOString()): void {
  db.prepare("DELETE FROM ci_run_approvals WHERE repo = ? AND number = ? AND head_oid <> ?").run(repo, number, head);
  db.prepare(`INSERT INTO ci_run_approvals (repo, number, head_oid, cross_repo, runs, approved, reread, failed, checked_at) VALUES (?, ?, ?, 1, '[]', '[]', 1, '{}', ?)
    ON CONFLICT (repo, number) DO UPDATE SET reread = 1, checked_at = excluded.checked_at`).run(repo, number, head, at);
}

/** `overall` as CI reads for the PR's head, with failures of the repo's optional checks left out (effectiveOverall): "pending" while runs wait for approval or the ones we approved have not finished, since the check rollup does not list them. */
export function overallAt(db: DatabaseSync, repo: string, number: number, head: string, overall: string): string {
  const eff = overall === "failure" ? effectiveCi(db, repo, overall, (db.prepare("SELECT checks FROM pr_checks WHERE repo = ? AND number = ? AND head_oid = ?").get(repo, number, head) as { checks: string } | undefined)?.checks) : overall;
  const r = db.prepare("SELECT runs, approved, reread FROM ci_run_approvals WHERE repo = ? AND number = ? AND head_oid = ?").get(repo, number, head) as { runs: string; approved: string; reread: number } | undefined;
  if (!r) return eff;
  return r.reread || JSON.parse(r.runs).length || JSON.parse(r.approved).length ? "pending" : eff;
}

export type Candidate = { number: number; head: string; runs: WaitingRun[]; reread: boolean; failed: Record<string, number>; crossRepo: boolean };

/**
 * The candidates the step has work on (approvable runs of a fork PR, or a head to read): the PRs whose Plan holds an `approve-ci` action: reviewed PRs of the repo with runs waiting at the reviewed head, and open integration
 * batch PRs with runs waiting at the batch tip (their code is the members' code, and every member is reviewed at the head it was batched at).
 * The runs are read from the recorded row at the action's head.
 */
export function needsWork(db: DatabaseSync, repo: string, run?: string | null, plans?: PlanSet): Candidate[] {
  const row = db.prepare("SELECT runs, reread, failed, cross_repo FROM ci_run_approvals WHERE repo = ? AND number = ? AND head_oid = ?");
  const out: Candidate[] = [];
  for (const { facts, action } of planned(db, "approve-ci", { repo, ...(run !== undefined ? { run } : {}), ...(plans ? { plans } : {}) })) {
    const a = row.get(repo, facts.number, action.head) as { runs: string; reread: number; failed: string; cross_repo: number } | undefined;
    if (!a) continue;
    out.push({ number: facts.number, head: action.head!, runs: JSON.parse(a.runs) as WaitingRun[], reread: !!a.reread, failed: JSON.parse(a.failed) as Record<string, number>, crossRepo: !!a.cross_repo });
  }
  return out.sort((a, b) => a.number - b.number);
}

/** Runs of a candidate the step may still try: pull_request runs with fewer than MAX_FAILURES failed attempts. */
export const approvable = (c: Candidate): WaitingRun[] => c.runs.filter((r) => r.event === "pull_request" && (c.failed[r.id] ?? 0) < MAX_FAILURES);

type RunsReply = { workflow_runs?: { id: number; name?: string | null; event?: string; head_sha?: string; head_repository?: { full_name?: string } | null; repository?: { full_name?: string } | null }[] };

/** Reads the runs waiting for approval at a head (one request); only runs of a fork's PR count. */
async function readRuns(gh: Gh, repo: string, head: string): Promise<WaitingRun[]> {
  const r = JSON.parse(await gh(["api", `repos/${slugOf(repo)}/actions/runs?head_sha=${head}&status=action_required&per_page=100`])) as RunsReply;
  return (r.workflow_runs ?? []).filter((w) => w.head_sha === head && w.head_repository?.full_name !== w.repository?.full_name)
    .map((w) => ({ id: w.id, name: w.name ?? "", event: w.event ?? "" }));
}

export type ApproveDeps = {
  /** Reads from GitHub (`gh api` arguments). */
  gh: Gh;
  /** Runs the approving write. */
  exec: Exec;
  /** Most PRs to approve runs for. */
  limit: number;
  log?: (line: string) => void;
  /** Who asked; a command-line run is an operator's. */
  by?: By;
};
export type ApproveResult = { approved: string[]; skipped: string[]; failed: string[] };

/** Approves the waiting runs of every candidate whose PR is still open, not a draft, a fork's, and at the reviewed head. */
export async function approveRuns(db: DatabaseSync, repo: string, d: ApproveDeps): Promise<ApproveResult> {
  const log = d.log ?? (() => {});
  const w: Writer = { db, login: ACTOR };
  const out: ApproveResult = { approved: [], skipped: [], failed: [] };
  const save = (c: Candidate, runs: WaitingRun[], approved: number[], failed: Record<string, number>): void => {
    const prev = db.prepare("SELECT approved FROM ci_run_approvals WHERE repo = ? AND number = ? AND head_oid = ?").get(repo, c.number, c.head) as { approved: string } | undefined;
    const all = [...new Set([...(JSON.parse(prev?.approved ?? "[]") as number[]), ...approved])];
    db.prepare("UPDATE ci_run_approvals SET runs = ?, approved = ?, reread = 0, failed = ?, approved_at = CASE WHEN ? THEN ? ELSE approved_at END WHERE repo = ? AND number = ? AND head_oid = ?")
      .run(JSON.stringify(runs), JSON.stringify(all), JSON.stringify(failed), approved.length ? 1 : 0, new Date().toISOString(), repo, c.number, c.head);
  };
  for (const c of needsWork(db, repo)) {
    if (out.approved.length + out.failed.length >= d.limit) break;
    if (!ciApprovalOf(db, repo)) throw new Error(`approving CI runs in ${repo} is not approved`);
    if (mergeHeld(db, repo, c.number)) continue;
    const ref = `${repo}#${c.number}`;
    let runs = c.runs;
    let pr: { state?: string; draft?: boolean; head?: { sha?: string; repo?: { full_name?: string } | null }; base?: { repo?: { full_name?: string } | null } };
    try {
      if (c.reread) runs = await readRuns(d.gh, repo, c.head);
      pr = JSON.parse(await d.gh(["api", `repos/${slugOf(repo)}/pulls/${c.number}`]));
    } catch (e) {
      jobItem(db, repo, c.number, `CI runs not read: ${(e as Error).message}`, log);
      out.failed.push(ref);
      continue;
    }
    const sameRepo = !pr.head?.repo || pr.head.repo.full_name === pr.base?.repo?.full_name;
    if (pr.state !== "open" || pr.draft !== false || pr.head?.sha !== c.head || sameRepo) {
      jobItem(db, repo, c.number, "CI runs skipped: closed, a draft, at another head or not from a fork", log);
      if (c.reread) save(c, c.runs, [], c.failed);
      out.skipped.push(ref);
      continue;
    }
    const todo = runs.filter((r) => r.event === "pull_request" && (c.failed[r.id] ?? 0) < MAX_FAILURES);
    const failed = { ...c.failed };
    const done: number[] = [];
    let stopped: string | null = null;
    for (const run of todo) {
      if (!ciApprovalOf(db, repo)) throw new Error(`approving CI runs in ${repo} is not approved`);
      const g = await guard(db, { repo, number: c.number }, { kind: "approve-ci", head: c.head }, d.by ?? CLI_BY);
      if ("refused" in g) { stopped = g.refused; break; }
      const r = await ghApproveRun(w, d.exec, g, run.id, { head: c.head, workflow: run.name });
      if (r.code === 0) done.push(run.id);
      else if (REPEATABLE.test(`${r.stderr} ${r.stdout}`)) failed[run.id] = (failed[run.id] ?? 0) + 1;
      else log(`${ref}: run ${run.id}: ${(r.stderr || r.stdout).trim().slice(0, 120)}; will retry`);
    }
    save(c, runs.filter((r) => !done.includes(r.id)), done, failed);
    if (stopped !== null) { jobItem(db, repo, c.number, `CI runs not approved: ${stopped}`, log); out.skipped.push(ref); continue; }
    const bad = todo.length - done.length;
    (bad ? out.failed : out.approved).push(ref);
    jobItem(db, repo, c.number, bad ? `${bad} of ${todo.length} CI runs not approved` : `approved ${todo.length} CI run${todo.length === 1 ? "" : "s"}`, log);
  }
  return out;
}

export const commands = {
  "ci-approval": {
    summary: "ci-approval [--repo R] [on|off]: whether the pipeline may approve waiting CI runs of reviewed outside PRs, per tracked repo; on or off with --repo sets it",
    run(args: string[]): void {
      const db = connect();
      const i = args.indexOf("--repo");
      const set = args.find((a) => a === "on" || a === "off");
      if (set) {
        const repo = i >= 0 ? args[i + 1] ?? "" : "";
        if (!repo) throw new Error("ci-approval --repo R on|off");
        console.log(setCiApproval(db, "cli", repo, set === "on") ? `${repo}: CI run approval ${set}` : `${repo}: CI run approval was already ${set}`);
        return;
      }
      for (const repo of i >= 0 ? [args[i + 1] ?? ""] : trackedNames(db)) {
        const a = ciApprovalOf(db, repo);
        console.log(`${repo}\t${a ? `approved by ${a.by} at ${a.at}` : "not approved"}`);
      }
    },
  },
};
