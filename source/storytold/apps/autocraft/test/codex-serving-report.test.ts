import assert from "node:assert/strict";
import { test } from "node:test";
import { compareReport, type Pair, type Row } from "../src/classify/report.ts";

const row = (classifier: string, serving_metadata?: string | null): Row => ({ repo: "app", number: 1, title: "fixture", kind: "pr", classifier, type_label: "bug", flags: [], reason: "fixture", top: 0.99, serving_metadata });
const pair = (metadata?: string | null): Pair => ({ r: row("jev"), jev: row("jev"), haiku: row("haiku", metadata), ref: "bug" });
test("classification report uses durable actual serving labels while retaining legacy logical classifier keys", () => {
  assert.match(compareReport([pair()]), /Jev vs Haiku, type label/);
  const actual = JSON.stringify({ schema: 1, provider: "codex", runs: [92], models: [{ model: "gpt-actual", reasoningEfforts: ["high"] }] });
  const known = compareReport([pair(actual)]);
  assert.match(known, /Jev vs Codex · gpt-actual \(high\), type label/);
  assert.doesNotMatch(known, /Haiku|\b92\b/);
  assert.match(compareReport([pair('{"schema":8,"secret":"never-echo"}')]), /Jev vs Model unknown/);
  assert.doesNotMatch(compareReport([pair('{"schema":8,"secret":"never-echo"}')]), /never-echo|Haiku/);
  const mixed = [pair(actual), { ...pair(), r: { ...row("jev"), number: 2 } }];
  assert.match(compareReport(mixed), /Jev vs Model unknown/);
  assert.equal(pair(actual).haiku.classifier, "haiku");
});
