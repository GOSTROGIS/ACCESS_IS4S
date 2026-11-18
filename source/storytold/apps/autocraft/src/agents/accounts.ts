// Claude accounts: which ones an operator enabled, how busy and how full they
// are, and the choice of an account for the next model call.
//
// Only accounts present in the box config (box.ts) are listed. Their config
// directories stay in this process: nothing here returns one.
import type { DatabaseSync } from "node:sqlite";
import { modelPolicy } from "./codex/config.ts";
import { nativeTransport } from "./codex/transport.ts";
import { CODEX_EXECUTION_READY, CODEX_UNAVAILABLE } from "./codex/capabilities.ts";
import type { AccountAuth, AccountInput, ClaudeAccount } from "../../web/src/api/types.ts";
import { audit } from "../dash/audit.ts";
import { JEV_PARALLEL_DEFAULT } from "../prompts/index.ts";
import { loginInfo } from "./login.ts";
import { credentialsNearExpiry, tokenView } from "./token.ts";
import { boxAccounts, iso, readUsage, type BoxAccount, type Reading } from "./box.ts";

export const USAGE_PAUSE_KEY = "usage_pause";
export type UsagePause = { fiveHour: number; weekly: number };
export const USAGE_PAUSE_DEFAULT: UsagePause = { fiveHour: 80, weekly: 80 };
/** A reading older than this counts as unknown, and unknown is allowed. */
export const STALE_MS = 30 * 60_000;
/** A run still "running" after this long belongs to a process that is gone; it no longer takes a slot. */
export const RUN_SLOT_MS = 60 * 60_000;
export const MAX_CONCURRENT_LIMIT = 100;
export const LABEL_MAX = 40;

export class AccountError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function validLabel(v: unknown): string {
  if (typeof v !== "string") throw new AccountError(400, "label must be text");
  const l = v.trim();
  if (!l || l.length > LABEL_MAX || /[\u0000-\u001f<>@]/.test(l)) throw new AccountError(400, `label must be 1 to ${LABEL_MAX} characters without @, < or > (never an email address)`);
  return l;
}

type Row = { id: string; label: string; enabled: number; max_concurrent: number };

/** Adds a row (disabled, labelled with its id) for each account of the box config that has none. */
export function syncAccounts(db: DatabaseSync, box: BoxAccount[] = boxAccounts(db)): void {
  const ins = db.prepare("INSERT OR IGNORE INTO claude_accounts (id, label) VALUES (?, ?)");
  for (const a of box) ins.run(a.id, a.id);
}

const fresh = (r: Reading | null, nowMs: number): Reading | null => (r && nowMs - r.writtenAt * 1000 <= STALE_MS ? r : null);

const validPct = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100;

/** The usage levels at which an account stops taking calls; absent or unreadable gives the defaults. */
export function usagePause(db: DatabaseSync): UsagePause {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(USAGE_PAUSE_KEY) as { value: string } | undefined;
  if (!row) return USAGE_PAUSE_DEFAULT;
  try {
    const v = JSON.parse(row.value) as Partial<UsagePause> | null;
    return v && validPct(v.fiveHour) && validPct(v.weekly) ? { fiveHour: v.fiveHour, weekly: v.weekly } : USAGE_PAUSE_DEFAULT;
  } catch {
    return USAGE_PAUSE_DEFAULT;
  }
}

export function setUsagePause(db: DatabaseSync, input: unknown, by: string): UsagePause {
  const v = input as Partial<UsagePause> | null;
  if (!v || typeof v !== "object" || !validPct(v.fiveHour) || !validPct(v.weekly)) throw new AccountError(400, "pause levels must be whole numbers from 1 to 100");
  const was = usagePause(db);
  const next = { fiveHour: v.fiveHour, weekly: v.weekly };
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(USAGE_PAUSE_KEY, JSON.stringify(next));
  if (next.fiveHour !== was.fiveHour || next.weekly !== was.weekly) audit(db, by, "account-change", "usage-pause", { ...next, was });
  return next;
}

