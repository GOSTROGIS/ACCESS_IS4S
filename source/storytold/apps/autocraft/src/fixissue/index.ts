// Stage 7, Fix issues: the issue path of the pipeline. For an open bugfix issue with a clear fix, Sonnet triages
// it, then writes a unified diff (the fix and one regression test) that our code validates. Build tasks in the
// sandbox must show the test failing on main and everything passing with the fix. A passing fix is committed with
// the pipeline account's identity, pushed to its fork and opened as a PR, which then goes through Review, Verify
// and the merge queue like any other PR.
//
//   autocraft fixissue --repo R [--limit N] [--apply]
//   autocraft fixissue-collect [--apply]
//   autocraft fixissue-approval [--repo R]
//
// Without --apply it is a dry run: local tables only. No model is a tool user: replies are text our code
// validates, and nothing from an issue or a patch runs on this user (the build tasks run in the sandbox).
import { ownPrSelect } from "../github/adopt.ts";
import { CLI_BY, type By } from "../core/gates.ts";
import { guardItem, guardRepo, type GuardedItem } from "../core/guard.ts";
import type { GuardedRepo } from "../core/guard.ts";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CheckTool, applyCheck, refusal } from "../checktool/index.ts";
import type { DatabaseSync } from "node:sqlite";
import { leaseItem } from "../runner/leases.ts";
import { TERMINAL, cancelTask, getTask } from "../build/tasks.ts";
import { BuildError } from "../build/envs.ts";
import { POOL_MAX, pool, type Usage } from "../classify/run.ts";
import { queueRoom } from "../agents/call.ts";
import { runModelStep } from "../agents/step.ts";
import { textStep } from "../agents/steps.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { checkoutForCommit } from "../sandbox/index.ts";
import { audit } from "../dash/audit.ts";
import { connect } from "../db.ts";
import { Git, exec, fixupDir, type Exec } from "../fixup/git.ts";
import { whoAmI } from "../fixup/index.ts";
import { pipelineMe, setPipelineLogin } from "../github/pipeline-account.ts";
import { Client, type Querier } from "../mirror.ts";
import { commentApprovalOf } from "../act/approval.ts";
import { claimForWork, issueInfo } from "../github/claim.ts";
import { commitIdentity, ownLogins, githubIdentity, identityFor } from "../github/identity.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { diffCacheDir } from "../review/diff.ts";
import { rustPlan } from "../worker/rust.ts";
import type { TaskStep } from "../worker/types.ts";
import { createTask, warmKeyOf, type NewTask } from "../build/tasks.ts";
export { warmKeyOf };
import { cachedCrates, ghApi, ghCrates, type CratesFetcher } from "../verify/crates.ts";
import { cloneTask, queueWarmBuild } from "../verify/tasks.ts";
import { outcomeOf, summariseFailure } from "../verify/results.ts";
import { regressionPath } from "../verify/plan.ts";
import { regressionName } from "../verify/types.ts";
import { checkLine, parseCheck, recordCheck } from "../patchcheck/index.ts";
import { CHECK_PATCH_CAP, type FixIssueCheckInput } from "../patchcheck/types.ts";
import { fixIssueApprovalOf } from "./approval.ts";
import { hasOpenPr, notRustKey, textHash, type IssueCandidate } from "./candidates.ts";
import { plannedItems } from "../core/select-items.ts";
import { parseTriage, sourcePaths, validateFixPatch } from "./parse.ts";
import { buildScriptsAt, editable, type BuildScripts } from "../fixup/patch.ts";
import { branchName, claimCommentText, commentText, commitMessage, prBody, prTitle } from "./template.ts";
import { changedRsFiles, foldFormat, lintSteps, readLint } from "../prepush/index.ts";
import { ghComment, ghDeleteComment, ghFork, ghOpenPr, pushOwnBranch, type Writer } from "../github/write.ts";
import { COMMENTS_SHOWN, COMMENT_CHARS, FILE_CAP, ISSUE_BODY_LIMIT, MAX_PATHS, MAX_ROUNDS, TOTAL_CAP, type IssueText, type PatchInput, type TriageInput } from "./types.ts";
import { inPilot, pilotSqlFor } from "../pilot.ts";
import { backlogHeldSql, duplicateHeld } from "../dupes/held.ts";
import { jobItem } from "../runner/job-items.ts";
import { ownerOf, slugOf } from "../owners.ts";
import { isBotLogin } from "../review/bots.ts";

export { type IssueCandidate } from "./candidates.ts";

const ACTOR = "fixissue";
const MAX_UNCLAIM_TRIES = 3;
const TRIAGE = CLAUDE_PROMPTS["fixissue.triage"];
const PATCH = CLAUDE_PROMPTS["fixissue.patch"];
const CHECK = CLAUDE_PROMPTS["fixissue.check"];
const SHA = /^[0-9a-f]{40}$/;
const MAX_PUSH_TRIES = 3;
const REQUIRES = { os: "linux", toolchains: ["rust-stable"] } as const;

type Id = "fixissue.triage" | "fixissue.patch" | "fixissue.check";

export type FixIssueDeps = {
  /** Every git and gh command. */
  exec: Exec;
  /** The model's reply to a fixissue prompt, or null when it gave none. */
  ask: (db: DatabaseSync, id: Id, input: TriageInput | PatchInput | FixIssueCheckInput, runId: string, checkout?: string, tool?: CheckTool) => Promise<string | null>;
  /** Host directory with a read-only checkout of `sha` (reachable from `branch`) for the sandboxed model calls, or null to ask without tools. Absent: no tools. */
  checkout?: (repo: string, branch: string, sha: string) => Promise<string | null>;
  /** The head commit of the repo's default branch, or null. */
  mainHead: (repo: string, branch: string) => Promise<string | null>;
  fetchCrates: CratesFetcher;
  /** Every file path of the repo at a commit, or null. */
  fetchPaths: (repo: string, sha: string) => Promise<string[] | null>;
  now: () => Date;
  /** Directory holding one bare cache repository per repo. */
  root: string;
  /** GitHub GraphQL, for assigning issues. Absent: issues are not assigned. */
  querier?: Querier;
};

async function shaOf(path: string): Promise<string | null> {
  try {
    const s = (await ghApi(path, ".sha")).trim();
    return SHA.test(s) ? s : null;
  } catch { return null; }
}

export const ghPaths: FixIssueDeps["fetchPaths"] = async (repo, sha) => {
  try {
    return JSON.parse(await ghApi(`repos/${slugOf(repo)}/git/trees/${sha}?recursive=1`, "[.tree[] | select(.type == \"blob\") | .path]")) as string[];
  } catch { return null; }
};

