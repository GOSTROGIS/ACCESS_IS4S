import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { listDecisions } from "../src/dash/api/decisions.ts";
import { needs } from "../src/dash/api/needs.ts";
import type { Req } from "../src/dash/types.ts";

const as = (login: string, role: "viewer" | "maintainer" | "operator", query: Record<string, string> = {}): Req => ({
  method: "GET", path: "", params: {}, query: new URLSearchParams(query), form: new URLSearchParams(),
  user: { login, role, canWrite: async () => true, canRead: async () => true }, csrf: "", nonce: "",
});

test("the open list runs by priority level, unclaimed before claimed, then age, in stable pages; a person sees what they can settle", async () => {
  const db = connect(":memory:");
  const now = Date.now();
  const at = (h: number) => new Date(now - h * 3600_000).toISOString();
  for (const repo of ["alpha", "beta"]) {
    db.prepare("INSERT INTO tracked_repos (name) VALUES (?)").run(repo);
    db.prepare("INSERT INTO repos (name, visibility) VALUES (?, 'public')").run(repo);
  }
  const ask = db.prepare("INSERT INTO decisions (id, kind, repo, number, question, options, asked_at) VALUES (?, 'other', ?, ?, 'Q?', '[]', ?)");
  // alpha#1 is the oldest and claimed by someone else; alpha#2 and alpha#3 share its level; alpha#4 is a P0 and the newest; beta#5 is the maintainer's no-go.
  const rows: [string, string, number, number][] = [["d1", "alpha", 1, 50], ["d2", "alpha", 2, 40], ["d3", "alpha", 3, 30], ["d4", "alpha", 4, 1], ["d5", "beta", 5, 45]];
  for (const [id, repo, n, h] of rows) {
    db.prepare("INSERT INTO items (repo, number, kind, state, title) VALUES (?, ?, 'issue', 'OPEN', ?)").run(repo, n, `Title ${n}`);
    ask.run(id, repo, n, at(h));
  }
  db.prepare("INSERT INTO item_rank (repo, number, score, breakdown, computed_at) VALUES ('alpha', 4, 40123, '{}', ?)").run(at(0));
  db.prepare("INSERT INTO decision_claims (decision_id, login, since, at) VALUES ('d1', 'other', ?, ?)").run(at(0), at(0));

  const page = async (req: Req) => {
    const ids: string[] = [];
    for (let after: string | null = null, i = 0; i < 10; i++) {
      const q = new URLSearchParams(req.query);
      q.set("limit", "2");
      if (after) q.set("after", after);
      const l = await listDecisions(db, { ...req, query: q });
      ids.push(...l.decisions.map((d) => d.id));
      if (!(after = l.next)) break;
    }
    return ids;
  };
  assert.deepEqual(await page(as("op", "operator")), ["d4", "d5", "d2", "d3", "d1"], "P0 first, then the oldest unclaimed of the default level, the claimed one after them");
  assert.equal((await listDecisions(db, as("op", "operator"))).decisions.find((d) => d.id === "d1")!.claim?.login, "other");

  // A maintainer settles on alpha only: write permission there, and the app acts for them.
  db.prepare("INSERT INTO access (login, role) VALUES ('maint', 'maintainer')").run();
  db.prepare("INSERT INTO settings (key, value) VALUES ('maintainer_writes', '1'), ('github_identity', 'app')").run();
  db.prepare("INSERT INTO repo_permissions (login, repo, permission, checked_at) VALUES ('maint', 'alpha', 'write', ?)").run(new Date().toISOString());
  assert.deepEqual(await page(as("maint", "maintainer")), ["d4", "d2", "d3", "d1"]);
  assert.deepEqual(await page(as("maint", "maintainer", { all: "1" })), ["d4", "d5", "d2", "d3", "d1"], "the toggle shows everything");
  assert.equal((await needs(db, as("maint", "maintainer"))).counts.decisions, 4, "the badge counts the same list");
  assert.equal((await needs(db, as("op", "operator"))).counts.decisions, 5);

  assert.deepEqual(await page(as("viewer", "viewer")), ["d4", "d5", "d2", "d3", "d1"], "a viewer reads everything they may see");
  assert.equal((await needs(db, as("viewer", "viewer"))).counts.decisions, 5);
});
