// Operator actions on Claude accounts: add, sign in, sign out, refresh. Every
// action is audited; none puts a code, token, email or directory into the audit
// row, a log line or a response.
import { execFile } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { ClaudeAccount } from "../../web/src/api/types.ts";
import { audit } from "../dash/audit.ts";
import { AccountError, listAccounts, syncAccounts, validLabel } from "./accounts.ts";
import { ACCOUNT_ID, boxAccounts, claudeBin, configRoot, managedDir } from "./box.ts";
import { cancelLogin, loginInfo, loginRunning, startLogin, submitCode, LOGIN_CODE } from "./login.ts";
import { checkToken, deleteToken, recordTokenRemoved, recordTokenSet, writeToken } from "./token.ts";
import { childEnv, refreshStatus, refreshUsage } from "./status.ts";

function dirOf(db: DatabaseSync, id: unknown): { id: string; configDir: string } {
  const a = typeof id === "string" ? boxAccounts(db).find((b) => b.id === id) : undefined;
  if (!a) throw new AccountError(404, "no such account");
  return a;
}

const view = (db: DatabaseSync, id: string): ClaudeAccount => listAccounts(db).find((a) => a.id === id)!;

/** Adds a disabled account with a new, empty config directory (mode 0700) under the config root. */
export function addAccount(db: DatabaseSync, input: unknown, by: string): ClaudeAccount {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountError(400, "the body must be a JSON object");
  const label = validLabel((input as { label?: unknown }).label);
  if (!configRoot()) throw new AccountError(400, "no config root is set for new accounts (AUTOCRAFT_ACCOUNTS_ROOT)");
  const taken = new Set((db.prepare("SELECT id FROM claude_accounts").all() as { id: string }[]).map((r) => r.id));
  for (const a of boxAccounts(db)) taken.add(a.id);
  let n = 1;
  while (taken.has(`a${n}`)) n++;
  const id = `a${n}`;
  const dir = managedDir(id)!;
  mkdirSync(configRoot()!, { recursive: true, mode: 0o700 });
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  db.prepare("INSERT INTO claude_accounts (id, label, enabled, updated_by, updated_at) VALUES (?, ?, 0, ?, ?)").run(id, label, by, new Date().toISOString());
  syncAccounts(db);
  audit(db, by, "account-add", `account:${id}`, { label });
  return view(db, id);
}

/** Starts a sign-in and returns once its URL is ready (or it failed). */
export async function beginLogin(db: DatabaseSync, id: unknown, by: string): Promise<ClaudeAccount> {
  const a = dirOf(db, id);
  if (loginInfo(a.id)?.kind === "token" && loginRunning(a.id)) throw new AccountError(409, "a token request is running for this account");
  if (!loginRunning(a.id)) audit(db, by, "account-login-start", `account:${a.id}`);
  await startLogin(a.id, a.configDir, () => void refreshStatus(db, a.id, a.configDir).catch(() => {}));
  return view(db, a.id);
}

export function sendCode(db: DatabaseSync, id: unknown, input: unknown, by: string): ClaudeAccount {
  const a = dirOf(db, id);
  if (loginRunning(a.id) && loginInfo(a.id)?.kind === "token") throw new AccountError(409, "no sign-in is waiting for a code");
  const code = (input as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !LOGIN_CODE.test(code.trim())) throw new AccountError(400, "the code has letters, digits and # _ . ~ + / = - only");
  if (!submitCode(a.id, code.trim())) throw new AccountError(409, "no sign-in is waiting for a code");
  audit(db, by, "account-login-code", `account:${a.id}`);
  return view(db, a.id);
}

export function stopLogin(db: DatabaseSync, id: unknown, by: string): ClaudeAccount {
  const a = dirOf(db, id);
  if (cancelLogin(a.id)) audit(db, by, "account-login-cancel", `account:${a.id}`);
  return view(db, a.id);
}

/** Starts a request for a long-lived token (`claude setup-token`) and returns once its URL is ready (or it failed). */
export async function beginToken(db: DatabaseSync, id: unknown, by: string): Promise<ClaudeAccount> {
  const a = dirOf(db, id);
  if (loginRunning(a.id) && loginInfo(a.id)?.kind !== "token") throw new AccountError(409, "a sign-in is running for this account");
  if (!loginRunning(a.id)) audit(db, by, "account-token-start", `account:${a.id}`);
  await startLogin(a.id, a.configDir, undefined, "token", async (token, signal) => {
    if (!(await checkToken(a.configDir, token, signal))) {
      if (signal.aborted) return false;
      audit(db, by, "account-token-check-failed", `account:${a.id}`);
      return false;
    }
    if (signal.aborted) return false;
    writeToken(a.configDir, token);
    try {
      recordTokenSet(db, a.id);
    } catch (e) {
      deleteToken(a.configDir);
      throw e;
    }
    audit(db, by, "account-token-set", `account:${a.id}`);
    return true;
  });
  return view(db, a.id);
}

