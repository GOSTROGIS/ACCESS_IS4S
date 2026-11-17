// Discord mention counting: the reference parser, the gateway event handler against a real database, and the public privacy page.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { connect } from "../src/db.ts";
import { loadConfig } from "../src/dash/server/config.ts";
import { defaultRoutes, startServer } from "../src/dash/server/index.ts";
import { FakeProvider } from "../src/dash/server/provider.ts";
import { DiscordKeys } from "../src/discord/keys.ts";
import { parseRefs } from "../src/discord/refs.ts";
import { handleMeta } from "../src/discord/index.ts";
import { setup } from "../src/dash/api/discord.ts";
import { countOf, forgetAuthor, handleDispatch, linksOf } from "../src/discord/store.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "discord-test-"));
const db = connect(join(dir, "d.db"));
const keys = new DiscordKeys("k".repeat(40));
const repos = [{ owner: "storytold", name: "photocraft" }, { owner: "storytold", name: "pdfcraft" }];

after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("reference parser", () => {
  test("counts item URLs and repo#n of tracked repos, each item once", () => {
    const text = "see https://github.com/storytold/photocraft/pull/12#issuecomment-5 and photocraft#12, also pdfcraft#7 and storytold/pdfcraft#8";
    assert.deepEqual(parseRefs(text, repos).map((r) => `${r.repo}#${r.number}`), ["photocraft#12", "pdfcraft#7", "pdfcraft#8"]);
  });
  test("ignores untracked repos, other owners and look-alikes", () => {
    const text = "https://github.com/other/photocraft/issues/3 elsewhere#4 other/pdfcraft#5 xphotocraft#6 photocraft#x";
    assert.deepEqual(parseRefs(text, repos), []);
  });
});

describe("event handler", () => {
  before(() => {
    db.prepare("INSERT OR IGNORE INTO tracked_repos (name) VALUES (?)").run("photocraft");
    db.prepare("INSERT INTO discord_channels (channel_id, guild_id, guild_name, name, watched) VALUES ('c1', 'g1', 'Guild', 'dev', 1), ('c2', 'g1', 'Guild', 'off', 0)").run();
  });
  const msg = (id: string, content: string, channel = "c1") => ({ id, channel_id: channel, guild_id: "g1", content, timestamp: "2026-11-01T10:00:00.000Z", author: { id: "u1" } });

  test("create, edit and delete keep counts right and rows encrypted", () => {
    handleDispatch(db, keys, "MESSAGE_CREATE", msg("m1", "look at photocraft#1 and photocraft#2"));
    handleDispatch(db, keys, "MESSAGE_CREATE", msg("m2", "photocraft#1 again"));
    handleDispatch(db, keys, "MESSAGE_CREATE", msg("m3", "photocraft#1", "c2"));
    assert.equal(countOf(db, "photocraft", 1), 2);
    assert.equal(countOf(db, "photocraft", 2), 1);
    const raw = JSON.stringify(db.prepare("SELECT * FROM discord_mentions").all());
    for (const plain of ["m1", "u1", "c1", "g1", "photocraft#1 again"]) assert.ok(!raw.includes(`"${plain}"`) && !raw.includes(`/${plain}`), `${plain} is stored in the clear`);
    const links = linksOf(db, keys, "photocraft", 2);
    assert.deepEqual(links.map((l) => l.url), ["https://discord.com/channels/g1/c1/m1"]);

    handleDispatch(db, keys, "MESSAGE_UPDATE", msg("m1", "now only photocraft#2"));
    assert.equal(countOf(db, "photocraft", 1), 1);
    assert.equal(countOf(db, "photocraft", 2), 1);
    handleDispatch(db, keys, "MESSAGE_UPDATE", { id: "m2", channel_id: "c1", guild_id: "g1" });  // embed-only update: no content, no change
    assert.equal(countOf(db, "photocraft", 1), 1);

    handleDispatch(db, keys, "MESSAGE_DELETE", { id: "m2", channel_id: "c1" });
    assert.equal(countOf(db, "photocraft", 1), 0);
    handleDispatch(db, keys, "MESSAGE_DELETE_BULK", { ids: ["m1"], channel_id: "c1" });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM discord_mentions").get()!.n, 0);
  });

  test("a deletion request by user id removes that author's rows, also after an edit without an author", () => {
    const columns = (db.prepare("PRAGMA table_info(discord_mentions)").all() as { name: string }[]).map((c) => c.name);
    assert.ok(!columns.some((c) => /author|user/.test(c)), "no per-person plain column");
    handleDispatch(db, keys, "MESSAGE_CREATE", msg("m4", "photocraft#5"));
    handleDispatch(db, keys, "MESSAGE_CREATE", { ...msg("m5", "photocraft#5"), author: { id: "u2" } });
    handleDispatch(db, keys, "MESSAGE_UPDATE", { id: "m4", channel_id: "c1", guild_id: "g1", content: "photocraft#5 edited" });
    assert.equal(forgetAuthor(db, keys, "u1"), 1);
    assert.equal(countOf(db, "photocraft", 5), 1);
  });

  test("a delete applies in an unwatched channel, and a deleted channel takes its rows", () => {
    handleDispatch(db, keys, "MESSAGE_CREATE", msg("m6", "photocraft#6"));
    handleDispatch(db, keys, "MESSAGE_CREATE", msg("m7", "photocraft#6"));
    db.prepare("UPDATE discord_channels SET watched = 0 WHERE channel_id = 'c1'").run();
    handleDispatch(db, keys, "MESSAGE_DELETE", { id: "m6", channel_id: "c1" });
    assert.equal(countOf(db, "photocraft", 6), 1);
    handleDispatch(db, keys, "CHANNEL_DELETE", { id: "c1" });
    assert.equal(countOf(db, "photocraft", 6), 0);
    db.prepare("UPDATE discord_channels SET watched = 1 WHERE channel_id = 'c1'").run();
  });

  test("a thread message counts under its watched parent", () => {
    handleMeta(db, "THREAD_CREATE", { id: "t1", guild_id: "g1", parent_id: "c1", name: "topic" });
    handleDispatch(db, keys, "MESSAGE_CREATE", msg("m8", "photocraft#8", "t1"));
    assert.equal(countOf(db, "photocraft", 8), 1);
    handleMeta(db, "THREAD_CREATE", { id: "t2", guild_id: "g1", parent_id: "c2", name: "other" });
    handleDispatch(db, keys, "MESSAGE_CREATE", msg("m9", "photocraft#9", "t2"));
    assert.equal(countOf(db, "photocraft", 9), 0);
  });
});

