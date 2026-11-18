// `autocraft runner serve`: the only process that runs pipeline steps. It
// polls the jobs table, runs each job in its own child process (`autocraft
// runner exec <id>`, its own process group, output to a per-job log file),
// stops jobs whose cancel was requested, runs the autopilot (queues jobs while the
// pipeline switch is on) and marks
// jobs left running by an earlier runner as failed.
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { appendFileSync, statSync, closeSync, mkdirSync, openSync, readFileSync, utimesSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { dbPath } from "../db.ts";
import { advancePreapprovals } from "../preapproval/index.ts";
import { applyProposals, AUTOPILOT_USER, isDraining, isEnabled, planDue, type Detected } from "./autopilot.ts";
import { recordUsageSamples } from "../agents/accounts.ts";
import { AccountWatcher } from "../agents/manage.ts";
import { failRunning, pruneRuns } from "../agents/runs.ts";
import { pruneTasks, reapLost } from "../build/tasks.ts";
import { pruneBench } from "../nightly/index.ts";
import { prunePlanHistory } from "../core/plan-cache.ts";
import { checkPendingUpdate } from "../build/worker-update.ts";
import { endJob, JOB_KEEP_MS, now, pruneJobs, RUNNER_STOPPED } from "./jobs.ts";
import { advanceSecurityFixes, autoFixConfirmed } from "../security/actions.ts";
import { advanceScanTests } from "../security/scantest.ts";
import { OffThread } from "./offthread.ts";
import { loadSteps, modelsOf, usesClaude, type Params } from "./steps.ts";
import { jobBlock } from "./concurrency.ts";
import { queueRoom } from "../agents/call.ts";
import { stepDeadlineMin, stepNoProgressMin } from "./deadlines.ts";
import { envVar } from "../env.ts";
import { CODEX_EXECUTION_READY, CODEX_UNAVAILABLE, codexExecutionUnavailable } from "../agents/codex/capabilities.ts";
import { modelPolicy } from "../agents/codex/config.ts";

export const logsDir = (): string => envVar("RUNNER_LOGS") ?? join(homedir(), ".cache/autocraft-logs/jobs");

export function runnerLockPath(): string {
  const dir = envVar("LOCK_DIR") ?? join(homedir(), ".cache/autocraft-logs");
  return join(dir, `runner-${basename(dbPath())}.lock`);
}

export const HEARTBEAT_KEY = "runner_heartbeat";
/** How often the runner brings the flowchart summary up to date (src/flow/summary.ts). */
export const FLOW_EVERY_MS = 20_000;
/** How often queued webhook items are read again from GitHub. */
export const WEBHOOK_DRAIN_MS = 5_000;
const CLI = fileURLToPath(new URL("../cli.ts", import.meta.url));

/** Job processes at once. A job that calls Claude also waits for a free account slot (see startJobs). */
export const DEFAULT_MAX_JOBS = 32;

export type RunnerOptions = {
  db: DatabaseSync;
  /** Database file the children open; default AUTOCRAFT_DB or the default path. */
  dbFile?: string;
  logs?: string;
  /** Most job processes running at once. */
  maxJobs?: number;
  /** Time a job gets to stop after SIGTERM before SIGKILL. */
  killAfterMs?: number;
  lockFile?: string;
  log?: (line: string) => void;
  /** The planner's detection pass (default: a worker thread on its own connection to `dbFile`). Tests pass a fake. */
  detect?: (nowMs: number) => Promise<Detected>;
  /** The flowchart summary refresh (default: a worker thread). */
  refreshFlow?: () => Promise<unknown>;
  /** Longest run of a job of a step in minutes, given the job's `limit` param (default: stepDeadlineMin). Tests pass a short one. */
  maxMin?: (step: string, items?: number) => number;
  /** Minutes a job may show no progress, by step (default: stepNoProgressMin). */
  noProgressMin?: (step: string) => number;
  /** How long past its deadline a job may finish its current item before the runner stops its process (default 10 minutes). */
  graceMs?: number;
};

type Running = { child: ChildProcess; termAt: number | null; exited: Promise<void>; startedAt: number; deadlineMin: number; logPath: string; /** When the job was told to finish its current item and stop. */ flaggedAt: number | null; noProgressMin: number; /** Why it was told to stop. */ stopMsg: string | null };

/** The error of a job the runner stopped for running past its step's limit. */
export const deadlineError = (min: number): string => `stopped: ran past ${min} min`;
export const noProgressError = (min: number): string => `stopped: no progress for ${min} min`;

/** True when `pid` is alive and is the child of job `id`. */
function isJobProcess(pid: number, id: number): boolean {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ").includes(`runner exec ${id}`);
  } catch {
    return false;
  }
}

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // already gone
  }
}

