// A Discord reporter's GitHub sign-in: the GitHub App user token that lets the bot file an issue as that person. Keyed by
// the Discord user's keyed hash, sealed like user_tokens (src/dash/server/user-tokens.ts) with an AAD that names this
// table and the reporter, so a row cannot be moved into user_tokens or another reporter. A reporter is not a dashboard
// user: there is no session and no access. Only the runner refreshes these tokens, so no cross-process compare-and-swap
// beyond the row's version is needed.
import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { TokenBox } from "../dash/server/crypto.ts";
import type { Provider, Tokens } from "../dash/server/provider.ts";

const aad = (reporter: string): string => `reporter_tokens:${reporter}`;
const hashOf = (state: string): string => createHash("sha256").update(state).digest("hex");
const EXPIRY_MARGIN = 60_000;
export const STATE_TTL_MS = 10 * 60_000;

/** Stores the sign-in. A token the reporter had before is queued for revocation (a new sign-in replaces it). */
export function saveReporter(db: DatabaseSync, box: TokenBox, reporter: string, githubId: number, login: string, tokens: Tokens, now = Date.now()): void {
  const old = db.prepare("SELECT login, token_enc FROM reporter_tokens WHERE reporter = ?").get(reporter) as { login: string; token_enc: string } | undefined;
  if (old) queueRevoke(db, reporter, old.login, old.token_enc, now);
  db.prepare(`INSERT INTO reporter_tokens (reporter, github_id, login, token_enc, version, updated_at, status) VALUES (?, ?, ?, ?, 1, ?, 'ok')
              ON CONFLICT (reporter) DO UPDATE SET github_id = excluded.github_id, login = excluded.login, token_enc = excluded.token_enc,
                version = reporter_tokens.version + 1, updated_at = excluded.updated_at, status = 'ok'`)
    .run(reporter, githubId, login, box.seal(JSON.stringify(tokens), aad(reporter)), new Date(now).toISOString());
}

function queueRevoke(db: DatabaseSync, reporter: string, login: string, tokenEnc: string, now: number): void {
  db.prepare("INSERT INTO user_token_revocations (login, token_enc, queued_at, kind, aad) VALUES (?, ?, ?, 'token', ?)").run(login, tokenEnc, new Date(now).toISOString(), aad(reporter));
}

type Row = { login: string; token_enc: string; version: number; status: string };

export function readReporter(db: DatabaseSync, box: TokenBox, reporter: string): { login: string; tokens: Tokens | null; version: number; status: string } | null {
  const row = db.prepare("SELECT login, token_enc, version, status FROM reporter_tokens WHERE reporter = ?").get(reporter) as Row | undefined;
  if (!row) return null;
  const plain = box.open(row.token_enc, aad(reporter));
  let tokens: Tokens | null = null;
  try { tokens = plain ? (JSON.parse(plain) as Tokens) : null; } catch { /* unreadable: treated as no token */ }
  return { login: row.login, tokens, version: Number(row.version), status: row.status };
}

/** Marks the row as needing a new sign-in, if it still has `version`. */
export function failReporter(db: DatabaseSync, reporter: string, version: number, now = Date.now()): boolean {
  return Number(db.prepare("UPDATE reporter_tokens SET status = 'refresh-failed', version = version + 1, updated_at = ? WHERE reporter = ? AND version = ? AND status = 'ok'")
    .run(new Date(now).toISOString(), reporter, version).changes) > 0;
}

export type ReporterToken = { ok: true; access: string; login: string; version: number } | { ok: false; signIn: true } | { ok: false; signIn: false };

const inflight = new Map<string, Promise<ReporterToken>>();

/** A usable access token for the reporter, refreshed when it is within a minute of expiry or `rejected` (a token GitHub answered 401 to). `signIn: false` is a transient failure. */
export function reporterToken(db: DatabaseSync, box: TokenBox, provider: Provider, reporter: string, now = Date.now(), rejected?: string): Promise<ReporterToken> {
  let p = inflight.get(reporter);
  if (!p) {
    p = obtain(db, box, provider, reporter, now, rejected).finally(() => inflight.delete(reporter));
    inflight.set(reporter, p);
  }
  return p;
}

