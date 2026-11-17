// The reply-lint fix turn is one tool-less turn that returns only the flagged fields, merged into the first reply;
// problems only in internal text skip it.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { askClaude, setRunner } from "../src/classify/run.ts";
import { connect } from "../src/db.ts";
import { SAMPLE_OPUS_PRS } from "../src/prompts/samples.ts";
import { mergeFixFields, type Lint } from "../src/replylint.ts";
import { useTestAccount } from "./accounts-fixture.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "lint-fix-"));
process.env.AUTOCRAFT_CLAUDE_BIN = "/usr/bin/true";

describe("reply lint fix turn", () => {
  const db = connect(join(dir, "t.db"));
  const box = useTestAccount(db);
  mkdirSync(box.configDir + "t", { recursive: true });
  writeFileSync(join(box.configDir + "t", ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "a", refreshToken: "b", expiresAt: Date.now() + 6 * 3600_000 } }));
  const first = JSON.stringify({ verdict: "take", summary: "too long", why: "fine.", public: { summary: "ok", points: ["a leaky point", "second"] } });
  const result = (text: string) => JSON.stringify({ type: "result", result: text, session_id: "s1", num_turns: 1, usage: {} });

  const run = async (lint: Lint, fixReply: string) => {
    const calls: string[][] = [];
    const messages: string[] = [];
    const restore = setRunner(async (_cmd, args, stdin) => {
      calls.push(args);
      messages.push(stdin);
      return { code: 0, stdout: result(calls.length === 1 ? first : fixReply), stderr: "" };
    });
    try {
      const r = await askClaude("review.opus", "opus", SAMPLE_OPUS_PRS, db, { checkout: dir, lint });
      return { r: r!, calls, messages };
    } finally { restore(); }
  };

  test("the fix turn has no tool permission and one turn, asks for the flagged field only and merges it", async () => {
    const lint: Lint = (text, stage) => (stage === "first" ? [{ field: "public.points[0]", message: "mentions the reference folder", text: "a leaky point" }] : JSON.parse(text).public.points[0] === "clean point" ? [] : null);
    const { r, calls, messages } = await run(lint, '{"public.points[0]": "clean point"}');
    assert.equal(calls.length, 2);
    assert.ok(calls[1]!.includes("--resume"));
    assert.ok(!calls[1]!.includes("--allowedTools"), "no tool is allowed");
    assert.equal(calls[1]![calls[1]!.indexOf("--max-turns") + 1], "1");
    assert.ok(calls[0]!.includes("--allowedTools"));
    assert.match(messages[1]!, /public\.points\[0\]/);
    assert.ok(!messages[1]!.includes("verdict"), "only the flagged field is named");
    const merged = JSON.parse(r.text);
    assert.deepEqual(merged.public.points, ["clean point", "second"]);
    assert.equal(merged.summary, "too long", "the rest stays as the first turn wrote it");
    assert.equal(r.fixTurn, true);
    assert.deepEqual(r.problems, []);
  });

  test("a fix reply that is not the flagged fields leaves the first reply in place, with every check run on it", async () => {
    // The first stage puts off the slow check (the second problem); the first reply is then linted in full.
    const lint: Lint = (_t, stage) => [{ field: "public.points[0]", message: "m", text: "a leaky point" }, ...(stage === "fix" ? [{ field: "public.points[1]", message: "slow", text: "second" }] : [])];
    const { r } = await run(lint, "Sorry, here is a long prose answer.");
    assert.equal(r.text, first);
    assert.deepEqual(r.problems?.map((p) => p.field), ["public.points[0]", "public.points[1]"]);
  });

  test("problems only in internal text skip the fix turn", async () => {
    const lint: Lint = () => [{ field: "reason", message: "m", internal: true }];
    const { r, calls } = await run(lint, "{}");
    assert.equal(calls.length, 1);
    assert.equal(r.text, first);
    assert.equal(r.problems?.length, 1);
    assert.equal(r.fixTurn, undefined);
  });
});

describe("mergeFixFields in fenced replies", () => {
  const problems = (...fields: string[]) => fields.map((field) => ({ field, message: "m" }));
  test("a prepare reply keeps its prose and gets the corrected field inside the choices block", () => {
    const reply = 'Summary line.\n\n```choices\n{"cores":[{"id":"merge","reason":"leaky"}],"ask":{"text":"keep"}}\n```\n';
    const out = mergeFixFields(reply, '{"cores[0].reason": "clean"}', problems("cores[0].reason"))!;
    assert.ok(out.startsWith("Summary line.\n\n```choices\n"));
    const block = JSON.parse(/```choices\n([\s\S]*?)\n```/.exec(out)![1]!);
    assert.deepEqual(block, { cores: [{ id: "merge", reason: "clean" }], ask: { text: "keep" } });
  });

  test("a conversation reply with two fenced blocks patches each block and keeps the rest", () => {
    const reply = 'Here is my answer.\n\n```choices\n{"ask":{"text":"leaky ask"}}\n```\n\nMore prose.\n\n```actions\n[{"kind":"resolution","text":"leaky card"},{"kind":"resolution","text":"fine"}]\n```';
    const out = mergeFixFields(reply, '{"cards[0].text": "clean card", "ask.text": "clean ask"}', problems("cards[0].text", "ask.text"))!;
    assert.ok(out.startsWith("Here is my answer.") && out.includes("\n\nMore prose.\n\n"));
    assert.deepEqual(JSON.parse(/```choices\n([\s\S]*?)\n```/.exec(out)![1]!), { ask: { text: "clean ask" } });
    assert.deepEqual(JSON.parse(/```actions\n([\s\S]*?)\n```/.exec(out)![1]!), [{ kind: "resolution", text: "clean card" }, { kind: "resolution", text: "fine" }]);
    assert.equal(mergeFixFields(reply, '{"cards[7].text": "x"}', problems("cards[7].text")), null);
  });
});