export class Runner {
  readonly db: DatabaseSync;
  readonly running = new Map<number, Running>();
  private stopping = false;
  private flowAt = 0;
  private webhookAt = 0;
  private webhooking: Promise<void> | null = null;
  private webhookClient: import("../mirror.ts").Client | null = null;
  private planning: Promise<void> | null = null;
  private detected: Detected | null = null;
  private flowing: Promise<void> | null = null;
  private readonly planThread: OffThread;
  private readonly flowThread: OffThread;
  private readonly o: Required<Omit<RunnerOptions, "db" | "lockFile" | "detect" | "refreshFlow" | "maxMin" | "graceMs" | "noProgressMin">> & { lockFile: string | null };
  private readonly detect: (nowMs: number) => Promise<Detected>;
  private readonly refreshFlow: () => Promise<unknown>;
  private readonly maxMin: (step: string, items?: number) => number;
  private readonly graceMs: number;
  private readonly noProgressMin: (step: string) => number;

  constructor(opts: RunnerOptions) {
    this.db = opts.db;
    this.o = {
      dbFile: opts.dbFile ?? dbPath(), logs: opts.logs ?? logsDir(), maxJobs: opts.maxJobs ?? DEFAULT_MAX_JOBS, killAfterMs: opts.killAfterMs ?? 10_000,
      lockFile: opts.lockFile ?? null, log: opts.log ?? ((l) => console.log(l)),
    };
    mkdirSync(this.o.logs, { recursive: true });
    this.planThread = new OffThread(this.o.dbFile);
    this.flowThread = new OffThread(this.o.dbFile);
    this.detect = opts.detect ?? ((t) => this.planThread.plan(t));
    this.maxMin = opts.maxMin ?? stepDeadlineMin;
    this.graceMs = opts.graceMs ?? 600_000;
    this.noProgressMin = opts.noProgressMin ?? stepNoProgressMin;
    this.refreshFlow = opts.refreshFlow ?? (() => this.flowThread.flow());
  }

  /** Jobs left `running` belong to a runner that is gone: stop what is left of them and mark them failed. */
  recover(): number {
    // Model calls of a runner that is gone no longer hold an account slot.
    const orphans = failRunning(this.db, "The runner stopped during this call.");
    if (orphans) this.o.log(`${orphans} agent runs left running by an earlier runner, marked failed`);
    this.db.prepare("DELETE FROM model_waits").run();
    this.db.prepare("DELETE FROM work_leases").run();
    const rows = this.db.prepare("SELECT id, pid, cancel_requested_at FROM jobs WHERE state = 'running'").all() as { id: number; pid: number | null; cancel_requested_at: string | null }[];
    for (const r of rows) {
      if (this.running.has(r.id)) continue;
      if (r.pid && isJobProcess(r.pid, r.id)) killGroup(r.pid, "SIGKILL");
      const cancelled = r.cancel_requested_at !== null;
      this.db.prepare("UPDATE jobs SET state = ?, ended_at = ?, pid = NULL, error = COALESCE(error, ?) WHERE id = ? AND state = 'running'")
        .run(cancelled ? "cancelled" : "failed", now(), cancelled ? null : RUNNER_STOPPED, r.id);
      this.o.log(`job ${r.id}: left running by an earlier runner, marked ${cancelled ? "cancelled" : "failed"}`);
    }
    return rows.length;
  }

