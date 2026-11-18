import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { carriedReview } from "../src/review/carry.ts";
import { saveOpus } from "../src/review/opus.ts";
import { savePremerge, premergeAt } from "../src/premerge/store.ts";
import { ask } from "../src/decisions.ts";
import { fillReviewSummaries } from "../src/review/summary.ts";
import { HEAD_FACT } from "../src/merge/queue.ts";
import { saveComparison, storedComparison, type StoredComparison } from "../src/dupes/plan.ts";
import { parseServingMetadata } from "../src/agents/provenance.ts";

test("carried reviews and their history retain exact known or future serving attribution without another model call", () => {
  for (const raw of [null, JSON.stringify({ schema: 1, provider: "codex", runs: [42], models: [{ model: "gpt-actual", reasoningEfforts: ["high"] }] }), '{"schema":9,"future":"opaque"}']) {
    const db = connect(":memory:");
    try {
      const at = "2026-01-01T00:00:00Z";
      db.prepare("INSERT INTO opus_reviews(repo,number,head_oid,at,model,mode,verdict,sure,reason,seen_at,serving_metadata) VALUES ('app',1,'before',?,'opus','full','take-fix',1,'checked',?,?)").run(at, at, raw);
      db.prepare("INSERT INTO conflict_merges(repo,number,from_head,to_head,state,attempt,created_at,own_diff) VALUES ('app',1,'before','after','merged',1,?,'same')").run(at);
      const carried = carriedReview(db, { repo: "app", number: 1, head_oid: "after" });
      assert.ok(carried);
      assert.equal(carried.servingMetadata, raw);
      saveOpus(db, null, { repo: "app", number: 1, head_oid: "after" }, { mode: "carried", base: carried.from, baseRef: carried.baseRef, model: "carried", review: carried.review, servingMetadata: carried.servingMetadata });
      assert.equal(db.prepare("SELECT serving_metadata FROM opus_reviews WHERE head_oid='after'").get()!.serving_metadata, raw);
      assert.equal(db.prepare("SELECT serving_metadata FROM opus_review_history WHERE head_oid='after'").get()!.serving_metadata, raw);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM agent_runs").get()!.n, 0);
    } finally { db.close(); }
  }
});

test("premerge persistence keeps supplied opaque attribution and a failed retry does not erase the retained result's attribution", () => {
  const db = connect(":memory:");
  try {
    const raw = '{"schema":9,"future":"opaque"}';
    const item = { repo: "app", number: 1, head: "head", at: "2026-01-01", model: "opus" };
    savePremerge(db, { ...item, findings: [], servingMetadata: raw });
    assert.equal(premergeAt(db, "app", 1, "head")!.serving_metadata, raw);
    savePremerge(db, { ...item, at: "2026-01-02", error: "temporary failure" });
    assert.equal(premergeAt(db, "app", 1, "head")!.serving_metadata, raw);
    savePremerge(db, { ...item, at: "2026-01-03", findings: [] });
    assert.equal(premergeAt(db, "app", 1, "head")!.serving_metadata, null, "a genuinely new legacy result does not inherit old attribution");
  } finally { db.close(); }
});

test("review-to-decision text copies retain opaque provenance and notice attribution-only corrections", () => {
  const db = connect(":memory:");
  try {
    const raw = '{"schema":9,"future":"opaque"}', corrected = '{"schema":10,"future":"corrected"}';
    db.exec("INSERT OR REPLACE INTO tracked_repos(name,pipeline) VALUES ('app',1)");
    db.exec("INSERT INTO items(repo,number,kind,state) VALUES ('app',1,'pr','OPEN')");
    db.prepare("INSERT INTO opus_reviews(repo,number,head_oid,at,model,mode,verdict,sure,reason,summary,why,serving_metadata) VALUES ('app',1,'head','2026-01-01','opus','full','take',1,'The checks passed.','The checks passed.','The checks passed.',?)").run(raw);
    ask(db, [{ id: "fixture", kind: "merge", repo: "app", number: 1, question: "Merge?", facts: [HEAD_FACT + "head"], options: [{ key: "merge", label: "Merge" }, { key: "wait", label: "Wait" }] }]);
    assert.equal(fillReviewSummaries(db, "2026-01-02"), 1);
    assert.equal(db.prepare("SELECT serving_metadata FROM decisions WHERE id='fixture'").get()!.serving_metadata, raw);
    assert.equal(fillReviewSummaries(db, "2026-01-03"), 0);
    db.prepare("UPDATE opus_reviews SET serving_metadata=?").run(corrected);
    assert.equal(fillReviewSummaries(db, "2026-01-03"), 1);
    assert.equal(db.prepare("SELECT serving_metadata FROM decisions WHERE id='fixture'").get()!.serving_metadata, corrected);
  } finally { db.close(); }
});

test("cached duplicate result copies and decision refreshes preserve attribution without relabeling new legacy text", () => {
  const db = connect(":memory:");
  try {
    const raw = '{"schema":9,"future":"opaque"}';
    const comparison: StoredComparison = { repo: "app", key: "issue:1,2", kind: "issue", members: [1, 2], hash: "fixture", kept: 1, source: "model", model: "opus", reason: "Same request.", result: null, error: null, attempts: 1, at: "2026-01-01", serving_metadata: raw };
    saveComparison(db, comparison);
    const saved = storedComparison(db, "app", comparison.key)!;
    assert.equal(saved.serving_metadata, raw);
    saveComparison(db, { ...saved, at: "2026-01-02" });
    assert.equal(storedComparison(db, "app", comparison.key)!.serving_metadata, raw);
    const q = { id: "fixture", kind: "merge", repo: "app", number: 1, question: "Merge?", options: [{ key: "merge", label: "Merge" }, { key: "wait", label: "Wait" }] };
    ask(db, [{ ...q, summary: "Saved result.", serving_metadata: raw }]);
    ask(db, [q]);
    assert.equal(db.prepare("SELECT serving_metadata FROM decisions WHERE id='fixture'").get()!.serving_metadata, raw);
    ask(db, [{ ...q, question: "Merge changed question?" }]);
    assert.equal(parseServingMetadata(db.prepare("SELECT serving_metadata FROM decisions WHERE id='fixture'").get()!.serving_metadata)?.provider, "unknown");
    ask(db, [{ ...q, summary: "A genuinely new legacy result." }]);
    assert.equal(db.prepare("SELECT serving_metadata FROM decisions WHERE id='fixture'").get()!.serving_metadata, null);
  } finally { db.close(); }
});
