// Build environments (workers): operator-registered places that run untrusted
// code. The coordinator holds only a hash of each worker key. Everything a
// worker reports is stored as data and shown as text.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { BuildEnv, Capabilities, EnvCreate, EnvInput, EnvKind } from "../../web/src/api/types.ts";
import { audit } from "../dash/audit.ts";

export class BuildError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const ONLINE_MS = 60_000;
export const MAX_SLOTS = 64;
export const LABEL_MAX = 40;
export const ENV_ID_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
export const KINDS: EnvKind[] = ["local-sandbox", "remote"];
const KEY_PREFIX = "cwk";

type Row = {
  id: string; label: string; kind: EnvKind; enabled: number; slots: number; key_hash: string; capabilities: string | null; confidential: number;
  reported_slots: number | null; version: string | null; paused_reason: string | null; last_seen_at: string | null;
};

export const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");

/** A new key: `cwk_<env id>_<secret>`; the id lets the coordinator find the row without scanning. */
export function newKey(envId: string): string {
  return `${KEY_PREFIX}_${envId}_${randomBytes(32).toString("base64url")}`;
}

const DUMMY_HASH = hashKey("no such environment");

/** The environment a bearer key belongs to, or null. The comparison takes the same time for a wrong key and an unknown id. */
export function authenticate(db: DatabaseSync, key: string): { id: string } | null {
  if (key.length > 200) return null;
  const m = /^cwk_([a-z0-9-]{3,32})_[A-Za-z0-9_-]{20,100}$/.exec(key);
  const row = m ? (db.prepare("SELECT id, key_hash FROM build_envs WHERE id = ?").get(m[1]!) as { id: string; key_hash: string } | undefined) : undefined;
  const a = Buffer.from(hashKey(key), "hex");
  const b = Buffer.from(row?.key_hash ?? DUMMY_HASH, "hex");
  const same = a.length === b.length && timingSafeEqual(a, b);
  return row && same ? { id: row.id } : null;
}

function parseCaps(s: string | null): Capabilities | null {
  try {
    return s ? (JSON.parse(s) as Capabilities) : null;
  } catch {
    return null;
  }
}

function runningCounts(db: DatabaseSync): Map<string, number> {
  const rows = db.prepare("SELECT env_id AS id, COUNT(*) AS n FROM build_tasks WHERE state IN ('claimed', 'running') GROUP BY env_id").all() as { id: string; n: number }[];
  return new Map(rows.map((r) => [r.id, r.n]));
}

export const slotsOf = (r: { slots: number; reported_slots: number | null }): number => Math.min(r.slots, r.reported_slots ?? r.slots);

function toEnv(r: Row, running: number, nowMs: number): BuildEnv {
  const online = r.last_seen_at !== null && nowMs - Date.parse(r.last_seen_at) < ONLINE_MS;
  return {
    id: r.id, label: r.label, kind: r.kind, enabled: r.enabled === 1, online, lastSeenAt: r.last_seen_at,
    slots: slotsOf(r), running, capabilities: parseCaps(r.capabilities), version: r.version,
    pausedReason: r.enabled === 1 && online ? r.paused_reason : null, confidential: r.confidential === 1,
  };
}

/** Every environment, in the order they were registered. */
export function listEnvs(db: DatabaseSync, nowMs: number = Date.now()): BuildEnv[] {
  const counts = runningCounts(db);
  return (db.prepare("SELECT * FROM build_envs ORDER BY created_at, id").all() as Row[]).map((r) => toEnv(r, counts.get(r.id) ?? 0, nowMs));
}

export function getEnv(db: DatabaseSync, id: string, nowMs: number = Date.now()): BuildEnv | null {
  return listEnvs(db, nowMs).find((e) => e.id === id) ?? null;
}

function checkLabel(v: unknown): string {
  if (typeof v !== "string") throw new BuildError(400, "label must be text");
  const l = v.trim();
  if (!l || l.length > LABEL_MAX || /[\u0000-\u001f<>@]/.test(l)) throw new BuildError(400, `label must be 1 to ${LABEL_MAX} characters without @, < or >`);
  return l;
}