  /** One pass: heartbeat, cancels, autopilot, new jobs. */
  async tick(): Promise<void> {
    const t = now();
    this.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(HEARTBEAT_KEY, t);
    if (this.o.lockFile) {
      try {
        utimesSync(this.o.lockFile, new Date(), new Date());
      } catch {
        // removed under us; the next start notices
      }
    }
    this.cancels();
    if (this.stopping) return;
    try {
      const lost = reapLost(this.db);
      if (lost) this.o.log(`${lost} build tasks lost their worker`);
    } catch (e) {
      this.o.log(`build tasks: ${(e as Error).message}`);
    }
    this.webhookTick();
    this.usageTick();
    this.workerUpdateTick();
    await this.autopilot();
    await this.startJobs();
    if (!this.flowing && Date.now() - this.flowAt >= FLOW_EVERY_MS) {
      this.flowAt = Date.now();
      this.flowing = this.refreshFlow().then(() => undefined, (e) => this.o.log(`flowchart summary: ${(e as Error).message}`)).finally(() => (this.flowing = null));
    }
  }

  /** Reads the items GitHub App webhooks named again from GitHub, off the tick, while no sync run holds its lock. The poll covers any that fail. */
  private webhookTick(): void {
    if (this.webhooking || Date.now() - this.webhookAt < WEBHOOK_DRAIN_MS) return;
    this.webhookAt = Date.now();
    if (!this.db.prepare("SELECT 1 FROM main.sync_requests LIMIT 1").get()) return;
    this.webhooking = (async () => {
      const { lockHeld, lockPath, fullLockPath, Client } = await import("../mirror.ts");
      if (lockHeld(lockPath()) || lockHeld(fullLockPath())) return;
      // One client for the runner's life, seeded from the last sync's reading, so the reserve holds from the first read.
      if (!this.webhookClient) this.webhookClient = new Client(1000);
      const c = this.webhookClient;
      const get = (k: string): string | undefined => (this.db.prepare("SELECT value FROM main.settings WHERE key = ?").get(k) as { value: string } | undefined)?.value;
      const seen = Number(get("sync_rate_remaining"));
      const reset = Date.parse(get("sync_rate_reset_at") ?? "");
      // Below the reserve nothing is read until the limit resets; the sync's reading is newer than ours when it is the later one.
      if (Number.isFinite(seen) && Number.isFinite(reset) && reset > Date.now()) {
        c.remaining = c.remaining === null ? seen : Math.min(c.remaining, seen);
        c.resetAt = new Date(reset);
      } else if (c.resetAt && c.resetAt.getTime() <= Date.now()) {
        c.remaining = null;
        c.resetAt = null;
      }
      const { drainSyncRequests } = await import("../github/webhooks.ts");
      const n = await drainSyncRequests(this.db, c, { limit: 10, log: this.o.log });
      if (n) this.o.log(`webhooks: read ${n} items again`);
    })().catch((e) => this.o.log(`webhooks: ${(e as Error).message}`)).finally(() => (this.webhooking = null));
  }

  /**
   * The planner. Detection reads a lot and runs off the loop, at most one pass at a time; the
   * tick queues what it found, so a slow detection never delays the heartbeat or cancels.
   */
  private async autopilot(): Promise<void> {
    const found = this.detected;
    this.detected = null;
    if (found) {
      for (const l of found.logs) this.o.log(l);
      try {
        // Detection read the database a moment ago; the switch may have been turned off since.
        if (isEnabled(this.db)) {
          await applyProposals(this.db, found.proposals, { log: this.o.log, wakeAt: found.wakeAt ?? null, ...(found.status ? { status: found.status } : {}) });
          // A private fix that a switch-off cancelled is queued again once the pipeline is on.
          const fixes = await autoFixConfirmed(this.db);
          if (fixes) this.o.log(`autopilot: started the private fix of ${fixes} confirmed security findings`);
        }
      } catch (e) {
        this.o.log(`autopilot: ${(e as Error).message}`);
      }
    }
    // A private fix waits for its build without a job; the next job starts when the build tasks end, for operator-started fixes with the pipeline off too.
    try {
      const next = await advanceSecurityFixes(this.db, isEnabled(this.db));
      if (next) this.o.log(`security: continued the private fix of ${next} findings after their builds`);
    } catch (e) { this.o.log(`security fixes: ${(e as Error).message}`); }
    // The build task of a scan test is read here (database only); a finding whose test ended can then start its automatic fix.
    try {
      for (const t of advanceScanTests(this.db)) {
        this.o.log(`security: scan test of ${t.repo} finding ${t.number}: ${t.state}`);
        if (isEnabled(this.db) && t.state !== "not-shown") await autoFixConfirmed(this.db, t.repo, t.number);
      }
    } catch (e) { this.o.log(`security scan tests: ${(e as Error).message}`); }
    // Pre-approved merges move on rows other steps wrote; they are read here, not on a timer of their own.
    try { advancePreapprovals(this.db, this.o.log); } catch (e) { this.o.log(`preapprovals: ${(e as Error).message}`); }
    if (this.planning || !planDue(this.db)) return;
    this.planning = this.detect(Date.now())
      .then((d) => { this.detected = d; }, (e) => this.o.log(`autopilot: detection failed: ${(e as Error).message}`))
      .finally(() => (this.planning = null));
  }

