// Shared by the planner prompt (src/prompts, which imports no Node modules) and the Verify stage.

export const KINDS = ["ci-enough", "tests", "regression"] as const;
export type Kind = (typeof KINDS)[number];

/** Most crates one plan may name, and test filters per plan. */
export const MAX_CRATES = 5;
export const MAX_FILTERS = 10;
/** Added lines a regression test may have. */
export const MAX_TEST_LINES = 200;
/** Name (cargo test target and file stem under tests/) of the regression test written for item `n`. One name per item keeps later patches from colliding with files already on the default branch. */
export const regressionName = (n: number | string): string => `autocraft_regression_${n}`;
export const PLAN_BODY_LIMIT = 3000;

export type Crate = { name: string; dir: string };

/** What the planner prompt is rendered from: one PR. `ref` is "repo#number". */
export type VerifyPlanInput = {
  /** Where the call may read the repository in the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  ref: string; title: string; body: string;
  /** File name of the regression test for this PR, saved under tests/ of the chosen crate. */
  test_file_name: string;
  /** The settled type label; regression is allowed only for bugfix. */
  label: string | null;
  /** The repo has upstream CI, which already runs the tests: the plan is `ci-enough` or `regression`, never `tests`. */
  ci: boolean;
  review: { verdict: string; reason: string; risks: string[]; fixes: { file: string; change: string }[] };
  crates: Crate[];
  files: string[]; tests_omitted: string[];
  diff: string;
};

export const SAMPLE_VERIFY_PLAN: VerifyPlanInput[] = [{
  ref: "photocraft#1287", title: "Fix crash when opening a 16-bit PNG with an alpha channel",
  body: "Opening a 16-bit RGBA PNG panicked in the decoder because the row stride was computed for 8-bit samples.\n\nFixes #1279",
  test_file_name: "autocraft_regression_1287.rs", label: "bugfix", ci: true,
  review: { verdict: "take", reason: "Correct stride for 16-bit samples; small and focused.", risks: ["No test for 16-bit grayscale."], fixes: [] },
  crates: [{ name: "codecs", dir: "crates/codecs" }, { name: "photocraft-app", dir: "crates/app" }],
  files: ["crates/codecs/src/png.rs"], tests_omitted: ["crates/codecs/tests/png16.rs"],
  diff: "diff --git a/crates/codecs/src/png.rs b/crates/codecs/src/png.rs\n--- a/crates/codecs/src/png.rs\n+++ b/crates/codecs/src/png.rs\n@@ -88,7 +88,8 @@ fn decode_rows(info: &Info, data: &[u8]) -> Result<Image, DecodeError> {\n-    let stride = info.width as usize * info.channels as usize;\n+    let bytes_per_sample = if info.bit_depth == 16 { 2 } else { 1 };\n+    let stride = info.width as usize * info.channels as usize * bytes_per_sample;\n",
}];

/** Words a failure summary may have, and the part of the failing step's log the summariser sees. */
export const MAX_SUMMARY_WORDS = 60;
export const SUMMARY_LOG_BYTES = 64 * 1024;

/** What the failure-summary prompt is rendered from: one failed step. `log` is the end of its output. */
export type VerifySummaryInput = { ref: string; step: string; command: string; log: string };

export const SAMPLE_VERIFY_SUMMARY: VerifySummaryInput[] = [{
  ref: "photocraft#1287", step: "test", command: "cargo test --offline --locked -p codecs",
  log: "running 2 tests\ntest png::decode_16bit_rgba ... FAILED\ntest png::decode_8bit ... ok\n\nfailures:\n\n---- png::decode_16bit_rgba stdout ----\nthread 'png::decode_16bit_rgba' (16-bit PNG with an alpha channel) panicked at crates/codecs/src/png.rs:91:9:\nassertion `left == right` failed\n  left: 4096\n right: 8192\n\nerror: test failed, to rerun pass `-p codecs --lib`\n",
}];

