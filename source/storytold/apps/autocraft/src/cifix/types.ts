import type { ShownFile } from "../fixup/excerpt.ts";
import type { LintPrevious } from "../fixup/patch.ts";

// Shared by the cifix.patch prompt (src/prompts, which imports no Node modules) and the CI fix step.

/** One failed step of a failed check: the tail of its log. The log is untrusted text from the PR's CI run. */
export type FailedStep = { job: string; step: string; tail: string };
export type FailedCheck = { name: string; conclusion: string; runId: number | null; /** When the check run completed (ISO), if GitHub said. */ completedAt?: string | null; steps: FailedStep[] };
/** What the failed required checks of a head said. */
export type CiFailure = { head: string; checks: FailedCheck[] };

/** What the cifix.patch prompt shows for one PR. Every string field is untrusted. */
export type CifixPr = {
  /** Where the call may read the repository in the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  ref: string;
  title: string;
  /** Set for a quiet pull request: the prompt adds the quiet rule; not part of the quoted JSON. */
  quiet?: boolean;
  /** The failed checks with the tail of each failed step's log. */
  failure: { check: string; steps: { job: string; step: string; log: string }[] }[];
  /** Each file the patch may edit, at the PR's head commit: whole, or in part when it is large. */
  files: ShownFile[];
  /** The PR's diff. */
  diff: string;
  /** Present when an earlier patch failed the lint check: that patch and the lint findings on the lines it changed. */
  previous?: LintPrevious;
};

export const SAMPLE_CIFIX_PRS: CifixPr[] = [{
  ref: "photocraft#1287", title: "Fix the stride for 16-bit PNGs",
  failure: [{ check: "gate / test", steps: [{ job: "test", step: "cargo test", log: "error[E0425]: cannot find value `sample_bytes` in this scope\n --> crates/codecs/src/png.rs:3:61\n  |\n3 |     let stride = info.width as usize * info.channels as usize * sample_bytes;\n  |                                                                 ^^^^^^^^^^^^ not found in this scope\nerror: could not compile `codecs` (lib) due to 1 previous error\n" }] }],
  files: [{ path: "crates/codecs/src/png.rs", content: "fn decode_rows(info: &Info, data: &[u8]) -> Result<Image, DecodeError> {\n    let bytes_per_sample = if info.bit_depth == 16 { 2 } else { 1 };\n    let stride = info.width as usize * info.channels as usize * sample_bytes;\n    // ...\n}\n" }],
  diff: "diff --git a/crates/codecs/src/png.rs b/crates/codecs/src/png.rs\n--- a/crates/codecs/src/png.rs\n+++ b/crates/codecs/src/png.rs\n@@ -1,3 +1,4 @@\n fn decode_rows(info: &Info, data: &[u8]) -> Result<Image, DecodeError> {\n+    let bytes_per_sample = if info.bit_depth == 16 { 2 } else { 1 };\n",
}];
