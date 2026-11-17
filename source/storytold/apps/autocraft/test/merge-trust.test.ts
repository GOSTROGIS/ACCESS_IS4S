// Merge trust follows the code it covered: an operator's Merge answer does not carry to a head with changed pipeline code, and carried code is held to its source author's tier.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { advancePreapprovals, preapprovalOf } from "../src/preapproval/index.ts";
import { OPERATOR, REGULAR_ID, T0, world, type World } from "./world-db.ts";

let current: World | null = null;
afterEach(() => current?.close());
const kindsOf = (w: World, n: number) => w.prPlan(n).actions.map((a) => a.kind);

test("a Merge answer carries across a base merge that left the diff unchanged, not across a CI fix or a changed-diff merge", () => {
  const w = (current = world().repo().pr(1).review(1, { verdict: "take" }).answer(1, "merge").pr(2).review(2, { verdict: "take" }).answer(2, "merge").pr(3).review(3, { verdict: "take" }).answer(3, "merge"));
  const merge = "INSERT INTO conflict_merges (repo, number, from_head, to_head, state, attempt, created_at, own_diff) VALUES ('app', ?, ?, ?, 'merged', 1, ?, ?)";
  w.db.prepare(merge).run(1, "sha1", "sha1m", T0, "same");
  w.db.prepare(merge).run(2, "sha2", "sha2m", T0, "changed");
  w.db.prepare("INSERT INTO ci_fixes (repo, number, head, to_head, kind, state, attempt, created_at) VALUES ('app', 3, 'sha3', 'sha3c', 'code', 'pushed', 1, ?)").run(T0);
  w.synced(1, "sha1m").synced(2, "sha2m").synced(3, "sha3c");
  advancePreapprovals(w.db);
  assert.equal(preapprovalOf(w.db, "app", 1)?.by, OPERATOR);
  assert.equal(preapprovalOf(w.db, "app", 2), null);
  assert.equal(preapprovalOf(w.db, "app", 3), null);
});

test("code carried from a closed duplicate by an author who is not whitelisted needs a Merge answer at the head", () => {
  const w = (current = world().repo().pr(5).review(5, { verdict: "take" }).verified(5).premerge(5, "clean").pr(6).pr(7, { author: "regular" }).review(7, { verdict: "take" }).verified(7).premerge(7, "clean"));
  w.db.prepare("UPDATE items SET state = 'CLOSED', author = ? WHERE number = 6").run("stranger");
  w.db.prepare("INSERT INTO items (repo, number, kind, state, title, author, author_id, created_at, updated_at) VALUES ('app', 8, 'pr', 'CLOSED', 'PR 8', 'regular', ?, ?, ?)").run(REGULAR_ID, T0, T0);
  const carry = (kept: number, closed: number) => {
    const id = `app:dupegroup:${kept}`;
    w.db.prepare("INSERT INTO dupe_carries (decision_id, repo, number, state, outcome, updated_at) VALUES (?, 'app', ?, 'done', 'pushed', ?)").run(id, kept, T0);
    w.db.prepare("INSERT INTO dupe_group_items (decision_id, repo, number, kind, role, detail, base_role) VALUES (?, 'app', ?, 'pr', 'close', ?, 'close')").run(id, closed, JSON.stringify({ carry: ["the null check"] }));
  };
  carry(5, 6);
  carry(7, 8);
  assert.ok(!kindsOf(w, 5).includes("merge"), kindsOf(w, 5).join());
  assert.ok(kindsOf(w, 5).includes("ask-merge"), kindsOf(w, 5).join());
  assert.ok(kindsOf(w, 7).includes("merge"), kindsOf(w, 7).join());
});
