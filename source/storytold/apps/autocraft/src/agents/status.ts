// What the claude command tells about an account without a model call:
// `claude auth status` (signed in, method, plan), the login's end date from the
// credentials file (only that one number is read), and plan usage from the
// local /usage command. Nothing here returns or logs a token, email or path.
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { claudeBin, usageDir, ACCOUNT_ID } from "./box.ts";

export type AuthStatus = { loggedIn: boolean; method: string | null; plan: string | null; expiresAt: string | null };

const STATUS_MS = 15_000;
const USAGE_MS = 60_000;

/** The whole environment of every claude child: only what the CLI needs (search path, home, locale), the account's config directory, no nested-session marker, no update checks, and `extra`. Nothing else of the server's environment reaches it. */
export function childEnv(configDir: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of ["PATH", "HOME", "LANG", "LC_ALL"]) { const v = process.env[k]; if (v !== undefined) env[k] = v; }
  return { ...env, CLAUDE_CONFIG_DIR: configDir, DISABLE_AUTOUPDATER: "1", ...extra };
}

function run(args: string[], configDir: string, timeout: number, cwd?: string): Promise<string> {
  return new Promise((resolve) => {
    // A signed-out account may exit non-zero and still print its JSON.
    execFile(claudeBin(), args, { timeout, env: childEnv(configDir), cwd, maxBuffer: 8 << 20 }, (_e, stdout) => resolve(String(stdout ?? "")));
  });
}

const text = (v: unknown, n: number): string | null => (typeof v === "string" && v ? v.slice(0, n) : null);

/** The end date of the login, from the credentials file's refresh-token expiry; null when unreadable. */
export function loginExpiry(configDir: string): string | null {
  try {
    const v = (JSON.parse(readFileSync(join(configDir, ".credentials.json"), "utf8")) as { claudeAiOauth?: { refreshTokenExpiresAt?: unknown } })?.claudeAiOauth?.refreshTokenExpiresAt;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? new Date(v).toISOString() : null;
  } catch {
    return null;
  }
}

export function parseAuthStatus(out: string, configDir: string): AuthStatus | null {
  try {
    const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as Record<string, unknown>;
    const loggedIn = j.loggedIn === true;
    return { loggedIn, method: text(j.authMethod, 40), plan: text(j.subscriptionType, 40), expiresAt: loggedIn ? loginExpiry(configDir) : null };
  } catch {
    return null;
  }
}

export async function readAuthStatus(configDir: string): Promise<AuthStatus | null> {
  return parseAuthStatus(await run(["auth", "status"], configDir, STATUS_MS), configDir);
}

/** Stores the account's current sign-in state. A failed read leaves the old state. */
export async function refreshStatus(db: DatabaseSync, id: string, configDir: string): Promise<AuthStatus | null> {
  const st = await readAuthStatus(configDir);
  if (!st) return null;
  db.prepare(`INSERT INTO claude_account_status (account_id, logged_in, method, plan, login_expires_at, checked_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (account_id) DO UPDATE SET logged_in = excluded.logged_in, method = excluded.method, plan = excluded.plan, login_expires_at = excluded.login_expires_at, checked_at = excluded.checked_at`)
    .run(id, st.loggedIn ? 1 : 0, st.method, st.plan, st.expiresAt, new Date().toISOString());
  return st;
}

// ---- usage ---------------------------------------------------------------------

const unix = (iso: unknown): number | null => {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.round(t / 1000) : null;
};

/**
 * The reading file's content from the JSON that `claude -p /usage` prints: a list
 * of messages, one of them holding usage_report.rate_limits.limits. A limit
 * whose window has not started (no reset time) is left out. Null without a report.
 */
export function parseUsage(out: string, nowSec: number): { written_at: number; rate_limits: Record<string, { used_percentage: number; resets_at: number }> } | null {
  let j: unknown;
  try {
    j = JSON.parse(out);
  } catch {
    return null;
  }
  const msgs = Array.isArray(j) ? j : [j];
  type Limit = { kind?: unknown; percent?: unknown; resets_at?: unknown };
  const limits = (msgs.find((m) => (m as { usage_report?: unknown } | null)?.usage_report) as { usage_report?: { rate_limits?: { limits?: Limit[] } } } | undefined)?.usage_report?.rate_limits?.limits;
  if (!Array.isArray(limits)) return null;
  const rate_limits: Record<string, { used_percentage: number; resets_at: number }> = {};
  for (const [kind, key] of [["session", "five_hour"], ["weekly_all", "seven_day"]] as const) {
    const l = limits.find((x) => x?.kind === kind && x.resets_at != null);
    const resets = unix(l?.resets_at);
    if (l && typeof l.percent === "number" && Number.isFinite(l.percent) && resets !== null) rate_limits[key] = { used_percentage: l.percent, resets_at: resets };
  }
  return { written_at: nowSec, rate_limits };
}

/** Reads one account's usage with the local /usage command (no model call, no tokens) and saves it for readUsage. */
export async function refreshUsage(id: string, configDir: string, nowMs: number = Date.now()): Promise<boolean> {
  const dir = usageDir();
  if (!dir || !ACCOUNT_ID.test(id)) return false;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // --verbose: the plain JSON result holds only a text summary; the message list carries usage_report.
  const out = await run(["-p", "/usage", "--output-format", "json", "--verbose", "--no-session-persistence", "--strict-mcp-config", "--settings", '{"disableAllHooks":true}'], configDir, USAGE_MS, dir);
  const reading = parseUsage(out, Math.floor(nowMs / 1000));
  if (!reading) return false;
  const tmp = join(dir, `.${id}.tmp`);
  writeFileSync(tmp, JSON.stringify(reading), { mode: 0o600 });
  renameSync(tmp, join(dir, `${id}.json`));
  return true;
}
