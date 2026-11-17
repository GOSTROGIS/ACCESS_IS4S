// Content a person looks at before it merges, whatever the review says: the README, brand files, CI and build configuration,
// submodules, symlinks, modes and binaries, lockfile changes beyond registry updates, test files the review could not show,
// and third-party links or images in docs. Pure: it reads a unified diff and the whole files cached beside it (see facts.ts).
import { MAX_DIFF_CHARS, codeDiff, isDeletedFile, isNewFile, splitDiff, textBefore, wholeInDiff, type FileDiff } from "../review/diff.ts";
import { isTrustPath } from "./trust-paths.ts";
import { manifestRiskChanged } from "./cargo-manifest.ts";
import { lockfileReasons } from "./lockfiles.ts";
import { SCRIPT_LIKE, runByWorkflow, runPaths, type WorkflowSteps } from "./workflow-runs.ts";

export const README_REASON = "changes the README";
export const UNCHECKED_REASON = "diff not checked for README or third-party links";
export const BRAND_REASON = "changes brand files";
export const CI_FILES_REASON = "changes CI or build configuration";
export const FILE_KIND_REASON = "changes a submodule, symlink, file mode or binary file";
export const TESTS_UNREAD_REASON = "test files left out of the review for size";
export const UNREADABLE_PATH_REASON = "changes a file whose name the check cannot read";
export const EXTERNAL_LINK_REASON = "adds a third-party image or link";
export const EXTRAS_PENDING_REASON = "waiting to read the files the merge rule checks beside the diff";

/** Hosts that do not count as third-party, besides the repo's own org pages on GitHub. */
const OWN_HOSTS = ["github.com", "www.github.com", "raw.githubusercontent.com"];

const DOC_FILE = /\.(md|markdown|mdx|html?|rst|adoc|txt)$|(^|\/)docs?\//i;
const README_FILE = /(^|\/)readme[^/]*$/i;
const CARGO_FILE = /(^|\/)Cargo\.toml$/;
const PACKAGE_JSON = /(^|\/)package\.json$/;
const BUILD_SCRIPT = /(^|\/)build\.rs$/i;
/** Images are binary files a reader sees; any other binary (a library, a wasm module, an archive) is content no review reads. */
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|tiff?)$/i;

/** A section that is not a text change of a regular file: a submodule or symlink on either side, a mode change, a binary other than an image. */
function oddKind(f: FileDiff): boolean {
  for (const l of f.head) {
    if (/^(old|new) mode /.test(l) || (/^(new|deleted) file mode /.test(l) && /\b(120000|160000)$/.test(l))) return true;
    if (/^index \S+ (120000|160000)$/.test(l)) return true;
    if ((l.startsWith("Binary files ") || l === "GIT binary patch") && !(IMAGE_FILE.test(f.path) && IMAGE_FILE.test(f.oldPath))) return true;
  }
  return f.body.some((l) => /^[+-]Subproject commit /.test(l));
}

/**
 * A manifest's text before and after its section: whole in the diff for an added or deleted file, else the head text the
 * cache keeps with the diff taken back. null when that cannot be read (no head text, the diff does not match it, a rename).
 */
function sides(f: FileDiff, files: Record<string, string>): { before: string | null; after: string | null } | null {
  if (f.path !== f.oldPath) return null;
  if (isNewFile(f)) return { before: null, after: wholeInDiff(f, "after") };
  if (isDeletedFile(f)) return { before: wholeInDiff(f, "before"), after: null };
  const after = files[f.path];
  if (after === undefined) return null;
  const before = textBefore(after, f);
  return before === null ? null : { before, after };
}

/**
 * A Cargo.toml section that changes the build script, links, proc-macro, which crates the build dependencies are, patches,
 * a git or registry source, or a path out of the repo, read from the whole manifest before and after.
 */
function cargoRisk(f: FileDiff, files: Record<string, string>): boolean {
  if (!f.body.length && f.path === f.oldPath) return false;
  const s = sides(f, files);
  return !s || manifestRiskChanged(s.before, s.after, f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "");
}

/** A package.json section that changes its `scripts`, the commands CI and contributors run through the package manager. */
function npmScriptsChanged(f: FileDiff, files: Record<string, string>): boolean {
  if (!f.body.length && f.path === f.oldPath) return false;
  const s = sides(f, files);
  if (!s) return true;
  const scripts = (t: string | null): string | null => {
    if (t === null) return "{}";
    try {
      const v = JSON.parse(t.replace(/^\uFEFF/, "")) as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? JSON.stringify((v as Record<string, unknown>)["scripts"] ?? {}) : null;
    } catch { return null; }
  };
  const a = scripts(s.before), b = scripts(s.after);
  return a === null || b === null || a !== b;
}