export function defaultDeps(): FixIssueDeps {
  return {
    exec, now: () => new Date(), root: fixupDir(), querier: new Client(500), fetchCrates: ghCrates, fetchPaths: ghPaths,
    mainHead: (repo, branch) => shaOf(`repos/${slugOf(repo)}/commits/${encodeURIComponent(branch)}`),
    checkout: (repo, branch, sha) => checkoutForCommit(repo, branch, sha, console.log),
    ask: async (db, id, input, runId, checkout, tool) => {
      // One call: the caller reads the reply itself.
      const r = await runModelStep(db, textStep<typeof input>(id), input, { checkout, check: tool, usage: { run: runId, agent: `fixissue-${input.ref.replace(/[^A-Za-z0-9]/g, "-")}`, stage: "fixissue", items: (ok) => (ok ? 1 : 0) } });
      return r.ok ? r.value : null;
    },
  };
}

const iso = (d: FixIssueDeps): string => d.now().toISOString();
const refOf = (c: { repo: string; number: number }) => `${c.repo}#${c.number}`;
const oneLine = (s: string, max = 200) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** Source paths of a commit, cached by sha next to the diff cache. */
async function cachedPaths(repo: string, sha: string, fetch: FixIssueDeps["fetchPaths"]): Promise<string[] | null> {
  const f = join(diffCacheDir(), repo, `paths-${sha}.json`);
  if (existsSync(f)) {
    try { return JSON.parse(readFileSync(f, "utf8")) as string[]; } catch { /* fetch again */ }
  }
  const all = await fetch(repo, sha);
  if (!all) return null;
  const paths = sourcePaths(all, MAX_PATHS);
  mkdirSync(join(diffCacheDir(), repo), { recursive: true });
  writeFileSync(`${f}.tmp`, JSON.stringify(paths));
  renameSync(`${f}.tmp`, f);
  return paths;
}

// ---- rows ----------------------------------------------------------------------

export type AttemptRow = {
  repo: string; number: number; main_sha: string; text_hash: string; state: string; round: number;
  files: string | null; crate: string | null; crate_dir: string | null; patch: string | null; test_patch: string | null;
  head_task_id: number | null; base_task_id: number | null; retries: number; push_tries: number;
  summary: string | null; pr_url: string | null; reason: string | null; size: string | null; format_diff?: string | null; created_at: string; updated_at: string;
};

const byUpdated = (a: AttemptRow, b: AttemptRow): number => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : 0);

/** An issue the Plans send to a first triage. */
function candidateOf(db: DatabaseSync, repo: string, number: number, score: number | null): IssueCandidate {
  const r = db.prepare("SELECT title, body FROM items WHERE repo = ? AND number = ?").get(repo, number) as { title: string | null; body: string | null };
  return { repo, number, title: r.title ?? "", body: r.body ?? "", hash: textHash(r.title ?? "", r.body ?? ""), score };
}

export const attemptOf = (db: DatabaseSync, repo: string, number: number): AttemptRow | null =>
  (db.prepare("SELECT * FROM fix_attempts WHERE repo = ? AND number = ?").get(repo, number) as AttemptRow | undefined) ?? null;

/** Whether the issue's attempt is still as selected: another job may have changed it before this one took the lease. */
/** A log that names the item on every line, so lines of items running side by side stay readable. */
const logFor = (log: (line: string) => void, ref: string): ((line: string) => void) => {
  const named = new RegExp(`${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`);
  return (line) => log(named.test(line) ? line : `  ${ref}: ${line.trim()}`);
};

/** Notes the first stop in a run once, however many items see it. */
function stopNote(stopping: (() => boolean) | undefined, log: (line: string) => void, text: string): () => boolean {
  let said = false;
  return () => {
    if (!stopping?.()) return false;
    if (!said) log(text);
    said = true;
    return true;
  };
}

function unchanged(db: DatabaseSync, repo: string, number: number, before: string | null, log: (line: string) => void): boolean {
  if ((attemptOf(db, repo, number)?.updated_at ?? null) === before) return true;
  log(`  ${repo}#${number}: skipped: the attempt changed since it was selected`);
  return false;
}

function update(db: DatabaseSync, d: FixIssueDeps, r: { repo: string; number: number }, set: Record<string, string | number | null>): void {
  const keys = Object.keys(set);
  db.prepare(`UPDATE fix_attempts SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE repo = ? AND number = ?`)
    .run(...keys.map((k) => set[k]!), iso(d), r.repo, r.number);
}

function stage(db: DatabaseSync, d: FixIssueDeps, r: { repo: string; number: number }, kind: "hold" | "take", note: string): void {
  db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, ?, ?, ?, ?)").run(r.repo, r.number, kind, iso(d), ACTOR, note.slice(0, 300));
  jobItem(db, r.repo, r.number, note, () => {});   // the callers log the outcome themselves
}

function fail(db: DatabaseSync, d: FixIssueDeps, r: AttemptRow, reason: string): void {
  update(db, d, r, { state: "failed", reason: oneLine(reason) });
  stage(db, d, r, "hold", `fix failed: ${oneLine(reason)}`);
}

/** A round that did not work out: another round, or `failed` after the last. */
function roundFailed(db: DatabaseSync, d: FixIssueDeps, r: AttemptRow, round: number, reason: string, patch: string | null, log: (l: string) => void, max = 200): void {
  const why = oneLine(reason, max);
  log(`  ${refOf(r)}: round ${round} failed: ${why}`);
  if (round >= MAX_ROUNDS) {
    update(db, d, r, { round, patch, summary: why });
    fail(db, d, { ...r, round }, `${MAX_ROUNDS} rounds without a passing fix; last: ${why}`);
  } else update(db, d, r, { state: "retry", round, patch, summary: why, head_task_id: null, base_task_id: null, retries: 0 });
}

function issueText(db: DatabaseSync, c: { repo: string; number: number; title: string; body: string }): IssueText {
  // The mirror stores bot logins without `[bot]`, so bots are recognised by name and our own logins are dropped explicitly.
  const own = ownLogins(db, c.repo);
  const comments = (db.prepare("SELECT author, body FROM comments WHERE repo = ? AND number = ? AND COALESCE(kind, 'comment') = 'comment' ORDER BY created_at LIMIT 40").all(c.repo, c.number) as { author: string | null; body: string | null }[])
    .filter((x) => x.author && !own.has(x.author) && !isBotLogin(x.author)).slice(0, COMMENTS_SHOWN)
    .map((x) => ({ author: x.author!, body: (x.body ?? "").slice(0, COMMENT_CHARS) }));
  return { ref: refOf(c), title: c.title.slice(0, 300), body: c.body.slice(0, ISSUE_BODY_LIMIT), comments };
}

// ---- sandbox tasks -------------------------------------------------------------

const regressionStep = (crate: string, test: string): TaskStep =>
  ({ name: "regression", cmd: ["cargo", "test", "--offline", "--locked", "-p", crate, "--test", test], network: "none", timeoutSec: 3600 });

/** A warm-build key the task store accepts: ^[a-z0-9][a-z0-9-]{0,63}$. */

