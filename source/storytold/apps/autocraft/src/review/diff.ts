// PR diffs: fetched with `gh pr diff`, cached by head commit, and cut down to
// the code a reviewer reads (tests and lockfiles are listed, not shown).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { envVar } from "../env.ts";
import { slugOf } from "../owners.ts";
import { readEnv, readEnvFor } from "../github/read.ts";
import { mayBeRun, mergeSteps, workflowSteps, type WorkflowSteps } from "../core/workflow-runs.ts";
import { lockfileNeedsWhole } from "../core/lockfiles.ts";

// gh picks its account from the working directory, so it runs in this repo.
const REPO_DIR = fileURLToPath(new URL("../..", import.meta.url));

export function diffCacheDir(): string {
  return envVar("DIFF_CACHE") ?? join(homedir(), ".cache/autocraft/diffs");
}

/**
 * `base`: the base branch the diff was computed against (the PR's base at the time of the read). `extras`: what the merge
 * rule reads beside the diff (see `DiffExtras`); absent from a fetcher that does not read it.
 */
export type DiffResult = { ok: true; text: string; base?: string; extras?: DiffExtras } | { ok: false; tooLarge: boolean; error: string };
/**
 * `files`: the head commit's text of each changed file the merge rule reads whole (see `wholeFilesOf`). `runs`: the run
 * steps and local actions of the workflows on the default branch's current head; empty when no changed path could be
 * run by name, null when unread. `complete`: every read succeeded.
 */
export type DiffExtras = { files: Record<string, string>; runs: WorkflowSteps | null; complete: boolean };
/** `head`: the commit the diff must be of; the fetch fails when the PR is no longer at it. */
export type DiffFetcher = (repo: string, number: number, head?: string) => Promise<DiffResult>;

/** The diff of a PR at one commit: GitHub's comparison of the PR's base commit with that commit, so a push after the read cannot change it. */
export const ghDiff: DiffFetcher = async (repo, number, head) => {
  const slug = slugOf(repo);
  const view = await gh(["api", `repos/${slug}/pulls/${number}`, "--jq", '[.head.sha, .base.sha, .base.ref, .changed_files, .additions, .deletions, .base.repo.default_branch] | join(" ")']);
  if (view.code !== 0) return { ok: false, tooLarge: false, error: view.err.trim().slice(0, 300) };
  const [liveHead, baseSha, baseRef, changedFiles, additions, deletions, defaultBranch] = view.out.trim().split(" ");
  if (!liveHead || !baseSha || !baseRef) return { ok: false, tooLarge: false, error: "the pull request could not be read" };
  if (head && liveHead !== head) return { ok: false, tooLarge: false, error: `head moved to ${liveHead.slice(0, 7)} since ${head.slice(0, 7)}` };
  // `gh pr diff` failed over 300 files or 20,000 lines; the compare endpoint may cut the diff short instead, so the size is judged from the pull request.
  const files = Number(changedFiles), lines = Number(additions) + Number(deletions);
  if (files > 300 || lines > 20000) return { ok: false, tooLarge: true, error: "the diff is over GitHub's size limit" };
  const r = await gh(["api", "-H", "Accept: application/vnd.github.diff", `repos/${slug}/compare/${baseSha}...${liveHead}`]);
  // GitHub refuses diffs over 20,000 lines or 300 files with HTTP 406.
  if (r.code !== 0) return { ok: false, tooLarge: /too_large|too large|406|maximum number of (lines|files)/i.test(r.err), error: r.err.trim().slice(0, 300) };
  if (Number.isFinite(files) && (r.out.match(/^diff --git /gm) ?? []).length < files) return { ok: false, tooLarge: true, error: `the compared diff has ${(r.out.match(/^diff --git /gm) ?? []).length} files, the pull request ${files}` };
  const extras: DiffExtras = { files: {}, runs: { runs: [], actions: [] }, complete: true };
  const wanted = wholeFilesOf(r.out);
  if (wanted.length > MAX_WHOLE_FILES) extras.complete = false;
  for (const path of wanted.slice(0, MAX_WHOLE_FILES)) {
    const c = await gh(["api", "-H", "Accept: application/vnd.github.raw", `repos/${slug}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${liveHead}`]);
    if (c.code === 0) extras.files[path] = c.out;
    else extras.complete = false;
  }
  if (splitDiff(r.out).some((f) => mayBeRun(f.path) || mayBeRun(f.oldPath))) {
    extras.runs = await workflowStepsAt(repo, slug, defaultBranch || baseRef);
    if (!extras.runs) extras.complete = false;
  }
  return { ok: true, text: r.out, base: baseRef, extras };
};

