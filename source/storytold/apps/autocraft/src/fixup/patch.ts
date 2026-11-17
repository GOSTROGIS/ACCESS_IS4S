// Validation of the unified diff a model returns for the fix-up step. Pure text
// checks; whether it applies is decided by `git apply --check` in index.ts.

import { cleanReason } from "../act/templates.ts";
import { isTrustPath } from "../core/trust-paths.ts";
import { joinPath, packageBuild } from "../core/cargo-manifest.ts";
import { QUOTE_WORDS } from "../replylint.ts";
import type { ShownFile } from "./excerpt.ts";
import { wholeReplyJson } from "../core/reply-json.ts";
import { rustTokens, rustTokenSpans } from "../cifix/guard.ts";

export const MAX_CHANGED_LINES = 300;

export type PatchCheck = { ok: true; patch: string; files: string[]; changed: number } | { ok: false; reason: string };

/** Paths a fix may touch: relative, inside the repo, no `..`, not under .git. */
export function safePath(p: string): boolean {
  if (!p || p.startsWith("/") || p.includes("\\") || p.includes("\0") || p.startsWith("-")) return false;
  return p.split("/").every((s) => s !== "" && s !== "." && s !== ".." && s.toLowerCase() !== ".git");
}

/** Files a fix-up may edit: Rust files and Markdown files outside hidden directories, other than the trust paths. */
export function fixupEditable(path: string, scripts: BuildScripts = null): boolean {
  if (editable(path, scripts)) return true;
  return path.toLowerCase().endsWith(".md") && !path.split("/").some((s) => s.startsWith(".")) && !trustPath(path, scripts);
}

/**
 * Files no model patch of any lane writes to: build scripts, CI workflows, cargo and tool configuration, files that
 * run on a contributor's or CI machine, files that instruct coding agents, git metadata files and unsafe paths.
 * Every model-patch lane (fix-up, CI fix, issue fix, operator fix-up, conflict resolution) refuses these.
 */
export function trustPath(path: string, scripts: BuildScripts = null): boolean {
  return !safePath(path) || isBuildScript(path, scripts) || isTrustPath(path);
}

/**
 * Files an operator's fix-up may edit: any file of the repository except the trust paths and the cargo manifests and
 * lockfile.
 */
export function operatorEditable(path: string, scripts: BuildScripts = null): boolean {
  const name = path.split("/").pop()!.toLowerCase();
  return !trustPath(path, scripts) && name !== "cargo.toml" && name !== "cargo.lock";
}

const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** True when `text` shares a run of QUOTE_WORDS consecutive words with `source`. */
export function quotesText(text: string, source: string): boolean {
  const w = words(text), v = words(source);
  if (w.length < QUOTE_WORDS || v.length < QUOTE_WORDS) return false;
  const runs = new Set<string>();
  for (let i = 0; i + QUOTE_WORDS <= v.length; i++) runs.add(v.slice(i, i + QUOTE_WORDS).join(" "));
  for (let i = 0; i + QUOTE_WORDS <= w.length; i++) if (runs.has(w.slice(i, i + QUOTE_WORDS).join(" "))) return true;
  return false;
}

/** The reply of an operator's fix-up splits at its last `CHANGES:` line into the diff and the model's numbered list of what it changed (items cleaned like any public reason, one line each, at most 8; an item that quotes the operator's `instructions` is dropped). */
export function splitChanges(text: string, instructions = ""): { diff: string; changes: string[] } {
  const t = text.replace(/\r\n/g, "\n");
  const i = t.search(/^CHANGES:[ \t]*$(?![\s\S]*^CHANGES:)/m);
  if (i < 0) return { diff: text, changes: [] };
  const changes = t.slice(i).split("\n").slice(1).map((l) => cleanReason(l.replace(/^\s*(?:\d+[.)]|[-*])\s*/, ""), 200) ?? "").filter((x) => x && !quotesText(x, instructions)).slice(0, 8);
  return { diff: t.slice(0, i).trimEnd(), changes };
}

/**
 * The build scripts of a checkout (paths Cargo runs at build time), or null when the checkout is unknown. With null every
 * file named `build.rs` counts as a build script.
 */
