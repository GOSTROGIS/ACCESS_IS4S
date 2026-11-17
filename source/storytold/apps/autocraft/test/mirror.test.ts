import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, untilCutoff } from "../src/mirror.ts";
import { validating } from "./gql.ts";

const page = (...times: string[]) => times.map((updatedAt) => ({ updatedAt }));

test("incremental sync stops at the first old item and requests no further page", async () => {
  let fetched = 0;
  async function* pages() {
    for (const p of [page("2026-02", "2026-01"), page("2025-12"), page("2025-11")]) {
      fetched++;
      yield p;
    }
  }
  const out: string[][] = [];
  for await (const p of untilCutoff(pages(), "2026-01")) out.push(p.map((n) => n.updatedAt));
  assert.deepEqual(out, [["2026-02", "2026-01"]]);
  assert.equal(fetched, 2);
});


// ---- search-based incremental sync ----
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { runSync } from "../src/mirror.ts";
import { connect } from "../src/db.ts";
import { itemText, textHash } from "../src/embed/text.ts";
import { inputHash } from "../src/runner/classify.ts";
import { SCRATCH } from "./scratch.ts";

const node = (repo: string, number: number, state = "OPEN", updatedAt = "2026-11-02T10:00:00Z") => ({
  __typename: "Issue", repository: { name: repo }, number, title: `t${number}`, body: "", url: "u", author: { login: "a" },
  authorAssociation: "NONE", createdAt: "2026-01-01T00:00:00Z", updatedAt, closedAt: null, state,
  labels: { nodes: [] }, assignees: { nodes: [] }, commentCount: { totalCount: 0 }, stateReason: null,
  comments: { nodes: [] },
});

function fakeClient(nodes: unknown[], issueCount = nodes.length, failAfter = Infinity) {
  const c = validating({
    spent: 0, remaining: 4000 as number | null, calls: [] as { query: string; variables: Record<string, unknown> }[],
    async query(query: string, variables: Record<string, unknown>) {
      c.calls.push({ query, variables });
      if (c.calls.length > failAfter) throw new Error("boom");
      return { search: { issueCount, pageInfo: { hasNextPage: false, endCursor: null }, nodes } };
    },
  });
  return c;
}

function scratch() {
  const dir = mkdtempSync(join(SCRATCH, "fastsync-"));
  const db = connect(join(dir, "m.db"));
  db.exec("DELETE FROM tracked_repos");
  db.exec("INSERT INTO tracked_repos VALUES ('a','t','x', 1),('b','t','x', 1)");
  db.exec("INSERT INTO repos (name, synced_at, high_water, reconciled_at) VALUES ('a','2026-11-02T09:00:00Z','2026-11-02T09:00:00Z','2026-11-02T09:00:00Z'),('b','2026-11-02T09:00:00Z','2026-11-02T09:00:00Z','2026-11-02T09:00:00Z')");
  db.exec("INSERT INTO settings VALUES ('org_high_water','2026-11-02T09:30:00Z'),('repos_refreshed_at','2999-01-01T00:00:00Z'),('search_catchup_at','2999-01-01T00:00:00Z')");
  return { dir, db };
}
const opts = { only: [], all: false, full: false, perRepo: false };
const hw = (db: ReturnType<typeof connect>) => (db.prepare("SELECT value FROM settings WHERE key='org_high_water'").get() as { value: string }).value;


