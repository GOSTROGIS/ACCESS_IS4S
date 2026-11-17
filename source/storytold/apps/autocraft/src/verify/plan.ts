// The planner's reply, validated hard: anything that does not check out is an error and creates no task.
import { wholeReplyJson } from "../core/reply-json.ts";
import { paramValueError, type ScreenshotConfigBody } from "./screenshot-config.ts";
import { COMPARE_VERDICTS, KINDS, MAX_COMPARE_WORDS, MAX_CRATES, MAX_FILTERS, MAX_SHOT_REASON_WORDS, MAX_SHOT_STEPS, MAX_SHOTS, MAX_TEST_LINES, regressionName, type CompareVerdict, type Crate, type Kind, type ShotStep } from "./types.ts";

export const FILTER_RE = /^[A-Za-z0-9_:]{1,100}$/;
const MAX_REASON_WORDS = 25;

export type VerifyPlan =
  | { kind: "ci-enough"; reason: string }
  | { kind: "tests"; reason: string; crates: string[]; tests: string[] }
  | { kind: "regression"; reason: string; crate: string; dir: string; test: string; patch: string };

export type Parsed = { ok: true; plan: VerifyPlan } | { ok: false; error: string };

const fail = (error: string): Parsed => ({ ok: false, error });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Path of the test file `name` (a cargo test target name) for a crate directory ("." is the repo root). */
export const regressionPath = (dir: string, name: string): string => (dir === "." ? `tests/${name}.rs` : `${dir}/tests/${name}.rs`);

/** The diff that adds `content` as the crate's test file `name`. */
export function patchFor(dir: string, name: string, content: string): string {
  const path = regressionPath(dir, name);
  const body = content.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  return `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${body.length} @@\n${body.map((l) => `+${l}`).join("\n")}\n`;
}

/**
 * Checks by parsing that `patch` adds exactly one new file, `path`, with at most MAX_TEST_LINES lines and
 * nothing else: no other file, no deletion, rename, mode change or binary content. Returns why not, or null.
 */
export function patchProblem(patch: string, path: string): string | null {
  if (!patch.endsWith("\n")) return "patch does not end with a newline";
  const lines = patch.slice(0, -1).split("\n");
  const header = [`diff --git a/${path} b/${path}`, "new file mode 100644", "--- /dev/null", `+++ b/${path}`];
  for (let i = 0; i < header.length; i++) if (lines[i] !== header[i]) return `patch line ${i + 1} is not "${header[i]}"`;
  const hunk = /^@@ -0,0 \+1,(\d+) @@$/.exec(lines[4] ?? "");
  if (!hunk) return "patch has no single new-file hunk";
  const body = lines.slice(5);
  if (body.some((l) => !l.startsWith("+"))) return "patch has lines other than additions";
  if (body.length !== Number(hunk[1])) return "hunk length does not match its lines";
  if (body.length < 1 || body.length > MAX_TEST_LINES) return `regression test must have 1 to ${MAX_TEST_LINES} lines`;
  if (body.some((l) => l.includes("\0"))) return "patch must be text";
  return null;
}

const clip = (s: string): string => s.trim().split(/\s+/).slice(0, MAX_REASON_WORDS).join(" ");

/**
 * Parses and validates the reply for the PR `ref`. `crates` is the workspace's list; `label` the settled type label.
 */
export function parsePlanReply(text: string, ref: string, crates: Crate[], label: string | null, ci = false): Parsed {
  const arr = wholeReplyJson(text);
  if (arr === null) return fail("reply is not exactly one JSON list");
  if (!Array.isArray(arr) || arr.length !== 1 || !isObj(arr[0])) return fail("reply must be a list of one object");
  const o = arr[0];
  if (o.ref !== ref) return fail("reply is for another PR");
  if (typeof o.kind !== "string" || !(KINDS as readonly string[]).includes(o.kind)) return fail("unknown kind");
  if (typeof o.reason !== "string" || !o.reason.trim()) return fail("reason is missing");
  const reason = clip(o.reason);
  const kind = o.kind as Kind;
  // CI already runs the tests: a planner that asks for them has nothing more to add.
  if (kind === "ci-enough" || (kind === "tests" && ci)) return { ok: true, plan: { kind: "ci-enough", reason } };
  const names = new Set(crates.map((c) => c.name));
  if (kind === "tests") {
    const cs = o.crates, ts = o.tests ?? [];
    if (!Array.isArray(cs) || cs.length < 1 || cs.length > MAX_CRATES) return fail(`crates must list 1 to ${MAX_CRATES} names`);
    if (cs.some((c) => typeof c !== "string" || !names.has(c))) return fail("crates names a crate that is not in the workspace");
    if (!Array.isArray(ts) || ts.length > MAX_FILTERS || ts.some((t) => typeof t !== "string" || !FILTER_RE.test(t))) return fail("a test filter is not valid");
    return { ok: true, plan: { kind, reason, crates: [...new Set(cs as string[])], tests: ts as string[] } };
  }
  if (label !== "bugfix") return fail("regression is only for bugfix PRs");
  const c = crates.find((x) => x.name === o.crate);
  if (!c || typeof o.crate !== "string") return fail("crate is not in the workspace");
  if (!/^[A-Za-z0-9_./-]+$/.test(c.dir) || c.dir.split("/").includes("..")) return fail("crate directory is not a plain path");
  if (typeof o.test_file !== "string" || !o.test_file.trim()) return fail("test_file is missing");
  const test = regressionName(Number(ref.slice(ref.lastIndexOf("#") + 1)));
  const patch = patchFor(c.dir, test, o.test_file);
  const problem = patchProblem(patch, regressionPath(c.dir, test));
  if (problem) return fail(problem);
  return { ok: true, plan: { kind, reason, crate: c.name, dir: c.dir, test, patch } };
}