export type BuildScripts = ReadonlySet<string> | null;

export function isBuildScript(path: string, scripts: BuildScripts): boolean {
  if (scripts === null) return path.toLowerCase() === "build.rs" || path.toLowerCase().endsWith("/build.rs");
  return scripts.has(path);
}

/**
 * The build scripts Cargo runs in a checkout, from its file list and a reader of file contents: for every Cargo.toml with a
 * package, the path its `build` key names, `build.rs` beside it when the key is absent, nothing for `build = false`. A
 * manifest that does not parse, or whose `build` value is unclear, makes every Rust file of its crate outside `src/` a build script.
 */
export function buildScripts(files: string[], read: (path: string) => string | null): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    if (f !== "Cargo.toml" && !f.endsWith("/Cargo.toml")) continue;
    const toml = read(f);
    if (toml === null) continue;
    const b = packageBuild(toml);
    if (b === null || b === false) continue;
    const dir = f.slice(0, -"Cargo.toml".length).replace(/\/$/, "");
    if (b === "unreadable") {
      const pre = dir ? `${dir}/` : "";
      for (const g of files) if (g.startsWith(pre) && g.endsWith(".rs") && !g.startsWith(`${pre}src/`)) out.add(g);
      continue;
    }
    const p = joinPath(dir, b ?? "build.rs");
    if (p !== null) out.add(p);
  }
  return out;
}

/** The build scripts at commit `sha` of a bare repository; null when it can't be read (callers then refuse every build.rs). */
// A structural type, not Git itself: this file is part of the web build, which must not pull in the git module graph.
type TreeReader = {
  git(args: string[]): Promise<{ code: number | null; stdout: string }>;
  file(sha: string, path: string): Promise<{ ok: true; content: string } | { ok: false }>;
};

export async function buildScriptsAt(git: TreeReader, sha: string): Promise<BuildScripts> {
  const ls = await git.git(["ls-tree", "-r", "--name-only", sha]);
  if (ls.code !== 0) return null;
  const files = ls.stdout.split("\n").filter(Boolean);
  const tomls = files.filter((f) => f === "Cargo.toml" || f.endsWith("/Cargo.toml"));
  const text = new Map<string, string>();
  for (const f of tomls) {
    const r = await git.file(sha, f);
    if (r.ok) text.set(f, r.content);
    else return null;
  }
  return buildScripts(files, (p) => text.get(p) ?? null);
}

/** Source files an automated fix (a CI fix or an issue fix) may edit: Rust files other than the trust paths. */
export function editable(path: string, scripts: BuildScripts = null): boolean {
  return path.endsWith(".rs") && !trustPath(path, scripts);
}

/** The diff text without a surrounding Markdown fence or leading prose lines. */
export function extractDiff(text: string): string {
  let t = text.replace(/\r\n/g, "\n").trim();
  const fence = t.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  if (fence) t = fence[1]!;
  const i = t.search(/^diff --git /m);
  return i > 0 ? t.slice(i) : t;
}

/** Refusal reasons that only a wrong hunk header line count produces; recounting removes them, so rows with them are not tries. */
export const FORMAT_REASONS = ["hunk longer than its header", "truncated hunk"];

const HUNK_HEAD = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

/**
 * Rewrites every hunk header's line counts from the hunk body, like `git apply --recount`: models often get them
 * wrong. A body runs to the next hunk or file header; blank lines at its end are separators, not context.
 */
export function recountHunks(patch: string): string {
  const lines = patch.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const h = HUNK_HEAD.exec(lines[i]!);
    if (!h) { out.push(lines[i]!); continue; }
    let end = i + 1;
    while (end < lines.length && !lines[end]!.startsWith("@@ ") && !lines[end]!.startsWith("diff --git ")) end++;
    let last = end;
    while (last > i + 1 && lines[last - 1] === "") last--;
    let oldN = 0, newN = 0;
    for (let k = i + 1; k < last; k++) {
      const c = lines[k]![0];
      if (c === "+") newN++;
      else if (c === "-") oldN++;
      else if (c === " " || lines[k] === "") { oldN++; newN++; }
    }
    out.push(`@@ -${h[1]},${oldN} +${h[2]},${newN} @@${h[3]}`);
    for (let k = i + 1; k < end; k++) out.push(lines[k]!);
    i = end - 1;
  }
  return out.join("\n");
}

