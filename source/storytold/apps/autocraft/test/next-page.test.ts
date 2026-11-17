// The Next page lists a step's items in the order the autopilot's selection takes them, and says why a step cannot run.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { connect } from "../src/db.ts";
import { plannedItems } from "../src/core/select-items.ts";
import { nextPage } from "../src/dash/api/next.ts";
import { detectAutopilot, INPUT_TOPICS, LANE_KINDS, LANES, NO_ITEM_LANES, setEnabled, setLimit } from "../src/runner/autopilot.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "next-page-"));
const T0 = "2026-01-01T00:00:00Z";

describe("Next page", () => {
  const db = connect(join(dir, "t.db"));
  db.prepare("INSERT INTO tracked_repos (name, pipeline) VALUES ('app', 1)").run();
  db.prepare("INSERT INTO tracked_repos (name, pipeline) VALUES ('secret', 1)").run();
  const add = db.prepare(`INSERT INTO items (repo, number, kind, state, title, body, is_draft, created_at, updated_at) VALUES (?, ?, 'issue', 'OPEN', ?, 'b', 0, '${T0}', '${T0}')`);
  for (const n of [3, 1, 2]) add.run("app", n, `issue ${n}`);
  add.run("secret", 9, "hidden");
  setEnabled(db, true, "op");

  test("a lane lists its items in the planner's order, without hidden repos", async () => {
    await detectAutopilot(db);
    const want = plannedItems(db, "embed").filter((p) => p.facts.repo === "app").map((p) => p.facts.number);
    assert.equal(want.length, 3);
    const page = await nextPage(db, ["app"]);
    const embed = page.steps.find((s) => s.lane === "embed")!;
    assert.deepEqual(embed.items.map((i) => i.number), want);
    assert.deepEqual([embed.canRun, embed.kind], [true, "ok"]);
    assert.equal(embed.items[0]!.title, `issue ${want[0]}`);
  });

  test("a step with a zero daily limit says so", async () => {
    setLimit(db, "embed", { perDay: 0 }, "op");
    const embed = (await nextPage(db, ["app"])).steps.find((s) => s.lane === "embed")!;
    assert.deepEqual([embed.canRun, embed.kind], [false, "limit"]);
    assert.equal(embed.why, "The daily limit is 0");
  });

  test("storing the lists is not planner input", async () => {
    const seqs = () => db.prepare("SELECT topic, seq FROM change_seq").all() as { topic: string; seq: number }[];
    const before = seqs();
    db.prepare("INSERT OR REPLACE INTO lane_next (lane, total, items, at) VALUES ('x', 0, '[]', 'now')").run();
    db.prepare("DELETE FROM lane_next WHERE lane = 'x'").run();
    const moved = seqs().filter((s) => s.seq !== (before.find((b) => b.topic === s.topic)?.seq ?? 0)).map((s) => s.topic);
    assert.deepEqual(moved.filter((t) => INPUT_TOPICS.includes(t as never)), [], "lane_next must sit under an excluded topic");
    assert.ok(moved.includes("plans"));
  });

  test("every lane lists its items or is declared without any", () => {
    const missing = LANES.map((l) => l.name).filter((n) => !LANE_KINDS[n] && !NO_ITEM_LANES.includes(n));
    assert.deepEqual(missing, [], "add the lane to LANE_KINDS or NO_ITEM_LANES");
    assert.deepEqual(NO_ITEM_LANES.filter((n) => LANE_KINDS[n] || !LANES.some((l) => l.name === n)), []);
  });
});