/** Head: main plus the full patch, the crate's tests and the regression test. Base: main plus the test file, expected to fail. */
export function tasksFor(r: { repo: string; number: number | null; main_sha: string; crate: string; test: string }, patch: string, testPatch: string, step = "fixissue"): NewTask[] {
  const common = { step, repo: r.repo, number: r.number, headSha: r.main_sha, baseSha: r.main_sha, requires: { ...REQUIRES, toolchains: [...REQUIRES.toolchains] }, warm: { key: warmKeyOf(r.repo), role: "use" as const } };
  const steps = rustPlan({ cargoArgs: ["-p", r.crate] });
  // The head task also formats and lints the files the patch changes; the base task only has to fail the regression test.
  const lint = lintSteps(changedRsFiles(patch));
  const baseSteps = steps.map((s): TaskStep => (s.name === "test" ? { ...s, cmd: [...s.cmd, "--test", r.test] } : s));
  return [{ ...common, plan: [...steps, regressionStep(r.crate, r.test), ...lint], patch }, { ...common, plan: baseSteps, patch: testPatch }];
}

// ---- running: triage and patch rounds -------------------------------------------

export type FixIssueParams = { repo: string; limit?: number; dryRun?: boolean; onHandled?: (n: number) => void; /** True when no new item should start (cancel, deadline, pipeline off). */ stopping?: () => boolean; by?: By };
export type FixIssueSummary = { runId: string; repo: string; dryRun: boolean; started: string[]; queued: string[]; skipped: string[]; failed: string[] };

export const branchOf = (db: DatabaseSync, repo: string): string =>
  (db.prepare("SELECT default_branch FROM repos WHERE name = ?").get(repo) as { default_branch: string | null } | undefined)?.default_branch ?? "main";

type Ctx = { db: DatabaseSync; d: FixIssueDeps; git: Git; log: (l: string) => void; runId: string; usage: Usage; /** Who asked; default: an operator at the command line. */ by?: By };

/** Asks with a checkout of the base commit when there is one; the input then carries the repository path. */
const checkoutOf = async (x: Ctx, base: { repo: string; sha: string }): Promise<string | undefined> => (await x.d.checkout?.(base.repo, branchOf(x.db, base.repo), base.sha)) ?? undefined;
async function ask(x: Ctx, id: Id, input: TriageInput | PatchInput | FixIssueCheckInput, base: { repo: string; sha: string }, number?: number, have?: string, validate?: (patch: string) => string | null): Promise<string | null> {
  const checkout = have ?? await checkoutOf(x, base);
  const tool = id === "fixissue.patch" ? new CheckTool({ db: x.db, step: "fixissue", repo: base.repo, number: number ?? null, head: base.sha, base: base.sha, applies: applyCheck(x.git, x.d.root, base.sha, validate) }) : undefined;
  return x.d.ask(x.db, id, checkout ? { ...input, repo_dir: REPO_PATH } : input, x.runId, checkout, tool);
}

/** The build scripts of `sha` from its manifests; null (every build.rs refused) when the commit cannot be fetched or read. */
async function scriptsAt(x: Ctx, repo: string, branch: string, sha: string): Promise<BuildScripts> {
  try {
    if (!(await x.git.fetchBranch(ownerOf(repo), repo, branch, sha))) return null;
  } catch { return null; }
  return buildScriptsAt(x.git, sha);
}

/** Triage of a new candidate, then its first patch round. */
async function startAttempt(x: Ctx, c: IssueCandidate): Promise<"started" | "skipped" | "none"> {
  const { db, d, log } = x;
  const ref = refOf(c);
  const branch = branchOf(db, c.repo);
  const main = await d.mainHead(c.repo, branch);
  if (!main) { log(`  ${ref}: no head for ${branch}`); return "none"; }
  const cr = await cachedCrates(c.repo, main, d.fetchCrates);
  if (!cr.ok) { log(`  ${ref}: no crate list: ${cr.error}`); return "none"; }
  if (!cr.rust) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(notRustKey(c.repo), main);
    log(`  ${c.repo}: not a Rust workspace`);
    return "none";
  }
  const listed = await cachedPaths(c.repo, main, d.fetchPaths);
  if (!listed) { log(`  ${ref}: no file list`); return "none"; }
  // Build scripts the manifests name are left out of the paths the triage is offered and refused in its reply.
  const scripts = await scriptsAt(x, c.repo, branch, main);
  const paths = sourcePaths(listed, MAX_PATHS, scripts);
  const input: TriageInput = { ...issueText(db, c), crates: cr.crates, paths };
  let parsed: ReturnType<typeof parseTriage> | null = null;
  for (let attempt = 0; attempt < TRIAGE.limits.attempts && !(parsed && parsed.ok); attempt++) {
    const reply = await ask(x, "fixissue.triage", input, { repo: c.repo, sha: main });
    if (reply !== null) parsed = parseTriage(reply, ref, cr.crates, paths, scripts);
  }
  const at = iso(d);
  const row = (state: string, reason: string, extra: Partial<AttemptRow> = {}): AttemptRow => {
    db.prepare(`INSERT OR REPLACE INTO fix_attempts (repo, number, main_sha, text_hash, state, round, files, crate, crate_dir, reason, size, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`).run(c.repo, c.number, main, c.hash, state, extra.files ?? null, extra.crate ?? null, extra.crate_dir ?? null, reason, extra.size ?? null, at, at);
    return attemptOf(db, c.repo, c.number)!;
  };
  if (!parsed) { log(`  ${ref}: no answer from the triage`); return "none"; }
  if (!parsed.ok || !parsed.triage.fixable) {
    const reason = parsed.ok ? parsed.triage.reason : `triage gave no valid answer: ${parsed.error}`;
    row("skipped", reason);
    stage(db, d, c, "hold", `not a clear fix: ${oneLine(reason)}`);
    log(`  ${ref}: skipped: ${reason}`);
    return "skipped";
  }
  const t = parsed.triage;
  const r = row("retry", t.reason, { files: JSON.stringify(t.files), crate: t.crate.name, crate_dir: t.crate.dir, size: t.size });
  await assignIssue(x, c);
  await patchRound(x, r);
  return "started";
}

/** The fix is going ahead (triage said fixable): the pipeline's account is assigned to the issue when nobody is. */
async function assignIssue(x: Ctx, c: IssueCandidate): Promise<void> {
  const { db, d, log } = x;
  if (!d.querier) return;
  if (duplicateHeld(db, c.repo, c.number)) { log(`  ${refOf(c)}: not assigned: held`); return; }
  const g = guardRepo(db, c.repo, "fix-issue", x.by ?? CLI_BY);
  if ("refused" in g) { log(`  ${refOf(c)}: not assigned: ${g.refused}`); return; }
  await claimForWork({ db, login: ACTOR }, g, d.querier, c.repo, c.number, "issue", () => pipelineMe(log, d.exec), { run: x.runId }, log);
}

/**
 * Posts the one claim comment (when commenting is approved), once per issue, as the fix starts, while the issue is nobody's or
 * ours. A failure here never stops the fix.
 */
