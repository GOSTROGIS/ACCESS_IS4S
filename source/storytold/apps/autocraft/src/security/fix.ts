// The private fix of a finding: a patch on the scan's pinned commit, built and tested in the worker container, reviewed by
// Opus, and kept as a local commit in the bare cache that is never pushed before Land. Nothing here writes to GitHub:
// `gh api user` and the fetch of the default branch are reads.
import { serializeServingMetadata, type ServingMetadata } from "../agents/provenance.ts";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { BuildError } from "../build/envs.ts";
import { queueRound, readRound, requeueRound, type RoundRead } from "../build/rounds.ts";
import { CONFIDENTIAL_WAIT, confidentialReadyAt } from "../build/tasks.ts";
import { CheckTool, applyCheck, refusal } from "../checktool/index.ts";
import { runModelStep } from "../agents/step.ts";
import { CodexBudgetError, providerBudgetMode } from "../agents/codex/budget.ts";
import { retainedCodexSession } from "../agents/codex/session.ts";
import { modelPolicy } from "../agents/codex/config.ts";
import { reportedRunCost, SECURITY_BUDGET_PAUSE } from "./costs.ts";
import { textStep } from "../agents/steps.ts";
import { Git, exec as realExec, fixupDir, type Exec } from "../fixup/git.ts";
import { whoAmI } from "../fixup/index.ts";
import { commitIdentity } from "../github/identity.ts";
import { branchOf } from "../fixissue/index.ts";
import { editable, validateFixPatch } from "../fixissue/parse.ts";
import { buildScriptsAt } from "../fixup/patch.ts";
import { parseCheck } from "../patchcheck/index.ts";
import { CHECK_PATCH_CAP } from "../patchcheck/types.ts";
import { foldFormat } from "../prepush/index.ts";
import { RESUME_WINDOW_MS, SessionLedger, parseSessions, storeSessions, touchStore, type Kept, type KeptSession, type SessionAsk } from "../prepush/resume.ts";
import { ownerOf } from "../owners.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { checkoutForCommit } from "../sandbox/index.ts";
import { cachedCrates, ghCrates, type CratesFetcher } from "../verify/crates.ts";
import { regressionPath } from "../verify/plan.ts";
import { regressionName, type Crate } from "../verify/types.ts";
import {
  FIX_RUN_BASE, FIX_ROUNDS, fixBranch, giveaway, parseFixReply, patchGiveaway, quietProblem, securityRepo,
  type SecurityFixCheckInput, type SecurityFixInput,
} from "./rules.ts";
import { advance, acceptFix, clearRounds, rawFinding, recordFixCall, scanRow, scanTestOf } from "./store.ts";
import { usageRunId } from "./real.ts";

const SHA = /^[0-9a-f]{40}$/;
/** Refs of the local fix commits. They live in the bare cache only and are never a push source before Land. */
export const fixRef = (repo: string, n: number): string => `refs/autocraft/security/${repo}-${n}`;
const oneLine = (s: string, max = 300): string => s.replace(/\s+/g, " ").trim().slice(0, max);
const ASK_STEPS = { fix: "security.fix", review: "security.fixcheck" } as const;

/** Test name for security finding `n` of `repo`. The test lands in a quiet PR, so it looks like any other regression test and carries no finding number. */
const securityTestName = (repo: string, n: number): string => regressionName(createHash("sha256").update(`${repo}#${n}`).digest("hex").slice(0, 10));

export type FixDeps = {
  exec: Exec;
  /** Directory of the bare cache repositories. */
  root: string;
  fetchCrates: CratesFetcher;
  /** A read-only checkout of the commit for the sandboxed model calls, or null when none can be made. */
  checkout: (repo: string, branch: string, sha: string) => Promise<string | null>;
  /**
   * One model call; `tool` is the build tool of the fix call. The reply text is null when the call gave none.
   * `session` (fix calls): with `resume` the call continues that kept session with the message, and falls back to a new call on `input` when it cannot; the reply's `kept` is the session the call ends with and `resumed` tells whether the call continued one.
   */
  ask: (id: "security.fix" | "security.fixcheck", input: SecurityFixInput | SecurityFixCheckInput, o: { checkout?: string; tool?: CheckTool; agent: string; run: string; session?: SessionAsk }) => Promise<{ text: string | null; cost: number | null; resumed?: boolean; kept?: KeptSession; serving?: ServingMetadata }>;
  who: (repo: string) => Promise<{ login: string; email: string }>;
  cancelled: () => boolean;
  log: (line: string) => void;
};