const REJECT_HEADER = /^(old mode|new mode|new file mode|deleted file mode|rename from|rename to|copy from|copy to|similarity index|dissimilarity index|GIT binary patch|Binary files )/;
const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/**
 * Accepts only content edits to existing regular files named in `allowed` (any file `canEdit` accepts when null):
 * no new, deleted, renamed, mode-changed, symlink or binary files, at most
 * MAX_CHANGED_LINES added plus removed lines.
 */
export function validatePatch(text: string, allowed: string[] | null, canEdit: (path: string) => boolean = editable): PatchCheck {
  const patch = recountHunks(extractDiff(text));
  if (!patch.startsWith("diff --git ")) return { ok: false, reason: "the reply is not a unified diff" };
  const lines = patch.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const files: string[] = [];
  let changed = 0;
  let cur: string | null = null;
  let sawOld = false, sawNew = false, hunks = 0;
  const closeFile = (): string | null => (cur !== null && (!sawOld || !sawNew || hunks === 0) ? `incomplete diff for ${cur}` : null);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith("diff --git ")) {
      const bad = closeFile();
      if (bad) return { ok: false, reason: bad };
      const m = l.match(/^diff --git a\/(\S+) b\/(\S+)$/);
      if (!m || m[1] !== m[2]) return { ok: false, reason: `unsupported file header: ${l.slice(0, 100)}` };
      cur = m[1]!;
      if (!safePath(cur)) return { ok: false, reason: `unsafe path ${cur}` };
      if (!canEdit(cur)) return { ok: false, reason: `${cur} is not a file a fix-up may edit` };
      if (allowed && !allowed.includes(cur)) return { ok: false, reason: `${cur} is not a file named in the review's fixes` };
      if (files.includes(cur)) return { ok: false, reason: `${cur} appears twice` };
      files.push(cur);
      sawOld = sawNew = false;
      hunks = 0;
      continue;
    }
    if (cur === null) return { ok: false, reason: "text before the first file header" };
    if (REJECT_HEADER.test(l)) return { ok: false, reason: `${l.split(" ").slice(0, 2).join(" ")} is not allowed (${cur})` };
    if (/^index\b/.test(l)) {
      const idx = l.match(/^index [0-9a-f]+\.\.[0-9a-f]+(?: (100644|100755))?$/);
      if (!idx) return { ok: false, reason: `${cur} has an index line that is not a plain file mode` };
    }
    if (l.startsWith("--- ")) {
      if (l !== `--- a/${cur}`) return { ok: false, reason: `unexpected old file line for ${cur}` };
      sawOld = true;
      continue;
    }
    if (l.startsWith("+++ ")) {
      if (l !== `+++ b/${cur}`) return { ok: false, reason: `unexpected new file line for ${cur}` };
      sawNew = true;
      continue;
    }
    const h = l.match(HUNK);
    if (h) {
      if (!sawOld || !sawNew) return { ok: false, reason: `hunk before the file lines of ${cur}` };
      hunks++;
      let oldN = h[1] === undefined ? 1 : Number(h[1]), newN = h[2] === undefined ? 1 : Number(h[2]);
      while (oldN > 0 || newN > 0) {
        const b = lines[++i];
        if (b === undefined) return { ok: false, reason: `truncated hunk in ${cur}` };
        if (b.startsWith("\\")) continue;
        const c = b[0];
        if (c === "+") { newN--; changed++; }
        else if (c === "-") { oldN--; changed++; }
        else if (c === " " || b === "") { oldN--; newN--; }
        else return { ok: false, reason: `malformed hunk line in ${cur}` };
        if (oldN < 0 || newN < 0) return { ok: false, reason: `hunk longer than its header in ${cur}` };
      }
      while (lines[i + 1]?.startsWith("\\")) i++;
      continue;
    }
    if (l.startsWith("index ")) continue;
    return { ok: false, reason: `unexpected line in the diff of ${cur}: ${l.slice(0, 80)}` };
  }
  const bad = closeFile();
  if (bad) return { ok: false, reason: bad };
  if (!files.length) return { ok: false, reason: "the diff changes no file" };
  if (changed > MAX_CHANGED_LINES) return { ok: false, reason: `${changed} changed lines, over the limit of ${MAX_CHANGED_LINES}` };
  return { ok: true, patch: patch + "\n", files, changed };
}

