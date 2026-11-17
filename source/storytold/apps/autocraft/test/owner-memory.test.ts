// Owner memory: which sources become statements, which statements a review of a PR gets, and how a reply names conflicts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectStatements, commentDatabaseId, embedStatements } from "../src/memory/statements.ts";
import { relatedStatements } from "../src/memory/retrieve.ts";
import { toBlob } from "../src/embed/store.ts";
import { withNote } from "../src/github/note.ts";
import { parseOpusReply, parseStatementConflicts } from "../src/review/opus-parse.ts";
import { parsePremerge } from "../src/premerge/parse.ts";
import { loadPrFacts } from "../src/core/facts.ts";
import type { Embedder } from "../src/embed/model.ts";
import { world } from "./world-db.ts";

// Bag of words over a tiny vocabulary: texts sharing words are close.
const VOCAB = ["hyphenation", "dictionar", "library", "dependency", "canvas", "export", "language"];
const fake: Embedder = {
  id: "fake", dim: VOCAB.length,
  async embed(texts) {
    return texts.map((t) => {
      const v = new Float32Array(VOCAB.length);
      VOCAB.forEach((w, i) => { if (t.toLowerCase().includes(w)) v[i] = 1; });
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    });
  },
};
const vec = async (t: string) => toBlob((await fake.embed([t], "item"))[0]!);

function comment(w: ReturnType<typeof world>, id: string, repo: string, number: number, author: string, body: string): void {
  w.db.prepare("INSERT INTO comments (repo, number, id, kind, author, created_at, body) VALUES (?, ?, ?, 'comment', ?, '2026-03-01T00:00:00Z', ?)").run(repo, number, id, author, body);
}

test("statements come from operators' own words only, and a related one reaches the review of a similar PR of its repo", async () => {
  const w = world().repo().pr(1);
  w.db.prepare("INSERT INTO access (login, role) VALUES ('boss', 'operator'), ('guest', 'maintainer')").run();
  comment(w, "c1", "craft-libs", 5, "boss", "Vendored hyphenation code and dictionaries belong in the shared library, not in the app.");
  comment(w, "c2", "craft-libs", 6, "boss", withNote({ by: "operator", model: null }, "Hyphenation dictionary posted by the pipeline for the operator."));
  comment(w, "c3", "craft-libs", 7, "guest", "Hyphenation dictionary vendoring is fine with me, as far as I can tell.");
  comment(w, "c4", "craft-libs", 8, "boss", "ok");
  // A post from before the note line existed: no prefix, written by the pipeline, known only from its audit row.
  const node = (id: number) => `IC_${Buffer.concat([Buffer.from([0x93, 0x00, 0xce, 0, 0, 0, 7, 0xce]), Buffer.from(new Uint8Array(new Uint32Array([id]).buffer).reverse())]).toString("base64url")}`;
  assert.equal(commentDatabaseId(node(4321987)), "4321987");
  comment(w, node(4321987), "craft-libs", 11, "boss", "Hyphenation dictionary vendoring is a library matter, see the other thread.");
  w.db.prepare("INSERT INTO audit (at, login, action, target, details) VALUES ('t', 'comment-stage', 'act-comment', 'craft-libs#11', ?)").run(JSON.stringify({ url: "https://github.com/o/craft-libs/issues/11#issuecomment-4321987", state: "done" }));
  comment(w, "PRR_x", "craft-libs", 12, "boss", "Hyphenation review text posted by the pipeline without a note line.");
  w.db.prepare("INSERT INTO audit (at, login, action, target, details) VALUES ('t', 'review', 'review-post', 'craft-libs#12', ?)").run(JSON.stringify({ review: "PRR_x", state: "done" }));
  w.db.prepare("INSERT INTO decisions (id, kind, repo, number, question, options, asked_at, answer, answer_note, answered_by, answered_at) VALUES ('d1', 'close', 'app', 9, 'q', '[]', '2026-03-02T00:00:00Z', 'close', 'No new dependency for canvas export.', 'boss', '2026-03-02T00:00:00Z')").run();
  w.db.prepare("INSERT INTO conversation_turns (repo, number, kind, login, at, body, block, status, seq) VALUES ('app', 10, 'operator', 'boss', '2026-03-03T00:00:00Z', 'Keep language data out of the app crates.', 'b', 'answered', 1)").run();

  assert.equal(collectStatements(w.db), 3);
  assert.equal(collectStatements(w.db), 0);
  const kinds = w.db.prepare("SELECT source_kind FROM owner_statements ORDER BY id").all().map((r) => (r as { source_kind: string }).source_kind).sort();
  assert.deepEqual(kinds, ["comment", "conversation", "decision-note"]);

  await embedStatements(w.db, fake);
  const pr = await vec("Add Danish hyphenation dictionary to the app");
  w.db.prepare("INSERT OR REPLACE INTO item_embeddings (repo, number, model, hash, vec, at) VALUES ('craft-libs', 20, 'fake', 'h', ?, 't'), ('app', 1, 'fake', 'h', ?, 't')").run(pr, pr);
  const got = relatedStatements(w.db, "craft-libs", 20);
  assert.deepEqual(got.map((s) => s.where), ["craft-libs#5"]);
  assert.equal(got[0]!.kind, "comment");
  // Another repo's PR on the same topic gets none of them.
  assert.deepEqual(relatedStatements(w.db, "app", 1), []);

  // Statements on the PR itself are skipped.
  w.db.prepare("INSERT OR REPLACE INTO item_embeddings (repo, number, model, hash, vec, at) VALUES ('craft-libs', 5, 'fake', 'h', ?, 't')").run(await vec("hyphenation dictionary"));
  assert.deepEqual(relatedStatements(w.db, "craft-libs", 5), []);
});

