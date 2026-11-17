// Optional Discord mention counting, ping replies and issue search. It runs only when AUTOCRAFT_DISCORD_TOKEN_FILE and AUTOCRAFT_DISCORD_KEY_FILE
// are set; the runner starts it next to the worker server. See docs/pipeline.md.
import type { DatabaseSync } from "node:sqlite";
import { connect } from "../db.ts";
import { loadConfig, type Config } from "../dash/server/config.ts";
import { TokenBox } from "../dash/server/crypto.ts";
import { githubIdentity } from "../github/identity.ts";
import { providerFor } from "../dash/server/provider.ts";
import { userForLogin } from "../dash/server/sessions.ts";
import { audit } from "../dash/audit.ts";
import { envVar } from "../env.ts";
import { localEmbedder } from "../embed/model.ts";
import { VectorIndex } from "../embed/vectors.ts";
import { Gateway } from "./gateway.ts";
import { Interactions } from "./interactions.ts";
import { Pings } from "./pings.ts";
import { Signals, dropSignalTexts } from "./signals.ts";
import { deleteRepliesOf } from "./replies.ts";
import { RestClient } from "./rest.ts";
import { Reactor } from "./react.ts";
import { forgetReporter } from "./file-issue.ts";
import { forgetLink } from "./links.ts";
import { Search, dropTexts } from "./search.ts";
import { installAccountCommands } from "./commands.ts";
import { DecisionAlerts, installAlertCommands } from "./alerts.ts";
import { installSearchCommands } from "./search-commands.ts";
import { dropIssueTexts, installIssueNew } from "./issue-new.ts";
import { DiscordConfigError, readKeyFile, readTokenFile, type DiscordKeys } from "./keys.ts";
import { forgetAuthor, forgetMessages, handleDispatch, setStatus, upsertCategory, upsertChannel } from "./store.ts";

type Channel = { id: string; name?: string; type?: number; parent_id?: string | null; position?: number };
const CATEGORY = 4;
// Text, announcement and forum channels can be watched; their threads and forum posts count under them.
const LISTED = new Set([0, 5, 15]);

/** Keeps the channel list the admin page shows; no message is involved. Rows of deleted channels are removed by handleDispatch, which runs first. */
export function handleMeta(db: DatabaseSync, type: string, d: unknown): void {
  const x = d as { id?: string; name?: string; guild_id?: string; type?: number; parent_id?: string | null; position?: number; unavailable?: boolean; channels?: Channel[]; threads?: Channel[] };
  const thread = (guildId: string, t: Channel): void => {
    if (t.parent_id) upsertChannel(db, { channelId: t.id, guildId, guildName: null, name: t.name ?? null, parentId: t.parent_id });
  };
  if (type === "GUILD_CREATE" && x.id) {
    for (const c of x.channels ?? []) {
      if (c.type === CATEGORY) upsertCategory(db, { categoryId: c.id, guildId: x.id, name: c.name ?? null, position: c.position ?? null });
      else if (c.type === undefined || LISTED.has(c.type)) upsertChannel(db, { channelId: c.id, guildId: x.id, guildName: x.name ?? null, name: c.name ?? null, position: c.position, categoryId: c.parent_id });
    }
    for (const t of x.threads ?? []) thread(x.id, t);
  } else if ((type === "CHANNEL_CREATE" || type === "CHANNEL_UPDATE") && x.id && x.guild_id && x.type === CATEGORY) {
    upsertCategory(db, { categoryId: x.id, guildId: x.guild_id, name: x.name ?? null, position: x.position ?? null });
  } else if ((type === "CHANNEL_CREATE" || type === "CHANNEL_UPDATE") && x.id && x.guild_id && (x.type === undefined || LISTED.has(x.type))) {
    upsertChannel(db, { channelId: x.id, guildId: x.guild_id, guildName: null, name: x.name ?? null, position: x.position, categoryId: x.parent_id });
  } else if ((type === "THREAD_CREATE" || type === "THREAD_UPDATE") && x.id && x.guild_id) {
    thread(x.guild_id, x as Channel);
  } else if (type === "THREAD_LIST_SYNC" && x.guild_id) {
    for (const t of x.threads ?? []) thread(x.guild_id, t);
  } else if ((type === "CHANNEL_DELETE" || type === "THREAD_DELETE") && x.id) {
    db.prepare("DELETE FROM discord_channels WHERE channel_id = ? OR parent_id = ?").run(x.id, x.id);
    db.prepare("DELETE FROM discord_categories WHERE category_id = ?").run(x.id);
  } else if (type === "GUILD_DELETE" && x.id && !x.unavailable) {
    db.prepare("DELETE FROM discord_channels WHERE guild_id = ?").run(x.id);
    db.prepare("DELETE FROM discord_categories WHERE guild_id = ?").run(x.id);
  }
}

