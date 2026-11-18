import { storedNote } from "../github/note.ts";
// CI fix: a PR we want whose gate check failed at its reviewed head gets one of three things, by what the log says:
//   format  the formatter runs in a build environment (never on this host) and its diff is pushed; no model;
//   infra   the failed jobs are rerun once per head (the `cifix-rerun` step);
//   code    Sonnet writes a patch from the log and the PR's code, Opus checks it, then it is pushed.
// A branch we can't push to gets the patch as a comment where the repo allows comments. At most two tries per head.
// The log and the PR are untrusted data: nothing from them is run here, and a model only reads them.
//
//   autocraft cifix --repo R [--limit N] [--apply]
//   autocraft cifix-rerun --repo R [--limit N] [--apply]
import { duplicateHeld } from "../dupes/held.ts";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { commentApprovalOf } from "../act/approval.ts";
import { absolute } from "../build/artifacts.ts";
import { createTask, getTask, TERMINAL, warmKeyOf } from "../build/tasks.ts";
import { askClaude, POOL_MAX, pool } from "../classify/run.ts";
import { isHalt, queueRoom } from "../agents/call.ts";
import { pushesUnsettled } from "../push-outcomes.ts";
import { audit } from "../dash/audit.ts";
import { connect } from "../db.ts";
import { optionalChecks } from "../optional-checks.ts";
import { pushApprovalOf } from "../fixup/approval.ts";
import { Git, exec, fixupDir, type Exec } from "../fixup/git.ts";
import { DIFF_CAP, FILE_CAP, PR_QUERY, TOTAL_CAP, noteLive, scrubReason, whoAmI, type PrNode } from "../fixup/index.ts";
import { commitIdentity } from "../github/identity.ts";
import { outsideShown, shownSize, viewFile } from "../fixup/excerpt.ts";
import { buildScriptsAt, editable, validatePatch } from "../fixup/patch.ts";
import { isQuiet } from "../security/quiet.ts";
import { patchGiveaway, QUIET_PATCH_REFUSAL } from "../security/rules.ts";
import { COMMENT_UNSENT_DELAYS_MS } from "../core/rules.ts";
import { readGate } from "../merge/changes-requested.ts";
import { ensureAuthorWrites } from "../fixup/author-permission.ts";
import { longLivedOf, pushable } from "../fixup/pushable.ts";
import { HOLD_CANNOT_PUSH } from "../fixup/template.ts";
import { CLI_BY, type By } from "../core/gates.ts";
import { guard, guardRepo, liveOf } from "../core/guard.ts";
import { claimForWork } from "../github/claim.ts";
import { pipelineMe } from "../github/pipeline-account.ts";
import { ghAskComment, ghComment, ghRerunFailed, pushBranch, type Note, type Writer } from "../github/write.ts";
import { Client, type Querier } from "../mirror.ts";
import { ghExec, type Gh } from "../merge/safe-merge.ts";
import { checkLine, parseCheck, recordCheck } from "../patchcheck/index.ts";
import { CHECK_DIFF_CAP, CHECK_PATCH_CAP, type FixupCheckInput } from "../patchcheck/types.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { cachedDiff, ghDiff, type DiffFetcher } from "../review/diff.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { checkoutForPr } from "../sandbox/index.ts";
import { MAX_PUSHES_PER_PR, MAX_TRIES_PER_PR, type CifixCandidate } from "./candidates.ts";
import { selectCifix } from "./select.ts";
import { formattingOnly, guardPatch, TEST_PATH } from "./guard.ts";
import { readFailure } from "./logs.ts";
import { askCiText, askText, commentText, commitMessage } from "./template.ts";
import { formatDiffPaths, matchPrFiles, triage } from "./triage.ts";
import { CheckTool, applyCheck, refusal } from "../checktool/index.ts";
import { foldFormat, queueLintFor, readLint } from "../prepush/index.ts";
import { findingsWord, lintVerdict, testsNoteOf } from "../prepush/tests.ts";
import { dropSessions, SessionLedger, sessionAsk, storeSessions, sweepSessions, type SessionAsk } from "../prepush/resume.ts";
import type { LintPrevious } from "../fixup/patch.ts";
import type { CiFailure, CifixPr } from "./types.ts";
import { jobItem } from "../runner/job-items.ts";
import { ownerOf, slugOf } from "../owners.ts";
import { leaseItem } from "../runner/leases.ts";

export { MAX_TRIES, type CifixCandidate } from "./candidates.ts";
export { selectCifix } from "./select.ts";

const ACTOR = "cifix";
const RERUN_ACTOR = "cifix-rerun";
const PROMPT = CLAUDE_PROMPTS["cifix.patch"];
const CHECK = CLAUDE_PROMPTS["fixup.check"];
/** Files shown to the patch model. */
const MAX_FILES = 8;
/** Characters of the failure log the Opus check sees. */
const CHECK_LOG_CAP = 8000;
/** How long a rerun gets to produce new check results before the PR is given up on. */
const RERUN_WAIT_MS = 2 * 3600_000;

/**
 * The formatter step. /src is a writable overlay inside the step, so the formatted copy is made beside an untouched
 * copy and the unified diff of the two goes to /out. No artifact means nothing to format.
 */
/** Where the build image keeps its Rust toolchain. */
export const IMAGE_CARGO = "/usr/local/cargo";
export const IMAGE_RUSTUP = "/usr/local/rustup";
export const FORMAT_SCRIPT = [
  // `set -f`: the file list is never glob-expanded.
  "set -e", "set -f", "mkdir -p /tmp/w", "cp -a /src /tmp/w/a", "cp -a /src /tmp/w/b", "cd /tmp/w",
  // The PR controls `.cargo/config.toml` (aliases) and `rust-toolchain.toml`: the image's rustfmt runs on the named files
  // directly, by absolute path, from outside the checkout, under an empty environment with the toolchain paths fixed.
  // rustfmt run on a file parses and formats it as its crate's edition, like `cargo fmt`: the nearest Cargo.toml's
  // `edition`, the workspace's for `edition.workspace = true`, 2015 (Cargo's default) when none is set.
  'files="$*"',
  `ed() { sed -n 's/^[[:space:]]*edition[[:space:]]*=[[:space:]]*"\\([0-9]*\\)".*/\\1/p' "$1" | head -n 1; }`,
  'edition_of() { d=$(dirname "b/$1"); while :; do if [ -f "$d/Cargo.toml" ]; then e=$(ed "$d/Cargo.toml"); if [ -n "$e" ]; then echo "$e"; return; fi; if grep -q "^[[:space:]]*edition[.[:space:]]*\\(workspace\\|=[[:space:]]*{\\)" "$d/Cargo.toml"; then e=$(ed b/Cargo.toml); echo "${e:-2015}"; return; fi; if grep -q "^[[:space:]]*\\[package\\]" "$d/Cargo.toml"; then echo 2015; return; fi; fi; [ "$d" = b ] && break; d=$(dirname "$d"); done; echo 2015; }',
  // A named path that is a symlink or resolves outside the checkout is refused, so rustfmt never writes through a link.
  // A file rustfmt cannot parse is listed in fmt-err.txt (an `@@ path` line, then rustfmt's output) and the run goes on.
  ": > /tmp/w/fmt-err.txt",
  `for f in $files; do r=$(realpath -- "b/$f" 2>/dev/null || true); case "$r" in /tmp/w/b/*) ;; *) printf '%s\\n' "@@ $f" "refused: the path is a symlink or leaves the checkout" >> /tmp/w/fmt-err.txt; continue;; esac; if ! o=$(env -i PATH=${IMAGE_CARGO}/bin:/usr/bin:/bin HOME=/tmp RUSTUP_HOME=${IMAGE_RUSTUP} CARGO_HOME=${IMAGE_CARGO} ${IMAGE_CARGO}/bin/rustfmt --edition "$(edition_of "$f")" "b/$f" 2>&1); then printf '%s\\n' "@@ $f" "$o" >> /tmp/w/fmt-err.txt; fi; done`,
  "if [ -s /tmp/w/fmt-err.txt ]; then cp /tmp/w/fmt-err.txt /out/fmt-err.txt; fi",
  ": > /tmp/w/format.txt",
  'for f in $files; do if ! cmp -s "a/$f" "b/$f"; then echo "diff -uN a/$f b/$f" >> /tmp/w/format.txt; diff -uN "a/$f" "b/$f" >> /tmp/w/format.txt || true; fi; done',
  "if [ -s /tmp/w/format.txt ]; then cp /tmp/w/format.txt /out/format.txt; fi",
].join("; ");
/** The most files one formatter run names. */
const FORMAT_FILES_MAX = 20;
export const FORMAT_ARTIFACT = "format.txt";