const BRAND_FILE = /brand|logo/i;
// A link target as a reader's browser or the Markdown renderer sees it: any scheme or none ("//host"), or a "www." host.
const URL_RE = /(?:[a-z][a-z0-9+.-]*:)?\/\/([^\s/?#)"'<>\]]+)([^\s)"'<>\]]*)|\bwww\.([^\s/?#)"'<>\]]+)([^\s)"'<>\]]*)/gi;
const NAMED_ENTITIES: Record<string, string> = { colon: ":", sol: "/", bsol: "\\", period: ".", commat: "@", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", tab: "\t", newline: "\n" };

// A special scheme followed by any run of slashes and backslashes (none included) names a host, as a browser reads it:
// "http:evil.example", "https:/\evil.example". A path such as C:\\Users\\me is not one of these schemes.
const SPECIAL_SCHEME = /\b(https?|ftp|wss?):[\\/]*(?=[^\s\\/"'<>)\]])/gi;
const RELATIVE_BSLASH = /(?<![^\s(<"'=])[\\/]{2,}([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+[^\s"'<>)]*)/g;
/** HTML attributes whose value a browser loads or follows. */
const URL_ATTR = /\b(?:href|src|srcset|action|formaction|poster|data|background|cite|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** The text with HTML character references decoded, tabs and line breaks removed and URL slashes read as browsers read them. */
function readable(text: string): string {
  const dec = (s: string) => s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, n: string) => (Object.hasOwn(NAMED_ENTITIES, n.toLowerCase()) ? NAMED_ENTITIES[n.toLowerCase()]! : m));
  return dec(dec(text)).replace(/[\t\n\r]/g, "")
    .replace(SPECIAL_SCHEME, (_m, scheme: string) => `${scheme}://`)
    .replace(RELATIVE_BSLASH, (m, rest: string) => (m.includes("\\") ? `//${rest.replace(/\\/g, "/")}` : m));
}

/** Whether a link target names a host other than GitHub with the repo's own org, or the org's pages, after the URL is resolved. */
function thirdParty(target: string, own: Set<string>, org: string): boolean {
  const t = target.replace(/\\/g, "/");
  const abs = /^www\./i.test(t) ? `https://${t}` : t.startsWith("//") ? `https:${t}` : t;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(abs)) return false;
  let u: URL;
  try { u = new URL(abs); } catch { return true; }
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  if (!own.has(host)) return true;
  // On GitHub itself only the repo's own org counts: any other owner's page is a third party.
  if (host.endsWith("github.com") || host === "raw.githubusercontent.com") return (u.pathname.split("/")[1] ?? "").toLowerCase() !== org.toLowerCase();
  return false;
}

/** Whether the added lines of a docs section link or load a third-party URL: per line, and in attribute values that span lines. */
function externalLink(f: FileDiff, own: Set<string>, org: string): boolean {
  const runs: string[][] = [];
  let run: string[] = [];
  for (const l of f.body) {
    if (l.startsWith("+")) run.push(l.slice(1));
    else if (l.startsWith("-") || l.startsWith("\\")) continue;
    else { if (run.length) runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  for (const r of runs) {
    for (const line of r) for (const m of readable(line).matchAll(URL_RE)) if (thirdParty(m[0], own, org)) return true;
    for (const m of readable(r.join("\n")).matchAll(URL_ATTR)) if (thirdParty(m[1] ?? m[2] ?? "", own, org)) return true;
  }
  return false;
}

/**
 * The reasons (in a fixed order) this diff keeps a PR outside the merge rule. `org` is the GitHub org of the repo. `ctx`, as
 * the diff cache stores it beside the diff: `files` the whole head text of edited manifests and lockfiles, `runs` the
 * default branch's workflow steps (null or absent: unread).
 */
export function sensitiveReasons(diff: string, org: string, ctx: { files?: Record<string, string>; runs?: WorkflowSteps | null } = {}): string[] {
  const own = new Set([...OWN_HOSTS, `${org}.github.io`].map((h) => h.toLowerCase()));
  const files = ctx.files ?? {};
  // Files the workflows run; with the workflows unread, every script-like path counts.
  const steps = ctx.runs ?? null, named = steps ? runPaths(steps) : null;
  const runByCi = (p: string) => (steps && named ? runByWorkflow(p, steps, named) : SCRIPT_LIKE.test(p));
  const sections = splitDiff(diff);
  let readme = false, brand = false, ci = false, kind = false, unreadable = false, external = false;
  for (const f of sections) {
    const paths = f.path === f.oldPath ? [f.path] : [f.path, f.oldPath];
    if (paths.includes("?")) unreadable = true;
    if (paths.some((p) => README_FILE.test(p))) readme = true;
    if (paths.some((p) => BRAND_FILE.test(p))) brand = true;
    if (paths.some((p) => isTrustPath(p) || BUILD_SCRIPT.test(p) || runByCi(p)) || (paths.some((p) => CARGO_FILE.test(p)) && cargoRisk(f, files))
      || (paths.some((p) => PACKAGE_JSON.test(p)) && npmScriptsChanged(f, files))) ci = true;
    if (oddKind(f)) kind = true;
    if (!external && DOC_FILE.test(f.path) && externalLink(f, own, org)) external = true;
  }
  const unread = codeDiff(diff, MAX_DIFF_CHARS).testsOmitted.length > 0;
  return [
    ...(readme ? [README_REASON] : []), ...(brand ? [BRAND_REASON] : []), ...(ci ? [CI_FILES_REASON] : []), ...(kind ? [FILE_KIND_REASON] : []),
    ...lockfileReasons(sections, files), ...(unread ? [TESTS_UNREAD_REASON] : []), ...(unreadable ? [UNREADABLE_PATH_REASON] : []),
    ...(external ? [EXTERNAL_LINK_REASON] : []),
  ];
}
