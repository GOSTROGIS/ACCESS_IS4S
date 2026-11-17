// One step = one fresh, locked-down container. Nothing from the host
// environment is passed in: the only env vars are the ones set below. A step
// with network gets neither the gate's env nor the extra mounts, so nothing a
// repository's CI file names can select a program that runs with network.
import { execFile, spawn } from "node:child_process";
import type { WorkerConfig } from "./config.ts";
import { sampleMemory, type MemoryReading } from "./memory.ts";

export const LABEL = "craft-worker";

export type StepMounts = {
  src: string; // /src as an overlay: writable inside the step, the copy on the host never changes
  target: string; // writable /target, private to the task
  cache: string; // writable /cache (CARGO_HOME), private to the task
  out: string; // writable /out, artifacts of this step
};

export type RunSpec = {
  name: string;
  image: string;
  network: "fetch" | "none";
  mounts: StepMounts;
  cmd: string[];
  /** Leave out the /target and /cache mounts. */
  bare?: boolean;
  /** Extra env vars from the repo's CI gate (environment.ts); the worker's own vars win. Not passed to a `fetch` step. */
  env?: Record<string, string>;
  /** Read-only bind mounts: craft-fonts and craft-i18n checkouts. Not mounted in a `fetch` step. */
  extraMounts?: { source: string; target: string }[];
};

const overlay = (source: string, target: string) => {
  if (/[:,]/.test(source)) throw new Error(`source path must not contain ':' or ',': ${source}`);
  return `${source}:${target}:O`;
};
const bind = (source: string, target: string) => `type=bind,source=${source},target=${target}`;

function extraMounts(s: RunSpec): string[] {
  return (s.extraMounts ?? []).flatMap((m) => {
    if (/[,\s\0]/.test(m.source) || /[,\s\0]/.test(m.target)) throw new Error(`mount path must not contain commas or whitespace: ${m.source}`);
    return ["--mount", `${bind(m.source, m.target)},readonly`];
  });
}

export function runArgs(cfg: WorkerConfig, s: RunSpec): string[] {
  const offline = s.network !== "fetch";
  const mem = `${Math.round(cfg.limits.memoryGb * 1024)}m`;
  return [
    "run",
    "--rm",
    "--name", s.name,
    "--label", `${LABEL}=1`,
    "--pull", "missing",
    "--network", s.network === "fetch" ? cfg.fetchNetwork : "none",
    "--read-only",
    "--tmpfs", "/tmp:rw,size=2g",
    "--security-opt", "no-new-privileges",
    "--cap-drop", "all",
    "--userns", cfg.userns,
    "--cpus", String(cfg.limits.cpus),
    "--memory", mem,
    "--memory-swap", mem,
    "--pids-limit", String(cfg.limits.pids),
    "--workdir", "/src",
    // Tests may write next to their sources (CI checkouts are writable); the overlay drops those writes when the step ends.
    "--volume", overlay(s.mounts.src, "/src"),
    ...(s.bare ? [] : ["--mount", bind(s.mounts.target, "/target"), "--mount", bind(s.mounts.cache, "/cache")]),
    "--mount", bind(s.mounts.out, "/out"),
    ...(offline ? extraMounts(s) : []),
    ...(offline ? Object.entries(s.env ?? {}).flatMap(([k, v]) => ["--env", `${k}=${v}`]) : []),
    "--env", "HOME=/tmp",
    "--env", "CARGO_HOME=/cache/cargo",
    "--env", "CARGO_TARGET_DIR=/target",
    "--env", "CI=1",
    s.image,
    ...s.cmd,
  ];
}

function exec(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve) => execFile(cmd, args, { timeout: 30_000 }, () => resolve()));
}

export async function removeContainer(cfg: WorkerConfig, name: string): Promise<void> {
  await exec(cfg.runtime, ["rm", "-f", name]);
}

/** Removes containers left by a previous worker process. */
export async function removeStaleContainers(cfg: WorkerConfig): Promise<void> {
  const ids = await new Promise<string[]>((resolve) =>
    execFile(cfg.runtime, ["ps", "-a", "-q", "--filter", `label=${LABEL}`], { timeout: 30_000 }, (err, out) => resolve(err ? [] : String(out).split("\n").filter((l) => /^[0-9a-zA-Z_.-]+$/.test(l)))),
  );
  for (const id of ids) await exec(cfg.runtime, ["rm", "-f", id]);
}

export type RunOutcome = { exitCode: number | null; timedOut: boolean; cancelled: boolean } & MemoryReading;

export async function runContainer(cfg: WorkerConfig, spec: RunSpec, o: { timeoutMs: number; signal: AbortSignal; onOutput: (b: Buffer) => void }): Promise<RunOutcome> {
  const child = spawn(cfg.runtime, runArgs(cfg, spec), { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", o.onOutput);
  child.stderr.on("data", o.onOutput);
  const memory = sampleMemory(cfg.runtime, spec.name);
  let timedOut = false;
  let cancelled = false;
  let hard: NodeJS.Timeout | undefined;
  const stop = () => {
    void exec(cfg.runtime, ["kill", spec.name]);
    hard ??= setTimeout(() => child.kill("SIGKILL"), 10_000);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, o.timeoutMs);
  const onAbort = () => {
    cancelled = true;
    stop();
  };
  if (o.signal.aborted) onAbort();
  else o.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (c) => resolve(c));
    });
    const mem = await memory.stop();
    // The cgroup can vanish before the last memory.events read, so exit 137 (SIGKILL) with a peak at the limit also counts.
    const limit = Math.round(cfg.limits.memoryGb * 1024) * 1024 * 1024;
    const killed = code === 137 && !timedOut && !cancelled && (mem.peakMemBytes === undefined || mem.peakMemBytes >= limit * 0.9);
    const oomKilled = mem.oomKilled === true || killed ? true : mem.oomKilled;
    return { exitCode: timedOut || cancelled ? null : code, timedOut, cancelled, ...mem, ...(oomKilled === undefined ? {} : { oomKilled }) };
  } finally {
    void memory.stop();
    clearTimeout(timer);
    if (hard) clearTimeout(hard);
    o.signal.removeEventListener("abort", onAbort);
    await removeContainer(cfg, spec.name);
  }
}