export function defaultFixDeps(db: DatabaseSync, scanId: number, io: { cancelled: () => boolean; log: (l: string) => void }): FixDeps {
  return {
    exec: realExec, root: fixupDir(), fetchCrates: ghCrates, ...io,
    checkout: (repo, branch, sha) => checkoutForCommit(repo, branch, sha, io.log),
    who: (repo) => commitIdentity(db, repo, () => whoAmI(realExec)),
    ask: async (id, input, o) => {
      let session = o.session;
      if (modelPolicy(db).provider === "codex" && !session?.resume) {
        const retained = retainedCodexSession(db, { repo: input.repo, number: input.number, promptId: id });
        if (retained) {
          session ??= {};
          session.resume = { session: retained.session, message: "Continue the retained partial work under the new bounded budget. " + JSON.stringify(input) };
        }
      }
      const resumed = session?.resume !== undefined;
      const before = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM agent_runs").get() as { n: number }).n;
      const r = await runModelStep(db, textStep<typeof input>(id), input, { checkout: o.checkout, check: o.tool, ...(session && { session }), cancelled: io.cancelled, usage: { run: o.run, agent: o.agent, stage: "security", items: (ok) => (ok ? 1 : 0) } });
      return { text: r.ok ? r.value : null, cost: reportedRunCost(db, input.repo, input.number, before, r.usage.cost), resumed, ...(r.ok && r.serving !== undefined && { serving: r.serving }), ...(session?.kept && { kept: session.kept }) };
    },
  };
}

/** The crate that owns `path`: the one with the longest directory prefix. */
export function crateOf(crates: Crate[], path: string): Crate | null {
  let best: Crate | null = null;
  for (const c of crates) {
    const inside = c.dir === "." || c.dir === "" || path === c.dir || path.startsWith(`${c.dir}/`);
    if (inside && (!best || c.dir.length > best.dir.length)) best = c;
  }
  return best;
}

/** The message that continues the fix session after a failed round: only what the harness found, since the session holds the prompt and the repository reading. */
export function resumeFixMessage(failure: string): string {
  return `The harness checked your diff and the round failed:\n\n${failure.trim()}\n\nFix it. Reply in the same format as before (TITLE line, SUMMARY line, the marker line, then the complete diff): the whole corrected diff, not a change to your earlier diff.`;
}

type RoundRow = { serving_metadata: string | null; round: number; patch: string; test_patch: string; title: string; summary: string; head_task: number; base_task: number; retried: number; session: string | null; state: string; failure: string | null; created_at: string };
const roundRows = (db: DatabaseSync, repo: string, n: number): RoundRow[] =>
  db.prepare("SELECT * FROM security_fix_rounds WHERE repo = ? AND number = ? ORDER BY round").all(repo, n) as RoundRow[];

/** Puts the finding back where an operator can decide again, with the reason on it. */
function giveUp(db: DatabaseSync, repo: string, n: number, why: string, log: (l: string) => void): string {
  clearRounds(db, repo, n);
  advance(db, repo, n, ["fixing"], "new", { note: oneLine(why, 400), last_failure: oneLine(why, 400) });
  log(`${repo} finding ${n}: no fix: ${oneLine(why, 200)}`);
  return `finding ${n}: no fix: ${oneLine(why, 120)}`;
}

/**
 * Works on the private fix of finding `n` (state `fixing`, set by the API) up to the point where it waits for a build or
 * ends: a round is a model patch and the wording checks, then build tasks in the worker. The job ends once it has queued
 * a round's tasks; the job that follows (see advanceSecurityFixes) reads the result. A failed round is repeated in the
 * same model session, a passed one gets the Opus review and the local commit, up to FIX_ROUNDS rounds. On success the
 * finding is `ready` with the commit; otherwise it returns to `new` with a note. Returns the job's summary line.
 */
