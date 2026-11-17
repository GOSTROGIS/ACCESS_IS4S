// The guard: a write passes only when the Plan, reloaded right before it, still holds the same action at the same head.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { setPushApproval } from "../src/fixup/approval.ts";
import { gates } from "../src/core/gates.ts";
import { setCommentApproval } from "../src/act/approval.ts";
import { guard, guardBatchMerge, guardItem, guardRepo, type Live, type LiveRead } from "../src/core/guard.ts";
import { slugOf } from "../src/owners.ts";
import { closeItem, mergeViaCommand } from "../src/github/write.ts";
import { G } from "./guarded.ts";
import { mergeDecisionId } from "../src/merge/queue.ts";
import { parseSafeMergeArgs, safeMerge } from "../src/merge/safe-merge.ts";
import { world } from "./world-db.ts";
import { prFacts } from "./world.ts";

const ref = { repo: "app", number: 1 };
const open: LiveRead = { state: "OPEN", head: "sha1", draft: false, mergeable: "MERGEABLE" };
const live = (r: Partial<LiveRead> = {}): Live => async () => ({ ...open, ...r });
/** PR 1 in the state a clean take is merged from. */
const fresh = (_prs: { n: number }[]) => world().repo(["comment"]).pr(1).review(1).verified(1).premerge(1, "clean").pipeline(false).db;
const MERGE = { kind: "merge", head: "sha1" } as const;
const T = "2026-01-02T00:00:00Z";
const OP = { operator: "op" };

const ok = (r: unknown): boolean => !(r as { refused?: string }).refused;
const why = (r: unknown): string => (r as { refused?: string }).refused ?? "";

/** PR 1 as a take-fix review with one fix, pushable, in a repo approved for pushes. */
function takeFix(): DatabaseSync {
  const db = fresh([{ n: 1 }]);
  db.prepare("UPDATE opus_reviews SET verdict = 'take-fix', fixes = ?").run(JSON.stringify([{ file: "src/lib.rs", change: "rename a to b" }]));
  setPushApproval(db, "op", "app", true);
  return db;
}

test("passes when the Plan still holds the merge at the reviewed head", async () => {
  const g = await guard(fresh([{ n: 1 }]), ref, MERGE, OP, live());
  assert.ok(ok(g), why(g));
  assert.deepEqual([(g as { head: string }).head, (g as { repo: string }).repo, (g as { number: number }).number], ["sha1", "app", 1]);
});

test("refuses a merge without a live read, and when GitHub's head moved", async () => {
  const db = fresh([{ n: 1 }]);
  assert.match(why(await guard(db, ref, MERGE, OP)), /no live read/);
  assert.match(why(await guard(db, ref, MERGE, OP, live({ head: "sha9" }))), /head moved from sha1 to sha9/);
  assert.match(why(await guard(db, ref, MERGE, OP, live({ state: "CLOSED" }))), /no longer open/);
});

test("refuses when an operator's Hold answer arrived", async () => {
  const db = fresh([{ n: 1 }]);
  const id = mergeDecisionId("app", 1, "sha1");
  db.prepare("INSERT INTO decisions (id, kind, repo, number, items, question, options, facts, asked_at, answer, answered_by, answered_at) VALUES (?, 'merge', 'app', 1, '[]', 'q', '[]', ?, ?, 'hold', 'op', ?)")
    .run(id, JSON.stringify(["head commit sha1"]), T, T);
  assert.match(why(await guard(db, ref, MERGE, OP, live())), /plan no longer has merge/);
});

test("refuses when a maintainer's changes-requested review blocks the PR", async () => {
  const db = fresh([{ n: 1 }]);
  db.prepare("INSERT INTO review_gates (repo, number, blocked, by_login, read_at) VALUES ('app', 1, 1, 'maint', ?)").run(T);
  assert.match(why(await guard(db, ref, MERGE, OP, live())), /plan no longer has merge/);
});

test("a push needs the repo's push approval at the write", async () => {
  const db = takeFix();
  const push = { kind: "fixup", bucket: "fix", head: "sha1" } as const;
  assert.ok(ok(await guard(db, ref, push, OP, live())), "holds while approved");
  setPushApproval(db, "op", "app", false);
  assert.match(why(await guard(db, ref, push, OP, live())), /Pushes in app are not approved/);
});

test("the global pipeline switch gates the pipeline's writes, not an operator's", async () => {
  const db = fresh([{ n: 1 }]);
  assert.match(why(await guard(db, ref, MERGE, "pipeline", live())), /pipeline is off/i);
  assert.ok(ok(await guard(db, ref, MERGE, OP, live())));
  db.prepare("UPDATE main.settings SET value = '1' WHERE key = 'pipeline_enabled'").run();
  assert.ok(ok(await guard(db, ref, MERGE, "pipeline", live())));
});

test("gates: each action kind needs its approval", () => {
  const off = (k: "mergeApproved" | "pushApproved" | "commentApproved" | "ciApproved") => prFacts({ repoFacts: { [k]: false } });
  assert.match(gates(off("mergeApproved"), { kind: "merge" }, OP) ?? "", /Merges/);
  assert.match(gates(off("pushApproved"), { kind: "conflict", bucket: "merge" }, OP) ?? "", /Pushes/);
  assert.match(gates(off("commentApproved"), { kind: "fixup", bucket: "ask" }, OP) ?? "", /Comments/);
  assert.match(gates(off("commentApproved"), { kind: "post-review" }, OP) ?? "", /Comments/);
  assert.match(gates(off("ciApproved"), { kind: "approve-ci" }, OP) ?? "", /CI run approvals/);
  assert.match(gates(off("ciApproved"), { kind: "cifix", bucket: "rerun" }, OP) ?? "", /CI run approvals/);
  assert.equal(gates(off("pushApproved"), { kind: "merge" }, OP), null);
});