const MAX_WORKFLOWS = 50;
/** How long a workflows listing serves the reads of other PRs of the repo: about one pass of a step over the repo's PRs. */
const LISTING_TTL_MS = 10 * 60_000;
const listings = new Map<string, { at: number; entries: [string, string][] }>();

/** The workflow files (blob sha, path) at the head of `ref`, one listing call per repo and branch within `LISTING_TTL_MS`; null when unread. */
async function workflowListing(slug: string, ref: string): Promise<[string, string][] | null> {
  const key = `${slug}@${ref}`, hit = listings.get(key);
  if (hit && Date.now() - hit.at < LISTING_TTL_MS) return hit.entries;
  const ls = await gh(["api", `repos/${slug}/contents/.github/workflows?ref=${encodeURIComponent(ref)}`, "--jq", '.[] | select(.type == "file") | "\\(.sha) \\(.path)"']);
  let entries: [string, string][];
  if (ls.code === 0) entries = ls.out.split("\n").map((l) => l.split(" ") as [string, string]).filter(([sha, p]) => /^[0-9a-f]{40}$/.test(sha) && /\.ya?ml$/i.test(p ?? ""));
  else if (/\b404\b|Not Found/i.test(ls.err)) entries = [];
  else return null;
  listings.set(key, { at: Date.now(), entries });
  return entries;
}
/** The run steps of the workflows at the head of `ref` (what runs after a merge): one listing, each file's steps cached by blob. Null when unread. */
async function workflowStepsAt(repo: string, slug: string, ref: string): Promise<WorkflowSteps | null> {
  const entries = await workflowListing(slug, ref);
  if (!entries) return null;
  if (entries.length > MAX_WORKFLOWS) return null;
  const dir = join(diffCacheDir(), repo);
  const all: WorkflowSteps[] = [];
  for (const [sha] of entries) {
    const f = join(dir, `workflow-${sha}.json`);
    try { if (existsSync(f)) { all.push(JSON.parse(readFileSync(f, "utf8")) as WorkflowSteps); continue; } } catch { /* read again */ }
    const c = await gh(["api", "-H", "Accept: application/vnd.github.raw", `repos/${slug}/git/blobs/${sha}`]);
    if (c.code !== 0) return null;
    const steps = workflowSteps(c.out);
    mkdirSync(dir, { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(steps));
    renameSync(tmp, f);
    all.push(steps);
  }
  return mergeSteps(all);
}

const MANIFEST = /(^|\/)Cargo\.toml$/;
const PACKAGE_JSON = /(^|\/)package\.json$/;
const MAX_WHOLE_FILES = 100;
export const isNewFile = (f: FileDiff): boolean => f.head.some((l) => l.startsWith("new file mode ")) || f.head.includes("--- /dev/null");
export const isDeletedFile = (f: FileDiff): boolean => f.head.some((l) => l.startsWith("deleted file mode ")) || f.head.includes("+++ /dev/null");

/**
 * The changed files the merge rule reads whole at the head: edited Cargo and npm manifests (an added or deleted one is
 * whole in the diff), and lockfiles whose hunks change a checksum of a package they do not name.
 */
export function wholeFilesOf(text: string): string[] {
  return splitDiff(text).filter((f) => f.body.length > 0 && !isNewFile(f) && !isDeletedFile(f) && (MANIFEST.test(f.path) || PACKAGE_JSON.test(f.path) || lockfileNeedsWhole(f))).map((f) => f.path);
}

/** Whether the merge rule reads more than the diff for it: a file it reads whole, or a path a workflow step could run. */
export function needsExtras(text: string): boolean {
  return wholeFilesOf(text).length > 0 || splitDiff(text).some((f) => mayBeRun(f.path) || mayBeRun(f.oldPath));
}

/**
 * A file's text before the diff: `after` (its text at the head) with the section's hunks applied in reverse. null when the
 * hunks do not match `after`.
 */
export function textBefore(after: string, f: FileDiff): string | null {
  const lines = after.split("\n");
  const out: string[] = [];
  let at = 0;
  for (let k = 0; k < f.body.length; k++) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(f.body[k]!);
    if (!h) continue;
    const start = h[2] === "0" ? Number(h[1]) : Number(h[1]) - 1;
    if (start < at || start > lines.length) return null;
    out.push(...lines.slice(at, start));
    at = start;
    for (k++; k < f.body.length && !f.body[k]!.startsWith("@@ "); k++) {
      const l = f.body[k]!, c = l[0];
      if (c === "-") out.push(l.slice(1));
      else if (c === " " || c === "+") { if (lines[at] !== l.slice(1)) return null; if (c === " ") out.push(l.slice(1)); at++; }
      else if (l === "" && k === f.body.length - 1) continue;
      else if (c !== "\\") return null;
    }
    k--;
  }
  out.push(...lines.slice(at));
  return out.join("\n");
}