/** What the fix-up prompt shows for one PR. Every string field is untrusted. */
export type FixupPr = {
  /** Where the call may read the repository in the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  ref: string;
  title: string;
  /** The review's fix list for this PR. */
  fixes: { file: string; change: string }[];
  /** Set for a quiet pull request: the prompt adds the quiet rule; not part of the quoted JSON. */
  quiet?: boolean;
  /** Each file the fixes name, at the PR's head commit: whole, or in part when it is large. */
  files: ShownFile[];
  /** The PR's diff. */
  diff: string;
  /** An operator's instructions (a maintainer of the project, not the PR's author): trusted text that replaces the fix list. */
  operator?: string;
  /** For a carry-over: the PRs closed as duplicates, their diffs and the parts to port onto this one. */
  carried_from?: { ref: string; points: string[]; diff: string }[];
  /** Present when an earlier patch for these fixes failed the lint check: that patch and the lint findings on the lines it changed. */
  previous?: LintPrevious;
};

/** An earlier model patch and the formatter and clippy findings on its own lines, as the patch prompts show them. */
export type LintPrevious = { patch: string; findings: string[] };

/** What the fixup.conflict prompt shows for one PR. Every string field is untrusted. */
export type ConflictPr = {
  /** Where the call may read the repository in the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  ref: string;
  title: string;
  /** The PR description. */
  body: string;
  /** The review's summary of what the PR does. */
  review_reason: string;
  /** The base branch being merged in. */
  base: string;
  /** Set for a quiet pull request: the prompt adds the quiet rule; not part of the quoted JSON. */
  quiet?: boolean;
  /** Each conflicted file as its conflict sections. */
  files: ConflictFile[];
  /** Present when an earlier resolution failed the lint check: its diff against the merge's conflicted tree and the findings on the lines it changed. */
  previous?: LintPrevious;
};

/** One conflict section with the lines around it. `ours` is the PR's side, `theirs` the base branch's. */
export type ConflictSection = { id: number; /** First line of `ours` in the PR head's version of the file (where `before` ends), or null when not found. */ line: number | null; before: string; ours: string; theirs: string; after: string };
export type ConflictFile = { path: string; lines: number; sections: ConflictSection[] };

const MARKER = /^(<{7}|>{7})( |$)|^={7}$/m;
const RESOLVE_MAX_SECTION = 40_000;
export const RESOLVE_MAX_TOTAL = 120_000;
/** Lines of the file shown before and after each conflict section. */
export const CONTEXT_LINES = 30;

export type Resolution = { ok: true; sections: Map<number, string> } | { ok: false; reason: string };

/**
 * The resolver's reply (exactly one JSON value, see wholeReplyJson): a JSON object {"sections": [{"id", "content"}]} that answers each shown section id exactly once
 * with the resolved lines for it, free of conflict markers and within the size caps.
 */