async function claimIssue(x: Ctx, c: IssueCandidate): Promise<void> {
  const { db, d, log } = x;
  const q = d.querier;
  if (!q) return;
  const ref = refOf(c);
  try {
    const info = await issueInfo(q, ownerOf(c.repo), c.repo, c.number);
    if (!info || info.state !== "OPEN") return;
    const me = await pipelineMe(log, d.exec);
    if (!me) return;
    const w: Writer = { db, login: ACTOR };
    if (attemptOf(db, c.repo, c.number)?.state === "failed") return;
    // A duplicate or Backlog hold that arrived while the attempt ran: the claim would announce a fix for an issue about to be closed or held.
    if (duplicateHeld(db, c.repo, c.number)) { log(`  ${ref}: not claimed: held as a duplicate or by Backlog`); return; }
    // The attempt row exists by now, so decideItem no longer lists a new fix for the issue: the claim needs the repo's approval and the switch.
    const g = guardRepo(db, c.repo, "fix-issue", x.by ?? CLI_BY);
    if ("refused" in g) { log(`  ${ref}: not claimed: ${g.refused}`); return; }
    // Only when the issue is ours: nobody assigned, or only us.
    const assigned = info.assignees.length === 0 || info.assignees.every((a) => a === me.login);
    if (assigned && commentApprovalOf(db, c.repo) && !liveClaim(db, ref)) {
      const cm = await ghComment(w, g, d.exec, "fixissue-claim", { repo: c.repo, number: c.number, pr: false }, { by: "fixed" }, claimCommentText(), { run: x.runId });
      if (cm.code !== 0) log(`  ${ref}: claim comment failed: ${oneLine(cm.stderr)}`);
    }
  } catch (e) {
    log(`  ${ref}: could not claim: ${oneLine(String((e as Error).message ?? e))}`);
  }
}

/** The claim comment of `ref` that is still on the issue: the latest successful claim with a URL, unless a delete came after it. */
function liveClaim(db: DatabaseSync, ref: string): { url: string } | null {
  const claim = db.prepare("SELECT rowid AS id, details FROM audit WHERE action = 'fixissue-claim' AND target = ? AND COALESCE(details, '') NOT LIKE '%\"error\":%' ORDER BY rowid DESC LIMIT 1").get(ref) as { id: number; details: string | null } | undefined;
  if (!claim) return null;
  const url = (JSON.parse(claim.details ?? "{}") as { url?: string }).url;
  const later = db.prepare("SELECT details FROM audit WHERE action = 'fixissue-unclaim' AND target = ? AND rowid > ?").all(ref, claim.id) as { details: string | null }[];
  const done = later.some((r) => (r.details ?? "").includes('"state":"done"'));
  return url && !done && later.length < MAX_UNCLAIM_TRIES ? { url } : null;
}

/**
 * Deletes the claim comment of every attempt of `repo` that ended without a PR (failed or skipped): the issue no longer has a fix
 * coming. Once per claim; a failed delete is tried again on later runs, up to MAX_UNCLAIM_TRIES in all. A "take" (PR opened) keeps its claim.
 */
export async function unclaimHeld(x: Ctx, repo: string): Promise<number> {
  const { db, d, log } = x;
  const q = d.querier;
  if (!q) return 0;
  const held = db.prepare("SELECT number FROM fix_attempts WHERE repo = ? AND state IN ('failed', 'skipped') AND pr_url IS NULL").all(repo) as { number: number }[];
  let deleted = 0;
  for (const { number } of held) {
    const ref = `${repo}#${number}`;
    try {
      const claim = liveClaim(db, ref);
      const id = /#issuecomment-(\d+)$/.exec(claim?.url ?? "")?.[1];
      if (!claim || !id) continue;
      const g = guardRepo(db, repo, "fix-issue", x.by ?? CLI_BY);
      if ("refused" in g) { log(`  ${ref}: claim not removed: ${g.refused}`); continue; }
      const me = await pipelineMe(log, d.exec);
      if (!me) continue;
      const r = await ghDeleteComment({ db, login: ACTOR }, g, d.exec, "fixissue-unclaim", { repo, number, commentId: id, logins: new Set([me.login, ...ownLogins(db, repo)]) }, { run: x.runId, url: claim.url });
      if (r.code === 0) { deleted++; log(`  ${ref}: claim comment removed`); } else log(`  ${ref}: claim comment not removed: ${oneLine(r.stderr)}`);
    } catch (e) {
      log(`  ${ref}: claim comment not removed: ${oneLine(String((e as Error).message ?? e))}`);
    }
  }
  return deleted;
}

