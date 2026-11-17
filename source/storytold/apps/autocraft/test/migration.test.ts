// A database made by the first release (test/fixtures/oldest-schema.sql) opens with the current code: tables and columns
// added since appear, dropped columns go, stored rows survive, and opening it again changes nothing.
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { tmpdir } from "./world-db.ts";

const cols = (db: DatabaseSync, table: string): string[] => (db.prepare(`PRAGMA main.table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

test("the first release's database migrates in place and keeps its rows", () => {
  const path = join(tmpdir("migration"), "old.db");
  const old = new DatabaseSync(path);
  old.exec(readFileSync(new URL("./fixtures/oldest-schema.sql", import.meta.url), "utf8"));
  old.prepare("INSERT INTO items (repo, number, kind, state, title, body, author, created_at, updated_at) VALUES ('app', 1, 'pr', 'OPEN', 'Fix the crash', 'a body about wombats', 'alice', 'a', 'a')").run();
  old.prepare("INSERT INTO classifications (repo, number, classifier, run_id, at, type_label, topics, area, flags) VALUES ('app', 1, 'haiku', 'r', 'a', 'bugfix', '1', 'ui', '[]')").run();
  old.prepare("INSERT INTO comments (repo, number, id, kind, author, created_at, body) VALUES ('app', 1, 'c1', 'comment', 'bob', 'a', 'looks good')").run();
  old.close();

  const db = connect(path);
  assert.ok(cols(db, "items").includes("head_oid"), "items gained the head column");
  assert.ok(cols(db, "comments").includes("author_association"));
  assert.ok(!cols(db, "classifications").includes("topics") && !cols(db, "classifications").includes("area"), "dropped columns are gone");
  assert.ok(cols(db, "tracked_repos").includes("pipeline"));
  for (const t of ["decisions", "opus_reviews", "verifications", "build_tasks", "jobs"]) assert.ok(cols(db, t).length > 0, `${t} exists`);
  assert.equal((db.prepare("SELECT title FROM items WHERE repo = 'app' AND number = 1").get() as { title: string }).title, "Fix the crash");
  assert.equal((db.prepare("SELECT type_label FROM classifications WHERE number = 1").get() as { type_label: string }).type_label, "bugfix");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM comments").get() as { n: number }).n, 1);
  const stamp = db.prepare("SELECT value FROM settings WHERE key = 'schema_stamp'").get();
  assert.ok(stamp, "the migration is stamped");
  db.close();

  const again = connect(path);
  assert.deepEqual(again.prepare("SELECT value FROM settings WHERE key = 'schema_stamp'").get(), stamp);
  assert.equal((again.prepare("SELECT COUNT(*) AS n FROM items").get() as { n: number }).n, 1);
  again.close();
});
