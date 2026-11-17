// What keeps a PR off the merge rule by its diff: README or brand files, third-party links in docs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sensitiveReasons } from "../src/core/sensitive.ts";

const diff = (path: string, ...added: string[]) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1,${added.length} @@\n${added.map((l) => `+${l}`).join("\n")}\n`;

test("sensitive content", () => {
  assert.deepEqual(sensitiveReasons(diff("docs/Readme.md", "text"), "storytold"), ["changes the README"]);
  assert.deepEqual(sensitiveReasons(diff("docs/brand/mark.svg", "<svg/>"), "storytold"), ["changes brand files"]);
  assert.deepEqual(sensitiveReasons(diff("docs/guide.md", "![badge](https://img.shields.io/x.svg)"), "storytold"), ["adds a third-party image or link"]);
  assert.deepEqual(sensitiveReasons(diff("docs/guide.md", "see https://github.com/storytold/app and https://storytold.github.io/x"), "storytold"), []);
  for (const l of ["see //evil.example/x", "see www.evil.example", "see &#x68;ttps&colon;&sol;&sol;evil.example", "see https:\\\\evil.example", "see https://github.com/other/repo"]) {
    assert.deepEqual(sensitiveReasons(diff("docs/guide.md", l), "storytold"), ["adds a third-party image or link"], l);
  }
  // Code, even with a URL in it, and removed lines do not count.
  assert.deepEqual(sensitiveReasons(diff("src/a.ts", "fetch('https://example.com')"), "storytold"), []);
  assert.deepEqual(sensitiveReasons("diff --git a/a.md b/a.md\n--- a/a.md\n+++ b/a.md\n@@ -1 +0,0 @@\n-https://example.com\n", "storytold"), []);
});