/** The next round of an attempt: patch, validate, check it applies, queue the tasks. */
async function patchRound(x: Ctx, r: AttemptRow): Promise<boolean> {
  const { db, d, git, log } = x;
  const ref = refOf(r);
  const round = r.round + 1;
  const files = JSON.parse(r.files ?? "[]") as string[];
  const testPath = regressionPath(r.crate_dir!, regressionName(r.number));
  const row = attemptOf(db, r.repo, r.number)!;
  try {
    if (!(await git.fetchBranch(ownerOf(r.repo), r.repo, branchOf(db, r.repo), r.main_sha))) { fail(db, d, row, "the base commit is no longer in the repository"); return false; }
  } catch (e) {
    log(`  ${ref}: fetch failed: ${oneLine(String((e as Error).message ?? e))}`);
    return false;
  }
  // Build scripts are the ones the crates' manifests name, not only files called build.rs; unreadable manifests leave the build.rs-only rule.
  const scripts = await buildScriptsAt(git, r.main_sha);
  if (files.some((f) => !editable(f, scripts))) { fail(db, d, row, "a file to edit is a build script"); return false; }
  // With a sandbox checkout the model reads the files itself, so they are listed by path and no size limit applies.
  const checkout = await checkoutOf(x, { repo: r.repo, sha: r.main_sha });
  const shown: PatchInput["files"] = [];
  let total = 0;
  for (const path of files) {
    const f = await git.file(r.main_sha, path);
    if (!f.ok) { fail(db, d, row, f.reason); return false; }
    if (checkout) { shown.push({ path }); continue; }
    total += f.content.length;
    if (f.content.length > FILE_CAP || total > TOTAL_CAP) { fail(db, d, row, "the files to read are over the size limit"); return false; }
    shown.push({ path, content: f.content });
  }
  const issue = db.prepare("SELECT title, body FROM items WHERE repo = ? AND number = ?").get(r.repo, r.number) as { title: string | null; body: string | null } | undefined;
  const input: PatchInput = {
    ...issueText(db, { repo: r.repo, number: r.number, title: issue?.title ?? "", body: issue?.body ?? "" }),
    crate: { name: r.crate!, dir: r.crate_dir! }, test_path: testPath, files: shown,
    ...(round > 1 && r.patch ? { previous: { patch: r.patch.slice(0, 60_000), failure: r.summary ?? "it did not pass" } } : {}),
  };
  const reply = await ask(x, "fixissue.patch", input, { repo: r.repo, sha: r.main_sha }, r.number, checkout, (p) => refusal(validateFixPatch(p, files, testPath, r.crate_dir!, regressionName(r.number), scripts)));
  if (reply === null) { roundFailed(db, d, row, round, "the model gave no answer", r.patch, log); return false; }
  const v = validateFixPatch(reply, files, testPath, r.crate_dir!, regressionName(r.number), scripts);
  if (!v.ok) { roundFailed(db, d, row, round, v.reason, reply.slice(0, 60_000), log); return false; }
  const scratch = mkdtempSync(join(d.root, ".index-"));
  let applied;
  try {
    applied = await git.applyToTree(r.main_sha, v.patch, join(scratch, "index"));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  if (!applied.ok) { roundFailed(db, d, row, round, applied.reason, v.patch, log); return false; }
  try {
    const ids = tasksFor({ repo: r.repo, number: r.number, main_sha: r.main_sha, crate: r.crate!, test: regressionName(r.number) }, v.patch, v.testPatch).map((t) => createTask(db, t));
    queueWarmBuild(db, r.repo, r.main_sha);
    update(db, d, r, { state: "testing", round, patch: v.patch, test_patch: v.testPatch, head_task_id: ids[0]!, base_task_id: ids[1]!, summary: null });
    log(`  ${ref}: round ${round}: ${v.files.join(", ")} (${v.changed} lines); tasks ${ids.join(", ")} queued`);
    return true;
  } catch (e) {
    if (!(e instanceof BuildError)) throw e;
    log(`  ${ref}: tasks not queued: ${e.message}`);
    return false;
  }
}

export async function runFixIssue(db: DatabaseSync, params: FixIssueParams, log: (line: string) => void = console.log, deps?: FixIssueDeps): Promise<FixIssueSummary> {
  const { repo } = params;
  const dryRun = params.dryRun ?? true;
  if (params.limit !== undefined && !(Number.isInteger(params.limit) && params.limit >= 0)) throw new Error("limit must be a whole number ≥ 0");
  const d = deps ?? defaultDeps();
  const runId = `fixissue-${repo}-${iso(d).replace(/[-:]/g, "").slice(0, 15)}`;
  const s: FixIssueSummary = { runId, repo, dryRun, started: [], queued: [], skipped: [], failed: [] };
  const retries = plannedItems(db, "fixissue", { repo, bucket: "retry" }).map((p) => attemptOf(db, repo, p.facts.number)!).sort(byUpdated);
  const cands = fixIssueApprovalOf(db, repo) ? plannedItems(db, "fixissue", { repo, bucket: "new" }).map((p) => candidateOf(db, p.facts.repo, p.facts.number, p.facts.score)) : [];
  const picks = params.limit === undefined ? cands : cands.slice(0, params.limit);
  log(`fixissue ${repo}: ${cands.length} candidate issues, ${retries.length} rounds due${fixIssueApprovalOf(db, repo) ? "" : " (fixing issues is not approved for this repo)"}`);
  if (dryRun) {
    for (const r of retries) log(`  would write round ${r.round + 1} for ${refOf(r)}`);
    for (const c of picks) log(`  would triage ${refOf(c)}: ${c.title.slice(0, 80)}`);
    log(`fixissue ${repo}: dry run, nothing called or written`);
    return s;
  }
  if (!fixIssueApprovalOf(db, repo)) throw new Error(`fixing issues in ${repo} is not approved`);
  mkdirSync(d.root, { recursive: true });
  const x: Ctx = { db, d, git: new Git(d.exec, d.root, repo), log, by: params.by, runId, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: null } };
  const before = new Map(picks.map((c) => [c.number, attemptOf(db, repo, c.number)?.updated_at ?? null]));
  const stopRound = stopNote(params.stopping, log, `fixissue ${repo}: stopping, no new rounds started`);
  await pool(retries.map((r) => async (): Promise<void> => {
    if (stopRound()) return;
    const ilog = logFor(log, refOf(r));
    const release = leaseItem(db, `issue:${repo}#${r.number}`, ilog);
    if (!release) return;
    try {
      if (!unchanged(db, repo, r.number, r.updated_at, ilog)) return;
      if (await patchRound({ ...x, log: ilog }, r)) s.queued.push(refOf(r));
    } catch (e) {
      ilog(`  ${refOf(r)}: ${oneLine(String((e as Error).message ?? e))}`);
    } finally { release(); }
  }), () => queueRoom(db), { max: POOL_MAX.fixissue });
  let handled = 0;
  const stopNew = stopNote(params.stopping, log, `fixissue ${repo}: stopping, no new issues started`);
  await pool(picks.map((c) => async (): Promise<void> => {
    if (stopNew()) return;
    const ilog = logFor(log, refOf(c));
    const release = leaseItem(db, `issue:${repo}#${c.number}`, ilog);
    if (!release) return;
    try {
      if (!unchanged(db, repo, c.number, before.get(c.number) ?? null, ilog)) return;
      params.onHandled?.(++handled);
      const xi: Ctx = { ...x, log: ilog };
      const o = await startAttempt(xi, c);
      if (o === "started") { s.started.push(refOf(c)); await claimIssue(xi, c); }
      else if (o === "skipped") s.skipped.push(refOf(c));
      if (attemptOf(db, c.repo, c.number)?.state === "failed") s.failed.push(refOf(c));
    } catch (e) {
      ilog(`  ${refOf(c)}: ${oneLine(String((e as Error).message ?? e))}`);
    } finally { release(); }
  }), () => queueRoom(db), { max: POOL_MAX.fixissue });
  await unclaimHeld(x, repo);
  log(`fixissue ${repo}: ${s.started.length} started, ${s.skipped.length} skipped, ${s.queued.length} rounds queued; run ${runId}`);
  return s;
}

// ---- collecting ------------------------------------------------------------------

export type CollectParams = { dryRun?: boolean; onHandled?: (n: number) => void; /** True when no new item should start (cancel, deadline, pipeline off). */ stopping?: () => boolean; by?: By };
export type CollectDeps = FixIssueDeps & {
  /** Haiku's account of a failed step. */
  summarise: (db: DatabaseSync, repo: string, number: number, taskId: number, step: string) => Promise<string>;
};
export type CollectSummary = { runId: string; looked: number; passed: number; opened: number; failedRounds: number; failed: number; retried: number; changed: number };

export function collectDefaults(): CollectDeps {
  const d = defaultDeps();
  return {
    ...d,
    summarise: async (db, repo, number, taskId, step) => summariseFailure(db, { repo, number }, taskId, { role: "head", step, exitCode: null, timedOut: false }, { model: CLAUDE_PROMPTS["verify.summary"].models[0]! }, `fixissue-collect-${Date.now()}`),
  };
}

/** The daily limit of the fixissue stage (null: none). Opened PRs count against it. */
export function perDay(db: DatabaseSync): number {
  const row = db.prepare("SELECT per_day FROM stage_limits WHERE step = 'fixissue'").get() as { per_day: number | null } | undefined;
  return row?.per_day ?? Infinity;
}

export const openedToday = (db: DatabaseSync, now: Date): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'fixissue-pr' AND COALESCE(details, '') NOT LIKE '%\"state\":\"failed\"%' AND at >= ?").get(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`) as { n: number }).n;

