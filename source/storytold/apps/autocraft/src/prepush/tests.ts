// Tests before push: the `tests` step of the lint task runs `cargo test` for the crates a model-written patch touches.
// A failing test goes back to the model once; after that the push proceeds and the failures are noted (a test can fail
// on the PR without our patch, and nothing here compares against the base).
import type { DatabaseSync } from "node:sqlite";
import type { TaskStep } from "../../web/src/api/types.ts";
import { LINT_MAX_ROUNDS } from "../core/rules.ts";
import { cachedCrates, type CratesFetcher } from "../verify/crates.ts";
import type { Crate } from "../verify/types.ts";
import { featureOn } from "../build/features.ts";
import type { Finding, LintJob } from "./index.ts";

export const TESTS_STEP = "tests";
export const TESTS_ARTIFACT = "tests.txt";
export const TESTS_EXIT_ARTIFACT = "tests.exit";
export const TESTS_RERUN_ARTIFACT = "tests-rerun.txt";
export const TESTS_RERUN_EXIT_ARTIFACT = "tests-rerun.exit";
/** The step's own time limit: the first run gets 900 s inside it, the rerun of failed tests the rest. */
export const TEST_STEP_MAX_SEC = 1200;
/** More affected crates than this: no tests step (clippy still covers compile errors). */
export const PUSH_TEST_CRATES_MAX = 6;
/** Characters of one failing test's output kept for the model. */
const RENDERED_CAP = 2000;

/** The crates (by name) owning the changed paths: the crate with the longest `dir` prefix, `.` taking the rest. Null when none is owned, when only root-level files changed, or when more than PUSH_TEST_CRATES_MAX crates are affected. */
export function testCrates(changed: string[], crates: Crate[]): string[] | null {
  const names = new Set<string>();
  for (const path of changed) {
    let best: Crate | null = null;
    for (const c of crates) {
      const inside = c.dir === "." || path === c.dir || path.startsWith(`${c.dir}/`);
      if (inside && (!best || c.dir.length > best.dir.length)) best = c;
    }
    if (!best) continue;
    // A root crate owns only what lives under its own directories; files like Cargo.lock beside a workspace manifest do not count.
    if (best.dir === "." && !path.includes("/")) continue;
    names.add(best.name);
  }
  if (!names.size || names.size > PUSH_TEST_CRATES_MAX) return null;
  return [...names].sort();
}

// The first run's exit code and output are artifacts; the failed tests alone run again to tell a flake from a failure.
const TESTS_SCRIPT = `P=""; for c in "$@"; do P="$P -p $c"; done
timeout 900 cargo test --offline --locked --no-fail-fast --color never $P > /out/${TESTS_ARTIFACT} 2>&1; echo $? > /out/${TESTS_EXIT_ARTIFACT}
if [ "$(cat /out/${TESTS_EXIT_ARTIFACT})" != 0 ]; then
  names=$(sed -n 's/^test \\([^ ]*\\) \\.\\.\\. FAILED.*/\\1/p' /out/${TESTS_ARTIFACT})
  if [ -n "$names" ]; then
    timeout 240 cargo test --offline --locked --no-fail-fast --color never $P -- --exact $names > /out/${TESTS_RERUN_ARTIFACT} 2>&1; echo $? > /out/${TESTS_RERUN_EXIT_ARTIFACT}
  fi
fi
true`;

export function testsStep(crates: string[]): TaskStep {
  return { name: TESTS_STEP, cmd: ["sh", "-c", TESTS_SCRIPT, TESTS_STEP, ...crates], network: "none", timeoutSec: TEST_STEP_MAX_SEC, artifacts: [TESTS_ARTIFACT, TESTS_EXIT_ARTIFACT, TESTS_RERUN_ARTIFACT, TESTS_RERUN_EXIT_ARTIFACT] };
}

export type TestsInput = { text: string | null; exit: number | null; rerunText: string | null; rerunExit: number | null; timedOut: boolean };
export type TestsClass = { kind: "pass" } | { kind: "failed"; names: string[]; rendered: Map<string, string> } | { kind: "inconclusive"; note: string };

const failedNames = (text: string): string[] => [...new Set([...text.matchAll(/^test (\S+) \.\.\. FAILED/gm)].map((m) => m[1]!))];
const TO_RERUN = /error: test failed, to rerun pass/;

/** The panic block of one test in cargo's output, or the tail of the output. */
function blockOf(name: string, text: string): string {
  const at = text.indexOf(`---- ${name} stdout ----`);
  if (at >= 0) {
    const rest = text.slice(at);
    const end = rest.slice(10).search(/\n---- |\n\nfailures:\n/);
    return (end >= 0 ? rest.slice(0, end + 10) : rest).trim().slice(0, RENDERED_CAP);
  }
  return text.trim().slice(-RENDERED_CAP);
}

