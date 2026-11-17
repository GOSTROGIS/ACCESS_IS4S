// Mention rows: which tracked items a Discord message refers to. A row holds the item (plain, for counting) and the
// message's guild, channel, id and time sealed with the key file. No text and no author id is kept; an author is
// kept only as a keyed hash that serves a deletion request.
import type { DatabaseSync } from "node:sqlite";
import type { DiscordKeys } from "./keys.ts";
import { DEFAULT_OWNER } from "../owners.ts";
import { parseRefs, type TrackedRepo } from "./refs.ts";

export type DiscordMessage = {
  id: string; channel_id: string; guild_id?: string; content?: string; timestamp?: string;
  author?: { id: string; bot?: boolean };
};

export const trackedRepos = (db: DatabaseSync): TrackedRepo[] =>
  db.prepare(`SELECT t.name AS name, COALESCE(r.owner, '${DEFAULT_OWNER}') AS owner FROM main.tracked_repos t LEFT JOIN main.repos r ON r.name = t.name`).all() as TrackedRepo[];

/** A channel is watched when the operators chose it, or it is a thread or forum post of a watched channel. */
export const isWatched = (db: DatabaseSync, channelId: string): boolean =>
  !!db.prepare(`SELECT 1 FROM discord_channels c WHERE c.channel_id = ? AND (c.watched = 1
    OR EXISTS (SELECT 1 FROM discord_channels p WHERE p.channel_id = c.parent_id AND p.watched = 1))`).get(channelId);