export async function runFixIssueCollect(db: DatabaseSync, params: CollectParams = {}, log: (line: string) => void = console.log, deps?: CollectDeps): Promise<CollectSummary> {
  const d = deps ?? collectDefaults();
  const s: CollectSummary = { runId: `fixissue-collect-${iso(d).replace(/[-:]/g, "").slice(0, 15)}`, looked: 0, passed: 0, opened: 0, failedRounds: 0, failed: 0, retried: 0, changed: 0 };
  // Attempts whose build tasks finished or whose fix passed, from the Plans; and those of issues that closed since (their tasks are cancelled below), which have no Plan.
  const rows = [
    ...plannedItems(db, "fixissue-collect").map((p) => attemptOf(db, p.facts.repo, p.facts.number)!),
    ...(db.prepare(`SELECT a.* FROM fix_attempts a JOIN items i ON i.repo = a.repo AND i.number = a.number
      WHERE a.state = 'testing' AND i.state <> 'OPEN' AND ${pilotSqlFor("a.repo", "a.number")} AND NOT ${backlogHeldSql("a")}`).all() as AttemptRow[]),
  ].sort(byUpdated).filter((r, i, all) => all.findIndex((o) => o.repo === r.repo && o.number === r.number) === i);
  s.looked = rows.length;
  if (params.dryRun) { log(`fixissue-collect: ${rows.length} pending; dry run`); return s; }
  const xOf = (repo: string): Ctx => ({ db, d, git: new Git(d.exec, d.root, repo), log, by: params.by, runId: s.runId, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: null } });

  const stopped = stopNote(params.stopping, log, "fixissue-collect: stopping, no new attempts started");
  await pool(rows.map((r) => async (): Promise<void> => {
    if (stopped()) return;
    const ref = refOf(r);
    const ilog = logFor(log, ref);
    const x = (repo: string): Ctx => ({ ...xOf(repo), log: ilog });
    const release = leaseItem(db, `issue:${r.repo}#${r.number}`, ilog);
    if (!release) return;
    try {
      if (!unchanged(db, r.repo, r.number, r.updated_at, ilog)) return;
      if (r.state === "passed") { if (await openPr(x(r.repo), r)) { s.opened++; s.changed++; } return; }
      const item = db.prepare("SELECT state FROM items WHERE repo = ? AND number = ?").get(r.repo, r.number) as { state: string } | undefined;
      const head = r.head_task_id === null ? null : getTask(db, r.head_task_id);
      const base = r.base_task_id === null ? null : getTask(db, r.base_task_id);
      if (item && item.state !== "OPEN") {
        for (const t of [head, base]) if (t && !TERMINAL.includes(t.state)) cancelTask(db, t.id, ACTOR);
        update(db, d, r, { state: "failed", reason: "the issue is closed" });
        s.failed++; s.changed++;
        return;
      }
      if (!head || !base) { fail(db, d, r, "the build task is gone"); s.failed++; s.changed++; return; }
      if (!TERMINAL.includes(head.state) || !TERMINAL.includes(base.state)) return;
      const ho = outcomeOf(head), bo = outcomeOf(base);
      // The format and clippy steps ran in the head task; their result counts once everything else passed.
      const lint = ho.kind === "pass" && bo.kind !== "error" && head.plan.some((st) => st.name === "clippy") ? readLint(db, head.id) : null;
      if (ho.kind === "error" || bo.kind === "error" || lint?.kind === "infra-failed") {
        const why = ho.kind === "error" ? ho.reason : bo.kind === "error" ? bo.reason : (lint as { reason: string }).reason;
        if (r.retries < 1) {
          update(db, d, r, { head_task_id: cloneTask(db, head.id), base_task_id: cloneTask(db, base.id), retries: r.retries + 1 });
          s.retried++; s.changed++;
          jobItem(db, r.repo, r.number, `${why}; queued the tasks again`, ilog);
        } else { fail(db, d, r, `build environment error: ${why}`); s.failed++; s.changed++; }
        return;
      }
      s.changed++;
      if (ho.kind === "fail") {
        const summary = await d.summarise(db, r.repo, r.number, head.id, ho.step);
        roundFailed(db, d, r, r.round, `head: ${summary}`, r.patch, ilog);
        s.failedRounds++;
      } else if (bo.kind === "pass") {
        roundFailed(db, d, r, r.round, "the regression test passes without the fix, so it does not show the bug", r.patch, ilog);
        s.failedRounds++;
      } else if (bo.kind === "fail" && (bo.step !== "test" || bo.timedOut)) {
        roundFailed(db, d, r, r.round, bo.timedOut ? "the regression test timed out without the fix" : `the regression test did not build without the fix (${bo.step} failed)`, r.patch, ilog);
        s.failedRounds++;
      } else if (lint?.kind === "result" && lint.findings.length) {
        roundFailed(db, d, r, r.round, `clippy findings on the lines the patch changed:\n${lint.findings.slice(0, 5).map((f) => f.rendered).join("\n")}`, r.patch, ilog, 1500);
        s.failedRounds++;
      } else if (!(await checkPatch(x(r.repo), r))) {
        s.failedRounds++;
      } else {
        update(db, d, r, { state: "passed", format_diff: lint?.kind === "result" ? lint.formatDiff : null });
        s.passed++;
        jobItem(db, r.repo, r.number, `round ${r.round} passed`, ilog);
        if (await openPr(x(r.repo), { ...r, state: "passed" })) s.opened++;
      }
      const after = attemptOf(db, r.repo, r.number);
      if (after?.state === "failed") s.failed++;
    } catch (e) {
      ilog(`  ${ref}: ${oneLine(String((e as Error).message ?? e))}`);
    } finally { release(); }
  }), () => queueRoom(db), { max: POOL_MAX.fixissueCollect });
  for (const repo of new Set(rows.map((r) => r.repo))) await unclaimHeld(xOf(repo), repo);
  log(`fixissue-collect: ${s.looked} pending: ${s.passed} passed, ${s.opened} PRs opened, ${s.failedRounds} failed rounds, ${s.failed} failed, ${s.retried} retried`);
  return s;
}

/** Opus checks the patch that passed the sandbox. True on approve; otherwise the round is failed with Opus's reasons, which the next round's prompt carries. */
async function checkPatch(x: Ctx, r: AttemptRow): Promise<boolean> {
  const { db, d, log } = x;
  const patch = r.patch ?? "";
  const failRound = (why: string): false => (roundFailed(db, d, r, r.round, why, r.patch, log, 600), false);
  if (patch.length > CHECK_PATCH_CAP) return failRound(`the patch is over the ${CHECK_PATCH_CAP} character limit for the check`);
  const issue = db.prepare("SELECT title, body FROM items WHERE repo = ? AND number = ?").get(r.repo, r.number) as { title: string | null; body: string | null } | undefined;
  const input: FixIssueCheckInput = {
    ...issueText(db, { repo: r.repo, number: r.number, title: issue?.title ?? "", body: issue?.body ?? "" }),
    triage_reason: r.reason ?? "", patch, test_path: regressionPath(r.crate_dir!, regressionName(r.number)),
  };
  const reply = await ask(x, "fixissue.check", input, { repo: r.repo, sha: r.main_sha });
  if (reply === null) return failRound("the patch check gave no answer");
  const v = parseCheck(reply);
  if (!v.ok) return failRound(`the patch check gave no valid answer: ${v.error}`);
  recordCheck(db, { kind: "fixissue", repo: r.repo, number: r.number, subject: r.main_sha, patch, round: r.round, model: CHECK.models[0]!, check: v.check, at: iso(d) });
  audit(db, ACTOR, "fixissue-check", refOf(r), { run: x.runId, round: r.round, verdict: v.check.verdict, reasons: v.check.reasons });
  if (v.check.verdict === "reject") return failRound(`Opus rejected the patch: ${checkLine(v.check)}`);
  return true;
}

