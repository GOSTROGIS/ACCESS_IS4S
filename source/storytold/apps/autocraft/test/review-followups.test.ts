// The login-to-account binding backfill, and issue references in posted reviews.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { backfillAuthorIds } from "../src/author-ids.ts";
import { connect } from "../src/db.ts";
import { stripLinks } from "../src/review/post-template.ts";
import { tierKey, tiersOf } from "../src/whitelist.ts";
import { SCRATCH } from "./scratch.ts";

test("backfill binds logins with merge history, and a different account under the login is not whitelisted", async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(mkdtempSync(join(SCRATCH, "followups-")), "m.db"));
  const ins = db.prepare("INSERT INTO items (repo, number, kind, state, title, author, created_at, merged_at) VALUES ('r', ?, 'pr', 'MERGED', 't', ?, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')");
  for (let i = 1; i <= 6; i++) ins.run(i, "old-dev");
  const asked: string[] = [];
  // A login whose PRs have no stored id and whose account is gone: bound to the sentinel, so a new holder of the login is another person.
  for (let i = 7; i <= 8; i++) ins.run(i, "gone-dev");
  const client = { spent: 0, remaining: null, async query(q: string, v: Record<string, unknown>) {
    asked.push(q);
    const by = (i: number) => ({ pullRequest: { author: v[`k${i}`] === 1 ? { __typename: "User", databaseId: 42 } : null } });
    return { p0: by(0), p1: by(1) };
  } };
  assert.equal(await backfillAuthorIds(db, client), 2);
  assert.equal(asked.length, 1);
  assert.equal(await backfillAuthorIds(db, client), 0);
  assert.equal(asked.length, 1, "nothing missing: no GitHub call");
  const tier = (id: number) => tiersOf(db, [{ login: "old-dev", id }]).get(tierKey({ login: "old-dev", id }));
  assert.equal(tier(42), "whitelisted");
  assert.equal(tier(7), "not");
  assert.equal(tiersOf(db, [{ login: "gone-dev", id: 5 }]).get(tierKey({ login: "gone-dev", id: 5 })), "not");
});

test("review text keeps code and hex colours, and reads real references as plain numbers", () => {
  assert.equal(stripLinks("fixes #12 and acme/x#34, GH-5"), "fixes issue 12 and issue 34, issue 5");
  assert.equal(stripLinks("colour `#123456` and #12345678 and #1a2b3c"), "colour `#123456` and #12345678 and #1a2b3c");
});
