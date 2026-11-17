import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkFormat, findingsOf, formatErrorFindings, lintPlan } from "../src/prepush/index.ts";

const PATCH = "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1,3 +1,4 @@\n fn a() {}\n fn b() {}\n+fn c(){ }\n fn d() {}\n";
const diag = (line: number) => JSON.stringify({ reason: "compiler-message", message: { level: "warning", message: "needless", code: { code: "clippy::needless_return" }, spans: [{ file_name: "src/lib.rs", line_start: line, line_end: line, is_primary: true }], rendered: "warning: needless\n" } });

describe("prepush", () => {
  test("a clippy diagnostic counts only on a line the patch added", () => {
    const f = findingsOf(`${diag(1)}\n${diag(3)}\n{"reason":"build-finished","success":true}\n`, "", PATCH);
    assert.deepEqual(f.map((x) => [x.file, x.line, x.code]), [["src/lib.rs", 3, "clippy::needless_return"]]);
  });

  test("under -D warnings an unused import on an untouched line is not a finding, a compile error anywhere is", () => {
    const rustc = (code: string, line: number) => JSON.stringify({ reason: "compiler-message", message: { level: "error", message: "m", code: { code }, spans: [{ file_name: "src/lib.rs", line_start: line, line_end: line, is_primary: true }], rendered: "error\n" } });
    const f = findingsOf(`${rustc("unused_imports", 1)}\n${rustc("E0425", 1)}\n`, "", PATCH);
    assert.deepEqual(f.map((x) => x.code), ["E0425"]);
  });

  test("a file rustfmt cannot parse is a finding and the clippy step stays in the plan", () => {
    const f = formatErrorFindings("@@ src/lib.rs\nerror: expected item, found `}`\n --> b/src/lib.rs:4:1\n");
    assert.deepEqual(f.map((x) => [x.file, x.level]), [["src/lib.rs", "error"]]);
    assert.match(f[0]!.rendered, /expected item/);
    assert.deepEqual(lintPlan(["src/lib.rs"])!.map((s) => s.name), ["fetch deps", "format", "clippy"]);
  });

  test("a failed build without diagnostics is one finding; a formatter diff folds in only when it is whitespace", () => {
    assert.equal(findingsOf("", "error: could not find Cargo.toml", PATCH)[0]!.rendered, "error: could not find Cargo.toml");
    const fmt = "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -2,3 +2,3 @@\n fn b() {}\n-fn c(){ }\n+fn c() {}\n fn d() {}\n";
    const ok = checkFormat(PATCH, fmt);
    assert.ok(ok.ok && ok.patch === PATCH + fmt);
    const bad = checkFormat(PATCH, fmt.replace("+fn c() {}", "+fn e() {}"));
    assert.ok(!bad.ok);
  });
});