/** The pipeline account's fork of the repo as owner/name, created when missing; the base repo itself for a repo on the app identity. */
export async function forkOf(w: Writer, g: GuardedRepo, run: Exec, login: string, repo: string, details: Record<string, unknown> = {}): Promise<string> {
  // The GitHub App has no account to own a fork: its autocraft/* branches live in the base repository.
  if (identityFor(g) === "app" && githubIdentity(w.db) === "app") return slugOf(repo);
  const find = async (): Promise<string | null> => {
    const r = await run("gh", ["api", `repos/${slugOf(repo)}/forks?per_page=100`, "--jq", `.[] | select(.owner.login == "${login}") | .full_name`]);
    return r.code === 0 ? r.stdout.trim().split("\n")[0] || null : null;
  };
  const same = await run("gh", ["api", `repos/${login}/${repo}`, "--jq", ".parent.full_name"]);
  if (same.code === 0 && same.stdout.trim() === `${slugOf(repo)}`) return `${login}/${repo}`;
  const known = await find();
  if (known) return known;
  const f = await ghFork(w, g, run, repo, details);
  if (f.code !== 0) throw new Error(`could not fork ${repo}: ${oneLine(f.stderr)}`);
  const made = await find();
  if (!made) throw new Error(`the fork of ${repo} is not visible yet`);
  return made;
}

/** PRs being opened by this process: they count against the daily limit before their audit row exists. */
let opening = 0;
/** Forks being looked up or created, per repo: two attempts of one repo must not both create the fork. */
const forkLocks = new Map<string, Promise<unknown>>();
function forkOnce<T>(repo: string, work: () => Promise<T>): Promise<T> {
  const run = (forkLocks.get(repo) ?? Promise.resolve()).then(work, work);
  const tail = run.catch(() => {}).finally(() => { if (forkLocks.get(repo) === tail) forkLocks.delete(repo); });
  forkLocks.set(repo, tail);
  return run;
}

const urlOk = (url: string, repo: string): boolean => new RegExp(`^https://github\\.com/${slugOf(repo)}/pull/\\d+$`).test(url);

/** The issue's state on GitHub now; null when the read fails, in which case the mirror's state stands. */
async function liveIssueState(d: FixIssueDeps, repo: string, number: number): Promise<string | null> {
  const r = await d.exec("gh", ["api", `repos/${slugOf(repo)}/issues/${number}`, "--jq", ".state"]);
  const v = r.code === 0 ? r.stdout.trim().toLowerCase() : "";
  return v === "open" ? "OPEN" : v === "closed" ? "CLOSED" : null;
}

/** True when the issue is closed on GitHub; the mirror row is brought up to date. */
async function closedLive(x: Ctx, r: AttemptRow): Promise<boolean> {
  const live = await liveIssueState(x.d, r.repo, r.number);
  if (live !== "CLOSED") return false;
  x.db.prepare("UPDATE main.items SET state = 'CLOSED' WHERE repo = ? AND number = ? AND state = 'OPEN'").run(r.repo, r.number);
  return true;
}

/** Comments on the issue at most once: the activity row is written before the post, so a failed post or a crash is not retried. */
export async function comment(x: Ctx, g: GuardedItem | GuardedRepo, r: AttemptRow, url: string): Promise<void> {
  const { db, d, log } = x;
  const ref = refOf(r);
  if (db.prepare("SELECT 1 FROM audit WHERE action = 'fixissue-comment' AND target = ?").get(ref)) return;
  if (await closedLive(x, r)) { log(`  ${ref}: not commenting, the issue is closed`); return; }
  const text = commentText(url);
  const cm = await ghComment({ db, login: ACTOR }, g, d.exec, "fixissue-comment", { repo: r.repo, number: r.number, pr: false }, { by: "model", kind: "comment", model: PATCH.models[0] }, text, { run: x.runId });
  if (cm.code !== 0) log(`  ${ref}: comment failed: ${oneLine(cm.stderr)}`);
}