  private updateAt = 0;
  private updating = false;

  /** About once a minute, runs the sandbox worker update that a deploy left pending once its tasks have finished. */
  private workerUpdateTick(): void {
    if (this.updating || Date.now() - this.updateAt < 60_000) return;
    this.updateAt = Date.now();
    this.updating = true;
    checkPendingUpdate(this.db, undefined, this.o.log)
      .catch((e) => this.o.log(`worker update: ${(e as Error).message}`))
      .finally(() => (this.updating = false));
  }

  private usageAt = 0;
  private refreshAt = 0;
  private pruneAt = 0;
  private watcher: AccountWatcher | undefined;

  /** Records usage readings that changed (at most every 15 s), reads sign-in state (every 15 minutes) and plan usage (every 5) of accounts through the claude command, and prunes old agent data hourly. */
  private usageTick(): void {
    const t = Date.now();
    if (t - this.usageAt >= 15_000) {
      this.usageAt = t;
      try {
        recordUsageSamples(this.db, t);
      } catch (e) {
        this.o.log(`usage samples: ${(e as Error).message}`);
      }
    }
    if (t - this.refreshAt >= 60_000) {
      this.refreshAt = t;
      void (this.watcher ??= new AccountWatcher(this.db, (m) => this.o.log(m))).tick(t);
    }
    if (t - this.pruneAt >= 3600_000) {
      this.pruneAt = t;
      try {
        pruneJobs(this.db, t);
      } catch (e) {
        this.o.log(`prune jobs: ${(e as Error).message}`);
      }
      try {
        prunePlanHistory(this.db, JOB_KEEP_MS, t);
      } catch (e) {
        this.o.log(`prune plan history: ${(e as Error).message}`);
      }
      try {
        pruneTasks(this.db, t);
      } catch (e) {
        this.o.log(`prune build tasks: ${(e as Error).message}`);
      }
      try {
        pruneBench(this.db, t);
      } catch (e) {
        this.o.log(`prune nightly bench: ${(e as Error).message}`);
      }
      try {
        pruneRuns(this.db, t);
      } catch (e) {
        this.o.log(`prune agent runs: ${(e as Error).message}`);
      }
    }
  }

