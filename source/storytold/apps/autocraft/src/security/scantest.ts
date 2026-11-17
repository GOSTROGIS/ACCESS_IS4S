// The scan test of a finding (feature scan-tests): the model writes a Rust test from the test Verify proposed, the build
// worker runs it on the pinned commit, and the outcome marks the finding. The scan job writes and queues; a later tick of
// the runner reads the task, so no job waits on a build and the read is database work only. Nothing here changes a finding's
// state or severity except a note on one whose test passed; only a person decides what that means.
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { featureOn } from "../build/features.ts";
import { BuildError } from "../build/envs.ts";
import { TERMINAL, cancelTask, createTask, getTask, privateClockStart } from "../build/tasks.ts";
import { tasksFor } from "../fixissue/index.ts";
import { cloneTask } from "../verify/tasks.ts";
import { outcomeOf } from "../verify/results.ts";
import { patchFor, patchProblem, regressionPath } from "../verify/plan.ts";
import { regressionName } from "../verify/types.ts";
import type { CratesResult } from "../verify/crates.ts";
import type { ScanTestState } from "../../web/src/api/types.ts";
import { ROUND_BUILD_LIMIT_MS } from "./actions.ts";
import { crateOf } from "./fix.ts";
import { advance } from "./store.ts";
import type { SecurityScanTestInput } from "./rules.ts";

/** Build tasks of scan tests queue behind the work that waits for a person. */
export const SCAN_TEST_PRIORITY = -5;
export const NOT_SHOWN_NOTE = "The proposed test passes on the current code.";

const now = (): string => new Date().toISOString();
const oneLine = (s: string, max = 300): string => s.replace(/\s+/g, " ").trim().slice(0, max);

/** The scan test's file name: derived from the repo and finding, and different from the name of the fix's regression test. */
export const scanTestName = (repo: string, n: number): string => regressionName(createHash("sha256").update(`scan:${repo}#${n}`).digest("hex").slice(0, 10));

export type WriteOpts = {
  repo: string;
  number: number;
  sha: string;
  finding: SecurityScanTestInput["finding"];
  proposedTest: string;
  crates: CratesResult;
  /** The model call (through the scan's cost and timeline bookkeeping): the test file, or null when none could be read. */
  write: (input: Omit<SecurityScanTestInput, "repo" | "number" | "project" | "commit">) => Promise<{ value: string } | null>;
  log: (line: string) => void;
};

/**
 * Writes the finding's test and queues its build task. Returns true when a task was queued (the row is `building`), false
 * when the finding has none: the sink is not in a Rust crate, the model gave no test, or the test failed the patch check.
 */
export async function writeAndQueue(db: DatabaseSync, o: WriteOpts): Promise<boolean> {
  const { repo, number: n } = o;
  if (!o.crates.ok || !o.crates.rust) return false;
  const crate = crateOf(o.crates.crates, o.finding.refs[0]?.path ?? "");
  if (!crate || !/^[A-Za-z0-9_./-]+$/.test(crate.dir) || crate.dir.split("/").includes("..")) { o.log(`${repo} finding ${n}: no scan test: the sink is not in a Rust crate`); return false; }
  const name = scanTestName(repo, n);
  const path = regressionPath(crate.dir, name);
  const written = await o.write({ finding: o.finding, crate: { name: crate.name, dir: crate.dir }, test_path: path, proposed_test: o.proposedTest });
  if (!written) { o.log(`${repo} finding ${n}: no scan test: the model gave no readable test`); return false; }
  const patch = patchFor(crate.dir, name, written.value);
  const problem = patchProblem(patch, path);
  if (problem) { o.log(`${repo} finding ${n}: no scan test: ${problem}`); return false; }
  let id: number;
  try {
    const base = tasksFor({ repo, number: null, main_sha: o.sha, crate: crate.name, test: name }, patch, patch, "scan-test")[1]!;
    id = createTask(db, { ...base, priority: SCAN_TEST_PRIORITY });
  } catch (e) {
    if (!(e instanceof BuildError)) throw e;
    o.log(`${repo} finding ${n}: no scan test: the build task was not queued: ${e.message}`);
    return false;
  }
  db.prepare(`INSERT OR REPLACE INTO security_scan_tests (repo, number, test_path, crate, test_patch, test_source, task_id, retried, state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'building', ?)`).run(repo, n, path, crate.name, patch, written.value, id, now());
  o.log(`${repo} finding ${n}: scan test queued for build`);
  return true;
}

type Row = { repo: string; number: number; task_id: number; retried: number; created_at: string };

function finish(db: DatabaseSync, r: Row, state: Exclude<ScanTestState, "building">, detail: string): void {
  db.prepare("UPDATE security_scan_tests SET state = ?, detail = ?, ended_at = ? WHERE repo = ? AND number = ? AND state = 'building'").run(state, detail, now(), r.repo, r.number);
  if (state === "not-shown") advance(db, r.repo, r.number, ["new"], "new", { note: NOT_SHOWN_NOTE });
}

/**
 * Reads the build task of each `building` scan test: a failure at the test step is `confirmed`, a pass is `not-shown`, a build
 * failure, a timeout or a second environment error is `could-not-build` (a first environment error queues the task again).
 * A task still running after ROUND_BUILD_LIMIT_MS is cancelled. Returns the tests that ended.
 */
export function advanceScanTests(db: DatabaseSync): { repo: string; number: number; state: ScanTestState }[] {
  if (!featureOn(db, "scan-tests")) return [];
  const rows = db.prepare("SELECT repo, number, task_id, retried, created_at FROM security_scan_tests WHERE state = 'building' ORDER BY repo, number").all() as Row[];
  const ended: { repo: string; number: number; state: ScanTestState }[] = [];
  const end = (r: Row, state: Exclude<ScanTestState, "building">, detail: string): void => { finish(db, r, state, detail); ended.push({ repo: r.repo, number: r.number, state }); };
  for (const r of rows) {
    const task = getTask(db, r.task_id);
    if (!task) { end(r, "could-not-build", "the build task no longer exists"); continue; }
    if (!TERMINAL.includes(task.state)) {
      const since = privateClockStart(db, r.created_at);
      if (since === null || Date.now() - since <= ROUND_BUILD_LIMIT_MS) continue;
      cancelTask(db, r.task_id, "security-scan");
      end(r, "could-not-build", "the build did not finish in time");
      continue;
    }
    const o = outcomeOf(task);
    if (o.kind === "pass") { end(r, "not-shown", NOT_SHOWN_NOTE); continue; }
    if (o.kind === "fail") {
      if (o.step === "test" && !o.timedOut) end(r, "confirmed", "The test failed on the pinned commit.");
      else end(r, "could-not-build", o.timedOut ? `the ${o.step} step timed out` : `the ${o.step} step failed before the test ran`);
      continue;
    }
    if (r.retried === 0) {
      try {
        db.prepare("UPDATE security_scan_tests SET task_id = ?, retried = 1 WHERE repo = ? AND number = ?").run(cloneTask(db, r.task_id), r.repo, r.number);
        continue;
      } catch (e) {
        if (!(e instanceof BuildError)) throw e;
      }
    }
    end(r, "could-not-build", `build environment error: ${oneLine(o.reason, 200)}`);
  }
  return ended;
}
