// Reply lint and the fix turn: problems of a parsed reply go back to the model as one follow-up message on the same
// session; what is still wrong afterwards falls back to leaving the text out. Model and Jev calls are fakes.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { SCRATCH } from "./scratch.ts";
import { setWorkspace } from "../src/classify/run.ts";
import { quotesReference, type SemanticDeps } from "../src/reference-lint.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "reply-lint-"));
process.env.AUTOCRAFT_DB = join(dir, "data", "t.db");
process.env.AUTOCRAFT_CLAUDE_BIN = "/bin/true";
process.env.AUTOCRAFT_CHECKOUT_DIR = join(dir, "checkouts");
process.env.AUTOCRAFT_CLAUDE_CWD = join(dir, "cwd");
process.env.AUTOCRAFT_DIFF_CACHE = join(dir, "diffs");
mkdirSync(join(dir, "data", "reference", "app"), { recursive: true });
const REFERENCE_TEXT = "To resize a picture hold the shift key while you drag any corner handle of the picture and release the mouse button when the preview shows the size you want";
writeFileSync(join(dir, "data", "reference", "app", "p0001.txt"), `Chapter one\n${REFERENCE_TEXT}\nMore text here.\n`);
setWorkspace(async () => []);
const checkout = join(dir, "co");
mkdirSync(checkout);



/** Answers the k-th call with replies[k]; every result carries a session id. */


describe("review.opus lint", () => {









});

describe("semantic reference check", () => {
  const deps = (jev: number | null, haiku: boolean | null, usable = true) => {
    const calls = { jev: 0, haiku: 0 };
    const d: SemanticDeps = { async jev() { calls.jev++; return jev; }, async haiku() { calls.haiku++; return haiku; }, jevUsable: () => usable };
    return { d, calls };
  };
});

describe("lint survives a failing model check", () => {
  const ref = join(dir, "data", "reference", "app");
  const quote = REFERENCE_TEXT.split(" ").slice(0, 13).join(" ");
});

describe("verbatim reference check", () => {
  const ref = join(dir, "data", "reference", "app");
  test("a passage of the reference pages counts, whatever the case and spacing", () => {
    const run = REFERENCE_TEXT.split(" ").slice(3, 15).join("  ").toUpperCase();
    assert.equal(quotesReference(`The text says: ${run}, and more.`, ref), true);
    assert.equal(quotesReference(REFERENCE_TEXT.split(" ").slice(3, 14).join(" "), ref), true, "11 words of a page are a quote");
    assert.equal(quotesReference(REFERENCE_TEXT.split(" ").slice(3, 7).join(" "), ref), false, "4 words are not");
    assert.equal(quotesReference("Hold shift and drag a corner to resize it, then let go of the mouse.", ref), false);
  });
});

describe("conversation.turn lint", () => {
});
