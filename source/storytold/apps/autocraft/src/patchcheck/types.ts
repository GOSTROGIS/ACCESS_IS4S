// Shared by the patch-check prompts (src/prompts, which imports no Node modules) and the Fix and Fix-up stages.

/** Characters of the PR diff and of our patch shown to the checking model; over either, the stage holds without asking. */
export const CHECK_DIFF_CAP = 60_000;
export const CHECK_PATCH_CAP = 80_000;
export const CHECK_REASON_WORDS = 60;
export const CHECK_MAX_PROBLEMS = 10;
export const CHECK_PROBLEM_CHARS = 200;

export type CheckVerdict = "approve" | "reject";
export type PatchCheck = { verdict: CheckVerdict; reasons: string; problems: string[] };
export type CheckKind = "fixup" | "fixissue";

/** What the fixup.check prompt is rendered from. */
export type FixupCheckInput = {
  /** Where the call may read the repository in the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  ref: string; title: string;
  /** The review's reason for taking the PR with fixes. */
  review_reason: string;
  fixes: { file: string; change: string }[];
  /** The pull request's unified diff. */
  diff: string;
  /** Our patch, on top of the PR's head. */
  patch: string;
  /** An operator's instructions the patch is meant to carry out (trusted text; the fix list is empty). */
  operator?: string;
  /** For a carry-over: the closed duplicates with the parts to port and their diffs (each cut to a share of the cap). */
  carried_from?: { ref: string; points: string[]; diff: string }[];
  /** For a CI fix (`fixes` is empty): the failing checks and the tails of their failed steps' logs (untrusted text from the PR's CI run). `patch` is meant only to make them pass. */
  ci_failure?: { checks: string[]; log: string };
  /** For a merge of the default branch into the PR (`patch` is empty): each conflict section with the lines around it, both sides and our resolution. `ours` is the PR's side; `line` is where it starts in the PR head's file; sides and resolved keep their newlines, so no lines and one blank line differ. */
  conflict?: { base: string; files: { path: string; sections: { id: number; line: number | null; before: string; ours: string; theirs: string; resolved: string; after: string }[] }[] };
};

/** What the fixissue.check prompt is rendered from. */
export type FixIssueCheckInput = {
  /** Where the call may read the repository in the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  ref: string; title: string; body: string; comments: { author: string; body: string }[];
  /** The triage's reasoning for calling the issue fixable. */
  triage_reason: string;
  /** Our patch: the fix and the regression test. */
  patch: string;
  test_path: string;
};

export const SAMPLE_FIXUP_CHECK: FixupCheckInput[] = [{
  ref: "photocraft#1287", title: "Crash when opening a 16-bit PNG with alpha",
  review_reason: "Fixes the 16-bit stride; one rename requested.",
  fixes: [{ file: "crates/codecs/src/png.rs", change: "Rename `bytes_per_sample` to `sample_bytes` in decode_rows." }],
  diff: "diff --git a/crates/codecs/src/png.rs b/crates/codecs/src/png.rs\n--- a/crates/codecs/src/png.rs\n+++ b/crates/codecs/src/png.rs\n@@ -1,3 +1,4 @@\n fn decode_rows(info: &Info, data: &[u8]) -> Result<Image, DecodeError> {\n+    let bytes_per_sample = if info.bit_depth == 16 { 2 } else { 1 };\n",
  patch: "diff --git a/crates/codecs/src/png.rs b/crates/codecs/src/png.rs\n--- a/crates/codecs/src/png.rs\n+++ b/crates/codecs/src/png.rs\n@@ -1,4 +1,4 @@\n fn decode_rows(info: &Info, data: &[u8]) -> Result<Image, DecodeError> {\n-    let bytes_per_sample = if info.bit_depth == 16 { 2 } else { 1 };\n+    let sample_bytes = if info.bit_depth == 16 { 2 } else { 1 };\n",
}];

export const SAMPLE_FIXISSUE_CHECK: FixIssueCheckInput[] = [{
  ref: "photocraft#1279", title: "Crash when opening a 16-bit PNG with alpha",
  body: "Opening a 16-bit RGBA PNG panics in the decoder: index out of bounds in decode_rows.", comments: [],
  triage_reason: "Stride ignores the sample size of 16-bit images.",
  test_path: "crates/codecs/tests/autocraft_regression_1279.rs",
  patch: "diff --git a/crates/codecs/src/png.rs b/crates/codecs/src/png.rs\n--- a/crates/codecs/src/png.rs\n+++ b/crates/codecs/src/png.rs\n@@ -1,3 +1,3 @@\n fn stride(width: usize, channels: usize) -> usize {\n-    width * channels\n+    width * channels * 2\n }\n",
}];