/** Sets a message's rows to exactly the items its text names. Returns the number of rows newly recorded (0 for a repeat), or -1 when the event carries no text. */
export function recordMessage(db: DatabaseSync, keys: DiscordKeys, m: DiscordMessage, guildId: string | undefined): number {
  if (m.content === undefined || !guildId) return -1;
  const msgHash = keys.hash("message", m.id);
  const refs = m.author?.bot ? [] : parseRefs(m.content, trackedRepos(db));
  const have = db.prepare("SELECT repo, number, sealed FROM discord_mentions WHERE msg_hash = ?").all(msgHash) as { repo: string; number: number; sealed: string }[];
  const want = new Set(refs.map((r) => `${r.repo}#${r.number}`));
  // An edit event may carry no author: keep the one sealed with the existing rows.
  const author = m.author?.id ? keys.hash("author", m.author.id) : have.map((h) => keys.open(h.sealed, msgHash)?.author).find((a) => a);
  const sealed = keys.seal({ guildId, channelId: m.channel_id, messageId: m.id, at: m.timestamp ?? new Date().toISOString(), ...(author && { author }) }, msgHash);
  const del = db.prepare("DELETE FROM discord_mentions WHERE msg_hash = ? AND repo = ? AND number = ?");
  const ins = db.prepare("INSERT OR IGNORE INTO discord_mentions (msg_hash, channel_hash, repo, number, sealed) VALUES (?, ?, ?, ?, ?)");
  let added = 0;
  db.exec("BEGIN");
  try {
    for (const h of have) if (!want.has(`${h.repo}#${h.number}`)) del.run(msgHash, h.repo, h.number);
    for (const r of refs) added += Number(ins.run(msgHash, keys.hash("channel", m.channel_id), r.repo, r.number, sealed).changes);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return added;
}

/** Mention rows only: our replies live in Discord and are deleted with it (src/discord/replies.ts). */
export function forgetMessages(db: DatabaseSync, keys: DiscordKeys, ids: string[]): number {
  const del = db.prepare("DELETE FROM discord_mentions WHERE msg_hash = ?");
  let n = 0;
  for (const id of ids) n += Number(del.run(keys.hash("message", id)).changes);
  return n;
}

/** For a channel that is gone (deleted, or its server removed the bot): its replies went with it, so only the rows are removed. */
export function forgetChannel(db: DatabaseSync, keys: DiscordKeys, channelId: string): number {
  const h = keys.hash("channel", channelId);
  db.prepare("DELETE FROM discord_replies WHERE channel_hash = ?").run(h);
  return Number(db.prepare("DELETE FROM discord_mentions WHERE channel_hash = ?").run(h).changes);
}

/** Opens every row to find the author's: slow, and rare enough (a deletion request) not to need a column that would name a person. */
export function forgetAuthor(db: DatabaseSync, keys: DiscordKeys, userId: string): number {
  const want = keys.hash("author", userId);
  const del = db.prepare("DELETE FROM discord_mentions WHERE msg_hash = ? AND repo = ? AND number = ?");
  let n = 0;
  for (const r of db.prepare("SELECT msg_hash, repo, number, sealed FROM discord_mentions").all() as { msg_hash: string; repo: string; number: number; sealed: string }[])
    if (keys.open(r.sealed, r.msg_hash)?.author === want) n += Number(del.run(r.msg_hash, r.repo, r.number).changes);
  return n;
}

/** Gateway events that change mention rows. Reads and edits happen in watched channels only; a delete always applies. Returns the message when this event newly recorded it against items, else null. */
export function handleDispatch(db: DatabaseSync, keys: DiscordKeys, type: string, d: unknown): { channelId: string; messageId: string } | null {
  const x = d as Record<string, unknown> & Partial<DiscordMessage> & { ids?: unknown; unavailable?: boolean };
  if (type === "MESSAGE_CREATE" || type === "MESSAGE_UPDATE") {
    if (typeof x.id !== "string" || typeof x.channel_id !== "string" || !isWatched(db, x.channel_id)) return null;
    const added = recordMessage(db, keys, x as DiscordMessage, typeof x.guild_id === "string" ? x.guild_id : channelGuild(db, x.channel_id));
    return added > 0 ? { channelId: x.channel_id, messageId: x.id } : null;
  } else if (type === "MESSAGE_DELETE") {
    if (typeof x.id === "string") forgetMessages(db, keys, [x.id]);
  } else if (type === "MESSAGE_DELETE_BULK") {
    if (Array.isArray(x.ids)) forgetMessages(db, keys, x.ids.filter((i): i is string => typeof i === "string"));
  } else if ((type === "CHANNEL_DELETE" || type === "THREAD_DELETE") && typeof x.id === "string") {
    forgetChannel(db, keys, x.id);
    for (const c of db.prepare("SELECT channel_id FROM discord_channels WHERE parent_id = ?").all(x.id) as { channel_id: string }[]) forgetChannel(db, keys, c.channel_id);
  } else if (type === "GUILD_DELETE" && typeof x.id === "string" && !x.unavailable) {
    for (const c of db.prepare("SELECT channel_id FROM discord_channels WHERE guild_id = ?").all(x.id) as { channel_id: string }[]) forgetChannel(db, keys, c.channel_id);
  }
  return null;
}

const channelGuild = (db: DatabaseSync, channelId: string): string | undefined =>
  (db.prepare("SELECT guild_id FROM discord_channels WHERE channel_id = ?").get(channelId) as { guild_id: string } | undefined)?.guild_id;

export type DiscordLink = { url: string; at: string };

/** Message links of an item, newest first. Empty when the key is missing or a row does not open. */
export function linksOf(db: DatabaseSync, keys: DiscordKeys | null, repo: string, number: number): DiscordLink[] {
  if (!keys) return [];
  const rows = db.prepare("SELECT msg_hash, sealed FROM discord_mentions WHERE repo = ? AND number = ?").all(repo, number) as { msg_hash: string; sealed: string }[];
  return rows.flatMap((r) => {
    const v = keys.open(r.sealed, r.msg_hash);
    return v ? [{ url: `https://discord.com/channels/${v.guildId}/${v.channelId}/${v.messageId}`, at: v.at }] : [];
  }).sort((a, b) => b.at.localeCompare(a.at));
}

export const countOf = (db: DatabaseSync, repo: string, number: number): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM discord_mentions WHERE repo = ? AND number = ?").get(repo, number) as { n: number }).n;

/** What the bot reports about a guild and its channels, for the admin page. The watched flag is kept across updates. */
export function upsertChannel(db: DatabaseSync, c: { channelId: string; guildId: string; guildName: string | null; name: string | null; parentId?: string | null; position?: number | null; categoryId?: string | null }): void {
  db.prepare(`INSERT INTO discord_channels (channel_id, guild_id, guild_name, name, parent_id, position, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET guild_id = excluded.guild_id, guild_name = COALESCE(excluded.guild_name, guild_name), name = COALESCE(excluded.name, name), parent_id = excluded.parent_id,
      position = excluded.position, category_id = excluded.category_id`)
    .run(c.channelId, c.guildId, c.guildName, c.name, c.parentId ?? null, c.position ?? null, c.categoryId ?? null);
}

export function upsertCategory(db: DatabaseSync, c: { categoryId: string; guildId: string; name: string | null; position: number | null }): void {
  db.prepare(`INSERT INTO discord_categories (category_id, guild_id, name, position) VALUES (?, ?, ?, ?)
    ON CONFLICT(category_id) DO UPDATE SET guild_id = excluded.guild_id, name = excluded.name, position = excluded.position`).run(c.categoryId, c.guildId, c.name, c.position);
}

export function setStatus(db: DatabaseSync, state: string, detail: string | null): void {
  db.prepare(`INSERT INTO discord_status (id, state, detail, at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET state = excluded.state, detail = excluded.detail, at = excluded.at`).run(state, detail, new Date().toISOString());
}
