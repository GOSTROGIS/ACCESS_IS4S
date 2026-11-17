import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec, Git } from "../src/fixup/git.ts";
import { parsePlanReply, patchFor } from "../src/verify/plan.ts";
import { tasksFor } from "../src/verify/tasks.ts";

test("a regression test is named after its item, in the patch and in the cargo target", () => {
  const crates = [{ name: "x", dir: "crates/x" }];
  const reply = JSON.stringify([{ ref: "app#14", kind: "regression", reason: "r", crate: "x", test_file: "#[test]\nfn t() {}\n" }]);
  const p = parsePlanReply(reply, "app#14", crates, "bugfix");
  assert.ok(p.ok && p.plan.kind === "regression");
  if (!p.ok || p.plan.kind !== "regression") return;
  assert.equal(p.plan.patch, patchFor("crates/x", "autocraft_regression_14", "#[test]\nfn t() {}\n"));
  assert.match(p.plan.patch, /^diff --git a\/crates\/x\/tests\/autocraft_regression_14\.rs /);
  const steps = tasksFor(p.plan, { repo: "app", number: 14, head: "h", base: "b" })[0]!.plan;
  assert.deepEqual(steps.find((s) => s.name === "test")!.cmd.slice(-2), ["--test", "autocraft_regression_14"]);
});

test("a refused patch reports the error lines of git apply, not its progress line", async () => {
  const dir = mkdtempSync(join(tmpdir(), "regname-"));
  try {
    const g = (...a: string[]) => execFileSync("git", ["-C", join(dir, "r"), ...a], { encoding: "utf8" }).trim();
    mkdirSync(join(dir, "r"));
    execFileSync("git", ["init", "-q", join(dir, "r")]);
    writeFileSync(join(dir, "r", "a.rs"), "x\n");
    g("add", "."); g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "m");
    const patch = patchFor(".", "autocraft_regression_1", "y").replace("tests/autocraft_regression_1.rs", "a.rs").replaceAll("tests/autocraft_regression_1.rs", "a.rs");
    const r = await new Git(exec, dir, "r/.git").applyToTree("HEAD", patch, join(dir, "idx"));
    assert.ok(!r.ok);
    if (!r.ok) assert.match(r.reason, /^git apply --check: a\.rs: already exists in index/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
