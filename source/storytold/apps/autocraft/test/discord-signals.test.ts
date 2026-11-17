// Discord attention signals: Jev's bands, Haiku between them, a deleted message losing its flag, and the Items filter.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { connect } from "../src/db.ts";
import { setJevEnabled } from "../src/agents/jev.ts";
import { DiscordKeys } from "../src/discord/keys.ts";
import { SIGNAL_CAP_KEY, Signals, signalCountOf, signalLinks, type Judge } from "../src/discord/signals.ts";
import { handleDispatch } from "../src/discord/store.ts";
import { statusList } from "../src/dash/api/items.ts";
import type { Req } from "../src/dash/types.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "discord-signals-"));
const db = connect(join(dir, "d.db"));
const keys = new DiscordKeys("k".repeat(40));
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

let jevP: number | null = 0.5, haikuSays: boolean | null = true;
const calls = { jev: 0, haiku: 0 };
const judge: Judge = {
  jev: async () => (calls.jev++, jevP),
  haiku: async () => (calls.haiku++, haikuSays),
};
const signals = new Signals({ db, keys, log: () => {}, judge });
const msg = (id: string, content: string) => ({ id, channel_id: "c1", guild_id: "g1", content, timestamp: "2026-11-01T10:00:00.000Z", author: { id: "u1" } });
// The dispatcher's order: mention rows first, then the signal check.
async function send(type: string, m: object): Promise<void> {
  handleDispatch(db, keys, type, m);
  signals.dispatch(type, m);
  await signals.idle();
}
const asked = (n: number) => signalCountOf(db, "photocraft", n);

