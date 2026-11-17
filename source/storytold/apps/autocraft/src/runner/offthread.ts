// The runner's helper thread: runs `plan` (autopilot detection) and `flow` (flowchart summary
// refresh) off the runner's polling loop. One worker, started on first use and kept, so its
// connection and caches stay warm; tasks queue in it one at a time.
import { Worker } from "node:worker_threads";
import type { Detected } from "./autopilot.ts";
import type { WorkerReply, WorkerTask } from "./worker.ts";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class OffThread {
  private worker: Worker | null = null;
  private readonly pending = new Map<number, Pending>();
  private next = 1;

  private readonly dbFile: string;

  constructor(dbFile: string) {
    this.dbFile = dbFile;
  }

  private spawn(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./worker.ts", import.meta.url), { workerData: { dbFile: this.dbFile } });
    const fail = (e: Error) => {
      if (this.worker === w) this.worker = null;
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
    };
    w.on("message", (r: WorkerReply) => {
      const p = this.pending.get(r.id);
      this.pending.delete(r.id);
      if (!p) return;
      if (r.ok) p.resolve(r.result);
      else p.reject(new Error(r.error));
    });
    w.on("error", fail);
    w.on("exit", (code) => fail(new Error(`runner worker exited with code ${code}`)));
    w.unref();
    this.worker = w;
    return w;
  }

  private call<T>(task: Omit<WorkerTask, "id">): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.spawn().postMessage({ ...task, id });
    });
  }

  plan(nowMs?: number): Promise<Detected> {
    return this.call<Detected>({ task: "plan", ...(nowMs === undefined ? {} : { nowMs }) });
  }

  flow(budgetMs?: number): Promise<string[]> {
    return this.call<string[]>({ task: "flow", ...(budgetMs === undefined ? {} : { budgetMs }) });
  }

  async close(): Promise<void> {
    const w = this.worker;
    this.worker = null;
    if (w) await w.terminate();
  }
}
