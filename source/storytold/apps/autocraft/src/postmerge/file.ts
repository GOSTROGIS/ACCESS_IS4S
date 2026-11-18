// Filing: each post-merge defect with no duplicate becomes one GitHub issue, in repos approved for comments. The issue then
// goes through sync, classify and Fix like any other. The write is src/github/write.ts's `createIssue`.
//
// A row in state `filing` is written before the call. A create that succeeded on GitHub but whose answer was lost leaves
// that row behind: the issue may exist, so the finding is never filed again by this stage, and the dashboard says the
// outcome is unknown. Only a refusal from GitHub (no issue can exist) is recorded `failed` and tried again later.
import { jobItem } from "../runner/job-items.ts";
import { CLI_BY, type By } from "../core/gates.ts";
import { guardRepo, type GuardedRepo } from "../core/guard.ts";
import type { DatabaseSync } from "node:sqlite";
import { commentApprovalOf } from "../act/approval.ts";
import { audit } from "../dash/audit.ts";
import { exec, type Exec } from "../fixup/git.ts";
import { createIssue, IssueError, type Writer } from "../github/write.ts";
import { storedNote } from "../github/note.ts";
import { pipelineLogin } from "../review/discussion.ts";
import { ghFileExists, type FileChecker } from "../review/diff.ts";
import { issueBody, issueTitle, refusal } from "./template.ts";
import { pilotSqlFor } from "../pilot.ts";
import { isQuiet } from "../security/quiet.ts";
import { dedupeDefects, pendingDefects, recentFiled, reviewOf, followupsOf, type FollowupState, type PendingDefect } from "./select.ts";

export const ACTOR = "postmerge-file";
const OPERATOR = "cli";

export type FileParams = { repo: string; limit?: number; onHandled?: (n: number) => void; by?: By };
export type FileDeps = { exec: Exec; now: () => Date; fileExists: FileChecker };
export type FileSummary = {
  repo: string; candidates: number; filed: { ref: string; issue: number }[]; limited: number; failed: { ref: string; reason: string }[];
  /** Attempts whose outcome is unknown: the issue may exist on GitHub. */
  unknown: { ref: string; reason: string }[]; skipped: number; note: string | null;
};

export const defaultFileDeps = (): FileDeps => ({ exec, now: () => new Date(), fileExists: ghFileExists });

type Row = { repo: string; number: number; review_at: string; finding: number; title: string };
type Extra = { issue?: { number: number; url: string }; duplicateOf?: number | null; attempts?: number; note?: string | null };

const rowOf = (d: PendingDefect): Row => ({ repo: d.repo, number: d.number, review_at: d.review_at, finding: d.finding, title: d.f.title });

