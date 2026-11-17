// Slash commands, message commands and buttons. Commands register here with their handlers; the table is keyed by
// command name (plus subcommand) or by the custom_id prefix of a component, so later commands plug in with `command`
// and `component`. Every interaction is answered with a deferral within the 3 second limit and then edited, so a
// handler may take as long as it needs (the response stays editable for 15 minutes). Guild commands are
// registered when the bot sees a guild.
import { createHash } from "node:crypto";
import type { CommandDef, DiscordRest, EditBody } from "./rest.ts";

/** A submitted modal's components: action rows hold `components`; a Label (type 18) holds one `component`. A select gives `values`, a text input `value`. */
export type ModalComponent = { type?: number; custom_id?: string; value?: string; values?: string[]; component?: ModalComponent; components?: ModalComponent[] };

export type Interaction = {
  id: string; token: string; type: number; application_id?: string; guild_id?: string; channel_id?: string;
  member?: { user?: { id: string } }; user?: { id: string };
  data?: {
    name?: string; type?: number; custom_id?: string; target_id?: string;
    values?: string[];
    components?: ModalComponent[];
    options?: { name: string; type: number; value?: unknown; focused?: boolean; options?: { name: string; type: number; value?: unknown; focused?: boolean }[] }[];
    resolved?: { messages?: Record<string, { content?: string }> };
  };
};

export type Call = {
  interaction: Interaction;
  /** The Discord user id of whoever pressed it. */
  userId: string | null;
  /** The value of an option of the invoked (sub)command, when it is text. */
  option(name: string): string | undefined;
  /** The option being typed in an autocomplete interaction. */
  focused(): { name: string; value: string } | undefined;
  /** The text of the message a message command was used on. */
  targetText(): string | undefined;
  /** Replaces the deferred response. */
  edit(body: EditBody): Promise<void>;
  /** The values of a submitted modal, by custom_id: the text of an input, or the first chosen value of a select. */
  fields(): Record<string, string>;
  /** The chosen values of a select menu that was used in a message. */
  values(): string[];
  /** For handlers added with `immediate`: acknowledges a select or button without changing the message. */
  ack(): Promise<void>;
  /** For handlers added with `immediate`: shows a modal as the answer (it must come within 3 seconds). */
  showModal(modal: { custom_id: string; title: string; components: unknown[] }): Promise<void>;
  /** For handlers added with `immediate`: answers with a message only the caller sees. */
  reply(body: { content: string; components?: unknown[] }): Promise<void>;
  /** For handlers added with `immediate`: shows "thinking" so `edit` can answer later. */
  defer(): Promise<void>;
};

export type Handler = (call: Call) => Promise<void>;
/** `immediate` handlers are not deferred first: they answer themselves with `showModal`, `reply` or `defer`. */
type Entry = { handler: Handler; ephemeral: boolean; immediate: boolean };
type EntryOpts = { ephemeral?: boolean; immediate?: boolean };

export type Choice = { name: string; value: string };
const COMMAND = 2, COMPONENT = 3, AUTOCOMPLETE = 4, MODAL_SUBMIT = 5, MESSAGE_COMMAND = 3;

export class Interactions {
  #rest: DiscordRest;
  #log: (line: string) => void;
  #commands = new Map<string, Entry>();
  #components = new Map<string, Entry>();
  #completers = new Map<string, (call: Call) => Choice[]>();
  #defs: CommandDef[] = [];
  #appId: string | null = null;
  #registered = new Map<string, string>();

  constructor(rest: DiscordRest, log: (line: string) => void) {
    this.#rest = rest;
    this.#log = log;
  }

  /**
   * Adds a command. `key` is the command name, with the subcommand after a space ("autocraft search"); it is the
   * definition's name for a command without subcommands. The definition of a command with subcommands may be given by each
   * handler (their options are merged) or once, with null for the others.
   */
  command(key: string, def: CommandDef | null, handler: Handler, opts: EntryOpts = {}): void {
    this.#commands.set(key, { handler, ephemeral: opts.ephemeral ?? true, immediate: opts.immediate ?? false });
    if (!def) return;
    const have = this.#defs.find((d) => d.name === def.name && d.type === def.type);
    if (!have) this.#defs.push(def);
    else if (def.options?.length) {
      // Another subcommand of a command that is already defined: its options join the definition.
      const names = new Set((have.options as { name: string }[] | undefined)?.map((o) => o.name));
      const added = (def.options as { name: string }[]).filter((o) => !names.has(o.name));
      if (added.length) have.options = [...(have.options ?? []), ...added];
    }
  }

  /** Adds the choices of the focused option of a command (same key as `command`); at most 25 are sent. Answered at once, never deferred. */
  autocomplete(key: string, choices: (call: Call) => Choice[]): void {
    this.#completers.set(key, choices);
  }

  /** Adds a handler for the buttons and submitted modals whose custom_id is `prefix` or starts with `prefix:`. */
  component(prefix: string, handler: Handler, opts: EntryOpts = {}): void {
    this.#components.set(prefix, { handler, ephemeral: opts.ephemeral ?? true, immediate: opts.immediate ?? false });
  }

