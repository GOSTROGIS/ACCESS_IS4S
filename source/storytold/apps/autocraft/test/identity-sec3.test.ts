// A whitelist tier belongs to a GitHub account and the pipeline's own tier to heads it pushed; removing an operator ends what acts as them.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { addLogin, removeLogin, setRole } from "../src/access.ts";
import { backfillAuthorIds } from "../src/author-ids.ts";
import { loadPrFact } from "../src/core/facts.ts";
import { connect } from "../src/db.ts";
import { createLink, openLinks } from "../src/dash/server/github-setup.ts";
import { writeItemNode } from "../src/mirror.ts";
import { contributors, isWhitelisted, setOverride, tierKey, tiersOf } from "../src/whitelist.ts";
import { SCRATCH } from "./scratch.ts";
import { T0, world, type World } from "./world-db.ts";

let current: World | null = null;
afterEach(() => current?.close());

const fresh = () => {
  mkdirSync(SCRATCH, { recursive: true });
  return connect(join(mkdtempSync(join(SCRATCH, "identity-")), "m.db"));
};
const issue = (number: number, login: string, id: number) => ({
  __typename: "Issue", number, state: "OPEN", title: "t", body: "", url: `https://github.com/storytold/r/issues/${number}`,
  author: { __typename: "User", login, databaseId: id }, authorAssociation: "NONE", createdAt: T0, updatedAt: T0, closedAt: null, stateReason: null, repository: { name: "r", owner: { login: "storytold" } },
});

test("history and an allow count only for their own account, and the pipeline's own PR only at a head it pushed", async () => {
  const db = fresh();
  const tier = (login: string, id: number | null) => tiersOf(db, [{ login, id }]).get(tierKey({ login, id }));
  const ins = db.prepare("INSERT INTO items (repo, number, kind, state, title, author, created_at, merged_at) VALUES ('r', ?, 'pr', 'MERGED', 't', ?, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')");
  for (let i = 1; i <= 6; i++) ins.run(i, "old-dev");
  // A new holder of the login writes an issue before the history is bound: no binding, and no tier for anyone while unbound.
  writeItemNode(db, "r", issue(50, "old-dev", 999));
  assert.deepEqual(db.prepare("SELECT id FROM author_ids WHERE login = 'old-dev'").all(), []);
  assert.equal(tier("old-dev", 999), "not");
  const client = { spent: 0, remaining: null, async query() { return { p0: { pullRequest: { author: { __typename: "User", databaseId: 42 } } } }; } };
  await backfillAuthorIds(db, client);
  assert.equal(tier("old-dev", 42), "whitelisted");
  assert.equal(tier("old-dev", 999), "not");
  assert.equal(isWhitelisted(db, "old-dev", 999).ok, false);
  // An allow given to account 42 under "alice" does not pass to account 999 under the same login; a deny holds in any letter case.
  setOverride(db, "alice", "allow", null, "op", 42);
  writeItemNode(db, "r", issue(51, "alice", 999));
  assert.equal(tier("alice", 999), "not");
  assert.equal(tier("alice", 42), "allow");
  assert.equal(isWhitelisted(db, "alice", 999).ok, false);
  const shown = contributors(db, { login: "alice" })[0]!;
  assert.deepEqual([shown.override, shown.override_in_effect, shown.tier], ["allow", false, "not"]);
  setOverride(db, "Old-Dev", "deny", null, "op", 42);
  assert.equal(tier("old-dev", 42), "deny");

  const w = (current = world().repo());
  w.db.prepare("INSERT INTO settings (key, value) VALUES ('pipeline_login', 'pipeline-bot')").run();
  w.pr(9, { author: "pipeline-bot", head: "a".repeat(40) }).review(9, { verdict: "take", head: "a".repeat(40) });
  w.db.prepare("INSERT INTO fix_attempts (repo, number, main_sha, text_hash, state, created_at, updated_at, pr_url) VALUES ('app', 3, 'm', 'h', 'pr-opened', ?, ?, 'https://github.com/storytold/app/pull/9')").run(T0, T0);
  const prTier = () => loadPrFact(w.db, "app", 9)?.tier;
  assert.equal(prTier(), "not", "no record that the pipeline pushed this head");
  w.db.prepare("INSERT INTO own_commits (repo, sha, action, at) VALUES ('app', ?, 'fixissue-push', ?)").run("a".repeat(40), T0);
  assert.equal(prTier(), "whitelisted");
  w.synced(9, "b".repeat(40));
  assert.equal(prTier(), "not", "someone else pushed to the branch");
  w.db.prepare("INSERT INTO fixups (repo, number, from_head, to_head, state, attempt, created_at) VALUES ('app', 9, ?, ?, 'pushed', 1, ?)").run("a".repeat(40), "c".repeat(40), T0);
  w.synced(9, "c".repeat(40));
  assert.equal(prTier(), "whitelisted", "our own fix-up of our commit");
});

test("removing or demoting an operator in any letter case ends their Discord link and their org setup links", () => {
  const db = fresh();
  addLogin(db, "cli", "Owner", "operator", null);
  addLogin(db, "cli", "Bob", "operator", null);
  addLogin(db, "cli", "Ann", "operator", null);
  db.prepare("INSERT INTO discord_links (user_hash, login, linked_at) VALUES ('u1', 'Bob', ?)").run(T0);
  db.prepare("INSERT INTO discord_link_codes (code_hash, login, expires_at) VALUES ('c1', 'Bob', '2099-01-01T00:00:00Z')").run();
  createLink(db, "Bob", "real-org");
  createLink(db, "Ann", "real-org");
  createLink(db, "Owner", "real-org");
  assert.equal(openLinks(db).length, 3);
  removeLogin(db, "cli", "bob");
  setRole(db, "cli", "ann", "viewer");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM discord_links").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM discord_link_codes").get() as { n: number }).n, 0);
  assert.deepEqual(openLinks(db).map((l) => l.createdBy), ["Owner"]);
  // A link whose creator lost the role by any other path stops working too.
  db.prepare("UPDATE access SET role = 'maintainer' WHERE login = 'Owner'").run();
  assert.deepEqual(openLinks(db), []);
});
