// Updating the sandbox worker's code without killing its tasks. The worker's admin
// command replaces the code and restarts the worker, so an update waits until the
// local-sandbox environments have no claimed or running tasks. While one waits,
// `claim` hands those environments nothing, so they drain.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

export const PENDING_KEY = "worker_update_pending";
export const FAILURES_KEY = "worker_update_failures";
/** Failed attempts after which the runner stops retrying a pending update until a newer deploy replaces it. */
export const MAX_FAILURES = 5;

/** Where and how to reach the worker and where the code comes from; all supplied by the deploy. */
export type UpdateSpec = {
  sha: string;
  /** user@host of the worker's admin SSH command */
  ssh: string;
  keyFile: string;
  /** bare repository holding `sha` */
  gitDir: string;
};

/** The two things done to a worker; tests replace it. */
export type WorkerAdmin = {
  version(spec: UpdateSpec): Promise<string>;
  update(spec: UpdateSpec): Promise<void>;
};

/** True when every field has the expected shape; the values reach ssh and git argument lists. */
export function validSpec(s: UpdateSpec): boolean {
  return (
    typeof s.sha === "string" && /^[0-9a-f]{40,64}$/.test(s.sha) &&
    typeof s.ssh === "string" && /^[A-Za-z0-9._-]+@[A-Za-z0-9.:_-]+$/.test(s.ssh) && !s.ssh.startsWith("-") &&
    typeof s.gitDir === "string" && s.gitDir.startsWith("/") &&
    typeof s.keyFile === "string" && s.keyFile.startsWith("/")
  );
}

/** Only known host keys are accepted: those in `<keyFile>.known_hosts` when it exists, else the user's known_hosts. An unknown key fails the update. */
const sshArgs = (s: UpdateSpec): string[] => {
  if (!validSpec(s)) throw new Error("invalid worker update spec");
  const pinned = `${s.keyFile}.known_hosts`;
  const hostKeys = [...(existsSync(pinned) ? ["-o", `UserKnownHostsFile=${pinned}`] : []), "-o", "StrictHostKeyChecking=yes"];
  return ["-i", s.keyFile, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", ...hostKeys, s.ssh];
};

function collect(cmd: string, args: string[], input?: NodeJS.ReadableStream): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout!.on("data", (d) => (out += d));
    p.stderr!.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
    if (input) input.pipe(p.stdin!);
  });
}

export const sshAdmin: WorkerAdmin = {
  async version(s) {
    try {
      const r = await collect("ssh", [...sshArgs(s), "version"]);
      return r.code === 0 ? r.out.trim() : "";
    } catch {
      return "";
    }
  },
  async update(s) {
    if (!validSpec(s)) throw new Error("invalid worker update spec");
    const git = spawn("git", [`--git-dir=${s.gitDir}`, "archive", s.sha], { stdio: ["ignore", "pipe", "pipe"] });
    let gitErr = "";
    git.stderr.on("data", (d) => (gitErr += d));
    const gitDone = new Promise<number | null>((resolve, reject) => { git.on("error", reject); git.on("close", resolve); });
    const r = await collect("ssh", [...sshArgs(s), "update", s.sha], git.stdout);
    const gitCode = await gitDone;
    if (gitCode !== 0) throw new Error(`git archive failed: ${gitErr.trim().slice(-300)}`);
    if (r.code !== 0) throw new Error(`worker update failed (exit ${r.code}): ${r.err.trim().slice(-300)}`);
  },
};

const getSetting = (db: DatabaseSync, key: string): string | null => (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
const putSetting = (db: DatabaseSync, key: string, value: string): void => {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
};
const clearSetting = (db: DatabaseSync, key: string): void => { db.prepare("DELETE FROM settings WHERE key = ?").run(key); };

export function pendingUpdate(db: DatabaseSync): UpdateSpec | null {
  const raw = getSetting(db, PENDING_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as UpdateSpec;
    return s && validSpec(s) ? s : null;
  } catch {
    return null;
  }
}

export function updateFailures(db: DatabaseSync): { count: number; error: string } | null {
  const raw = getSetting(db, FAILURES_KEY);
  try {
    return raw ? (JSON.parse(raw) as { count: number; error: string }) : null;
  } catch {
    return null;
  }
}

/** Claimed or running tasks on the local sandbox environments, the ones whose worker the update restarts. */
export function busyTasks(db: DatabaseSync): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM build_tasks WHERE state IN ('claimed', 'running')
    AND env_id IN (SELECT id FROM build_envs WHERE kind = 'local-sandbox')`).get() as { n: number }).n;
}

/**
 * The deploy's entry point. Returns what happened: "current" (the worker runs this commit),
 * "updated", or "waiting" (tasks are running; the update is recorded, replacing an older pending one).
 */
export async function requestUpdate(db: DatabaseSync, spec: UpdateSpec, admin: WorkerAdmin = sshAdmin): Promise<{ result: "current" | "updated" | "waiting"; busy: number }> {
  if ((await admin.version(spec)) === spec.sha) {
    clearSetting(db, PENDING_KEY);
    clearSetting(db, FAILURES_KEY);
    return { result: "current", busy: 0 };
  }
  const busy = busyTasks(db);
  if (busy > 0) {
    putSetting(db, PENDING_KEY, JSON.stringify(spec));
    clearSetting(db, FAILURES_KEY);
    return { result: "waiting", busy };
  }
  await admin.update(spec);
  clearSetting(db, PENDING_KEY);
  clearSetting(db, FAILURES_KEY);
  return { result: "updated", busy: 0 };
}

/** The runner's periodic check: runs a pending update once the local environments are idle. Returns true when it updated. */
export async function checkPendingUpdate(db: DatabaseSync, admin: WorkerAdmin = sshAdmin, log: (m: string) => void = () => {}): Promise<boolean> {
  const spec = pendingUpdate(db);
  if (!spec) return false;
  const failed = updateFailures(db);
  if (failed && failed.count >= MAX_FAILURES) return false;
  if (busyTasks(db) > 0) return false;
  try {
    if ((await admin.version(spec)) !== spec.sha) await admin.update(spec);
    clearSetting(db, PENDING_KEY);
    clearSetting(db, FAILURES_KEY);
    log(`sandbox worker updated to ${spec.sha.slice(0, 12)}`);
    return true;
  } catch (e) {
    const count = (failed?.count ?? 0) + 1;
    const error = (e as Error).message.slice(0, 400);
    putSetting(db, FAILURES_KEY, JSON.stringify({ count, error }));
    log(`sandbox worker update to ${spec.sha.slice(0, 12)} failed (${count}/${MAX_FAILURES}): ${error}`);
    return false;
  }
}

/** True when a pending update should keep this environment from taking new tasks. */
export function draining(db: DatabaseSync, kind: string): boolean {
  return kind === "local-sandbox" && getSetting(db, PENDING_KEY) !== null;
}

export function statusLines(db: DatabaseSync): string[] {
  const p = pendingUpdate(db);
  if (!p) return ["sandbox worker update: none pending"];
  const f = updateFailures(db);
  const lines = [`sandbox worker update: ${p.sha.slice(0, 12)} pending (${busyTasks(db)} tasks still running on local sandbox environments)`];
  if (f) lines.push(`  ${f.count} failed attempts${f.count >= MAX_FAILURES ? " (retries stopped until the next deploy or a manual update-code)" : ""}; last error: ${f.error}`);
  return lines;
}