describe("admin API", () => {
  test("the Discord page's data is for operators only", async () => {
    const route = (await defaultRoutes()).find((r) => r.method === "GET" && r.pattern === "/api/admin/discord");
    assert.equal(route?.operator, true);
    const viewer = { user: { login: "v", role: "viewer" } } as never;
    const res = await route!.handler(db, viewer);
    assert.equal(res.status, 403);
  });
});

describe("privacy page", () => {
  let close: () => Promise<void>;
  let base = "";
  before(async () => {
    const perms = join(dir, "perms.json");
    writeFileSync(perms, "{}");
    chmodSync(perms, 0o600);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('discord_contact', 'ask-us@example.org')").run();
    const config = loadConfig({ AUTOCRAFT_DEV_AUTH: "1", AUTOCRAFT_LISTEN: "127.0.0.1:0", AUTOCRAFT_DB: join(dir, "d.db"), AUTOCRAFT_DEV_PERMS: perms, AUTOCRAFT_WEB_DIST: dir });
    const s = await startServer({ config, db, provider: new FakeProvider(perms), routes: await defaultRoutes() });
    base = s.url;
    close = s.close;
  });
  after(() => close());

  test("is readable without a session and names the contact; other pages still need one", async () => {
    const r = await fetch(`${base}/privacy`, { headers: { accept: "text/html" } });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /ask-us@example\.org/);
    const terms = await fetch(`${base}/terms`, { headers: { accept: "text/html" } });
    assert.equal(terms.status, 200);
    assert.match(await terms.text(), /terms of use[\s\S]*ask-us@example\.org/i);
    const other = await fetch(`${base}/items`, { headers: { accept: "text/html" }, redirect: "manual" });
    assert.match(await other.text(), /http-equiv="refresh" content="0;url=\/auth\/signin/);
  });
});

describe("channel list order", () => {
  const op = { user: { role: "operator" } } as never;
  const names = () => setup(db, op).channels.filter((c) => c.guildId === "gs").map((c) => `${c.category ?? "-"}/${c.name}`);
  test("lists channels like Discord's sidebar, and follows a channel moved to another category", () => {
    const ch = (id: string, name: string, position: number, parent_id: string | null) => ({ id, name, type: 0, position, parent_id });
    handleMeta(db, "GUILD_CREATE", { id: "gs", name: "Sidebar", channels: [
      ch("s5", "late", 1, "k2"), { id: "k2", name: "Second", type: 4, position: 2 }, ch("s1", "b-free", 1, null), ch("s2", "a-free", 0, null),
      { id: "k1", name: "First", type: 4, position: 1 }, ch("s3", "zed", 0, "k1"), ch("s4", "alpha", 1, "k1"), ch("s6", "early", 0, "k2"),
    ] });
    assert.deepEqual(names(), ["-/a-free", "-/b-free", "First/zed", "First/alpha", "Second/early", "Second/late"]);
    handleMeta(db, "CHANNEL_UPDATE", { id: "s3", guild_id: "gs", name: "zed", type: 0, position: 0, parent_id: "k2" });
    handleMeta(db, "CHANNEL_UPDATE", { id: "k1", guild_id: "gs", name: "First", type: 4, position: 3 });
    assert.deepEqual(names(), ["-/a-free", "-/b-free", "Second/zed", "Second/early", "Second/late", "First/alpha"]);
  });
});