describe("attention signals", () => {
  before(() => {
    db.prepare("INSERT OR IGNORE INTO tracked_repos (name) VALUES ('photocraft')").run();
    db.prepare("INSERT OR IGNORE INTO repos (name, owner) VALUES ('photocraft', 'storytold')").run();
    db.prepare("INSERT INTO discord_channels (channel_id, guild_id, guild_name, name, watched) VALUES ('c1', 'g1', 'Guild', 'dev', 1)").run();
    const add = db.prepare("INSERT INTO items (repo, number, kind, state, title, updated_at) VALUES ('photocraft', ?, 'issue', 'OPEN', ?, '2026-01-01')");
    for (const n of [1, 2, 3, 4]) add.run(n, `Item ${n}`);
  });

  test("Jev decides from 0.8 up and below 0.3; Haiku decides in between and when Jev is off", async () => {
    jevP = 0.85; await send("MESSAGE_CREATE", msg("m1", "can someone review photocraft#1?"));
    assert.equal(asked(1), 1);
    assert.equal(calls.haiku, 0);
    jevP = 0.1; haikuSays = true; await send("MESSAGE_CREATE", msg("m2", "photocraft#2 is the fix for the crash"));
    assert.equal(asked(2), 0);
    assert.equal(calls.haiku, 0);
    jevP = 0.5; haikuSays = true; await send("MESSAGE_CREATE", msg("m3", "any news on photocraft#3"));
    assert.equal(asked(3), 1);
    assert.equal(calls.haiku, 1);
    jevP = 0.5; haikuSays = false; await send("MESSAGE_CREATE", msg("m4", "photocraft#4 exists"));
    assert.equal(asked(4), 0);
    setJevEnabled(db, false, "test");
    const jevCalls = calls.jev;
    haikuSays = true; await send("MESSAGE_CREATE", msg("m5", "please look at photocraft#4"));
    assert.equal(calls.jev, jevCalls);
    assert.equal(asked(4), 1);
    setJevEnabled(db, true, "test");
  });

  test("an edit asks again, a link preview does not, and a delete removes the flag; no text is kept", async () => {
    const before = calls.jev;
    jevP = 0.1;
    await send("MESSAGE_UPDATE", { ...msg("m1", "can someone review photocraft#1?") });
    assert.equal(calls.jev, before, "an update without an edit time is not asked");
    assert.equal(asked(1), 1);
    await send("MESSAGE_UPDATE", { ...msg("m1", "photocraft#1 solved, thanks"), edited_timestamp: "2026-11-01T11:00:00.000Z" });
    assert.equal(asked(1), 0, "the edit cleared the flag");
    jevP = 0.9;
    await send("MESSAGE_UPDATE", { ...msg("m1", "photocraft#1 still needs a review"), edited_timestamp: "2026-11-01T12:00:00.000Z" });
    assert.equal(asked(1), 1);
    assert.deepEqual(signalLinks(db, keys, "photocraft", 1).map((l) => l.url), ["https://discord.com/channels/g1/c1/m1"]);
    await send("MESSAGE_DELETE", { id: "m1", channel_id: "c1" });
    assert.equal(asked(1), 0);
    assert.equal(signalLinks(db, keys, "photocraft", 1).length, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_run_texts").get()!.n, 0);
  });

  test("the Items filter returns every mentioned item, asked about or not", async () => {
    const req = (q: string) => ({ query: new URLSearchParams(q), user: { role: "operator", login: "o", canRead: async () => true } }) as unknown as Req;
    const rows = async (q: string) => (await statusList(db, req(q))).rows.map((r) => r.number).sort();
    // m1 (photocraft#1) was deleted; #2 is a plain mention, #3 and #4 were asked about.
    assert.deepEqual(await rows("discord=1"), [2, 3, 4]);
    assert.deepEqual(await rows(""), [1, 2, 3, 4]);
    assert.equal((await statusList(db, req("discord=1"))).total, 3);
  });

  test("limits per author and channel, two calls at a time, and a message naming many items is skipped", async () => {
    let now = 1_000_000, live = 0, peak = 0;
    const slow: Judge = { jev: async () => { peak = Math.max(peak, ++live); await new Promise((r) => setTimeout(r, 10)); live--; return 0.9; }, haiku: async () => true };
    const s = new Signals({ db, keys, log: () => {}, judge: slow, now: () => now });
    const from = (id: string, user: string, content: string) => ({ ...msg(id, content), author: { id: user } });
    db.prepare("UPDATE discord_mentions SET signal = 0").run();
    const run = async (m: ReturnType<typeof from>) => { handleDispatch(db, keys, "MESSAGE_CREATE", m); s.dispatch("MESSAGE_CREATE", m); };
    for (let i = 0; i < 12; i++) await run(from(`a${i}`, "u9", "review photocraft#1 please"));
    await s.idle();
    const rows = db.prepare("SELECT COUNT(*) AS n FROM discord_mentions WHERE signal = 1").get() as { n: number };
    assert.equal(rows.n, 10, "10 per author per minute; the other two stay plain mentions");
    assert.ok(peak <= 2, `peak concurrent calls ${peak}`);
    // Messages that name nothing, or too many items, use up no limit.
    now += 61_000;
    for (let i = 0; i < 40; i++) await run(from(`n${i}`, "u7", "just chatting"));
    for (let i = 0; i < 40; i++) await run(from(`x${i}`, "u7", "photocraft#1 photocraft#2 photocraft#3 photocraft#4 photocraft#5 photocraft#6"));
    await run(from("b0", "u9", "review photocraft#1"));
    await s.idle();
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM discord_mentions WHERE signal = 1").get() as { n: number }).n, 11, "the window slides");
    await run(from("c0", "u8", "photocraft#1 photocraft#2 photocraft#3 photocraft#4 photocraft#5 photocraft#6 review"));
    await s.idle();
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM discord_mentions WHERE signal = 1").get() as { n: number }).n, 11, "six items: not checked");
  });

  test("a daily cap of 0 makes no Jev or Haiku call", async () => {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run(SIGNAL_CAP_KEY);
    try {
      const jev = calls.jev, haiku = calls.haiku;
      jevP = 0.9; await send("MESSAGE_CREATE", msg("cap1", "please review photocraft#3"));
      assert.equal(calls.jev, jev);
      assert.equal(calls.haiku, haiku);
    } finally {
      db.prepare("DELETE FROM settings WHERE key = ?").run(SIGNAL_CAP_KEY);
    }
  });
});