export function sendTokenCode(db: DatabaseSync, id: unknown, input: unknown, by: string): ClaudeAccount {
  const a = dirOf(db, id);
  if (!loginRunning(a.id) || loginInfo(a.id)?.kind !== "token") throw new AccountError(409, "no token request is waiting for a code");
  const code = (input as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !LOGIN_CODE.test(code.trim())) throw new AccountError(400, "the code has letters, digits and # _ . ~ + / = - only");
  if (!submitCode(a.id, code.trim())) throw new AccountError(409, "no token request is waiting for a code");
  audit(db, by, "account-token-code", `account:${a.id}`);
  return view(db, a.id);
}

export function stopToken(db: DatabaseSync, id: unknown, by: string): ClaudeAccount {
  const a = dirOf(db, id);
  if (loginInfo(a.id)?.kind === "token" && cancelLogin(a.id)) audit(db, by, "account-token-cancel", `account:${a.id}`);
  return view(db, a.id);
}

/** Deletes the account's long-lived token; calls use the regular sign-in again. */
export function removeToken(db: DatabaseSync, id: unknown, by: string): ClaudeAccount {
  const a = dirOf(db, id);
  deleteToken(a.configDir);
  recordTokenRemoved(db, a.id);
  audit(db, by, "account-token-remove", `account:${a.id}`);
  return view(db, a.id);
}

export async function signOut(db: DatabaseSync, id: unknown, by: string): Promise<ClaudeAccount> {
  const a = dirOf(db, id);
  cancelLogin(a.id);
  await new Promise<void>((resolve) => {
    execFile(claudeBin(), ["auth", "logout"], { timeout: 30_000, env: childEnv(a.configDir) }, () => resolve());
  });
  deleteToken(a.configDir);
  recordTokenRemoved(db, a.id);
  audit(db, by, "account-sign-out", `account:${a.id}`);
  await refreshStatus(db, a.id, a.configDir);
  return view(db, a.id);
}

/** Reads sign-in state and, for a signed-in account, plan usage now. */
export async function refreshNow(db: DatabaseSync, id: unknown, by: string): Promise<ClaudeAccount> {
  const a = dirOf(db, id);
  const st = await refreshStatus(db, a.id, a.configDir);
  if (st?.loggedIn) await refreshUsage(a.id, a.configDir);
  audit(db, by, "account-refresh", `account:${a.id}`);
  return view(db, a.id);
}

/** Runner tick: status for every account every `statusMs`, usage for every enabled signed-in one every `usageMs`. */
export class AccountWatcher {
  private statusAt = new Map<string, number>();
  private usageAt = new Map<string, number>();
  private usageFailed = new Set<string>();
  private busy = false;
  private db: DatabaseSync;
  private log: (m: string) => void;
  private statusMs: number;
  private usageMs: number;
  private usageRetryMs: number;
  /** Usage costs no tokens, so it is read every minute; after a failed reading the next try waits usageRetryMs. */
  constructor(db: DatabaseSync, log: (m: string) => void, statusMs = 15 * 60_000, usageMs = 60_000, usageRetryMs = 5 * 60_000) {
    this.db = db;
    this.log = log;
    this.statusMs = statusMs;
    this.usageMs = usageMs;
    this.usageRetryMs = usageRetryMs;
  }

  async tick(nowMs: number = Date.now()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      syncAccounts(this.db);
      const enabled = new Set((this.db.prepare("SELECT id FROM claude_accounts WHERE enabled = 1").all() as { id: string }[]).map((r) => r.id));
      for (const a of boxAccounts(this.db)) {
        if (!ACCOUNT_ID.test(a.id) || loginRunning(a.id)) continue;
        let loggedIn = (this.db.prepare("SELECT logged_in FROM claude_account_status WHERE account_id = ?").get(a.id) as { logged_in: number } | undefined)?.logged_in === 1;
        if (nowMs - (this.statusAt.get(a.id) ?? 0) >= this.statusMs) {
          this.statusAt.set(a.id, nowMs);
          loggedIn = (await refreshStatus(this.db, a.id, a.configDir))?.loggedIn ?? loggedIn;
        }
        const every = this.usageFailed.has(a.id) ? this.usageRetryMs : this.usageMs;
        if (enabled.has(a.id) && loggedIn && nowMs - (this.usageAt.get(a.id) ?? 0) >= every) {
          this.usageAt.set(a.id, nowMs);
          if (await refreshUsage(a.id, a.configDir, nowMs)) this.usageFailed.delete(a.id);
          else {
            if (!this.usageFailed.has(a.id)) this.log(`usage refresh failed for account ${a.id}; retrying every ${this.usageRetryMs / 60_000} min`);
            this.usageFailed.add(a.id);
          }
        }
      }
    } catch (e) {
      this.log(`account refresh: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}
