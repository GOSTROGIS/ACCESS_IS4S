// The user-token vault: a usable GitHub App access token for a login, for the dashboard and the runner process alike
// (both open the same database and derive the same TokenBox from the secrets file's session_key).
//
// Refresh protocol. GitHub refresh tokens are single use, and the token set lives in several copies: the login's
// user_tokens row and each session from the same sign-in. Any process may refresh:
//  1. read the row and its `version`; a fresh access token is returned as is;
//  2. otherwise call the refresh endpoint with the row's refresh token;
//  3. store the new pair only if `version` is unchanged (compare-and-swap), then copy it into every other stored
//     copy of the old refresh token (sessions keep running, see shareRefresh);
//  4. a refresh the endpoint rejects may mean another process used the token first: reread a few times, and only
//     when the row stays unchanged mark it `refresh-failed`, also by compare-and-swap.
// There is never a fallback to another identity: a final failure answers "needs sign-in".
import type { DatabaseSync } from "node:sqlite";
import { envVar } from "../env.ts";
import { TokenBox } from "../dash/server/crypto.ts";
import { resealLegacyValues } from "../dash/server/reseal.ts";
import { readSecrets } from "../dash/server/config.ts";
import { GitHubProvider, RevokeRefused, type Provider, type Tokens } from "../dash/server/provider.ts";
import { failUserTokens, readUserTokens, revocationAad, shareRefresh, swapUserTokens } from "../dash/server/user-tokens.ts";

export type NeedsSignIn = { ok: false; needsSignIn: true; why: "no-token" | "refresh-failed" | "expired" };
/** A transient failure (GitHub unreachable): try again later, the token set is untouched. */
export type Unavailable = { ok: false; needsSignIn: false };
export type UserTokenResult = { ok: true; access: string } | NeedsSignIn | Unavailable;

const EXPIRY_MARGIN = 60_000;
const REREADS = 4;
const MAX_REVOKE_ATTEMPTS = 5;

export class Vault {
  #db: DatabaseSync;
  #box: TokenBox;
  #providerOf: () => Provider;
  get #provider(): Provider { return this.#providerOf(); }
  #sweeping = false;
  #inflight = new Map<string, Promise<UserTokenResult>>();
  /** Pause between rereads after a rejected refresh; tests set it to 0. */
  waitMs = 300;

  /** `provider` may be a function, read at each use, so the GitHub App's registration can change while the vault lives. */
  constructor(db: DatabaseSync, box: TokenBox, provider: Provider | (() => Provider)) {
    this.#db = db;
    this.#box = box;
    this.#providerOf = typeof provider === "function" ? provider : () => provider;
  }

  /** A usable access token for `login`, refreshed when it is within a minute of expiry or `rejected` (a token GitHub answered 401 to). */
  userToken(login: string, rejected?: string): Promise<UserTokenResult> {
    const key = login.toLowerCase();
    let p = this.#inflight.get(key);
    if (!p) {
      p = this.#obtain(login, rejected).finally(() => this.#inflight.delete(key));
      this.#inflight.set(key, p);
    }
    return p;
  }

