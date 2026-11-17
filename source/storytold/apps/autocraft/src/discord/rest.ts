// The one Discord REST client: sends and deletes the bot's messages, answers interactions and registers commands.
// Requests of one rate-limit bucket run one at a time, and requests of different buckets run side by side. A response
// that says the bucket is used up (X-RateLimit-Remaining 0) delays the next request of that bucket until it resets; a 429
// is retried after the delay Discord names, and a global limit delays every request. Interaction callbacks are not
// queued: they must arrive within 3 seconds of the interaction, so they are sent at once (a 429 is still retried).
const API = "https://discord.com/api/v10";
const MAX_WAIT_MS = 30_000;
const MAX_TRIES = 4;

export type AllowedMentions = { parse: string[] };
export type MessageBody = {
  content?: string;
  allowed_mentions: AllowedMentions;
  message_reference?: { message_id: string; fail_if_not_exists: boolean };
  components?: unknown[];
  flags?: number;
};
/** Body of an edit: only the given fields change. */
export type EditBody = { content?: string; allowed_mentions?: AllowedMentions; components?: unknown[] };

export const EPHEMERAL = 64;
/** Callback types: a message now, "thinking" now and an edit later, or the choices of an autocomplete option. */
export const CALLBACK_MESSAGE = 4;
export const CALLBACK_DEFERRED = 5;
export const CALLBACK_CHOICES = 8;
/** A modal form, shown instead of a message; only as the first answer to an interaction. */
export const CALLBACK_MODAL = 9;
export type CallbackData = { custom_id?: string; title?: string; content?: string; components?: unknown[]; ephemeral?: boolean; choices?: { name: string; value: string }[] };

export type CommandDef = { name: string; type: 1 | 2 | 3; description?: string; options?: unknown[]; dm_permission?: boolean };

/** What the Discord features need from Discord; tests replace it. */
export interface DiscordRest {
  createMessage(channelId: string, body: MessageBody): Promise<{ id: string }>;
  editMessage(channelId: string, messageId: string, body: EditBody): Promise<void>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  /** Answers an interaction: a message (type 4), a deferral (type 5) or autocomplete choices (type 8); `ephemeral` shows a message to the caller only. */
  interactionCallback(interactionId: string, token: string, type: 4 | 5 | 6 | 8 | 9, data?: CallbackData): Promise<void>;
  /** Replaces the deferred or first response of an interaction. */
  editInteractionResponse(applicationId: string, token: string, body: EditBody): Promise<void>;
  /** Makes the guild's commands exactly `commands`. */
  overwriteGuildCommands(applicationId: string, guildId: string, commands: CommandDef[]): Promise<void>;
}

export class RestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type RestDeps = { token: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number };

export function callbackPayload(type: 4 | 5 | 6 | 8 | 9, data: Omit<CallbackData, "ephemeral">, ephemeral: boolean): { type: number; data: Record<string, unknown> } {
  const flags = ephemeral ? { flags: EPHEMERAL } : {};
  // A modal (type 9) takes its custom_id, title and components only.
  if (type === 9) { const m = data as Record<string, unknown>; return { type, data: { custom_id: m.custom_id, title: m.title, components: m.components } }; }
  if (type === CALLBACK_CHOICES) return { type, data: { choices: data.choices ?? [] } };
  if (type === CALLBACK_DEFERRED) return { type, data: flags };
  if (type === 6) return { type, data: {} };
  return { type, data: { ...(data.content !== undefined && { content: data.content }), ...(data.components && { components: data.components }), allowed_mentions: { parse: [] }, ...flags } };
}

/** Requests that share a limit share a key: ids are replaced, except the channel, guild or webhook id Discord limits per resource. */
export function routeKey(method: string, path: string): string {
  const parts = path.split("/").filter(Boolean);
  const major = new Set(["channels", "guilds", "webhooks", "interactions"]);
  return `${method} ${parts.map((p, i) => (/^\d+$/.test(p) && !major.has(parts[i - 1] ?? "") ? ":id" : /^[\w-]{40,}$/.test(p) ? ":token" : p)).join("/")}`;
}

/** The resource Discord scopes a bucket to: channel_id, guild_id, or webhook_id with its token. Empty for other routes. */
export function majorOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const i = parts.findIndex((p) => p === "channels" || p === "guilds" || p === "webhooks");
  if (i < 0 || !parts[i + 1]) return "";
  return parts[i] === "webhooks" ? `webhooks/${parts[i + 1]}/${parts[i + 2] ?? ""}` : `${parts[i]}/${parts[i + 1]}`;
}

export class RestClient implements DiscordRest {
  #d: RestDeps;
  #chains = new Map<string, Promise<unknown>>();
  #bucketOf = new Map<string, string>();
  #notBefore = new Map<string, number>();
  #globalUntil = 0;

  constructor(deps: RestDeps) {
    this.#d = deps;
  }

