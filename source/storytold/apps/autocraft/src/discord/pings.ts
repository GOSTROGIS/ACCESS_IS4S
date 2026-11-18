// Answers @-mentions of the bot in watched channels with one public reply: the issues closest to the question. The
// question is the quoted message, or the ping's own text without mentions. The question is searched and dropped; the
// only record of a reply is a keyed hash of the ping and of the quoted message with the sealed id of our reply, kept so
// the reply can be deleted when either message is deleted. See docs/pipeline.md.
import type { DatabaseSync } from "node:sqlite";
import type { DiscordKeys } from "./keys.ts";
import { deleteRepliesOf } from "./replies.ts";
import { budgetReply, renderMatches } from "./reply.ts";
import type { DiscordRest } from "./rest.ts";
import { QUESTION_CHARS, type Search } from "./search.ts";
import { isWatched } from "./store.ts";

type Mentionable = { id: string };
export type PingMessage = {
  id: string; channel_id: string; guild_id?: string; content?: string; type?: number; webhook_id?: string;
  author?: { id: string; bot?: boolean };
  mentions?: Mentionable[]; mention_roles?: string[];
  message_reference?: { message_id?: string };
  referenced_message?: { content?: string | null; author?: { id?: string } } | null;
};
type Role = { id: string; tags?: { bot_id?: string } };

/** Matches in a public ping reply. */
const PING_MATCHES = 3;
const MENTION = /<@[!&]?\d+>/g;
const strip = (s: string): string => s.replace(MENTION, " ").replace(/\s+/g, " ").trim();

export type PingDeps = { db: DatabaseSync; keys: DiscordKeys; rest: DiscordRest; search: Search; log: (line: string) => void };

export class Pings {
  #d: PingDeps;
  #botId: string | null = null;
  #roles = new Set<string>();
  #inflight = new Set<string>();
  #deletedMeanwhile = new Set<string>();
  #jobs = new Set<Promise<void>>();

  constructor(deps: PingDeps) {
    this.#d = deps;
  }

  /** Resolves when the work started so far has finished; for tests. */
  async idle(): Promise<void> {
    while (this.#jobs.size) await Promise.all([...this.#jobs]);
  }

  /** Gateway events. Returns at once; the work runs on its own and never throws. */
  dispatch(type: string, d: unknown): void {
    const x = d as Record<string, unknown>;
    if (type === "READY") {
      this.#botId = (x.user as Mentionable | undefined)?.id ?? null;
    } else if (type === "GUILD_CREATE") {
      for (const r of (x.roles as Role[] | undefined) ?? []) this.#role(r);
    } else if (type === "GUILD_ROLE_CREATE" || type === "GUILD_ROLE_UPDATE") {
      if (x.role) this.#role(x.role as Role);
    } else if (type === "MESSAGE_CREATE") {
      const m = d as PingMessage;
      if (this.#isPing(m)) this.#run(() => this.#ping(m));
    } else if (type === "MESSAGE_DELETE") {
      if (typeof x.id === "string") this.#run(() => this.#deleted([x.id as string]));
    } else if (type === "MESSAGE_DELETE_BULK") {
      if (Array.isArray(x.ids)) { const ids = (x.ids as unknown[]).filter((i): i is string => typeof i === "string"); this.#run(() => this.#deleted(ids)); }
    }
  }

  #run(job: () => Promise<void>): void {
    const p: Promise<void> = job().catch((e: Error) => this.#d.log(`discord: ping handling failed: ${e.message}`)).finally(() => this.#jobs.delete(p));
    this.#jobs.add(p);
  }

  #role(r: Role): void {
    if (this.#botId && r.tags?.bot_id === this.#botId) this.#roles.add(r.id);
  }

  /**
   * A person's new message that names the bot in its text (`<@id>`, `<@!id>` or the bot's role), in a watched channel.
   * Discord also lists the author of a replied-to message in `mentions`, so that list does not count, and a reply to one of
   * the bot's own messages is not a ping. Bots, webhooks, edits and system messages are not pings.
   */
  #isPing(m: PingMessage): boolean {
    if (!this.#botId || typeof m.id !== "string" || typeof m.channel_id !== "string") return false;
    if (!m.author?.id || m.author.bot || m.webhook_id) return false;
    if (m.type !== undefined && m.type !== 0 && m.type !== 19) return false;
    if (m.referenced_message?.author?.id === this.#botId) return false;
    const text = m.content ?? "";
    if (!(text.includes(`<@${this.#botId}>`) || text.includes(`<@!${this.#botId}>`) || [...this.#roles].some((r) => text.includes(`<@&${r}>`)))) return false;
    return isWatched(this.#d.db, m.channel_id);
  }

  async #ping(m: PingMessage): Promise<void> {
    const { db, keys, rest, search } = this.#d;
    const pingHash = keys.hash("message", m.id);
    if (this.#inflight.has(pingHash) || db.prepare("SELECT 1 FROM discord_replies WHERE ping_hash = ?").get(pingHash)) return;
    const quotedId = m.message_reference?.message_id;
    const question = (quotedId ? strip(m.referenced_message?.content ?? "") : "") || strip(m.content ?? "");
    if (!question) return;
    if (!search.allow(keys.hash("author", m.author!.id), keys.hash("channel", m.channel_id))) return;
    this.#inflight.add(pingHash);
    try {
      const found = await search.find(question.slice(0, QUESTION_CHARS));
      // A ping reply is public in the channel: the best few only.
      const r = renderMatches(db, found.matches.slice(0, PING_MATCHES), question, m.channel_id);
      const quoted = quotedId ? keys.hash("message", quotedId) : null;
      // Deleted while the search ran: nothing to reply to.
      if (this.#deletedMeanwhile.has(pingHash) || (quoted && this.#deletedMeanwhile.has(quoted))) return;
      const sent = await rest.createMessage(m.channel_id, {
        content: budgetReply(r.content, found.budgetError), allowed_mentions: { parse: [] }, message_reference: { message_id: m.id, fail_if_not_exists: false },
        ...(r.components.length && { components: r.components }),
      });
      const sealed = keys.seal({ guildId: m.guild_id ?? "", channelId: m.channel_id, messageId: sent.id, at: new Date().toISOString() }, pingHash);
      db.prepare("INSERT OR REPLACE INTO discord_replies (ping_hash, quoted_hash, channel_hash, sealed) VALUES (?, ?, ?, ?)").run(pingHash, quoted, keys.hash("channel", m.channel_id), sealed);
      // Deleted while the reply was being sent.
      if (this.#deletedMeanwhile.has(pingHash) || (quoted && this.#deletedMeanwhile.has(quoted))) await this.#deleted([m.id, ...(quotedId ? [quotedId] : [])]);
    } finally {
      this.#inflight.delete(pingHash);
      if (!this.#inflight.size) this.#deletedMeanwhile.clear();
    }
  }

  async #deleted(ids: string[]): Promise<void> {
    const { db, keys, rest, log } = this.#d;
    if (this.#inflight.size) for (const id of ids) this.#deletedMeanwhile.add(keys.hash("message", id));
    await deleteRepliesOf(db, keys, rest, ids, log);
  }
}