export type CifixDeps = {
  querier: Querier;
  /** Every git and gh write command. */
  exec: Exec;
  fetchDiff: DiffFetcher;
  /** Reads from GitHub (`gh` arguments): the failed check runs and their logs. */
  gh: Gh;
  /** The model's reply to the cifix.patch prompt, or null when it gave none. */
  ask: (db: DatabaseSync, input: CifixPr[], checkout?: string, tool?: CheckTool, session?: SessionAsk) => Promise<string | null>;
  /** The model's reply to the fixup.check prompt (Opus), or null when it gave none. */
  check: (db: DatabaseSync, input: FixupCheckInput[], checkout?: string) => Promise<string | null>;
  /** Host directory with a read-only checkout of the PR head for the sandboxed model calls, or null to ask without tools. */
  checkout?: (repo: string, number: number, head: string) => Promise<string | null>;
  now: () => Date;
  /** Directory holding one bare cache repository per repo. */
  root: string;
};

/** The note for a comment about a model-written patch. */
const codeNote: Note = { by: "model", kind: "comment", model: PROMPT.models[0] };

export function defaultDeps(): CifixDeps {
  return {
    querier: new Client(1000), exec, fetchDiff: ghDiff, gh: ghExec, now: () => new Date(), root: fixupDir(),
    ask: async (db, input, checkout, tool, session) => (await askClaude("cifix.patch", PROMPT.models[0]!, input, db, { checkout, check: tool, session }))?.text ?? null,
    check: async (db, input, checkout) => (await askClaude("fixup.check", CHECK.models[0]!, input, db, { checkout }))?.text ?? null,
    checkout: (r, n, h) => checkoutForPr(r, n, h, console.log),
  };
}

export type CifixParams = { repo: string; limit?: number; /** True when no new item should start (cancel, deadline, pipeline off). */ stopping?: () => boolean; /** Default true. */ dryRun?: boolean; onHandled?: (n: number) => void; /** Who asked; default: an operator at the command line. */ by?: By };
export type CifixSummary = {
  runId: string; repo: string; dryRun: boolean;
  pushed: string[]; asked: string[]; queued: string[]; infra: string[]; skipped: string[];
  failed: { ref: string; reason: string }[]; held: { ref: string; reason: string }[];
};

const refOf = (c: { repo: string; number: number }) => `${c.repo}#${c.number}`;
const short = (sha: string) => sha.slice(0, 7);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 200);

/** The formatter's `diff -ruN a b` output as a git-format diff, which validatePatch and `git apply` read. */
export function gitFormatDiff(text: string): string {
  return text.split("\n").map((l) => {
    const m = /^diff .* a\/(\S+) b\/(\S+)$/.exec(l);
    if (m) return `diff --git a/${m[1]} b/${m[2]}`;
    return l.startsWith("--- ") || l.startsWith("+++ ") ? l.replace(/\t.*$/, "") : l;
  }).join("\n");
}

const DIFF_FILE = /^diff --git a\/(\S+) b\/\S+$/gm;
const LOCATION = /^\s*--> ([\w./-]+\.rs):\d+/;
const ERROR_LINE = /^\s*error(\[E\d+\])?: /;

/** Files named on the compiler location line (`--> path:line`) directly after an `error` line. The log is untrusted, so no other mention counts. */
export function errorFiles(log: string): string[] {
  const lines = log.split("\n");
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (i === 0 || !ERROR_LINE.test(lines[i - 1]!)) return;
    const m = LOCATION.exec(l);
    if (m && !out.includes(m[1]!)) out.push(m[1]!);
  });
  return out;
}

type Fix = { patch: string; files: string[]; changed: number };

class Recorder {
  private db: DatabaseSync;
  private at: () => string;
  constructor(db: DatabaseSync, at: () => string) {
    this.db = db;
    this.at = at;
  }

  private open(c: CifixCandidate): { id: number } | undefined {
    return this.db.prepare("SELECT rowid AS id FROM ci_fixes WHERE repo = ? AND number = ? AND head = ? AND state IN ('formatting', 'pushing', 'linting') ORDER BY rowid DESC").get(c.repo, c.number, c.head) as { id: number } | undefined;
  }

  /** Written before the push: the commit about to be pushed, so a crash between the push and its record leaves the head in the push chain. */
  pushing(c: CifixCandidate, kind: "format" | "code", commit: string, files: string[]): void {
    const open = this.open(c);
    if (open) this.db.prepare("UPDATE ci_fixes SET state = 'pushing', to_head = ?, files = ? WHERE rowid = ?").run(commit, JSON.stringify(files), open.id);
    else {
      this.db.prepare("INSERT INTO ci_fixes (repo, number, head, to_head, kind, state, reason, files, attempt, created_at) VALUES (?, ?, ?, ?, ?, 'pushing', NULL, ?, ?, ?)")
        .run(c.repo, c.number, c.head, commit, kind, JSON.stringify(files), c.attempt, this.at());
    }
  }

