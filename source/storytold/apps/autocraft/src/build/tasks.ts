// Build tasks: created by pipeline steps, claimed by workers that pull, run
// on the worker, and reported back. Everything a worker sends is stored as
// data; nothing here executes it, renders it or puts it in a prompt.
import { createHash } from "node:crypto";
import { currentJobId } from "../agents/call.ts";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { ItemShown, BuildSummary, BuildTask, BuildTaskDetail, Capabilities, Requires, SandboxEnv, TaskArtifact, TaskBatch, TaskFilter, TaskPage, TaskResult, TaskState, TaskStep } from "../../web/src/api/types.ts";
import { audit } from "../dash/audit.ts";
import { excludeHidden } from "../dash/api/visible.ts";
import { shownLookup } from "../dash/api/shown.ts";
import { removeArtifacts } from "./artifacts.ts";
import { BuildError, slotsOf } from "./envs.ts";
import { draining } from "./worker-update.ts";
import { baseScopeRepos } from "../pilot.ts";
import { fastTask } from "../fasttrack.ts";
import { featureOn } from "./features.ts";
import { slugOf } from "../owners.ts";

export const LOST_AFTER_MS = 2 * 60_000;
/** A task is claimed at most this often: the first time and one requeue after a lost worker. */
export const MAX_ATTEMPTS = 2;
export const MAX_QUEUED = 500;
/** Task rows and logs are kept ten years, like jobs; artifacts (built binaries) 30 days. */
export const KEEP_MS = 3650 * 24 * 3600_000;
export const ARTIFACT_KEEP_MS = 30 * 24 * 3600_000;
export const MAX_LOG_BYTES = 20 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 64 * 1024;
export const LOG_TAIL_BYTES = 64 * 1024;
export const TERMINAL: TaskState[] = ["done", "failed", "cancelled", "lost"];

const SHA_RE = /^[0-9a-f]{40}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const STEP_NAME_RE = /^[A-Za-z0-9 ._:-]{1,64}$/;
const GLOB_RE = /^[A-Za-z0-9._*?/{},-]{1,200}$/;
const nowIso = (): string => new Date().toISOString();

type TaskRow = {
  id: number; job_id: number | null; step: string; repo: string; number: number | null; head_sha: string; base_sha: string | null;
  requires: string; priority: number; plan: string; state: TaskState; env_id: string | null; attempts: number;
  queued_at: string; claimed_at: string | null; started_at: string | null; ended_at: string | null; heartbeat_at: string | null;
  cancel_requested_at: string | null; results: string; summary: string | null; log_bytes: number; artifact_bytes: number;
  patch?: string | null; warm_key?: string | null; warm_role?: string | null; sandbox_env?: string | null;
  env_label?: string | null; default_branch?: string | null;
};

const json = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export type NewTask = {
  jobId?: number | null; step: string; repo: string; number?: number | null; headSha: string; baseSha?: string | null;
  requires?: Requires; priority?: number; plan: TaskStep[];
  /** Unified git diff applied to the checkout before the plan runs. */
  patch?: string;
  /** Tasks of one repo share a build cache under `key`: `build` fills it, `use` reads it. */
  warm?: Warm;
};

export type Warm = { key: string; role: "use" | "build" };
export const MAX_PATCH_BYTES = 1024 * 1024;
/** A warm-cache key for a repo name: a readable slug (at most 49 characters) and a hash of the lowercased name, so distinct names never share a key; always valid. */
export function warmKeyOf(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 49).replace(/-+$/, "") || "repo";
  return `${slug}-${createHash("sha256").update(name.toLowerCase()).digest("hex").slice(0, 14)}`;
}
const WARM_KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function parseWarm(v: unknown): Warm {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || Array.isArray(o) || Object.keys(o).some((k) => k !== "key" && k !== "role")) throw new BuildError(400, "warm must be { key, role }");
  if (typeof o.key !== "string" || !WARM_KEY_RE.test(o.key)) throw new BuildError(400, "warm.key is not valid");
  if (o.role !== "use" && o.role !== "build") throw new BuildError(400, "warm.role must be use or build");
  return { key: o.key, role: o.role };
}

export function parsePatch(v: unknown): string {
  if (typeof v !== "string" || v.length === 0) throw new BuildError(400, "patch must be a non-empty string");
  if (Buffer.byteLength(v) > MAX_PATCH_BYTES) throw new BuildError(400, "patch is larger than 1 MiB");
  if (v.includes("\0")) throw new BuildError(400, "patch must be text");
  return v;
}