  private cancels(): void {
    for (const [id, r] of this.running) {
      const row = this.db.prepare("SELECT cancel_requested_at FROM jobs WHERE id = ?").get(id) as { cancel_requested_at: string | null } | undefined;
      const late = Date.now() - r.startedAt >= r.deadlineMin * 60_000;
      const cancel = !!row?.cancel_requested_at || this.stopping;
      // Progress is a new line in the job's log (the job's own output: progress lines, check-tool notes, results); reading its mtime costs one stat.
      let lastLine = r.startedAt;
      try { lastLine = Math.max(lastLine, statSync(r.logPath).mtimeMs); } catch { /* no log yet */ }
      const idle = r.flaggedAt === null && Date.now() - lastLine >= r.noProgressMin * 60_000;
      // Past its deadline a job is first asked to stop: the failure is recorded, which the job reads at its item boundaries (ctx.cancelled)
      // and finishes the writes of its current item. Only after the grace does the process get the signals a cancel gets.
      if ((late || idle) && !cancel && r.flaggedAt === null && r.termAt === null) {
        r.flaggedAt = Date.now();
        const msg = r.stopMsg = idle && !late ? noProgressError(r.noProgressMin) : deadlineError(r.deadlineMin);
        this.db.prepare("UPDATE jobs SET error = ? WHERE id = ? AND state = 'running'").run(msg, id);
        try { appendFileSync(r.logPath, `${now()} ${msg}; the job may finish its current item, and is stopped ${Math.round(this.graceMs / 60_000)} min from now\n`); } catch { /* the log is gone */ }
        this.o.log(`job ${id}: ${msg}; finishing its current item`);
      }
      const graceOver = r.flaggedAt !== null && Date.now() - r.flaggedAt >= this.graceMs;
      if (!cancel && !graceOver) continue;
      const pid = r.child.pid;
      if (!pid) continue;
      if (r.termAt === null) {
        r.termAt = Date.now();
        const deadline = !cancel;
        if (deadline) {
          try { appendFileSync(r.logPath, `${now()} ${r.stopMsg ?? deadlineError(r.deadlineMin)}; the job did not finish in time and is stopped\n`); } catch { /* the log is gone */ }
        }
        killGroup(pid, "SIGTERM");
        this.o.log(`job ${id}: stopping (${this.stopping ? "runner stopping" : deadline ? `${r.stopMsg} grace over` : "cancel requested"})`);
      } else if (Date.now() - r.termAt >= this.o.killAfterMs) {
        killGroup(pid, "SIGKILL");
      }
    }
  }

  /**
   * Starts queued jobs: security first (priority 2), then by id. A job whose step calls Claude starts only while the
   * model queue has room for its class, so processes do not sit waiting for slots, unless no job of its step runs.
   */
  private async startJobs(): Promise<void> {
    const steps = await loadSteps();
    const queued = (this.db.prepare("SELECT id, step, params, requested_by FROM jobs WHERE state = 'queued' ORDER BY id").all() as { id: number; step: string; params: string; requested_by: string }[])
      .sort((a, b) => (steps.get(b.step)?.priority ?? 0) - (steps.get(a.step)?.priority ?? 0) || a.id - b.id);
    // Automatic jobs wait while the pipeline is off; they are cancelled when it is switched off. While it drains, nothing new starts.
    const on = isEnabled(this.db), draining = isDraining(this.db);
    const room = new Map<number, number>();
    for (const q of queued) {
      if (draining || (q.requested_by === AUTOPILOT_USER && !on)) continue;
      if (this.running.size >= this.o.maxJobs) return;
      const step = steps.get(q.step);
      if (!step) {
        if (!CODEX_EXECUTION_READY && modelPolicy(this.db).provider === "codex") continue;
        this.db.prepare("UPDATE jobs SET state = 'failed', ended_at = ?, error = ? WHERE id = ? AND state = 'queued'").run(now(), "This step does not exist in this build.", q.id);
        continue;
      }
      try { if (codexExecutionUnavailable(this.db, modelsOf(step, JSON.parse(q.params) as Params))) continue; }
      catch { if (!CODEX_EXECUTION_READY && modelPolicy(this.db).provider === "codex") continue; }
      if (this.blocked(steps, q.id)) continue;
      let claude = false;
      try { claude = usesClaude(modelsOf(step, JSON.parse(q.params) as Params)); } catch { /* params are checked when the job runs */ }
      const cls = step.priority ?? 0;
      if (claude && !this.db.prepare("SELECT 1 FROM jobs WHERE step = ? AND state = 'running' LIMIT 1").get(step.name)) {
        // Nothing of the step runs: it starts anyway, and takes a slot of the room.
      } else if (claude) {
        if (!room.has(cls)) room.set(cls, queueRoom(this.db, cls));
        if (room.get(cls)! <= 0) continue;
      }
      if (this.start(q.id, step.name, steps) && claude) room.set(cls, (room.get(cls) ?? queueRoom(this.db, cls)) - 1);
    }
  }

