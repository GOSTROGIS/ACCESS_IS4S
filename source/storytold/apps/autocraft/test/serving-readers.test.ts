import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { classificationsOf } from "../src/dash/api/decisions.ts";
import { itemPage } from "../src/dash/api/item-page.ts";
import { trace } from "../src/dash/api/trace.ts";
import { servingFields } from "../src/dash/api/serving.ts";
import { classifiersReport, disagreements } from "../src/dash/api/insight.ts";
import { servingLabel } from "../web/src/lib/serving.ts";
import type { ItemPageData, ItemTrace, ServingMetadata } from "../web/src/api/types.ts";
import type { Req } from "../src/dash/types.ts";
import { ask, getDecision } from "../src/decisions.ts";
import { decisionStamp } from "../src/conversations/cards.ts";
import { conversationView } from "../src/dash/api/conversations.ts";

const reported: ServingMetadata = { schema: 1, provider: "codex", runs: [42, 43],
  models: [{ model: "actual-fixture-model", reasoningEfforts: ["medium"] }, { model: "actual-fixture-worker", reasoningEfforts: [null] }] };
const request = (since?: string): Req => ({ method: "GET", path: "", params: { repo: "photocraft", n: "7" },
  query: new URLSearchParams(since ? { since } : {}), form: new URLSearchParams(), csrf: "", nonce: "",
  user: { login: "operator", role: "operator", canRead: async () => true, canWrite: async () => true } });

test("serving readers distinguish historical absence, reported models and malformed/newer data without exposing hidden run IDs", () => {
  assert.deepEqual(servingFields(null), {});
  assert.equal(servingLabel(undefined, "Opus"), "Opus");
  const publicResult = servingFields(JSON.stringify(reported));
  assert.deepEqual(publicResult.serving, { ...reported, runs: [] });
  assert.match(servingLabel(publicResult.serving, "Opus"), /^Codex · actual-fixture-model \(medium\) \/ actual-fixture-worker$/);
  assert.deepEqual(servingFields(JSON.stringify(reported), true).serving, reported);
  assert.equal(servingLabel({ schema: 1, provider: "codex", runs: [], models: [{ model: "actual-fixture-model", reasoningEfforts: ["high", null] }] }, "Opus"), "Codex · actual-fixture-model (high, unreported effort)");
  for (const raw of ["not JSON: PRIVATE-FIXTURE-MARKER", "{", { ...reported, schema: 9 }, { ...reported, runs: [] }]) {
    const unknown = servingFields(raw);
    assert.deepEqual(unknown.serving, { schema: 0, provider: "unknown", runs: [], models: [] });
    assert.equal(servingLabel(unknown.serving, "Opus"), "Model unknown");
    assert.ok(!JSON.stringify(unknown).includes("PRIVATE-FIXTURE-MARKER"));
  }
});

test("classification reads preserve logical keys and historical rows while returning actual serving metadata", () => {
  const db = connect(":memory:");
  try {
    const insert = db.prepare("INSERT INTO classifications(repo,number,classifier,run_id,at,type_label,flags,reason,serving_metadata) VALUES('photocraft',7,?,'fixture','2026-01-01T00:00:00Z','bugfix','[]','Synthetic fixture',?)");
    insert.run("jev", null); insert.run("haiku", JSON.stringify(reported)); insert.run("sonnet", '{"schema":9,"private":"PRIVATE-FIXTURE-MARKER"}');
    const before = db.prepare("SELECT * FROM classifications ORDER BY classifier").all();
    const results = classificationsOf(db, "photocraft", 7);
    assert.equal(results.find(row => row.classifier === "jev")!.serving, undefined);
    assert.deepEqual(results.find(row => row.classifier === "haiku")!.serving, { ...reported, runs: [] });
    assert.equal(results.find(row => row.classifier === "sonnet")!.serving?.provider, "unknown");
    assert.deepEqual(db.prepare("SELECT * FROM classifications ORDER BY classifier").all(), before);
    assert.ok(!JSON.stringify(results).includes("PRIVATE-FIXTURE-MARKER"));
  } finally { db.close(); }
});

test("future result metadata changes invalidate item and trace stamps even when historical timestamps do not change", async () => {
  const db = connect(":memory:");
  try {
    const head = "a".repeat(40);
    db.prepare("INSERT INTO items(repo,number,kind,state,title,head_oid,created_at) VALUES('photocraft',7,'pr','OPEN','Synthetic fixture',?,'2026-01-01T00:00:00Z')").run(head);
    db.prepare("INSERT INTO opus_reviews(repo,number,head_oid,at,model,mode,verdict,sure,reason) VALUES('photocraft',7,?,'2026-01-01T00:00:00Z','opus','full','take',1,'Synthetic reason')").run(head);
    const legacy = await itemPage(db, request()) as ItemPageData;
    const legacyTrace = await trace(db, request()) as ItemTrace;
    assert.equal(legacy.reviews.latest!.serving, undefined);
    db.prepare("UPDATE opus_reviews SET serving_metadata=? WHERE repo='photocraft' AND number=7").run(JSON.stringify(reported));
    const known = await itemPage(db, request(legacy.stamp)) as ItemPageData;
    const knownTrace = await trace(db, request()) as ItemTrace;
    assert.notEqual(known.stamp, legacy.stamp);
    assert.notEqual(knownTrace.stamp, legacyTrace.stamp);
    assert.deepEqual(known.reviews.latest!.serving, { ...reported, runs: [] });
    assert.match(known.timeline.find(row => row.kind === "opus")!.actor, /^Codex · actual-fixture-model/);
    assert.match(knownTrace.events.find(row => row.kind === "review")!.actor.name, /^Codex · actual-fixture-model/);
    db.prepare("UPDATE opus_reviews SET serving_metadata='PRIVATE-FIXTURE-MARKER' WHERE repo='photocraft' AND number=7").run();
    const malformed = await itemPage(db, request(known.stamp)) as ItemPageData;
    assert.notEqual(malformed.stamp, known.stamp);
    assert.equal(malformed.reviews.latest!.serving?.provider, "unknown");
    assert.equal(malformed.timeline.find(row => row.kind === "opus")!.actor, "Model unknown");
    assert.ok(!JSON.stringify(malformed).includes("PRIVATE-FIXTURE-MARKER"));
    assert.equal((db.prepare("SELECT model FROM opus_reviews").get() as { model: string }).model, "opus");
  } finally { db.close(); }
});

