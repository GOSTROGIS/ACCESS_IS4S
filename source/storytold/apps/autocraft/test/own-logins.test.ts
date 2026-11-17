// A PR the GitHub App's bot opened counts as ours once its slug is known, whatever the repo's identity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPrFacts } from "../src/core/facts.ts";
import { ownLogins, rememberSlug } from "../src/github/identity.ts";
import { world } from "./world-db.ts";

test("the app's bot is ours on every repo once its slug is known, and stays ours without the secrets", () => {
  const w = world().repo().pr(1, { author: "my-app" }).pr(2, { author: "box" }).pr(3, { author: "stranger" });
  w.db.prepare("INSERT INTO main.settings (key, value) VALUES ('pipeline_login', 'box')").run();
  const mine = () => Object.fromEntries(loadPrFacts(w.db, { appSlug: "my-app" }).map((f) => [f.number, f.authorIsPipeline]));
  assert.deepEqual(mine(), { 1: true, 2: true, 3: false });
  assert.deepEqual([...ownLogins(w.db, "app", "my-app")].sort(), ["box", "my-app", "my-app[bot]"]);
  assert.deepEqual([...ownLogins(w.db, "app", null)], ["box"]);

  // A slug seen once stays ours when the secrets can no longer be read, on repos of either identity.
  rememberSlug(w.db, "my-app");
  w.db.prepare("INSERT INTO main.settings (key, value) VALUES ('github_identity', 'app')").run();
  assert.deepEqual([...ownLogins(w.db, "app", null)].sort(), ["box", "my-app", "my-app[bot]"]);
  assert.deepEqual([...ownLogins(w.db, "other", null)].sort(), ["box", "my-app", "my-app[bot]"]);
});
