// Personal tokens for the Inbox MCP server. A signed-in user makes one on the
// Connect page and gives it to their own agent; the agent calls POST /mcp with
// it as a bearer token and acts as that user. Only the token's hash is stored,
// and a token counts only while its login is on the access list: the role is
// read from the list on every call, so a role change applies at once.
import type { DatabaseSync } from "node:sqlite";
import type { Role } from "../types.ts";
import { randomToken, sha256hex } from "../server/crypto.ts";
import { HttpError } from "../server/util.ts";

const DAY = 86_400_000;
export const MCP_TOKEN_TTL = 90 * DAY;
/** A token that may answer decisions lasts as long as an operator's dashboard session at most (OPERATOR_SESSION_MAX). */
export const MCP_ANSWER_TOKEN_TTL = 7 * DAY;
export const MCP_TOKENS_PER_LOGIN = 5;
export const MCP_TOKEN_PREFIX = "acmcp_";
const LABEL_MAX = 60;
const TOUCH_EVERY = 60_000;

export type McpTokenRow = { id: number; label: string | null; canAnswer: boolean; createdAt: string; lastUsedAt: string | null; expiresAt: string };
/** `canAnswer`: the token was made to answer; the answer tools also need `role` to be operator at the time of the call. */
export type McpCaller = { tokenId: number; login: string; role: Role; canAnswer: boolean };

type Raw = { id: number; label: string | null; can_answer: number; created_at: string; last_used_at: string | null; expires_at: string };
const COLS = "id, label, can_answer, created_at, last_used_at, expires_at";
const toRow = (r: Raw): McpTokenRow =>
  ({ id: Number(r.id), label: r.label, canAnswer: r.can_answer === 1, createdAt: r.created_at, lastUsedAt: r.last_used_at, expiresAt: r.expires_at });

/** The login's live tokens, newest first. */
export function listTokens(db: DatabaseSync, login: string): McpTokenRow[] {
  return (db.prepare(`SELECT ${COLS} FROM mcp_tokens WHERE login = ? AND expires_at > ? ORDER BY created_at DESC, id DESC`)
    .all(login, new Date().toISOString()) as Raw[]).map(toRow);
}

/** A new token for `login`; the plain value is returned once and never stored. The caller checks who may make an answering token. */
export function createToken(db: DatabaseSync, login: string, rawLabel: unknown, canAnswer = false): { token: string; row: McpTokenRow } {
  if (rawLabel !== undefined && rawLabel !== null && typeof rawLabel !== "string") throw new HttpError(400, "label must be a string");
  const label = (rawLabel ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, LABEL_MAX) || null;
  if (listTokens(db, login).length >= MCP_TOKENS_PER_LOGIN) throw new HttpError(409, `you have ${MCP_TOKENS_PER_LOGIN} tokens; revoke one first`);
  const token = `${MCP_TOKEN_PREFIX}${randomToken(32)}`;
  const now = new Date();
  const ttl = canAnswer ? MCP_ANSWER_TOKEN_TTL : MCP_TOKEN_TTL;
  const r = db.prepare(`INSERT INTO mcp_tokens (login, token_hash, label, can_answer, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING ${COLS}`)
    .get(login, sha256hex(token), label, canAnswer ? 1 : 0, now.toISOString(), new Date(now.getTime() + ttl).toISOString()) as Raw;
  return { token, row: toRow(r) };
}

/** Revokes one of the login's own tokens; false when it has no such token. */
export function revokeToken(db: DatabaseSync, login: string, id: number): boolean {
  return db.prepare("DELETE FROM mcp_tokens WHERE id = ? AND login = ?").run(id, login).changes === 1;
}

/** Ends every token of a login (it left the access list). */
export function endTokens(db: DatabaseSync, login: string): number {
  return Number(db.prepare("DELETE FROM mcp_tokens WHERE login = ?").run(login).changes);
}

/** Ends a login's answering tokens (it stopped being an operator); its read and feedback tokens stay. */
export function endAnswerTokens(db: DatabaseSync, login: string): number {
  return Number(db.prepare("DELETE FROM mcp_tokens WHERE login = ? AND can_answer = 1").run(login).changes);
}

/** Every login's live tokens, for operators on the Access page. */
export function listAllTokens(db: DatabaseSync): (McpTokenRow & { login: string })[] {
  return (db.prepare(`SELECT login, ${COLS} FROM mcp_tokens WHERE expires_at > ? ORDER BY login COLLATE NOCASE, created_at DESC, id DESC`)
    .all(new Date().toISOString()) as (Raw & { login: string })[]).map((r) => ({ ...toRow(r), login: r.login }));
}

/** Revokes any login's token by id (an operator's action); the token's login, or null when there is none. */
export function revokeAnyToken(db: DatabaseSync, id: number): string | null {
  const r = db.prepare("DELETE FROM mcp_tokens WHERE id = ? RETURNING login").get(id) as { login: string } | undefined;
  return r?.login ?? null;
}

/** The caller a bearer token stands for, or null when it is unknown, expired or its login is off the access list. */
export function loadToken(db: DatabaseSync, token: string | undefined): McpCaller | null {
  if (!token || token.length > 200 || !token.startsWith(MCP_TOKEN_PREFIX)) return null;
  const now = new Date();
  const row = db.prepare(`SELECT t.id, t.login, t.last_used_at, t.can_answer, a.role FROM mcp_tokens t JOIN access a ON a.login = t.login
    WHERE t.token_hash = ? AND t.expires_at > ?`).get(sha256hex(token), now.toISOString()) as
    { id: number; login: string; last_used_at: string | null; can_answer: number; role: Role } | undefined;
  if (!row) return null;
  if (!row.last_used_at || now.getTime() - Date.parse(row.last_used_at) > TOUCH_EVERY) db.prepare("UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?").run(now.toISOString(), row.id);
  return { tokenId: Number(row.id), login: row.login, role: row.role, canAnswer: row.can_answer === 1 };
}

export function pruneTokens(db: DatabaseSync): void {
  db.prepare("DELETE FROM mcp_tokens WHERE expires_at <= ?").run(new Date().toISOString());
}