export function parseRequires(v: unknown): Requires {
  if (v === undefined) return {};
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new BuildError(400, "requires must be an object");
  const o = v as Record<string, unknown>;
  const out: Requires = {};
  for (const [k, x] of Object.entries(o)) {
    if (k === "os" && ["linux", "macos", "windows"].includes(x as string)) out.os = x as Capabilities["os"];
    else if (k === "arch" && ["x86_64", "aarch64"].includes(x as string)) out.arch = x as Capabilities["arch"];
    else if ((k === "display" || k === "gpu") && typeof x === "boolean") out[k] = x;
    else if ((k === "minMemGb" || k === "minDiskGb") && typeof x === "number" && x >= 0 && x <= 1e7) out[k] = x;
    else if (k === "toolchains" && Array.isArray(x) && x.length <= 40 && x.every((t) => typeof t === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/.test(t))) out.toolchains = x as string[];
    else throw new BuildError(400, `requires.${k} is not valid`);
  }
  return out;
}

export function parsePlan(v: unknown): TaskStep[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > 20) throw new BuildError(400, "plan must list 1 to 20 steps");
  return v.map((s, i): TaskStep => {
    const o = s as Record<string, unknown> | null;
    const where = `plan[${i}]`;
    if (!o || typeof o !== "object") throw new BuildError(400, `${where} must be an object`);
    if (typeof o.name !== "string" || !STEP_NAME_RE.test(o.name)) throw new BuildError(400, `${where}.name is not valid`);
    if (!Array.isArray(o.cmd) || o.cmd.length < 1 || o.cmd.length > 64 || o.cmd.some((a) => typeof a !== "string" || a.length > 8192 || a.includes("\0"))) throw new BuildError(400, `${where}.cmd must be 1 to 64 strings`);
    if (o.network !== "fetch" && o.network !== "none") throw new BuildError(400, `${where}.network must be fetch or none`);
    if (typeof o.timeoutSec !== "number" || !Number.isInteger(o.timeoutSec) || o.timeoutSec < 1 || o.timeoutSec > 7200) throw new BuildError(400, `${where}.timeoutSec must be 1 to 7200`);
    const step: TaskStep = { name: o.name, cmd: o.cmd as string[], network: o.network, timeoutSec: o.timeoutSec };
    if (o.artifacts !== undefined) {
      if (!Array.isArray(o.artifacts) || o.artifacts.length > 20 || o.artifacts.some((g) => typeof g !== "string" || !GLOB_RE.test(g) || g.startsWith("/") || g.split("/").includes(".."))) throw new BuildError(400, `${where}.artifacts must be up to 20 relative globs`);
      step.artifacts = o.artifacts as string[];
    }
    if (o.bare !== undefined) {
      if (typeof o.bare !== "boolean") throw new BuildError(400, `${where}.bare must be a boolean`);
      if (o.bare) step.bare = true;
    }
    return step;
  });
}

/** Queues a task. Used by pipeline steps and the CLI; the source is fetched by sha, so it must be a full commit id. */
export function createTask(db: DatabaseSync, t: NewTask): number {
  if (typeof t.step !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(t.step)) throw new BuildError(400, "step is not valid");
  if (typeof t.repo !== "string" || !REPO_RE.test(t.repo)) throw new BuildError(400, "repo is not valid");
  if (!SHA_RE.test(t.headSha)) throw new BuildError(400, "headSha must be a full lowercase commit id");
  if (t.baseSha != null && !SHA_RE.test(t.baseSha)) throw new BuildError(400, "baseSha must be a full lowercase commit id");
  if (t.number != null && (!Number.isInteger(t.number) || t.number < 1)) throw new BuildError(400, "number is not valid");
  const priority = t.priority ?? 0;
  if (!Number.isInteger(priority) || priority < -100 || priority > 100) throw new BuildError(400, "priority must be -100 to 100");
  const requires = parseRequires(t.requires);
  const plan = parsePlan(t.plan);
  const patch = t.patch === undefined ? null : parsePatch(t.patch);
  const warm = t.warm === undefined ? null : parseWarm(t.warm);
  const queued = (db.prepare("SELECT COUNT(*) AS n FROM build_tasks WHERE state = 'queued'").get() as { n: number }).n;
  if (queued >= MAX_QUEUED) throw new BuildError(429, `${MAX_QUEUED} tasks are already queued`);
  const r = db.prepare(`INSERT INTO build_tasks (job_id, step, repo, number, head_sha, base_sha, requires, priority, plan, state, queued_at, patch, warm_key, warm_role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`)
    .run(t.jobId ?? currentJobId(), t.step, t.repo, t.number ?? null, t.headSha, t.baseSha ?? null, JSON.stringify(requires), priority, JSON.stringify(plan), nowIso(),
      patch, warm?.key ?? null, warm?.role ?? null);
  return Number(r.lastInsertRowid);
}

/** Whether an environment with these capabilities can run a task with these requirements. */
export function satisfies(caps: Capabilities, req: Requires): boolean {
  if (req.os && caps.os !== req.os) return false;
  if (req.arch && caps.arch !== req.arch) return false;
  if (req.display && !caps.display) return false;
  if (req.gpu && !caps.gpu) return false;
  if (req.toolchains && !req.toolchains.every((t) => caps.toolchains.includes(t))) return false;
  if (req.minMemGb !== undefined && caps.memGb < req.minMemGb) return false;
  if (req.minDiskGb !== undefined && caps.diskGb < req.minDiskGb) return false;
  return true;
}

