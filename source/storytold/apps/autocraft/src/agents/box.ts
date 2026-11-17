// What this machine offers, read from files named by environment variables so
// that paths stay outside the repository and never reach the API, the logs or
// the UI:
//   AUTOCRAFT_ACCOUNTS       JSON file: [{ "id": "b", "configDir": "/path" }]
//   AUTOCRAFT_ACCOUNTS_ROOT  directory holding one config directory per account an operator added (<root>/<id>)
//   AUTOCRAFT_USAGE_DIR      directory with one <id>.json usage reading per account (default <root>/.usage)
//   AUTOCRAFT_CLAUDE_BIN     the claude command (default: claude on the PATH)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { envVar } from "../env.ts";

export const ACCOUNT_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export type BoxAccount = { id: string; configDir: string };

export const claudeBin = (): string => envVar("CLAUDE_BIN") || "claude";

export const configRoot = (): string | null => envVar("ACCOUNTS_ROOT") || null;

/** Where operator-added accounts keep their Claude config; null without a root. */
export const managedDir = (id: string): string | null => (configRoot() && ACCOUNT_ID.test(id) ? join(configRoot()!, id) : null);

export function usageDir(): string | null {
  return envVar("USAGE_DIR") || (configRoot() ? join(configRoot()!, ".usage") : null);
}

/**
 * Accounts of the box config file, in file order, then (with a config root and
 * a db) the accounts operators added. An unreadable or malformed file yields none.
 */
export function boxAccounts(db?: DatabaseSync): BoxAccount[] {
  const out = fileAccounts();
  if (db && configRoot()) {
    const seen = new Set(out.map((a) => a.id));
    for (const r of db.prepare("SELECT id FROM claude_accounts ORDER BY rowid").all() as { id: string }[]) {
      const dir = managedDir(r.id);
      if (dir && !seen.has(r.id)) out.push({ id: r.id, configDir: dir });
    }
  }
  return out;
}

function fileAccounts(): BoxAccount[] {
  const file = envVar("ACCOUNTS");
  if (!file) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: BoxAccount[] = [];
    for (const a of raw as { id?: unknown; configDir?: unknown }[]) {
      if (typeof a?.id !== "string" || !ACCOUNT_ID.test(a.id) || typeof a.configDir !== "string" || !a.configDir || seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({ id: a.id, configDir: a.configDir });
    }
    return out;
  } catch {
    return [];
  }
}

export type Reading = {
  writtenAt: number;                       // unix seconds
  fiveHour: { pct: number; resetsAt: number | null } | null;
  weekly: { pct: number; resetsAt: number | null } | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function window(w: unknown): { pct: number; resetsAt: number | null } | null {
  const o = w as { used_percentage?: unknown; resets_at?: unknown } | null | undefined;
  const pct = num(o?.used_percentage);
  return pct === null ? null : { pct, resetsAt: num(o?.resets_at) };
}

/** The latest usage reading of one account: only `<id>.json` in the usage directory is read. */
export function readUsage(id: string): Reading | null {
  const dir = usageDir();
  if (!dir || !ACCOUNT_ID.test(id)) return null;
  try {
    const j = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")) as { written_at?: unknown; rate_limits?: { five_hour?: unknown; seven_day?: unknown } };
    const writtenAt = num(j.written_at);
    if (writtenAt === null) return null;
    return { writtenAt, fiveHour: window(j.rate_limits?.five_hour), weekly: window(j.rate_limits?.seven_day) };
  } catch {
    return null;
  }
}

export const iso = (unixSeconds: number): string => new Date(unixSeconds * 1000).toISOString();