test("search mode writes tracked results, ignores untracked, advances the high water", async () => {
  const { db } = scratch();
  const c = fakeClient([node("a", 1), node("zzz", 2), node("b", 3, "CLOSED")]);
  const r = await runSync(db, c, opts, new Date("2026-11-02T10:05:00Z"));
  assert.deepEqual(r, { mode: "search", items: 2 });
  assert.equal(c.calls.length, 1);
  assert.match(String(c.calls[0].variables.q), /updated:2026-11-02T09:20:00Z\.\.2026-11-02T10:05:00Z/);
  const rows = db.prepare("SELECT repo, number, detail_level FROM items ORDER BY number").all();
  assert.deepEqual(rows.map((x) => ({ ...x })), [{ repo: "a", number: 1, detail_level: "full" }, { repo: "b", number: 3, detail_level: "light" }]);
  assert.equal(hw(db), "2026-11-02T10:00:00Z", "the high water is the newest updatedAt, not the start time");
  const at = db.prepare("SELECT name, synced_at FROM repos ORDER BY name").all().map((x) => ({ ...x }));
  assert.deepEqual(at, [{ name: "a", synced_at: "2026-11-02T10:05:00Z" }, { name: "b", synced_at: "2026-11-02T10:05:00Z" }], "every tracked repo counts as synced");
});

// A fake search over `all`: honours `updated:A..B`, pages by cursor, and reports the true match count.
function searchClient(all: ReturnType<typeof node>[]) {
  const c = validating({
    spent: 0, remaining: 4000 as number | null, queries: [] as string[], windows: [] as { from: string; to: string; matches: number }[],
    async query(query: string, v: Record<string, unknown>) {
      c.queries.push(query);
      assert.ok(query.includes("search("), "only search queries are expected");
      const m = /updated:(\S+)\.\.(\S+)/.exec(String(v.q))!;
      const hits = all.filter((n) => n.updatedAt >= m[1] && n.updatedAt <= m[2]);
      const start = Number(v.after ?? 0), size = Number(v.first);
      if (!v.after) c.windows.push({ from: m[1], to: m[2], matches: hits.length });
      const end = Math.min(start + size, 1000, hits.length);
      return { search: { issueCount: hits.length, pageInfo: { hasNextPage: end < Math.min(1000, hits.length), endCursor: String(end) }, nodes: hits.slice(start, end) } };
    },
  });
  return c;
}
const at = (sec: number) => new Date(Date.UTC(2026, 10, 2, 10, 0, 0) + sec * 1000).toISOString().replace(".000Z", "Z");

test("a window with more than 1,000 matches is split into slices; nothing falls back to per-repo passes", async () => {
  const { db } = scratch();
  const all = Array.from({ length: 2500 }, (_, i) => node(i % 2 ? "a" : "b", i + 1, "OPEN", at(i % 1200)));
  const c = searchClient(all);
  const r = await runSync(db, c, opts, new Date("2026-11-02T10:30:00Z"));
  assert.equal(r.mode, "search");
  assert.equal(r.items, 2500);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM items").get()!.n, 2500);
  assert.ok(c.queries.every((q) => q.includes("search(")), "no per-repo query");
  const leaves = c.windows.filter((w) => w.matches <= 1000);
  assert.ok(leaves.length >= 3, "split until each slice fits");
  assert.ok(c.windows.length > leaves.length, "over-cap windows were probed and cut");
  assert.equal(hw(db), at(1199));
});




test("sync stores the text hashes the planner compares", async () => {
  const { db } = scratch();
  const n = { ...node("a", 1), title: "Crash on open", body: "<!-- t -->See [docs](http://x.y) now\n```\ncode\n```" };
  await runSync(db, fakeClient([n]), opts, new Date("2026-11-02T10:05:00Z"));
  const row = db.prepare("SELECT * FROM items WHERE number=1").get() as Record<string, string>;
  assert.equal(row.embed_hash, textHash(itemText(n.title, n.body)));
  assert.equal(row.class_hash, inputHash({ repo: "a", number: 1, kind: "issue", title: n.title, body: n.body, lines_changed: null, files_changed: null, author_association: "NONE" }));
  const { pending } = await import("../src/embed/store.ts");
  assert.equal(pending(db, "m").length, 1);
  db.exec(`INSERT INTO item_embeddings (repo, number, model, hash, vec, at) VALUES ('a', 1, 'm', '${row.embed_hash}', x'00', 'x')`);
  assert.equal(pending(db, "m").length, 0);
  assert.equal(pending(db, "other").length, 1);
  db.prepare("UPDATE items SET embed_hash = NULL WHERE number = 1").run(); // legacy row: planning reads the hash from the text and writes nothing
  assert.equal(pending(db, "m").length, 0);
  assert.equal(db.prepare("SELECT embed_hash FROM items WHERE number = 1").get()!.embed_hash, null);
  const { fillEmbedHashes } = await import("../src/itemhash.ts");
  assert.equal(fillEmbedHashes(db), 1); // the embed and dupes jobs fill it
  assert.equal(db.prepare("SELECT embed_hash FROM items WHERE number = 1").get()!.embed_hash, row.embed_hash);
  db.prepare("UPDATE items SET body = 'new text' WHERE number = 1").run(); // an edit outside sync clears the hashes
  assert.equal(pending(db, "m").length, 1);
});