/** A failure needs a failing test (or a crash) that still fails on the rerun. Anything about the environment, or a flake, is inconclusive and never blocks the push. */
export function classifyTests(i: TestsInput): TestsClass {
  if (i.timedOut) return { kind: "inconclusive", note: "tests timed out" };
  if (i.exit === null || i.text === null) return { kind: "inconclusive", note: "tests returned no result" };
  if (i.exit === 0) return { kind: "pass" };
  if (i.exit === 137 || i.exit === 124) return { kind: "inconclusive", note: i.exit === 124 ? "tests timed out" : "tests were killed (out of memory)" };
  if (/No space left on device/.test(i.text)) return { kind: "inconclusive", note: "tests ran out of disk space" };
  const first = failedNames(i.text);
  if (i.rerunExit !== null && i.rerunText !== null) {
    if (i.rerunExit === 0) return { kind: "inconclusive", note: `flaky: ${first.join(", ")} passed on rerun` };
    const still = failedNames(i.rerunText);
    if (!still.length && !TO_RERUN.test(i.rerunText)) return { kind: "inconclusive", note: "the rerun of the failed tests did not run" };
    const names = still.length ? still : first;
    return { kind: "failed", names, rendered: new Map(names.map((n) => [n, blockOf(n, i.rerunText!)])) };
  }
  // No rerun: a crash with no named test (signal, abort) is a failure; a build error is not (clippy reports those).
  if (!first.length && TO_RERUN.test(i.text) && !/could not compile/.test(i.text)) return { kind: "failed", names: ["(test binary crashed)"], rendered: new Map([["(test binary crashed)", i.text.trim().slice(-RENDERED_CAP)]]) };
  return { kind: "inconclusive", note: first.length ? "the failed tests were not run again" : "tests did not run (build error or no test output)" };
}

export function testFindings(c: Extract<TestsClass, { kind: "failed" }>): Finding[] {
  return c.names.map((n) => ({ level: "error" as const, code: "test", message: `test ${n} failed`, file: "", line: 0, rendered: c.rendered.get(n) ?? `test ${n} failed` }));
}

export const isTestFinding = (f: Finding): boolean => f.code === "test";

/** "clippy findings", or "clippy and test findings" when both are present, for messages about findings that remain. */
export function findingsWord(findings: Finding[]): string {
  const tests = findings.some(isTestFinding), other = findings.some((f) => !isTestFinding(f));
  return tests && other ? "clippy and test findings" : tests ? "test findings" : "clippy findings";
}

export type LintVerdict =
  | { action: "clean" }
  | { action: "ask"; texts: string[] }
  | { action: "fail"; first: Finding }
  /** Only test findings remain after the one round they get: the push goes ahead and `note` records them. */
  | { action: "push"; note: string };

/**
 * What a collect step does with the findings after lint round `round`. Clippy and format findings: asked again until
 * LINT_MAX_ROUNDS, then the patch is given up. Test findings alone: asked once, then pushed with a note.
 */
export function lintVerdict(findings: Finding[], round: number, max = LINT_MAX_ROUNDS): LintVerdict {
  if (!findings.length) return { action: "clean" };
  const hard = findings.filter((f) => !isTestFinding(f));
  if (hard.length) return round >= max ? { action: "fail", first: hard[0]! } : { action: "ask", texts: findings.map((f) => f.rendered) };
  if (round >= max) return { action: "push", note: `tests still failing after ${round} rounds: ${findings.map((f) => f.message.replace(/^test (.*) failed$/, "$1")).join(", ")}` };
  return { action: "ask", texts: findings.map((f) => f.rendered) };
}

/** The text for the job log and the push note: the verdict's note and the tests note of an inconclusive run. */
export const testsNoteOf = (verdict: LintVerdict, testsNote: string | undefined): string | null => [verdict.action === "push" ? verdict.note : null, testsNote ?? null].filter(Boolean).join("; ") || null;

/** The changed paths of a patch, both sides (a deleted file counts). */
export function patchPaths(patch: string): string[] {
  const out = new Set<string>();
  for (const l of patch.split("\n")) {
    const m = /^(?:\+\+\+|---) (?:[ab]\/)?(\S+)/.exec(l);
    if (m && m[1] !== "/dev/null") out.add(m[1]!);
  }
  return [...out];
}

/** The crates whose tests the job's patch calls for; null when the switch is off, the crates cannot be read, or the rules say none. Fetches only when the switch is on. */
export async function testsFeatureCrates(db: DatabaseSync, j: LintJob, fetch: CratesFetcher): Promise<string[] | null> {
  return featureOn(db, "push-tests", j.repo) ? cratesForTests(j, fetch) : null;
}

/** The same without the switch, for the operator's `lint --tests`. */
export async function cratesForTests(j: LintJob, fetch: CratesFetcher): Promise<string[] | null> {
  try {
    const info = await cachedCrates(j.repo, j.head, fetch);
    if (!info.ok || !info.rust) return null;
    return testCrates([...patchPaths(j.patch ?? ""), ...(j.files ?? [])], info.crates);
  } catch {
    return null;
  }
}
