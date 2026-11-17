// Post-merge review prompt input and reply validation. No I/O and no Node imports: the prompt
// registry (also loaded by the web mockup) imports this file.
import type { LintProblem } from "../replylint.ts";
import { REFERENCE_LEAK } from "../review/opus-parse.ts";
import { wholeReplyJson } from "../core/reply-json.ts";

export const SEVERITIES = ["defect", "minor"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const MAX_FINDINGS = 12;
export const TITLE_CHARS = 120;
export const BODY_CHARS = 2000;
/** The merged diff's size cap in characters, as for review.opus. */
export const MAX_MERGED_DIFF_CHARS = 120_000;

export type Finding = {
  severity: Severity;
  title: string;
  /** Plain public text: what is wrong, where, the failure scenario and the suggested fix. */
  body: string;
  file: string | null;
  line: number | null;
  /** The number of an open issue or PR that already covers the finding. */
  duplicate_of: number | null;
  /** Internal: the stage that should have caught it, and why it did not. */
  missed_by: string;
  missed_why: string;
};

export type PostmergeCommit = { kind: "conflict-merge" | "fix-up" | "ci-fix" | "duplicate-carry"; sha: string | null; note: string | null };
export type PostmergeReviewRow = { head: string; verdict: string; sure: boolean; reason: string; risks: string[]; fixes: { file: string; change: string }[]; at: string };
export type RelatedItem = { number: number; kind: "issue" | "pr"; state: "open" | "closed"; title: string };
/** A follow-up issue this stage already filed for the PR (any state), or is filing with an unknown outcome. */
export type FiledBefore = { number: number | null; state: "open" | "closed" | "unknown"; title: string };

/** One merged PR as the prompt shows it. Every string field is untrusted or derived from untrusted text. */
export type PostmergePr = {
  ref: string;
  /** Where the call may read the repository inside the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  /** Set when the repo's reference folder is mounted at /reference; not part of the quoted JSON. */
  reference?: boolean;
  title: string;
  body: string;
  author: string | null;
  merge_sha: string;
  method: string | null;
  files: string[];
  tests_omitted: string[];
  lockfiles_omitted: string[];
  /** Commits the pipeline itself added to the PR before it merged. */
  pipeline_commits: PostmergeCommit[];
  /** Our reviews of the PR, oldest first. */
  review_history: PostmergeReviewRow[];
  /** Issues and PRs that mention this PR or its files, open or closed in the last 30 days: number, kind, state and title only, for deduplication. */
  related_open: RelatedItem[];
  /** Follow-up issues already filed for this PR by earlier reviews, with their current state. */
  filed_before: FiledBefore[];
  diff: string;
};

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function replyObject(text: string): Record<string, unknown> | null {
  const v = wholeReplyJson(text);
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * The findings of a reply, or null when it is not a valid reply (no object, or no `findings` array). An entry without a
 * valid severity, title or body is dropped. `drop`: public texts the reply lint still flagged after the fix turn; a finding
 * with such a title or body is left out like one that mentions the reference documentation.
 */
export function parseFindings(text: string, drop: ReadonlySet<string> = new Set()): Finding[] | null {
  const o = replyObject(text);
  if (!o || !Array.isArray(o.findings)) return null;
  const out: Finding[] = [];
  for (const raw of o.findings.slice(0, MAX_FINDINGS)) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    const severity = (SEVERITIES as readonly string[]).includes(f.severity as string) ? (f.severity as Severity) : null;
    const title = clean(str(f.title, TITLE_CHARS)), body = str(f.body, BODY_CHARS);
    if (!severity || !title || !body) continue;
    if (REFERENCE_LEAK.test(title) || REFERENCE_LEAK.test(body) || drop.has(f.title as string) || drop.has(f.body as string)) { console.log("post-merge finding dropped: its public text mentions the reference documentation"); continue; }
    const dup = typeof f.duplicate_of === "number" && Number.isInteger(f.duplicate_of) && f.duplicate_of > 0 ? f.duplicate_of : null;
    const line = typeof f.line === "number" && Number.isInteger(f.line) && f.line > 0 ? f.line : null;
    out.push({
      severity, title, body, file: str(f.file, 300) || null, line, duplicate_of: dup,
      missed_by: clean(str(f.missed_by, 80)), missed_why: clean(str(f.missed_why, 400)),
    });
  }
  return out;
}

/** The problems of a valid reply the model can fix itself: a reference mention in the public text of a finding. Null when the reply is not valid. */
export function lintReply(text: string): LintProblem[] | null {
  if (!parseFindings(text)) return null;
  const o = replyObject(text)!;
  const out: LintProblem[] = [];
  (o.findings as unknown[]).slice(0, MAX_FINDINGS).forEach((f, i) => {
    for (const k of ["title", "body"] as const) {
      const v = (f as Record<string, unknown> | null)?.[k];
      if (typeof v === "string" && REFERENCE_LEAK.test(v)) out.push({ field: `findings[${i}].${k}`, message: "mentions the reference folder or one of its pages; state the behaviour in your own words", text: v });
    }
  });
  return out;
}

/** The public texts of a reply for the reference checks, with the field each is in. Only defects are filed, but every title and body is shown to maintainers, so all are checked. */
export function publicTexts(text: string): { field: string; text: string }[] {
  const o = replyObject(text);
  if (!o || !Array.isArray(o.findings)) return [];
  return o.findings.slice(0, MAX_FINDINGS).flatMap((f, i) => (["title", "body"] as const).flatMap((k) => {
    const v = (f as Record<string, unknown> | null)?.[k];
    return typeof v === "string" && v.trim() ? [{ field: `findings[${i}].${k}`, text: v }] : [];
  }));
}

export const SAMPLE_POSTMERGE_PRS: PostmergePr[] = [{
  ref: "app#12", title: "Keep the stride when a 16-bit PNG is resized", body: "Fixes #9. The resize path used the 8-bit stride for 16-bit images.", author: "someone",
  merge_sha: "0123456789abcdef0123456789abcdef01234567", method: "merge", files: ["src/png.rs"], tests_omitted: ["tests/png16.rs"], lockfiles_omitted: [],
  pipeline_commits: [{ kind: "conflict-merge", sha: "89abcdef0123456789abcdef0123456789abcdef", note: "merged the base branch into the PR" }],
  review_history: [{ head: "fedcba9876543210fedcba9876543210fedcba98", verdict: "take-fix", sure: true, reason: "Rename tmp to stride.", risks: [], fixes: [{ file: "src/png.rs", change: "Rename `tmp` to `stride`." }], at: "2026-11-01T10:00:00.000Z" }],
  related_open: [{ number: 14, kind: "issue", state: "open", title: "Resize crops the last row of 16-bit PNGs" }],
  filed_before: [],
  diff: "diff --git a/src/png.rs b/src/png.rs\n--- a/src/png.rs\n+++ b/src/png.rs\n@@ -88,7 +88,7 @@ fn resize(img: &Image) -> Image {\n-    let stride = img.width * 4;\n+    let stride = img.width * img.bytes_per_pixel();\n",
}];
