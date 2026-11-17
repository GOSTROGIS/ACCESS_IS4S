import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { BUILD_FEATURES, featureOn, featureStates, setFeature } from "../src/build/features.ts";
import { INPUT_TOPICS } from "../src/runner/autopilot.ts";
import { readSeqs } from "../src/live.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const fresh = () => connect(join(mkdtempSync(join(SCRATCH, "bf-")), "t.db"));

test("every feature is off until switched on", () => {
  const db = fresh();
  for (const f of BUILD_FEATURES) assert.equal(featureOn(db, f, "app"), false);
  assert.ok(featureStates(db).every((s) => !s.on && s.repos.length === 0));
});

test("a repo-scoped feature needs the global switch and the repo's own; scan-tests ignores the repo", () => {
  const db = fresh();
  setFeature(db, "screenshots", true, "op", "app");
  assert.equal(featureOn(db, "screenshots", "app"), false, "repo on, global off");
  setFeature(db, "screenshots", true, "op");
  assert.equal(featureOn(db, "screenshots", "app"), true);
  assert.equal(featureOn(db, "screenshots", "other"), false);
  assert.equal(featureOn(db, "screenshots"), true);
  assert.deepEqual(featureStates(db).find((s) => s.feature === "screenshots"), { feature: "screenshots", on: true, repos: ["app"] });
  setFeature(db, "scan-tests", true, "op", "app");
  assert.equal(featureOn(db, "scan-tests", "other"), true);
  const row = db.prepare("SELECT login, target, details FROM audit WHERE action = 'build-feature' ORDER BY rowid LIMIT 1").get() as { login: string; target: string; details: string };
  assert.deepEqual([row.login, row.target, JSON.parse(row.details)], ["op", "screenshots", { feature: "screenshots", on: true, repo: "app" }]);
});

test("a switch change is not planner input", () => {
  const db = fresh();
  assert.ok(!INPUT_TOPICS.includes("build-features" as never));
  const before = readSeqs(db);
  setFeature(db, "nightly", true, "op");
  const after = readSeqs(db);
  assert.equal(after["build-features"], (before["build-features"] ?? 0) + 1);
  assert.equal(after.settings, before.settings);
});
