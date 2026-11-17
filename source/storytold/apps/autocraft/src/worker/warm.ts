// Warm cargo target dirs: at most one per repo key under cfg.warmDir, built
// by a `role: "build"` task (upstream main) and copied into `role: "use"`
// tasks. A use task works on its copy, so a PR build never changes the warm dir.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkerConfig } from "./config.ts";
import { PATCH_MAX_BYTES } from "./patch.ts";
import { removeTree } from "./rmtree.ts";

export const WARM_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** `stored` is when the main build finished (carried through the shared store); older records have none. */
export type WarmRecord = { commit: string; bytes: number; lastUsed: number; stored?: number };

/** Why the optional `patch` / `warm` fields of a claimed task are malformed, or null. */
export function taskFieldProblem(task: { patch?: unknown; warm?: unknown }): string | null {
  if (task.patch !== undefined) {
    if (typeof task.patch !== "string") return "patch must be a string";
    if (Buffer.byteLength(task.patch) > PATCH_MAX_BYTES) return "patch is over 1 MiB";
  }
  if (task.warm !== undefined) {
    const w = task.warm as { key?: unknown; role?: unknown } | null;
    if (typeof w !== "object" || w === null || Array.isArray(w)) return "warm must be an object";
    if (typeof w.key !== "string" || !WARM_KEY.test(w.key)) return "warm.key is malformed";
    if (w.role !== "use" && w.role !== "build") return "warm.role must be use or build";
    if (w.role === "build" && task.patch !== undefined) return "a build task cannot carry a patch";
  }
  return null;
}

const locks = new Map<string, Promise<unknown>>();
/** Serializes work on one key: a copy must not run while the dir is replaced or evicted. */
export function locked<T>(key: string, f: () => Promise<T>): Promise<T> {
  const next = (locks.get(key) ?? Promise.resolve()).then(f, f);
  locks.set(key, next.catch(() => {}));
  return next;
}

export const dirOf = (cfg: WorkerConfig, key: string) => join(cfg.warmDir, key);
const recOf = (cfg: WorkerConfig, key: string) => join(cfg.warmDir, `${key}.json`);

export function readRecord(cfg: WorkerConfig, key: string): WarmRecord | null {
  try {
    const r = JSON.parse(readFileSync(recOf(cfg, key), "utf8")) as WarmRecord;
    return typeof r.bytes === "number" && typeof r.lastUsed === "number" ? r : null;
  } catch {
    return null;
  }
}

function writeRecord(cfg: WorkerConfig, key: string, r: WarmRecord): void {
  const tmp = `${recOf(cfg, key)}.tmp`;
  writeFileSync(tmp, JSON.stringify(r));
  renameSync(tmp, recOf(cfg, key));
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => execFile(cmd, args, { maxBuffer: 1 << 20 }, (err, out) => (err ? reject(err) : resolve(String(out)))));
}

async function diskBytes(dir: string): Promise<number> {
  return Number((await run("du", ["-sk", dir])).split(/\s/)[0]) * 1024;
}

/** Keys that have a stored warm dir. */
export function warmKeys(cfg: WorkerConfig): string[] {
  if (!existsSync(cfg.warmDir)) return [];
  return readdirSync(cfg.warmDir).filter((e) => WARM_KEY.test(e) && existsSync(recOf(cfg, e)) && existsSync(dirOf(cfg, e)));
}

/** At startup: drops half-finished replacements and dirs without a record. One that cannot be removed is logged and kept. */
export function cleanWarm(cfg: WorkerConfig, note: (s: string) => void = () => {}): void {
  mkdirSync(cfg.warmDir, { recursive: true, mode: 0o700 });
  for (const e of readdirSync(cfg.warmDir)) {
    const key = e.replace(/\.json$/, "");
    if (e.startsWith(".") || e.endsWith(".tmp") || !WARM_KEY.test(key) || !existsSync(recOf(cfg, key)) || !existsSync(dirOf(cfg, key))) {
      try {
        removeTree(join(cfg.warmDir, e));
      } catch (err) {
        note(`could not remove warm entry ${e} (${(err as Error).message})`);
      }
    }
  }
}

/** Copies the warm dir for `key` into the empty `target`. Returns false when there is none. */
export function copyWarm(cfg: WorkerConfig, key: string, target: string): Promise<boolean> {
  return locked(key, async () => {
    const rec = readRecord(cfg, key);
    if (!rec || !existsSync(dirOf(cfg, key))) return false;
    await run("cp", ["-a", "--reflink=auto", `${dirOf(cfg, key)}/.`, `${target}/`]);
    writeRecord(cfg, key, { ...rec, lastUsed: Date.now() });
    return true;
  });
}

/** Moves `target` in as the warm dir for `key`, then evicts least recently used dirs over the cap. */
export function storeWarm(cfg: WorkerConfig, key: string, commit: string, target: string, opts: { stored?: number; replaceIf?: (cur: WarmRecord | null) => boolean } = {}): Promise<boolean> {
  let done = false;
  return locked(key, async () => {
    if (opts.replaceIf && !opts.replaceIf(readRecord(cfg, key))) return;
    done = true;
    mkdirSync(cfg.warmDir, { recursive: true, mode: 0o700 });
    const bytes = await diskBytes(target);
    const tag = `${process.pid}-${Date.now()}`;
    const stage = join(cfg.warmDir, `.new-${key}-${tag}`);
    const old = join(cfg.warmDir, `.old-${key}-${tag}`);
    renameSync(target, stage);
    const had = existsSync(dirOf(cfg, key));
    if (had) renameSync(dirOf(cfg, key), old);
    renameSync(stage, dirOf(cfg, key));
    writeRecord(cfg, key, { commit, bytes, lastUsed: Date.now(), stored: opts.stored ?? Date.now() });
    if (had) removeTree(old);
  }).then(async () => {
    if (done) await evictWarm(cfg);
    return done;
  });
}

/** Removes least recently used warm dirs until the total is within warmMaxGb. */
export async function evictWarm(cfg: WorkerConfig): Promise<string[]> {
  const cap = cfg.warmMaxGb * 1024 ** 3;
  const evicted: string[] = [];
  for (;;) {
    const all = warmKeys(cfg).map((key) => ({ key, rec: readRecord(cfg, key) })).filter((x): x is { key: string; rec: WarmRecord } => x.rec !== null);
    const total = all.reduce((s, x) => s + x.rec.bytes, 0);
    if (total <= cap || all.length === 0) return evicted;
    const victim = all.sort((a, b) => a.rec.lastUsed - b.rec.lastUsed)[0].key;
    await locked(victim, async () => {
      rmSync(recOf(cfg, victim), { force: true });
      removeTree(dirOf(cfg, victim));
    });
    evicted.push(victim);
  }
}