// Before/after screenshots of a UI pull request (switch: build feature "screenshots").
export const SCREENSHOT_KIND = "screenshot";
/** Steps in a screenshot script, and how many of them may capture an image. */
export const MAX_SHOT_STEPS = 8;
export const MAX_SHOTS = 3;
export const MAX_SHOT_REASON_WORDS = 25;

/** A parameter validator: one of a fixed set of values, an integer range, or a bounded run of characters from a restricted set. */
export type ParamSpec = { enum: string[] } | { int: [number, number] } | { chars: string; min: number; max: number };
/** One command of the repo's screenshot config, as the planner sees it. */
export type ScreenshotCommandInfo = { name: string; doc: string; params: Record<string, ParamSpec>; capture: boolean };
/** A step the planner chose: a command name from the config and a value for each of its params. */
export type ShotStep = { cmd: string; args: Record<string, string | number> };

/** What the screenshot planner prompt is rendered from: one PR. `ref` is "repo#number". */
export type ScreenshotPlanInput = {
  /** Where the call may read the repository in the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  ref: string; title: string; body: string; label: string | null;
  review: { verdict: string; reason: string; risks: string[]; fixes: { file: string; change: string }[] };
  files: string[]; diff: string;
  commands: ScreenshotCommandInfo[];
  /** The repo's usual window size, e.g. "1440x900"; absent when the config has none. */
  size?: string;
};

export const SAMPLE_SCREENSHOT_PLAN: ScreenshotPlanInput[] = [{
  ref: "photocraft#1301", title: "Show the file size next to the export format in the export dialog",
  body: "The export dialog now shows the estimated file size beside each format, so people can compare before exporting.\n\nFixes #1290",
  label: "feature", review: { verdict: "take", reason: "Small, focused UI change with a clear purpose.", risks: [], fixes: [] },
  files: ["crates/ui/src/export_dialog.rs"], size: "1440x900",
  commands: [
    { name: "snap", doc: "Render the main window at the given size and save it as an image.", params: { size: { enum: ["1440x900", "1024x768"] } }, capture: true },
    { name: "export_dialog", doc: "Render the export dialog for the chosen format and save it as an image.", params: { format: { enum: ["png", "jpeg", "webp"] } }, capture: true },
  ],
  diff: "diff --git a/crates/ui/src/export_dialog.rs b/crates/ui/src/export_dialog.rs\n--- a/crates/ui/src/export_dialog.rs\n+++ b/crates/ui/src/export_dialog.rs\n@@ -42,6 +42,7 @@ fn format_row(ui: &mut Ui, f: &Format) {\n     ui.label(f.name());\n+    ui.weak(human_size(f.estimate()));\n }\n",
}];

export const MAX_COMPARE_WORDS = 60;
export const COMPARE_VERDICTS = ["as-claimed", "unrelated", "unclear", "regression"] as const;
export type CompareVerdict = (typeof COMPARE_VERDICTS)[number];

/** What the before/after comparison prompt is rendered from: one PR and its screenshot pairs. `ref` is "repo#number". */
export type ScreenshotCompareInput = {
  /** Where the call reads the images in the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  ref: string; title: string; body: string;
  /** The commands that were run, in order, with their arguments. */
  script: { cmd: string; args: Record<string, string | number> }[];
  review: { verdict: string; reason: string } | null;
  /** Paths are relative to the image directory: `before/<name>` at the base, `after/<name>` at the head. */
  shots: { name: string; before: string; after: string }[];
};

export const SAMPLE_SCREENSHOT_COMPARE: ScreenshotCompareInput[] = [{
  ref: "photocraft#1301", title: "Show the file size next to the export format in the export dialog",
  body: "The export dialog now shows the estimated file size beside each format, so people can compare before exporting.\n\nFixes #1290",
  script: [{ cmd: "export_dialog", args: { format: "png" } }], review: { verdict: "take", reason: "Small, focused UI change with a clear purpose." },
  shots: [{ name: "s1.png", before: "before/s1.png", after: "after/s1.png" }],
}];
