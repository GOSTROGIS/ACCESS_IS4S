// Lint before push: one build task runs rustfmt on the files a model-written Rust patch changes and clippy on the patched
// tree. The formatter's changes are folded into the patch; clippy diagnostics on lines the patch added or changed go back to the model.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { TaskStep } from "../../web/src/api/types.ts";
import { absolute } from "../build/artifacts.ts";
import { createTask, getTask, warmKeyOf, type Warm } from "../build/tasks.ts";
import { FORMAT_ARTIFACT, FORMAT_SCRIPT, gitFormatDiff } from "../cifix/index.ts";
import { formattingOnly } from "../cifix/guard.ts";
import type { Git } from "../fixup/git.ts";
import { rustPlan } from "../worker/rust.ts";
import { ghCrates, type CratesFetcher } from "../verify/crates.ts";
import { classifyTests, testFindings, testsFeatureCrates, testsStep, TESTS_ARTIFACT, TESTS_EXIT_ARTIFACT, TESTS_RERUN_ARTIFACT, TESTS_RERUN_EXIT_ARTIFACT, TESTS_STEP } from "./tests.ts";

export const CLIPPY_ARTIFACT = "clippy.txt";
export const CLIPPY_ERR_ARTIFACT = "clippy-err.txt";
/** The most files one formatter step names. */
export const LINT_FILES_MAX = 40;
/** Characters of one diagnostic's rendered text kept for the model. */
const RENDERED_CAP = 2000;

// The step ends in `true`: clippy exits non-zero on findings, and the artifacts must come back either way.
const CLIPPY_SCRIPT = `cargo clippy --offline --locked --workspace --all-targets --message-format=json -- -D warnings > /out/${CLIPPY_ARTIFACT} 2> /out/${CLIPPY_ERR_ARTIFACT}; true`;

/** The paths of the patch's `.rs` files, new side (deleted files excluded). */
export function changedRsFiles(patch: string): string[] {
  return [...new Set(patchLines(patch).keys())].filter((p) => p.endsWith(".rs"));
}

/** Fetch, rustfmt on the named files (diff artifact), clippy (JSON artifact), and the tests of `crates` when given. null when the patch changes no `.rs` file. */
export function lintPlan(changedRs: string[], crates?: string[]): TaskStep[] | null {
  const files = [...new Set(changedRs.filter((f) => f.endsWith(".rs")))];
  if (!files.length) return null;
  const [fetch] = rustPlan({ test: false });
  return [fetch!, ...lintSteps(files), ...(crates?.length ? [testsStep(crates)] : [])];
}

/** The formatter and clippy steps alone, for a task that fetched and built already (fix issue's round task). */
export function lintSteps(files: string[]): TaskStep[] {
  const named = [...new Set(files.filter((f) => f.endsWith(".rs")))].slice(0, LINT_FILES_MAX);
  return [
    { name: "format", cmd: ["sh", "-c", FORMAT_SCRIPT, "format", ...named], network: "none", timeoutSec: 600, bare: true, artifacts: [FORMAT_ARTIFACT, FORMAT_ERR_ARTIFACT] },
    { name: "clippy", cmd: ["sh", "-c", CLIPPY_SCRIPT], network: "none", timeoutSec: 3600, artifacts: [CLIPPY_ARTIFACT, CLIPPY_ERR_ARTIFACT] },
  ];
}

export type LintJob = {
  /** The pipeline step that queues it (fixup, cifix, fixissue). */
  step: string; repo: string; number: number | null; head: string;
  /** The default-branch commit the task takes its CI gate from; null runs it in the stock image. */
  base: string | null;
  /** The model's patch, applied to the checkout before the plan runs. Without one the head is linted as it is, and `files` names what to format. */
  patch?: string;
  files?: string[];
  /** Default: the repo's key, role `use`, as the fix-issue rounds do. */
  warm?: Warm;
  /** Crates whose tests run after clippy (Tests before push); queueLintFor fills it. */
  crates?: string[];
};

/** Queues the lint task for the patch; null when it changes no `.rs` file. */
export function queueLint(db: DatabaseSync, j: LintJob): number | null {
  const plan = lintPlan(j.files ?? changedRsFiles(j.patch ?? ""), j.crates);
  if (!plan) return null;
  return createTask(db, {
    step: j.step, repo: j.repo, number: j.number, headSha: j.head, baseSha: j.base, requires: { os: "linux", toolchains: ["rust-stable"] },
    warm: j.warm ?? { key: warmKeyOf(j.repo), role: "use" }, plan, ...(j.patch ? { patch: j.patch } : {}),
  });
}

