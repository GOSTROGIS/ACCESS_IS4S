// Whether Jev can be used right now. When it cannot, Haiku does Jev's work (classify, priority, duplicates).
//
// - Switched off (settings.jev_enabled = 'no'): stays off until an operator turns it on.
// - Not installed (the `jev` command cannot start): checked on every pass, cheap, until the command exists.
// - The account fails (out of credit, missing or rejected key): tried again on the first pass an hour after the last failure.
//
// The state is one settings row, settings.jev_unavailable, shown on the Accounts page.
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";

export const JEV_ENABLED_KEY = "jev_enabled";
export const JEV_UNAVAILABLE_KEY = "jev_unavailable";
/** How long after the last account failure the next pass tries Jev again. */
export const JEV_RETRY_MS = 60 * 60_000;

export type JevOutage = { kind: "off" | "missing" | "account"; reason: string; since: string; at: string };

const get = (db: DatabaseSync, key: string): string | undefined => (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;
const put = (db: DatabaseSync, key: string, value: string): void => void db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);

export const jevEnabled = (db: DatabaseSync): boolean => get(db, JEV_ENABLED_KEY) !== "no";

export function jevOutage(db: DatabaseSync): JevOutage | null {
  try {
    const o = JSON.parse(get(db, JEV_UNAVAILABLE_KEY) ?? "null") as JevOutage | null;
    return o && typeof o.since === "string" && typeof o.reason === "string" ? o : null;
  } catch { return null; }
}

const clear = (db: DatabaseSync): void => void db.prepare("DELETE FROM settings WHERE key = ?").run(JEV_UNAVAILABLE_KEY);

/** True when an executable `jev` is on PATH. */
export function jevInstalled(): boolean {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    try { accessSync(join(dir, "jev"), constants.X_OK); return true; } catch { /* next directory */ }
  }
  return false;
}

// Search path, home, locale, temp and cache directories, TLS and proxy settings, and Jev's own (TYPESAFE_*, JEV_*) and its launcher's (UV_*) variables.
const JEV_ENV_KEYS = new Set(["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy"]);
const JEV_ENV_PREFIXES = ["TYPESAFE_", "JEV_", "UV_"];

/** The whole environment of a `jev` child: the variables it needs to start and reach its API. The runner's GitHub and Claude tokens are not among them. */
export function jevEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && (JEV_ENV_KEYS.has(k) || JEV_ENV_PREFIXES.some((p) => k.startsWith(p)))) out[k] = v;
  return out;
}

/** Turns Jev on or off; turning it on also forgets an earlier failure so the next pass tries it. */
export function setJevEnabled(db: DatabaseSync, on: boolean, by: string): void {
  const was = jevEnabled(db);
  put(db, JEV_ENABLED_KEY, on ? "yes" : "no");
  if (on) clear(db);
  else put(db, JEV_UNAVAILABLE_KEY, JSON.stringify({ kind: "off", reason: "switched off", since: new Date().toISOString(), at: new Date().toISOString() } satisfies JevOutage));
  if (on !== was) audit(db, by, "account-change", "jev", { jevEnabled: on, was });
}

/** Whether a pass may call Jev now. Also keeps the stored state in step with the switch and the installed command. */
export function jevAvailable(db: DatabaseSync, nowMs: number = Date.now()): boolean {
  if (!jevEnabled(db)) {
    if (jevOutage(db)?.kind !== "off") put(db, JEV_UNAVAILABLE_KEY, JSON.stringify({ kind: "off", reason: "switched off", since: new Date(nowMs).toISOString(), at: new Date(nowMs).toISOString() } satisfies JevOutage));
    return false;
  }
  const o = jevOutage(db);
  if (!o) return true;
  if (o.kind === "missing") {
    if (!jevInstalled()) return false;
    clear(db);
    return true;
  }
  if (o.kind === "account") return nowMs - Date.parse(o.at) >= JEV_RETRY_MS;
  clear(db);
  return true;
}

/** Records a failure; `since` stays at the first failure of an outage. */
export function markJevUnavailable(db: DatabaseSync, kind: "missing" | "account", reason: string, nowMs: number = Date.now()): void {
  const prev = jevOutage(db);
  const at = new Date(nowMs).toISOString();
  put(db, JEV_UNAVAILABLE_KEY, JSON.stringify({ kind, reason, since: prev?.kind === kind ? prev.since : at, at } satisfies JevOutage));
}

/** A call that started at `startedMs` went through: an earlier outage is over. An outage recorded after the call started (by a parallel call) stays. */
export function markJevWorking(db: DatabaseSync, startedMs: number): void {
  const o = jevOutage(db);
  if (o && o.kind !== "off" && Date.parse(o.at) < startedMs) clear(db);
}

/**
 * Whether a finished `jev` process failed because Jev is unavailable (as opposed to a timeout, a server error or a bad answer,
 * which are retried): the command is missing, or the API refused the account.
 * The CLI prints `jev: API error status=<N> request_id=...: <message>` or `jev: <message>` on stderr.
 */
export function jevFailure(r: { code: number | null; stderr: string }): { kind: "missing" | "account"; reason: string } | null {
  if (r.code === -1 && /ENOENT/.test(r.stderr)) return { kind: "missing", reason: "not installed" };
  // The jev script exits 127 when the interpreter it starts through is missing.
  if (r.code === 127 && /no such file or directory|not found/i.test(r.stderr)) return { kind: "missing", reason: "not installed" };
  if (r.code === 0 || r.code === null || r.code === -1) return null;
  const line = r.stderr.split("\n").find((l) => l.startsWith("jev: ")) ?? "";
  const status = /API error status=(\d+)/.exec(line)?.[1];
  // With a status, the status decides: a 429 "quota" or a 503 "insufficient capacity" is not an account problem.
  if (status !== undefined) return status === "402" ? { kind: "account", reason: "out of credit" } : status === "401" || status === "403" ? { kind: "account", reason: "key rejected" } : null;
  if (/credit|balance|billing|payment|insufficient|quota/i.test(line)) return { kind: "account", reason: "out of credit" };
  if (/api key/i.test(line)) return { kind: "account", reason: "key rejected" };
  return null;
}
