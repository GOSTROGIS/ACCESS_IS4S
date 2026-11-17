// Constants, types and the pure parsers of the security deep scan (src/security). No Node imports: the
// prompt registry (src/prompts) imports this file, and the web mockup imports that.
import type { FindingSeverity } from "../../web/src/api/types.ts";
import { wholeReplyJson } from "../core/reply-json.ts";

/** The repo name under which the scan's agent runs and job are recorded. It is never a tracked repo, so every listing that leaves out the repos a viewer may not see also leaves out the scan's runs. */
export const SECURITY_PREFIX = "(security):";
export const securityRepo = (repo: string): string => `${SECURITY_PREFIX}${repo}`;
export const SECURITY_STEP = "security-scan";

export const SEVERITIES: FindingSeverity[] = ["critical", "high", "medium", "low"];
/** A finding the area scan reports needs at least this confidence. */
export const MIN_CONFIDENCE = 0.8;
/** Verify keeps a finding only with at least this score (of 10) for "still a real vulnerability". */
export const MIN_VERIFY_SCORE = 8;
export const AREAS_MAX = 60;
export const AREA_PATHS_MAX = 40;
export const ENTRY_POINTS_MAX = 60;
export const FINDINGS_PER_AREA_MAX = 12;
export const REFS_MAX = 8;
export const TITLE_MAX = 160;
export const TEXT_MAX = 2000;
export const SUMMARY_MAX = 4000;
export const REASON_MAX = 500;
export const ENTRY_KINDS = ["file-open", "import", "font-image", "plugin-script", "network", "ipc-deeplink", "ci-workflow", "build-script", "other"] as const;

export type EntryPoint = { name: string; kind: string; where: string };
export type ThreatArea = { name: string; paths: string[]; entryPoints: string[]; risk: number; why: string };
export type ThreatModel = { summary: string; entryPoints: EntryPoint[]; areas: ThreatArea[] };
export type Candidate = { title: string; severity: FindingSeverity; urgent: boolean; category: string; refs: { path: string; line: number; claim: string }[]; reach: string; impact: string };
export type VerifyVerdict = { verdict: "confirmed" | "disproved"; score: number; result: string; notes: string; proposedTest: string | null };