/** queueLint, with the affected crates' tests added when Tests before push is on for the repo. Off: no crate lookup, today's plan. */
export async function queueLintFor(db: DatabaseSync, j: LintJob, fetch: CratesFetcher = ghCrates): Promise<number | null> {
  const crates = await testsFeatureCrates(db, j, fetch);
  return queueLint(db, crates ? { ...j, crates } : j);
}

export type Finding = { level: "warning" | "error"; code: string | null; message: string; file: string; line: number; rendered: string };
export type LintRead = { kind: "pending" } | { kind: "infra-failed"; reason: string } | { kind: "result"; formatDiff: string | null; findings: Finding[]; /** Why the tests gave no verdict (timeout, flake, environment); never blocks the push. */ testsNote?: string };

/** Lines each file's patch adds or changes, by new-side line number. */
export function patchLines(patch: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  let set: Set<number> | null = null, at = 0;
  for (const l of patch.split("\n")) {
    const f = /^\+\+\+ (?:b\/)?(\S+)/.exec(l);
    if (f) { set = f[1] === "/dev/null" ? null : (out.get(f[1]!) ?? out.set(f[1]!, new Set()).get(f[1]!)!); continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) { at = Number(h[1]); continue; }
    if (!set || l.startsWith("--- ") || l.startsWith("diff ") || l.startsWith("\\")) continue;
    if (l.startsWith("+")) set.add(at++);
    else if (l.startsWith(" ")) at++;
  }
  return out;
}

type Span = { file_name: string; line_start: number; line_end: number; is_primary: boolean };
type Message = { level?: string; message?: string; code?: { code?: string } | null; spans?: Span[]; rendered?: string };

const trimRendered = (s: string): string => s.trim().slice(0, RENDERED_CAP);

/**
 * The diagnostics of clippy's JSON lines that belong to the patch: a primary span touching an added line, or a compile
 * error (no code, or an E-code) anywhere, since the patch broke the build. A failed build with no diagnostic at all is one finding
 * made of cargo's own output.
 */
export function findingsOf(jsonLines: string, stderr: string, patch: string): Finding[] {
  const lines = patchLines(patch);
  const touched = (file: string, a: number, b: number): boolean => {
    for (const [p, set] of lines) if (p === file || file.endsWith(`/${p}`) || p.endsWith(`/${file}`)) for (let n = a; n <= b; n++) if (set.has(n)) return true;
    return false;
  };
  const out: Finding[] = [];
  let finished: boolean | null = null, diagnostics = 0;
  for (const raw of jsonLines.split("\n")) {
    if (!raw.startsWith("{")) continue;
    let o: { reason?: string; success?: boolean; message?: Message };
    try { o = JSON.parse(raw); } catch { continue; }
    if (o.reason === "build-finished") finished = o.success === true;
    if (o.reason !== "compiler-message" || !o.message) continue;
    const m = o.message;
    if (m.level !== "warning" && m.level !== "error") continue;
    const span = m.spans?.find((s) => s.is_primary);
    if (!span) continue;
    diagnostics++;
    const code = m.code?.code ?? null;
    // Under -D warnings a rustc lint (unused_imports, dead_code) is an error too, but it counts only on touched lines; a compile error has no code or an E0000 code.
    const compileError = m.level === "error" && (code === null || /^E\d{4}$/.test(code));
    if (!compileError && !touched(span.file_name, span.line_start, span.line_end)) continue;
    out.push({ level: m.level, code, message: m.message ?? "", file: span.file_name, line: span.line_start, rendered: trimRendered(m.rendered ?? m.message ?? "") });
  }
  if (!out.length && !diagnostics && finished !== true) {
    const text = trimRendered(stderr) || "cargo clippy failed without output";
    out.push({ level: "error", code: null, message: "cargo clippy failed", file: "", line: 0, rendered: text });
  }
  return out;
}

/** Where the formatter's per-file failures (rustfmt could not parse a file) are listed, one `@@ <path>` line before each file's output. */
export const FORMAT_ERR_ARTIFACT = "fmt-err.txt";

