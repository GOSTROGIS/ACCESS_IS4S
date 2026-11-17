import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { baseRefusal } from "../src/merge/base.ts";
import { cachedDiff, diffCacheDir, type DiffFetcher } from "../src/review/diff.ts";
import { decidePr } from "../src/core/decide.ts";
import { authorWrites, ensureAuthorWrites } from "../src/fixup/author-permission.ts";
import { prFacts } from "./world.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "base-binding-"));
process.env.AUTOCRAFT_DIFF_CACHE = join(dir, "diffs");
const HEAD = "a".repeat(40);

test("a merge is refused when the base is not the one the review read", () => {
  const db = connect(join(dir, "t.db"));
  db.prepare("INSERT INTO repos (name, default_branch) VALUES ('app', 'main')").run();
  db.prepare("INSERT INTO opus_reviews (repo, number, head_oid, at, mode, verdict, base_ref) VALUES ('app', 7, ?, 't', 'full', 'take', 'main')").run(HEAD);
  assert.equal(baseRefusal(db, "app", HEAD, 7, "main"), null);
  assert.match(baseRefusal(db, "app", HEAD, 7, "release")!, /release.*main/);
  // A review that recorded no base allows the default branch only.
  db.prepare("INSERT INTO opus_reviews (repo, number, head_oid, at, mode, verdict) VALUES ('app', 8, ?, 't', 'full', 'take')").run(HEAD);
  assert.equal(baseRefusal(db, "app", HEAD, 8, "main"), null);
  assert.ok(baseRefusal(db, "app", HEAD, 8, "release"));
});

test("a diff is stored only for the head it was fetched at, and read again for another base", async () => {
  let calls = 0;
  const moved: DiffFetcher = async () => { calls++; return { ok: false, tooLarge: false, error: "head moved" }; };
  assert.equal((await cachedDiff("app", 7, HEAD, moved)).ok, false);
  assert.equal(existsSync(join(diffCacheDir(), "app", `7-${HEAD}.diff`)), false);
  const at = (base: string): DiffFetcher => async () => { calls++; return { ok: true, text: `diff against ${base}`, base }; };
  assert.equal((await cachedDiff("app", 7, HEAD, at("main"), "main") as { text: string }).text, "diff against main");
  assert.equal((await cachedDiff("app", 7, HEAD, at("main"), "main") as { text: string }).text, "diff against main");
  assert.equal(calls, 2);
  assert.equal((await cachedDiff("app", 7, HEAD, at("release"), "release") as { text: string }).text, "diff against release");
  assert.equal(calls, 3);
});

test("a private-org member's PR is pushable once the author's permission is read, and is waiting before", async () => {
  const db = connect(join(dir, "perm.db"));
  db.prepare("INSERT INTO repos (name, default_branch) VALUES ('app', 'main')").run();
  db.prepare("INSERT INTO items (repo, number, kind, state, author, author_association, head_repo, head_ref) VALUES ('app', 9, 'pr', 'OPEN', 'ana', 'CONTRIBUTOR', 'storytold/app', 'ana/fix')").run();
  assert.equal(authorWrites(db, "app", 9), "unknown");
  let reads = 0;
  const read = async (_repo: string, login: string) => { reads++; return login === "ana" ? "write" : "read"; };
  assert.equal(await ensureAuthorWrites(db, "app", 9, "storytold/app", read), "yes");
  assert.equal(await ensureAuthorWrites(db, "app", 9, "storytold/app", read), "yes");
  assert.equal(reads, 1);
  // An entry over a day old is read again.
  db.prepare("UPDATE author_permissions SET checked_at = '2020-01-01T00:00:00.000Z'").run();
  await ensureAuthorWrites(db, "app", 9, "storytold/app", async () => "read");
  assert.equal(authorWrites(db, "app", 9), "no");
  // An author whose permission cannot be read waits, then counts as unable to write after three failed reads.
  db.prepare("INSERT INTO items (repo, number, kind, state, author, head_repo, head_ref) VALUES ('app', 10, 'pr', 'OPEN', 'bo', 'storytold/app', 'bo/x')").run();
  for (const want of ["unknown", "unknown", "no"]) assert.equal(await ensureAuthorWrites(db, "app", 10, "storytold/app", async () => null), want);
});

test("a PR aimed at a non-default branch is planned as a single merge only", () => {
  const plan = decidePr(prFacts({ baseOffDefault: true }));
  const merge = plan.actions.find((a) => a.kind === "merge");
  assert.ok(merge);
  assert.equal(merge.params?.singleOnly, true);
  assert.equal(merge.params?.batchable, false);
});

test("a PR stacked on another open PR's branch needs a decision", () => {
  const plan = decidePr(prFacts({ stackedOn: 4, baseOffDefault: true }));
  assert.equal(plan.state, "needs-decision");
  assert.ok(plan.reasons.some((r) => /targets the branch of open #4/.test(r)));
});