test("classifier analytics retain logical grouping while distinguishing exact and mixed serving contributors", async () => {
  const db = connect(":memory:");
  try {
    const item = db.prepare("INSERT INTO items(repo,number,kind,state,title) VALUES('photocraft',?,'issue','OPEN','Synthetic analytics fixture')");
    const insert = db.prepare("INSERT INTO classifications(repo,number,classifier,run_id,at,type_label,flags,probs,serving_metadata) VALUES('photocraft',?,?,'fixture','2026-01-01T00:00:00Z',?,'[]',?,?)");
    item.run(7);
    insert.run(7,"jev","performance",'{"top":0.8}',null);
    insert.run(7,"haiku","bugfix",null,JSON.stringify(reported));
    const req = request();req.query.set("run","fixture");req.query.set("a","jev");req.query.set("b","haiku");
    const exact = await classifiersReport(db, req);
    assert.equal(exact.a, "jev");assert.equal(exact.b, "haiku");
    assert.equal(exact.aServing, undefined);
    assert.deepEqual(exact.bServing, { ...reported, runs: [] });
    const detail = await disagreements(db, req);
    assert.equal(detail.total,1);
    assert.deepEqual(detail.rows[0]!.b.serving, { ...reported, runs: [] });
    item.run(8);
    insert.run(8,"jev","performance",'{"top":0.8}',null);
    insert.run(8,"haiku","bugfix",null,null);
    const mixed = await classifiersReport(db, req);
    assert.equal(mixed.bServing?.provider,"unknown");
    assert.equal(mixed.items,2);
    assert.equal(mixed.overall.n,2);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM classifications WHERE classifier='haiku'").get() as { n:number }).n,2);
  } finally { db.close(); }
});

test("conversation and prepared-choice readers keep stored attribution distinct from logical turn kinds", async () => {
  const db = connect(":memory:");
  try {
    db.prepare("INSERT INTO items(repo,number,kind,state,title) VALUES('photocraft',7,'issue','OPEN','Synthetic conversation fixture')").run();
    const id = "photocraft#7:scope";
    ask(db, [{ id, kind: "scope", repo: "photocraft", number: 7, question: "Synthetic question?", options: [{ key: "take", label: "Wanted" }, { key: "close", label: "Out of scope" }] }]);
    db.prepare("UPDATE decisions SET serving_metadata=? WHERE id=?").run(JSON.stringify(reported), id);
    db.prepare("INSERT INTO conversations(repo,number,item_block,item_sig,created_at,created_by) VALUES('photocraft',7,'synthetic','fixture','2026-01-01T00:00:00Z','operator')").run();
    const turn = db.prepare("INSERT INTO conversation_turns(repo,number,kind,login,at,body,block,seq,serving_metadata) VALUES('photocraft',7,?,?,'2026-01-01T00:00:00Z','Synthetic text','synthetic',?,?)");
    turn.run("operator", "operator", 1, null);
    turn.run("opus", "opus", 2, JSON.stringify(reported));
    turn.run("opus", "opus", 3, '{"schema":9,"private":"PRIVATE-FIXTURE-MARKER"}');
    db.prepare("INSERT INTO decision_choices(id,decision_id,repo,number,stamp,source,drafts,pick,created_at,serving_metadata) VALUES('synthetic',?,'photocraft',7,?,'prepare','{}','{}','2026-01-01T00:00:00Z',?)")
      .run(id, decisionStamp(db, getDecision(db, id)!), JSON.stringify(reported));
    const before = db.prepare("SELECT * FROM conversation_turns ORDER BY id").all();
    const view = conversationView(db, "photocraft", 7);
    assert.equal(view.turns[0]!.serving, undefined);
    assert.equal(view.turns[1]!.kind, "opus");
    assert.equal(view.turns[1]!.login, "opus");
    assert.deepEqual(view.turns[1]!.serving, { ...reported, runs: [] });
    assert.equal(view.turns[2]!.serving?.provider, "unknown");
    assert.deepEqual(view.choices!.serving, { ...reported, runs: [] });
    assert.deepEqual(db.prepare("SELECT * FROM conversation_turns ORDER BY id").all(), before);
    assert.ok(!JSON.stringify(view).includes("PRIVATE-FIXTURE-MARKER"));
    const events = await trace(db, request()) as ItemTrace;
    assert.deepEqual(events.events.find(event => event.id === `decision:${id}:asked`)!.serving, { ...reported, runs: [] });
    db.prepare("UPDATE conversation_turns SET serving_metadata=CASE seq WHEN 2 THEN '{\"schema\":9}' ELSE ? END WHERE kind='opus'").run(JSON.stringify(reported));
    const exchanged = await trace(db, request()) as ItemTrace;
    assert.notEqual(exchanged.stamp, events.stamp, "moving attribution between existing turns must invalidate the stamp even when the metadata multiset is unchanged");
  } finally { db.close(); }
});
