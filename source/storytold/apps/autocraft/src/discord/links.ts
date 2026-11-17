// Links between a Discord account and a dashboard login. The Discord user id is never stored: a link holds its keyed hash.
// A signed-in dashboard user asks for a short single-use code and types it into the bot in Discord (`/autocraft link`), so
// the link is always made by the person who controls both accounts. Codes are stored as keyed hashes and expire.
import { randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { DiscordKeys } from "./keys.ts";

export const CODE_TTL_MS = 10 * 60_000;
const CODE_LENGTH = 8;
/** No 0/O, 1/I/L: a code is read off one screen and typed into another. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const userHash = (keys: DiscordKeys, discordUserId: string): string => keys.hash("author", discordUserId);
const codeHash = (keys: DiscordKeys, code: string): string => keys.sign("link-code", code.toUpperCase().replace(/[^A-Z0-9]/g, ""));

/** A new code for `login`; an earlier unused code of the login stops working. */
export function createLinkCode(db: DatabaseSync, keys: DiscordKeys, login: string, now = Date.now()): { code: string; expiresAt: string } {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const expiresAt = new Date(now + CODE_TTL_MS).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM discord_link_codes WHERE login = ? OR expires_at <= ?").run(login, new Date(now).toISOString());
    db.prepare("INSERT INTO discord_link_codes (code_hash, login, expires_at) VALUES (?, ?, ?)").run(codeHash(keys, code), login, expiresAt);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { code, expiresAt };
}

/** Spends a code and links `discordUserId` to the login the code was made for. Returns the login, or null for a wrong, used or expired code. A Discord account has one login, so an earlier link of it is replaced. */
export function redeemLinkCode(db: DatabaseSync, keys: DiscordKeys, code: string, discordUserId: string, now = Date.now()): string | null {
  const h = codeHash(keys, code);
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT login, expires_at AS expiresAt FROM discord_link_codes WHERE code_hash = ?").get(h) as { login: string; expiresAt: string } | undefined;
    if (!row) {
      db.exec("ROLLBACK");
      return null;
    }
    db.prepare("DELETE FROM discord_link_codes WHERE code_hash = ?").run(h);
    if (Date.parse(row.expiresAt) <= now) {
      db.exec("COMMIT");
      return null;
    }
    db.prepare(`INSERT INTO discord_links (user_hash, login, linked_at) VALUES (?, ?, ?)
      ON CONFLICT(user_hash) DO UPDATE SET login = excluded.login, linked_at = excluded.linked_at`).run(userHash(keys, discordUserId), row.login, new Date(now).toISOString());
    db.exec("COMMIT");
    return row.login;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** The dashboard login linked to a Discord user, or null. */
export const loginOf = (db: DatabaseSync, keys: DiscordKeys, discordUserId: string): string | null =>
  (db.prepare("SELECT login FROM discord_links WHERE user_hash = ?").get(userHash(keys, discordUserId)) as { login: string } | undefined)?.login ?? null;

/** Removes every link of a login; returns how many. */
export const unlinkLogin = (db: DatabaseSync, login: string): number =>
  Number(db.prepare("DELETE FROM discord_links WHERE login = ?").run(login).changes);

/** Removes one link by its row id (the keyed hash); returns the login it belonged to, or null. */
export function unlinkRow(db: DatabaseSync, id: string): string | null {
  const row = db.prepare("SELECT login FROM discord_links WHERE user_hash = ?").get(id) as { login: string } | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM discord_links WHERE user_hash = ?").run(id);
  return row.login;
}

/** Part of a deletion request by Discord user id. */
export const forgetLink = (db: DatabaseSync, keys: DiscordKeys, discordUserId: string): number =>
  Number(db.prepare("DELETE FROM discord_links WHERE user_hash = ?").run(userHash(keys, discordUserId)).changes);

export type LinkRow = { id: string; login: string; linkedAt: string };
export const listLinks = (db: DatabaseSync): LinkRow[] =>
  db.prepare("SELECT user_hash AS id, login, linked_at AS linkedAt FROM discord_links ORDER BY login, linked_at").all() as LinkRow[];

export const linkedSince = (db: DatabaseSync, login: string): string | null =>
  (db.prepare("SELECT MIN(linked_at) AS at FROM discord_links WHERE login = ?").get(login) as { at: string | null }).at;
