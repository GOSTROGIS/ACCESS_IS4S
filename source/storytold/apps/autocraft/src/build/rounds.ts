// One build round of a patch: a head task (the patch's crate tests, fmt, clippy and the regression test) and a base task
// (the regression test alone, which must fail without the fix). A round is queued in one job and read in a later one, so no
// job waits on a build.
import type { DatabaseSync } from "node:sqlite";
import { TERMINAL, createTask, getTask, type NewTask } from "./tasks.ts";
import { tasksFor } from "../fixissue/index.ts";
import { readLint } from "../prepush/index.ts";
import { baseScopeRepos } from "../pilot.ts";
import { cloneTask, queueWarmBuild } from "../verify/tasks.ts";
import { outcomeOf } from "../verify/results.ts";

export type RoundRequest = { repo: string; sha: string; crate: string; test: string; patch: string; testPatch: string; step?: string };
export type RoundRead =
  | { kind: "pending" }
  | { kind: "retry-env"; why: string }
  | { kind: "fail"; reason: string }
  | { kind: "pass"; formatDiff: string | null };

const oneLine = (s: string, max = 300): string => s.replace(/\s+/g, " ").trim().slice(0, max);

/** The last part of the failing step's log of a finished task, for the next round's prompt. */
export function failureTail(db: DatabaseSync, taskId: number, step: string): string {
  const rows = db.prepare("SELECT chunk FROM build_task_logs WHERE task_id = ? AND step = ? ORDER BY seq DESC LIMIT 40").all(taskId, step) as { chunk: string }[];
  return rows.reverse().map((r) => r.chunk).join("").slice(-2500);
}

/** Queues the round's two tasks, [head, base]. Throws BuildError when they cannot be queued. */
export function queueRound(db: DatabaseSync, r: RoundRequest): [number, number] {
  const ids = tasksFor({ repo: r.repo, number: null, main_sha: r.sha, crate: r.crate, test: r.test }, r.patch, r.testPatch, r.step ?? "fix-check").map((t: NewTask) => createTask(db, t));
  // The warm build is a pipeline task: it would never be claimed for a repo outside the pipeline scope.
  if (baseScopeRepos(db).has(r.repo)) queueWarmBuild(db, r.repo, r.sha);
  return [ids[0]!, ids[1]!];
}

/** Queues the round's tasks again after an environment error. */
export const requeueRound = (db: DatabaseSync, ids: [number, number]): [number, number] => [cloneTask(db, ids[0]), cloneTask(db, ids[1])];

/** What the finished round says. `retried`: the tasks were already queued again once, so an environment error is a failure. */
export function readRound(db: DatabaseSync, ids: [number, number], retried = false): RoundRead {
  const tasks = ids.map((id) => getTask(db, id));
  if (tasks.some((t) => !t)) return { kind: "fail", reason: "the build task no longer exists" };
  if (!tasks.every((t) => t && TERMINAL.includes(t.state))) return { kind: "pending" };
  const head = tasks[0]!, base = tasks[1]!;
  const ho = outcomeOf(head), bo = outcomeOf(base);
  const lint = ho.kind === "pass" && bo.kind !== "error" && head.plan.some((st) => st.name === "clippy") ? readLint(db, head.id) : null;
  if (ho.kind === "error" || bo.kind === "error" || lint?.kind === "infra-failed") {
    const why = ho.kind === "error" ? ho.reason : bo.kind === "error" ? bo.reason : (lint as { reason: string }).reason;
    return retried ? { kind: "fail", reason: `build environment error: ${oneLine(why, 200)}` } : { kind: "retry-env", why: oneLine(why, 120) };
  }
  if (ho.kind === "fail") return { kind: "fail", reason: `with the fix, the ${ho.step} step ${ho.timedOut ? "timed out" : "failed"}:\n${failureTail(db, head.id, ho.step)}` };
  if (bo.kind === "pass") return { kind: "fail", reason: "the regression test passes without the fix, so it does not show the defect" };
  if (bo.kind === "fail" && (bo.step !== "test" || bo.timedOut)) return { kind: "fail", reason: bo.timedOut ? "the regression test timed out without the fix" : `the regression test did not build without the fix (${bo.step} failed)` };
  if (lint?.kind === "result" && lint.findings.length) return { kind: "fail", reason: `clippy findings on the lines the patch changes:\n${lint.findings.slice(0, 5).map((f) => f.rendered).join("\n")}`.slice(0, 1500) };
  return { kind: "pass", formatDiff: lint?.kind === "result" ? lint.formatDiff : null };
}
