// Worker thread of the runner (see offthread.ts): runs the planner's detection and the
// flowchart refresh on its own database connection, so the runner's loop keeps its heartbeat,
// cancels and job starts whatever these cost.
import { parentPort, workerData } from "node:worker_threads";
import { connect } from "../db.ts";
import { refreshSummary } from "../flow/summary.ts";
import { detectAutopilot } from "./autopilot.ts";

export type WorkerTask = { id: number; task: "plan"; nowMs?: number } | { id: number; task: "flow"; budgetMs?: number };
export type WorkerReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

const db = connect((workerData as { dbFile: string }).dbFile);

parentPort!.on("message", async (m: WorkerTask) => {
  try {
    const result = m.task === "plan" ? await detectAutopilot(db, m.nowMs === undefined ? {} : { nowMs: m.nowMs }) : refreshSummary(db, m.budgetMs);
    parentPort!.postMessage({ id: m.id, ok: true, result } satisfies WorkerReply);
  } catch (e) {
    parentPort!.postMessage({ id: m.id, ok: false, error: (e as Error).stack ?? String(e) } satisfies WorkerReply);
  }
});
