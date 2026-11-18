import { serializeServingMetadata, summarizeStoredServingMetadata, type ServingMetadata } from "../agents/provenance.ts";
import { storedNote } from "../github/note.ts";
// The fix PR of a red default branch: for each `needs-fix` row of an approved repo whose head is still red, one attempt
// (per repo, head and check): skip when main is green again or an open PR already covers the failure, otherwise the CI fix
// patch path writes a patch against the head commit (Sonnet, Opus check, validators). A patch that changes Rust files is
// stored on the rows (state `linting`) with its lint task and the step ends; a later run collects the result: formatting is
// folded in, findings go back to the model (at most LINT_MAX_ROUNDS lint rounds). The clean commit is pushed to the
// pipeline account's fork on `autocraft/main-ci-<check>-<sha7>` and a PR is opened against the default branch.
// The log, the files and other PRs are untrusted data; nothing from them is run here.
import { ownPrSelect } from "../github/adopt.ts";
import { leaseItem } from "../runner/leases.ts";
import { CLI_BY, type By } from "../core/gates.ts";
import { guardRepo } from "../core/guard.ts";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { errorFiles, patchFromFailure, type CifixDeps } from "../cifix/index.ts";
import { isQuiet } from "../security/quiet.ts";
import { readFailure } from "../cifix/logs.ts";
import type { CifixPr } from "../cifix/types.ts";
import { forkOf } from "../fixissue/index.ts";
import { outsideShown } from "../fixup/excerpt.ts";
import { Git, type Exec } from "../fixup/git.ts";
import { setPipelineLogin } from "../github/pipeline-account.ts";
import { scrubReason, whoAmI } from "../fixup/index.ts";
import { commitIdentity } from "../github/identity.ts";
import { ghOpenPr, pushOwnBranch } from "../github/write.ts";
import { buildScriptsAt, editable, validatePatch } from "../fixup/patch.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { foldFormat, queueLintFor, readLint } from "../prepush/index.ts";
import { findingsWord, lintVerdict, testsNoteOf } from "../prepush/tests.ts";
import { dropSessions, SessionLedger, sessionAsk, storeSessions, sweepSessions, type SessionAsk } from "../prepush/resume.ts";
import { MAIN_FIX_BRANCH_PREFIX } from "../mainci/index.ts";
import type { Gh } from "../merge/safe-merge.ts";
import { cleanLine } from "../review/post-template.ts";
import type { FixRow } from "./index.ts";
import { optionalChecks } from "../optional-checks.ts";
import { ownerOf, slugOf } from "../owners.ts";
import { POOL_MAX, pool } from "../classify/run.ts";
import { isHalt, queueRoom } from "../agents/call.ts";
import { pushesUnsettled } from "../push-outcomes.ts";

export const PR_ACTOR = "main-fix";
/** Open PRs read for overlap with the failure. */
const MAX_PRS = 30;

/** What the fix PR step needs beyond the reading and sorting deps. */
export type FixPrDeps = Pick<CifixDeps, "ask" | "check" | "root"> & {
  /** Host directory with a read-only checkout of the head commit for the sandboxed model calls, or null to ask without tools. */
  checkout?: (repo: string, branch: string, sha: string) => Promise<string | null>;
};

const PATCH_MODEL = CLAUDE_PROMPTS["cifix.patch"].models[0]!;

/** Whether a repo has stored patches to collect: the lint task of one ended, or its head is not the current one. */
export function lintReady(db: DatabaseSync, repo: string, current: string): boolean {
  const rows = db.prepare("SELECT head_sha, lint_task FROM main_fixes WHERE repo = ? AND state = 'linting'").all(repo) as { head_sha: string; lint_task: number | null }[];
  return rows.some((r) => r.head_sha !== current || r.lint_task === null || readLint(db, r.lint_task).kind !== "pending");
}

/** The default branch's head as the polls show it. */
export type Head = { headSha: string; branch: string; state: string; redSince: string; culprit: string; culpritPr: number | null };