/** Commits the passed patch on main, pushes it to the fork, opens the PR and comments on the issue. */
export async function openPr(x: Ctx, r: AttemptRow): Promise<boolean> {
  const { db, d, git, log } = x;
  const ref = refOf(r);
  const files = (JSON.parse(r.files ?? "[]") as string[]);
  const testPath = regressionPath(r.crate_dir!, regressionName(r.number));
  const tried = (): void => {
    if (r.push_tries + 1 >= MAX_PUSH_TRIES) fail(db, d, r, "could not open the pull request");
    else update(db, d, r, { push_tries: r.push_tries + 1 });
  };
  // Rechecked right before each GitHub write: the operator may revoke approval or the day's limit may be reached.
  const permitted = (): boolean => {
    if (!inPilot(db, r.repo, r.number) || duplicateHeld(db, r.repo, r.number)) { log(`  ${ref}: waiting: the issue is outside the pilot or held`); return false; }
    if (!fixIssueApprovalOf(db, r.repo)) { log(`  ${ref}: waiting: fixing issues is not approved for ${r.repo}`); return false; }
    if (openedToday(db, new Date()) + opening >= perDay(db)) { log(`  ${ref}: waiting: the daily limit of opened PRs is reached`); return false; }
    return true;
  };
  let reserved = false;
  const giveBack = (): void => { if (reserved) opening--; reserved = false; };
  try {
    if (!permitted()) return false;
    const issueNow = db.prepare("SELECT state, title FROM items WHERE repo = ? AND number = ?").get(r.repo, r.number) as { state: string; title: string | null } | undefined;
    if (issueNow && issueNow.state !== "OPEN") { fail(db, d, r, "the issue is closed"); return false; }
    if (await closedLive(x, r)) { fail(db, d, r, "the issue is closed"); return false; }
    const who = await whoAmI(d.exec);
    const author = await commitIdentity(db, r.repo, async () => who);
    setPipelineLogin(db, who.login);
    const branch = branchName(r.number, issueNow?.title ?? "", who.login);
    // On an app repo the branch lives in the base repository, so its head owner is the org.
    const headOwners = [who.login, ...(githubIdentity(db) === "app" ? [ownerOf(r.repo)] : [])];
    const sel = ownPrSelect(db, r.repo, headOwners, branchOf(db, r.repo));
    const found = await d.exec("gh", ["pr", "list", "--repo", `${slugOf(r.repo)}`, "--state", "open", "--head", branch, "--json", sel.json, "--jq", sel.jq]);
    const existing = found.code === 0 ? found.stdout.trim().split("\n")[0] ?? "" : "";
    if (existing && urlOk(existing, r.repo)) {
      const ag = await guardItem(db, { repo: r.repo, number: r.number }, { kind: "fixissue-collect" }, x.by ?? CLI_BY);
      if ("refused" in ag) { log(`  ${ref}: waiting: ${ag.refused}`); return false; }
      update(db, d, r, { state: "pr-opened", pr_url: existing });
      stage(db, d, r, "take", `fix PR opened: ${existing}`);
      log(`  ${ref}: adopted ${existing}`);
      await comment(x, ag, r, existing);
      return true;
    }
    if (hasOpenPr(db, r.repo, r.number)) { fail(db, d, r, "another pull request already covers the issue"); return false; }
    if (!(await git.fetchBranch(ownerOf(r.repo), r.repo, branchOf(db, r.repo), r.main_sha))) { fail(db, d, r, "the base commit is no longer in the repository"); return false; }
    const title = issueNow?.title ?? "";
    const scratch = mkdtempSync(join(d.root, ".index-"));
    let applied;
    try {
      applied = await git.applyToTree(r.main_sha, r.patch!, join(scratch, "index"));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    if (!applied.ok) { fail(db, d, r, applied.reason); return false; }
    // The formatter's changes ride in the same commit (whitespace-only is checked; the branch is our own, so Opus does not look again).
    let tree = applied.tree;
    if (r.format_diff) {
      const fold = await foldFormat(git, r.main_sha, r.patch!, r.format_diff, d.root);
      if (!fold.ok) { fail(db, d, r, `the formatter result was refused: ${fold.reason}`); return false; }
      const scratch2 = mkdtempSync(join(d.root, ".index-"));
      try {
        const again = await git.applyToTree(r.main_sha, fold.patch, join(scratch2, "index"));
        if (!again.ok) { fail(db, d, r, again.reason); return false; }
        tree = again.tree;
      } finally {
        rmSync(scratch2, { recursive: true, force: true });
      }
    }
    const commit = await git.commit(tree, r.main_sha, commitMessage(r.number, title, [...files, testPath]), { name: author.name, email: author.email });
    const changes = await git.rawChanges(r.main_sha, commit);
    const allowed = new Set([...files, testPath]);
    if (changes.some((c) => !allowed.has(c[3]!) || (c[2] === "A" ? c[1] !== "100644" : c[2] !== "M" || c[0] !== c[1]))) {
      fail(db, d, r, "the commit would change files or modes outside the validated diff");
      return false;
    }
    if (!permitted()) return false;
    opening++;   // taken before the next await; given back once the PR's audit row exists or the attempt ends
    reserved = true;
    const g = await guardItem(db, { repo: r.repo, number: r.number }, { kind: "fixissue-collect" }, x.by ?? CLI_BY);
    if ("refused" in g) { log(`  ${ref}: waiting: ${g.refused}`); return false; }
    const rg = guardRepo(db, r.repo, "fix-issue", x.by ?? CLI_BY);
    if ("refused" in rg) { log(`  ${ref}: waiting: ${rg.refused}`); return false; }
    const fork = await forkOnce(r.repo, () => forkOf({ db, login: ACTOR }, rg, d.exec, who.login, r.repo, { run: x.runId }));
    const push = await pushOwnBranch({ db, login: ACTOR }, g, git, "fixissue-push", { repo: r.repo, number: r.number, remote: fork, branch, sha: commit }, { run: x.runId, fork, base: r.main_sha });
    if (push.code !== 0) { log(`  ${ref}: push failed: ${oneLine(push.stderr)}`); tried(); return false; }
    if (await closedLive(x, r)) { fail(db, d, r, "the issue is closed"); return false; }
    const body = prBody(r.number, files, testPath);
    // The audit row is written before the command runs and counts from then on, so the reservation ends there.
    const pr = await ghOpenPr({ db, login: ACTOR }, g, (...a: Parameters<typeof d.exec>) => { giveBack(); return d.exec(...a); }, "fixissue-pr", { repo: r.repo, target: ref, base: branchOf(db, r.repo), head: `${fork.split("/")[0]}:${branch}`, title: prTitle(title), body }, { by: "model", kind: "pull request", model: PATCH.models[0] }, { run: x.runId, branch });
    giveBack();
    const url = pr.stdout.trim().split("\n").pop() ?? "";
    if (pr.code !== 0 || !urlOk(url, r.repo)) { log(`  ${ref}: PR not opened: ${oneLine(pr.stderr || pr.stdout)}`); tried(); return false; }
    update(db, d, r, { state: "pr-opened", pr_url: url });
    stage(db, d, r, "take", `fix PR opened: ${url}`);
    log(`  ${ref}: opened ${url}`);
    await comment(x, g, r, url);
    return true;
  } catch (e) {
    log(`  ${ref}: ${oneLine(String((e as Error).message ?? e))}`);
    tried();
    return false;
  } finally { giveBack(); }
}

// ---- commands --------------------------------------------------------------------

function parseArgs(args: string[]): { repo: string; limit?: number; apply: boolean } {
  let repo: string | undefined, limit: number | undefined, apply = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--repo") repo = args[++i];
    else if (a === "--limit") limit = Number(args[++i]);
    else if (a === "--apply") apply = true;
    else throw new Error(`unknown option ${a}; options: --repo R --limit N --apply`);
  }
  if (!repo) throw new Error("missing --repo");
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 0)) throw new Error("--limit is a whole number");
  return { repo, limit, apply };
}

export const commands = {
  fixissue: {
    summary: "fixissue --repo R [--limit N] [--apply]: triage open bugfix issues, write a fix and a regression test, queue the sandbox tasks (dry run unless --apply)",
    async run(args: string[]): Promise<void> {
      const f = parseArgs(args);
      await runFixIssue(connect(), { repo: f.repo, limit: f.limit, dryRun: !f.apply });
    },
  },
  "fixissue-collect": {
    summary: "fixissue-collect [--apply]: read the finished sandbox tasks of fix attempts; open the PR of a passing fix (dry run unless --apply)",
    async run(args: string[]): Promise<void> {
      if (args.some((a) => a !== "--apply")) throw new Error("options: --apply");
      await runFixIssueCollect(connect(), { dryRun: !args.includes("--apply") });
    },
  },
  "fixissue-approval": {
    summary: "fixissue-approval [--repo R]: which repos the operator approved for fix PRs from issues",
    run(args: string[]): void {
      const i = args.indexOf("--repo");
      const db = connect();
      const repos = i >= 0 ? [args[i + 1]!] : (db.prepare("SELECT name FROM tracked_repos ORDER BY name").all() as { name: string }[]).map((r) => r.name);
      for (const r of repos) {
        const a = fixIssueApprovalOf(db, r);
        console.log(`${r}\t${a ? `approved by ${a.by} at ${a.at}` : "not approved"}`);
      }
    },
  },
};