/** What each security prompt is rendered from. `repo` and `number` carry the scan's pseudo repo and the scan id, so the agent run lists the scan, never a real item. */
type Base = { repo: string; number: number; project: string; commit: string; repo_dir?: string };
export type SecurityModelInput = Base;
export type SecurityAreaInput = Base & { area: { name: string; paths: string[]; why: string }; entry_points: EntryPoint[]; summary: string };
export type SecurityVerifyInput = Base & { finding: Candidate & { area: string } };

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** The reply's one JSON value when it is an object (see wholeReplyJson). */
export function jsonObject(text: string): Record<string, unknown> | null {
  const v = wholeReplyJson(text);
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

/** A repository-relative path, or null: the sandbox's /repo prefix is dropped; absolute, parent and empty segments are refused. */
export function relPath(p: unknown): string | null {
  if (typeof p !== "string") return null;
  let s = p.trim().replace(/\\/g, "/").replace(/^\/repo\//, "").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!s || s.length > 300 || s.startsWith("/") || s.includes("\0")) return null;
  if (s.split("/").some((c) => c === "" || c === "..")) return null;
  return s;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The threat model of a reply: entry points and areas in risk order (highest first, ties keep the reply's order). Null without at least one valid area. */
export function parseThreatModel(text: string): ThreatModel | null {
  const o = jsonObject(text);
  if (!o) return null;
  const entryPoints: EntryPoint[] = [];
  for (const e of list(o.entry_points).slice(0, ENTRY_POINTS_MAX)) {
    const x = e as Record<string, unknown>;
    const name = str(x?.name, 120);
    if (!name) continue;
    entryPoints.push({ name, kind: ENTRY_KINDS.includes(x.kind as never) ? String(x.kind) : "other", where: str(x.where, 200) ?? "" });
  }
  const areas: ThreatArea[] = [];
  const seen = new Set<string>();
  for (const a of list(o.areas)) {
    const x = a as Record<string, unknown>;
    const name = str(x?.name, 120);
    const paths = [...new Set(list(x?.paths).map(relPath).filter((p): p is string => p !== null))].slice(0, AREA_PATHS_MAX);
    if (!name || !paths.length || seen.has(name)) continue;
    seen.add(name);
    const risk = typeof x.risk === "number" && Number.isFinite(x.risk) ? Math.min(5, Math.max(1, Math.round(x.risk))) : 3;
    areas.push({ name, paths, entryPoints: list(x.entry_points).filter((n): n is string => typeof n === "string").slice(0, ENTRY_POINTS_MAX), risk, why: str(x.why, 400) ?? "" });
  }
  if (!areas.length) return null;
  const ordered = areas.map((a, i) => ({ a, i })).sort((p, q) => q.a.risk - p.a.risk || p.i - q.i).map((x) => x.a).slice(0, AREAS_MAX);
  return { summary: str(o.summary, SUMMARY_MAX) ?? "", entryPoints, areas: ordered };
}

/** The findings of an area reply. A finding is kept only with a title, a severity, confidence of at least MIN_CONFIDENCE, a reach and an impact, and at least one ref with a path and a line; refs without both are dropped. Null when the reply is not the expected object. */
export function parseCandidates(text: string): Candidate[] | null {
  const o = jsonObject(text);
  if (!o || !Array.isArray(o.findings)) return null;
  const out: Candidate[] = [];
  for (const f of o.findings.slice(0, FINDINGS_PER_AREA_MAX)) {
    const x = f as Record<string, unknown>;
    const title = str(x?.title, TITLE_MAX), reach = str(x?.reach, TEXT_MAX), impact = str(x?.impact, TEXT_MAX);
    const severity = SEVERITIES.find((s) => s === x?.severity);
    const confidence = typeof x?.confidence === "number" ? x.confidence : 0;
    if (!title || !reach || !impact || !severity || confidence < MIN_CONFIDENCE) continue;
    const refs: Candidate["refs"] = [];
    for (const r of list(x.refs).slice(0, REFS_MAX)) {
      const y = r as Record<string, unknown>;
      const path = relPath(y?.path), line = y?.line;
      if (path && typeof line === "number" && Number.isInteger(line) && line >= 1) refs.push({ path, line, claim: str(y.claim, 400) ?? "" });
    }
    if (!refs.length) continue;
    out.push({ title, severity, urgent: x.urgent === true, category: str(x.category, 60) ?? "other", refs, reach, impact });
  }
  return out;
}

/** The verdict of a verify reply, or null when it is not one. */
export function parseVerdict(text: string): VerifyVerdict | null {
  const o = jsonObject(text);
  if (!o || (o.verdict !== "confirmed" && o.verdict !== "disproved")) return null;
  const score = typeof o.score === "number" && Number.isFinite(o.score) ? Math.min(10, Math.max(1, Math.floor(o.score))) : null;
  const result = str(o.result, TEXT_MAX);
  if (score === null || !result) return null;
  return { verdict: o.verdict, score, result, notes: str(o.notes, TEXT_MAX) ?? "", proposedTest: str(o.proposed_test, TEXT_MAX) };
}

/** A finding survives verification when the verdict confirms it and the score is high enough. */
export const survives = (v: VerifyVerdict): boolean => v.verdict === "confirmed" && v.score >= MIN_VERIFY_SCORE;

/** Normalised title for matching the same finding reported twice: lower case words only. */
export const titleKey = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---- private fixes and landing -------------------------------------------------

/** Rounds of the fix step: a patch that fails its build, tests, wording check or review is written again with the reasons. */
export const FIX_ROUNDS = 3;
/** Added to a finding's number for the agent runs of its fix, so they never share a key with a scan's runs under the same pseudo repo. */
export const FIX_RUN_BASE = 1_000_000;
export const FIX_TITLE_MAX = 72;
export const FIX_SUMMARY_MAX = 600;
export const PATCH_MARK = "---PATCH---";

/** What the security.fix prompt is rendered from. `previous` is set from the second round on. */
export type SecurityFixInput = Base & {
  finding: { title: string; severity: string; refs: { path: string; line: number; claim: string }[]; reach: string; impact: string; area: string };
  crate: { name: string; dir: string };
  test_path: string;
  /** The test Verify proposed; the regression test follows it where it can. */
  proposed_test: string | null;
  previous?: { patch: string; failure: string };
  /** The scan's own test of the finding and what running it showed (feature scan-tests); absent when there is none. */
  scan_test?: { result: "confirmed" | "not-shown" | "could-not-build"; path: string; source: string };
};
/** What the security.scantest prompt is rendered from: the finding, the crate that holds it and the test Verify proposed. */
export type SecurityScanTestInput = Base & {
  finding: { title: string; severity: string; refs: { path: string; line: number; claim: string }[]; reach: string; impact: string; area: string };
  crate: { name: string; dir: string };
  test_path: string;
  proposed_test: string;
};
/** Lines of the test file the scan test may have; the file is added by a diff that the test patch check bounds the same way. */
export const SCAN_TEST_MAX_LINES = 150;
/** The test file in the model's reply: the whole reply, or the one fenced block in it; null when it is empty or has no test function. */
export function parseScanTest(text: string): string | null {
  const fenced = /```(?:rust|rs)?[ \t]*\n([\s\S]*?)\n```/.exec(text);
  const body = (fenced ? fenced[1]! : text).replace(/\r\n/g, "\n").trim();
  if (!body || !/#\[(?:\w+::)*test\b/.test(body)) return null;
  if (body.split("\n").length > SCAN_TEST_MAX_LINES) return null;
  return `${body}\n`;
}
/** What the security.fixcheck prompt is rendered from: the private diff and the finding it fixes. */
export type SecurityFixCheckInput = Base & {
  finding: { title: string; refs: { path: string; line: number; claim: string }[]; reach: string; impact: string };
  patch: string;
  test_path: string;
};

/**
 * Words that give away what a change is for. The text of a quiet pull request (branch, title, body, commit message) and the
 * lines the patch adds must contain none of them: the problem stays private until the fix is merged.
 */
const GIVEAWAY = /\b(?:security|secure|insecure|vulnerab\w*|exploit\w*|attack\w*|attacker\w*|malicious|malware|cve(?:-\d+)*|ghsa\S*|advisory|injection|traversal|overflow\w*|out[- ]of[- ]bounds|rce|untrusted|crafted|sanitiz\w*|zero[- ]day|payload|escalat\w*|bypass\w*)\b/i;

/** The words that cannot appear anywhere in the added lines of the patch: identifiers such as an overflow error are ordinary code, these are not. */
const GIVEAWAY_CODE = /\b(?:security|vulnerab\w*|exploit\w*|attack\w*|attacker\w*|malicious|cve(?:-\d+)*|ghsa\S*|advisory)\b/i;

/** The first giveaway word in `text`, or null. */
export const giveaway = (text: string): string | null => GIVEAWAY.exec(text)?.[0] ?? null;

/** The comment parts of one source line: from a double slash to the end, block-comment segments, and the lines inside a block comment. `inBlock` carries across the lines of a hunk. */
function commentText(line: string, st: { inBlock: boolean }): string {
  const out: string[] = [];
  let rest = line;
  if (st.inBlock) {
    const end = rest.indexOf("*/");
    out.push(end < 0 ? rest : rest.slice(0, end));
    if (end < 0) return out.join(" ");
    st.inBlock = false;
    rest = rest.slice(end + 2);
  }
  for (const m of rest.matchAll(/\/\/.*$|\/\*.*?(?:\*\/|$)/g)) {
    out.push(m[0]);
    if (m[0].startsWith("/*") && !m[0].endsWith("*/")) st.inBlock = true;
  }
  return out.join(" ");
}

/** Giveaway test for names and paths: underscores, slashes and dots split words, so a name like test_path_traversal is caught. */
export const nameGiveaway = (s: string): string | null => giveaway(s.replace(/[_/.]+/g, " "));

/** The stored reason when a patch for a quiet pull request is refused for its wording: it names neither the word nor the fix. */
export const QUIET_PATCH_REFUSAL = "the patch uses wording this pull request must not contain";

/**
 * The giveaway word in what a unified diff shows: the narrow list for code tokens on added lines, the full list for the file
 * names, for comments and for function (test) names, or null when there is none.
 */
export function patchGiveaway(patch: string): string | null {
  let prev = "";
  const block = { inBlock: false };
  for (const line of patch.split("\n")) {
    // Existing file names are public already; only the path of a file the patch adds is checked.
    if (line.startsWith("+++ ")) {
      const w = prev === "--- /dev/null" ? nameGiveaway(line.slice(4)) : null;
      prev = "";
      if (w) return w;
      continue;
    }
    if (line.startsWith("--- ")) { prev = line; continue; }
    if (line.startsWith("diff --git ")) continue;
    if (line.startsWith("@@")) block.inBlock = false;
    // Unchanged lines can open or close a block comment that added lines sit in.
    if (line.startsWith(" ")) commentText(line.slice(1), block);
    if (!line.startsWith("+")) continue;
    const added = line.slice(1);
    const w = GIVEAWAY_CODE.exec(added)?.[0] ?? giveaway(commentText(added, block)) ?? nameGiveaway([...added.matchAll(/\bfn\s+(\w+)/g)].map((m) => m[1]).join(" "));
    if (w) return w;
  }
  return null;
}

/** A reply of the fix call: `TITLE:` line, `SUMMARY:` lines, then the marker line and the diff. Null when a part is missing. */
export function parseFixReply(text: string): { title: string; summary: string; patch: string } | null {
  const at = text.indexOf(`\n${PATCH_MARK}`);
  if (at < 0) return null;
  const head = text.slice(0, at);
  const patch = text.slice(at + 1 + PATCH_MARK.length).replace(/^[^\n]*\n/, "").replace(/^```(?:diff)?\n/, "").replace(/\n```\s*$/, "\n");
  const t = /^TITLE:[ \t]*(.+)$/m.exec(head);
  const s = /^SUMMARY:[ \t]*([\s\S]*)$/m.exec(head);
  const title = t?.[1]?.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "").slice(0, FIX_TITLE_MAX) ?? "";
  const summary = s?.[1]?.replace(/[ \t]+\n/g, "\n").trim().slice(0, FIX_SUMMARY_MAX) ?? "";
  if (!title || !summary || !patch.startsWith("diff --git ")) return null;
  return { title, summary, patch };
}

/** Why a title and summary cannot go on a quiet pull request, or null. */
export function quietProblem(title: string, summary: string): string | null {
  const w = giveaway(title) ?? giveaway(summary);
  return w ? `the title or summary says "${w}"; describe only what the code does now` : null;
}

/** `autocraft/fix-<slug>-<suffix>`, the shape of the other pipeline branches; the caller passes a random suffix, which keeps the finding count and number out of the name. */
export function fixBranch(title: string, suffix: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  return `autocraft/fix-${slug ? `${slug}-` : ""}${suffix}`;
}

/** The body of the quiet pull request: only the code change. */
export const landBody = (summary: string): string => `${summary}\n\nThe regression test fails without the change and passes with it.\n`;
