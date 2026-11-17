import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { describe, test } from "node:test";
import { recountHunks, validatePatch } from "../src/fixup/patch.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const wrap = (file: string, header: string, body: string) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n${header}\n${body}`;

describe("hunk recount", () => {
  test("a miscounted header is repaired and the patch passes", () => {
    const body = " keep\n-a\n+b\n+c\n keep2\n";
    for (const header of ["@@ -1,2 +1,2 @@", "@@ -1,9 +1,9 @@", "@@ -1 +1 @@"]) {
      const r = validatePatch(wrap("src/lib.rs", header, body), ["src/lib.rs"]);
      assert.ok(r.ok, header);
      assert.match(r.patch, /^@@ -1,3 \+1,4 @@$/m);
      assert.equal(r.changed, 3);
    }
  });

  test("two hunks and a function-name suffix keep their own counts", () => {
    const p = recountHunks(wrap("a.rs", "@@ -1,1 +1,1 @@ fn x()", "-a\n+b\n@@ -10,1 +10,1 @@\n c\n-d\n+e\n"));
    assert.match(p, /@@ -1,1 \+1,1 @@ fn x\(\)/);
    assert.match(p, /@@ -10,2 \+10,2 @@/);
  });


});