/**
 * The one handler of gateway events. Order matters: the mention rows and channel list change first; the pings then see
 * `discord_replies` intact, so a deleted ping or quoted message finds our reply and deletes it in Discord.
 */
export function dispatcher(db: DatabaseSync, keys: DiscordKeys, interactions: Interactions, pings: Pings, signals?: Signals, reactor?: Reactor): (type: string, d: unknown) => void {
  return (type, d) => {
    const recorded = handleDispatch(db, keys, type, d);
    if (recorded) reactor?.recorded(recorded.channelId, recorded.messageId);
    handleMeta(db, type, d);
    interactions.dispatch(type, d);
    pings.dispatch(type, d);
    signals?.dispatch(type, d);
  };
}

/** Decision alerts by direct message. The GitHub permissions of a linked login are read as the dashboard reads them, from the dashboard's configuration when this process has it, else from the cached permissions only. */
function installDecisionAlerts(db: DatabaseSync, keys: DiscordKeys, rest: RestClient, interactions: Interactions, signal: AbortSignal, log: (l: string) => void): void {
  let config: Config | null = null;
  try { config = loadConfig(process.env); } catch (e) { log(`runner: Discord alerts use cached permissions only: ${(e as Error).message}`); }
  const box = config ? new TokenBox(config.secrets.sessionKey) : null;
  const provider = config ? providerFor(config, () => githubIdentity(db)) : null;
  const alerts = new DecisionAlerts({
    db, keys, rest, log, baseUrl: config?.baseUrl ?? envVar("BASE_URL") ?? null,
    // Without the dashboard configuration there is no token box: userForLogin then answers from cached permissions, as it does for agent tokens.
    userFor: (login, role, forWrite) => userForLogin(db, box as never, provider as never, login, role, forWrite),
  });
  installAlertCommands(interactions, alerts);
  alerts.start(signal);
}

/** Starts the gateway when configured. A bad configuration or a failed connection is logged and never stops the caller. */
export function startDiscord(db: DatabaseSync, signal: AbortSignal, log: (l: string) => void): void {
  const tokenFile = envVar("DISCORD_TOKEN_FILE");
  if (!tokenFile) return;
  let token: string, keys: DiscordKeys;
  try {
    token = readTokenFile(tokenFile);
    const keyFile = envVar("DISCORD_KEY_FILE");
    if (!keyFile) throw new DiscordConfigError("AUTOCRAFT_DISCORD_KEY_FILE is not set");
    keys = readKeyFile(keyFile);
  } catch (e) {
    log(`runner: Discord not started: ${(e as Error).message}`);
    setStatus(db, "failed", (e as Error).message);
    return;
  }
  // The embedding model loads on the first question and the vector index on its first search; nothing here waits for them.
  const rest = new RestClient({ token });
  const embedder = localEmbedder({ threads: 2 });
  const search = new Search({ db, embedder, index: new VectorIndex(embedder), log });
  const interactions = new Interactions(rest, log);
  installSearchCommands(interactions, { db, keys, search });
  installAccountCommands(interactions, { db, keys });
  installIssueNew(interactions, { db, keys, search, log });
  installDecisionAlerts(db, keys, rest, interactions, signal, log);
  const pings = new Pings({ db, keys, rest, search, log });
  const signals = new Signals({ db, keys, log });
  const reactor = new Reactor({ db, rest, log });
  // A crash during a call can leave the question in a recorded prompt.
  try { dropTexts(db, true); dropIssueTexts(db, true); dropSignalTexts(db, true); } catch (e) { log(`runner: removing search texts failed: ${(e as Error).message}`); }
  const gw = new Gateway({
    token,
    log,
    onState: (state, detail) => setStatus(db, state, detail),
    onDispatch: dispatcher(db, keys, interactions, pings, signals, reactor),
  });
  log("runner: Discord mention counting, pings and search started");
  void gw.run(signal).catch((e: Error) => log(`runner: Discord stopped: ${e.message}`));
}

