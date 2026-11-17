// Discord issue search: ping replies, the model pick limited to the candidates, the daily cap, deleting a reply with its
// ping, the commands, and that no message text reaches the database.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { connect } from "../src/db.ts";
import type { Embedder } from "../src/embed/model.ts";
import { toBlob } from "../src/embed/store.ts";
import { VectorIndex } from "../src/embed/vectors.ts";
import { setRunner } from "../src/classify/run.ts";
import { dispatcher } from "../src/discord/index.ts";
import { Interactions } from "../src/discord/interactions.ts";
import { DiscordKeys } from "../src/discord/keys.ts";
import { installAccountCommands } from "../src/discord/commands.ts";
import { createLinkCode, loginOf } from "../src/discord/links.ts";
import { Pings } from "../src/discord/pings.ts";
import { RestClient, callbackPayload, type CommandDef, type DiscordRest, type EditBody, type MessageBody } from "../src/discord/rest.ts";
import { Search, dropTexts, type Ask } from "../src/discord/search.ts";
import { installSearchCommands } from "../src/discord/search-commands.ts";
import { useTestAccount } from "./accounts-fixture.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "discord-search-"));
const db = connect(join(dir, "d.db"));
const keys = new DiscordKeys("k".repeat(40));
useTestAccount(db);
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const VOCAB = ["webp", "export", "quality", "dark", "mode", "layers", "crash"];
const embedder: Embedder = {
  id: "fake", dim: VOCAB.length,
  async embed(texts) {
    return texts.map((t) => {
      const v = new Float32Array(VOCAB.length);
      VOCAB.forEach((w, i) => { if (t.toLowerCase().includes(w)) v[i] = 1; });
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    });
  },
};

class FakeRest implements DiscordRest {
  sent: { channelId: string; body: MessageBody; id: string }[] = [];
  deleted: string[] = [];
  callbacks: { type: number; ephemeral?: boolean; choices?: unknown[] }[] = [];
  edits: EditBody[] = [];
  commands: { guildId: string; commands: CommandDef[] }[] = [];
  async createMessage(channelId: string, body: MessageBody) { const id = `r${this.sent.length + 1}`; this.sent.push({ channelId, body, id }); return { id }; }
  async editMessage() {}
  async deleteMessage(_c: string, id: string) { this.deleted.push(id); }
  async interactionCallback(_i: string, _t: string, type: 4 | 5 | 8, data?: { ephemeral?: boolean; choices?: unknown[] }) { this.callbacks.push({ type, ephemeral: data?.ephemeral, choices: data?.choices }); }
  async editInteractionResponse(_a: string, _t: string, body: EditBody) { this.edits.push(body); }
  async overwriteGuildCommands(_a: string, guildId: string, commands: CommandDef[]) { this.commands.push({ guildId, commands }); }
}

let asked: unknown[] = [];
let reply = (): string | null => JSON.stringify({ picks: [{ ref: "photocraft#1", reason: "Same WebP quality problem" }, { ref: "evil#9", reason: "not a candidate" }, { ref: "photocraft#3", reason: "Closed with the original export" }] });
const ask: Ask = async (_db, input) => { asked.push(input); return reply(); };

const rest = new FakeRest();
const search = new Search({ db, embedder, index: new VectorIndex(embedder), log: () => {}, ask });
const pings = new Pings({ db, keys, rest, search, log: (l) => assert.fail(l) });
// The handler startDiscord gives the gateway: mention rows first, then pings, so a delete finds our reply.
const dispatch = dispatcher(db, keys, new Interactions(rest, (l) => assert.fail(l)), pings);

const QUESTION = "zebra-unique webp export quality is ignored";
const msg = (id: string, over: Record<string, unknown> = {}) => ({
  id, channel_id: "c1", guild_id: "g1", content: "<@bot1> is this known?", type: 19, author: { id: "u1" }, mentions: [{ id: "bot1" }],
  message_reference: { message_id: "q1" }, referenced_message: { content: QUESTION }, ...over,
});