  async createMessage(channelId: string, body: MessageBody): Promise<{ id: string }> {
    return (await this.#queue("POST", `/channels/${channelId}/messages`, body, true)) as { id: string };
  }

  async editMessage(channelId: string, messageId: string, body: EditBody): Promise<void> {
    await this.#queue("PATCH", `/channels/${channelId}/messages/${messageId}`, body, true);
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    try {
      await this.#queue("DELETE", `/channels/${channelId}/messages/${messageId}`, undefined, true);
    } catch (e) {
      if (!(e instanceof RestError && e.status === 404)) throw e;
    }
  }

  /** Adds the bot's own reaction (a unicode emoji) to a message. */
  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    await this.#queue("PUT", `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, undefined, true);
  }

  async interactionCallback(interactionId: string, token: string, type: 4 | 5 | 6 | 8 | 9, data?: CallbackData): Promise<void> {
    const { ephemeral, ...rest } = data ?? {};
    // Autocomplete results (type 8) take only `choices`; a deferral (type 5) takes flags only; a modal (type 9) its own fields; a message (type 4) also takes content, components and allowed_mentions.
    const payload = callbackPayload(type, rest, !!ephemeral);
    const path = `/interactions/${interactionId}/${token}/callback`;
    await this.#send("POST", path, routeKey("POST", path), payload, false);
  }

  async editInteractionResponse(applicationId: string, token: string, body: EditBody): Promise<void> {
    await this.#queue("PATCH", `/webhooks/${applicationId}/${token}/messages/@original`, { allowed_mentions: { parse: [] }, ...body }, false);
  }

  /** The direct-message channel with a user (the same channel each time). */
  async createDm(userId: string): Promise<{ id: string }> {
    return (await this.#queue("POST", "/users/@me/channels", { recipient_id: userId }, true)) as { id: string };
  }

  async overwriteGuildCommands(applicationId: string, guildId: string, commands: CommandDef[]): Promise<void> {
    await this.#queue("PUT", `/applications/${applicationId}/guilds/${guildId}/commands`, commands, true);
  }

  #queue(method: string, path: string, body: unknown, auth: boolean): Promise<unknown> {
    const key = routeKey(method, path);
    // The chain is per bucket once Discord has named it, else per route.
    const chain = this.#stateKey(key, path);
    const run = (this.#chains.get(chain) ?? Promise.resolve()).then(() => this.#send(method, path, key, body, auth));
    const tail = run.catch(() => undefined);
    this.#chains.set(chain, tail);
    void tail.then(() => { if (this.#chains.get(chain) === tail) this.#chains.delete(chain); });
    return run;
  }

  /** Limit state is kept per Discord bucket and major parameter, so one channel's limit does not delay another's; per route until a bucket is named. */
  #stateKey(key: string, path: string): string {
    const b = this.#bucketOf.get(key);
    return b ? `${b}|${majorOf(path)}` : `${key}|${majorOf(path)}`;
  }

  async #send(method: string, path: string, key: string, body: unknown, auth: boolean): Promise<unknown> {
    const f = this.#d.fetch ?? fetch;
    const now = this.#d.now ?? Date.now;
    const sleep = this.#d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let attempt = 1; ; attempt++) {
      const stateKey = this.#stateKey(key, path);
      for (const [k, t] of this.#notBefore) if (t <= now()) this.#notBefore.delete(k);
      const gap = Math.max(this.#globalUntil, this.#notBefore.get(stateKey) ?? 0) - now();
      if (gap > 0) await sleep(Math.min(gap, MAX_WAIT_MS));
      const r = await f(`${API}${path}`, {
        method,
        headers: { ...(auth && { authorization: `Bot ${this.#d.token}` }), ...(body !== undefined && { "content-type": "application/json" }) },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      const bucket = r.headers.get("x-ratelimit-bucket");
      if (bucket) this.#bucketOf.set(key, bucket);
      const owner = bucket ? `${bucket}|${majorOf(path)}` : stateKey;
      if (r.status === 429) {
        const j = (await r.json().catch(() => ({}))) as { retry_after?: number; global?: boolean };
        const given = j.retry_after ?? Number(r.headers.get("retry-after"));
        const wait = Math.min(MAX_WAIT_MS, Math.max(0.5, Number.isFinite(given) ? given : 1) * 1000);
        if (attempt >= MAX_TRIES) throw new RestError(429, "rate limited");
        if (j.global || r.headers.get("x-ratelimit-global")) this.#globalUntil = now() + wait;
        else this.#notBefore.set(owner, now() + wait);
        continue;
      }
      // The window is used up: the next request of the bucket waits for it to reset.
      if (r.headers.get("x-ratelimit-remaining") === "0") this.#notBefore.set(owner, now() + Math.ceil(Number(r.headers.get("x-ratelimit-reset-after") ?? 1) * 1000));
      if (!r.ok) throw new RestError(r.status, `${method} ${key.slice(method.length + 1)} failed: HTTP ${r.status}`);
      return r.status === 204 ? undefined : r.json().catch(() => undefined);
    }
  }
}