async function obtain(db: DatabaseSync, box: TokenBox, provider: Provider, reporter: string, now: number, rejected: string | undefined): Promise<ReporterToken> {
  const row = readReporter(db, box, reporter);
  if (!row?.tokens || row.status !== "ok") return { ok: false, signIn: true };
  const t = row.tokens;
  if (t.access !== rejected && (t.expiresAt === null || t.expiresAt - EXPIRY_MARGIN > now)) return { ok: true, access: t.access, login: row.login, version: row.version };
  if (!t.refresh || (t.refreshExpiresAt !== null && t.refreshExpiresAt <= now)) {
    failReporter(db, reporter, row.version, now);
    return { ok: false, signIn: true };
  }
  let next: Tokens | null;
  try {
    next = await provider.refresh(t.refresh);
  } catch {
    return { ok: false, signIn: false };
  }
  if (!next) {
    failReporter(db, reporter, row.version, now);
    return { ok: false, signIn: true };
  }
  const swapped = Number(db.prepare("UPDATE reporter_tokens SET token_enc = ?, version = version + 1, updated_at = ?, status = 'ok' WHERE reporter = ? AND version = ? AND status = 'ok'")
    .run(box.seal(JSON.stringify(next), aad(reporter)), new Date(now).toISOString(), reporter, row.version).changes) > 0;
  // A sign-in wrote the row while the refresh ran: its token is the one to use.
  if (!swapped) return obtain(db, box, provider, reporter, now, undefined);
  return { ok: true, access: next.access, login: row.login, version: row.version + 1 };
}

/** A new single-use sign-in state for the reporter; only its hash is stored. `verifier` is the PKCE verifier the callback needs. */
export function newReporterState(db: DatabaseSync, reporter: string, now = Date.now()): string {
  db.prepare("DELETE FROM reporter_states WHERE expires_at < ?").run(new Date(now).toISOString());
  const state = randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO reporter_states (state_hash, reporter, expires_at, verifier) VALUES (?, ?, ?, ?)")
    .run(hashOf(state), reporter, new Date(now + STATE_TTL_MS).toISOString(), randomBytes(48).toString("base64url"));
  return state;
}

/** The state's reporter and verifier without using it up (the start route), or null when unknown or expired. */
export function peekReporterState(db: DatabaseSync, state: string, now = Date.now()): { reporter: string; verifier: string } | null {
  const r = db.prepare("SELECT reporter, verifier, expires_at FROM reporter_states WHERE state_hash = ?").get(hashOf(state)) as { reporter: string; verifier: string; expires_at: string } | undefined;
  return r && Date.parse(r.expires_at) >= now ? { reporter: r.reporter, verifier: r.verifier } : null;
}

/** Uses the state up (the callback). */
export function takeReporterState(db: DatabaseSync, state: string, now = Date.now()): { reporter: string; verifier: string } | null {
  const r = db.prepare("DELETE FROM reporter_states WHERE state_hash = ? RETURNING reporter, verifier, expires_at").get(hashOf(state)) as { reporter: string; verifier: string; expires_at: string } | undefined;
  return r && Date.parse(r.expires_at) >= now ? { reporter: r.reporter, verifier: r.verifier } : null;
}

/** Removes the reporter's sign-in and filing records and queues the token's revoke. Returns whether one existed. */
export function forgetReporterRow(db: DatabaseSync, reporter: string, now = Date.now()): boolean {
  db.prepare("DELETE FROM reporter_states WHERE reporter = ?").run(reporter);
  db.prepare("DELETE FROM discord_filed WHERE reporter = ?").run(reporter);
  const row = db.prepare("DELETE FROM reporter_tokens WHERE reporter = ? RETURNING login, token_enc").get(reporter) as { login: string; token_enc: string } | undefined;
  if (!row) return false;
  queueRevoke(db, reporter, row.login, row.token_enc, now);
  return true;
}
