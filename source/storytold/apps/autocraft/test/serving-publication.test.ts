import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { ask, getDecision } from "../src/decisions.ts";
import { decisionNote } from "../src/act/index.ts";
import { cardNote } from "../src/conversations/act.ts";
import { noteLine, storedNote } from "../src/github/note.ts";
import { postSource } from "../src/review/post-source.ts";
import { postCandidates, runReviewPost } from "../src/review/post.ts";
import { fileFinding } from "../src/postmerge/file.ts";
import { pendingDefects, reviewOf } from "../src/postmerge/select.ts";
import { runLand } from "../src/security/land.ts";
import type { Exec } from "../src/fixup/git.ts";
import { world, T0, T1 } from "./world-db.ts";

const raw = JSON.stringify({ schema: 1, provider: "codex", runs: [731], models: [{ model: "actual-fixture-model", reasoningEfforts: ["high"] }] });
const expectActual = (text: string) => { assert.match(text, /Codex · actual-fixture-model \(high\)/); assert.doesNotMatch(text, /Opus|731/); };

test("posting a carried review uses its exact source review attribution, including explicit future unknown", async () => {
  const w = world().repo().pr(1, { head: "bbbbbbb2222" }).review(1, { head: "aaaaaaa1111", verdict: "take-fix" });
  try {
    w.db.prepare("UPDATE opus_reviews SET public_review=?,serving_metadata=? WHERE number=1").run(JSON.stringify({ summary: "Synthetic review text.", points: [] }), raw);
    w.db.prepare("INSERT INTO opus_reviews(repo,number,head_oid,at,model,mode,base_head,verdict,sure,reason) VALUES('app',1,'bbbbbbb2222',?,'carried','carried','aaaaaaa1111','take',1,'carried')").run(T1);
    assert.equal(postSource(w.db, "app", 1, "bbbbbbb2222")!.serving_metadata, raw);
    assert.equal(postCandidates(w.db, "app")[0]!.serving_metadata, raw);
    let posted = "";
    const querier = { ...w.gh.querier, query: async (query: string, variables: object) => {
      if (query.includes("addPullRequestReview")) { posted = (variables as { body: string }).body; return { addPullRequestReview: { pullRequestReview: { id: "SYNTHETIC-REVIEW" } } }; }
      return w.gh.querier.query(query, variables);
    } };
    const result = await runReviewPost(w.db, { repo: "app", dryRun: false }, () => {}, { querier, now: () => new Date(T1) });
    assert.deepEqual(result.posted, ["app#1"]); expectActual(posted);
    w.db.prepare("UPDATE opus_reviews SET serving_metadata=? WHERE head_oid='aaaaaaa1111'").run('{"schema":9,"private":"NEVER-ECHO"}');
    const source = postSource(w.db, "app", 1, "bbbbbbb2222")!;
    const unknown = noteLine(storedNote({ by: "model", kind: "review", model: source.model }, source.serving_metadata));
    assert.match(unknown, /Model unknown/); assert.doesNotMatch(unknown, /Opus|NEVER-ECHO/);
  } finally { w.close(); w.db.close(); }
});

test("automatic and manually selected postmerge findings retain exact review attribution through filing", async () => {
  const w = world().repo();
  try {
    const findings = JSON.stringify([{ severity: "defect", title: "Synthetic boundary mismatch", body: "A synthetic boundary is not checked.", file: null, line: null, duplicate_of: null, missed_by: "review", missed_why: "Synthetic fixture" }]);
    w.db.prepare("INSERT INTO postmerge_reviews(repo,number,merge_sha,at,model,findings,serving_metadata) VALUES('app',1,'synthetic',?,'opus',?,?)").run(T0, findings, raw);
    assert.equal(reviewOf(w.db, "app", 1)!.serving_metadata, raw);
    assert.equal(pendingDefects(w.db, "app")[0]!.serving_metadata, raw);
    let posted = "";
    const exec: Exec = async (_cmd, args, options) => {
      assert.deepEqual(args.slice(0, 2), ["issue", "create"]); posted = options?.input ?? "";
      return { code: 0, stdout: "https://github.com/storytold/app/issues/99\n", stderr: "" };
    };
    const result = await fileFinding(w.db, "app#1", 0, () => {}, { exec, now: () => new Date(T1), fileExists: async () => true });
    assert.equal(result.kind, "filed"); expectActual(posted);
  } finally { w.close(); w.db.close(); }
});

