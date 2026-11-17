// Runs one claimed task: fresh work dir, source tarball, one container per
// plan step, artifact collection, cleanup.
import { randomBytes } from "node:crypto";
import { globSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { admitCrates, CrateVerifier, seedCargoHome } from "./cache.ts";
import type { WorkerConfig } from "./config.ts";
import { prepareEnvironment, type PreparedEnv, type SandboxInfo } from "./environment.ts";
import { removeContainer, runContainer, type RunOutcome } from "./container.ts";
import { applyPatch } from "./patch.ts";
import { discardDir, removeTree, STUCK_PREFIX } from "./rmtree.ts";
import { downloadAndExtract } from "./tarball.ts";
import { copyWarm, storeWarm, taskFieldProblem } from "./warm.ts";
import { downloadWarm, uploadWarm } from "./warm-sync.ts";
import { LIMITS, type ClaimedTask, type StepResult } from "./types.ts";

export type TaskSink = {
  log(step: string, chunk: string): Promise<void>;
  artifact(name: string, body: Buffer, contentType: string): Promise<void>;
};

export type ExecResult = { results: StepResult[]; summary: string; cancelled: boolean; environment?: SandboxInfo };

let defaultVerifier: CrateVerifier | undefined;

export function taskDir(cfg: WorkerConfig, id: number): string {
  return join(cfg.workDir, `task-${id}`);
}

export function cacheDir(cfg: WorkerConfig): string {
  return join(cfg.workDir, "crate-cache");
}

/**
 * Removes work dirs of tasks that were running when a previous worker died, and dirs an earlier cleanup could
 * not remove. A dir that still cannot be removed is logged and left out of the `task-*` names; it never stops the worker.
 */
export function removeStaleWorkDirs(cfg: WorkerConfig, note: (s: string) => void = () => {}): number {
  mkdirSync(cfg.workDir, { recursive: true });
  let n = 0;
  for (const e of readdirSync(cfg.workDir)) {
    const path = join(cfg.workDir, e);
    if (/^task-\d+$/.test(e)) {
      const left = discardDir(path);
      if (left) note(left);
      else n++;
    } else if (e.startsWith(STUCK_PREFIX)) {
      try {
        removeTree(path);
        n++;
      } catch (err) {
        note(`could not remove ${e} (${(err as Error).message})`);
      }
    }
  }
  return n;
}

const CONTENT_TYPES: Record<string, string> = { ".png": "image/png", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain", ".log": "text/plain" };

type Collected = { name: string; path: string; bytes: number };

/** Files matching `globs` below `out`. Symlinks and anything resolving outside `out` are skipped. */
export function collectArtifacts(out: string, globs: string[], taken: Set<string>, budget: { total: number; count: number }, note: (s: string) => void): Collected[] {
  const root = realpathSync(out);
  const found: Collected[] = [];
  const seen = new Set<string>();
  for (const g of globs) {
    if (g.startsWith("/") || g.split("/").includes("..") || g.includes("\0")) {
      note(`artifact pattern ignored: ${g}`);
      continue;
    }
    for (const rel of globSync(g, { cwd: out })) {
      let real: string;
      try {
        real = realpathSync(join(out, rel));
      } catch {
        continue;
      }
      if (real !== root && !real.startsWith(root + sep)) continue;
      if (seen.has(real)) continue;
      const st = lstatSync(real);
      if (!st.isFile()) continue;
      seen.add(real);
      if (st.size > LIMITS.artifactBytes) {
        note(`artifact skipped (over ${LIMITS.artifactBytes / 1024 / 1024} MB): ${rel}`);
        continue;
      }
      if (budget.count >= LIMITS.artifactCount || budget.total + st.size > LIMITS.artifactsTotalBytes) {
        note(`artifact skipped (task limit reached): ${rel}`);
        continue;
      }
      let name = relative(root, real).split(sep).join("__").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
      for (let i = 2; taken.has(name); i++) name = `${i}-${basename(name)}`;
      taken.add(name);
      budget.total += st.size;
      budget.count++;
      found.push({ name, path: real, bytes: st.size });
    }
  }
  return found;
}

export async function executeTask(cfg: WorkerConfig, task: ClaimedTask, sink: TaskSink, signal: AbortSignal, o: { fetchImpl?: typeof fetch; note?: (s: string) => void; crates?: CrateVerifier } = {}): Promise<ExecResult> {
  const note = o.note ?? (() => {});
  const crates = o.crates ?? (defaultVerifier ??= new CrateVerifier());
  const dir = taskDir(cfg, task.id);
  const results: StepResult[] = [];
  const names: string[] = [];
  const emit = (step: string, s: string) => sink.log(step, s).catch(() => {});
  try {
    const bad = taskFieldProblem(task);
    if (bad) return { results, summary: `malformed task: ${bad}`, cancelled: false };
    const old = discardDir(dir);
    if (old) note(old);
    const paths = { src: join(dir, "src"), target: join(dir, "target"), cache: join(dir, "cache") };
    for (const p of Object.values(paths)) mkdirSync(p, { recursive: true });
    const wanted = task.requires.toolchains ?? [];
    const toolchain = wanted.length ? wanted.find((t) => cfg.images[t]) : Object.keys(cfg.images)[0];
    const image = toolchain ? cfg.images[toolchain] : undefined;
    if (!image) return { results, summary: `no image for toolchains ${wanted.join(", ")}`, cancelled: false };

    await emit("source", `fetching source for ${task.repo}@${task.headSha.slice(0, 12)}\n`);
    try {
      const files = await downloadAndExtract(task.sourceUrl, paths.src, cfg.maxSourceMb * 1024 * 1024, undefined, o.fetchImpl);
      await emit("source", `unpacked ${files} files\n`);
    } catch (e) {
      await emit("source", `source failed: ${(e as Error).message}\n`);
      return { results, summary: `source failed: ${(e as Error).message}`.slice(0, 300), cancelled: false };
    }
    if (task.patch !== undefined) {
      const err = await applyPatch(task.patch, paths.src, dir);
      await emit("source", `${err ?? "patch applied"}\n`);
      if (err) return { results, summary: err, cancelled: false };
    }
    let prepared: PreparedEnv;
    try {
      prepared = await prepareEnvironment(cfg, { ...task, display: task.requires.display === true }, toolchain!, image, paths.src, { fetchImpl: o.fetchImpl, log: (s) => void emit("environment", s), note });
    } catch (e) {
      await emit("environment", `environment failed: ${(e as Error).message}\n`);
      return { results, summary: `environment failed: ${(e as Error).message}`.slice(0, 300), cancelled: false };
    }
    const environment = prepared.info;
    if (task.warm?.role === "use") {
      try {
        // In the background: a slow store never delays the build; the next task gets the new snapshot.
        if (cfg.warmStore) void downloadWarm(cfg, task.warm.key, (m) => note(m));
        const hit = await copyWarm(cfg, task.warm.key, paths.target);
        await emit("source", hit ? "warm target dir copied\n" : "no warm target dir, starting cold\n");
      } catch (e) {
        note(`warm copy failed: ${(e as Error).message}`);
        const left = discardDir(paths.target);
        if (left) note(left);
        mkdirSync(paths.target, { recursive: true });
      }
    }
    seedCargoHome(cacheDir(cfg), join(paths.cache, "cargo"));

    let failed: string | null = null;
    let cancelled = false;
    const taken = new Set<string>();
    const budget = { total: 0, count: 0 };
    for (const [i, step] of task.plan.entries()) {
      if (signal.aborted) {
        cancelled = true;
        break;
      }
      const out = join(dir, "out", String(i));
      mkdirSync(out, { recursive: true });
      const name = `craft-${task.id}-${i}-${randomBytes(4).toString("hex")}`;
      names.push(name);
      const started = Date.now();
      let outcome: RunOutcome;
      try {
        outcome = await runContainer(cfg, { name, image: prepared.image, env: prepared.env, extraMounts: prepared.mounts, network: step.network, bare: step.bare, mounts: { ...paths, out }, cmd: step.cmd }, {
          timeoutMs: Math.min(step.timeoutSec, cfg.maxStepSec) * 1000,
          signal,
          onOutput: (b) => void sink.log(step.name, b.toString("utf8")).catch(() => {}),
        });
      } catch (e) {
        await emit(step.name, `could not start container: ${(e as Error).message}\n`);
        results.push({ step: step.name, exitCode: null, durationMs: Date.now() - started, timedOut: false });
        failed = `${step.name}: container runtime failed`;
        break;
      }
      if (outcome.cancelled) {
        cancelled = true;
        break;
      }
      results.push({ step: step.name, exitCode: outcome.exitCode, durationMs: Date.now() - started, timedOut: outcome.timedOut, ...(outcome.peakMemBytes !== undefined ? { peakMemBytes: outcome.peakMemBytes } : {}), ...(outcome.oomKilled !== undefined ? { oomKilled: outcome.oomKilled } : {}) });
      if (outcome.timedOut) await emit(step.name, `\nstep timed out after ${step.timeoutSec} s and was killed\n`);
      const files = collectArtifacts(out, step.artifacts ?? [], taken, budget, (s) => void emit(step.name, `${s}\n`));
      for (const f of files) {
        await sink.artifact(f.name, readFileSync(f.path), CONTENT_TYPES[f.name.slice(f.name.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream");
      }
      if (step.network === "fetch") {
        // Before any offline step (build scripts, tests) can touch the cache.
        try {
          await admitCrates(join(paths.cache, "cargo"), cacheDir(cfg), crates, (s) => void emit(step.name, `${s}\n`));
        } catch (e) {
          note(`crate cache admission failed: ${(e as Error).message}`);
        }
      }
      if (outcome.timedOut || outcome.exitCode !== 0) {
        failed = outcome.timedOut ? `${step.name} timed out` : `${step.name} failed (exit ${outcome.exitCode})`;
        break;
      }
    }
    if (cancelled) return { results, summary: "cancelled", cancelled: true, environment };
    if (!failed && task.warm?.role === "build") {
      try {
        await storeWarm(cfg, task.warm.key, task.headSha, paths.target);
        await emit("source", "warm target dir stored\n");
        if (cfg.warmStore?.writeKey) await uploadWarm(cfg, task.warm.key, task.headSha, (m) => note(m));
      } catch (e) {
        note(`warm store failed: ${(e as Error).message}`);
      }
    }
    return { results, summary: failed ?? `${results.length} step${results.length === 1 ? "" : "s"} passed`, cancelled: false, environment };
  } finally {
    for (const n of names) await removeContainer(cfg, n);
    // A step can leave directories it made unreadable; that never replaces the task's result or keeps the dir under its task name.
    const left = discardDir(dir);
    if (left) note(left);
  }
}