export type ClaimedTask = { id: number; repo: string; headSha: string; baseSha: string | null; requires: Requires; plan: TaskStep[]; sourceUrl: string; patch?: string; warm?: Warm };
export type ClaimResult = { tasks: ClaimedTask[]; cancel: number[] };

/**
 * Ids of this environment's tasks that an operator cancelled and whose containers the worker may still be running.
 * A cancel ends the task at once; the worker kills its containers and does not report back, so the id is
 * repeated for LOST_AFTER_MS after the cancel.
 */
export function cancelIds(db: DatabaseSync, envId: string): number[] {
  const since = new Date(Date.now() - LOST_AFTER_MS).toISOString();
  return (db.prepare("SELECT id FROM build_tasks WHERE env_id = ? AND cancel_requested_at > ? ORDER BY id").all(envId, since) as { id: number }[]).map((r) => r.id);
}

/** The task builds code from a PR: its head, or an integration branch of PRs. */
const runsPrCode = (t: { step: string; number: number | null }): boolean => t.step === "pr-build" || t.step === "merge-batch" || t.number !== null;

/**
 * Hands out queued tasks to an environment that has `free` slots: the oldest of the highest priority
 * whose requirements it meets, at most min(free, its slots minus the tasks it is running). A disabled,
 * paused or unreported environment gets none. One write transaction, so two environments never get the same task.
 */
