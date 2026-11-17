// Discord mentions: the admin page's data and writes, and what the item page shows. The channel list and the
// connection state are written by the runner's gateway client (src/discord/); this file only reads them.
import type { DatabaseSync } from "node:sqlite";
import type { DiscordAccount, DiscordLinkCode, DiscordInfo, DiscordSetup } from "../../../web/src/api/types.ts";
import { envVar } from "../../env.ts";
import { audit } from "../audit.ts";
import { isPublicRepo, publicRepoNames } from "../../public/status.ts";
import { HttpError } from "../server/util.ts";
import { DISCORD_PRIVACY_PATH } from "../server/discord-privacy.ts";
import { readKeyFile, type DiscordKeys } from "../../discord/keys.ts";
import { countOf, linksOf } from "../../discord/store.ts";
import { reactOn } from "../../discord/react.ts";
import { signalCountOf, signalLinks } from "../../discord/signals.ts";
import { createLinkCode, linkedSince, listLinks, unlinkLogin, unlinkRow } from "../../discord/links.ts";
import type { Req } from "../types.ts";

const PRIVACY_PATH = DISCORD_PRIVACY_PATH;

let cached: { file: string; keys: DiscordKeys } | null = null;
/** The key file's keys, when this process has AUTOCRAFT_DISCORD_KEY_FILE and the file is sound; message links need them. */
export function discordKeys(): DiscordKeys | null {
  const file = envVar("DISCORD_KEY_FILE");
  if (!file) return null;
  if (cached?.file === file) return cached.keys;
  try {
    cached = { file, keys: readKeyFile(file) };
    return cached.keys;
  } catch {
    // Not cached: a file that is fixed later works at the next request. The page shows counts without links meanwhile.
    return null;
  }
}

export const contactOf = (db: DatabaseSync): string =>
  (db.prepare("SELECT value FROM settings WHERE key = 'discord_contact'").get() as { value: string } | undefined)?.value ?? "";

/** Count for everyone who sees the item; message links only with the key. */
export function discordOf(db: DatabaseSync, repo: string, n: number): DiscordInfo {
  const keys = discordKeys();
  return { count: countOf(db, repo, n), links: linksOf(db, keys, repo, n), signals: signalCountOf(db, repo, n), signalLinks: signalLinks(db, keys, repo, n) };
}

const operator = (req: Req): void => {
  if (req.user.role !== "operator") throw new HttpError(403, "only operators use the Discord settings");
};
const body = (req: Req): Record<string, unknown> => (req.json && typeof req.json === "object" ? (req.json as Record<string, unknown>) : {});

function setupOf(db: DatabaseSync): DiscordSetup {
  const st = db.prepare("SELECT state, detail, at FROM discord_status WHERE id = 1").get() as { state: DiscordSetup["state"]; detail: string | null; at: string } | undefined;
  const channels = db.prepare(`SELECT c.channel_id AS channelId, c.guild_id AS guildId, c.guild_name AS guildName, c.name, c.watched, c.default_repo AS defaultRepo, k.name AS category
    FROM discord_channels c LEFT JOIN discord_categories k ON k.category_id = c.category_id AND k.guild_id = c.guild_id
    WHERE c.parent_id IS NULL
    ORDER BY c.guild_name, c.guild_id, k.category_id IS NOT NULL, k.position IS NULL, k.position, k.category_id, c.position IS NULL, c.position, c.channel_id`).all() as
    { channelId: string; guildId: string; guildName: string | null; name: string | null; watched: number; defaultRepo: string | null; category: string | null }[];
  return {
    state: st?.state ?? "off", detail: st?.detail ?? null, at: st?.at ?? null,
    channels: channels.map((c) => ({ ...c, watched: !!c.watched })),
    repos: publicRepoNames(db),
    contact: contactOf(db), reactOn: reactOn(db), privacyPath: PRIVACY_PATH, links: listLinks(db),
  };
}

export function setup(db: DatabaseSync, req: Req): DiscordSetup {
  operator(req);
  return setupOf(db);
}

export function putChannel(db: DatabaseSync, req: Req): DiscordSetup {
  operator(req);
  const id = body(req).channelId, watched = body(req).watched;
  if (typeof id !== "string" || typeof watched !== "boolean") throw new HttpError(400, "channelId and watched are required");
  const r = db.prepare("UPDATE discord_channels SET watched = ? WHERE channel_id = ?").run(watched ? 1 : 0, id);
  if (!r.changes) throw new HttpError(404, "the bot has not reported that channel");
  audit(db, req.user.login, watched ? "discord-watch" : "discord-unwatch", id);
  return setupOf(db);
}

export function putChannelRepo(db: DatabaseSync, req: Req): DiscordSetup {
  operator(req);
  const id = body(req).channelId, repo = body(req).repo;
  if (typeof id !== "string" || (repo !== null && typeof repo !== "string")) throw new HttpError(400, "channelId and repo (a tracked repo or null) are required");
  if (repo !== null && !isPublicRepo(db, repo)) throw new HttpError(400, "repo is not a public tracked repo");
  const r = db.prepare("UPDATE discord_channels SET default_repo = ? WHERE channel_id = ?").run(repo, id);
  if (!r.changes) throw new HttpError(404, "the bot has not reported that channel");
  audit(db, req.user.login, "discord-default-repo", id, { repo });
  return setupOf(db);
}

export function putContact(db: DatabaseSync, req: Req): DiscordSetup {
  operator(req);
  const c = body(req).contact;
  if (typeof c !== "string" || c.length > 300) throw new HttpError(400, "contact must be text of at most 300 characters");
  db.prepare("INSERT INTO settings (key, value) VALUES ('discord_contact', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(c.trim());
  audit(db, req.user.login, "discord-contact", null);
  return setupOf(db);
}

export function putReact(db: DatabaseSync, req: Req): DiscordSetup {
  operator(req);
  const on = body(req).on;
  if (typeof on !== "boolean") throw new HttpError(400, "on must be true or false");
  db.prepare("INSERT INTO settings (key, value) VALUES ('discord_react', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(on ? "on" : "off");
  audit(db, req.user.login, on ? "discord-react-on" : "discord-react-off", null);
  return setupOf(db);
}

/** Whether the signed-in user has a Discord account linked, and whether this server can make link codes (it has the key file). */
export const account = (db: DatabaseSync, req: Req): DiscordAccount => {
  const at = linkedSince(db, req.user.login);
  return { linked: at !== null, at, configured: discordKeys() !== null };
};

/** A single-use code, valid for 10 minutes, that links a Discord account to the signed-in login when typed into the bot's `/autocraft link`. */
export function linkCode(db: DatabaseSync, req: Req): DiscordLinkCode {
  const keys = discordKeys();
  if (!keys) throw new HttpError(503, "Discord is not set up on this server");
  const c = createLinkCode(db, keys, req.user.login);
  audit(db, req.user.login, "discord-link-code", req.user.login);
  return c;
}

export function unlinkOwn(db: DatabaseSync, req: Req): DiscordAccount {
  const n = unlinkLogin(db, req.user.login);
  if (n) audit(db, req.user.login, "discord-unlink", req.user.login, { links: n });
  return account(db, req);
}

export function removeLink(db: DatabaseSync, req: Req): DiscordSetup {
  operator(req);
  const id = body(req).id;
  if (typeof id !== "string") throw new HttpError(400, "id is required");
  const login = unlinkRow(db, id);
  if (login === null) throw new HttpError(404, "no such link");
  audit(db, req.user.login, "discord-unlink", login, { by: "operator" });
  return setupOf(db);
}
