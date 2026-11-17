// Opening a database that still holds the first-pass review's leftovers removes the cross-check table, the batch-size
// settings and the review-batch limit, and leaves the old reviews table alone.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { SCRATCH } from "./scratch.ts";

const { connect } = await import("../src/db.ts");

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "review-migration-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const exists = (db: ReturnType<typeof connect>, name: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

test("the first-pass review's leftovers are removed once and never come back", () => {
  const path = join(dir, "m.db");
  const db = connect(path);
  assert.equal(exists(db, "reviews"), false, "a new database has no reviews table");
  assert.equal(db.prepare("SELECT 1 FROM stage_limits WHERE step = 'review-batch'").get(), undefined, "a new database has no review-batch limit");
  db.exec("CREATE TABLE review_crosschecks (run_id TEXT)");
  db.exec("CREATE TABLE reviews (repo TEXT, verdict TEXT)");
  db.exec("INSERT INTO reviews VALUES ('app', 'take')");
  db.prepare("INSERT INTO settings (key, value) VALUES ('review_batch_size:app', '5'), ('review_batch_size:other', '8'), ('merge_batch_size:app', '3')").run();
  db.prepare("INSERT INTO stage_limits (step, per_day) VALUES ('review-batch', 40)").run();
  db.close();

  for (let i = 0; i < 2; i++) {
    const again = connect(path);
    assert.equal(exists(again, "review_crosschecks"), false);
    assert.equal(again.prepare("SELECT 1 FROM settings WHERE key LIKE 'review\\_batch\\_size:%' ESCAPE '\\'").get(), undefined);
    assert.ok(again.prepare("SELECT 1 FROM settings WHERE key = 'merge_batch_size:app'").get(), "other settings stay");
    assert.equal(again.prepare("SELECT 1 FROM stage_limits WHERE step = 'review-batch'").get(), undefined);
    assert.equal((again.prepare("SELECT COUNT(*) AS n FROM reviews").get() as { n: number }).n, 1, "the old table is kept untouched");
    again.close();
  }
});