/** The file's text at one side of the diff when the section holds it whole (an added or deleted file); null otherwise. */
export function wholeInDiff(f: FileDiff, side: "before" | "after"): string | null {
  if (side === "after" ? !isNewFile(f) : !isDeletedFile(f)) return null;
  const mark = side === "after" ? "+" : "-";
  return f.body.filter((l) => l.startsWith(mark)).map((l) => l.slice(1)).join("\n");
}

/**
 * The diff of `repo#number` at `head`, from the cache when present. The fetch is of that commit, and a diff is stored only under
 * the commit it was read at. A stored entry records the base branch it was computed against; with `base` given, an entry for
 * another base is read again.
 */
export async function cachedDiff(repo: string, number: number, head: string, fetch: DiffFetcher, base?: string | null, opts: { reread?: boolean } = {}): Promise<DiffResult> {
  const dir = join(diffCacheDir(), repo);
  const file = join(dir, `${number}-${head}.diff`);
  const put = (path: string, text: string) => {
    mkdirSync(dir, { recursive: true });
    const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  };
  const fetchAndStore = async (): Promise<DiffResult> => {
    const r = await fetch(repo, number, head);
    if (r.ok) {
      if (r.base) put(`${file}.base`, r.base);
      // The extras are written before the diff, so a reader that finds the diff finds them too.
      if (r.extras) put(`${file}.files.json`, JSON.stringify(r.extras));
      put(file, r.text);
    }
    return r;
  };
  if (existsSync(file)) {
    const stored = existsSync(`${file}.base`) ? readFileSync(`${file}.base`, "utf8") : undefined;
    // An entry stored before bases were recorded does not say which base it read: with a base given it is read again.
    if (!base || stored === base) {
      const text = readFileSync(file, "utf8");
      const extras = cachedDiffExtras(repo, number, head);
      // An entry whose extras the rule still waits for is read again only by the re-read (see `rereadDiff`).
      if (!opts.reread) return { ok: true, text, ...(stored !== undefined ? { base: stored } : {}), ...(extras ? { extras } : {}) };
    }
  }
  return fetchAndStore();
}

/**
 * Reads a cached diff again for the extras the merge rule waits for, counted as one re-read; on a failed read the cached
 * entry stands.
 */
export async function rereadDiff(repo: string, number: number, head: string, fetch: DiffFetcher, base: string | null | undefined, at: number): Promise<DiffResult> {
  const r = await cachedDiff(repo, number, head, fetch, base, { reread: true });
  noteReread(repo, number, head, at);
  return r;
}