test("a deleted item reads as null; a missing repository still fails", async () => {
  const c = new Client(0);
  const answer = (data: unknown) => () => ({ data, errors: [{ type: "NOT_FOUND", message: "Could not resolve to an issue or pull request with the number of 2401." }], text: "", failed: true, stderr: "gh: Could not resolve" });
  (c as unknown as { run: unknown }).run = answer({ rateLimit: { cost: 1, remaining: 4000, resetAt: "2026-11-04T15:00:00Z" }, repository: { issueOrPullRequest: null } });
  assert.equal((await c.query("q", {})).repository.issueOrPullRequest, null);
  (c as unknown as { run: unknown }).run = answer({ repository: null });
  await assert.rejects(c.query("q", {}));
});

test("search results GitHub refuses for lack of access are dropped; other errors still fail", async () => {
  const c = new Client(0);
  const answer = (errors: unknown[]) => () => ({
    data: { rateLimit: { cost: 1, remaining: 4000, resetAt: "2026-11-09T15:00:00Z" }, search: { nodes: [{ number: 1 }, null], pageInfo: { hasNextPage: false } } },
    errors, text: "", failed: true, stderr: "gh: Resource not accessible by integration",
  });
  (c as unknown as { run: unknown }).run = answer([{ type: "FORBIDDEN", path: ["search", "nodes", 1], message: "Resource not accessible by integration" }]);
  assert.deepEqual((await c.query("q", {})).search.nodes, [{ number: 1 }, null]);
  (c as unknown as { run: unknown }).run = answer([{ type: "FORBIDDEN", path: ["search", "nodes", 0, "author"], message: "Resource not accessible by integration" }]);
  assert.deepEqual((await c.query("q", {})).search.nodes, [null, null]);
  (c as unknown as { run: unknown }).run = answer([{ type: "FORBIDDEN", path: ["rateLimit"], message: "Resource not accessible by integration" }]);
  await assert.rejects(c.query("q", {}));
});

// ---- mergeable keeps its known value at one head ----
import { tmpdir } from "node:os";
import { saveChecks } from "../src/review/checks.ts";

test("saveChecks keeps a known mergeable at the same head and replaces it at a new head", () => {
  const db = connect(join(mkdtempSync(join(tmpdir(), "mergeable-")), "t.db"));
  const save = (head: string, mergeable: string) => saveChecks(db, [{ repo: "app", number: 7, head_oid: head, state: "OPEN", is_draft: false, overall: "success", checks: [], mergeable, maintainer_can_modify: true }]);
  const stored = () => (db.prepare("SELECT mergeable FROM pr_checks WHERE repo='app' AND number=7").get() as { mergeable: string }).mergeable;
  save("h1", "CONFLICTING");
  save("h1", "UNKNOWN");
  assert.equal(stored(), "CONFLICTING");
  save("h1", "MERGEABLE");
  assert.equal(stored(), "MERGEABLE");
  save("h2", "UNKNOWN");
  assert.equal(stored(), "UNKNOWN");
});