  /** Why the queued job cannot start: a running job (of this runner or a command-line run) of the same step and repo, a full step, or a held mutex. */
  private blocked(steps: Awaited<ReturnType<typeof loadSteps>>, id: number): string | null {
    const r = this.db.prepare("SELECT step, repo, params, json_extract(params, '$.number') AS number FROM jobs WHERE id = ?").get(id) as { step: string; repo: string | null; number: number | null; params: string } | undefined;
    if (r) {
      if (!steps.has(r.step) && !CODEX_EXECUTION_READY && modelPolicy(this.db).provider === "codex") return CODEX_UNAVAILABLE;
      try { const blocked = codexExecutionUnavailable(this.db, modelsOf(steps.get(r.step), JSON.parse(r.params) as Params)); if (blocked) return blocked; }
      catch { if (!CODEX_EXECUTION_READY && modelPolicy(this.db).provider === "codex") return CODEX_UNAVAILABLE; }
    }
    return r ? jobBlock(this.db, steps, r, { states: ["running"], mutex: true }) : "gone";
  }

  /** The job's `limit` param (its items), when it has one. */
  private limitOf(id: number): number | undefined {
    try {
      const p = JSON.parse((this.db.prepare("SELECT params FROM jobs WHERE id = ?").get(id) as { params: string }).params) as { limit?: unknown };
      return typeof p.limit === "number" ? p.limit : undefined;
    } catch { return undefined; }
  }

  private start(id: number, stepName: string, steps: Awaited<ReturnType<typeof loadSteps>>): boolean {
    const logPath = join(this.o.logs, `job-${id}.log`);
    // The check and the claim are one write transaction, so a command-line run cannot take the step in between.
    this.db.exec("BEGIN IMMEDIATE");
    let claimed: number | bigint;
    try {
      claimed = this.blocked(steps, id) ? 0
        : this.db.prepare("UPDATE jobs SET state = 'running', started_at = ?, log_path = ? WHERE id = ? AND state = 'queued'").run(now(), logPath, id).changes;
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    if (!claimed) return false;
    const fd = openSync(logPath, "a");
    let child: ChildProcess;
    try {
      child = spawn(process.execPath, [CLI, "runner", "exec", String(id)], {
        detached: true,
        stdio: ["ignore", fd, fd],
        env: { ...process.env, AUTOCRAFT_DB: this.o.dbFile },
      });
    } finally {
      closeSync(fd);
    }
    this.db.prepare("UPDATE jobs SET pid = ? WHERE id = ?").run(child.pid ?? null, id);
    this.o.log(`job ${id}: started (pid ${child.pid})`);
    let spawnError: string | null = null;
    child.on("error", (e) => (spawnError = e.message));
    const exited = new Promise<void>((resolve) => {
      child.on("close", (code, signal) => {
        this.finish(id, code, signal, spawnError);
        this.running.delete(id);
        resolve();
      });
    });
    this.running.set(id, { child, termAt: null, exited, startedAt: Date.now(), deadlineMin: this.maxMin(stepName, this.limitOf(id)), logPath, flaggedAt: null, noProgressMin: this.noProgressMin(stepName), stopMsg: null });
    return true;
  }

  private finish(id: number, code: number | null, signal: NodeJS.Signals | null, spawnError: string | null): void {
    const r = endJob(this.db, id, code, signal, spawnError, this.stopping);
    if (r) this.o.log(`job ${id}: ${r.state}${r.state === "failed" && r.error ? `: ${r.error}` : ""}`);
  }

  /** Resolves when every running job has ended. */
  async idle(): Promise<void> {
    while (this.running.size) await Promise.all([...this.running.values()].map((r) => r.exited));
  }

  /** Stops every running job (SIGTERM, then SIGKILL after the grace time) and waits for them. */
  async stop(): Promise<void> {
    this.stopping = true;
    const timer = setInterval(() => this.cancels(), 500);
    this.cancels();
    await this.idle();
    clearInterval(timer);
    await Promise.all([this.planThread.close(), this.flowThread.close()]);
  }

  /** Polls until `signal` aborts, then stops running jobs. */
  async serve(signal: AbortSignal, pollMs = 2000): Promise<void> {
    this.recover();
    while (!signal.aborted) {
      try {
        await this.tick();
      } catch (e) {
        this.o.log(`runner: ${(e as Error).stack ?? e}`);
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, pollMs);
        signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
      });
    }
    await this.stop();
  }
}
