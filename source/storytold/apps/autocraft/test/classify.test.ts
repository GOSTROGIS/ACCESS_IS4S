import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderJev } from "../src/prompts/index.ts";
import { itemInput, jevVerdict, parseHaikuReply, parseRefereeReply, type Item } from "../src/classify/parse.ts";

const refs = ["a#1", "a#2", "a#3"];

describe("haiku reply", () => {
  test("accepts fenced JSON and reports items that are missing or invalid", () => {
    const reply = "```json\n" + JSON.stringify([
      { ref: "a#1", type_label: "bugfix", security: true, needs_decision: false, reason: "fixes a crash" },
      { ref: "a#2", type_label: "feature", security: false, needs_decision: false, reason: "bad label" },
      { ref: "zzz#9", type_label: "infra", security: false, needs_decision: false, reason: "not asked" },
    ]) + "\n```";
    const { verdicts, missing } = parseHaikuReply(reply, refs);
    assert.deepEqual(verdicts.map((v) => v.ref), ["a#1"]);
    assert.deepEqual(missing, ["a#2", "a#3"]);
  });

  test("rejects text that is not JSON", () => {
    assert.deepEqual(parseHaikuReply("Sorry, I cannot.", refs).verdicts, []);
    assert.deepEqual(parseRefereeReply("[oops", refs), []);
  });
});

describe("jev", () => {
  const answers = {
    type: { choice: "performance", confidence: 0.8, probabilities: { performance: 0.8, bugfix: 0.2 } },
    security: { noul: 0.95 }, needs_decision: { noul: 0.1 },
  };
  test("maps an answer to a classification row with probabilities kept", () => {
    const v = jevVerdict("a#1", answers)!;
    assert.equal(v.type_label, "performance");
    assert.equal(v.security, true);
    assert.equal(v.needs_decision, false);
    assert.equal(JSON.parse(v.probs!).top, 0.8);
  });
  test("drops an answer with an unknown label or a missing question", () => {
    assert.equal(jevVerdict("a#1", { ...answers, type: { choice: "other" } }), null);
    assert.equal(jevVerdict("a#1", { type: answers.type }), null);
  });
  test("item text goes in the state as data, cut to 4000 characters", () => {
    const item: Item = { repo: "a", number: 1, kind: "pr", title: "t", body: "x".repeat(5000), lines_changed: 10, files_changed: 2, author_association: "NONE" };
    assert.equal((itemInput(item).body as string).length, 4000);
    const req = JSON.parse(renderJev("classify.jev", item)) as { state: string };
    assert.equal(JSON.parse(req.state).files_changed, 2);
  });
});

describe("settle without Jev", () => {
});