export function claim(db: DatabaseSync, envId: string, free: number, nowMs: number = Date.now()): ClaimResult {
  reapLost(db, nowMs);
  db.exec("BEGIN IMMEDIATE");
  try {
    const env = db.prepare("SELECT * FROM build_envs WHERE id = ?").get(envId) as
      { enabled: number; kind: string; slots: number; reported_slots: number | null; capabilities: string | null; paused_reason: string | null; confidential: number } | undefined;
    const caps = env?.capabilities ? json<Capabilities | null>(env.capabilities, null) : null;
    const out: ClaimedTask[] = [];
    if (env && env.enabled === 1 && caps && !env.paused_reason && !draining(db, env.kind) && Number.isInteger(free) && free > 0) {
      const running = (db.prepare("SELECT COUNT(*) AS n FROM build_tasks WHERE env_id = ? AND state IN ('claimed', 'running')").get(envId) as { n: number }).n;
      const room = Math.min(free, slotsOf(env) - running);
      if (room > 0) {
        const queued = db.prepare("SELECT * FROM build_tasks WHERE state = 'queued' ORDER BY priority DESC, id LIMIT 500").all() as TaskRow[];
        const scope = baseScopeRepos(db);
        const at = new Date(nowMs).toISOString();
        const take = db.prepare("UPDATE build_tasks SET state = 'claimed', env_id = ?, attempts = attempts + 1, claimed_at = ?, heartbeat_at = ? WHERE id = ? AND state = 'queued'");
        for (const t of queued) {
          if (out.length >= room) break;
          if (!satisfies(caps, json<Requires>(t.requires, {}))) continue;
          // Untrusted-code builds run only while their feature's switch is on for the repo.
          // A worker that holds the warm-snapshot signing key runs only default-branch code as it is: no PR, no patch, no merge batch.
          if (caps.warmSigner && (runsPrCode(t) || !!t.patch)) continue;
          // A security finding's private tasks go only to environments an operator marked confidential, which take no PR code.
          if (env.confidential === 1 ? runsPrCode(t) : PRIVATE_STEPS.includes(t.step)) continue;
          // The CI gate of a PR build comes from its base commit.
          if (t.step === "pr-build" && t.base_sha === null) continue;
          if (t.step === "pr-build" && !featureOn(db, "pr-builds", t.repo)) continue;
          if (t.step === "nightly" && !featureOn(db, "nightly", t.repo)) continue;
          if (t.step === "screenshot" && !featureOn(db, "screenshots", t.repo)) continue;
          // Operator smoke tests and the security fix's builds (an operator's request, under the finding's real repo) run anywhere; pipeline builds only for repos in scope, or for fast-tracked items of any repo.
          if (t.step !== "smoke-test" && t.step !== "fix-check" && !scope.has(t.repo) && !fastTask(db, t)) continue;
          take.run(envId, at, at, t.id);
          out.push({
            id: t.id, repo: t.repo, headSha: t.head_sha, baseSha: t.base_sha, requires: json<Requires>(t.requires, {}), plan: json<TaskStep[]>(t.plan, []),
            sourceUrl: `https://codeload.github.com/${slugOf(t.repo)}/tar.gz/${t.head_sha}`,
            ...(t.patch ? { patch: t.patch } : {}),
            ...(t.warm_key && (t.warm_role === "use" || t.warm_role === "build") ? { warm: { key: t.warm_key, role: t.warm_role } } : {}),
          });
        }
      }
    }
    db.exec("COMMIT");
    return { tasks: out, cancel: cancelIds(db, envId) };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Tasks without a heartbeat for LOST_AFTER_MS: requeued once, then failed; a cancelled one is just cancelled. Returns how many were handled. */
export function reapLost(db: DatabaseSync, nowMs: number = Date.now()): number {
  const cutoff = new Date(nowMs - LOST_AFTER_MS).toISOString();
  const stale = db.prepare("SELECT id, attempts, cancel_requested_at FROM build_tasks WHERE state IN ('claimed', 'running') AND heartbeat_at < ?").all(cutoff) as
    { id: number; attempts: number; cancel_requested_at: string | null }[];
  if (!stale.length) return 0;
  const at = new Date(nowMs).toISOString();
  for (const t of stale) {
    removeArtifacts(db, [t.id]);
    if (!t.cancel_requested_at && t.attempts < MAX_ATTEMPTS) {
      db.prepare("DELETE FROM build_task_logs WHERE task_id = ?").run(t.id);
      db.prepare(`UPDATE build_tasks SET state = 'queued', env_id = NULL, claimed_at = NULL, started_at = NULL, heartbeat_at = NULL, results = '[]',
        log_bytes = 0, summary = NULL WHERE id = ? AND state IN ('claimed', 'running')`).run(t.id);
    } else {
      const state = t.cancel_requested_at ? "cancelled" : "failed";
      db.prepare("UPDATE build_tasks SET state = ?, ended_at = ?, summary = ? WHERE id = ? AND state IN ('claimed', 'running')")
        .run(state, at, t.cancel_requested_at ? "Cancelled; the worker stopped answering." : "The worker stopped answering twice (no heartbeat for 2 minutes).", t.id);
    }
  }
  return stale.length;
}

/** The task row when it is running on this environment, else a 409. */
function mine(db: DatabaseSync, envId: string, id: number): TaskRow {
  const t = db.prepare("SELECT * FROM build_tasks WHERE id = ?").get(id) as TaskRow | undefined;
  if (!t) throw new BuildError(404, "no such task");
  if (t.env_id !== envId || (t.state !== "claimed" && t.state !== "running")) throw new BuildError(409, "this task is not running on this environment");
  return t;
}

export const ownedTask = mine;

export function startTask(db: DatabaseSync, envId: string, id: number): { cancel: number[] } {
  const t = mine(db, envId, id);
  const at = nowIso();
  const r = db.prepare("UPDATE build_tasks SET state = 'running', started_at = COALESCE(started_at, ?), heartbeat_at = ? WHERE id = ? AND env_id = ? AND state IN ('claimed', 'running')").run(at, at, t.id, envId);
  if (r.changes !== 1) throw new BuildError(409, "this task is not running on this environment");
  return { cancel: cancelIds(db, envId) };
}

export function heartbeat(db: DatabaseSync, envId: string, id: number): { cancel: number[] } {
  const prior = db.prepare("SELECT state, env_id FROM build_tasks WHERE id = ?").get(id) as { state: TaskState; env_id: string | null } | undefined;
  if (prior?.env_id === envId && prior.state === "cancelled") return { cancel: cancelIds(db, envId) };
  const t = mine(db, envId, id);
  db.prepare("UPDATE build_tasks SET heartbeat_at = ? WHERE id = ?").run(nowIso(), t.id);
  return { cancel: cancelIds(db, envId) };
}

const cleanLine = (s: unknown, max: number): string | null =>
  typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) || null : null;

/** Appends a log chunk; past the per-task cap the rest is dropped with a marker. */
export function appendLog(db: DatabaseSync, envId: string, id: number, step: unknown, chunk: unknown): { truncated: boolean } {
  const t = mine(db, envId, id);
  if (typeof chunk !== "string") throw new BuildError(400, "chunk must be text");
  const bytes = Buffer.byteLength(chunk);
  if (bytes > MAX_CHUNK_BYTES) throw new BuildError(413, "a log chunk is at most 64 KB");
  const name = cleanLine(step, 64) ?? "";
  // The bytes are reserved first by one conditional update and its changed-row count, so concurrent appends cannot pass the cap together.
  const claim = db.prepare("UPDATE build_tasks SET log_bytes = log_bytes + ?, heartbeat_at = ? WHERE id = ? AND log_bytes < ? RETURNING log_bytes").get(bytes, nowIso(), id, MAX_LOG_BYTES) as { log_bytes: number } | undefined;
  if (!claim) return { truncated: true };
  let text = chunk;
  let truncated = false;
  if (claim.log_bytes > MAX_LOG_BYTES) {
    const before = claim.log_bytes - bytes;
    text = `${Buffer.from(chunk).subarray(0, MAX_LOG_BYTES - before).toString("utf8")}\n[log truncated at 20 MB]\n`;
    truncated = true;
    db.prepare("UPDATE build_tasks SET log_bytes = ? WHERE id = ? AND log_bytes > ?").run(MAX_LOG_BYTES, id, MAX_LOG_BYTES);
  }
  const seq = (db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM build_task_logs WHERE task_id = ?").get(id) as { n: number }).n;
  db.prepare("INSERT INTO build_task_logs (task_id, seq, step, chunk) VALUES (?, ?, ?, ?)").run(id, seq, name, text);
  return { truncated };
}

export function parseResults(v: unknown): TaskResult[] {
  if (!Array.isArray(v) || v.length > 40) throw new BuildError(400, "results must be a list of at most 40 entries");
  return v.map((r, i) => {
    const o = r as Record<string, unknown> | null;
    if (!o || typeof o !== "object") throw new BuildError(400, `results[${i}] must be an object`);
    const step = cleanLine(o.step, 64);
    const code = o.exitCode;
    const ms = o.durationMs;
    if (!step || (code !== null && (typeof code !== "number" || !Number.isInteger(code))) || typeof ms !== "number" || !Number.isFinite(ms) || ms < 0 || typeof o.timedOut !== "boolean") {
      throw new BuildError(400, `results[${i}] is not valid`);
    }
    const mem = o.peakMemBytes;
    const peakMemBytes = typeof mem === "number" && Number.isFinite(mem) && mem >= 0 ? Math.round(mem) : undefined;
    return { step, exitCode: code as number | null, durationMs: Math.round(ms), timedOut: o.timedOut, ...(peakMemBytes !== undefined ? { peakMemBytes } : {}), ...(typeof o.oomKilled === "boolean" ? { oomKilled: o.oomKilled } : {}) };
  });
}

const REF_RE = /^[0-9a-f]{40}$/;
const IMAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/:@]{0,299}$/;
const PKG_RE = /^[a-z0-9][a-z0-9+.-]{0,99}$/;

/** The environment a worker reports for a task: image, packages and the craft-fonts / craft-i18n commits. */
export function parseSandboxEnv(v: unknown): SandboxEnv | null {
  if (v === undefined || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof v !== "object" || Array.isArray(v)) throw new BuildError(400, "environment must be an object");
  const ref = (x: unknown, name: string): string | null => {
    if (x === null || x === undefined) return null;
    if (typeof x !== "string" || !REF_RE.test(x)) throw new BuildError(400, `environment.${name} must be a commit id`);
    return x;
  };
  if (typeof o.image !== "string" || !IMAGE_RE.test(o.image) || typeof o.baseImage !== "string" || !IMAGE_RE.test(o.baseImage)) throw new BuildError(400, "environment images are not valid");
  if (!Array.isArray(o.packages) || o.packages.length > 100 || o.packages.some((p) => typeof p !== "string" || !PKG_RE.test(p))) throw new BuildError(400, "environment.packages is not valid");
  return { image: o.image, baseImage: o.baseImage, packages: o.packages as string[], craftFontsRef: ref(o.craftFontsRef, "craftFontsRef"), craftI18nRev: ref(o.craftI18nRev, "craftI18nRev") };
}

/** The worker's last word: done when every step exited 0, cancelled when an operator asked, else failed. */
export function finishTask(db: DatabaseSync, envId: string, id: number, body: unknown): { state: TaskState } {
  // A retried finish (the answer was lost) gets the state the first one set.
  const prior = db.prepare("SELECT state, env_id FROM build_tasks WHERE id = ?").get(id) as { state: TaskState; env_id: string | null } | undefined;
  if (prior && prior.env_id === envId && TERMINAL.includes(prior.state)) return { state: prior.state };
  const t = mine(db, envId, id);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BuildError(400, "the body must be a JSON object");
  const o = body as Record<string, unknown>;
  const results = parseResults(o.results);
  const summary = cleanLine(o.summary, 500);
  const sandbox = parseSandboxEnv(o.environment);
  const ok = results.length > 0 && results.every((r) => r.exitCode === 0 && !r.timedOut);
  const state: TaskState = t.cancel_requested_at ? "cancelled" : ok ? "done" : "failed";
  const r = db.prepare("UPDATE build_tasks SET state = ?, ended_at = ?, results = ?, summary = ?, sandbox_env = ? WHERE id = ? AND env_id = ? AND state IN ('claimed', 'running')")
    .run(state, nowIso(), JSON.stringify(results), summary, sandbox ? JSON.stringify(sandbox) : null, id, envId);
  if (r.changes !== 1) {
    // An operator cancelled it between the read and the write: the cancel stands.
    const now = db.prepare("SELECT state FROM build_tasks WHERE id = ?").get(id) as { state: TaskState } | undefined;
    if (now && TERMINAL.includes(now.state)) return { state: now.state };
    throw new BuildError(409, "this task is not running on this environment");
  }
  return { state };
}

/** Cancels a task at once. An active one stays listed in its worker's claim and heartbeat responses for two minutes, so the worker kills it. */
export function cancelTask(db: DatabaseSync, id: unknown, by: string): BuildTask {
  const n = typeof id === "number" ? id : Number(id);
  const t = Number.isInteger(n) ? (db.prepare("SELECT * FROM build_tasks WHERE id = ?").get(n) as TaskRow | undefined) : undefined;
  if (!t) throw new BuildError(404, "no such task");
  const at = nowIso();
  // The update names the state it saw, so the audit row records the state it really changed. A worker claiming the task in another
  // process between the read and the write makes it match nothing; read again and retry.
  let was = t.state;
  for (let tries = 0; ; tries++) {
    if (TERMINAL.includes(was)) throw new BuildError(409, `the task is already ${was}`);
    const r = db.prepare(`UPDATE build_tasks SET state = 'cancelled', ended_at = ?, cancel_requested_at = ?,
        summary = CASE state WHEN 'queued' THEN 'Cancelled before it started.' ELSE 'Cancelled by an operator.' END
      WHERE id = ? AND state = ?`).run(at, at, t.id, was);
    if (r.changes === 1) break;
    const now = db.prepare("SELECT state FROM build_tasks WHERE id = ?").get(t.id) as { state: TaskState } | undefined;
    was = now?.state ?? was;
    if (tries >= 5) throw new BuildError(409, `the task is already ${was}`);
  }
  audit(db, by, "task-cancel", `task:${t.id}`, { repo: t.repo, was });
  return getTask(db, t.id)!;
}

// ---- reading -----------------------------------------------------------------

const SELECT = "SELECT t.*, e.label AS env_label, r.default_branch AS default_branch FROM build_tasks t LEFT JOIN build_envs e ON e.id = t.env_id LEFT JOIN repos r ON r.name = t.repo";

function artifactsOf(db: DatabaseSync, ids: number[]): Map<number, TaskArtifact[]> {
  const out = new Map<number, TaskArtifact[]>();
  if (!ids.length) return out;
  const rows = db.prepare(`SELECT task_id, name, bytes, content_type FROM build_artifacts WHERE task_id IN (${ids.map(() => "?").join(",")}) ORDER BY name`).all(...ids) as
    { task_id: number; name: string; bytes: number; content_type: string }[];
  for (const r of rows) (out.get(r.task_id) ?? out.set(r.task_id, []).get(r.task_id)!).push({ name: r.name, bytes: r.bytes, contentType: r.content_type });
  return out;
}

/** The integration batches whose sandbox task is one of `ids`. */
function batchesOf(db: DatabaseSync, ids: number[], shown: (repo: string, number: number) => ItemShown): Map<number, TaskBatch> {
  const out = new Map<number, TaskBatch>();
  if (!ids.length) return out;
  const rows = db.prepare(`SELECT * FROM main.merge_batches WHERE task_id IN (${ids.map(() => "?").join(",")})`).all(...ids) as
    { id: number; task_id: number; repo?: string; branch: string; commit_sha: string; base_sha: string; fork?: string | null }[];
  const members = db.prepare("SELECT number FROM main.merge_batch_prs WHERE batch_id = ? ORDER BY position");
  for (const b of rows) {
    const prs = (members.all(b.id) as { number: number }[]).map((m) => m.number);
    out.set(b.task_id, {
      id: b.id, branch: b.branch, fork: b.fork ?? null, commitSha: b.commit_sha, baseSha: b.base_sha,
      prs, shown: prs.map((n) => shown(b.repo ?? "", n)),
    });
  }
  return out;
}

function toTask(r: TaskRow, artifacts: TaskArtifact[], batch: TaskBatch | null, shown: (repo: string, number: number) => ItemShown, noConfidential: boolean): BuildTask {
  return {
    id: r.id, jobId: r.job_id, step: r.step, repo: r.repo, number: r.number, headSha: r.head_sha, baseSha: r.base_sha,
    requires: json<Requires>(r.requires, {}), priority: r.priority, plan: json<TaskStep[]>(r.plan, []),
    state: r.state, envId: r.env_id, envLabel: r.env_label ?? null, cancelRequested: r.cancel_requested_at !== null,
    queuedAt: r.queued_at, claimedAt: r.claimed_at, startedAt: r.started_at, endedAt: r.ended_at, heartbeatAt: r.heartbeat_at,
    results: json<TaskResult[]>(r.results, []), artifacts,
    summary: r.summary ?? (r.state === "queued" && noConfidential && PRIVATE_STEPS.includes(r.step) ? CONFIDENTIAL_WAIT : null),
    patchBytes: r.patch ? Buffer.byteLength(r.patch) : null,
    warm: r.warm_key && (r.warm_role === "use" || r.warm_role === "build") ? { key: r.warm_key, role: r.warm_role } : null,
    batch,
    item: r.number === null ? null : shown(r.repo, r.number),
    baseline: r.step === "verify" && r.number === null && !r.patch ? { branch: r.default_branch ?? null } : null,
    sandbox: r.sandbox_env ? json<SandboxEnv | null>(r.sandbox_env, null) : null,
  };
}

export function getTask(db: DatabaseSync, id: number): BuildTask | null {
  const r = db.prepare(`${SELECT} WHERE t.id = ?`).get(id) as TaskRow | undefined;
  const shown = shownLookup(db);
  return r ? toTask(r, artifactsOf(db, [r.id]).get(r.id) ?? [], batchesOf(db, [r.id], shown).get(r.id) ?? null, shown, confidentialReadyAt(db) === null) : null;
}

/** The last bytes of the log, from whole chunks. */
export function logTail(db: DatabaseSync, id: number): { text: string; bytes: number; truncated: boolean } {
  const t = db.prepare("SELECT log_bytes FROM build_tasks WHERE id = ?").get(id) as { log_bytes: number } | undefined;
  const parts: string[] = [];
  let size = 0;
  for (const c of db.prepare("SELECT chunk FROM build_task_logs WHERE task_id = ? ORDER BY seq DESC").iterate(id) as Iterable<{ chunk: string }>) {
    parts.push(c.chunk);
    size += Buffer.byteLength(c.chunk);
    if (size >= LOG_TAIL_BYTES) break;
  }
  const joined = parts.reverse().join("");
  const cut = size > LOG_TAIL_BYTES ? Buffer.from(joined).subarray(-LOG_TAIL_BYTES).toString("utf8") : joined;
  return { text: cut, bytes: t?.log_bytes ?? 0, truncated: (t?.log_bytes ?? 0) > Buffer.byteLength(cut) };
}

export function getTaskDetail(db: DatabaseSync, id: number): BuildTaskDetail | null {
  const t = getTask(db, id);
  if (!t) return null;
  const l = logTail(db, id);
  const p = db.prepare("SELECT patch FROM build_tasks WHERE id = ?").get(id) as { patch: string | null } | undefined;
  return { ...t, logTail: l.text, logBytes: l.bytes, logTruncated: l.truncated, patch: p?.patch ?? null };
}

const CURSOR_RE = /^[1-9][0-9]{0,15}$/;
const FILTER_STATES = ["queued", "claimed", "running", "done", "failed", "cancelled", "lost", "active"];

/** The step of a security fix's builds: its tasks run under the finding's real repo, so viewers must not see them. */
export const FIX_CHECK_STEP = "fix-check";
/** Steps whose tasks hold a private finding: staff only. */
export const PRIVATE_STEPS = [FIX_CHECK_STEP, "scan-test"];
/** A private task's wait while no confidential environment can take it. */
export const CONFIDENTIAL_WAIT = "Waiting for a confidential build environment.";

/**
 * Since when the private tasks can be claimed: the earliest first worker call of an enabled confidential environment
 * after its flag (or the environment) was turned on; null while none has called since.
 */
export function confidentialReadyAt(db: DatabaseSync): number | null {
  const r = db.prepare("SELECT MIN(confidential_online_at) AS at FROM build_envs WHERE enabled = 1 AND confidential = 1").get() as { at: string | null };
  return r.at ? Date.parse(r.at) : null;
}

/** When a private task's build limit starts: when it was queued, or when a confidential environment could first take it. null: it waits for one. */
export function privateClockStart(db: DatabaseSync, queuedAt: string): number | null {
  const ready = confidentialReadyAt(db);
  return ready === null ? null : Math.max(Date.parse(queuedAt), ready);
}

/** SQL for the steps hidden from viewers, for `step NOT IN (...)`. */
export const PRIVATE_STEPS_SQL = PRIVATE_STEPS.map((x) => `'${x}'`).join(", ");

/** Newest first, keyset-paged by id. `hidden` repos are left out, and the security fix's tasks unless `staff`. */
export function listTasks(db: DatabaseSync, f: TaskFilter, hidden: string[] = [], staff = true): TaskPage {
  const where: string[] = staff ? [] : [`t.step NOT IN (${PRIVATE_STEPS_SQL})`];
  const params: Record<string, SQLInputValue> = {};
  const hide = excludeHidden("t.repo", hidden, params);
  if (hide) where.push(hide);
  if (f.state !== undefined) {
    if (!FILTER_STATES.includes(f.state)) throw new BuildError(400, "unknown state");
    if (f.state === "active") where.push("t.state IN ('queued', 'claimed', 'running')");
    else (where.push("t.state = :state"), (params.state = f.state));
  }
  if (f.env) (where.push("t.env_id = :env"), (params.env = f.env));
  if (f.repo) (where.push("t.repo = :repo"), (params.repo = f.repo));
  if (f.cursor !== undefined) {
    if (!CURSOR_RE.test(f.cursor)) throw new BuildError(400, "bad cursor");
    (where.push("t.id < :cursor"), (params.cursor = Number(f.cursor)));
  }
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = db.prepare(`${SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY t.id DESC LIMIT ${limit + 1}`).all(params) as TaskRow[];
  const page = rows.slice(0, limit);
  const arts = artifactsOf(db, page.map((r) => r.id));
  const shown = shownLookup(db);
  const batches = batchesOf(db, page.map((r) => r.id), shown);
  const noConfidential = confidentialReadyAt(db) === null;
  return { tasks: page.map((r) => toTask(r, arts.get(r.id) ?? [], batches.get(r.id) ?? null, shown, noConfidential)), next: rows.length > limit ? String(page[page.length - 1]!.id) : null };
}

export type { BuildSummary };
/** Queued and running tasks and the slots left, over all enabled environments (the flowchart's Verify node). */
export function summary(db: DatabaseSync, hidden: string[] = [], staff = true): BuildSummary {
  const params: Record<string, SQLInputValue> = {};
  const hide = excludeHidden("repo", hidden, params);
  const c = db.prepare(`SELECT COALESCE(SUM(state = 'queued'), 0) AS queued, COALESCE(SUM(state IN ('claimed', 'running')), 0) AS running FROM build_tasks WHERE state IN ('queued', 'claimed', 'running')${staff ? "" : ` AND step NOT IN (${PRIVATE_STEPS_SQL})`}${hide ? ` AND ${hide}` : ""}`).get(params) as { queued: number; running: number };
  const all = db.prepare("SELECT * FROM build_envs WHERE enabled = 1 AND last_seen_at > ?").all(new Date(Date.now() - 60_000).toISOString()) as { slots: number; reported_slots: number | null; id: string }[];
  const used = db.prepare("SELECT env_id AS id, COUNT(*) AS n FROM build_tasks WHERE state IN ('claimed', 'running') GROUP BY env_id").all() as { id: string; n: number }[];
  const byEnv = new Map(used.map((u) => [u.id, u.n]));
  const slots = all.reduce((s, e) => s + slotsOf(e), 0);
  const inUse = all.reduce((s, e) => s + Math.min(byEnv.get(e.id) ?? 0, slotsOf(e)), 0);
  return { queued: c.queued, running: c.running, slots, free: slots - inUse, online: all.length };
}

/** Drops the artifacts of tasks that ended more than ARTIFACT_KEEP_MS ago, and deletes tasks that ended more than KEEP_MS ago with their logs. Returns the count of deleted tasks. */
export function pruneTasks(db: DatabaseSync, nowMs: number = Date.now()): number {
  const artifactsBefore = new Date(nowMs - ARTIFACT_KEEP_MS).toISOString();
  for (;;) {
    const ids = (db.prepare("SELECT id FROM build_tasks WHERE ended_at IS NOT NULL AND ended_at < ? AND artifact_bytes > 0 AND state IN ('done', 'failed', 'cancelled', 'lost') ORDER BY ended_at LIMIT 200").all(artifactsBefore) as { id: number }[]).map((r) => r.id);
    if (!ids.length) break;
    removeArtifacts(db, ids);
  }
  const before = new Date(nowMs - KEEP_MS).toISOString();
  let n = 0;
  for (;;) {
    const ids = (db.prepare("SELECT id FROM build_tasks WHERE ended_at IS NOT NULL AND ended_at < ? AND state IN ('done', 'failed', 'cancelled', 'lost') ORDER BY ended_at LIMIT 200").all(before) as { id: number }[]).map((r) => r.id);
    if (!ids.length) return n;
    removeArtifacts(db, ids);
    for (const id of ids) {
      db.prepare("DELETE FROM build_task_logs WHERE task_id = ?").run(id);
      db.prepare("DELETE FROM build_tasks WHERE id = ?").run(id);
    }
    n += ids.length;
  }
}

export type MemRow = { repo: string; step: string; steps: number; medianBytes: number; maxBytes: number; oom: number };

/** Peak memory per repo and step name over tasks that ended in the last `days` days; steps without a measurement are skipped. */
export function memorySummary(db: DatabaseSync, days: number): MemRow[] {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = db.prepare("SELECT repo, results FROM build_tasks WHERE ended_at >= ? AND results != '[]'").all(since) as { repo: string; results: string }[];
  const groups = new Map<string, { repo: string; step: string; peaks: number[]; oom: number }>();
  for (const row of rows) {
    for (const r of json<TaskResult[]>(row.results, [])) {
      if (typeof r.peakMemBytes !== "number") continue;
      const key = `${row.repo}\0${r.step}`;
      const g = groups.get(key) ?? { repo: row.repo, step: r.step, peaks: [], oom: 0 };
      g.peaks.push(r.peakMemBytes);
      if (r.oomKilled) g.oom++;
      groups.set(key, g);
    }
  }
  return [...groups.values()]
    .map((g) => {
      const p = g.peaks.sort((a, b) => a - b);
      const mid = p.length >> 1;
      return { repo: g.repo, step: g.step, steps: p.length, medianBytes: p.length % 2 ? p[mid]! : Math.round((p[mid - 1]! + p[mid]!) / 2), maxBytes: p[p.length - 1]!, oom: g.oom };
    })
    .sort((a, b) => a.repo.localeCompare(b.repo) || a.step.localeCompare(b.step));
}