function setFollowup(db: DatabaseSync, d: Row, state: FollowupState, at: string, x: Extra = {}): void {
  db.prepare(`INSERT OR REPLACE INTO postmerge_followups (repo, number, review_at, finding, title, issue_number, url, state, at, duplicate_of, attempts, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(d.repo, d.number, d.review_at, d.finding, d.title, x.issue?.number ?? null, x.issue?.url ?? null, state, at, x.duplicateOf ?? null, x.attempts ?? 0, x.note ?? null);
}

/** Writes the `filing` row unless another process already holds or finished this finding. */
function claim(db: DatabaseSync, d: Row, at: string, attempts: number): boolean {
  db.exec("BEGIN IMMEDIATE");
  try {
    const cur = db.prepare("SELECT state FROM postmerge_followups WHERE repo = ? AND number = ? AND review_at = ? AND finding = ?").get(d.repo, d.number, d.review_at, d.finding) as { state: string } | undefined;
    if (cur?.state === "filing" || cur?.state === "filed") { db.exec("ROLLBACK"); return false; }
    setFollowup(db, d, "filing", at, { attempts });
    db.exec("COMMIT");
    return true;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch { /* nothing open */ }
    throw e;
  }
}

const oneLine = (e: unknown): string => String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 300);

type Outcome = { kind: "filed"; issue: number } | { kind: "skipped" } | { kind: "failed" | "unknown"; reason: string };

/**
 * One filing attempt: the stale-file and text checks (a skip, no write to GitHub), the `filing` row, the create, and the
 * `filed` row as its own step. `onAttempt` runs once the create is about to be, or was, tried.
 */
async function fileDefect(db: DatabaseSync, deps: FileDeps, w: Writer, g: GuardedRepo, d: PendingDefect, log: (line: string) => void, onAttempt: () => void): Promise<Outcome> {
  const { repo } = d, ref = `${repo}#${d.number}`, row = rowOf(d);
  const at = () => deps.now().toISOString();
  if (d.f.file) {
    const branch = (db.prepare("SELECT default_branch FROM repos WHERE name = ?").get(repo) as { default_branch: string | null } | undefined)?.default_branch ?? "main";
    if (await deps.fileExists(repo, branch, d.f.file) === false) {
      setFollowup(db, row, "skipped-stale", at(), { note: `${d.f.file} is not on ${branch}` });
      log(`  ${ref}: not filed: ${d.f.file} is no longer on ${branch}`);
      return { kind: "skipped" };
    }
  }
  const title = issueTitle(d.f.title);
  const body = issueBody({ number: d.number, body: d.f.body, file: d.f.file, line: d.f.line });
  const bad = refusal([d.f.title, d.f.body, title, body], pipelineLogin(db));
  if (bad) {
    setFollowup(db, row, "skipped-text", at(), { note: bad });
    log(`  ${ref}: not filed: ${bad}`);
    return { kind: "skipped" };
  }
  const attempts = d.attempts + 1;
  if (!claim(db, row, at(), attempts)) return { kind: "skipped" };
  onAttempt();
  let made: { number: number; url: string };
  try {
    made = await createIssue(w, g, deps.exec, { repo, target: ref, title, body }, storedNote({ by: "model", kind: "issue", model: d.model }, d.serving_metadata), { finding: d.finding, severity: d.f.severity });
  } catch (e) {
    const reason = oneLine(e);
    if (!(e instanceof IssueError) || !e.clear) return { kind: "unknown", reason };
    try { setFollowup(db, row, "failed", at(), { attempts, note: reason }); } catch { return { kind: "unknown", reason }; }
    return { kind: "failed", reason };
  }
  try {
    setFollowup(db, row, "filed", at(), { issue: made, attempts });
  } catch (e) {
    return { kind: "unknown", reason: `issue ${made.url} was created but not recorded: ${oneLine(e)}` };
  }
  jobItem(db, repo, d.number, `filed follow-up ${made.url}`, log);
  return { kind: "filed", issue: made.number };
}

/**
 * Files up to `limit` pending defects of the repo, oldest review first. A defect that repeats an earlier one of the same
 * run (same file, nearby line, similar title) is marked skipped-duplicate. The defects beyond the limit are marked
 * skipped-limit and are filed by a later run. Nothing is filed in a repo without comment approval. After an attempt with
 * an unknown outcome the run stops: the network or GitHub is likely failing.
 */
export async function runPostmergeFile(db: DatabaseSync, params: FileParams, log: (line: string) => void = console.log, deps: FileDeps = defaultFileDeps()): Promise<FileSummary> {
  const { repo } = params;
  const s: FileSummary = { repo, candidates: 0, filed: [], limited: 0, failed: [], unknown: [], skipped: 0, note: null };
  if (!commentApprovalOf(db, repo)) {
    s.note = `commenting in ${repo} is not approved`;
    log(`postmerge-file ${repo}: ${s.note}; nothing filed`);
    return s;
  }
  const g = guardRepo(db, repo, "comment", params.by ?? CLI_BY);
  if ("refused" in g) {
    s.note = g.refused;
    log(`postmerge-file ${repo}: ${s.note}; nothing filed`);
    return s;
  }
  const { keep, dupes } = dedupeDefects(pendingDefects(db, repo, deps.now().getTime()), recentFiled(db, repo, deps.now().getTime()));
  for (const { d, of } of dupes) {
    setFollowup(db, rowOf(d), "skipped-duplicate", deps.now().toISOString(), { duplicateOf: of });
    log(`  ${repo}#${d.number}: not filed: repeats a defect of ${repo}#${of}`);
    s.skipped++;
  }
  s.candidates = keep.length;
  const w: Writer = { db, login: ACTOR };
  let handled = 0;
  for (const d of keep) {
    const ref = `${repo}#${d.number}`;
    if (params.limit !== undefined && handled >= params.limit) {
      // A failed row keeps its state: its backoff and attempt count still apply.
      if (!d.attempts) setFollowup(db, rowOf(d), "skipped-limit", deps.now().toISOString());
      s.limited++;
      continue;
    }
    const o = await fileDefect(db, deps, w, g, d, log, () => { handled++; params.onHandled?.(handled); });
    if (o.kind === "filed") s.filed.push({ ref, issue: o.issue });
    else if (o.kind === "skipped") s.skipped++;
    else if (o.kind === "failed") { s.failed.push({ ref, reason: o.reason }); log(`  ${ref}: not filed: ${o.reason}`); }
    else {
      s.unknown.push({ ref, reason: o.reason });
      log(`  ${ref}: outcome unknown, check GitHub: ${o.reason}`);
      break;
    }
  }
  log(`postmerge-file ${repo}: ${s.filed.length} filed, ${s.limited} over the limit, ${s.failed.length} failed, ${s.unknown.length} unknown, ${s.skipped} skipped`);
  return s;
}

/**
 * Files one finding of the PR's latest review on the operator's say, whatever holds the PR's automatic filing back
 * (an earlier follow-up, a Fix PR of a follow-up). Refuses a finding that was filed or is in `filing`.
 */
export async function fileFinding(db: DatabaseSync, ref: string, index: number, log: (line: string) => void = console.log, deps: FileDeps = defaultFileDeps()): Promise<Outcome> {
  const m = /^([A-Za-z0-9._-]+)#([1-9][0-9]*)$/.exec(ref);
  if (!m) throw new Error(`not a repo#number: ${ref}`);
  const repo = m[1]!, number = Number(m[2]);
  const r = reviewOf(db, repo, number);
  if (!r || r.error) throw new Error(`${ref} has no post-merge review`);
  const f = r.findings[index];
  if (!f) throw new Error(`${ref} has no finding ${index}; its review has ${r.findings.length} (counted from 0)`);
  if (f.severity !== "defect") throw new Error(`finding ${index} of ${ref} is minor; only defects are filed`);
  if (!commentApprovalOf(db, repo)) throw new Error(`commenting in ${repo} is not approved`);
  if (isQuiet(db, repo, number)) throw new Error(`${ref} is a quiet pull request: its fix is not public yet, so no issue is filed about it`);
  if (!db.prepare(`SELECT 1 WHERE ${pilotSqlFor("?1", "CAST(?2 AS INTEGER)")}`).get(repo, number)) throw new Error(`${ref} is outside the pipeline's scope (pipeline flag or pilot)`);
  const have = followupsOf(db, repo, number).find((x) => x.review_at === r.at && x.finding === index);
  if (have?.state === "filed" || have?.state === "filing") throw new Error(`finding ${index} of ${ref} is already ${have.state === "filed" ? `filed as issue ${have.issue_number}` : "being filed with an unknown outcome; check GitHub"}`);
  audit(db, OPERATOR, "postmerge-file-one", ref, { finding: index });
  const d: PendingDefect = { repo, number, review_at: r.at, finding: index, f, model: r.model, attempts: have?.attempts ?? 0,
    ...(r.serving_metadata !== undefined && { serving_metadata: r.serving_metadata }) };
  const g = guardRepo(db, repo, "comment", CLI_BY);
  if ("refused" in g) throw new Error(g.refused);
  const o = await fileDefect(db, deps, { db, login: ACTOR }, g, d, log, () => {});
  log(o.kind === "filed" ? `${ref}: filed issue ${o.issue}` : `${ref}: finding ${index} not filed (${o.kind === "skipped" ? "see the log above" : o.reason})`);
  return o;
}