export function parseResolution(text: string, ids: number[]): Resolution {
  const v = wholeReplyJson(text);
  if (v === null) return { ok: false, reason: "the resolution is not exactly one JSON value" };
  const list = (v as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(list)) return { ok: false, reason: "the resolution has no sections list" };
  const out = new Map<number, string>();
  let total = 0;
  for (const f of list as { id?: unknown; content?: unknown }[]) {
    if (typeof f?.id !== "number" || typeof f.content !== "string") return { ok: false, reason: "a resolved section lacks an id or content" };
    if (!ids.includes(f.id)) return { ok: false, reason: `section ${f.id} is not one of the conflict sections` };
    if (out.has(f.id)) return { ok: false, reason: `section ${f.id} is answered twice` };
    if (MARKER.test(f.content)) return { ok: false, reason: `section ${f.id} still has conflict markers` };
    if (f.content.includes("\0")) return { ok: false, reason: `section ${f.id} has a NUL byte` };
    if (f.content.length > RESOLVE_MAX_SECTION) return { ok: false, reason: `section ${f.id} is over the size limit` };
    total += f.content.length;
    out.set(f.id, f.content);
  }
  if (total > RESOLVE_MAX_TOTAL) return { ok: false, reason: "the resolved sections are over the size limit" };
  const missing = ids.find((i) => !out.has(i));
  if (missing !== undefined) return { ok: false, reason: `section ${missing} is not resolved` };
  return { ok: true, sections: out };
}

/**
 * Conflicted files a resolution may be written for: any file but the trust paths, with `scripts` the build scripts of
 * both merge parents. Manifests and lockfiles are resolvable under their own section rules (see spliceSections).
 */
export function resolvablePath(p: string, scripts: BuildScripts): boolean {
  return !trustPath(p, scripts);
}

/** True when the text holds conflict markers (the merge tree's files do before resolving). */
export const hasMarkers = (text: string): boolean => MARKER.test(text);

type Sections = { pieces: string[]; sections: { ours: string[]; theirs: string[] }[] };

/**
 * A merge-tree file split on its conflict markers: the pieces outside the sections (one more piece than sections) and
 * each section's two sides as lines, or null when the markers are not well formed (`<<<<<<<`, `=======`, `>>>>>>>` in turn).
 */
function parseSections(text: string): Sections | null {
  const pieces: string[] = [];
  const sections: Sections["sections"] = [];
  let cur = "";
  let part: "out" | "ours" | "theirs" = "out";
  for (const line of text.split(/(?<=\n)/)) {
    const t = line.replace(/\r?\n$/, "");
    if (/^<{7}( |$)/.test(t)) { if (part !== "out") return null; pieces.push(cur); cur = ""; part = "ours"; sections.push({ ours: [], theirs: [] }); }
    else if (/^={7}$/.test(t)) { if (part !== "ours") return null; part = "theirs"; }
    else if (/^>{7}( |$)/.test(t)) { if (part !== "theirs") return null; part = "out"; }
    else if (part === "out") cur += line;
    else sections[sections.length - 1]![part].push(t);
  }
  if (part !== "out") return null;
  pieces.push(cur);
  return { pieces, sections };
}