test("gates: a tripped stage writes nothing, asks and other stages stay open", () => {
  const f = prFacts({ tripped: { fixup: "2 of the last 10 fixup pushes broke a required check" } });
  for (const w of [{ kind: "fixup", bucket: "fix" }, { kind: "conflict", bucket: "merge" }, { kind: "lint", bucket: "fixup" }] as const) assert.match(gates(f, w, OP) ?? "", /Fixup is paused: 2 of the last 10/);
  assert.match(gates(f, { kind: "fixup", bucket: "fix" }, "pipeline") ?? "", /paused/);
  assert.equal(gates(f, { kind: "fixup", bucket: "ask" }, OP), null);
  assert.equal(gates(f, { kind: "cifix", bucket: "work" }, OP), null);
  assert.match(gates(prFacts({ tripped: { merge: "main is red" } }), { kind: "merge" }, OP) ?? "", /Merge is paused/);
});

test("the merge command gets the reviewed head, and the built-in command refuses another head", async () => {
  const g = await guard(fresh([{ n: 1 }]), ref, MERGE, OP, live());
  assert.ok(ok(g));
  const seen: string[][] = [];
  await mergeViaCommand({ db: fresh([{ n: 1 }]), login: "t" }, async (_c, args) => { seen.push(args); return { code: 0, stdout: "", stderr: "" }; }, "safe-merge",
    g as Exclude<typeof g, { refused: string }>, { method: "squash" });
  assert.deepEqual(seen[0], [slugOf("app"), "1", "--squash", "--head", "sha1"]);
  assert.equal(parseSafeMergeArgs(seen[0]!)?.head, "sha1");
  const gh = async () => JSON.stringify({ state: "OPEN", isDraft: false, mergeable: "MERGEABLE", headRefOid: "other0000", statusCheckRollup: [] });
  const r = await safeMerge("o/r", "1", "--squash", [], [], gh, async () => {}, false, "sha1");
  assert.deepEqual(r, { merged: false, reason: "REFUSED o/r#1: head is other00, not the reviewed sha1" });
});

/** Item 1 with an operator's close answer to a scope decision. */
function closeAnswered(): DatabaseSync {
  const db = fresh([{ n: 1 }]);
  db.prepare("INSERT INTO decisions (id, kind, repo, number, items, question, options, facts, asked_at, answer, answered_by, answered_at) VALUES ('d1', 'scope', 'app', 1, ?, 'q', '[]', '[]', ?, 'close', 'op', ?)")
    .run(JSON.stringify([{ repo: "app", number: 1 }]), T, T);
  return db;
}
const CLOSE = { kind: "act", bucket: "scope", decisionId: "d1" } as const;

test("an item write needs the comment approval and an answer that still closes the item", async () => {
  const db = closeAnswered();
  assert.match(why(await guardItem(db, ref, CLOSE, OP)), /Comments in app are not approved/);
  setCommentApproval(db, "op", "app", true);
  assert.ok(ok(await guardItem(db, ref, CLOSE, OP)));
  db.prepare("UPDATE decisions SET answer = 'hold' WHERE id = 'd1'").run();
  assert.match(why(await guardItem(db, ref, CLOSE, OP)), /plan no longer has act:scope/);
});

test("a repo write needs the repo's approval and, for the pipeline, the global switch", () => {
  const db = fresh([{ n: 1 }]);
  assert.match(why(guardRepo(db, "app", "comment", OP)), /Comments in app are not approved/);
  setCommentApproval(db, "op", "app", true);
  assert.ok(ok(guardRepo(db, "app", "comment", OP)));
  assert.match(why(guardRepo(db, "app", "comment", "pipeline")), /pipeline is off/i);
});

test("a write function refuses a guard that was made for another repo", async () => {
  const q = { spent: 0, remaining: null, query: async () => ({}) };
  await assert.rejects(closeItem({ db: fresh([{ n: 1 }]), login: "t" }, G("other"), q, { repo: "app", number: 1, id: "N1", pr: false }), /guard covers other/);
});

test("a batch member passes the batch guard only with a passed verification, also while GitHub's mergeable state is still unknown", async () => {
  const batch = (verification: string): DatabaseSync => {
    const db = world().repo(["comment"]).pr(1).review(1).verified(1, verification).premerge(1, "clean").pipeline(false).db;
    db.prepare("INSERT INTO merge_batches (id, repo, branch, state, base_sha, commit_sha, pr_number, created_at, updated_at) VALUES (1, 'app', 'integration-app-1', 'open', 'base', 'tip', 900, ?, ?)").run(T, T);
    db.prepare("INSERT INTO merge_batch_prs (batch_id, number, head_oid, position) VALUES (1, 1, 'sha1', 0)").run();
    return db;
  };
  const batchLive: Live = async (_r, n) => (n === 900 ? { ...open, head: "tip" } : { ...open, mergeable: "UNKNOWN" });
  const run = (db: DatabaseSync) => guardBatchMerge(db, { repo: "app", number: 900, head: "tip" }, [{ number: 1, head: "sha1" }], OP, batchLive);
  assert.ok(ok(await run(batch("passed"))), why(await run(batch("passed"))));
  assert.ok(!ok(await run(batch("failed"))));
});

test("a fix-up grant is for the Plan action's source", async () => {
  const db = takeFix();
  const ask = (source: string) => guard(db, ref, { kind: "fixup", bucket: "fix", head: "sha1", source }, OP, live());
  assert.ok(ok(await ask("review")), why(await ask("review")));
  assert.ok(!ok(await ask("carry")));
});