/** Why a fresh reading blocks new calls at the given levels, or null. */
export function headroomReason(r: Reading | null, limits: UsagePause, nowMs: number = Date.now()): string | null {
  const f = fresh(r, nowMs);
  if (!f) return null;
  if (f.fiveHour && f.fiveHour.pct >= limits.fiveHour) return `5-hour use ${Math.round(f.fiveHour.pct)} % (pauses at ${limits.fiveHour} %)`;
  if (f.weekly && f.weekly.pct >= limits.weekly) return `weekly use ${Math.round(f.weekly.pct)} % (pauses at ${limits.weekly} %)`;
  return null;
}

function runningCounts(db: DatabaseSync, nowMs: number): Map<string, number> {
  const since = new Date(nowMs - RUN_SLOT_MS).toISOString();
  const rows = db.prepare("SELECT account_id AS id, COUNT(*) AS n FROM agent_runs WHERE state = 'running' AND account_id IS NOT NULL AND started_at >= ? GROUP BY account_id")
    .all(since) as { id: string; n: number }[];
  return new Map(rows.map((r) => [r.id, r.n]));
}

function rows(db: DatabaseSync, box: BoxAccount[]): Row[] {
  if (!box.length) return [];
  const all = db.prepare("SELECT id, label, enabled, max_concurrent FROM claude_accounts").all() as Row[];
  const byId = new Map(all.map((r) => [r.id, r]));
  return box.flatMap((b) => (byId.has(b.id) ? [byId.get(b.id)!] : []));
}

type StatusRow = { logged_in: number; method: string | null; plan: string | null; login_expires_at: string | null; checked_at: string };

function authOf(db: DatabaseSync, id: string): AccountAuth {
  const s = db.prepare("SELECT logged_in, method, plan, login_expires_at, checked_at FROM claude_account_status WHERE account_id = ?").get(id) as StatusRow | undefined;
  return s
    ? { loggedIn: s.logged_in === 1, method: s.method, plan: s.plan, expiresAt: s.login_expires_at, checkedAt: s.checked_at }
    : { loggedIn: null, method: null, plan: null, expiresAt: null, checkedAt: null };
}

function toAccount(r: Row, token: ClaudeAccount["token"], running: number, reading: Reading | null, nowMs: number, auth: AccountAuth, limits: UsagePause): ClaudeAccount {
  return {
    auth, login: loginInfo(r.id), token,
    id: r.id, label: r.label, enabled: r.enabled === 1, maxConcurrent: r.max_concurrent, running,
    usage: {
      fiveHourPct: reading?.fiveHour?.pct ?? null,
      fiveHourResetsAt: reading?.fiveHour?.resetsAt != null ? iso(reading.fiveHour.resetsAt) : null,
      weeklyPct: reading?.weekly?.pct ?? null,
      weeklyResetsAt: reading?.weekly?.resetsAt != null ? iso(reading.weekly.resetsAt) : null,
      readAt: reading ? iso(reading.writtenAt) : null,
    },
    pausedReason: r.enabled === 1 ? headroomReason(reading, limits, nowMs) : null,
  };
}

/** Every account of the box config, enabled or not, in config order. With `sync` false nothing is written: accounts without a stored row are left out. */
export function listAccounts(db: DatabaseSync, nowMs: number = Date.now(), sync = true): ClaudeAccount[] {
  const box = boxAccounts(db);
  if (sync) syncAccounts(db, box);
  const counts = runningCounts(db, nowMs), limits = usagePause(db);
  return rows(db, box).map((r) => toAccount(r, tokenView(db, r.id, box.find((b) => b.id === r.id)!.configDir), counts.get(r.id) ?? 0, readUsage(r.id), nowMs, authOf(db, r.id), limits));
}

