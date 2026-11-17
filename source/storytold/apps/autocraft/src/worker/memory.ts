// Peak memory of one step container, measured on the host from the container's cgroup (v2).
// The container runs with --rm, so its cgroup is gone when it exits: the sampler reads
// memory.peak (the kernel's high-water mark since the cgroup was created) every quarter second and
// keeps the last good value. Without memory.peak it keeps the maximum of memory.current.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

export type MemoryReading = { peakMemBytes?: number; oomKilled?: boolean };

const ROOT = "/sys/fs/cgroup";

/** The cgroup directory of a container's init process, or null when it cannot be resolved. */
export async function cgroupDir(runtime: string, name: string): Promise<string | null> {
  const pid = await new Promise<string>((resolve) =>
    execFile(runtime, ["inspect", "--format", "{{.State.Pid}}", name], { timeout: 10_000 }, (err, out) => resolve(err ? "" : String(out).trim())),
  );
  if (!/^[1-9][0-9]*$/.test(pid)) return null;
  try {
    const line = (await readFile(`/proc/${pid}/cgroup`, "utf8")).split("\n").find((l) => l.startsWith("0::"));
    const path = line?.slice(3).trim();
    if (!path || path.split("/").includes("..")) return null;
    return `${ROOT}${path}`;
  } catch {
    return null;
  }
}

async function num(file: string): Promise<number | undefined> {
  try {
    const n = Number((await readFile(file, "utf8")).trim());
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

async function oomKills(dir: string): Promise<number | undefined> {
  try {
    const m = /^oom_kill (\d+)$/m.exec(await readFile(`${dir}/memory.events`, "utf8"));
    return m ? Number(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

/** Starts sampling the named container; `stop()` returns what was seen. Never throws. */
export function sampleMemory(runtime: string, name: string, intervalMs = 250): { stop(): Promise<MemoryReading> } {
  let dir: string | null = null;
  let peak: number | undefined;
  let maxCurrent: number | undefined;
  let kills: number | undefined;
  let done = false;
  let busy: Promise<void> = Promise.resolve();
  const tick = async () => {
    if (!dir) dir = await cgroupDir(runtime, name);
    if (!dir) return;
    const p = await num(`${dir}/memory.peak`);
    if (p !== undefined) peak = Math.max(peak ?? 0, p);
    const c = await num(`${dir}/memory.current`);
    if (c !== undefined) maxCurrent = Math.max(maxCurrent ?? 0, c);
    const k = await oomKills(dir);
    if (k !== undefined) kills = k;
  };
  const loop = async () => {
    while (!done) {
      await tick().catch(() => {});
      if (!done) await new Promise((r) => setTimeout(r, intervalMs));
    }
  };
  busy = loop();
  return {
    async stop() {
      done = true;
      await busy;
      const value = peak ?? maxCurrent;
      return { ...(value !== undefined && value > 0 ? { peakMemBytes: Math.round(value) } : {}), ...(kills !== undefined ? { oomKilled: kills > 0 } : {}) };
    },
  };
}