/** Re-reads across the instance in a rolling hour: they share the account's GitHub rate with every other step. */
export const REREADS_PER_HOUR = 800;
const HOUR_MS = 3600_000;
const paceFile = () => join(diffCacheDir(), "reread-pace.json");
type Pace = { at: number[]; pauseUntil: number | null };
function readPace(now: number): Pace {
  try {
    const v = JSON.parse(readFileSync(paceFile(), "utf8")) as Partial<Pace>;
    return { at: (Array.isArray(v.at) ? v.at.filter((t): t is number => typeof t === "number") : []).filter((t) => now - t < HOUR_MS).sort((a, b) => a - b), pauseUntil: typeof v.pauseUntil === "number" ? v.pauseUntil : null };
  } catch { return { at: [], pauseUntil: null }; }
}
function writePace(p: Pace): void {
  mkdirSync(diffCacheDir(), { recursive: true });
  const tmp = `${paceFile()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(p));
  renameSync(tmp, paceFile());
}

/** The earliest time a re-read may run: now, or when the hour's oldest re-read ages out, or when a pause for the rate limit ends. */
export function rereadPaceAt(now: number): number {
  const p = readPace(now);
  const full = p.at.length >= REREADS_PER_HOUR ? p.at[p.at.length - REREADS_PER_HOUR]! + HOUR_MS : now;
  return Math.max(now, full, p.pauseUntil ?? 0);
}

/** Takes one re-read slot of the hour, synchronously so parallel re-reads cannot pass the limit together; false when none is free. */
export function takeRereadSlot(now: number): boolean {
  if (rereadPaceAt(now) > now) return false;
  const p = readPace(now);
  writePace({ at: [...p.at, now], pauseUntil: p.pauseUntil });
  return true;
}

/** Pauses the re-reads until `until` (ms), when the core rate limit resets. */
export function pauseRereads(until: number): void {
  const now = Date.now();
  writePace({ ...readPace(now), pauseUntil: until });
}

/** The core REST rate left for the read identity of `owner`, and when it resets (ms); null when it cannot be read. The rate_limit call itself is free. */
export async function coreRate(owner: string): Promise<{ remaining: number; resetAt: number } | null> {
  const r = await gh(["api", "rate_limit", "--jq", '"\\(.resources.core.remaining) \\(.resources.core.reset)"'], owner);
  const [left, reset] = r.code === 0 ? r.out.trim().split(" ").map(Number) : [];
  return Number.isFinite(left) && Number.isFinite(reset) ? { remaining: left!, resetAt: reset! * 1000 } : null;
}

/** Re-reads of a diff's extras (see `noteReread`) before the rule judges the diff with what it has. */
export const EXTRAS_TRIES = 3;

/**
 * Records one re-read of a diff for its extras: a GitHub read made because the rule waits for them. Only these count
 * towards `EXTRAS_TRIES`, so reads other steps make, or skip, never use them up.
 */
export function noteReread(repo: string, number: number, head: string, at: number): void {
  const f = join(diffCacheDir(), repo, `${number}-${head}.diff.reread`);
  mkdirSync(join(diffCacheDir(), repo), { recursive: true });
  writeFileSync(f, JSON.stringify({ count: diffRereads(repo, number, head).count + 1, at }));
}

/** The re-reads recorded for a diff and the time of the last one. */
export function diffRereads(repo: string, number: number, head: string): { count: number; at: number | null } {
  const f = join(diffCacheDir(), repo, `${number}-${head}.diff.reread`);
  try {
    if (!existsSync(f)) return { count: 0, at: null };
    const v = JSON.parse(readFileSync(f, "utf8")) as { count?: unknown; at?: unknown };
    return { count: typeof v.count === "number" ? v.count : EXTRAS_TRIES, at: typeof v.at === "number" ? v.at : null };
  } catch { return { count: EXTRAS_TRIES, at: null }; }
}

/** What is stored beside a cached diff (see `DiffExtras`); null when nothing is stored. */
export function cachedDiffExtras(repo: string, number: number, head: string): DiffExtras | null {
  const f = join(diffCacheDir(), repo, `${number}-${head}.diff.files.json`);
  try {
    if (!existsSync(f)) return null;
    const v = JSON.parse(readFileSync(f, "utf8")) as Partial<DiffExtras>;
    const runs = v.runs && Array.isArray(v.runs.runs) && Array.isArray(v.runs.actions) ? v.runs : null;
    return { files: v.files && typeof v.files === "object" ? v.files : {}, runs, complete: v.complete === true };
  } catch { return null; }
}

/** Whether a cached diff still waits for its extras: it needs them, has no complete read of them, and has re-reads left. */
export function extrasPending(text: string, extras: DiffExtras | null, rereads: number): boolean {
  if (extras?.complete || rereads >= EXTRAS_TRIES) return false;
  return needsExtras(text);
}

/** Forgets the cached diff of a head, so the next read fetches it (and the PR's current base) again. */
export function dropCachedDiff(repo: string, number: number, head: string): void {
  const file = join(diffCacheDir(), repo, `${number}-${head}.diff`);
  rmSync(file, { force: true });
  rmSync(`${file}.base`, { force: true });
  rmSync(`${file}.files.json`, { force: true });
  rmSync(`${file}.reread`, { force: true });
}

/** The base branch a cached diff was computed against; null when unknown. */
export function cachedDiffBase(repo: string, number: number, head: string): string | null {
  const f = join(diffCacheDir(), repo, `${number}-${head}.diff.base`);
  try { return existsSync(f) ? readFileSync(f, "utf8") : null; } catch { return null; }
}

/**
 * One file's section of a unified diff. `path` is the new name and `oldPath` the old one (equal unless renamed or copied);
 * "?" when the header cannot be read. `head`: the header lines before the first hunk; `body`: the hunk lines.
 */
/** Diff characters above which a PR is held as too large to review. */
export const MAX_DIFF_CHARS = 120_000;

export type FileDiff = { path: string; oldPath: string; text: string; lines: number; head: string[]; body: string[] };

const C_ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };

/** A name as git writes it: plain, or C-quoted ("...") with octal bytes of UTF-8. null when the quoting is malformed. */
export function gitName(s: string): string | null {
  if (!s.startsWith('"')) return s;
  if (s.length < 2 || !s.endsWith('"')) return null;
  const bytes: number[] = [];
  const body = s.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === '"') return null;
    if (c !== "\\") { bytes.push(...Buffer.from(c, "utf8")); continue; }
    const e = body[++i] ?? "";
    const oct = /^[0-7]{3}/.exec(body.slice(i, i + 3));
    if (oct) { bytes.push(parseInt(oct[0], 8)); i += 2; continue; }
    const v = C_ESCAPES[e];
    if (v === undefined) return null;
    bytes.push(v);
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes)); } catch { return null; }
}

/** The path of a `--- a/x`, `+++ b/x` or `rename from x` value; null for /dev/null or a malformed name. */
function sidePath(v: string, prefix: string): string | null {
  const t = v.replace(/\t$/, "");
  if (t === "/dev/null") return null;
  const n = gitName(t);
  if (n === null) return null;
  if (!prefix) return n;
  return n.startsWith(prefix) ? n.slice(prefix.length) : null;
}

/** Both names of a `diff --git` header: quoted names, or the halves of `a/X b/X` (for a rename without other lines, the only " b/" split). */
function headerPaths(line: string): [string, string] | null {
  const rest = line.slice("diff --git ".length);
  const q = /^("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*")$/.exec(rest) ?? /^("(?:[^"\\]|\\.)*") (.+)$/.exec(rest);
  if (q && (q[1]!.startsWith('"') || q[2]!.startsWith('"'))) {
    const a = sidePath(q[1]!, "a/"), b = sidePath(q[2]!, "b/");
    return a !== null && b !== null ? [a, b] : null;
  }
  if (rest.length % 2 === 1) {
    const half = (rest.length - 1) / 2, a = rest.slice(0, half), b = rest.slice(half + 1);
    if (a.startsWith("a/") && b.startsWith("b/") && a.slice(2) === b.slice(2)) return [a.slice(2), b.slice(2)];
  }
  const parts = rest.split(" b/");
  if (parts.length === 2 && parts[0]!.startsWith("a/")) return [parts[0]!.slice(2), parts[1]!];
  return null;
}

export function splitDiff(text: string): FileDiff[] {
  const parts = text.split(/^(?=diff --git )/m).filter((p) => p.startsWith("diff --git "));
  return parts.map((p) => {
    const all = p.split("\n");
    const first = all.findIndex((l) => l.startsWith("@@ "));
    const head = first < 0 ? all : all.slice(0, first), body = first < 0 ? [] : all.slice(first);
    let oldPath: string | null | undefined, path: string | null | undefined;
    for (const l of head.slice(1)) {
      if (l.startsWith("rename from ") || l.startsWith("copy from ")) oldPath = sidePath(l.replace(/^(rename|copy) from /, ""), "") ?? "?";
      else if (l.startsWith("rename to ") || l.startsWith("copy to ")) path = sidePath(l.replace(/^(rename|copy) to /, ""), "") ?? "?";
      else if (l.startsWith("--- ") && oldPath === undefined) oldPath = sidePath(l.slice(4), "a/") ?? (l.slice(4).replace(/\t$/, "") === "/dev/null" ? undefined : "?");
      else if (l.startsWith("+++ ") && path === undefined) path = sidePath(l.slice(4), "b/") ?? (l.slice(4).replace(/\t$/, "") === "/dev/null" ? undefined : "?");
    }
    const h = headerPaths(all[0]!);
    const np = path ?? h?.[1] ?? oldPath ?? "?", op = oldPath ?? h?.[0] ?? np;
    // Only hunk lines count: an added line whose text starts with "++" is content, not a file header.
    const lines = body.filter((l) => l.startsWith("+") || l.startsWith("-")).length;
    return { path: np, oldPath: op, text: p, lines, head, body };
  });
}

const TEST_PATH = [
  /(^|\/)(tests?|testdata|test-data|test_data|fixtures|benches|__tests__|snapshots)\//,
  /(^|\/)test_[^/]*$/, /_tests?\.\w+$/, /\.(test|spec)\.\w+$/, /\.snap$/,
];
const LOCKFILE = /(^|\/)(Cargo\.lock|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|uv\.lock|poetry\.lock|go\.sum)$/;

export const isTestPath = (p: string): boolean => TEST_PATH.some((r) => r.test(p));
export const isLockfile = (p: string): boolean => LOCKFILE.test(p);

export type CodeDiff = {
  /** Code files only, in diff order. */
  files: string[];
  /** The code part of the diff. */
  text: string;
  /** Changed lines in code files. */
  codeLines: number;
  testsOmitted: string[];
  lockfilesOmitted: string[];
};

/**
 * The diff a model reads: code first, lockfiles listed and left out. `keepTests`: true keeps every test file; a number is a
 * character budget, and test files are kept in diff order while the kept text stays within it (the rest are listed).
 */
export function codeDiff(text: string, keepTests: boolean | number = false): CodeDiff {
  const out: CodeDiff = { files: [], text: "", codeLines: 0, testsOmitted: [], lockfilesOmitted: [] };
  const sections = splitDiff(text);
  const kept = new Set<FileDiff>();
  let size = 0;
  for (const f of sections) if (!isLockfile(f.path) && !isTestPath(f.path)) { kept.add(f); size += f.text.length; }
  for (const f of sections) {
    if (isLockfile(f.path) || !isTestPath(f.path)) continue;
    if (keepTests === true || (typeof keepTests === "number" && size + f.text.length <= keepTests)) { kept.add(f); size += f.text.length; }
  }
  const parts: string[] = [];
  for (const f of sections) {
    if (isLockfile(f.path)) out.lockfilesOmitted.push(f.path);
    else if (!kept.has(f)) out.testsOmitted.push(f.path);
    else {
      out.files.push(f.path);
      parts.push(f.text);
      out.codeLines += f.lines;
    }
  }
  out.text = parts.join("");
  return out;
}

/** The diff between two heads of one PR, or a failure. Not cached: it is read once per new head. */
export type DeltaFetcher = (repo: string, base: string, head: string) => Promise<DiffResult>;

/** Runs gh with the read identity of the owner the arguments name, or of `owner` when given. */
export async function gh(args: string[], owner?: string): Promise<{ code: number | null; out: string; err: string }> {
  let env: Awaited<ReturnType<typeof readEnvFor>>;
  try { env = owner !== undefined ? await readEnv(owner) : await readEnvFor("gh", args); } catch (e) { return { code: -1, out: "", err: String((e as Error).message ?? e) }; }
  return new Promise((resolve) => {
    const p = spawn("gh", args, { cwd: REPO_DIR, timeout: 120_000, ...(env ? { env } : {}) });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => resolve({ code: -1, out: "", err: String(e) }));
    p.on("close", (code) => resolve({ code, out: Buffer.concat(out).toString("utf8"), err }));
  });
}

/** GitHub's compare of base...head; fails unless head is ahead of base (so base is an ancestor). */
export const ghDelta: DeltaFetcher = async (repo, base, head) => {
  const path = `repos/${slugOf(repo)}/compare/${base}...${head}`;
  const status = await gh(["api", path, "--jq", ".status"]);
  if (status.code !== 0) return { ok: false, tooLarge: false, error: status.err.trim().slice(0, 300) };
  if (status.out.trim() !== "ahead") return { ok: false, tooLarge: false, error: `compare status ${status.out.trim()}` };
  const diff = await gh(["api", "-H", "Accept: application/vnd.github.diff", path]);
  if (diff.code !== 0) return { ok: false, tooLarge: /too_large|too large|406/i.test(diff.err), error: diff.err.trim().slice(0, 300) };
  return { ok: true, text: diff.out };
};

/** What a merged PR landed: the commit read (null when the diff is the PR's own) and its diff restricted to the files of the PR's own diff. */
export type MergedDiff = { ok: true; sha: string | null; text: string } | { ok: false; tooLarge: boolean; error: string };
/** `batch`: the PR landed through an integration batch, whose merge commit carries every member. */
export type MergedFetcher = (repo: string, number: number, opts?: { batch?: boolean }) => Promise<MergedDiff>;

/**
 * The merge commit's diff against its first parent, kept to the files the PR changed. A PR merged through an integration
 * batch, or one without a merge commit, is read as its own diff at the merged head (it includes the pipeline's pushes to
 * the PR branch). When the PR's own diff cannot be read there is no diff: the merge commit alone would carry other PRs.
 */
export const ghMerged: MergedFetcher = async (repo, number, opts = {}) => {
  const own = await ghDiff(repo, number);
  if (!own.ok) return own;
  if (opts.batch) return { ok: true, sha: null, text: own.text };
  const view = await gh(["pr", "view", String(number), "--repo", `${slugOf(repo)}`, "--json", "mergeCommit", "--jq", ".mergeCommit.oid // empty"]);
  const sha = view.code === 0 && /^[0-9a-f]{40}$/.test(view.out.trim()) ? view.out.trim() : null;
  const fallback: MergedDiff = { ok: true, sha, text: own.text };
  if (!sha) return fallback;
  const c = await gh(["api", "-H", "Accept: application/vnd.github.diff", `repos/${slugOf(repo)}/commits/${sha}`]);
  if (c.code !== 0) return fallback;
  const keep = new Set(splitDiff(own.text).map((f) => f.path));
  const text = splitDiff(c.out).filter((f) => keep.has(f.path)).map((f) => f.text).join("");
  return text ? { ok: true, sha, text } : fallback;
};

/** Whether `path` exists on `ref` of the repo; null when GitHub could not say (anything but a plain not-found). */
export type FileChecker = (repo: string, ref: string, path: string) => Promise<boolean | null>;

export const ghFileExists: FileChecker = async (repo, ref, path) => {
  const r = await gh(["api", `repos/${slugOf(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, "--jq", ".type"]);
  if (r.code === 0) return r.out.trim().length > 0;
  return /\b404\b|Not Found/i.test(r.err) ? false : null;
};