/** The screenshot planner's decision: no screenshot, or the script to run. */
export type ScreenshotPlan = { screenshot: false; reason: string } | { screenshot: true; reason: string; steps: ShotStep[] };
export type ScreenshotParsed = { ok: true; plan: ScreenshotPlan } | { ok: false; error: string };

const shotFail = (error: string): ScreenshotParsed => ({ ok: false, error });

/**
 * Parses and validates the reply for the PR `ref` against the repo's screenshot config: every command is one of the
 * config's, every argument passes its validator, and the script has 1 to MAX_SHOT_STEPS steps of which 1 to MAX_SHOTS capture.
 */
export function parseScreenshotReply(text: string, ref: string, config: Pick<ScreenshotConfigBody, "commands">): ScreenshotParsed {
  const arr = wholeReplyJson(text);
  if (arr === null) return shotFail("the reply is not exactly one JSON value");
  if (!Array.isArray(arr) || arr.length !== 1 || !isObj(arr[0])) return shotFail("reply must be a list of one object");
  const o = arr[0];
  const extra = Object.keys(o).find((k) => !["ref", "screenshot", "reason", "steps"].includes(k));
  if (extra) return shotFail(`unknown key "${extra}"`);
  if (o.ref !== ref) return shotFail("reply is for another PR");
  if (typeof o.screenshot !== "boolean") return shotFail("screenshot must be true or false");
  if (typeof o.reason !== "string" || !o.reason.trim()) return shotFail("reason is missing");
  const reason = o.reason.trim().split(/\s+/).slice(0, MAX_SHOT_REASON_WORDS).join(" ");
  if (!o.screenshot) return { ok: true, plan: { screenshot: false, reason } };
  const raw = o.steps;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SHOT_STEPS) return shotFail(`steps must list 1 to ${MAX_SHOT_STEPS} steps`);
  const steps: ShotStep[] = [];
  let shots = 0;
  for (const [i, s] of raw.entries()) {
    const at = `step ${i + 1}`;
    if (!isObj(s)) return shotFail(`${at} must be an object`);
    const k = Object.keys(s).find((x) => x !== "cmd" && x !== "args");
    if (k) return shotFail(`${at}: unknown key "${k}"`);
    const spec = typeof s.cmd === "string" && Object.hasOwn(config.commands, s.cmd) ? config.commands[s.cmd] : undefined;
    if (!spec || typeof s.cmd !== "string") return shotFail(`${at}: cmd is not one of the listed commands`);
    const args = s.args ?? {};
    if (!isObj(args)) return shotFail(`${at}: args must be an object`);
    for (const name of Object.keys(args)) if (!Object.hasOwn(spec.params, name)) return shotFail(`${at}: unknown argument "${name}"`);
    for (const [name, p] of Object.entries(spec.params)) {
      if (!Object.hasOwn(args, name)) return shotFail(`${at}: argument "${name}" is missing`);
      const why = paramValueError(p, args[name]);
      if (why) return shotFail(`${at}: argument "${name}" ${why}`);
    }
    if (spec.capture) shots++;
    steps.push({ cmd: s.cmd, args: args as Record<string, string | number> });
  }
  if (shots < 1) return shotFail("the script needs at least one capture command");
  if (shots > MAX_SHOTS) return shotFail(`at most ${MAX_SHOTS} capture commands`);
  return { ok: true, plan: { screenshot: true, reason, steps } };
}

/** The comparison of the before and after screenshots of one PR. */
export type CompareResult = { verdict: CompareVerdict; clear: boolean; summary: string };
export type CompareParsed = { ok: true; result: CompareResult } | { ok: false; error: string };

/** Parses the comparison reply for the PR `ref`: one object with a verdict, `clear` and a summary cut to MAX_COMPARE_WORDS words. */
export function parseCompareReply(text: string, ref: string): CompareParsed {
  const bad = (error: string): CompareParsed => ({ ok: false, error });
  const arr = wholeReplyJson(text);
  if (arr === null) return bad("the reply is not exactly one JSON value");
  if (!Array.isArray(arr) || arr.length !== 1 || !isObj(arr[0])) return bad("reply must be a list of one object");
  const o = arr[0];
  const extra = Object.keys(o).find((k) => !["ref", "verdict", "clear", "summary"].includes(k));
  if (extra) return bad(`unknown key "${extra}"`);
  if (o.ref !== ref) return bad("reply is for another PR");
  if (typeof o.verdict !== "string" || !(COMPARE_VERDICTS as readonly string[]).includes(o.verdict)) return bad("unknown verdict");
  if (typeof o.clear !== "boolean") return bad("clear must be true or false");
  if (typeof o.summary !== "string" || !o.summary.trim()) return bad("summary is missing");
  return { ok: true, result: { verdict: o.verdict as CompareVerdict, clear: o.clear, summary: o.summary.trim().split(/\s+/).slice(0, MAX_COMPARE_WORDS).join(" ") } };
}