export function updateAccount(db: DatabaseSync, id: unknown, input: unknown, by: string): ClaudeAccount {
  const box = boxAccounts(db);
  if (typeof id !== "string" || !box.some((b) => b.id === id)) throw new AccountError(404, "no such account");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountError(400, "the body must be a JSON object");
  const o = input as Record<string, unknown>;
  const bad = Object.keys(o).find((k) => !["label", "enabled", "maxConcurrent"].includes(k));
  if (bad) throw new AccountError(400, `${bad} cannot be set`);
  if (o.label !== undefined) {
    o.label = validLabel(o.label);
  }
  if (o.enabled !== undefined && typeof o.enabled !== "boolean") throw new AccountError(400, "enabled must be true or false");
  if (o.maxConcurrent !== undefined && (typeof o.maxConcurrent !== "number" || !Number.isInteger(o.maxConcurrent) || o.maxConcurrent < 1 || o.maxConcurrent > MAX_CONCURRENT_LIMIT)) {
    throw new AccountError(400, `maxConcurrent must be a whole number from 1 to ${MAX_CONCURRENT_LIMIT}`);
  }
  syncAccounts(db, box);
  const before = rows(db, box).find((r) => r.id === id)!;
  const next = {
    label: (o.label as string | undefined) ?? before.label,
    enabled: (o.enabled as boolean | undefined) ?? before.enabled === 1,
    maxConcurrent: (o.maxConcurrent as number | undefined) ?? before.max_concurrent,
  };
  db.prepare("UPDATE claude_accounts SET label = ?, enabled = ?, max_concurrent = ?, updated_by = ?, updated_at = ? WHERE id = ?")
    .run(next.label, next.enabled ? 1 : 0, next.maxConcurrent, by, new Date().toISOString(), id);
  audit(db, by, "account-change", `account:${id}`, {
    ...(next.label !== before.label && { label: next.label, was: before.label }),
    ...(next.enabled !== (before.enabled === 1) && { enabled: next.enabled }),
    ...(next.maxConcurrent !== before.max_concurrent && { maxConcurrent: next.maxConcurrent }),
  });
  return listAccounts(db).find((a) => a.id === id)!;
}

export type Choice =
  | { account: { id: string; configDir: string } }
  | { wait: string }          // enabled accounts exist, none can take a call now
  | { none: true };           // no account is enabled

/**
 * The enabled account with a free slot and headroom that has the lowest weekly use.
 * With `minTokenMs`, an account whose login token expires within that many ms is not eligible
 * (a sandboxed call cannot refresh the token); it is named in the wait reason instead.
 * With `ignoreSlots`, full accounts count as available: whether a call could run once a slot frees, used for a waiter's eligibility in the call queue.
 */
export function chooseAccount(db: DatabaseSync, nowMs: number = Date.now(), minTokenMs?: number, ignoreSlots = false): Choice {
  const box = boxAccounts(db);
  syncAccounts(db, box);
  const enabled = rows(db, box).filter((r) => r.enabled === 1);
  if (!enabled.length) return { none: true };
  const counts = runningCounts(db, nowMs), limits = usagePause(db);
  const reasons: string[] = [];
  const ok: { r: Row; weekly: number; running: number }[] = [];
  for (const r of enabled) {
    const reading = readUsage(r.id), running = counts.get(r.id) ?? 0;
    const why = headroomReason(reading, limits, nowMs);
    if (why) reasons.push(`${r.label}: ${why}`);
    else if (!ignoreSlots && running >= r.max_concurrent) reasons.push(`${r.label}: ${running} of ${r.max_concurrent} slots in use`);
    else if (minTokenMs !== undefined && credentialsNearExpiry(db, r.id, box.find((b) => b.id === r.id)!.configDir, nowMs, minTokenMs)) reasons.push(`${r.label}: login token expires within ${Math.ceil(minTokenMs / 60_000)} min; waiting for its refresh`);
    else ok.push({ r, weekly: fresh(reading, nowMs)?.weekly?.pct ?? 0, running });
  }
  if (!ok.length) return { wait: reasons.join("; ") };
  ok.sort((a, b) => a.weekly - b.weekly || a.running - b.running || a.r.id.localeCompare(b.r.id));
  const pick = ok[0]!.r;
  return { account: { id: pick.id, configDir: box.find((b) => b.id === pick.id)!.configDir } };
}

/** Whether the given account is still enabled, has headroom and a free slot (a follow-up on its session may start). */
export function accountHasRoom(db: DatabaseSync, accountId: string, nowMs: number = Date.now()): boolean {
  const box = boxAccounts(db);
  syncAccounts(db, box);
  const r = rows(db, box).find((x) => x.id === accountId);
  if (!r || r.enabled !== 1 || headroomReason(readUsage(r.id), usagePause(db), nowMs)) return false;
  return (runningCounts(db, nowMs).get(r.id) ?? 0) < r.max_concurrent;
}

