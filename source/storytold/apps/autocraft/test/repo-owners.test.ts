// Repos of other owners: tracking owner/name, the owner each write and query uses, storytold's repos unchanged.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { ghClosePr } from "../src/github/write.ts";
import { mainCiQuery, mainCiVars } from "../src/mainci/index.ts";
import { ownerOf, resetOwners, trackedOwners } from "../src/owners.ts";
import { runSync } from "../src/mirror.ts";
import { RepoError, trackRepo, trackRepoChecked } from "../src/repos.ts";
import { G } from "./guarded.ts";
import { SCRATCH } from "./scratch.ts";

test("a tracked repo of another owner is written to under its own owner; storytold repos are unchanged", async () => {
  resetOwners();
  const db = connect(join(mkdtempSync(join(SCRATCH, "owners-")), "o.db"));
  assert.ok(trackRepo(db, "t", "example-org/autocraft-sandbox"));
  trackRepo(db, "t", "designcraft");
  assert.equal(ownerOf("autocraft-sandbox"), "example-org");
  assert.equal(ownerOf("designcraft"), "storytold");
  assert.deepEqual(trackedOwners(db), ["example-org", "storytold"]);
  assert.throws(() => trackRepo(db, "t", "other/designcraft"), RepoError);
  assert.throws(() => trackRepo(db, "t", "bad owner/x"), RepoError);

  const seen: string[][] = [];
  const exec = async (_c: string, args: string[]) => { seen.push(args); return { code: 0, stdout: "", stderr: "" }; };
  const w = { db, login: "t" };
  await ghClosePr(w, G("autocraft-sandbox"), exec, { repo: "autocraft-sandbox", number: 3 }, { by: "fixed" }, "x");
  await ghClosePr(w, G("designcraft"), exec, { repo: "designcraft", number: 4 }, { by: "fixed" }, "x");
  assert.equal(seen[0]![seen[0]!.indexOf("--repo") + 1], "example-org/autocraft-sandbox");
  assert.equal(seen[1]![seen[1]!.indexOf("--repo") + 1], "storytold/designcraft");

  assert.deepEqual(mainCiVars(["autocraft-sandbox", "designcraft"]), { o0: "example-org", o1: "storytold" });
  assert.match(mainCiQuery(["a", "b"]), /^query\(\$o0: String!, \$o1: String!\)/);
});

const item = (repo: string, owner: string, number: number) => ({
  __typename: "Issue", repository: { name: repo, owner: { login: owner } }, number, title: `t${number}`, body: "", url: "u", author: { login: "a" },
  authorAssociation: "NONE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-11-02T10:00:00Z", closedAt: null, state: "OPEN",
  labels: { nodes: [] }, assignees: { nodes: [] }, commentCount: { totalCount: 0 }, stateReason: null, comments: { nodes: [] },
});

function syncDb() {
  resetOwners();
  const db = connect(join(mkdtempSync(join(SCRATCH, "owners-")), "o.db"));
  db.exec("DELETE FROM tracked_repos");
  db.exec("INSERT INTO tracked_repos VALUES ('designcraft','t','x',1)");
  db.exec("INSERT INTO repos (name, synced_at, high_water, reconciled_at) VALUES ('designcraft','2026-11-02T09:00:00Z','2026-11-02T09:00:00Z','2026-11-02T09:00:00Z')");
  db.exec("INSERT INTO settings VALUES ('org_high_water','2026-11-02T09:30:00Z'),('repos_refreshed_at','2999-01-01T00:00:00Z'),('search_catchup_at','2999-01-01T00:00:00Z')");
  return db;
}
const opts = { only: [], all: false, full: false, perRepo: false };

test("a search node of another owner's same-named repo is skipped", async () => {
  const db = syncDb();
  const nodes = [item("designcraft", "example-org", 1), item("designcraft", "storytold", 2)];
  const client = { spent: 0, remaining: 4000 as number | null, async query() { return { search: { issueCount: 2, pageInfo: { hasNextPage: false, endCursor: null }, nodes } }; } };
  await runSync(db, client, opts, new Date("2026-11-02T10:05:00Z"));
  assert.deepEqual(db.prepare("SELECT number FROM items WHERE repo = 'designcraft'").all().map((r) => r.number), [2]);
});

test("a failing fetch of another owner's repo leaves the storytold sync working", async () => {
  const db = syncDb();
  const exists = async (o: string, n: string) => o === "example-org" && n === "sandbox";
  await trackRepoChecked(db, "t", "example-org/sandbox", exists);
  await assert.rejects(trackRepoChecked(db, "t", "example-org/designcraft", async () => true), /unique across owners|already known/);
  await assert.rejects(trackRepoChecked(db, "t", "example-org/nope", exists), /not found/);
  assert.equal(ownerOf("sandbox"), "example-org");
  db.exec("UPDATE repos SET synced_at = '2026-11-02T09:00:00Z' WHERE name = 'sandbox'");
  const client = {
    spent: 0, remaining: 4000 as number | null,
    async query(q: string, v: Record<string, unknown>) {
      if (v.owner === "example-org") throw new Error("HTTP 502");
      assert.ok(q.includes("search("));
      return { search: { issueCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [item("designcraft", "storytold", 5)] } };
    },
  };
  const r = await runSync(db, client, opts, new Date("2026-11-02T10:05:00Z"));
  assert.equal(r.mode, "search");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM items WHERE repo = 'designcraft'").get()!.n, 1);
});
