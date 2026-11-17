// Decision alerts by direct message: opt-in and out, who gets a message, what a press does for whom, and how answers edit the messages.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { useTestAccount } from "./accounts-fixture.ts";
import { SCRATCH } from "./scratch.ts";
import { decisionStamp } from "../src/conversations/cards.ts";
import { writeChoices } from "../src/decide/choices.ts";
import { connect } from "../src/db.ts";
import { ask, getDecision } from "../src/decisions.ts";
import { DecisionAlerts, coreId, installAlertCommands, type DmRest } from "../src/discord/alerts.ts";
import { installAccountCommands } from "../src/discord/commands.ts";
import { Interactions } from "../src/discord/interactions.ts";
import { DiscordKeys } from "../src/discord/keys.ts";
import { createLinkCode, redeemLinkCode } from "../src/discord/links.ts";
import type { EditBody, MessageBody } from "../src/discord/rest.ts";
import { setMaintainerWrites } from "../src/settlers.ts";

mkdirSync(SCRATCH, { recursive: true });

class FakeRest implements DmRest {
  sent: { channelId: string; id: string; body: MessageBody }[] = [];
  edited: { channelId: string; id: string; body: EditBody }[] = [];
  responses: string[] = [];
  bodies: EditBody[] = [];
  async createDm(userId: string) { return { id: `dm-${userId}` }; }
  async createMessage(channelId: string, body: MessageBody) { const id = `m${this.sent.length + 1}`; this.sent.push({ channelId, id, body }); return { id }; }
  async editMessage(channelId: string, id: string, body: EditBody) { this.edited.push({ channelId, id, body }); }
  async deleteMessage() {}
  async interactionCallback() {}
  async editInteractionResponse(_a: string, _t: string, body: EditBody) { this.responses.push(body.content ?? ""); this.bodies.push(body); }
  async overwriteGuildCommands() {}
}