  async #obtain(login: string, rejected: string | undefined): Promise<UserTokenResult> {
    for (let attempt = 0; attempt < REREADS; attempt++) {
      const row = readUserTokens(this.#db, this.#box, login);
      if (!row?.tokens) return { ok: false, needsSignIn: true, why: "no-token" };
      if (row.status !== "ok") return { ok: false, needsSignIn: true, why: "refresh-failed" };
      const t = row.tokens;
      if (t.access !== rejected && (t.expiresAt === null || t.expiresAt - EXPIRY_MARGIN > Date.now())) return { ok: true, access: t.access };
      if (!t.refresh || (t.refreshExpiresAt !== null && t.refreshExpiresAt <= Date.now())) {
        failUserTokens(this.#db, login, row.version);
        return { ok: false, needsSignIn: true, why: "expired" };
      }
      let next: Tokens | null;
      try {
        next = await this.#provider.refresh(t.refresh);
      } catch (e) {
        console.error(`user token refresh: ${(e as Error).message}`);
        return { ok: false, needsSignIn: false };
      }
      if (next) {
        if (swapUserTokens(this.#db, this.#box, login, row.version, next)) {
          shareRefresh(this.#db, this.#box, login, t.refresh, next);
          return { ok: true, access: next.access };
        }
        // Another writer stored a pair first; its pair is the one to use.
        continue;
      }
      // Rejected: either the refresh token is dead, or another process just used it and is about to store the new pair.
      if (this.waitMs) await new Promise((r) => setTimeout(r, this.waitMs));
      const again = readUserTokens(this.#db, this.#box, login);
      if (again && again.version !== row.version) continue;
      if (attempt < REREADS - 1 && this.waitMs) continue;
      if (failUserTokens(this.#db, login, row.version)) return { ok: false, needsSignIn: true, why: "refresh-failed" };
    }
    return { ok: false, needsSignIn: true, why: "refresh-failed" };
  }

  /**
   * Works through the revocation queue (a removed login's whole grant, or one revoked session's token). A row stays
   * until GitHub confirms the revoke. An expired stored access token, or a 404/422 answer, is retried once with a
   * freshly refreshed token. After MAX_REVOKE_ATTEMPTS failed sweeps the row is dropped. `fresh` handles only rows
   * not tried yet. Returns the number of rows handled.
   */
  async sweepRevocations(fresh = false): Promise<number> {
    if (this.#sweeping) return 0;
    this.#sweeping = true;
    try {
      const rows = this.#db.prepare(`SELECT id, login, token_enc, kind, aad, attempts FROM user_token_revocations ${fresh ? "WHERE attempts = 0 " : ""}ORDER BY id`)
        .all() as { id: number; login: string; token_enc: string; kind: string; aad: string | null; attempts: number }[];
      for (const r of rows) {
        // Claim the attempt first: a concurrent sweep (another process) that read the same row changes nothing here and skips it.
        if (this.#db.prepare("UPDATE user_token_revocations SET attempts = attempts + 1 WHERE id = ? AND attempts = ?").run(r.id, r.attempts).changes !== 1) continue;
        let done = false;
        try {
          done = await this.#revokeRow(r);
        } catch (e) {
          console.error(`revocation for ${r.login}: ${(e as Error).message}`);
        }
        if (done) {
          this.#db.prepare("DELETE FROM user_token_revocations WHERE id = ?").run(r.id);
        } else if (r.attempts + 1 >= MAX_REVOKE_ATTEMPTS) {
          console.error(`revocation for ${r.login}: given up after ${r.attempts + 1} failed attempts`);
          this.#db.prepare("DELETE FROM user_token_revocations WHERE id = ?").run(r.id);
        }
      }
      return rows.length;
    } finally {
      this.#sweeping = false;
    }
  }

  /** True once GitHub confirmed the revoke (or there is nothing left to revoke: an unreadable row). */
  async #revokeRow(r: { login: string; token_enc: string; kind: string; aad: string | null }): Promise<boolean> {
    const plain = this.#box.open(r.token_enc, r.aad ?? revocationAad(r.login));
    let t: Tokens | null = null;
    try {
      t = plain ? (JSON.parse(plain) as Tokens) : null;
    } catch { /* unreadable */ }
    if (!t) return true;
    const revoke = (access: string): Promise<void> => (r.kind === "token" ? this.#provider.revoke(access) : this.#provider.revokeGrant(access));
    // The login's user_tokens row written by the same sign-in holds this very token set and dies with it.
    const own = r.kind === "token" ? readUserTokens(this.#db, this.#box, r.login) : null;
    const sameSignIn = !!own?.tokens && (own.tokens.access === t.access || (!!t.refresh && own.tokens.refresh === t.refresh));
    const refreshed = async (): Promise<string | null> => {
      if (!t.refresh || (t.refreshExpiresAt !== null && t.refreshExpiresAt <= Date.now())) return null;
      return (await this.#provider.refresh(t.refresh))?.access ?? null;
    };
    let ok = false;
    const expired = t.expiresAt !== null && t.expiresAt - EXPIRY_MARGIN <= Date.now();
    if (!expired) {
      try {
        await revoke(t.access);
        ok = true;
      } catch (e) {
        if (!(e instanceof RevokeRefused) || (e.status !== 404 && e.status !== 422)) throw e;
      }
    }
    if (!ok) {
      const access = await refreshed();
      if (!access) return false;
      await revoke(access);
    }
    if (sameSignIn) this.#db.prepare("DELETE FROM user_tokens WHERE login = ?").run(r.login);
    return true;
  }
}

/** The runner's vault: the app's client credentials and the session key from the secrets file, as the dashboard reads them. Null without the GitHub App secrets. */
export function openVault(db: DatabaseSync, env: NodeJS.ProcessEnv = process.env): Vault | null {
  const secrets = readSecrets(envVar("SECRETS_FILE", env));
  if (!secrets.app) return null;
  const box = new TokenBox(secrets.sessionKey);
  // The runner may start before the dashboard has re-sealed values under the current key.
  resealLegacyValues(db, box);
  return new Vault(db, box, new GitHubProvider(secrets.app.clientId, secrets.app.clientSecret));
}
