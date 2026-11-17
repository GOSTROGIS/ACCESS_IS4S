// A post-merge defect on a test repo holds merges on that repo only; on any other repo it stops merging everywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "../src/db.ts";
import { activeTrips, mergeDefect, resumeStage } from "../src/push-outcomes.ts";

test("a test repo's post-merge defect trips its own merge breaker, not the pipeline's", () => {
  const db = connect(":memory:");
  const merged = db.prepare("INSERT INTO merges (repo, number, head_oid, run_id, at, path, method, outcome) VALUES (?, 1, 'h', 'm', '2026-01-01T00:00:00Z', 'operator', 'squash', 'merged')");
  merged.run("sandbox");
  merged.run("real");
  db.prepare("INSERT INTO settings (key, value) VALUES ('test_repo:sandbox', '1')").run();
  mergeDefect(db, "sandbox", 1, 1, "2026-01-01T00:10:00Z");
  assert.deepEqual(Object.keys(activeTrips(db)), ["merge:sandbox"]);
  resumeStage(db, "merge:sandbox", "op");
  mergeDefect(db, "real", 1, 1, "2026-01-01T00:20:00Z");
  assert.deepEqual(Object.keys(activeTrips(db)), ["merge"]);
});
