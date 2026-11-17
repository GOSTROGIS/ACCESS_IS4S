// Shared by the fix-issue prompts (src/prompts, which imports no Node modules) and the Fix stage.
import { MAX_TEST_LINES, regressionName, type Crate } from "../verify/types.ts";

export { MAX_TEST_LINES, regressionName, type Crate };

/** Files the triage may ask to read, and the largest source path list the model is shown. */
export const MAX_FILES = 8;
export const MAX_PATHS = 3000;
/** Characters of one file, of all files, and of the issue body shown to the models. */
export const FILE_CAP = 40_000;
export const TOTAL_CAP = 120_000;
export const ISSUE_BODY_LIMIT = 6000;
export const COMMENTS_SHOWN = 8;
export const COMMENT_CHARS = 1000;
export const MAX_ROUNDS = 3;
export const TRIAGE_REASON_WORDS = 25;

export type IssueText = { ref: string; title: string; body: string; comments: { author: string; body: string }[] };

/** What the triage prompt is rendered from. */
export type TriageInput = IssueText & { crates: Crate[]; paths: string[]; /** Where the call may read the repository in the sandbox; with it, `paths` is not shown. */ repo_dir?: string };

/** What the patch prompt is rendered from. `previous` is set on later rounds. */
export type PatchInput = IssueText & {
  crate: Crate; test_path: string;
  /** Each file the patch may edit: its content, or only the path when the call has a checkout to read it from. */
  files: { path: string; content?: string }[];
  previous?: { patch: string; failure: string };
  /** Where the call may read the repository in the sandbox. */
  repo_dir?: string;
};

export const SAMPLE_TRIAGE: TriageInput[] = [{
  ref: "photocraft#1279", title: "Crash when opening a 16-bit PNG with alpha",
  body: "Opening a 16-bit RGBA PNG panics in the decoder: index out of bounds in decode_rows.",
  comments: [{ author: "reporter", body: "Happens with every 16-bit file I tried." }],
  crates: [{ name: "codecs", dir: "crates/codecs" }],
  paths: ["crates/codecs/src/lib.rs", "crates/codecs/src/png.rs", "crates/codecs/src/jpeg.rs"],
}];

export const SAMPLE_PATCH: PatchInput[] = [{
  ref: "photocraft#1279", title: "Crash when opening a 16-bit PNG with alpha",
  body: "Opening a 16-bit RGBA PNG panics in the decoder: index out of bounds in decode_rows.", comments: [],
  crate: { name: "codecs", dir: "crates/codecs" }, test_path: "crates/codecs/tests/autocraft_regression_1279.rs",
  files: [{ path: "crates/codecs/src/png.rs", content: "fn stride(width: usize, channels: usize) -> usize {\n    width * channels\n}\n" }],
}];