/** Lines a resolution may not introduce unless a side of the conflict already has them. */
const RISKY_LINE = /^\s*(pub\s+)?(use|extern|mod|fn|impl|macro_rules!|import)\b|\bunsafe\b|include(_str|_bytes)?!|build\.rs|\brequire\(/;
const MAX_OTHER_LINES = 3;
/** Rust identifiers that declare an item, open unsafe code or include a file. */
const RUST_ITEM_WORDS = new Set(["use", "mod", "fn", "struct", "enum", "union", "trait", "impl", "type", "static", "const", "extern", "macro_rules", "macro", "unsafe", "include", "include_str", "include_bytes"]);

type Side = { ours: string[]; theirs: string[] };
const answerLines = (text: string): string[] => text.split("\n").filter((l, k, all) => k < all.length - 1 || l !== "");

/** True when `kept` keeps the lines of `side` in the side's order (a subsequence of it). */
function inOrder(kept: string[], side: string[]): boolean {
  let j = 0;
  for (const l of kept) { while (j < side.length && side[j] !== l) j++; if (j++ >= side.length) return false; }
  return true;
}

/** True when each side's own lines (those the other side lacks) appear in the answer in that side's order. */
function sidesInOrder(section: Side, lines: string[]): boolean {
  const ours = new Set(section.ours), theirs = new Set(section.theirs);
  return inOrder(lines.filter((l) => ours.has(l) && !theirs.has(l)), section.ours) && inOrder(lines.filter((l) => theirs.has(l) && !ours.has(l)), section.theirs);
}

/** True when the answer holds every line of `side` in order. */
const keepsWhole = (side: string[], lines: string[]): boolean => inOrder(side, lines);

/**
 * True when a section's resolved text is made of lines from its two sides plus at most three others, none risky.
 * Outside Rust (whose side lines rustAnswersOk reads in context), a side line counts as a side's only when the answer
 * keeps that whole side: a line taken out of a partly kept side (out of a comment the answer drops, say) is tested like
 * a new line.
 */
function sectionOk(section: Side, text: string, rust: boolean): boolean {
  const lines = answerLines(text);
  const whole = new Set([...(rust || keepsWhole(section.ours, lines) ? section.ours : []), ...(rust || keepsWhole(section.theirs, lines) ? section.theirs : [])]);
  const sides = new Set([...section.ours, ...section.theirs]);
  let other = 0;
  for (const line of lines) {
    if (!sides.has(line) && ++other > MAX_OTHER_LINES) return false;
    if (!whole.has(line) && RISKY_LINE.test(line)) return false;
  }
  return true;
}

/** Per kind, how many risky tokens (an attribute's `#`, an item word, a `name! {` macro call) a Rust token list holds; comments and strings hold none. */
function riskyCounts(tokens: string[]): Map<string, number> {
  const out = new Map<string, number>();
  const add = (k: string) => out.set(k, (out.get(k) ?? 0) + 1);
  const code = tokens.filter((t) => !/^[cC]:/.test(t));
  code.forEach((t, i) => {
    if (t === "p:#") add("#");
    else if (t.startsWith("i:") && RUST_ITEM_WORDS.has(t.slice(2))) add(t.slice(2));
    else if (t.startsWith("i:") && code[i + 1] === "p:!" && code[i + 2] === "p:{") add("macro{");
  });
  return out;
}

/** The tokens of `src` (see rustTokenSpans) whose start falls in each of `ranges` (offsets); null when `src` is not tokenizable. */
function tokensIn(src: string, ranges: [number, number][]): string[][] | null {
  const spans = rustTokenSpans(src);
  return spans && ranges.map(([a, b]) => spans.filter((x) => x.at >= a && x.at < b).map((x) => x.t));
}

/** The attributes (`#` tokens) that end `code` with nothing after them: those that guard whatever comes next. */
function trailingAttributes(code: string[]): number {
  let n = 0, i = code.length - 1;
  while (i >= 0 && code[i] === "p:]") {
    let depth = 0, j = i;
    for (; j >= 0; j--) { if (code[j] === "p:]") depth++; else if (code[j] === "p:[" && --depth === 0) break; }
    if (j < 1) break;
    const hash = code[j - 1] === "p:!" ? j - 2 : j - 1;
    if (code[hash] !== "p:#") break;
    n++;
    i = hash - 1;
  }
  return n;
}

/**
 * True when no Rust section answer adds an item, an attribute, unsafe code or an item macro: an answer line on neither
 * side holds none of them (read as Rust tokens, so spacing, comments and line position do not matter), and per kind the
 * answer, read in the resolved file, holds no more than its two sides read in their own files. A line kept from a side
 * that was commented out or inside a string there counts as new, and the text between and around the sections must read
 * the same (code, comments, strings) as in one of the side files. The attributes just above a section guard the first
 * item of both sides, so an answer that keeps both items may repeat them once.
 */
function rustAnswersOk(pieces: string[], sections: Side[], answers: string[]): boolean {
  const file = (pick: (i: number) => string) => {
    let text = pieces[0]!;
    const ranges: [number, number][] = [];
    for (let i = 0; i < sections.length; i++) { const t = pick(i); ranges.push([text.length, text.length + t.length]); text += t + pieces[i + 1]!; }
    return { text, ranges };
  };
  const joined = (l: string[]) => l.map((x) => `${x}\n`).join("");
  const res = file((i) => answers[i]!), ours = file((i) => joined(sections[i]!.ours)), theirs = file((i) => joined(sections[i]!.theirs));
  const r = tokensIn(res.text, res.ranges), o = tokensIn(ours.text, ours.ranges), t = tokensIn(theirs.text, theirs.ranges);
  const gaps = (f: { text: string; ranges: [number, number][] }): [number, number][] => [...f.ranges.map(([a], i): [number, number] => [i ? f.ranges[i - 1]![1] : 0, a]), [f.ranges.at(-1)![1], f.text.length]];
  const above = tokensIn(res.text, gaps(res)), oursOut = tokensIn(ours.text, gaps(ours)), theirsOut = tokensIn(theirs.text, gaps(theirs));
  if (!r || !o || !t || !above || !oursOut || !theirsOut) return false;
  // The text outside the sections must read as it does in a side's file: an answer that closes a comment or string opened above it would make the lines below live.
  const shape = (tokens: string[]) => tokens.map((x) => (/^[cCsh]:/.test(x) ? x[0] : x)).join("\u0000");
  if (above.some((g, i) => shape(g) !== shape(oursOut[i]!) && shape(g) !== shape(theirsOut[i]!))) return false;
  for (let i = 0; i < sections.length; i++) {
    const sides = new Set([...sections[i]!.ours, ...sections[i]!.theirs]);
    for (const line of answerLines(answers[i]!)) {
      if (sides.has(line)) continue;
      const own = rustTokens(line);
      if (!own || riskyCounts(own).size) return false;
    }
    const have = riskyCounts(r[i]!), a = riskyCounts(o[i]!), b = riskyCounts(t[i]!);
    const repeated = trailingAttributes(above[i]!.filter((x) => !/^[cC]:/.test(x)));
    for (const [k, n] of have) if (n > (a.get(k) ?? 0) + (b.get(k) ?? 0) + (k === "#" ? repeated : 0)) return false;
  }
  return true;
}

const LOCKFILE = /(^|\/)(Cargo\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
const MANIFEST = /(^|\/)(Cargo\.toml|package\.json)$/;

/** True when a lockfile section's resolved text is, line for line and in order, exactly one side of the conflict. */
function oneSide(section: Side, text: string): boolean {
  const lines = answerLines(text);
  const same = (side: string[]) => side.length === lines.length && side.every((l, k) => l === lines[k]);
  return same(section.ours) || same(section.theirs);
}

/**
 * Per line of a manifest, what it sits in: the TOML table header above it and the lines that opened the brackets still
 * open (a JSON object's key, an inline TOML array). Quoted text and TOML comments do not count.
 */
function manifestContext(lines: string[], toml: boolean): string[] {
  const out: string[] = [];
  let header = "";
  const open: string[] = [];
  for (const line of lines) {
    out.push(`${header}\u0000${open.join("\u0000")}`);
    const unquoted = line.replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""');
    const bare = toml ? unquoted.replace(/#.*$/, "") : unquoted;
    if (toml && open.length === 0 && /^\s*\[/.test(bare)) { header = bare.trim(); continue; }
    for (const ch of bare) {
      if (ch === "{" || ch === "[") open.push(line.trim());
      else if ((ch === "}" || ch === "]") && open.length) open.pop();
    }
  }
  return out;
}

/**
 * True when every manifest section answer is made only of lines of its two sides, each side's own lines in that side's
 * order, and every kept line sits in the same table and under the same keys as in a side's file it came from: a
 * dependency cannot move out of a metadata table, nor a script into `scripts`.
 */
function manifestAnswersOk(pieces: string[], sections: Side[], answers: string[], toml: boolean): boolean {
  const build = (pick: (i: number) => string[]) => {
    const all = answerLines(pieces[0]!);
    const at: number[] = [];
    for (let i = 0; i < sections.length; i++) { at.push(all.length); all.push(...pick(i), ...answerLines(pieces[i + 1]!)); }
    return { ctx: manifestContext(all, toml), at };
  };
  const res = build((i) => answerLines(answers[i]!)), ours = build((i) => sections[i]!.ours), theirs = build((i) => sections[i]!.theirs);
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]!, lines = answerLines(answers[i]!);
    const sides = new Set([...sec.ours, ...sec.theirs]);
    if (!lines.every((l) => sides.has(l)) || !sidesInOrder(sec, lines)) return false;
    for (let k = 0; k < lines.length; k++) {
      const ctx = res.ctx[res.at[i]! + k];
      const from = (side: string[], f: { ctx: string[]; at: number[] }) => side.some((l, j) => l === lines[k] && f.ctx[f.at[i]! + j] === ctx);
      if (!from(sec.ours, ours) && !from(sec.theirs, theirs)) return false;
    }
  }
  return true;
}

/** A resolution's text ends with a newline when the conflicted file's does. */
export function endNewline(conflicted: string, resolved: string): string {
  return resolved !== "" && conflicted.endsWith("\n") && !resolved.endsWith("\n") ? `${resolved}\n` : resolved;
}

const lineList = (text: string): string[] => text.split(/(?<=\n)/).filter((l) => l !== "");

/**
 * A merge-tree file as its conflict sections, numbered from `firstId`, each with up to `context` lines before and after.
 * Where two sections are close, the lines between them are shared out so no line is shown twice. Null when the markers
 * are not well formed.
 */
export function conflictView(path: string, text: string, firstId: number, context = CONTEXT_LINES): ConflictFile | null {
  const parsed = parseSections(text);
  if (!parsed) return null;
  const { pieces, sections } = parsed;
  const lines = pieces.map(lineList);
  const after: number[] = [], before: number[] = [];
  for (let i = 0; i < sections.length; i++) {
    const gap = lines[i + 1]!.length;
    after[i] = Math.min(context, gap);
    before[i + 1] = i + 1 < sections.length ? Math.min(context, gap - after[i]!) : 0;
  }
  before[0] = Math.min(context, lines[0]!.length);
  const out: ConflictSection[] = sections.map((sec, i) => {
    const section: ConflictSection = {
      id: firstId + i, line: null,
      before: lines[i]!.slice(lines[i]!.length - (i === 0 ? before[0]! : before[i]!)).join(""),
      ours: sec.ours.map((l) => `${l}\n`).join(""), theirs: sec.theirs.map((l) => `${l}\n`).join(""),
      after: lines[i + 1]!.slice(0, after[i]).join(""),
    };
    return section;
  });
  return { path, lines: text.split("\n").length - (text.endsWith("\n") ? 1 : 0), sections: out };
}

/** Fills each section's `line` from the PR head's version of the file, searching for its context and PR side in order. */
export function locateInHead(view: ConflictFile, head: string): void {
  let from = 0;
  for (const sec of view.sections) {
    const at = head.indexOf(sec.before + sec.ours + sec.after, from);
    if (at < 0) continue;
    sec.line = head.slice(0, at + sec.before.length).split("\n").length;
    from = at + sec.before.length + sec.ours.length;
  }
}

/** A section's answer as spliced: empty for no lines, otherwise ending with a newline. */
export const answerText = (a: string): string => (a === "" || a.endsWith("\n") ? a : `${a}\n`);

/** The merge-tree file with each section replaced by its resolved text (`answers` in section order), or null when the markers are malformed or a resolution breaks the section rules. */
export function spliceSections(text: string, answers: string[], path = ""): string | null {
  const parsed = parseSections(text);
  if (!parsed || parsed.sections.length !== answers.length) return null;
  // Lockfiles take exactly one side; manifests (dependencies, build configuration) take only lines of the two sides, where those lines were.
  const resolved = answers.map(answerText);
  const { pieces, sections } = parsed;
  if (LOCKFILE.test(path)) { if (!sections.every((sec, i) => oneSide(sec, resolved[i]!))) return null; }
  else if (MANIFEST.test(path)) { if (!manifestAnswersOk(pieces, sections, resolved, path.endsWith(".toml"))) return null; }
  else if (!sections.every((sec, i) => sectionOk(sec, resolved[i]!, path.endsWith(".rs")))) return null;
  if (path.endsWith(".rs") && !rustAnswersOk(pieces, sections, resolved)) return null;
  let out = pieces[0]!;
  for (let i = 0; i < resolved.length; i++) out += resolved[i]! + pieces[i + 1]!;
  return out;
}