test("operator decision and card notes use the exact stored choice or turn, while legacy null stays unchanged", () => {
  const db = connect(":memory:");
  try {
    ask(db, [{ id: "synthetic", kind: "scope", repo: "app", number: 1, question: "Synthetic?", options: [{ key: "take", label: "Take" }, { key: "close", label: "Close" }] }]);
    db.prepare("UPDATE decisions SET recommended_by='opus' WHERE id='synthetic'").run();
    assert.equal(noteLine(decisionNote(getDecision(db, "synthetic")!)), "_AI-generated reply (Opus)_");
    db.prepare("UPDATE decisions SET serving_metadata=? WHERE id='synthetic'").run(raw);
    expectActual(noteLine(decisionNote(getDecision(db, "synthetic")!)));
    const turn = db.prepare("INSERT INTO conversation_turns(repo,number,kind,login,at,body,block,serving_metadata) VALUES('app',1,'opus','opus',?,'synthetic','synthetic',?)").run(T0, raw);
    const card = { repo: "app", number: 1, turn_id: Number(turn.lastInsertRowid) };
    expectActual(noteLine(cardNote(db, card)));
    db.prepare("INSERT INTO decision_choices(id,decision_id,repo,number,stamp,source,drafts,pick,created_at,serving_metadata) VALUES('choice','synthetic','app',1,'fixture','prepare','{}','{}',?,?)").run(T0, '{"schema":9,"private":"NEVER-ECHO"}');
    const unknown = noteLine(cardNote(db, { ...card, choice_id: "choice" }));
    assert.match(unknown, /Model unknown/); assert.doesNotMatch(unknown, /Opus|NEVER-ECHO/);
    db.prepare("UPDATE decision_choices SET serving_metadata=NULL WHERE id='choice'").run();
    assert.match(noteLine(cardNote(db, { ...card, choice_id: "choice" })), /Opus/);
    assert.equal((db.prepare("SELECT kind FROM conversation_turns WHERE id=?").get(card.turn_id) as { kind: string }).kind, "opus");
  } finally { db.close(); }
});

test("security landing attributes the stored patch separately from discovery and works after rounds were cleared", async () => {
  const db = connect(":memory:");
  try {
    const sha = "a".repeat(40);
    db.prepare("INSERT INTO security_findings(repo,number,scan_id,area,title,severity,state,refs,reach,impact,fingerprint,fix_commit,fix_title,fix_summary,fix_branch,created_at,updated_at,serving_metadata,fix_serving_metadata) VALUES('app',1,1,'fixture','Synthetic length','high','landing','[]','synthetic','synthetic','fixture',?,'Check length','Compare with remaining data.','fix-check-length',?,?,?,?)").run(sha, T0, T0, '{"schema":9}', raw);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM security_fix_rounds").get() as { n: number }).n, 0);
    let posted = "";
    const exec: Exec = async (cmd, args, options) => {
      const line = args.join(" ");
      if (cmd === "git") return { code: 0, stdout: "", stderr: "" };
      if (line.includes("--jq .parent.full_name")) return { code: 0, stdout: "storytold/app\n", stderr: "" };
      if (args[0] === "pr" && args[1] === "create") { posted = options?.input ?? ""; return { code: 0, stdout: "https://github.com/storytold/app/pull/99\n", stderr: "" }; }
      return { code: 0, stdout: "", stderr: "" };
    };
    const result = await runLand(db, "app", 1, { operator: "synthetic" }, { exec, root: ".", who: async () => ({ login: "pipeline-bot" }), log: () => {} });
    assert.match(result, /pull request 99 opened/); expectActual(posted);
  } finally { db.close(); }
});