/** One finding per file rustfmt failed on: the patch broke the file's syntax. */
export function formatErrorFindings(text: string): Finding[] {
  const out: Finding[] = [];
  let cur: { file: string; body: string[] } | null = null;
  const flush = () => { if (cur) out.push({ level: "error", code: null, message: "rustfmt failed", file: cur.file, line: 0, rendered: trimRendered(cur.body.join("\n")) || "rustfmt failed" }); };
  for (const l of text.split("\n")) {
    if (l.startsWith("@@ ")) { flush(); cur = { file: l.slice(3).trim(), body: [] }; } else cur?.body.push(l);
  }
  flush();
  return out;
}

export const artifactText = (db: DatabaseSync, taskId: number, name: string): string | null => {
  const row = db.prepare("SELECT file FROM build_artifacts WHERE task_id = ? AND name = ?").get(taskId, name) as { file: string } | undefined;
  const path = row ? absolute(row.file) : null;
  return path ? readFileSync(path, "utf8") : null;
};

/** The lint task's state, and once it is done the formatter diff (git format) and the findings on the patch's own lines. */
export function readLint(db: DatabaseSync, taskId: number, o: { /** A diff whose added lines count; default: the task's own patch. */ against?: string } = {}): LintRead {
  const t = getTask(db, taskId);
  if (!t) return { kind: "infra-failed", reason: "the lint task is gone" };
  if (t.state === "queued" || t.state === "claimed" || t.state === "running") return { kind: "pending" };
  // A tests step that timed out fails the task, but everything before it finished: its output is read as an inconclusive test run.
  const testsTimedOut = t.state === "failed" && t.plan.some((p) => p.name === TESTS_STEP) && t.results.some((r) => r.step === TESTS_STEP && r.timedOut) && t.results.filter((r) => r.step !== TESTS_STEP).every((r) => r.exitCode === 0 && !r.timedOut);
  if (t.state !== "done" && !testsTimedOut) return { kind: "infra-failed", reason: `the lint task ${t.state}${t.summary ? `: ${t.summary.slice(0, 200)}` : ""}` };
  const patch = (db.prepare("SELECT patch FROM build_tasks WHERE id = ?").get(taskId) as { patch: string | null } | undefined)?.patch ?? "";
  const fmt = artifactText(db, taskId, FORMAT_ARTIFACT);
  const clippy = artifactText(db, taskId, CLIPPY_ARTIFACT);
  if (clippy === null) return { kind: "infra-failed", reason: "the lint task returned no clippy output" };
  const findings = [...formatErrorFindings(artifactText(db, taskId, FORMAT_ERR_ARTIFACT) ?? ""), ...findingsOf(clippy, artifactText(db, taskId, CLIPPY_ERR_ARTIFACT) ?? "", o.against ?? patch)];
  let testsNote: string | undefined;
  if (t.plan.some((p) => p.name === TESTS_STEP)) {
    const num = (name: string): number | null => { const v = artifactText(db, taskId, name); const n = v === null ? NaN : Number(v.trim()); return Number.isInteger(n) ? n : null; };
    const c = classifyTests({ text: artifactText(db, taskId, TESTS_ARTIFACT), exit: num(TESTS_EXIT_ARTIFACT), rerunText: artifactText(db, taskId, TESTS_RERUN_ARTIFACT), rerunExit: num(TESTS_RERUN_EXIT_ARTIFACT), timedOut: testsTimedOut });
    if (c.kind === "failed") findings.push(...testFindings(c));
    else if (c.kind === "inconclusive") testsNote = c.note;
  }
  return { kind: "result", formatDiff: fmt && fmt.trim() ? gitFormatDiff(fmt) : null, findings, ...(testsNote ? { testsNote } : {}) };
}

export type Fold = { ok: true; patch: string } | { ok: false; reason: string };

/**
 * The two sides of a file's diff, hunk bodies only, joined. Every line git could act on outside a hunk is refused: text
 * before the first file header, a header that is not one file, and any section line other than its `---`/`+++` pair
 * (index, mode, rename and binary lines).
 */