  /** The model patch waits for its lint task: a first row, or the same row with the next round's patch and task. No task: a patch without a Rust file kept for posting again. */
  linting(c: CifixCandidate, patch: string, files: string[], task: number | null, lintState: "pending" | "requeued", round: number, session: string | null, servingMetadata: string | null = null): void {
    if (c.lint) {
      this.db.prepare("UPDATE ci_fixes SET patch = ?, files = ?, lint_task = ?, lint_round = ?, lint_state = ?, session = ?, serving_metadata = ? WHERE rowid = ?").run(patch, JSON.stringify(files), task, round, lintState, session, servingMetadata, c.lint.rowid);
      return;
    }
    this.db.prepare("INSERT INTO ci_fixes (repo, number, head, to_head, kind, state, reason, files, attempt, created_at, patch, lint_task, lint_round, lint_state, session, serving_metadata) VALUES (?, ?, ?, NULL, 'code', 'linting', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(c.repo, c.number, c.head, JSON.stringify(files), c.attempt, this.at(), patch, task, round, lintState, session, servingMetadata);
  }

  /** Stored patches whose Plan no longer lists the push (head moved, a Hold or Close answer, approval revoked) are dropped. */
  dropUnlisted(repo: string, listed: CifixCandidate[]): void {
    const keep = new Set(listed.map((c) => c.lint!.rowid));
    const rows = this.db.prepare("SELECT rowid AS id, number, head, lint_task FROM ci_fixes WHERE repo = ? AND state = 'linting'").all(repo) as { id: number; number: number; head: string; lint_task: number | null }[];
    const unsent = this.db.prepare("SELECT COUNT(*) AS n FROM ci_fixes WHERE repo = ? AND number = ? AND head = ? AND state = 'comment-unsent'");
    for (const r of rows) {
      const t = r.lint_task != null ? getTask(this.db, r.lint_task) : null;
      if (t && !TERMINAL.includes(t.state)) continue;
      // A patch whose comment did not reach GitHub is kept until its retries are used: the plan lists it again when its backoff ends.
      const n = (unsent.get(repo, r.number, r.head) as { n: number }).n;
      if (n > 0 && n <= COMMENT_UNSENT_DELAYS_MS.length) continue;
      if (!keep.has(r.id)) this.db.prepare("UPDATE ci_fixes SET state = 'superseded', reason = 'the plan no longer lists the push of the stored patch', patch = NULL WHERE rowid = ?").run(r.id);
    }
  }

  /**
   * One ci_fixes row. A formatter run keeps its `formatting` row and the result replaces its state. Every outcome
   * but the waiting states also notes the PR's stage, so the item page and the queue say what happened.
   */
  set(c: CifixCandidate, kind: "format" | "code" | "infra", state: string, reason: string | null, o: { files?: string[]; toHead?: string | null; task?: number | null; runs?: number[] } = {}): void {
    const at = this.at();
    const files = JSON.stringify(o.files ?? []);
    // A comment that did not reach GitHub leaves the open row (a try, holding the stored patch or formatter task) for the retry: its own row times the backoff.
    const open = state === "comment-unsent" ? undefined : this.open(c);
    if (open && state !== "formatting") {
      this.db.prepare("UPDATE ci_fixes SET state = ?, reason = ?, files = ?, to_head = ? WHERE rowid = ?").run(state, reason, files, o.toHead ?? null, open.id);
    } else {
      this.db.prepare("INSERT INTO ci_fixes (repo, number, head, to_head, kind, state, reason, files, attempt, task_id, runs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(c.repo, c.number, c.head, o.toHead ?? null, kind, state, reason, files, c.attempt, o.task ?? null, o.runs ? JSON.stringify(o.runs) : null, at);
    }
    if (state === "infra" || state === "formatting" || state === "rerun" || state === "rerunning") return;
    const note = state === "pushed" ? `CI fix pushed at ${short(c.head)}: ${(o.files ?? []).join(", ")}`
      : state === "skipped" ? `CI fix skipped at ${short(c.head)}: ${reason}`
      : state === "asked" ? `posted a CI fix at ${short(c.head)}: ${(o.files ?? []).join(", ")}` : `CI fix ${state} at ${short(c.head)}: ${reason}`;
    this.db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, ?, ?, ?, ?)").run(c.repo, c.number, "take", at, ACTOR, note);
    jobItem(this.db, c.repo, c.number, note, () => {});   // the callers log the outcome themselves
  }
}

/** The failure text the models and the check see: every failed step's tail, with its check and step names. */
function logText(f: CiFailure): CifixPr["failure"] {
  return f.checks.map((c) => ({ check: c.name, steps: c.steps.map((s) => ({ job: s.job, step: s.step, log: s.tail })) }));
}

/** What `patchFromFailure` needs to know about the commit and the failure it patches. */
export type PatchRequest = {
  git: Git;
  /** The patch is for a quiet pull request even though `number` names none (a default-branch fix whose culprit is one). */
  quiet?: boolean;
  /** How the models and the audit log name the subject, for example `repo#12`. */
  ref: string;
  title: string;
  repo: string;
  /** Recorded with the Opus check (0 for a default-branch head). */
  number: number;
  /** The commit the patch applies to. */
  head: string;
  /** The default-branch commit the check tool's tasks take their CI gate from (the PR's base, or `head` on the default branch). */
  base: string | null;
  /** The fix round or try. */
  round: number;
  failure: CiFailure;
  /** The unified diff of the change under repair; empty when there is none. */
  diffText: string;
  runId: string;
  actor: string;
  at: () => string;
  /** What the Opus check is told the patch is for; default: a pull request's failing check. */
  reviewReason?: string;
  /** An earlier patch that failed the lint check, with the findings on its lines. */
  previous?: LintPrevious;
  /** Continues the kept session that wrote `previous`; the call reports the session it ends with. */
  session?: SessionAsk;
  /** The read-only checkout of `head` for the model calls, or nothing to ask without tools. */
  checkout: () => Promise<string | null | undefined>;
};

export type PatchResult =
  | { ok: false; state: "failed" | "refused"; reason: string }
  | { ok: true; v: { patch: string; files: string[]; changed: number }; shown: CifixPr["files"]; names: string[]; model: string; check: (patch: string) => Promise<string | null> };

/**
 * The guard (see guardPatch) on the patch as git applies it at `head`: the patched tree is built in a scratch index under
 * `root`, and git's own diff and the files before and after it are judged.
 */
export async function guardApplied(git: Git, root: string, head: string, patch: string, exact: string[]): Promise<string | null> {
  const scratch = mkdtempSync(join(root, ".index-"));
  let applied;
  try {
    applied = await git.applyToTree(head, patch, join(scratch, "index"), exact);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return applied.ok ? guardTree(git, head, applied.tree) : applied.reason;
}

/** The guard on the change from commit `head` to `tree`. */
async function guardTree(git: Git, head: string, tree: string): Promise<string | null> {
  const diff = await git.diffText(head, tree);
  const sides = new Map<string, { before: string; after: string }>();
  for (const m of diff.matchAll(/^diff --git a\/(\S+) b\//gm)) {
    const before = await git.file(head, m[1]!), after = await git.file(tree, m[1]!);
    if (!before.ok || !after.ok) return `the content of ${m[1]} could not be read to check it`;
    sides.set(m[1]!, { before: before.content, after: after.content });
  }
  return guardPatch(diff, sides);
}

/**
 * The model patch for a failed check at `head`: the files the log names (and the diff's files) are shown whole or in
 * part, Sonnet writes the patch, and the validators and the size limit run. `check` is the Opus check: null when it
 * approves, else the refusal (`rejected: ...` when Opus said no).
 */
export async function patchFromFailure(db: DatabaseSync, d: Pick<CifixDeps, "ask" | "check" | "root">, r: PatchRequest): Promise<PatchResult> {
  const no = (state: "failed" | "refused", reason: string): PatchResult => ({ ok: false, state, reason });
  const { git, ref, title, repo, head, failure } = r;
  const text = failure.checks.flatMap((x) => x.steps.map((s) => s.tail)).join("\n");
  const scripts = await buildScriptsAt(git, head);
  // Files a compiler error points at come first, then the files the diff changes; nothing else is editable. Test files are not editable by a CI fix.
  const named = [...new Set(errorFiles(text).concat([...r.diffText.matchAll(DIFF_FILE)].map((m) => m[1]!)))]
    .filter((p) => editable(p, scripts) && !TEST_PATH.test(p)).slice(0, MAX_FILES);
  // With a sandbox checkout the model reads the files itself, so they are listed by path and no size limit applies.
  const checkout = (await r.checkout()) ?? undefined;
  const repoDir = checkout ? { repo_dir: REPO_PATH } : {};
  const shown: CifixPr["files"] = [];
  let total = 0;
  for (const path of named) {
    const f = await git.file(head, path);
    if (!f.ok) continue;
    if (checkout) { shown.push({ path }); continue; }
    // The log lines that mention the file give the lines a large file is cut around.
    const v = viewFile(path, f.content, text.split("\n").filter((l) => l.includes(path)), r.diffText, FILE_CAP);
    if (!v.ok) return no("failed", v.reason);
    total += shownSize(v.file);
    if (total > TOTAL_CAP) return no("failed", "the parts of the files the failure names are over the size limit");
    shown.push(v.file);
  }
  if (!shown.length) return no("failed", "the failure names no file a CI fix may edit");
  const quiet = !!r.quiet || isQuiet(db, repo, r.number);
  const tool = new CheckTool({ db, step: "cifix", repo, number: r.number || null, head, base: r.base, applies: applyCheck(git, d.root, head, (p) => refusal(validatePatch(p, shown.map((s) => s.path), (x) => editable(x, scripts)))) });
  const reply = await d.ask(db, [{ ref, title, failure: logText(failure), ...(quiet ? { quiet } : {}), files: shown, diff: r.diffText, ...(r.previous ? { previous: r.previous } : {}), ...repoDir }], checkout, tool, r.session);
  if (reply === null) return no("failed", "the model gave no answer");
  const v = validatePatch(reply, shown.map((s) => s.path), (x) => editable(x, scripts));
  if (!v.ok) return no("refused", v.reason);
  const word = quiet ? patchGiveaway(v.patch) : null;
  if (word) return no("refused", QUIET_PATCH_REFUSAL);
  const guard = await guardApplied(git, d.root, head, v.patch, shown.flatMap((f) => ("excerpt" in f ? [f.path] : [])));
  if (guard) return no("refused", guard);
  if (v.patch.length > CHECK_PATCH_CAP) return no("refused", `the patch is over the ${CHECK_PATCH_CAP} character limit for the check`);
  const names = failure.checks.map((x) => x.name);
  const check = async (patch: string): Promise<string | null> => {
    const input: FixupCheckInput = {
      ref, title, fixes: [], diff: r.diffText.slice(0, CHECK_DIFF_CAP), patch, ...repoDir,
      review_reason: r.reviewReason ?? `The check ${names.join(", ")} fails at this head. The patch must make it pass without changing what the pull request does.`,
      ci_failure: { checks: names, log: JSON.stringify(logText(failure)).slice(0, CHECK_LOG_CAP) },
    };
    const reply2 = await d.check(db, [input], checkout);
    if (reply2 === null) return "the patch check gave no answer";
    const verdict = parseCheck(reply2);
    if (!verdict.ok) return `the patch check gave no valid answer: ${verdict.error}`;
    recordCheck(db, { kind: "fixup", repo, number: r.number, subject: head, patch, round: r.round, model: CHECK.models[0]!, check: verdict.check, at: r.at() });
    audit(db, r.actor, "cifix-check", ref, { run: r.runId, head, verdict: verdict.check.verdict, reasons: verdict.check.reasons });
    return verdict.check.verdict === "reject" ? `rejected: Opus rejected the patch: ${checkLine(verdict.check)}` : null;
  };
  return { ok: true, v, shown, names, model: PROMPT.models[0]!, check };
}

export async function runCifix(db: DatabaseSync, params: CifixParams, log: (line: string) => void = console.log, deps?: CifixDeps): Promise<CifixSummary> {
  const ledger = new SessionLedger();
  try {
    if (!(params.dryRun ?? true)) sweepSessions(db, deps?.now() ?? new Date());
    return await runCifixWith(db, params, log, deps, ledger);
  } finally {
    ledger.release();
  }
}

async function runCifixWith(db: DatabaseSync, params: CifixParams, log: (line: string) => void, deps: CifixDeps | undefined, ledger: SessionLedger): Promise<CifixSummary> {
  const { repo } = params;
  const dryRun = params.dryRun ?? true;
  if (params.limit !== undefined && !(Number.isInteger(params.limit) && params.limit >= 0)) throw new Error("limit must be a whole number ≥ 0");
  const at = () => (deps?.now() ?? new Date()).toISOString();
  const runId = `cifix-${repo}-${at().replace(/[-:]/g, "").slice(0, 15)}`;
  const summary: CifixSummary = { runId, repo, dryRun, pushed: [], asked: [], queued: [], infra: [], skipped: [], failed: [], held: [] };
  const sel = selectCifix(db, repo);
  const collect = params.limit === undefined ? sel.collect : sel.collect.slice(0, params.limit);
  const work = params.limit === undefined ? sel.work : sel.work.slice(0, Math.max(0, params.limit - collect.length));
  log(`cifix ${repo}: ${sel.work.length} PRs with a failing check to read, ${sel.collect.length} formatter results to apply, ${sel.rerun.length} reruns due`);
  if (dryRun) {
    for (const x of collect) log(`  would apply the formatter result for ${refOf(x.c)} at ${short(x.c.head)}`);
    for (const c of work) log(`  would read the failure of ${refOf(c)} at ${short(c.head)} (try ${c.attempt}, ${c.route})`);
    log(`cifix ${repo}: dry run, nothing called or written`);
    return summary;
  }
  const d = deps ?? defaultDeps();
  const rec = new Recorder(db, at);
  rec.dropUnlisted(repo, sel.lint);
  const gw: Writer = { db, login: ACTOR };
  const git = new Git(d.exec, d.root, repo);
  const approved = pushApprovalOf(db, repo) !== null;
  const commenting = commentApprovalOf(db, repo) !== null;
  let whoP: ReturnType<typeof whoAmI> | undefined;
  let handled = 0;

  /** Why `readPr` returned null for a PR; items run at once, so it is kept per PR. */
  const gone = new Map<number, string>();
  const readPr = async (c: CifixCandidate): Promise<PrNode | null> => {
    const r = await d.querier.query(PR_QUERY, { owner: ownerOf(repo), name: repo, n: c.number }) as { repository?: { pullRequest?: PrNode | null } };
    const pr = r.repository?.pullRequest;
    noteLive(db, repo, c.number, pr, at());
    if (!pr || pr.state !== "OPEN" || pr.isDraft) { const why = "no longer an open, non-draft PR"; gone.set(c.number, why); log(`  ${refOf(c)}: skipped: ${why}`); return null; }
    if (pr.headRefOid !== c.head) { const why = `head moved to ${short(pr.headRefOid)} since the checks ran`; gone.set(c.number, why); log(`  ${refOf(c)}: skipped: ${why}`); return null; }
    return pr;
  };

  /** Applies a validated patch to the PR head: pushed to the branch, or posted as a comment where the branch is closed to us. */
  const deliver = async (c: CifixCandidate, kind: "format" | "code", pr: PrNode, v: Fix, checkName: string, check?: (patch: string) => Promise<string | null>, shown: CifixPr["files"] = [], folded: string | null = null, ses: SessionAsk = {}): Promise<void> => {
    const ref = refOf(c);
    const deliveredNote = storedNote(codeNote, folded !== null ? c.lint?.servingMetadata : null);
    const fail = (state: "failed" | "refused" | "rejected", raw: string) => {
      const reason = scrubReason(raw, d.root);
      rec.set(c, kind, state, reason, { files: v.files });
      summary.failed.push({ ref, reason });
      log(`  ${ref}: ${state}: ${reason}`);
    };
    const writes = pr.headRepository ? await ensureAuthorWrites(db, repo, c.number, pr.headRepository.nameWithOwner) : "no";
    if (writes === "unknown") { log(`  ${ref}: skipped: the author's permission could not be read yet`); return; }
    const canPush = !!pr.headRepository && pushable(pr.headRepository.nameWithOwner, repo, pr.maintainerCanModify, pr.headRefName, longLivedOf(db, repo), !!pr.headRef?.branchProtectionRule, writes === "yes");
    if (canPush ? !approved : !commenting) {
      const reason = canPush ? "pushing is not approved for this repo" : HOLD_CANNOT_PUSH;
      rec.set(c, kind, "cannot-push", reason, { files: v.files });
      summary.held.push({ ref, reason });
      log(`  ${ref}: held: ${reason}`);
      return;
    }
    const head = await git.fetchPr(ownerOf(repo), repo, c.number);
    if (head !== c.head) {
      noteLive(db, repo, c.number, { ...pr, headRefOid: head }, at());
      fail("failed", `fetched head ${short(head)} is not the checked ${short(c.head)}`);
      return;
    }
    const scratch = mkdtempSync(join(d.root, ".index-"));
    let applied;
    try {
      applied = await git.applyToTree(head, folded ?? v.patch, join(scratch, "index"), shown.flatMap((f) => ("excerpt" in f ? [f.path] : [])));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    if (!applied.ok) { fail("refused", applied.reason); return; }
    if (kind === "format") {
      // Formatting alone, whatever produced the diff: the same limits as any patch, and by tokens on the whole files before and after.
      const guard = await guardTree(git, head, applied.tree);
      if (guard) { fail("refused", guard); return; }
      for (const f of v.files) {
        const before = await git.file(head, f), after = await git.file(applied.tree, f);
        const why = !before.ok ? before.reason : !after.ok ? after.reason : formattingOnly(f, before.content, after.content);
        if (why) { fail("refused", why); return; }
      }
    }
    if (check) {
      const refusal = await check(v.patch);
      if (refusal !== null) { fail(refusal.startsWith("rejected:") ? "rejected" : "failed", refusal.replace(/^rejected: /, "")); return; }
    }
    // The model calls took minutes: read the PR again before writing.
    const now = await readPr(c);
    if (!now) { fail("failed", gone.get(c.number) ?? ""); return; }
    // A maintainer's changes request may have come in during the model calls; an unreadable answer counts as blocked.
    const blocked = await readGate(db, d.querier, ownerOf(repo), repo, c.number, log);
    if (blocked !== null) {
      const reason = blocked ?? "the PR's reviews could not be read";
      rec.set(c, kind, "skipped", reason, { files: v.files });
      summary.skipped.push(ref);
      log(`  ${ref}: skipped: ${reason}`);
      return;
    }
    const g = await guard(db, { repo, number: c.number }, c.lint ? { kind: "lint", bucket: "cifix", head: c.head, source: "review" } : { kind: "cifix", bucket: kind === "format" ? "collect" : "work", head: c.head }, params.by ?? CLI_BY, liveOf(db, d.querier));
    if ("refused" in g) {
      // Nothing is recorded: the head is tried again once the refusal's reason is gone.
      summary.skipped.push(ref);
      log(`  ${ref}: skipped: ${g.refused}`);
      return;
    }
    // A model patch is stored and linted before it is pushed or posted (the collect step does that); a patch without a Rust file needs no lint.
    if (kind === "code" && folded === null) {
      // Checked here: the collect step has no excerpts to check against.
      const early = outsideShown(shown, await git.diffText(head, applied.tree));
      if (early) { fail("refused", early); return; }
      const round = c.lint ? c.lint.round + 1 : 1;
      const task = await queueLintFor(db, { step: "cifix", repo, number: c.number, head: c.head, base: now.baseRefOid ?? null, patch: v.patch });
      if (task !== null) {
        rec.linting(c, v.patch, v.files, task, "pending", round, ses.kept ? storeSessions({ "": ses.kept }, new Date(at())) : null);
        if (ses.kept) ledger.stored({ "": ses.kept });
        log(`  ${ref}: patch stored; lint task ${task} queued (round ${round})`);
        return;
      }
    }
    if (!canPush) {
      const shownPatch = folded ?? v.patch;
      const cm = await ghAskComment(gw, d.exec, "cifix-comment", g, deliveredNote, askText(checkName, shownPatch), { run: runId, head: c.head });
      if (cm.code !== 0) {
        // Not sent: nothing reached GitHub, so the step tries again after a backoff. Otherwise GitHub may have posted it.
        const reason = `the comment ${cm.sent === false ? "was not sent" : "failed"}: ${scrubReason(oneLine(cm.stderr), d.root)}`;
        // A patch that needed no lint task is stored in place of any earlier round's, so the retry posts it without new model work.
        if (cm.sent === false && kind === "code" && folded === null) rec.linting(c, v.patch, v.files, null, "pending", c.lint ? c.lint.round + 1 : 1, null);
        rec.set(c, kind, cm.sent === false ? "comment-unsent" : "comment-failed", reason, { files: v.files });
        summary.failed.push({ ref, reason });
        log(`  ${ref}: ${reason}`);
        return;
      }
      rec.set(c, kind, "asked", null, { files: v.files });
      summary.asked.push(ref);
      log(`  ${ref}: posted the patch as a comment at ${short(c.head)}`);
      return;
    }
    const who = await (whoP ??= whoAmI(d.exec));
    const author = await commitIdentity(db, repo, async () => who);
    const commit = await git.commit(applied.tree, head, commitMessage(kind, v.files), { name: author.name, email: author.email });
    const changes = await git.rawChanges(head, commit);
    const touched = changes.map((x) => x[3]!).sort().join("\n");
    if (changes.some((x) => x[2] !== "M" || x[0] !== x[1] || (x[0] !== "100644" && x[0] !== "100755")) || touched !== [...v.files].sort().join("\n")) {
      fail("refused", "the commit would change files or modes outside the validated diff");
      return;
    }
    const outside = outsideShown(shown, await git.diffText(head, commit));
    if (outside) { fail("refused", outside); return; }
    rec.pushing(c, kind, commit, v.files);
    const push = await pushBranch(gw, git, "cifix-push", g, { remote: pr.headRepository!.nameWithOwner, branch: pr.headRefName, sha: commit }, { run: runId, from: head, to: commit, files: v.files, changed: v.changed, kind });
    if (push.code !== 0) {
      const err = oneLine(push.stderr);
      if (/stale info|rejected|fetch first/i.test(err)) fail("refused", "the branch moved since the checks ran");
      else if (/denied|403|permission|not allowed|protected branch|declined|GH013/i.test(err)) {
        rec.set(c, kind, "push-denied", HOLD_CANNOT_PUSH, { files: v.files });
        summary.held.push({ ref, reason: HOLD_CANNOT_PUSH });
        log(`  ${ref}: held: ${HOLD_CANNOT_PUSH}`);
      } else fail("failed", `push failed: ${err}`);
      return;
    }
    rec.set(c, kind, "pushed", null, { files: v.files, toHead: commit });
    summary.pushed.push(ref);
    log(`  ${ref}: pushed ${short(commit)} on ${short(head)}: ${v.files.join(", ")}`);
    const cm = await ghComment(gw, g, d.exec, "cifix-comment", { repo, number: c.number, pr: true }, kind === "format" ? { by: "fixed" } : deliveredNote, commentText(v.files), { run: runId });
    if (cm.code !== 0) log(`  ${ref}: comment failed: ${oneLine(cm.stderr)}`);
  };

  /** The formatter task ended: its diff, if any, is validated and delivered. Every exit records a state, which closes the `formatting` row. */
  const collectFormat = async (c: CifixCandidate, taskId: number): Promise<void> => {
    const ref = refOf(c);
    const scripts = await buildScriptsAt(git, c.head);
    const t = getTask(db, taskId);
    const fail = (state: "failed" | "refused", reason: string) => { rec.set(c, "format", state, reason); summary.failed.push({ ref, reason }); log(`  ${ref}: ${state}: ${reason}`); };
    if (!t || t.state !== "done") { fail("failed", `the formatter task ${t?.state ?? "is gone"}`); return; }
    // The files the formatter was told to format: the PR's files that the log's `Diff in` lines name.
    const row = db.prepare("SELECT files FROM ci_fixes WHERE repo = ? AND number = ? AND head = ? AND state = 'formatting'").get(c.repo, c.number, c.head) as { files: string | null } | undefined;
    const allowed = JSON.parse(row?.files ?? "[]") as string[];
    const art = db.prepare("SELECT file FROM build_artifacts WHERE task_id = ? AND name = ?").get(taskId, FORMAT_ARTIFACT) as { file: string } | undefined;
    const path = art ? absolute(art.file) : null;
    if (!path) { fail("failed", "the formatter changed nothing, so the failure is not formatting"); return; }
    const text = gitFormatDiff(readFileSync(path, "utf8"));
    const v = validatePatch(text, allowed, (x) => editable(x, scripts));
    if (!v.ok) { fail("refused", v.reason); return; }
    const pr = await readPr(c);
    if (!pr) { fail("failed", gone.get(c.number) ?? ""); return; }
    params.onHandled?.(++handled);
    await deliver(c, "format", pr, v, "format", undefined);
  };

  /** Sonnet patches the code from the log, Opus checks the patch. */
  /** The CI fix starts work on the PR (a model patch or a formatter run): the pipeline's account is assigned when nobody is. */
  const claim = async (c: CifixCandidate): Promise<void> => {
    if (duplicateHeld(db, repo, c.number)) { log(`  ${repo}#${c.number}: not assigned: held`); return; }
    const by = params.by ?? CLI_BY;
    const g = [guardRepo(db, repo, "push", by), guardRepo(db, repo, "comment", by)].find((x) => !("refused" in x));
    if (g && !("refused" in g)) await claimForWork({ db, login: ACTOR }, g, d.querier, repo, c.number, "pr", () => pipelineMe(log, d.exec), { run: runId }, log);
  };
  const fixCode = async (c: CifixCandidate, pr: PrNode, failure: CiFailure, previous?: LintPrevious, ses: SessionAsk = {}): Promise<void> => {
    const ref = refOf(c);
    await claim(c);
    const fail = (state: "failed" | "refused", raw: string) => {
      const reason = scrubReason(raw, d.root);
      rec.set(c, "code", state, reason);
      summary.failed.push({ ref, reason });
      log(`  ${ref}: ${state}: ${reason}`);
    };
    const head = await git.fetchPr(ownerOf(repo), repo, c.number);
    if (head !== c.head) { noteLive(db, repo, c.number, { ...pr, headRefOid: head }, at()); fail("failed", `fetched head ${short(head)} is not the checked ${short(c.head)}`); return; }
    const diff = await cachedDiff(repo, c.number, head, d.fetchDiff);
    if (!diff.ok) { fail("failed", `no diff: ${oneLine(diff.error)}`); return; }
    if (diff.text.length > DIFF_CAP) { fail("failed", `the PR diff is over the ${DIFF_CAP} character limit`); return; }
    const made = await patchFromFailure(db, d, { git, ref, title: ((db.prepare("SELECT title FROM items WHERE repo = ? AND number = ?").get(repo, c.number) as { title: string | null } | undefined)?.title ?? "").slice(0, 300),
      repo, number: c.number, head, base: pr.baseRefOid ?? null, round: c.attempt, failure, diffText: diff.text, ...(previous ? { previous } : {}), session: ses, runId, actor: ACTOR, at, checkout: async () => d.checkout?.(repo, c.number, head) });
    ledger.hold(ses.kept);
    if (c.lint) dropSessions(c.lint.session, ses.kept ? { "": ses.kept } : {});
    if (!made.ok) { fail(made.state, made.reason); return; }
    const { v, shown, names, check } = made;
    await deliver(c, "code", pr, v, names[0] ?? "CI", check, shown, null, ses);
  };

  /**
   * A stored patch whose lint task ended: clean, the patch with the format changes folded in is pushed (or posted); with
   * findings, the model is asked again with them, up to LINT_MAX_ROUNDS lint rounds; a lost task is queued once more.
   */
  const collectLint = async (c: CifixCandidate): Promise<void> => {
    const ref = refOf(c);
    const w = c.lint!;
    const scripts = await buildScriptsAt(git, c.head);
    const fail = (state: "failed" | "refused" | "rejected", raw: string) => {
      const reason = scrubReason(raw, d.root);
      rec.set(c, "code", state, reason, { files: w.files });
      summary.failed.push({ ref, reason });
      log(`  ${ref}: ${state}: ${reason}`);
    };
    if (w.task === null) {
      // Kept when its comment did not reach GitHub (no Rust file, so no lint task): posted again as it is.
      const pr = await readPr(c);
      if (!pr) return;
      params.onHandled?.(++handled);
      const v = validatePatch(w.patch, w.files, (x) => editable(x, scripts));
      if (!v.ok) { fail("refused", v.reason); return; }
      await deliver(c, "code", pr, v, "CI", undefined, [], w.patch);
      return;
    }
    const res = readLint(db, w.task);
    if (res.kind === "pending") { log(`  ${ref}: the lint task is still running`); return; }
    const pr = await readPr(c);
    if (!pr) return;
    params.onHandled?.(++handled);
    if (res.kind === "infra-failed") {
      const again = w.state === "requeued" ? null : await queueLintFor(db, { step: "cifix", repo, number: c.number, head: c.head, base: pr.baseRefOid ?? null, patch: w.patch });
      if (again === null) { fail("failed", `lint: ${res.reason}`); return; }
      rec.linting(c, w.patch, w.files, again, "requeued", w.round, w.session, w.servingMetadata ?? null);
      log(`  ${ref}: lint task failed (${res.reason}); queued again as task ${again}`);
      return;
    }
    const verdict = lintVerdict(res.findings, w.round);
    if (verdict.action === "clean" || verdict.action === "push") {
      dropSessions(w.session);
      const testsNote = testsNoteOf(verdict, res.testsNote);
      if (testsNote) jobItem(db, repo, c.number, testsNote, log);
      const fold = await foldFormat(git, c.head, w.patch, res.formatDiff ?? "", d.root);
      if (!fold.ok) { fail("refused", fold.reason); return; }
      const v = validatePatch(w.patch, w.files, (x) => editable(x, scripts));
      if (!v.ok) { fail("refused", v.reason); return; }
      await deliver(c, "code", pr, v, "CI", undefined, [], fold.patch);
      return;
    }
    if (verdict.action === "fail") { fail("rejected", `${findingsWord(res.findings)} remain after ${w.round} rounds: ${oneLine(verdict.first.message)}`); return; }
    const reading = await readFailure(d.gh, repo, c.head, optionalChecks(db, repo));
    if (reading.kind === "skip") { fail("failed", reading.why); return; }
    const findings = verdict.texts;
    await fixCode(c, pr, reading.failure, { patch: w.patch, findings }, sessionAsk(w.session, "", findings, new Date(at())));
  };

  const workOne = async (c: CifixCandidate): Promise<void> => {
    const ref = refOf(c);
    try {
      const pr = await readPr(c);
      if (!pr) return;
      // A PR that only waits for rerun results is not counted as handled (it does not use the step's limit).
      const handle = () => params.onHandled?.(++handled);
      const reading = await readFailure(d.gh, repo, c.head, optionalChecks(db, repo));
      const skip = (why: string) => { rec.set(c, "code", "skipped", why); summary.skipped.push(ref); log(`  ${ref}: skipped: ${why}`); };
      if (reading.kind === "skip") { handle(); skip(reading.why); return; }
      const failure = reading.failure;
      const t = triage(failure);
      log(`  ${ref}: ${t.kind}: ${t.why}`);
      if (t.kind === "skip") { handle(); skip(t.why); return; }
      if (t.kind !== "infra" || !c.rerun) handle();
      if (t.kind === "unreadable") { rec.set(c, "code", "failed", t.why); summary.failed.push({ ref, reason: t.why }); return; }
      if (t.kind === "infra") {
        if (c.rerun) {
          // Only results from after the rerun can say it failed again; older ones are what the rerun was meant to replace.
          const fresh = failure.checks.every((x) => !!x.completedAt && !!c.rerunAt && Date.parse(x.completedAt) > Date.parse(c.rerunAt));
          if (!fresh) {
            const waited = !c.rerunAt || Date.parse(at()) > Date.parse(c.rerunAt) + RERUN_WAIT_MS;
            if (!waited) { log(`  ${ref}: waiting: the checks were not rerun yet`); return; }
            handle();
            const reason = "the rerun produced no new check results";
            rec.set(c, "infra", "failed", reason);
            summary.failed.push({ ref, reason });
            return;
          }
          handle();
          const reason = "the failure looks like an infrastructure error again after the rerun";
          rec.set(c, "infra", "failed", reason);
          summary.failed.push({ ref, reason });
          return;
        }
        rec.set(c, "infra", "infra", t.why, { runs: [...new Set(failure.checks.flatMap((x) => (x.runId === null ? [] : [x.runId])))] });
        summary.infra.push(ref);
        return;
      }
      if (t.kind === "format") {
        // Only files that are in both the PR's diff and the log's `Diff in` lines are formatted.
        const diff = await cachedDiff(repo, c.number, c.head, d.fetchDiff);
        if (!diff.ok) { rec.set(c, "format", "failed", `no diff: ${oneLine(diff.error)}`); summary.failed.push({ ref, reason: "no diff" }); return; }
        const prFiles = [...diff.text.matchAll(DIFF_FILE)].map((m) => m[1]!);
        const names = matchPrFiles(formatDiffPaths(failure), prFiles).filter((p) => editable(p) && !TEST_PATH.test(p));
        if (!names.length || names.length > FORMAT_FILES_MAX) {
          const reason = names.length ? `the formatter failure names ${names.length} of the PR's files` : "the formatter failure is in files the PR does not change";
          rec.set(c, "format", "refused", reason);
          summary.failed.push({ ref, reason });
          log(`  ${ref}: refused: ${reason}`);
          return;
        }
        // The build environment (packages, env) is read from the PR's base commit, never from the PR's own workflow.
        const base = (await d.gh(["api", `repos/${slugOf(repo)}/pulls/${c.number}`, "--jq", ".base.sha"])).trim();
        if (!/^[0-9a-f]{40}$/.test(base)) { rec.set(c, "format", "failed", "no base commit for the build environment"); summary.failed.push({ ref, reason: "no base commit" }); return; }
        await claim(c);
        const id = createTask(db, {
          step: "cifix", repo, number: c.number, headSha: c.head, baseSha: base, requires: { os: "linux", toolchains: ["rust-stable"] }, warm: { key: warmKeyOf(repo), role: "use" },
          plan: [{ name: "format", cmd: ["sh", "-c", FORMAT_SCRIPT, "format", ...names], network: "none", timeoutSec: 600, bare: true, artifacts: [FORMAT_ARTIFACT] }],
        });
        rec.set(c, "format", "formatting", null, { task: id, files: names });
        summary.queued.push(ref);
        log(`  ${ref}: formatter task ${id} queued for ${names.join(", ")}`);
        return;
      }
      if (pushesUnsettled(db, repo, log)) return;
      await fixCode(c, pr, failure);
    } catch (e) {
      if (isHalt(e)) throw e;
      const reason = scrubReason(oneLine(String((e as Error).message ?? e)), d.root);
      rec.set(c, "code", "failed", reason);
      summary.failed.push({ ref, reason });
      log(`  ${ref}: failed: ${reason}`);
    }
  };

  if (collect.length || work.length) mkdirSync(d.root, { recursive: true });
  for (const c of sel.capped) {
    const reason = `the PR's limit of ${MAX_PUSHES_PER_PR} pushed CI fixes or ${MAX_TRIES_PER_PR} tries is used`;
    rec.set(c, "code", "capped", reason);
    log(`  ${refOf(c)}: ${reason}`);
  }
  let stopLogged = false;
  const stopped = (): boolean => {
    if (!params.stopping?.()) return false;
    if (!stopLogged) { stopLogged = true; log(`cifix ${repo}: stopping, no new PRs started`); }
    return true;
  };
  /** Runs the items as a pool that starts one more only while the model queue has room; each takes its lease and gives it back. */
  const each = async <T>(items: T[], numberOf: (x: T) => number, run: (x: T) => Promise<void>): Promise<void> => {
    await pool(items.map((x) => async () => {
      if (stopped()) return;
      const release = leaseItem(db, `pr:${repo}#${numberOf(x)}`, log);
      if (!release) return;
      try { await run(x); } finally { release(); }
    }), () => queueRoom(db), { max: POOL_MAX.cifix });
  };
  // A fix capped or given up at this head: one comment naming the failing checks, then the PR waits on the contributor.
  for (const c of sel.ask) {
    if (stopped()) break;
    const ref = refOf(c);
    const release = leaseItem(db, `pr:${repo}#${c.number}`, log);
    if (!release) continue;
    try {
      const reading = await readFailure(d.gh, repo, c.head, optionalChecks(db, repo));
      if (reading.kind === "skip") { rec.set(c, "code", "skipped", reading.why); summary.skipped.push(ref); log(`  ${ref}: skipped: ${reading.why}`); continue; }
      // A maintainer's changes request is the person's to resolve first; an unreadable answer counts as blocked.
      const blocked = await readGate(db, d.querier, ownerOf(repo), repo, c.number, log);
      if (blocked !== null) { const why = blocked ?? "the PR's reviews could not be read"; rec.set(c, "code", "skipped", why); summary.skipped.push(ref); log(`  ${ref}: skipped: ${why}`); continue; }
      const g = await guard(db, { repo, number: c.number }, { kind: "cifix", bucket: "ask", head: c.head }, params.by ?? CLI_BY, liveOf(db, d.querier));
      if ("refused" in g) { summary.skipped.push(ref); log(`  ${ref}: skipped: ${g.refused}`); continue; }
      const cm = await ghAskComment(gw, d.exec, "cifix-comment", g, { by: "fixed" }, askCiText(reading.failure.checks.map((x) => x.name)), { run: runId, head: c.head });
      if (cm.code !== 0) {
        const reason = `the comment ${cm.sent === false ? "was not sent" : "failed"}: ${scrubReason(oneLine(cm.stderr), d.root)}`;
        rec.set(c, "code", cm.sent === false ? "comment-unsent" : "comment-failed", reason);
        summary.failed.push({ ref, reason });
        log(`  ${ref}: ${reason}`);
        continue;
      }
      rec.set(c, "code", "asked", "the CI fix is left to the contributor");
      summary.asked.push(ref);
      log(`  ${ref}: asked the contributor about the failing CI at ${short(c.head)}`);
    } catch (e) {
      log(`  ${ref}: not asked: ${scrubReason(oneLine(String((e as Error).message ?? e)), d.root)}`);
    } finally { release(); }
  }
  await each(collect, (x) => x.c.number, async (x) => {
    try { await collectFormat(x.c, x.task); }
    catch (e) {
      if (isHalt(e)) throw e;
      const reason = scrubReason(oneLine(String((e as Error).message ?? e)), d.root);
      rec.set(x.c, "format", "failed", reason);
      summary.failed.push({ ref: refOf(x.c), reason });
    }
  });
  await each(sel.lint, (c) => c.number, async (c) => {
    try { await collectLint(c); }
    catch (e) {
      if (isHalt(e)) throw e;
      const reason = scrubReason(oneLine(String((e as Error).message ?? e)), d.root);
      rec.set(c, "code", "failed", reason);
      summary.failed.push({ ref: refOf(c), reason });
    }
  });
  await each(work, (c) => c.number, workOne);
  log(`cifix ${repo}: ${summary.pushed.length} pushed, ${summary.asked.length} commented, ${summary.queued.length} formatter runs queued, ${summary.infra.length} infra, ${summary.skipped.length} skipped, ${summary.failed.length} failed, ${summary.held.length} held; run ${runId}`);
  return summary;
}

export type RerunSummary = { repo: string; reran: string[]; skipped: string[] };

/** Reruns the failed jobs of every PR whose failure was triaged as infrastructure: once per head. */
export async function runRerun(db: DatabaseSync, params: CifixParams, log: (line: string) => void = console.log, deps?: Pick<CifixDeps, "querier" | "exec" | "now">): Promise<RerunSummary> {
  const { repo } = params;
  const dryRun = params.dryRun ?? true;
  const out: RerunSummary = { repo, reran: [], skipped: [] };
  const due = selectCifix(db, repo).rerun;
  const picks = params.limit === undefined ? due : due.slice(0, params.limit);
  log(`cifix-rerun ${repo}: ${due.length} heads due a rerun`);
  if (dryRun) {
    for (const x of picks) log(`  would rerun the failed jobs of ${refOf(x.c)} at ${short(x.c.head)}`);
    return out;
  }
  const d = deps ?? defaultDeps();
  const w: Writer = { db, login: RERUN_ACTOR };
  let n = 0;
  for (const { c, runs } of picks) {
    if (params.stopping?.()) { log(`cifix-rerun ${repo}: stopping, no new PRs started`); break; }
    const ref = refOf(c);
    const release = leaseItem(db, `pr:${repo}#${c.number}`, log);
    if (!release) continue;
    try {
      const r = await d.querier.query(PR_QUERY, { owner: ownerOf(repo), name: repo, n: c.number }) as { repository?: { pullRequest?: PrNode | null } };
      const pr = r.repository?.pullRequest;
      noteLive(db, repo, c.number, pr, d.now().toISOString());
      if (!pr || pr.state !== "OPEN" || pr.isDraft || pr.headRefOid !== c.head) { log(`  ${ref}: skipped: closed, a draft or at another head`); out.skipped.push(ref); continue; }
      const g = await guard(db, { repo, number: c.number }, { kind: "cifix", bucket: "rerun", head: c.head }, params.by ?? CLI_BY);
      if ("refused" in g) { log(`  ${ref}: skipped: ${g.refused}`); out.skipped.push(ref); continue; }
      params.onHandled?.(++n);
      // Recorded before the calls: one rerun per head, even if this process dies in the middle of them.
      db.prepare("INSERT INTO ci_fixes (repo, number, head, kind, state, reason, files, attempt, runs, created_at) VALUES (?, ?, ?, 'infra', 'rerunning', NULL, '[]', 0, ?, ?)")
        .run(repo, c.number, c.head, JSON.stringify(runs), d.now().toISOString());
      const errors: string[] = [];
      for (const run of runs) {
        const res = await ghRerunFailed(w, d.exec, g, run, { head: c.head });
        if (res.code !== 0) errors.push(oneLine(res.stderr || res.stdout));
      }
      // One rerun per head, whether or not GitHub took every run.
      db.prepare("UPDATE ci_fixes SET state = 'rerun', reason = ? WHERE repo = ? AND number = ? AND head = ? AND state = 'rerunning'")
        .run(errors.length ? errors[0]!.slice(0, 200) : null, repo, c.number, c.head);
      out.reran.push(ref);
      log(`  ${ref}: reran ${runs.length} runs${errors.length ? ` (${errors.length} refused)` : ""}`);
    } catch (e) {
      log(`  ${ref}: not rerun: ${oneLine(String((e as Error).message ?? e))}`);
    } finally { release(); }
  }
  return out;
}

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
  cifix: {
    summary: "cifix --repo R [--limit N] [--apply]: read the failing gate check of taken PRs and fix it (formatter run, patch checked by Opus, or the patch as a comment); dry run unless --apply",
    async run(args: string[]): Promise<void> {
      const f = parseArgs(args);
      await runCifix(connect(), { repo: f.repo, limit: f.limit, dryRun: !f.apply });
    },
  },
  "cifix-rerun": {
    summary: "cifix-rerun --repo R [--limit N] [--apply]: rerun the failed jobs once per head where the failure looks like an infrastructure error; dry run unless --apply",
    async run(args: string[]): Promise<void> {
      const f = parseArgs(args);
      await runRerun(connect(), { repo: f.repo, limit: f.limit, dryRun: !f.apply });
    },
  },
};