  /** Gateway events: READY gives the application id, GUILD_CREATE registers the commands, INTERACTION_CREATE runs a handler. Returns at once. */
  dispatch(type: string, d: unknown): void {
    const x = d as { application?: { id?: string }; id?: string };
    if (type === "READY") this.#appId = x.application?.id ?? this.#appId;
    else if (type === "GUILD_CREATE" && typeof x.id === "string") void this.registerGuild(x.id);
    else if (type === "INTERACTION_CREATE") void ((d as Interaction).type === AUTOCOMPLETE ? this.#complete(d as Interaction) : this.#run(d as Interaction));
  }

  /** Makes the guild's commands exactly the registered definitions. Does nothing when this process already sent the same set. */
  async registerGuild(guildId: string): Promise<void> {
    if (!this.#appId || !this.#defs.length) return;
    const body = JSON.stringify(this.#defs);
    const sum = createHash("sha256").update(body).digest("hex");
    if (this.#registered.get(guildId) === sum) return;
    // Recorded before the request, so a second GUILD_CREATE while it runs does not send the set again.
    this.#registered.set(guildId, sum);
    try {
      await this.#rest.overwriteGuildCommands(this.#appId, guildId, this.#defs);
    } catch (e) {
      this.#registered.delete(guildId);
      this.#log(`discord: registering commands failed: ${(e as Error).message}`);
    }
  }

  #entry(i: Interaction): Entry | undefined {
    if (i.type === COMPONENT || i.type === MODAL_SUBMIT) {
      const id = i.data?.custom_id ?? "";
      return this.#components.get(id.split(":")[0]!);
    }
    if (i.type !== COMMAND) return undefined;
    const sub = i.data?.options?.find((o) => o.type === 1);
    return this.#commands.get(sub ? `${i.data?.name} ${sub.name}` : (i.data?.name ?? ""));
  }

  async #complete(i: Interaction): Promise<void> {
    const sub = i.data?.options?.find((o) => o.type === 1);
    const find = this.#completers.get(sub ? `${i.data?.name} ${sub.name}` : (i.data?.name ?? ""));
    if (!find) return;
    try {
      const opts = sub?.options ?? i.data?.options ?? [];
      const call = { interaction: i, userId: i.member?.user?.id ?? i.user?.id ?? null, option: () => undefined, targetText: () => undefined, edit: async () => {}, fields: () => ({}), values: () => [], ack: async () => {}, showModal: async () => {}, reply: async () => {}, defer: async () => {},
        focused: () => { const o = opts.find((x) => x.focused); return o ? { name: o.name, value: typeof o.value === "string" ? o.value : "" } : undefined; } } as Call;
      await this.#rest.interactionCallback(i.id, i.token, 8, { choices: find(call).slice(0, 25) });
    } catch (e) {
      this.#log(`discord: autocomplete failed: ${(e as Error).message}`);
    }
  }

  async #run(i: Interaction): Promise<void> {
    const entry = this.#entry(i);
    if (!entry) return;
    const appId = i.application_id ?? this.#appId;
    const failed = "Something went wrong. Try again in a moment.";
    try {
      // Without an application id a deferred response could never be edited, so the answer is a plain message.
      if (!appId) {
        this.#log("discord: no application id; answering with an error");
        await this.#rest.interactionCallback(i.id, i.token, 4, { content: failed, ephemeral: true });
        return;
      }
      let answered = false;
      // Deferred first: a handler's own work never counts against the 3 seconds.
      if (!entry.immediate) {
        await this.#rest.interactionCallback(i.id, i.token, 5, { ephemeral: entry.ephemeral });
        answered = true;
      }
      const sub = i.data?.options?.find((o) => o.type === 1);
      const opts = sub?.options ?? i.data?.options ?? [];
      const call: Call = {
        interaction: i,
        userId: i.member?.user?.id ?? i.user?.id ?? null,
        option: (name) => { const v = opts.find((o) => o.name === name)?.value; return typeof v === "string" ? v : undefined; },
        focused: () => { const o = opts.find((x) => x.focused); return o ? { name: o.name, value: typeof o.value === "string" ? o.value : "" } : undefined; },
        targetText: () => (i.data?.type === MESSAGE_COMMAND && i.data.target_id ? i.data.resolved?.messages?.[i.data.target_id]?.content : undefined),
        edit: (body) => this.#rest.editInteractionResponse(appId, i.token, body),
        fields: () => Object.fromEntries((i.data?.components ?? []).flatMap((r) => (r.component ? [r.component] : (r.components ?? []))).filter((c) => c.custom_id).map((c) => [c.custom_id!, c.value ?? c.values?.[0] ?? ""])),
        values: () => i.data?.values ?? [],
        ack: async () => { answered = true; await this.#rest.interactionCallback(i.id, i.token, 6); },
        showModal: async (m) => { answered = true; await this.#rest.interactionCallback(i.id, i.token, 9, m); },
        reply: async (b) => { answered = true; await this.#rest.interactionCallback(i.id, i.token, 4, { ...b, ephemeral: true }); },
        defer: async () => { answered = true; await this.#rest.interactionCallback(i.id, i.token, 5, { ephemeral: true }); },
      };
      try {
        await entry.handler(call);
      } catch (e) {
        this.#log(`discord: command failed: ${(e as Error).message}`);
        await (answered ? call.edit({ content: failed }) : call.reply({ content: failed })).catch(() => undefined);
      }
    } catch (e) {
      this.#log(`discord: answering an interaction failed: ${(e as Error).message}`);
    }
  }
}
