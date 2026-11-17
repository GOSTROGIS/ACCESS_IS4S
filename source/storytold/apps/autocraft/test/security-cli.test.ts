// The security CLI acts only on test repos as operators.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { addLogin } from "../src/access.ts";
import { connect } from "../src/db.ts";
import { setTestRepo } from "../src/decisions.ts";
import { requireSessionOperator } from "../src/security/cli.ts";
import { SCRATCH } from "./scratch.ts";

test("the session refuses a repo that is not a test repo and a login that is not an operator", () => {
  const db = connect(join(SCRATCH, "cli.db"));
  db.prepare("INSERT OR IGNORE INTO main.tracked_repos (name, added_by, added_at) VALUES ('repo1', 'cli', 'x')").run();
  addLogin(db, "cli", "op1", "operator", null);
  addLogin(db, "cli", "view1", "viewer", null);
  assert.throws(() => requireSessionOperator(db, "repo1", "op1"), /not marked as a test repo/);
  setTestRepo(db, "cli", "repo1", true);
  assert.throws(() => requireSessionOperator(db, "repo1", "view1"), /not an operator/);
  assert.equal(requireSessionOperator(db, "repo1", "op1"), "op1");
});