test("a reply's conflicts keep known ids once and drop the rest", () => {
  const known = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(parseStatementConflicts([{ id: 2, reason: " why " }, { id: 9, reason: "unknown" }, { id: 2, reason: "again" }, { id: 1 }, "x"], known), [{ id: 2, reason: "why" }]);
  assert.deepEqual(parseStatementConflicts("nope", known), []);
  const review = { ref: "app#1", verdict: "take", sure: true, reason: "ok", fixes: [], risks: [], summary: "S.", why: "W.", conflicts: [{ id: 1, reason: "goes against it" }, { id: 7, reason: "x" }] };
  const st = [{ id: 1, where: "a#1", kind: "comment", title: "t", at: "2026-01-01", text: "x" }];
  assert.deepEqual(parseOpusReply(JSON.stringify(review), "app#1", true, new Set(), false, st)?.conflicts, [{ id: 1, reason: "goes against it" }]);
  const pm = parsePremerge(JSON.stringify({ ref: "app#1", findings: [], searched: "s", conflicts: [{ id: 1, reason: "r" }, { id: 5, reason: "r" }] }), "app#1", new Set(), st);
  assert.deepEqual(pm?.conflicts, [{ id: 1, reason: "r" }]);
});

test("facts list the statements that the Opus or the pre-merge review at the head named", () => {
  const w = world().repo().pr(1).review(1).premerge(1, "clean");
  const put = w.db.prepare("INSERT INTO owner_statements (source_kind, source_id, repo, number, item_title, author, text, at) VALUES ('comment', ?, 'craft-libs', 5, 't', 'boss', ?, 'a')");
  const a = Number(put.run("c1", "Dictionaries belong in the library.").lastInsertRowid), b = Number(put.run("c2", "No new crates.").lastInsertRowid);
  const named = () => loadPrFacts(w.db, { refs: ["app#1"] }).find((f) => f.number === 1)!.statementConflicts;
  assert.deepEqual(named(), []);
  w.db.prepare("UPDATE opus_reviews SET conflicts = ?").run(JSON.stringify([{ id: a, reason: "adds a table" }, { id: 999, reason: "gone" }]));
  assert.deepEqual(named(), [{ id: a, where: "craft-libs#5", text: "Dictionaries belong in the library.", reason: "adds a table" }]);
  w.db.prepare("UPDATE premerge_reviews SET conflicts = ?").run(JSON.stringify([{ id: b, reason: "adds a crate" }]));
  assert.deepEqual(named().map((d) => d.id), [a, b]);
});