export async function runFix(db: DatabaseSync, repo: string, n: number, d: FixDeps): Promise<string> {
  const row = rawFinding(db, repo, n);
  if (!row || row.state !== "fixing") return `finding ${n}: not fixing`;
  const { log } = d;
  const pause = (error: CodexBudgetError): string => {
    const note = SECURITY_BUDGET_PAUSE + error.message;
    advance(db, repo, n, ["fixing"], "new", { note: oneLine(note, 400), last_failure: oneLine(note, 400) });
    log(`${repo} finding ${n}: ${note}`);
    return `${repo} finding ${n}: ${note}`;
  };
  try { providerBudgetMode(db, "Security fix"); }
  catch (error) { if (error instanceof CodexBudgetError) return pause(error); throw error; }
  // The model's checks and the round's builds run only in a confidential build environment: without one ready, the fix
  // waits before any model call, and advanceSecurityFixes queues the next job once one is.
  if (!roundRows(db, repo, n).some((r) => r.state === "building")) {
    if (confidentialReadyAt(db) === null) {
      db.prepare("UPDATE security_findings SET env_wait_at = COALESCE(env_wait_at, ?), note = ? WHERE repo = ? AND number = ? AND state = 'fixing'").run(new Date().toISOString(), CONFIDENTIAL_WAIT, repo, n);
      log(`${repo} finding ${n}: waiting for a confidential build environment`);
      return `${repo} finding ${n}: waiting for a confidential build environment`;
    }
    if (row.env_wait_at) db.prepare("UPDATE security_findings SET env_wait_at = NULL, note = CASE WHEN note = ? THEN NULL ELSE note END WHERE repo = ? AND number = ?").run(CONFIDENTIAL_WAIT, repo, n);
  }
  // The model session of the last fix call, continued by the next round while the prompt cache is warm; its store is deleted when the job ends.
  const ledger = new SessionLedger();
  let budgetPaused = false, finalizationStorage = false;
  let inFlightSession: SessionAsk | undefined;
  try {
    const scan = scanRow(db, row.scan_id);
    const sha = scan?.commit_sha ?? "";
    if (!SHA.test(sha)) return giveUp(db, repo, n, "the scan has no pinned commit", log);
    const git = new Git(d.exec, d.root, repo);
    const branch = branchOf(db, repo);
    await git.init();
    // A job that collects a round does not need the network when the commit is cached; a failed fetch there leaves the round building for the next pass.
    const cached = (await git.git(["cat-file", "-e", `${sha}^{commit}`])).code === 0;
    if (!cached) {
      let have: boolean;
      try { have = await git.fetchBranch(ownerOf(repo), repo, branch, sha); } catch (e) {
        if (roundRows(db, repo, n).some((r) => r.state === "building")) { log(`${repo} finding ${n}: fetch failed (${oneLine((e as Error).message, 120)}); the round stays building`); return `${repo} finding ${n}: fetch failed; collected on the next pass`; }
        throw e;
      }
      if (!have) return giveUp(db, repo, n, "the pinned commit is no longer in the repository", log);
    }
    const refs = JSON.parse(row.refs) as { path: string; line: number; claim: string }[];
    const cr = await cachedCrates(repo, sha, d.fetchCrates);
    if (!cr.ok) return giveUp(db, repo, n, `no crate list: ${cr.error}`, log);
    const crate = cr.rust ? crateOf(cr.crates, refs[0]?.path ?? "") : null;
    if (!crate || !/^[A-Za-z0-9_./-]+$/.test(crate.dir) || crate.dir.split("/").includes("..")) return giveUp(db, repo, n, "the fix step covers Rust crates only, and the finding is not in one", log);
    const listed = (await git.must(["ls-tree", "-r", "--name-only", sha, "--", crate.dir === "." ? "" : crate.dir].filter((x) => x !== ""))).split("\n").filter(Boolean);
    // Build scripts are resolved from the manifests of the scanned commit, so one with a custom name is never editable.
    const scripts = await buildScriptsAt(git, sha);
    const allowed = listed.filter((p) => editable(p, scripts));
    const testName = securityTestName(repo, n);
    const testPath = regressionPath(crate.dir, testName);
    const verification = row.verification ? JSON.parse(row.verification) as { proposedTest?: string | null } : null;
    const checkout = (await d.checkout(repo, branch, sha)) ?? undefined;
    const base = { repo: securityRepo(repo), number: FIX_RUN_BASE + n, project: repo, commit: sha, ...(checkout && { repo_dir: REPO_PATH }) };
    const finding = { title: row.title, severity: row.severity, refs, reach: row.reach, impact: row.impact, area: row.area };
    const run = usageRunId(row.scan_id);
    // The scan's own test of the finding, once it has been run (feature scan-tests); no row, no key.
    const ran = scanTestOf(db, repo, n);
    const scanTest = ran && ran.state !== "building" ? { result: ran.state, path: ran.path, source: ran.source } : null;
    /** The rest of a round whose build passed: formatter changes, the fresh Opus review, the local commit. */
    const finalize = async (r: RoundRow, formatDiff: string | null): Promise<{ ok: true; summary: string } | { ok: false; why: string }> => {
      const v = validateFixPatch(r.patch, allowed, testPath, crate.dir, testName, scripts);
      if (!v.ok) return { ok: false, why: v.reason };
      const scratch = mkdtempSync(join(d.root, ".index-"));
      let applied;
      try { applied = await git.applyToTree(sha, v.patch, join(scratch, "index")); } finally { rmSync(scratch, { recursive: true, force: true }); }
      if (!applied.ok) return { ok: false, why: applied.reason };
      let patch = v.patch, tree = applied.tree;
      // The formatter's whitespace-only changes ride in the same commit.
      if (formatDiff) {
        const fold = await foldFormat(git, sha, v.patch, formatDiff, d.root);
        if (!fold.ok) return { ok: false, why: `the formatter result was refused: ${fold.reason}` };
        const scratch2 = mkdtempSync(join(d.root, ".index-"));
        try {
          const again = await git.applyToTree(sha, fold.patch, join(scratch2, "index"));
          if (!again.ok) return { ok: false, why: again.reason };
          patch = fold.patch; tree = again.tree;
        } finally { rmSync(scratch2, { recursive: true, force: true }); }
      }
      if (patch.length > CHECK_PATCH_CAP) return { ok: false, why: `the patch is over the ${CHECK_PATCH_CAP} character limit for the review` };
      const review = await reviewPatch(db, d, { ...base, finding: { title: row.title, refs, reach: row.reach, impact: row.impact }, patch, test_path: testPath }, { checkout, scanId: row.scan_id, n, run });
      if (!review.ok) return { ok: false, why: review.reason };
      const who = await d.who(repo);
      const files = [...v.files, testPath];
      const message = `${r.title}\n\n${r.summary}\n`;
      const worded = giveaway(message);
      if (worded) return { ok: false, why: `the commit message says "${worded}"; describe only what the code does now` };
      const commit = await git.commit(tree, sha, message, { name: who.login, email: who.email });
      const changes = await git.rawChanges(sha, commit);
      const okFiles = new Set(files);
      if (changes.some((c) => !okFiles.has(c[3]!) || (c[2] === "A" ? c[1] !== "100644" : c[2] !== "M" || c[0] !== c[1]))) return { ok: false, why: "the commit would change files or modes outside the validated diff" };
      // A local ref in the bare cache; nothing is pushed before Land.
      await git.must(["update-ref", fixRef(repo, n), commit]);
      // Return the exact session to the active round before its atomic archival.
      // A persistence error is retryable storage work, never a model rejection.
      finalizationStorage = true;
      ledger.stored(parseSessions(r.session));
      if (r.session) db.prepare("UPDATE security_fix_rounds SET session = ? WHERE repo = ? AND number = ? AND round = ? AND state = 'building'")
        .run(r.session, repo, n, r.round);
      const moved = acceptFix(db, repo, n, {
        fix_serving_metadata: r.serving_metadata, fix_commit: commit, fix_patch: patch, fix_title: r.title, fix_summary: r.summary, fix_branch: fixBranch(r.title, randomBytes(3).toString("hex")), fix_files: JSON.stringify(files), fix_ref: fixRef(repo, n), note: null,
      });
      finalizationStorage = false;
      return { ok: true, summary: moved ? `${repo} finding ${n}: fix ready (${files.length} files, round ${r.round})` : `finding ${n}: left fixing while the fix was written` };
    };
    let previous: SecurityFixInput["previous"];
    let kept: { session: KeptSession; at: number } | undefined;
    let startRound = 1;
    let passed: { row: RoundRow; formatDiff: string | null } | null = null;
    // A round whose build tasks were queued by an earlier job: collect it first.
    const open = roundRows(db, repo, n);
    const last = open.at(-1);
    if (last && last.state !== "building") clearRounds(db, repo, n);
    else if (last) {
      const ids: [number, number] = [last.head_task, last.base_task];
      let read: RoundRead = readRound(db, ids, last.retried === 1);
      if (read.kind === "pending") return `${repo} finding ${n}: round ${last.round} ${confidentialReadyAt(db) === null ? "is waiting for a confidential build environment" : "is still building"}`;
      if (read.kind === "retry-env") {
        try {
          const again = requeueRound(db, ids);
          db.prepare("UPDATE security_fix_rounds SET head_task = ?, base_task = ?, retried = 1 WHERE repo = ? AND number = ? AND round = ?").run(again[0], again[1], repo, n, last.round);
          log(`${repo} finding ${n}: round ${last.round}: build environment error (${read.why}); tasks queued again`);
          return `${repo} finding ${n}: round ${last.round} queued again after a build environment error`;
        } catch (e) {
          if (!(e instanceof BuildError)) throw e;
          read = { kind: "fail", reason: `build environment error: ${read.why}; the tasks were not queued again: ${e.message}` };
        }
      }
      // The round's session is taken over by this job: it continues it, or the end of the job removes it.
      const stored = parseSessions(last.session)[""];
      if (stored) { ledger.hold(stored); kept = { session: stored, at: Date.parse(stored.at) }; }
      db.prepare("UPDATE security_fix_rounds SET session = NULL WHERE repo = ? AND number = ? AND round = ?").run(repo, n, last.round);
      if (read.kind === "pass") { passed = { row: last, formatDiff: read.formatDiff }; startRound = last.round; }
      else {
        const why = read.kind === "fail" ? read.reason : "the round did not finish";
        db.prepare("UPDATE security_fix_rounds SET state = 'failed', failure = ? WHERE repo = ? AND number = ? AND round = ?").run(why, repo, n, last.round);
        previous = { patch: last.patch.slice(0, 60_000), failure: why };
        startRound = last.round + 1;
        log(`${repo} finding ${n}: round ${last.round} failed: ${oneLine(why, 160)}`);
      }
    }
    let lastWhy = previous?.failure ?? "no round ran";
    for (let round = startRound; round <= FIX_ROUNDS; round++) {
      if (d.cancelled()) return giveUp(db, repo, n, "the fix was cancelled", log);
      const failRound = (why: string, patch?: string): void => {
        lastWhy = why;
        previous = { patch: (patch ?? previous?.patch ?? "").slice(0, 60_000), failure: why };
        log(`${repo} finding ${n}: round ${round} failed: ${oneLine(why, 160)}`);
      };
      if (passed) {
        const done = passed;
        passed = null;
        const r = await finalize(done.row, done.formatDiff);
        if (r.ok) return r.summary;
        db.prepare("UPDATE security_fix_rounds SET state = 'failed', failure = ? WHERE repo = ? AND number = ? AND round = ?").run(r.why, repo, n, done.row.round);
        failRound(r.why, done.row.patch);
        continue;
      }
      const input: SecurityFixInput = { ...base, finding, crate: { name: crate.name, dir: crate.dir }, test_path: testPath, proposed_test: verification?.proposedTest ?? null, ...(scanTest && { scan_test: scanTest }), ...(previous && { previous }) };
      const tool = new CheckTool({ db, step: "fix-check", repo, number: null, recordRepo: securityRepo(repo), head: sha, base: sha, applies: applyCheck(git, d.root, sha, (p) => refusal(validateFixPatch(p, allowed, testPath, crate.dir, testName, scripts))) });
      const started = new Date().toISOString();
      // A later round continues the earlier session within the window; `input` (with `previous`) is the new call it falls back to.
      const ses: SessionAsk = kept && previous && Date.now() - kept.at <= RESUME_WINDOW_MS ? { resume: { session: kept.session, message: resumeFixMessage(previous.failure) } } : {};
      inFlightSession = ses;
      const tried = ses.resume !== undefined;
      let reply: Awaited<ReturnType<FixDeps["ask"]>>;
      try { reply = await d.ask(ASK_STEPS.fix, input, { checkout, tool, agent: `security-fix-${n}`, run, session: ses }); } finally { tool.close(); }
      const resumed = tried && reply.resumed === true;
      ledger.hold(reply.kept);
      kept = reply.kept ? { session: reply.kept, at: Date.now() } : undefined;
      if (kept) touchStore(kept.session.dir);
      recordFixCall(db, row.scan_id, n, "fix", started, reply.text !== null, reply.cost, resumed);
      log(`${repo} finding ${n}: round ${round} ${resumed ? "continued the earlier session" : tried ? "started a new session (the earlier one could not be continued)" : "started a new session"}${reply.cost !== null ? `, cost $${reply.cost.toFixed(2)}` : ""}`);
      if (reply.text === null) { failRound("the model gave no answer"); continue; }
      const parsed = parseFixReply(reply.text);
      if (!parsed) { failRound("the reply did not follow the form: TITLE line, SUMMARY line, the marker line and the diff"); continue; }
      const quiet = quietProblem(parsed.title, parsed.summary) ?? (patchGiveaway(parsed.patch) ? `the diff adds the word "${patchGiveaway(parsed.patch)}"; name things for what the code does` : null);
      if (quiet) { failRound(quiet, parsed.patch); continue; }
      const v = validateFixPatch(parsed.patch, allowed, testPath, crate.dir, testName, scripts);
      if (!v.ok) { failRound(v.reason, parsed.patch); continue; }
      const scratch = mkdtempSync(join(d.root, ".index-"));
      let applied;
      try { applied = await git.applyToTree(sha, v.patch, join(scratch, "index")); } finally { rmSync(scratch, { recursive: true, force: true }); }
      if (!applied.ok) { failRound(applied.reason, v.patch); continue; }
      // Every wording check has passed: only now does a build task exist. The job ends; a later one reads the result.
      let ids: [number, number];
      try { ids = queueRound(db, { repo, sha, crate: crate.name, test: testName, patch: v.patch, testPatch: v.testPatch }); } catch (e) {
        if (e instanceof BuildError) { failRound(`the build tasks were not queued: ${e.message}`, v.patch); continue; }
        throw e;
      }
      const keptNow: Kept = reply.kept ? { "": reply.kept } : {};
      db.prepare("INSERT OR REPLACE INTO security_fix_rounds (repo, number, round, patch, test_patch, title, summary, head_task, base_task, session, state, created_at, serving_metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'building', ?, ?)")
        .run(repo, n, round, v.patch, v.testPatch, parsed.title, parsed.summary, ids[0], ids[1], storeSessions(keptNow, new Date()), new Date().toISOString(), serializeServingMetadata(reply.serving));
      ledger.stored(keptNow);
      const queued = `${repo} finding ${n}: round ${round} queued for build${confidentialReadyAt(db) === null ? "; waiting for a confidential build environment" : ""}`;
      log(queued);
      return queued;
    }
    return giveUp(db, repo, n, lastWhy, log);
  } catch (e) {
    if (finalizationStorage) throw e;
    if (e instanceof CodexBudgetError) {
      budgetPaused = true;
      const retained = inFlightSession?.kept ?? inFlightSession?.resume?.session;
      if (retained) {
        const last = roundRows(db, repo, n).at(-1);
        if (last) db.prepare("UPDATE security_fix_rounds SET session = ? WHERE repo = ? AND number = ? AND round = ?")
          .run(storeSessions({ "": retained }, new Date()), repo, n, last.round);
        ledger.stored({ "": retained });
      }
      return pause(e);
    }
    giveUp(db, repo, n, `the fix failed: ${(e as Error).message}`, log);
    throw e;
  } finally {
    if (!budgetPaused && !finalizationStorage) ledger.release();
  }
}

/** Opus reviews the private diff; an approve lets the fix stand. */
async function reviewPatch(db: DatabaseSync, d: FixDeps, input: SecurityFixCheckInput, o: { checkout?: string; scanId: number; n: number; run: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const started = new Date().toISOString();
  const reply = await d.ask(ASK_STEPS.review, input, { checkout: o.checkout, agent: `security-review-${o.n}`, run: o.run });
  const parsed = reply.text === null ? null : parseCheck(reply.text);
  recordFixCall(db, o.scanId, o.n, "review", started, parsed?.ok === true, reply.cost);
  if (!parsed) return { ok: false, reason: "the patch review gave no answer" };
  if (!parsed.ok) return { ok: false, reason: `the patch review gave no valid answer: ${parsed.error}` };
  if (parsed.check.verdict === "reject") return { ok: false, reason: `The reviewing assistant rejected the patch: ${parsed.check.reasons}${parsed.check.problems.length ? ` (${parsed.check.problems.join("; ")})` : ""}` };
  return { ok: true };
}