test("alerts: opt-in, a new decision reaches only people who may settle it, a press runs as the presser, an answer edits the messages", async () => {
  const T0 = "2026-01-01T00:00:00Z";
  const db = connect(join(mkdtempSync(join(SCRATCH, "discord-alerts-")), "t.db"));
  useTestAccount(db);
  db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(T0);
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('app', 'public')").run();
  const item = db.prepare(`INSERT INTO items (repo, number, kind, state, title, body, author, head_oid, created_at, updated_at, labels) VALUES ('app', ?, 'pr', 'OPEN', ?, 'Body', 'someone', 'sha', '${T0}', '${T0}', '[]')`);
  for (const n of [2, 3, 4, 5]) item.run(n, `PR ${n}`);
  for (const [login, role] of [["op", "operator"], ["mia", "maintainer"], ["vi", "viewer"]]) db.prepare("INSERT INTO access (login, role) VALUES (?, ?)").run(login, role);
  // Mia may settle while maintainer writes are on, the app acts for her on the repo and her write permission is fresh.
  setMaintainerWrites(db, true);
  db.prepare("INSERT INTO settings (key, value) VALUES ('github_identity', 'app')").run();
  // The permission was read by a dashboard visit over a day ago: the alert pass reads it again from GitHub, once.
  db.prepare("INSERT INTO repo_permissions (login, repo, permission, checked_at) VALUES ('mia', 'app', 'write', ?)").run(new Date(Date.now() - 30 * 3_600_000).toISOString());
  const reads: string[] = [];

  const keys = new DiscordKeys("k".repeat(40));
  const rest = new FakeRest();
  const logs: string[] = [];
  const act = { querier: { query: async () => ({}) } as never, exec: (async () => ({ code: 0, stdout: "", stderr: "" })) as never };
  const mk = (perHour?: number) => new DecisionAlerts({
    db, keys, rest, log: (l) => logs.push(l), baseUrl: "https://ac.example", perHour, act, readPermission: async (repo, login) => { reads.push(`${login}@${repo}`); return "write"; },
    userFor: (login, role) => ({ login, role, canWrite: async () => role !== "viewer", canRead: async () => true }),
  });
  const alerts = mk();
  const ix = new Interactions(rest, (l) => logs.push(l));
  installAccountCommands(ix, { db, keys });
  installAlertCommands(ix, alerts);

  const run = async (userId: string, data: Record<string, unknown>): Promise<string> => {
    const before = rest.responses.length;
    ix.dispatch("INTERACTION_CREATE", { id: "i", token: "t", type: data.custom_id ? 3 : 2, application_id: "a1", user: { id: userId }, data });
    for (let i = 0; i < 200 && rest.responses.length === before; i++) await new Promise((r) => setTimeout(r, 5));
    return rest.responses.at(-1) ?? "";
  };
  const alertsCmd = (userId: string, state: string) => run(userId, { name: "autocraft", options: [{ type: 1, name: "alerts", options: [{ type: 3, name: "state", value: state }] }] });
  for (const [login, id] of [["op", "1"], ["mia", "2"], ["vi", "3"]]) redeemLinkCode(db, keys, createLinkCode(db, keys, login!).code, id!);

  assert.match(await alertsCmd("9", "on"), /Link your account/);
  assert.match(await alertsCmd("3", "on"), /may not settle/);
  assert.match(await alertsCmd("1", "on"), /Alerts are on/);
  assert.match(await alertsCmd("2", "on"), /Alerts are on/);
  await alerts.sync();

  // A new decision: both people who may settle it get a message, the viewer none. Choices are not prepared yet: only the link.
  ask(db, [{ id: "app#2:merge", kind: "merge", repo: "app", number: 2, question: "Merge PR 2?", options: [{ key: "merge", label: "Merge" }, { key: "hold", label: "Hold" }] }]);
  await alerts.sync();
  assert.deepEqual(rest.sent.map((m) => m.channelId).sort(), ["dm-1", "dm-2"]);
  assert.deepEqual(reads, ["mia@app"]);
  assert.ok(Date.now() - Date.parse((db.prepare("SELECT checked_at FROM repo_permissions WHERE login = 'mia'").get() as { checked_at: string }).checked_at) < 60_000);
  const comps = (m: { components?: unknown[] }) => (m.components as { components: { custom_id?: string; url?: string }[] }[]).flatMap((r) => r.components);
  assert.deepEqual(comps(rest.sent[0]!.body).map((c) => c.url), ["https://ac.example/items/app/2#decision-app%232%3Amerge"]);

  // Prepared: the buttons are edited in, one per core choice, then the link.
  const d = getDecision(db, "app#2:merge")!;
  const row = writeChoices(db, { decisionId: d.id, repo: "app", number: 2, turnId: null, stamp: decisionStamp(db, d), seen: { head: "sha", lastComment: null }, source: "prepare", drafts: {}, added: [], pick: { core: "o:hold", reason: "Wait for CI." } });
  await alerts.sync();
  assert.equal(rest.edited.length, 2);
  const edit = rest.edited.find((e) => e.channelId === "dm-1")!;
  assert.deepEqual(comps(edit.body).map((c) => c.custom_id ?? "link"), [`dc:${row.id}:${coreId("o:merge")}`, `dc:${row.id}:${coreId("o:hold")}`, `dc:${row.id}:${coreId("backlog")}`, "link"]);
  assert.match(edit.body.content ?? "", /Opus: Wait for CI/);

  // A core that writes to GitHub asks for a second press and names what it will do; a stale or unknown key is refused.
  const hold = `dc:${row.id}:${coreId("o:hold")}`;
  assert.match(await run("1", { custom_id: `dc:${row.id}:${coreId("o:merge")}` }), /Merge: merge/);
  assert.deepEqual(comps(rest.bodies.at(-1)!).map((c) => c.custom_id), [`dcc:${row.id}:${coreId("o:merge")}`]);
  assert.equal(getDecision(db, "app#2:merge")!.answer, null);
  assert.match(await run("1", { custom_id: `dc:${row.id}:${coreId("x:close:completed")}` }), /replaced by newer choices/);

  // Mia loses the right to settle: her message becomes "No longer available", her press is refused with the dashboard's error.
  setMaintainerWrites(db, false);
  await alerts.sync();
  const gone = rest.edited.at(-1)!;
  assert.equal(gone.channelId, "dm-2");
  assert.equal(gone.body.content, "No longer available");
  assert.match(await run("2", { custom_id: hold }), /only an operator/);
  assert.equal(getDecision(db, d.id)!.answer, null);

  // Op presses Hold (no write: one press): the decision is answered with op's login, and the message loses its buttons.
  assert.match(await run("1", { custom_id: hold }), /Done: Hold/);
  assert.equal(getDecision(db, d.id)!.answer, "hold");
  assert.equal(getDecision(db, d.id)!.answered_by, "op");
  await alerts.sync();
  const last = rest.edited.at(-1)!;
  assert.equal(last.channelId, "dm-1");
  assert.deepEqual(last.body.components, []);
  assert.match(last.body.content ?? "", /Answered by op: Hold/);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM discord_alert_msgs").get() as { n: number }).n, 0);

  // Over the hourly limit the new questions come as one summary message.
  const limited = mk(1);
  ask(db, [3, 4].map((n) => ({ id: `app#${n}:merge`, kind: "merge", repo: "app", number: n, question: `Merge PR ${n}?`, options: [{ key: "merge", label: "Merge" }, { key: "hold", label: "Hold" }] })));
  const before = rest.sent.length;
  await limited.sync();
  const fresh = rest.sent.slice(before).filter((m) => m.channelId === "dm-1");
  assert.equal(fresh.length, 2, "one message, then one summary");
  assert.match(fresh[1]!.body.content ?? "", /^1 new question/);
  // Only one summary an hour.
  ask(db, [{ id: "app#5:merge", kind: "merge", repo: "app", number: 5, question: "Again?", options: [{ key: "merge", label: "Merge" }, { key: "hold", label: "Hold" }] }]);
  const n = rest.sent.length;
  await limited.sync();
  assert.equal(rest.sent.length, n);

  // Off: the account's rows are gone.
  assert.match(await alertsCmd("1", "off"), /off/);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM discord_alerts WHERE user_hash = ?").get(keys.hash("author", "1")) as { n: number }).n, 0);
  assert.deepEqual(logs, []);
});
