// The bot reacts once to a message it newly records against items, and only while the operators' switch is on.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { connect } from "../src/db.ts";
import { DiscordKeys } from "../src/discord/keys.ts";
import { dispatcher } from "../src/discord/index.ts";
import { Reactor } from "../src/discord/react.ts";
import { RestError } from "../src/discord/rest.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "discord-react-"));
const db = connect(join(dir, "d.db"));
after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

test("one reaction per newly recorded message", async () => {
  db.prepare("INSERT OR IGNORE INTO tracked_repos (name) VALUES (?)").run("photocraft");
  db.prepare("INSERT INTO discord_channels (channel_id, guild_id, watched) VALUES ('c1', 'g1', 1), ('c2', 'g1', 0)").run();
  const calls: string[][] = [];
  let fail: RestError | null = null;
  const logs: string[] = [];
  const rest = { addReaction: async (...a: string[]) => { calls.push(a); if (fail) throw fail; } };
  const dispatch = dispatcher(db, new DiscordKeys("k".repeat(40)), { dispatch() {} } as never, { dispatch() {} } as never, undefined, new Reactor({ db, rest, log: (l) => logs.push(l) }));
  const msg = (id: string, content: string, channel = "c1") => ({ id, channel_id: channel, guild_id: "g1", content, timestamp: "2026-01-01T00:00:00Z", author: { id: "u1" } });
  const settle = () => new Promise((r) => setTimeout(r, 5));

  dispatch("MESSAGE_CREATE", msg("m1", "see photocraft#1"));
  dispatch("MESSAGE_UPDATE", msg("m1", "see photocraft#1 (edited)"));
  dispatch("MESSAGE_CREATE", msg("m2", "no items here"));
  dispatch("MESSAGE_CREATE", msg("m3", "photocraft#1", "c2"));
  await settle();
  assert.deepEqual(calls, [["c1", "m1", "✅"]]);

  db.prepare("INSERT INTO settings (key, value) VALUES ('discord_react', 'off')").run();
  dispatch("MESSAGE_CREATE", msg("m4", "photocraft#2"));
  await settle();
  assert.equal(calls.length, 1);

  db.prepare("UPDATE settings SET value = 'on' WHERE key = 'discord_react'").run();
  fail = new RestError(403, "forbidden");
  dispatch("MESSAGE_CREATE", msg("m5", "photocraft#3"));
  dispatch("MESSAGE_CREATE", msg("m6", "photocraft#4"));
  await settle();
  assert.equal(logs.length, 1);
});