type Ctx = {
  by?: By;
  /** True when no new head should be started (cancel, deadline, pipeline off). */
  stopping?: () => boolean;
  db: DatabaseSync; repo: string; gh: Gh; exec: Exec; fix: FixPrDeps; now: () => Date; log: (line: string) => void;
  /** The rows' state writer of the caller. */
  setState: (r: FixRow, state: string, reason: string | null, at: string, extra?: Partial<FixRow>) => FixRow;
  /** The head as the polls show it now. */
  current: () => Head | null;
};

/** The commit message: a subject and one line per changed file. */
const commitMessage = (subject: string, files: string[]): string => `${subject}\n\n${files.map((f) => `- ${f}`).join("\n")}\n`;
const oneLine = (s: string, max = 200): string => s.replace(/\s+/g, " ").trim().slice(0, max);
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "check";
export const branchFor = (check: string, sha: string): string => `${MAIN_FIX_BRANCH_PREFIX}${slug(check)}-${sha.slice(0, 7)}`;
const urlOk = (url: string, repo: string): boolean => new RegExp(`^https://github\\.com/${slugOf(repo)}/pull/\\d+$`).test(url);

/** Title of the fix PR: the first check, and how many more the same patch covers. */
export const prTitle = (checks: string[]): string => `Fix main CI: ${cleanLine(checks[0], 100)}${checks.length > 1 ? ` (+${checks.length - 1} more)` : ""}`;