const USAGE = `usage: autocraft discord forget --message <message link or id> | --user <user id>
       autocraft discord channels
       autocraft discord watch <channel id> | unwatch <channel id>`;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function keysOrDie(): DiscordKeys {
  const f = envVar("DISCORD_KEY_FILE");
  if (!f) die("AUTOCRAFT_DISCORD_KEY_FILE is not set");
  try {
    return readKeyFile(f);
  } catch (e) {
    return die((e as Error).message);
  }
}

// Recorded in the audit log as `cli`: only someone with a shell on the host can run this.
async function discord(args: string[]): Promise<void> {
  const [sub, a, b] = args;
  const db = connect();
  if (sub === "forget" && (a === "--message" || a === "--user") && b) {
    const keys = keysOrDie();
    const id = a === "--message" ? (/\/channels\/\d+\/\d+\/(\d+)\/?(?:[?#].*)?$/.exec(b)?.[1] ?? (/^\d+$/.test(b) ? b : die("not a Discord message link or id"))) : /^\d+$/.test(b) ? b : die("not a Discord user id");
    if (a === "--message") {
      const n = forgetMessages(db, keys, [id]);
      // Our reply to the message goes too: deleted in Discord first, then its row.
      const tokenFile = envVar("DISCORD_TOKEN_FILE");
      let replies = 0;
      if (tokenFile) {
        try {
          replies = await deleteRepliesOf(db, keys, new RestClient({ token: readTokenFile(tokenFile) }), [id], (l) => console.error(l));
        } catch (e) {
          console.error((e as Error).message);
        }
      }
      audit(db, "cli", "discord-forget", "message", { rows: n, replies });
      console.log(`deleted ${n} mention ${n === 1 ? "row" : "rows"} and ${replies} ${replies === 1 ? "reply" : "replies"}`);
    } else {
      const n = forgetAuthor(db, keys, id);
      const links = forgetLink(db, keys, id);
      const signedIn = forgetReporter(db, keys.hash("author", id));
      audit(db, "cli", "discord-forget", "user", { rows: n, links, signedIn });
      console.log(`deleted ${n} mention ${n === 1 ? "row" : "rows"} and ${links} ${links === 1 ? "link" : "links"}${signedIn ? " and the GitHub sign-in" : ""}`);
    }
  } else if (sub === "channels") {
    for (const c of db.prepare("SELECT channel_id, guild_name, name, watched FROM discord_channels ORDER BY guild_name, name").all() as { channel_id: string; guild_name: string | null; name: string | null; watched: number }[])
      console.log(`${c.watched ? "watched " : "-       "} ${c.channel_id} ${c.guild_name ?? "?"} / #${c.name ?? "?"}`);
  } else if ((sub === "watch" || sub === "unwatch") && a) {
    const r = db.prepare("UPDATE discord_channels SET watched = ? WHERE channel_id = ?").run(sub === "watch" ? 1 : 0, a);
    if (!r.changes) die("no such channel; the bot has not reported it");
    audit(db, "cli", sub === "watch" ? "discord-watch" : "discord-unwatch", a);
    console.log(`${sub === "watch" ? "watching" : "no longer watching"} ${a}`);
  } else die(USAGE);
}

export const commands = {
  discord: { summary: "Discord mentions: forget --message|--user | channels | watch | unwatch", run: (args: string[]) => discord(args) },
};