/** Calls the enabled accounts with headroom can take right now: the sum of their free slots. */
export function claudeFreeSlots(db: DatabaseSync, nowMs: number = Date.now()): number {
  const box = boxAccounts(db);
  syncAccounts(db, box);
  const counts = runningCounts(db, nowMs), limits = usagePause(db);
  let free = 0;
  for (const r of rows(db, box)) {
    if (r.enabled !== 1 || headroomReason(readUsage(r.id), limits, nowMs)) continue;
    free += Math.max(0, r.max_concurrent - (counts.get(r.id) ?? 0));
  }
  return free;
}

/** Capacity of the selected primary provider; Claude's own allocator remains separate. */
export function freeSlots(db: DatabaseSync, nowMs: number = Date.now()): number {
  const policy = modelPolicy(db);
  if (policy.provider !== "codex") return claudeFreeSlots(db, nowMs);
  if (!CODEX_EXECUTION_READY) return 0;
  try { nativeTransport(db); } catch { return 0; }
  const running = (db.prepare("SELECT COUNT(*) n FROM agent_runs WHERE provider='codex' AND state='running'").get() as { n: number }).n;
  return Math.max(0, policy.maxConcurrent - running);
}

export const JEV_PARALLEL_KEY = "jev_parallel";
export { JEV_PARALLEL_DEFAULT };
export const JEV_PARALLEL_MAX = 100;

/** Jev calls at once (Jev has no accounts, so no slots limit it). */
export function jevParallel(db: DatabaseSync): number {
  const v = Number((db.prepare("SELECT value FROM settings WHERE key = ?").get(JEV_PARALLEL_KEY) as { value: string } | undefined)?.value);
  return Number.isInteger(v) && v >= 1 && v <= JEV_PARALLEL_MAX ? v : JEV_PARALLEL_DEFAULT;
}

export function setJevParallel(db: DatabaseSync, n: unknown, by: string): number {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > JEV_PARALLEL_MAX) throw new AccountError(400, `Jev calls at once must be a whole number from 1 to ${JEV_PARALLEL_MAX}`);
  const was = jevParallel(db);
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(JEV_PARALLEL_KEY, String(n));
  if (n !== was) audit(db, by, "account-change", "jev", { jevParallel: n, was });
  return n;
}

/**
 * Why Claude-model stages are paused, or null: no account is enabled, or every
 * enabled account is out of headroom. A busy account is not a pause; calls wait for a slot.
 */
export function claudePauseReason(db: DatabaseSync, nowMs: number = Date.now()): string | null {
  if (modelPolicy(db).provider === "codex") {
    if (!CODEX_EXECUTION_READY) return CODEX_UNAVAILABLE;
    try { nativeTransport(db); return null; }
    catch { return "paused: the selected Codex provider requires its protected runtime and current native sign-in"; }
  }
  const box = boxAccounts(db);
  syncAccounts(db, box);
  const enabled = rows(db, box).filter((r) => r.enabled === 1);
  if (!enabled.length) return "paused: no Claude account is enabled";
  const reasons: string[] = [], limits = usagePause(db);
  for (const r of enabled) {
    const why = headroomReason(readUsage(r.id), limits, nowMs);
    if (!why) return null;
    reasons.push(`${r.label}: ${why}`);
  }
  return `paused: no Claude account has headroom (${reasons.join("; ")})`;
}

// ---- usage samples ---------------------------------------------------------------

export const SAMPLE_KEEP_MS = 30 * 86_400_000;

/** Records each account's current reading once (keyed by the reading's time). Returns how many were new. */
export function recordUsageSamples(db: DatabaseSync, nowMs: number = Date.now()): number {
  const ins = db.prepare("INSERT OR IGNORE INTO account_usage_samples (account_id, t, five_hour_pct, weekly_pct) VALUES (?, ?, ?, ?)");
  let n = 0;
  for (const a of boxAccounts(db)) {
    const r = readUsage(a.id);
    if (!r) continue;
    n += Number(ins.run(a.id, iso(r.writtenAt), r.fiveHour?.pct ?? null, r.weekly?.pct ?? null).changes);
  }
  db.prepare("DELETE FROM account_usage_samples WHERE t < ?").run(new Date(nowMs - SAMPLE_KEEP_MS).toISOString());
  return n;
}
