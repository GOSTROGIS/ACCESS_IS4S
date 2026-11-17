// The worker loop: hello, claim, run tasks, heartbeats, cancel.
import type { WorkerConfig } from "./config.ts";
import { freeDiskGb } from "./config.ts";
import { ApiError, type WorkerApi } from "./client.ts";
import { removeStaleContainers } from "./container.ts";
import { cleanWarm } from "./warm.ts";
import { executeTask, removeStaleWorkDirs } from "./executor.ts";
import { LogSink } from "./logsink.ts";
import type { Capabilities, ClaimedTask } from "./types.ts";

export const POLL_MS = 5000;
export const HEARTBEAT_MS = 15_000;
const MAX_BACKOFF_MS = 60_000;

/** Delay after the n-th failure in a row (n >= 1): 5 s, 10 s, 20 s ... 60 s. */
export function backoffDelay(failures: number): number {
  return Math.min(POLL_MS * 2 ** Math.max(0, failures - 1), MAX_BACKOFF_MS);
}

export type ServeDeps = {
  cfg: WorkerConfig;
  api: Pick<WorkerApi, "hello" | "claim" | "start" | "log" | "heartbeat" | "upload" | "finish">;
  version: string;
  capabilities: () => Capabilities;
  freeDiskGb?: () => number;
  log: (line: string) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  pollMs?: number;
  heartbeatMs?: number;
  fetchImpl?: typeof fetch;
};

const realSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });

export function pausedReason(freeGb: number, minGb: number): string | null {
  return freeGb < minGb ? `disk ${Math.floor(freeGb)} GB free (needs ${minGb})` : null;
}

export async function serve(d: ServeDeps, signal: AbortSignal): Promise<void> {
  const { cfg, api, log } = d;
  const sleep = d.sleep ?? realSleep;
  const pollMs = d.pollMs ?? POLL_MS;
  const disk = d.freeDiskGb ?? (() => Math.min(freeDiskGb(cfg.workDir), freeDiskGb(cfg.warmDir)));
  log(`removed ${removeStaleWorkDirs(cfg, log)} stale work dir(s)`);
  cleanWarm(cfg, log);
  await removeStaleContainers(cfg);

  const running = new Map<number, AbortController>();
  const jobs = new Set<Promise<void>>();

  let failures = 0;
  const fail = async (what: string, e: unknown) => {
    failures++;
    const wait = backoffDelay(failures);
    log(`${what} failed (${(e as Error).message}); retrying in ${wait / 1000} s`);
    await sleep(wait, signal);
  };

  while (!signal.aborted) {
    try {
      const h = await api.hello(d.version, d.capabilities(), cfg.slots);
      log(`registered as ${h.label} (${h.envId})`);
      failures = 0;
      break;
    } catch (e) {
      await fail("hello", e);
    }
  }

  while (!signal.aborted) {
    const paused = pausedReason(disk(), cfg.limits.minFreeDiskGb);
    const free = paused ? 0 : Math.max(0, cfg.slots - running.size);
    let got = 0;
    try {
      const res = await api.claim(free, paused);
      failures = 0;
      for (const id of res.cancel ?? []) running.get(id)?.abort();
      for (const task of res.tasks.slice(0, free)) {
        got++;
        const ac = new AbortController();
        running.set(task.id, ac);
        const job = runTask(d, task, ac, running).finally(() => {
          running.delete(task.id);
          jobs.delete(job);
        });
        jobs.add(job);
      }
    } catch (e) {
      await fail("claim", e);
      continue;
    }
    if (!(got > 0 && free - got > 0)) await sleep(pollMs, signal);
  }
  for (const ac of running.values()) ac.abort();
  await Promise.all(jobs);
}

async function retry<T>(f: () => Promise<T>, d: ServeDeps, what: string): Promise<T | undefined> {
  const sleep = d.sleep ?? realSleep;
  const never = new AbortController().signal;
  for (let n = 1; n <= 5; n++) {
    try {
      return await f();
    } catch (e) {
      d.log(`${what} failed (${(e as Error).message})`);
      if (n < 5) await sleep(backoffDelay(n), never);
    }
  }
  return undefined;
}

async function runTask(d: ServeDeps, task: ClaimedTask, ac: AbortController, running: Map<number, AbortController>): Promise<void> {
  const { api, log } = d;
  const sink = new LogSink((step, chunk) => api.log(task.id, step, chunk).then(() => {}));
  const hb = setInterval(() => {
    api.heartbeat(task.id).then(
      (r) => {
        for (const id of r.cancel ?? []) running.get(id)?.abort();
      },
      (e) => log(`heartbeat for task ${task.id} failed (${(e as Error).message})`),
    );
  }, d.heartbeatMs ?? HEARTBEAT_MS);
  log(`task ${task.id} (${task.repo}@${task.headSha.slice(0, 12)}) started`);
  let finishArgs: Parameters<typeof api.finish> extends [number, ...infer R] ? R : never;
  try {
    // A 409 means the task is no longer ours (cancelled after the claim): run nothing and report nothing.
    let gone = false;
    await api.start(task.id).catch((e) => {
      if (e instanceof ApiError && e.status === 409) gone = true;
      else log(`start of task ${task.id} failed (${(e as Error).message})`);
    });
    if (gone) {
      log(`task ${task.id} was cancelled before it started`);
      return;
    }
    const r = await executeTask(d.cfg, task, {
      log: (step, chunk) => sink.write(step, chunk),
      artifact: (name, body, ct) => api.upload(task.id, name, body, ct).then(() => {}),
    }, ac.signal, { fetchImpl: d.fetchImpl, note: log });
    if (r.cancelled) {
      log(`task ${task.id} cancelled`);
      return;
    }
    finishArgs = [r.results, r.summary, r.environment];
  } catch (e) {
    log(`task ${task.id} crashed (${(e as Error).message})`);
    if (ac.signal.aborted) return;
    finishArgs = [[], `worker error: ${(e as Error).message}`.slice(0, 300), undefined];
  } finally {
    clearInterval(hb);
    await sink.close();
  }
  await retry(() => api.finish(task.id, ...finishArgs), d, `finish of task ${task.id}`);
  log(`task ${task.id} finished: ${finishArgs[1]}`);
}