function sides(diff: string): Map<string, { before: string[]; after: string[] }> | string {
  const out = new Map<string, { before: string[]; after: string[] }>();
  let cur: { before: string[]; after: string[] } | null = null, path = "", inHunk = false;
  for (const l of diff.replace(/\n+$/, "").split("\n")) {
    if (l.startsWith("diff ")) {
      const f = /^diff --git a\/(\S+) b\/\1$/.exec(l);
      if (!f) return `the formatter diff has a section header that is not one file: ${l.slice(0, 80)}`;
      // Every section is checked: a second section for a file would be applied unseen.
      if (out.has(f[1]!)) return `the formatter diff has two sections for ${f[1]}`;
      path = f[1]!; cur = { before: [], after: [] }; out.set(path, cur); inHunk = false; continue;
    }
    if (!cur) {
      if (l.trim()) return "the formatter diff has text before its first file header";
      continue;
    }
    if (l.startsWith("@@ ")) { inHunk = true; cur.before.push(""); cur.after.push(""); continue; }
    if (!inHunk) {
      if (l !== `--- a/${path}` && l !== `+++ b/${path}`) return `the formatter diff has a line outside a hunk in ${path}: ${l.slice(0, 80)}`;
      continue;
    }
    if (l === "" || l.startsWith("\\")) continue;
    if (l.startsWith("-")) cur.before.push(l.slice(1));
    else if (l.startsWith("+")) cur.after.push(l.slice(1));
    else if (l.startsWith(" ")) { cur.before.push(l.slice(1)); cur.after.push(l.slice(1)); }
    else return `the formatter diff has a line in a hunk of ${path} that is not a diff line: ${l.slice(0, 80)}`;
  }
  return out;
}

/**
 * The patch followed by the formatter's diff, which `git apply` applies in order to the same files. A first check on
 * the diff text alone: each file's formatter changes must be whitespace-only (by tokens) in its hunks. foldFormat
 * proves it on the files git actually writes.
 */
export function checkFormat(patch: string, formatDiff: string): Fold {
  if (!formatDiff.trim()) return { ok: true, patch };
  const allowed = new Set(changedRsFiles(patch));
  const secs = sides(formatDiff);
  if (typeof secs === "string") return { ok: false, reason: secs };
  for (const [path, s] of secs) {
    if (!allowed.has(path)) return { ok: false, reason: `the formatter changed ${path}, which the patch does not change` };
    const why = formattingOnly(path, s.before.join("\n"), s.after.join("\n"));
    if (why) return { ok: false, reason: why };
  }
  return { ok: true, patch: `${patch.replace(/\n*$/, "\n")}${formatDiff.replace(/\n*$/, "\n")}` };
}

/**
 * The patch with the formatter's changes folded in as ONE diff against `head`. The formatter diff comes from a build
 * worker and is not trusted to say what it does: the tree of the patch alone and the tree of the patch plus the
 * formatter diff are compared, and every file that differs must be one the patch changes, keep its mode, and have the
 * same Rust tokens in both.
 */
export async function foldFormat(git: Pick<Git, "applyToTree" | "diffText" | "rawChanges" | "file">, head: string, patch: string, formatDiff: string, scratchRoot: string): Promise<Fold> {
  const both = checkFormat(patch, formatDiff);
  if (!both.ok || !formatDiff.trim()) return both;
  mkdirSync(scratchRoot, { recursive: true });
  const scratch = mkdtempSync(join(scratchRoot, ".fold-"));
  try {
    const alone = await git.applyToTree(head, patch, join(scratch, "patch"));
    if (!alone.ok) return { ok: false, reason: alone.reason };
    const applied = await git.applyToTree(head, both.patch, join(scratch, "index"));
    if (!applied.ok) return { ok: false, reason: applied.reason };
    const allowed = new Set(changedRsFiles(patch));
    for (const [from, to, status, path] of await git.rawChanges(alone.tree, applied.tree)) {
      if (!allowed.has(path!)) return { ok: false, reason: `the formatter changed ${path}, which the patch does not change` };
      if (status !== "M" || from !== to) return { ok: false, reason: `the formatter diff changes more than the content of ${path}` };
      const before = await git.file(alone.tree, path!), after = await git.file(applied.tree, path!);
      const why = !before.ok ? before.reason : !after.ok ? after.reason : formattingOnly(path!, before.content, after.content);
      if (why) return { ok: false, reason: why };
    }
    return { ok: true, patch: await git.diffText(head, applied.tree) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
