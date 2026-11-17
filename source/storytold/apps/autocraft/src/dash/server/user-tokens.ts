// user_tokens: the GitHub App user token of each login, written at every
// sign-in while the GitHub identity is the app. It holds the sealed JSON of
// the whole token set, like sessions.token_enc, but is keyed by login so the
// act stage can act for a login without a live session. The vault
// (src/github/vault.ts) refreshes it.
import type { DatabaseSync } from "node:sqlite";
import type { TokenBox } from "./crypto.ts";
import type { Tokens } from "./provider.ts";

const aad = (login: string): string => `user_tokens:${login.toLowerCase()}`;

export function saveUserTokens(db: DatabaseSync, box: TokenBox, login: string, githubId: number, tokens: Tokens): void {
  db.prepare(`INSERT INTO user_tokens (login, github_id, token_enc, version, updated_at, status) VALUES (?, ?, ?, 1, ?, 'ok')
              ON CONFLICT (login) DO UPDATE SET github_id = excluded.github_id, token_enc = excluded.token_enc,
                version = user_tokens.version + 1, updated_at = excluded.updated_at, status = 'ok'`)
    .run(login, githubId, box.seal(JSON.stringify(tokens), aad(login)), new Date().toISOString());
}

export function loadUserTokens(db: DatabaseSync, box: TokenBox, login: string): Tokens | null {
  const row = db.prepare("SELECT token_enc FROM user_tokens WHERE login = ? AND status = 'ok'").get(login) as { token_enc: string } | undefined;
  const plain = row ? box.open(row.token_enc, aad(login)) : null;
  try {
    return plain ? (JSON.parse(plain) as Tokens) : null;
  } catch {
    return null;
  }
}

type Row = { token_enc: string; version: number; status: string };

/** The login's row with its opened tokens, whatever its status (null tokens: unreadable). */
export function readUserTokens(db: DatabaseSync, box: TokenBox, login: string): { tokens: Tokens | null; version: number; status: string } | null {
  const row = db.prepare("SELECT token_enc, version, status FROM user_tokens WHERE login = ?").get(login) as Row | undefined;
  if (!row) return null;
  const plain = box.open(row.token_enc, aad(login));
  let tokens: Tokens | null = null;
  try {
    tokens = plain ? (JSON.parse(plain) as Tokens) : null;
  } catch { /* unreadable: the caller treats it as no token */ }
  return { tokens, version: Number(row.version), status: row.status };
}

/**
 * Stores a refreshed pair if the row still has `version` (compare-and-swap: a refresh in another process or a new
 * sign-in may have written first). Returns false when it lost.
 */
export function swapUserTokens(db: DatabaseSync, box: TokenBox, login: string, version: number, tokens: Tokens): boolean {
  return Number(db.prepare("UPDATE user_tokens SET token_enc = ?, version = version + 1, updated_at = ?, status = 'ok' WHERE login = ? AND version = ? AND status = 'ok'")
    .run(box.seal(JSON.stringify(tokens), aad(login)), new Date().toISOString(), login, version).changes) > 0;
}

/** Marks the row as needing a new sign-in, if it still has `version`. Returns false when it lost. */
export function failUserTokens(db: DatabaseSync, login: string, version: number): boolean {
  return Number(db.prepare("UPDATE user_tokens SET status = 'refresh-failed', version = version + 1, updated_at = ? WHERE login = ? AND version = ? AND status = 'ok'")
    .run(new Date().toISOString(), login, version).changes) > 0;
}

/**
 * Deletes the login's row because its access was removed (a removed login, a role change) and queues its whole GitHub
 * authorization for revocation; the dashboard's vault does that later. Returns whether a row existed.
 * Not for ending one session: that is dropSessionTokens.
 */
export function dropUserTokens(db: DatabaseSync, login: string): boolean {
  const row = db.prepare("DELETE FROM user_tokens WHERE login = ? RETURNING token_enc").get(login) as { token_enc: string } | undefined;
  if (!row) return false;
  db.prepare("INSERT INTO user_token_revocations (login, token_enc, queued_at, kind) VALUES (?, ?, ?, 'grant')").run(login, row.token_enc, new Date().toISOString());
  return true;
}

/**
 * Ends one session's GitHub App token: queues that token alone for revocation, so the login's other sign-ins keep their
 * tokens and the authorization stays. The vault's sweep also deletes the login's user_tokens row once the revoke
 * succeeds, but only when the row holds that same token set (it was written by the same sign-in).
 */
export function dropSessionTokens(db: DatabaseSync, login: string, idHash: string, tokenEnc: string | null): boolean {
  if (!tokenEnc) return false;
  db.prepare("INSERT INTO user_token_revocations (login, token_enc, queued_at, kind, aad) VALUES (?, ?, ?, 'token', ?)").run(login, tokenEnc, new Date().toISOString(), idHash);
  return true;
}

export const revocationAad = aad;

/**
 * A refresh consumed `oldRefresh` (GitHub refresh tokens are single use), so every stored copy of that token set must
 * take the new pair: the login's user_tokens row and each of its sessions that holds the same refresh token. Copies
 * with another refresh token come from another sign-in and are left alone. The sessions keep running.
 */
export function shareRefresh(db: DatabaseSync, box: TokenBox, login: string, oldRefresh: string, next: Tokens): void {
  const u = readUserTokens(db, box, login);
  if (u?.status === "ok" && u.tokens?.refresh === oldRefresh) swapUserTokens(db, box, login, u.version, next);
  const sessions = db.prepare("SELECT id_hash, token_enc FROM sessions WHERE login = ? AND token_enc IS NOT NULL").all(login) as { id_hash: string; token_enc: string }[];
  for (const s of sessions) {
    const plain = box.open(s.token_enc, s.id_hash);
    let t: Tokens | null = null;
    try {
      t = plain ? (JSON.parse(plain) as Tokens) : null;
    } catch { /* unreadable: leave it */ }
    if (t?.refresh === oldRefresh) db.prepare("UPDATE sessions SET token_enc = ? WHERE id_hash = ? AND token_enc = ?").run(box.seal(JSON.stringify(next), s.id_hash), s.id_hash, s.token_enc);
  }
}