before(async () => {
  db.prepare("INSERT OR IGNORE INTO tracked_repos (name) VALUES ('photocraft'), ('secret')").run();
  db.prepare("INSERT INTO repos (name, owner, visibility) VALUES ('photocraft', 'storytold', 'public'), ('secret', 'storytold', 'private') ON CONFLICT(name) DO UPDATE SET visibility = excluded.visibility").run();
  db.prepare("INSERT INTO discord_channels (channel_id, guild_id, guild_name, name, watched, default_repo) VALUES ('c1', 'g1', 'G', 'dev', 1, 'photocraft'), ('c2', 'g1', 'G', 'off', 0, NULL)").run();
  const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const item = db.prepare("INSERT INTO items (repo, number, kind, state, state_reason, closed_at, title, body, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const emb = db.prepare("INSERT INTO item_embeddings (repo, number, model, hash, vec, at) VALUES (?, ?, 'fake', 'h', ?, ?)");
  const rows: [string, number, string, string, string | null, string | null, string][] = [
    ["photocraft", 1, "issue", "OPEN", null, null, "Export to WebP ignores the quality setting"],
    ["photocraft", 2, "issue", "OPEN", null, null, "Dark mode for the layers panel"],
    ["photocraft", 3, "issue", "CLOSED", "COMPLETED", recent, "Add WebP export"],
    ["photocraft", 4, "pr", "OPEN", null, null, "WebP export quality fix"],
    ["photocraft", 5, "issue", "CLOSED", "NOT_PLANNED", recent, "WebP export quality in another format"],
    ["secret", 1, "issue", "OPEN", null, null, "WebP export quality in a private repo"],
  ];
  for (const [repo, n, kind, state, reason, closed, title] of rows) {
    item.run(repo, n, kind, state, reason, closed, title, "", `https://github.com/storytold/${repo}/${kind === "pr" ? "pull" : "issues"}/${n}`);
    emb.run(repo, n, toBlob((await embedder.embed([title], "item"))[0]!), recent);
  }
  // A security-labelled issue of a public repo is never a candidate, however close it is.
  db.prepare("INSERT INTO items (repo, number, kind, state, title, body, url, labels) VALUES ('photocraft', 6, 'issue', 'OPEN', 'WebP export quality hole', '', 'https://github.com/storytold/photocraft/issues/6', '[\"Security\"]')").run();
  emb.run("photocraft", 6, toBlob((await embedder.embed(["WebP export quality hole"], "item"))[0]!), recent);
  pings.dispatch("READY", { user: { id: "bot1" } });
});

describe("ping replies", () => {
  test("a reply-ping searches the quoted text and replies once, publicly, with link buttons and no mentions", async () => {
    pings.dispatch("MESSAGE_CREATE", msg("p1"));
    pings.dispatch("MESSAGE_CREATE", msg("p1"));
    await pings.idle();
    assert.equal(rest.sent.length, 1);
    const { body } = rest.sent[0]!;
    assert.deepEqual(body.allowed_mentions, { parse: [] });
    assert.deepEqual(body.message_reference, { message_id: "p1", fail_if_not_exists: false });
    assert.match(body.content!, /photocraft#1 Export to WebP ignores the quality setting\n> Same WebP quality problem/);
    assert.match(body.content!, /photocraft#3 Add WebP export \(closed\)/);
    const buttons = (body.components![0] as { components: { style: number; label: string; url?: string; custom_id?: string }[] }).components;
    assert.deepEqual(buttons.map((b) => b.label), ["photocraft#1", "photocraft#3", "File a new issue"]);
    assert.ok(buttons.slice(0, 2).every((b) => b.style === 5));
    assert.match(buttons[2]!.custom_id!, /^inewi:open:photocraft:/);
    // The model saw the quoted text, not the ping, and only public open issues and recently completed ones.
    const input = asked[0] as { question: string; candidates: { ref: string; closed: boolean }[] };
    assert.equal(input.question, QUESTION);
    assert.deepEqual(input.candidates.map((c) => c.ref).sort(), ["photocraft#1", "photocraft#2", "photocraft#3"]);
  });

  test("bots, unwatched channels and edits get no reply", async () => {
    const before = rest.sent.length;
    pings.dispatch("MESSAGE_CREATE", msg("p2", { author: { id: "b", bot: true } }));
    pings.dispatch("MESSAGE_CREATE", msg("p3", { channel_id: "c2" }));
    pings.dispatch("MESSAGE_UPDATE", msg("p1"));
    // Discord lists the author of a replied-to message in `mentions`: without the bot in the text it is not a ping.
    pings.dispatch("MESSAGE_CREATE", msg("p4", { content: "thanks, will check", mentions: [{ id: "bot1" }] }));
    // A reply to one of the bot's own messages is not a ping either, even with the bot named.
    pings.dispatch("MESSAGE_CREATE", msg("p4b", { referenced_message: { content: "bot answer", author: { id: "bot1" } } }));
    await pings.idle();
    assert.equal(rest.sent.length, before);
  });

  test("the pick is limited to the candidates", async () => {
    reply = () => JSON.stringify({ picks: [{ ref: "evil#9", reason: "invented" }, { ref: "photocraft#99", reason: "invented" }] });
    pings.dispatch("MESSAGE_CREATE", msg("p5", { referenced_message: { content: "crash in layers" } }));
    await pings.idle();
    const sent = rest.sent.at(-1)!.body.content!;
    assert.match(sent, /No matching issue found/);
    assert.doesNotMatch(sent, /evil|#99/);
  });

  test("picks are shown open first, then by comments plus reactions, whatever order the model gave", async () => {
    const set = db.prepare("UPDATE items SET comments_count = ?, reactions_count = ? WHERE repo = 'photocraft' AND number = ?");
    set.run(40, 10, 3); // closed, most active
    set.run(1, null, 1); // open, little activity (no reactions stored)
    set.run(2, 5, 2); // open, more activity
    reply = () => JSON.stringify({ picks: [{ ref: "photocraft#3", reason: "c" }, { ref: "photocraft#1", reason: "a" }, { ref: "photocraft#2", reason: "b" }] });
    try {
      const found = await search.find("webp export quality dark mode layers");
      assert.deepEqual(found.matches.map((m) => m.number), [2, 1, 3]);
    } finally {
      db.prepare("UPDATE items SET comments_count = NULL, reactions_count = NULL WHERE repo = 'photocraft'").run();
    }
  });

  test("over the daily cap the closest issues come from the embeddings, without a model call", async () => {
    db.prepare(`INSERT INTO agent_runs (step, stage, prompt_id, prompt_version, provider, model, items, item_count, state, started_at, cost_usd)
      VALUES ('discord-search', 3, 'discord.search', '1', 'claude', 'haiku', '[]', 0, 'done', ?, 2.5)`).run(new Date().toISOString());
    const calls = asked.length;
    pings.dispatch("MESSAGE_CREATE", msg("p6", { referenced_message: { content: "webp export quality" } }));
    await pings.idle();
    assert.equal(asked.length, calls);
    const sent = rest.sent.at(-1)!.body.content!;
    assert.match(sent, /photocraft#1 /);
    assert.doesNotMatch(sent, />/);
    db.prepare("DELETE FROM agent_runs WHERE step = 'discord-search'").run();
  });

  test("deleting the ping, or the quoted message, deletes our reply through the combined dispatch", async () => {
    reply = () => null;
    pings.dispatch("MESSAGE_CREATE", msg("p7", { message_reference: { message_id: "q7" }, referenced_message: { content: "webp export quality" } }));
    pings.dispatch("MESSAGE_CREATE", msg("p8", { message_reference: { message_id: "q8" }, referenced_message: { content: "webp export quality" }, author: { id: "u2" } }));
    await pings.idle();
    const idOf = (i: number) => rest.sent[i]!.id;
    const n = rest.sent.length;
    dispatch("MESSAGE_DELETE", { id: "p7" });
    dispatch("MESSAGE_DELETE", { id: "q8" });
    await pings.idle();
    assert.deepEqual(rest.deleted.sort(), [idOf(n - 2), idOf(n - 1)].sort());
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM discord_replies WHERE ping_hash IN (?, ?)").get(keys.hash("message", "p7"), keys.hash("message", "p8")) as { n: number }).n, 0);
  });

  test("no question text is stored in any table", () => {
    const dump = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
      .map((t) => JSON.stringify((db.prepare(`SELECT * FROM "${t.name}"`).all() as object[]).map((r) => Object.values(r).map((v) => (v instanceof Uint8Array ? Buffer.from(v).toString("latin1") : v)))))
      .join("\n");
    for (const needle of ["zebra-unique", "is this known", "crash in layers"]) assert.ok(!dump.includes(needle), needle);
  });
});

describe("model call", () => {
  test("the question reaches only the model call, and its texts are gone after it and at startup", async () => {
    let stdin = "";
    const restore = setRunner(async (_cmd, _args, input) => {
      stdin = input;
      return { code: 0, stdout: JSON.stringify({ type: "result", subtype: "success", result: JSON.stringify({ picks: [{ ref: "photocraft#1", reason: "same" }] }), usage: { input_tokens: 5, output_tokens: 2 }, total_cost_usd: 0.002 }), stderr: "" };
    });
    try {
      const real = new Search({ db, embedder, index: new VectorIndex(embedder), log: (l) => assert.fail(l) });
      const found = await real.find("zebra-unique webp export quality");
      assert.equal(found.judged, true);
      assert.match(stdin, /zebra-unique/);
    } finally {
      restore();
    }
    const runs = db.prepare("SELECT id, state FROM agent_runs WHERE step = 'discord-search'").all() as { id: number; state: string }[];
    assert.ok(runs.length >= 1 && runs.every((r) => r.state === "done"));
    const texts = () => (db.prepare("SELECT COUNT(*) AS n FROM agent_run_texts WHERE run_id IN (SELECT id FROM agent_runs WHERE step = 'discord-search')").get() as { n: number }).n;
    assert.equal(texts(), 0);
    // A crash can leave a call's text behind in any state; the startup sweep takes all of them.
    db.prepare("UPDATE agent_runs SET state = 'running' WHERE id = ?").run(runs[0]!.id);
    db.prepare("INSERT INTO agent_run_texts (run_id, prompt) VALUES (?, 'x')").run(runs[0]!.id);
    dropTexts(db, true);
    assert.equal(texts(), 0);
  });
});

describe("commands", () => {
  test("the message command is deferred as ephemeral, then edited with the result; guild commands register once", async () => {
    const ix = new Interactions(rest, (l) => assert.fail(l));
    installSearchCommands(ix, { db, keys, search });
    reply = () => JSON.stringify({ picks: [{ ref: "photocraft#2", reason: "Same panel" }] });
    ix.dispatch("READY", { application: { id: "app1" } });
    ix.dispatch("GUILD_CREATE", { id: "g1" });
    ix.dispatch("GUILD_CREATE", { id: "g1" });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(rest.commands.length, 1);
    assert.deepEqual(rest.commands[0]!.commands.map((c) => [c.name, c.type]), [["Find issue", 3]]);
    ix.dispatch("INTERACTION_CREATE", { id: "i1", token: "t", type: 2, application_id: "app1", channel_id: "c1", member: { user: { id: "u9" } }, data: { name: "Find issue", type: 3, target_id: "m1", resolved: { messages: { m1: { content: "dark mode layers" } } } } });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(rest.callbacks.at(-1), { type: 5, ephemeral: true, choices: undefined });
    assert.match(rest.edits.at(-1)!.content!, /photocraft#2 Dark mode for the layers panel\n> Same panel/);
  });

  test("/autocraft link, status, and stats: a code links the caller, hidden items are not found, repo choices are public repos", async () => {
    const ix = new Interactions(rest, (l) => assert.fail(l));
    installAccountCommands(ix, { db, keys });
    const call = (id: string, sub: string, options: unknown[], user = "u50") =>
      ix.dispatch("INTERACTION_CREATE", { id, token: "t", type: 2, application_id: "app1", channel_id: "c1", member: { user: { id: user } }, data: { name: "autocraft", type: 1, options: [{ name: sub, type: 1, options }] } });
    const settle = () => new Promise((r) => setTimeout(r, 30));
    const { code } = createLinkCode(db, keys, "mira");
    call("i2", "link", [{ name: "code", type: 3, value: code }]);
    await settle();
    assert.equal(rest.edits.at(-1)!.content, "Linked to mira");
    assert.equal(loginOf(db, keys, "u50"), "mira");
    call("i3", "status", [{ name: "item", type: 3, value: "photocraft#6" }]);
    await settle();
    assert.match(rest.edits.at(-1)!.content!, /No item found/);
    call("i4", "status", [{ name: "item", type: 3, value: "photocraft#2" }]);
    await settle();
    assert.match(rest.edits.at(-1)!.content!, /photocraft#2 Dark mode for the layers panel\nNew/);
    ix.dispatch("INTERACTION_CREATE", { id: "i5", token: "t", type: 4, application_id: "app1", data: { name: "autocraft", options: [{ name: "stats", type: 1, options: [{ name: "repo", type: 3, value: "ph", focused: true }] }] } });
    await settle();
    assert.deepEqual(rest.callbacks.at(-1), { type: 8, ephemeral: undefined, choices: [{ name: "photocraft", value: "photocraft" }] });
    call("i6", "unlink", []);
    await settle();
    assert.equal(loginOf(db, keys, "u50"), null);
  });
});

describe("account command limits", () => {
  test("stats and status allow 10 a minute per person; the window slides", async () => {
    let now = 1_000_000;
    const ix = new Interactions(rest, (l) => assert.fail(l));
    installAccountCommands(ix, { db, keys, now: () => now });
    const status = (id: string, user: string) =>
      ix.dispatch("INTERACTION_CREATE", { id, token: "t", type: 2, application_id: "app1", channel_id: "c1", member: { user: { id: user } }, data: { name: "autocraft", type: 1, options: [{ name: "status", type: 1, options: [{ name: "item", type: 3, value: "photocraft#2" }] }] } });
    const settle = () => new Promise((r) => setTimeout(r, 5));
    for (let i = 0; i < 10; i++) { status(`s${i}`, "u60"); await settle(); assert.match(rest.edits.at(-1)!.content!, /photocraft#2/); }
    status("s10", "u60"); await settle();
    assert.match(rest.edits.at(-1)!.content!, /Too many requests/);
    status("s11", "u61"); await settle();
    assert.match(rest.edits.at(-1)!.content!, /photocraft#2/);
    now += 61_000;
    status("s12", "u60"); await settle();
    assert.match(rest.edits.at(-1)!.content!, /photocraft#2/);
  });
});

describe("rest", () => {
  test("a used-up bucket delays only its own channel; autocomplete results carry only choices", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const seen: string[] = [];
    const fetcher = (async (url: string) => {
      seen.push(url);
      return new Response("{}", { status: 200, headers: { "x-ratelimit-bucket": "b1", "x-ratelimit-remaining": "0", "x-ratelimit-reset-after": "5" } });
    }) as unknown as typeof fetch;
    const client = new RestClient({ token: "t", fetch: fetcher, now: () => now, sleep: async (ms) => { sleeps.push(ms); } });
    await client.createMessage("111", { content: "a", allowed_mentions: { parse: [] } });
    await client.createMessage("222", { content: "b", allowed_mentions: { parse: [] } });
    assert.deepEqual(sleeps, []);
    await client.createMessage("111", { content: "c", allowed_mentions: { parse: [] } });
    assert.deepEqual(sleeps, [5000]);
    assert.deepEqual(callbackPayload(8, { choices: [{ name: "a", value: "a" }], content: "x", components: [] }, false), { type: 8, data: { choices: [{ name: "a", value: "a" }] } });
    assert.deepEqual(callbackPayload(5, {}, true), { type: 5, data: { flags: 64 } });
    assert.deepEqual(callbackPayload(4, { content: "hi" }, true), { type: 4, data: { content: "hi", allowed_mentions: { parse: [] }, flags: 64 } });
  });
});

describe("repo named in the question", () => {
  before(async () => {
    db.prepare("INSERT OR IGNORE INTO tracked_repos (name) VALUES ('vectorcraft')").run();
    db.prepare("INSERT INTO repos (name, owner, visibility) VALUES ('vectorcraft', 'storytold', 'public') ON CONFLICT(name) DO UPDATE SET visibility = excluded.visibility").run();
    const title = "Crash in layers";
    db.prepare("INSERT INTO items (repo, number, kind, state, title, body, url) VALUES ('vectorcraft', 1, 'issue', 'OPEN', ?, '', 'https://github.com/storytold/vectorcraft/issues/1')").run(title);
    db.prepare("INSERT INTO item_embeddings (repo, number, model, hash, vec, at) VALUES ('vectorcraft', 1, 'fake', 'h', ?, ?)").run(toBlob((await embedder.embed([title], "item"))[0]!), new Date().toISOString());
  });
  const repos = async (q: string, repo?: string) => [...new Set((await new Search({ db, embedder, index: new VectorIndex(embedder), log: () => {}, ask }).candidates(q, repo)).map((c) => c.repo))].sort();

  test("a named repo restricts the search, an explicit repo wins, two named repos search everything", async () => {
    assert.deepEqual(await repos("crash in layers"), ["photocraft", "vectorcraft"]);
    assert.deepEqual(await repos("PhotoCraft crash in layers"), ["photocraft"]);
    assert.deepEqual(await repos("photocraft crash in layers", "vectorcraft"), ["vectorcraft"]);
    assert.deepEqual(await repos("photocraft or vectorcraft crash in layers"), ["photocraft", "vectorcraft"]);
    assert.deepEqual(await repos("crash in layers", "secret"), ["photocraft", "vectorcraft"]);
  });
});