/** Body of the fix PR. Fixed layout; the check names are cleaned of mentions and markup. */
export function prBody(r: { head: string; checks: { name: string; runUrl: string | null }[]; culprit: string; culpritPr: number | null; files: string[]; changed: number }): string {
  const one = (c: { name: string; runUrl: string | null }): string => `\`${cleanLine(c.name, 100).replace(/`/g, "'")}\`${c.runUrl ? ` (${c.runUrl})` : ""}`;
  return [
    `The CI of the default branch fails at ${r.head.slice(0, 8)}.`,
    "",
    r.checks.length === 1 ? `Failing check: ${one(r.checks[0]!)}` : `Failing checks:\n${r.checks.map((c) => `- ${one(c)}`).join("\n")}`,
    `Culprit: ${r.culprit.slice(0, 8)}${r.culpritPr ? ` (#${r.culpritPr})` : ""}`,
    "",
    `Patch: ${r.files.map((f) => `\`${f}\``).join(", ")}, ${r.changed} changed ${r.changed === 1 ? "line" : "lines"}.`,
  ].join("\n");
}

/**
 * The PR (number) that already covers the failure, if any: one of ours opened for this red streak and still open, or an
 * open PR updated after the red that names a failing check or changes a file the failure names.
 */
async function coveringPr(c: Ctx, checks: string[], files: string[], since: string): Promise<number | null> {
  const ours = c.db.prepare(`SELECT DISTINCT f.pr_number AS n FROM main_fixes f LEFT JOIN items i ON i.repo = f.repo AND i.number = f.pr_number
    WHERE f.repo = ? AND f.state = 'pr-opened' AND f.pr_number IS NOT NULL AND f.updated_at >= ? AND COALESCE(i.state, 'OPEN') = 'OPEN' ORDER BY f.pr_number LIMIT 1`).get(c.repo, since) as { n: number } | undefined;
  if (ours) return ours.n;
  const prs = c.db.prepare(`SELECT number, title, body FROM items WHERE repo = ? AND kind = 'pr' AND state = 'OPEN'
    AND (COALESCE(updated_at, '') > ? OR COALESCE(created_at, '') > ?) ORDER BY number LIMIT ${MAX_PRS}`).all(c.repo, since, since) as { number: number; title: string | null; body: string | null }[];
  const names = checks.map((x) => x.toLowerCase());
  for (const p of prs) {
    const text = `${p.title ?? ""}\n${p.body ?? ""}`.toLowerCase();
    if (names.some((n) => text.includes(n))) return p.number;
  }
  if (!files.length) return null;
  for (const p of prs) {
    try {
      const out = await c.gh(["api", `repos/${slugOf(c.repo)}/pulls/${p.number}/files?per_page=100`, "--jq", ".[].filename"]);
      if (out.split("\n").some((f) => files.includes(f.trim()))) return p.number;
    } catch { /* unreadable: not counted as covering */ }
  }
  return null;
}

type Outcome = "opened" | "skipped" | "failed" | "waiting" | "linting";

/**
 * One attempt for the rows of one head: one patch and one PR for all of them. The rows are `needs-fix` (a new patch) or
 * `linting` (a stored patch whose lint task is collected). Each row ends in nothing-to-do, pr-opened or fix-failed, goes to
 * linting with a stored patch, or stays as it is while the head is still running or the lint task is.
 */
async function attempt(c: Ctx, rows: FixRow[], count: () => void, ledger: SessionLedger): Promise<Outcome> {
  const at = (): string => c.now().toISOString();
  const head = rows[0]!.head_sha;
  const set = (list: FixRow[], state: "nothing-to-do" | "fix-failed", reason: string): "skipped" | "failed" => {
    const why = scrubReason(oneLine(reason), c.fix.root);
    for (const r of list) c.setState(r, state, why, at());
    c.log(`  ${c.repo}: ${list.map((r) => r.check).join(", ")}: ${state}: ${why}`);
    return state === "fix-failed" ? "failed" : "skipped";
  };
  const done = (state: "nothing-to-do" | "fix-failed", reason: string) => set(rows, state, reason);
  try {
    const now = c.current();
    // The head is still being checked (a rerun is running): the row waits, with no state change and no attempt counted.
    if (now && now.headSha === head && now.state === "running") return "waiting";
    if (!now || now.state !== "red") return done("nothing-to-do", "main is green again");
    if (now.headSha !== head) return done("nothing-to-do", "main moved to a newer head");
    const reading = await readFailure(c.gh, c.repo, head, optionalChecks(c.db, c.repo));
    if (reading.kind === "skip") return done("nothing-to-do", reading.why);
    const failing = new Map(reading.failure.checks.map((x) => [x.name, x]));
    for (const r of rows.filter((x) => !failing.has(x.check))) set([r], "nothing-to-do", "the check no longer fails at this head");
    const live = rows.filter((r) => failing.has(r.check));
    if (!live.length) return "skipped";
    const checks = live.map((r) => failing.get(r.check)!);
    const files = [...new Set(checks.flatMap((x) => errorFiles(x.steps.map((s) => s.tail).join("\n"))))];
    const covered = await coveringPr(c, live.map((r) => r.check), files, now.redSince);
    if (covered !== null) return set(live, "nothing-to-do", `an open PR already covers it: #${covered}`);

    const stored = live[0]!.state === "linting";
    const w = stored ? { patch: live[0]!.patch ?? "", files: JSON.parse(live[0]!.files ?? "[]") as string[], task: live[0]!.lint_task, round: live[0]!.lint_round ?? 1, state: live[0]!.lint_state, session: live[0]!.session } : null;
    const res = w ? readLint(c.db, w.task ?? -1) : null;
    if (res?.kind === "pending") return "waiting";
    if (!stored) count();
    const git = new Git(c.exec, c.fix.root, c.repo);
    mkdirSync(c.fix.root, { recursive: true });
    if (!(await git.fetchBranch(ownerOf(c.repo), c.repo, now.branch, head))) return set(live, "fix-failed", "the head commit is no longer in the repository");
    const ref = `${c.repo}@${head.slice(0, 8)}`;
    const names = live.map((r) => r.check);
    const title = prTitle(names);
    const treeOf = async (patch: string, exact: string[] = []) => {
      const scratch = mkdtempSync(join(c.fix.root, ".index-"));
      try { return await git.applyToTree(head, patch, join(scratch, "index"), exact); }
      finally { rmSync(scratch, { recursive: true, force: true }); }
    };
    // This receipt describes accepted workflow contributors, not the sole author of a current patch.
    let workflowMetadata = serializeServingMetadata(summarizeStoredServingMetadata(live.map(r => r.serving_metadata)));
    const store = (patch: string, files: string[], task: number, state: "pending" | "requeued", round: number, session: string | null, servingMetadata: string | null = workflowMetadata): void => {
      for (const r of live) c.setState(r, "linting", null, at(), { patch, files: JSON.stringify(files), lint_task: task, lint_round: round, lint_state: state, session, serving_metadata: servingMetadata });
    };

    type Made = { ok: true; patch: string; files: string[]; changed: number; shown: CifixPr["files"]; model: string; serving?: ServingMetadata; applied: Awaited<ReturnType<typeof treeOf>> } | { ok: false; reason: string };
    /** A model patch (with the earlier patch and its findings after a lint round), applied and checked. */
    const generate = async (previous: { patch: string; findings: string[] } | null, round: number, ses: SessionAsk = {}): Promise<Made> => {
      const made = await patchFromFailure(c.db, c.fix, {
        git, ref, title, repo: c.repo, number: 0, base: head, ...(now.culpritPr && isQuiet(c.db, c.repo, now.culpritPr) ? { quiet: true } : {}), head, round, failure: { head, checks }, diffText: "", ...(previous ? { previous } : {}), session: ses,
        runId: `main-fix-${c.repo}-${at().replace(/[-:]/g, "").slice(0, 15)}`, actor: PR_ACTOR, at,
        reviewReason: `The default branch fails the check${names.length > 1 ? "s" : ""} ${names.join(", ")} at this head. The patch must make ${names.length > 1 ? "them" : "it"} pass without changing what the code is meant to do.`,
        checkout: async () => c.fix.checkout?.(c.repo, now.branch, head),
      });
      ledger.hold(ses.kept);
      if (!made.ok) return made;
      const { v, shown } = made;
      const tree = await treeOf(v.patch, shown.flatMap((f) => ("excerpt" in f ? [f.path] : [])));
      if (!tree.ok) return { ok: false, reason: tree.reason };
      const refusal = await made.check(v.patch);
      if (refusal !== null) return { ok: false, reason: refusal.replace(/^rejected: /, "") };
      // Checked here: the collect step has no excerpts to check against.
      const early = outsideShown(shown, await git.diffText(head, tree.tree));
      if (early) return { ok: false, reason: early };
      return { ok: true, patch: v.patch, files: v.files, changed: v.changed, shown, model: made.model, serving: made.serving, applied: tree };
    };

    let patch: string, patchFiles: string[], changed: number, shown: CifixPr["files"] = [], model = PATCH_MODEL;
    let applied: Awaited<ReturnType<typeof treeOf>>;
    if (w && res) {
      if (res.kind === "infra-failed") {
        const again = w.state === "requeued" ? null : await queueLintFor(c.db, { step: "mainfix", repo: c.repo, number: null, head, base: head, patch: w.patch });
        if (again === null) return set(live, "fix-failed", `lint: ${res.reason}`);
        store(w.patch, w.files, again, "requeued", w.round, w.session, live[0]?.serving_metadata ?? null);
        c.log(`  ${c.repo}: lint task failed (${res.reason}); queued again as task ${again}`);
        return "linting";
      }
      const verdict = res.kind === "result" ? lintVerdict(res.findings, w.round) : null;
      if (res.kind === "result" && (verdict!.action === "clean" || verdict!.action === "push")) {
        dropSessions(w.session);
        const testsNote = testsNoteOf(verdict!, res.testsNote);
        if (testsNote) c.log(`  ${c.repo}: ${testsNote}`);
        const scripts = await buildScriptsAt(git, head);
        const fold = await foldFormat(git, head, w.patch, res.formatDiff ?? "", c.fix.root);
        if (!fold.ok) return set(live, "fix-failed", fold.reason);
        const v = validatePatch(w.patch, w.files, (x) => editable(x, scripts));
        if (!v.ok) return set(live, "fix-failed", v.reason);
        applied = await treeOf(fold.patch);
        ({ patch, patchFiles, changed } = { patch: fold.patch, patchFiles: v.files, changed: v.changed });
      } else {
        const findings = res.kind === "result" ? res.findings : [];
        if (verdict?.action === "fail") return set(live, "fix-failed", `${findingsWord(findings)} remain after ${w.round} rounds: ${oneLine(verdict.first.message)}`);
        count();
        const texts = verdict?.action === "ask" ? verdict.texts : [];
        const ses = sessionAsk(w.session, "", texts, new Date(at()));
        const made = await generate({ patch: w.patch, findings: texts }, w.round + 1, ses);
        dropSessions(w.session, ses.kept ? { "": ses.kept } : {});
        if (!made.ok) return set(live, "fix-failed", made.reason);
        ({ patch, files: patchFiles, changed, shown, model, applied } = made);
        workflowMetadata = serializeServingMetadata(summarizeStoredServingMetadata([workflowMetadata, made.serving]));
        const task = await queueLintFor(c.db, { step: "mainfix", repo: c.repo, number: null, head, base: head, patch });
        if (task === null) { /* the new patch changes no Rust file: nothing to lint */ } else {
          store(patch, patchFiles, task, "pending", w.round + 1, ses.kept ? storeSessions({ "": ses.kept }, new Date(at())) : null);
          if (ses.kept) ledger.stored({ "": ses.kept });
          c.log(`  ${c.repo}: patch stored; lint task ${task} queued (round ${w.round + 1})`);
          return "linting";
        }
      }
    } else {
      const ses: SessionAsk = {};
      const made = await generate(null, 1, ses);
      if (!made.ok) return set(live, "fix-failed", made.reason);
      ({ patch, files: patchFiles, changed, shown, model, applied } = made);
        workflowMetadata = serializeServingMetadata(summarizeStoredServingMetadata([workflowMetadata, made.serving]));
      // Like every model patch, this one is linted before it is pushed; the collect step on a later run folds in the formatting or sends findings back.
      const task = await queueLintFor(c.db, { step: "mainfix", repo: c.repo, number: null, head, base: head, patch });
      if (task !== null) {
        store(patch, patchFiles, task, "pending", 1, ses.kept ? storeSessions({ "": ses.kept }, new Date(at())) : null);
        if (ses.kept) ledger.stored({ "": ses.kept });
        c.log(`  ${c.repo}: patch stored; lint task ${task} queued (round 1)`);
        return "linting";
      }
    }
    if (!applied.ok) return set(live, "fix-failed", applied.reason);

    const who = await whoAmI(c.exec);
    const author = await commitIdentity(c.db, c.repo, async () => who);
    setPipelineLogin(c.db, who.login);
    const commit = await git.commit(applied.tree, head, commitMessage(title, patchFiles), { name: author.name, email: author.email });
    const changes = await git.rawChanges(head, commit);
    const touched = changes.map((x) => x[3]!).sort().join("\n");
    if (changes.some((x) => x[2] !== "M" || x[0] !== x[1] || (x[0] !== "100644" && x[0] !== "100755")) || touched !== [...files].sort().join("\n"))
      return set(live, "fix-failed", "the commit would change files or modes outside the validated diff");
    const outside = outsideShown(shown, await git.diffText(head, commit));
    if (outside) return set(live, "fix-failed", outside);

    // The model calls took minutes: the head is read again before anything is written.
    const again = c.current();
    if (!again || again.state !== "red" || again.headSha !== head) return set(live, "nothing-to-do", "main changed while the patch was written");

    const branch = branchFor(names[0]!, head);
    const g = guardRepo(c.db, c.repo, "main-fix", c.by ?? CLI_BY);
    if ("refused" in g) return set(live, "fix-failed", g.refused);
    const fork = await forkOf({ db: c.db, login: PR_ACTOR }, g, c.exec, who.login, c.repo);
    const owner = fork.split("/")[0]!;
    const sel = ownPrSelect(c.db, c.repo, [owner], now.branch);
    const found = await c.exec("gh", ["pr", "list", "--repo", `${slugOf(c.repo)}`, "--state", "open", "--head", branch, "--json", sel.json, "--jq", sel.jq]);
    let url = found.code === 0 ? found.stdout.trim().split("\n")[0] ?? "" : "";
    if (!(url && urlOk(url, c.repo))) {
      const push = await pushOwnBranch({ db: c.db, login: PR_ACTOR }, g, git, "main-fix-push", { repo: c.repo, remote: fork, branch, sha: commit }, { fork, head });
      if (push.code !== 0) return set(live, "fix-failed", `push failed: ${oneLine(push.stderr)}`);
      const body = prBody({ head, checks: live.map((r) => ({ name: r.check, runUrl: r.run_url })), culprit: now.culprit, culpritPr: now.culpritPr, files: patchFiles, changed });
      const pr = await ghOpenPr({ db: c.db, login: PR_ACTOR }, g, c.exec, "main-fix-pr", { repo: c.repo, target: ref, base: now.branch, head: `${owner}:${branch}`, title, body },
        storedNote({ by: "model", kind: workflowMetadata == null ? "pull request" : "pull request; workflow contributors", model }, workflowMetadata), { branch, files: patchFiles });
      url = pr.stdout.trim().split("\n").pop() ?? "";
      if (pr.code !== 0 || !urlOk(url, c.repo)) return set(live, "fix-failed", `the pull request was not opened: ${oneLine(pr.stderr || pr.stdout)}`);
    }
    for (const r of live) c.setState(r, "pr-opened", r.reason, at(), { pr_number: Number(url.split("/").pop()), pr_url: url, serving_metadata: workflowMetadata });
    c.log(`  ${c.repo}: ${names.join(", ")}: opened ${url}`);
    return "opened";
  } catch (e) {
    if (isHalt(e)) throw e;
    return done("fix-failed", String((e as Error).message ?? e));
  }
}

