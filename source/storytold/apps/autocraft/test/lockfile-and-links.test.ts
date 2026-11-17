import { test } from "node:test";
import assert from "node:assert/strict";
import { spliceSections } from "../src/fixup/patch.ts";
import { ownerOf } from "../src/owners.ts";
import { reviewBody, stripLinks } from "../src/review/post-template.ts";

const conflicted = (a: string[], b: string[]) => `top\n<<<<<<< ours\n${a.join("\n")}\n=======\n${b.join("\n")}\n>>>>>>> theirs\nbottom\n`;

test("a lockfile conflict is resolved only with the lines of one side", () => {
  const text = conflicted(['version = "1.0.1"', 'checksum = "aaa"'], ['version = "1.0.2"', 'checksum = "bbb"']);
  assert.equal(spliceSections(text, ['version = "1.0.2"\nchecksum = "bbb"'], "Cargo.lock"), 'top\nversion = "1.0.2"\nchecksum = "bbb"\nbottom\n');
  assert.equal(spliceSections(text, ['version = "1.0.1"\nchecksum = "bbb"'], "Cargo.lock"), null, "mixed sides");
  assert.equal(spliceSections(text, ['checksum = "aaa"\nversion = "1.0.1"'], "Cargo.lock"), null, "reordered");
  assert.equal(spliceSections(text, ['version = "1.0.1"'], "Cargo.lock"), null, "a subset");
  assert.equal(spliceSections(text, [""], "Cargo.lock"), null, "empty while a side has lines");
  assert.equal(spliceSections(text, ['version = "1.0.3"'], "sub/pnpm-lock.yaml"), null, "a new line");
  assert.notEqual(spliceSections(text, ['version = "1.0.3"'], "src/notes.txt"), null, "other files keep the looser rule");
});

test("posted review text keeps links to the repo's own owner and drops the rest", () => {
  const s = "See [the docs](https://example.com/x) and https://evil.test/a. Also [the PR](https://github.com/acme/app/pull/3) and https://github.com/acme/lib/issues/1, not https://github.com.evil.test/acme or [t](https://github.com/other/r).";
  assert.equal(
    stripLinks(s, "acme"),
    "See the docs and (link removed). Also [the PR](https://github.com/acme/app/pull/3) and https://github.com/acme/lib/issues/1, not (link removed) or t.",
  );
  const body = reviewBody({ verdict: "take", sure: true, summary: "[x](https://example.com)", points: ["go to https://example.com"], head: "abcdef0", owner: "acme", recommendation: "Recommendation: merge." });
  assert.ok(!body.includes("example.com") && body.includes("(link removed)"));
});

test("a bare tracked repo name keeps links to its owner's github.com paths", () => {
  const url = `https://github.com/${ownerOf("somerepo")}/somerepo/pull/3`;
  assert.equal(stripLinks(url, ownerOf("somerepo")), url);
  assert.equal(stripLinks(url, "somerepo"), "(link removed)");
});
