import assert from "node:assert/strict";
import { test } from "node:test";
import { noteLine, storedNote } from "../src/github/note.ts";
import { withNote } from "../src/github/note.ts";
import { connect } from "../src/db.ts";
import { repostAsk } from "../src/fixup/index.ts";
import { askText } from "../src/fixup/template.ts";

test("reposting a stored result uses durable serving identity while preserving legacy text and explicit unknown", () => {
  const note = { by: "model", kind: "comment", model: "opus" } as const;
  assert.equal(noteLine(storedNote(note, null)), noteLine(note));
  const raw = JSON.stringify({ schema: 1, provider: "codex", runs: [731], models: [{ model: "gpt-actual", reasoningEfforts: ["high", null] }] });
  const actual = noteLine(storedNote(note, raw));
  assert.match(actual, /AI-generated comment \(Codex · gpt-actual \(high, unreported effort\)\)/);
  assert.doesNotMatch(actual, /Opus|731/);
  const unknown = noteLine(storedNote(note, '{"schema":8,"payload":"never-echo"}'));
  assert.match(unknown, /Model unknown/);
  assert.doesNotMatch(unknown, /Opus|never-echo/);
  assert.equal(noteLine(storedNote({ by: "fixed" }, raw)), noteLine({ by: "fixed" }));
});

test("the actual fixup repost reader recognizes an unchanged stored Codex note without a model call or outbound write", async () => {
  const db = connect(":memory:");
  try {
    const raw = JSON.stringify({ schema: 1, provider: "codex", runs: [731], models: [{ model: "gpt-actual", reasoningEfforts: ["high"] }] });
    const fixes = [{ file: "src/example.ts", change: "Handle empty input." }];
    db.prepare("INSERT INTO opus_reviews(repo,number,head_oid,at,model,mode,verdict,fixes,serving_metadata) VALUES ('app',1,'head','2026-01-01','opus','full','take-fix',?,?)").run(JSON.stringify(fixes), raw);
    db.exec("INSERT INTO fixups(repo,number,from_head,state,attempt,created_at) VALUES ('app',1,'head','asked',1,'2026-01-01')");
    const old = withNote(storedNote({ by: "model", kind: "comment", model: "opus" }, raw), askText(fixes));
    db.prepare("INSERT INTO audit(at,login,action,target,details) VALUES ('2026-01-01','fixture','fixup-comment','app#1',?)").run(JSON.stringify({ state: "done", url: "https://github.com/example/app/pull/1#issuecomment-7", text: old }));
    const result = await repostAsk(db, "app", 1, false, async () => { throw Error("no outbound fixture calls"); });
    assert.equal(result.status, "unchanged");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM agent_runs").get()!.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM audit").get()!.n, 1);
  } finally { db.close(); }
});