/** Takes the repo's `needs-fix` and `linting` rows head by head; `onHandled` is called once per head that reaches the model work. */
export async function openFixPrs(c: Ctx, onHandled?: () => void): Promise<{ opened: number; skipped: number; failed: number; linting: number }> {
  const out = { opened: 0, skipped: 0, failed: 0, linting: 0 };
  const rows = c.db.prepare("SELECT * FROM main_fixes WHERE repo = ? AND state IN ('needs-fix', 'linting') AND verdict = 'code' ORDER BY created_at, head_sha, \"check\"").all(c.repo) as FixRow[];
  const byHead = new Map<string, FixRow[]>();
  const ledger = new SessionLedger();
  for (const r of rows) (byHead.get(r.head_sha) ?? byHead.set(r.head_sha, []).get(r.head_sha)!).push(r);
  try {
    sweepSessions(c.db, c.now());
    let stopLogged = false;
    // One group per head, run at once while the model queue has room; the rows of a head stay in one attempt.
    await pool([...byHead.values()].map((group) => async () => {
      if (c.stopping?.()) {
        if (!stopLogged) { stopLogged = true; c.log(`  ${c.repo}: stopping, no new heads started`); }
        return;
      }
      if (pushesUnsettled(c.db, c.repo, c.log)) return;
      const release = leaseItem(c.db, `head:${c.repo}@${group[0]!.head_sha}`, c.log);
      if (!release) return;
      try {
        // Another job may have moved the rows on before the lease was taken.
        const now = c.db.prepare("SELECT * FROM main_fixes WHERE repo = ? AND head_sha = ? AND state IN ('needs-fix', 'linting') AND verdict = 'code' ORDER BY created_at, \"check\"").all(c.repo, group[0]!.head_sha) as FixRow[];
        if (!now.length) return;
        // Rows that turned red after the patch was stored wait until it is collected.
        const stored = now.filter((r) => r.state === "linting");
        const o = await attempt(c, stored.length ? stored : now, () => onHandled?.(), ledger);
        if (o !== "waiting") out[o]++;
      } finally { release(); }
    }), () => queueRoom(c.db), { max: POOL_MAX.mainfix });
  } finally {
    ledger.release();
  }
  return out;
}
