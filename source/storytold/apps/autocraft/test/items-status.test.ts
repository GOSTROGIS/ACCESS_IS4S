import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "../src/db.ts";
import { statusList } from "../src/dash/api/items.ts";
import type { Req } from "../src/dash/types.ts";

test("the status list counts every phase, filters by one, and gives an item without a plan its own status", async () => {
  const db = connect(":memory:");
  const add = db.prepare("INSERT INTO items (repo, number, kind, state, title, updated_at, merged_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  add.run("app", 1, "pr", "OPEN", "Planned", "2026-01-03", null);
  add.run("app", 2, "issue", "OPEN", "No plan", "2026-01-02", null);
  add.run("app", 3, "pr", "MERGED", "Done", "2026-01-01", "2026-01-01");
  db.prepare("INSERT INTO item_plans (repo, number, kind, state, actions, reasons, view, planned_at) VALUES ('app', 1, 'pr', 'needs-fix-up', '[]', '[]', ?, 'x')")
    .run(JSON.stringify({ status: { phase: "Fixing", waiting: null, next: "Fix-up", since: "2026-01-03" } }));
  const req = (q: string) => ({ query: new URLSearchParams(q), user: { role: "operator", login: "o", canRead: async () => true } }) as unknown as Req;
  const all = await statusList(db, req(""));
  assert.equal(all.total, 3);
  assert.deepEqual(all.rows.map((r) => r.status.phase), ["Fixing", "Triage", "Merged"]);
  const fixing = await statusList(db, req("phase=Fixing"));
  assert.deepEqual(fixing.rows.map((r) => r.number), [1]);
  assert.equal(fixing.total, 3);
  assert.equal(fixing.byPhase.Triage, 1);
  const page = await statusList(db, req("limit=2"));
  assert.equal(page.rows.length, 2);
  assert.deepEqual((await statusList(db, req(`limit=2&cursor=${encodeURIComponent(page.nextCursor!)}`))).rows.map((r) => r.number), [3]);
});