function checkSlots(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > MAX_SLOTS) throw new BuildError(400, `slots must be a whole number from 1 to ${MAX_SLOTS}`);
  return v;
}

function checkFlag(v: unknown, name: string): boolean {
  if (typeof v !== "boolean") throw new BuildError(400, `${name} must be true or false`);
  return v;
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new BuildError(400, "the body must be a JSON object");
  return input as Record<string, unknown>;
}

/** Registers an environment. The key is returned here and never again. */
export function createEnv(db: DatabaseSync, input: unknown, by: string): { env: BuildEnv; key: string } {
  const o = object(input);
  const bad = Object.keys(o).find((k) => !["id", "label", "kind", "slots", "confidential"].includes(k));
  if (bad) throw new BuildError(400, `${bad} cannot be set`);
  const id = o.id;
  if (typeof id !== "string" || !ENV_ID_RE.test(id)) throw new BuildError(400, "id must be 3 to 32 lowercase letters, digits or hyphens, starting with a letter");
  const label = checkLabel(o.label);
  if (!KINDS.includes(o.kind as EnvKind)) throw new BuildError(400, `kind must be ${KINDS.join(" or ")}`);
  const slots = checkSlots(o.slots);
  const confidential = o.confidential === undefined ? false : checkFlag(o.confidential, "confidential");
  const key = newKey(id);
  const at = new Date().toISOString();
  try {
    db.prepare("INSERT INTO build_envs (id, label, kind, slots, confidential, confidential_since, key_hash, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, label, o.kind as EnvKind, slots, confidential ? 1 : 0, confidential ? at : null, hashKey(key), at, by, at);
  } catch (e) {
    if (/UNIQUE|constraint/i.test((e as Error).message)) throw new BuildError(409, `environment ${id} exists`);
    throw e;
  }
  audit(db, by, "env-create", `env:${id}`, { label, kind: o.kind, slots, ...(confidential && { confidential }) });
  return { env: getEnv(db, id)!, key };
}

export function updateEnv(db: DatabaseSync, id: unknown, input: unknown, by: string): BuildEnv {
  const o = object(input);
  const bad = Object.keys(o).find((k) => !["label", "enabled", "slots", "confidential"].includes(k));
  if (bad) throw new BuildError(400, `${bad} cannot be set`);
  const before = typeof id === "string" ? (db.prepare("SELECT * FROM build_envs WHERE id = ?").get(id) as Row | undefined) : undefined;
  if (!before) throw new BuildError(404, "no such environment");
  const next = {
    label: o.label !== undefined ? checkLabel(o.label) : before.label,
    enabled: before.enabled === 1,
    slots: o.slots !== undefined ? checkSlots(o.slots) : before.slots,
    confidential: o.confidential !== undefined ? checkFlag(o.confidential, "confidential") : before.confidential === 1,
  };
  if (o.enabled !== undefined) next.enabled = checkFlag(o.enabled, "enabled");
  const at = new Date().toISOString();
  db.prepare("UPDATE build_envs SET label = ?, enabled = ?, slots = ?, confidential = ?, updated_by = ?, updated_at = ? WHERE id = ?")
    .run(next.label, next.enabled ? 1 : 0, next.slots, next.confidential ? 1 : 0, by, at, before.id);
  // The private tasks' build limit starts at the worker's first call after the flag, or the environment, is turned on.
  if (!next.confidential) db.prepare("UPDATE build_envs SET confidential_since = NULL, confidential_online_at = NULL WHERE id = ?").run(before.id);
  else if (before.confidential !== 1 || (next.enabled && before.enabled !== 1)) db.prepare("UPDATE build_envs SET confidential_since = ?, confidential_online_at = NULL WHERE id = ?").run(at, before.id);
  audit(db, by, "env-change", `env:${before.id}`, {
    ...(next.label !== before.label && { label: next.label, was: before.label }),
    ...(next.enabled !== (before.enabled === 1) && { enabled: next.enabled }),
    ...(next.slots !== before.slots && { slots: next.slots, was: before.slots }),
    ...(next.confidential !== (before.confidential === 1) && { confidential: next.confidential }),
  });
  return getEnv(db, before.id)!;
}

/** A new key; the old one stops working at once. */
export function rotateKey(db: DatabaseSync, id: unknown, by: string): { key: string } {
  if (typeof id !== "string" || !db.prepare("SELECT 1 FROM build_envs WHERE id = ?").get(id)) throw new BuildError(404, "no such environment");
  const key = newKey(id);
  db.prepare("UPDATE build_envs SET key_hash = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(hashKey(key), by, new Date().toISOString(), id);
  audit(db, by, "env-rotate-key", `env:${id}`);
  return { key };
}

const OS = ["linux", "macos", "windows"], ARCH = ["x86_64", "aarch64"];
const TOOLCHAIN_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;

/** Checks what a worker reports about itself; anything else is refused. */
export function parseCapabilities(v: unknown): Capabilities {
  const o = object(v);
  const int = (k: string, max: number) => {
    const n = o[k];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > max) throw new BuildError(400, `capabilities.${k} must be a number from 0 to ${max}`);
    return Math.round(n);
  };
  if (!OS.includes(o.os as string)) throw new BuildError(400, "capabilities.os is not known");
  if (!ARCH.includes(o.arch as string)) throw new BuildError(400, "capabilities.arch is not known");
  if (typeof o.display !== "boolean" || typeof o.gpu !== "boolean") throw new BuildError(400, "capabilities.display and gpu must be true or false");
  const tc = o.toolchains;
  if (!Array.isArray(tc) || tc.length > 40 || tc.some((t) => typeof t !== "string" || !TOOLCHAIN_RE.test(t))) throw new BuildError(400, "capabilities.toolchains must be a list of at most 40 short names");
  return {
    os: o.os as Capabilities["os"], arch: o.arch as Capabilities["arch"], cpus: int("cpus", 4096), memGb: int("memGb", 65536), diskGb: int("diskGb", 10_000_000),
    display: o.display, gpu: o.gpu, toolchains: [...new Set(tc as string[])].sort(),
    ...(o.warmSigner === true ? { warmSigner: true } : {}),
  };
}

/** A flagged, enabled environment's first worker call since the flag was turned on. */
function markOnline(db: DatabaseSync, id: string, at: string): void {
  db.prepare("UPDATE build_envs SET confidential_online_at = ? WHERE id = ? AND confidential = 1 AND enabled = 1 AND confidential_online_at IS NULL").run(at, id);
}

/** Records a call from the worker: the heartbeat and, when given, its paused reason. */
export function touch(db: DatabaseSync, id: string, paused?: string | null): void {
  const at = new Date().toISOString();
  markOnline(db, id, at);
  if (paused === undefined) db.prepare("UPDATE build_envs SET last_seen_at = ? WHERE id = ?").run(at, id);
  else db.prepare("UPDATE build_envs SET last_seen_at = ?, paused_reason = ? WHERE id = ?").run(at, paused, id);
}

/** The worker's first call: stores what it can do, capped by the operator's slot count. */
export function hello(db: DatabaseSync, id: string, body: unknown): { envId: string; label: string; slots: number } {
  const o = object(body);
  const caps = parseCapabilities(o.capabilities);
  const version = typeof o.version === "string" && o.version.length <= 40 && /^[\w.+-]+$/.test(o.version) ? o.version : null;
  if (typeof o.slots !== "number" || !Number.isInteger(o.slots) || o.slots < 0 || o.slots > 1024) throw new BuildError(400, "slots must be a whole number");
  const at = new Date().toISOString();
  db.prepare("UPDATE build_envs SET capabilities = ?, reported_slots = ?, version = ?, last_seen_at = ?, paused_reason = NULL WHERE id = ?")
    .run(JSON.stringify(caps), o.slots, version, at, id);
  markOnline(db, id, at);
  const r = db.prepare("SELECT * FROM build_envs WHERE id = ?").get(id) as Row;
  return { envId: id, label: r.label, slots: slotsOf(r) };
}
