import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPatch, patchProblem, repositoryShaped, UNTRUSTED_TREE } from "../src/worker/patch.ts";

const head = "diff --git a/x b/x\n";
const change = "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-one\n+two\n";

/** A task directory with `src/a.txt`; `embed` adds what makes git take `src` for a bare repository whose config starts a command. */
function taskDir(embed: boolean): { dir: string; src: string; marker: string } {
  const dir = mkdtempSync(join(tmpdir(), "worker-patch-"));
  const src = join(dir, "src");
  const marker = join(dir, "host-marker");
  mkdirSync(src);
  writeFileSync(join(src, "a.txt"), "one\n");
  if (embed) {
    for (const d of ["objects", "refs", "info"]) mkdirSync(join(src, d));
    writeFileSync(join(src, "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(src, "config"), `[filter "x"]\n\tclean = "echo ran >> ${marker}; cat"\n`);
    writeFileSync(join(src, "info", "attributes"), "* filter=x\n");
  }
  return { dir, src, marker };
}

test("a source tree shaped like a git repository is refused before git runs, and its config starts nothing", async () => {
  const t = taskDir(true);
  try {
    assert.equal(repositoryShaped(t.src), true);
    assert.match((await applyPatch(change, t.src, t.dir)) ?? "", /^patch refused: the source tree is shaped like a git repository/);
    assert.equal(existsSync(t.marker), false);
    assert.equal(readFileSync(join(t.src, "a.txt"), "utf8"), "one\n");
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("a tree that holds .git is refused too, and git is told to ignore a bare repository it finds by itself", () => {
  const t = taskDir(false);
  try {
    assert.equal(repositoryShaped(t.src), false);
    mkdirSync(join(t.src, ".git"));
    assert.equal(repositoryShaped(t.src), true);
    assert.ok(UNTRUSTED_TREE.join(" ").includes("safe.bareRepository=explicit"));
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("an ordinary source tree still takes its patch", async () => {
  const t = taskDir(false);
  try {
    assert.equal(await applyPatch(change, t.src, t.dir), null);
    assert.equal(readFileSync(join(t.src, "a.txt"), "utf8"), "two\n");
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("a patch is refused unless every mode is a regular file mode", () => {
  assert.equal(patchProblem(`${head}new file mode 100644\nindex 0000000..e69de29\n--- /dev/null\n+++ b/x\n`), null);
  assert.equal(patchProblem(`${head}index e69de29..0123456 100755\n--- a/x\n+++ b/x\n`), null);
  assert.ok(patchProblem(`${head}new file mode 0120000\n--- /dev/null\n+++ b/x\n`));
  assert.ok(patchProblem(`${head}new file mode 120000\n`));
  assert.ok(patchProblem(`${head}index e69de29..0123456 160000\n`));
  assert.ok(patchProblem(`${head}new mode 100666\n`));
});
