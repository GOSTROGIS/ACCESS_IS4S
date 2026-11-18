import type { DatabaseSync } from "node:sqlite";
import { checkGithubId, getAccess } from "../../access.ts";
import { audit } from "../audit.ts";
import { githubIdentity } from "../../github/identity.ts";
import { NATIVE_ORIGINS, type Config, type NativeOwner } from "./config.ts";
import { randomToken, sha256hex, TokenBox } from "./crypto.ts";
import { NativeGitHubProvider, type Provider, type Tokens } from "./provider.ts";
import { createSession, openTokens, sealTokens } from "./sessions.ts";

export const NATIVE_TTL_MS = 60_000;
export function nativeOwner(config: Config): NativeOwner | null {
  const owner = config.secrets.nativeOwner;
  if (!owner) return null;
  const expectedPort = owner.product === "access" ? 8993 : owner.product === "slipcurve" ? 8994 : 0;
  if (config.devAuth || config.trustProxy || config.host !== "127.0.0.1" || config.port !== expectedPort ||
      config.baseUrl !== NATIVE_ORIGINS[owner.product]) throw new Error("Native sign-in is not enabled for this product origin.");
  return owner;
}

export const nativeSessionCookie = (config: Config): string | null => {
  const owner = nativeOwner(config);
  return owner ? `__Host-${owner.product}_autocraft_session` : null;
};
export const nativeStateCookie = (config: Config): string | null => {
  const owner = nativeOwner(config);
  return owner ? `__Host-${owner.product}_autocraft_oauth` : null;
};

export function initializeNativeSignIn(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS native_signin_handoffs (
    code_hash TEXT PRIMARY KEY, product TEXT NOT NULL, login TEXT NOT NULL, github_id INTEGER NOT NULL,
    token_enc TEXT NOT NULL, expires_at INTEGER NOT NULL
  )`);
}
const aad = (product: string, hash: string): string => `native-signin:${product}:${hash}`;

/** Called only by the OS-authenticated CLI, never by an HTTP route. */
export async function issueNativeHandoff(config: Config, db: DatabaseSync, access: string,
  identity: Pick<Provider, "identity"> = new NativeGitHubProvider(), now = Date.now()): Promise<{ url: string; expiresAt: string }> {
  const owner = nativeOwner(config);
  if (!owner || githubIdentity(db) !== "box") throw new Error("Native sign-in is unavailable.");
  if (typeof access !== "string" || !/^[\x21-\x7e]{20,4096}$/.test(access)) throw new Error("Native identity verification failed.");
  const who = await identity.identity(access);
  if (!who || who.login.toLowerCase() !== owner.login.toLowerCase() || who.id !== owner.githubId ||
      !getAccess(db, owner.login) || checkGithubId(db, owner.login, who.id) === "mismatch") throw new Error("Native identity verification failed.");
  initializeNativeSignIn(db);
  db.prepare("DELETE FROM native_signin_handoffs WHERE expires_at <= ?").run(now);
  const code = randomToken(32), hash = sha256hex(code), expires = now + NATIVE_TTL_MS;
  const tokens: Tokens = { access, expiresAt: null, refresh: null, refreshExpiresAt: null };
  const box = new TokenBox(config.secrets.sessionKey);
  db.prepare("INSERT INTO native_signin_handoffs(code_hash,product,login,github_id,token_enc,expires_at) VALUES (?,?,?,?,?,?)")
    .run(hash, owner.product, owner.login, who.id, sealTokens(box, tokens, aad(owner.product, hash)), expires);
  return { url: `${config.baseUrl}/auth/native#${code}`, expiresAt: new Date(expires).toISOString() };
}

/** Atomic one-use consumption and the same production session creation as OAuth. */
export function consumeNativeHandoff(config: Config, db: DatabaseSync, code: string, userAgent?: string, now = Date.now()): string | null {
  const owner = nativeOwner(config);
  if (!owner || githubIdentity(db) !== "box" || !/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  initializeNativeSignIn(db);
  const hash = sha256hex(code);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM native_signin_handoffs WHERE expires_at <= ?").run(now);
    const row = db.prepare("DELETE FROM native_signin_handoffs WHERE code_hash = ? RETURNING product,login,github_id,token_enc,expires_at")
      .get(hash) as { product: string; login: string; github_id: number; token_enc: string; expires_at: number } | undefined;
    let session: string | null = null;
    if (row && row.product === owner.product && row.login.toLowerCase() === owner.login.toLowerCase() &&
        row.github_id === owner.githubId && row.expires_at > now && row.expires_at <= now + NATIVE_TTL_MS) {
      const access = getAccess(db, owner.login);
      const pinned = db.prepare("SELECT github_id FROM access WHERE login = ?").get(owner.login) as { github_id: number | null } | undefined;
      const tokens = openTokens(new TokenBox(config.secrets.sessionKey), row.token_enc, aad(owner.product, hash));
      if (access && pinned?.github_id === owner.githubId && tokens && /^[\x21-\x7e]{20,4096}$/.test(tokens.access)) {
        session = createSession(db, new TokenBox(config.secrets.sessionKey), access.login, tokens, userAgent);
        db.prepare("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .run(`native_cli_session.${owner.product}`, sha256hex(session));
        audit(db, access.login, "sign-in", access.login, { via: "native", product: owner.product });
      }
    }
    db.exec("COMMIT");
    return session;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function nativeHandoffPage(nonce: string, product: NativeOwner["product"]): string {
  const name = product === "access" ? "ACCESS Automation" : product === "slipcurve" ? "Slipcurve Automation" : null;
  if (!name) throw new Error("Unknown native product.");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${name} sign-in</title><body><p id="status">Completing ${name} sign-in…</p><script nonce="${nonce}">
  const code=location.hash.slice(1);history.replaceState(null,'','/auth/native');
  if(!/^[A-Za-z0-9_-]{43}$/.test(code)){document.getElementById('status').textContent='Use the installed ${name} sign-in launcher.';}
  else{fetch('/auth/native/finish',{method:'POST',mode:'cors',credentials:'same-origin',redirect:'error',referrerPolicy:'no-referrer',headers:{accept:'application/json'},body:new URLSearchParams({code})}).then(async response=>{if(!response.ok||(await response.json()).ok!==true)throw Error();location.replace('/')}).catch(()=>{document.getElementById('status').textContent='${name} sign-in expired or was refused. Use its installed launcher again.';});}
  </script></body></html>`;
}
