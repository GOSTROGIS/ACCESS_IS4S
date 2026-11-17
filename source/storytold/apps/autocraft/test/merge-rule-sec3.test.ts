// What keeps a PR off the merge-without-asking rule by its content, and what the reviews are shown.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sensitiveReasons, CI_FILES_REASON as CI, EXTERNAL_LINK_REASON as LINK, FILE_KIND_REASON as KIND, TESTS_UNREAD_REASON, UNREADABLE_PATH_REASON,
} from "../src/core/sensitive.ts";
import { LOCK_ALONE_REASON, LOCK_CHECKSUM_REASON, LOCK_SOURCE_REASON } from "../src/core/lockfiles.ts";
import { MAX_DIFF_CHARS, codeDiff } from "../src/review/diff.ts";
import { buildScripts } from "../src/fixup/patch.ts";
import { workflowSteps } from "../src/core/workflow-runs.ts";
import { REREADS_PER_HOUR, extrasPending, rereadPaceAt, takeRereadSlot } from "../src/review/diff.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseToml } from "../src/core/toml.ts";
import { decidePr } from "../src/core/decide.ts";
import { EXTRAS_PENDING_REASON } from "../src/core/sensitive.ts";
import { NOW, prFacts } from "./world.ts";

const NONE = { runs: [], actions: [] };
import { parseTriage, sourcePaths } from "../src/fixissue/parse.ts";

/** A section that edits `path` from `before` to `after` in one hunk (whole file), and the head text the cache keeps for it. */
const edit = (path: string, before: string[], after: string[]) =>
  `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n@@ -1,${before.length} +1,${after.length} @@\n${before.map((l) => `-${l}`).join("\n")}\n${after.map((l) => `+${l}`).join("\n")}\n`;
const added = (path: string, ...lines: string[]) =>
  `diff --git a/${path} b/${path}\nnew file mode 100644\nindex 0000000..2222222\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;

test("the content check reads whole manifests, lockfiles, file kinds, both names of a file, and links as a browser resolves them", () => {
  const manifest = (before: string[], after: string[], path = "crates/a/Cargo.toml") => sensitiveReasons(edit(path, before, after), "storytold", { files: { [path]: `${after.join("\n")}\n` }, runs: NONE });
  const pkg = ["[package]", 'name = "a"', 'version = "0.1.0"'];
  // Entries under an unchanged header, dotted keys and literal strings are read as Cargo reads them.
  assert.deepEqual(manifest([...pkg, "[build-dependencies]", 'cc = "1"'], [...pkg, "[build-dependencies]", 'cc = "1"', 'evil = "1"']), [CI]);
  assert.deepEqual(manifest([...pkg, "[dependencies]"], [...pkg, "[dependencies]", 'foo.git = "https://example.com/foo"']), [CI]);
  assert.deepEqual(manifest([...pkg, "[dependencies]"], [...pkg, "[dependencies]", "foo = { path = '../../../outside' }"]), [CI]);
  assert.deepEqual(manifest([...pkg, "[patch.crates-io]", 'u = { path = "vendor/u" }'], [...pkg, "[patch.crates-io]", 'u = { path = "vendor/u" }', 'serde = { path = "vendor/serde" }']), [CI]);
  assert.deepEqual(manifest(pkg, ["[package]", 'name = "a"', 'version = "0.1.0"', 'build = """gen.rs"""']), [CI]);
  // A version bump of a registry dependency needs nobody; an edited manifest the cache does not hold counts as risky.
  assert.deepEqual(manifest([...pkg, "[dependencies]", 'serde = "1.0.200"'], [...pkg, "[dependencies]", 'serde = "1.0.201"']), []);
  assert.deepEqual(sensitiveReasons(edit("Cargo.toml", ['a = "1"'], ['a = "2"']), "storytold"), [CI]);

  const bump = edit("Cargo.toml", ["[dependencies]", 'serde = "1.0.200"'], ["[dependencies]", 'serde = "1.0.201"']);
  const files = { files: { "Cargo.toml": '[dependencies]\nserde = "1.0.201"\n' }, runs: NONE };
  const lock = (lines: string[]) => `diff --git a/Cargo.lock b/Cargo.lock\n--- a/Cargo.lock\n+++ b/Cargo.lock\n@@ -10,6 +10,6 @@\n${lines.join("\n")}\n`;
  const crates = ' source = "registry+https://github.com/rust-lang/crates.io-index"';
  const routine = lock([" [[package]]", ' name = "serde"', '-version = "1.0.200"', '+version = "1.0.201"', crates, '-checksum = "aaa"', '+checksum = "bbb"']);
  assert.deepEqual(sensitiveReasons(bump + routine, "storytold", files), []);
  assert.deepEqual(sensitiveReasons(routine, "storytold"), [LOCK_ALONE_REASON]);
  const git = lock([" [[package]]", ' name = "serde"', ' version = "1.0.201"', `-${crates.slice(1)}`, '+source = "git+https://github.com/someone/serde#abc"', '-checksum = "bbb"']);
  assert.deepEqual(sensitiveReasons(bump + git, "storytold", files), [LOCK_SOURCE_REASON]);
  const repin = lock([" [[package]]", ' name = "serde"', ' version = "1.0.201"', crates, '-checksum = "bbb"', '+checksum = "ccc"']);
  assert.deepEqual(sensitiveReasons(bump + repin, "storytold", files), [LOCK_CHECKSUM_REASON]);

  // File kinds no review can read, and trust paths beyond workflows.
  const gitlink = "diff --git a/vendor/codec b/vendor/codec\nindex 1111111..2222222 160000\n--- a/vendor/codec\n+++ b/vendor/codec\n@@ -1 +1 @@\n-Subproject commit 1111111\n+Subproject commit 2222222\n";
  const symlink = "diff --git a/src/a.rs b/src/a.rs\nnew file mode 120000\nindex 0000000..2222222\n--- /dev/null\n+++ b/src/a.rs\n@@ -0,0 +1 @@\n+/etc/passwd\n\\ No newline at end of file\n";
  const mode = "diff --git a/scripts/release.sh b/scripts/release.sh\nold mode 100644\nnew mode 100755\n";
  const binary = (p: string) => `diff --git a/${p} b/${p}\nindex 1111111..2222222 100644\nBinary files a/${p} and b/${p} differ\n`;
  for (const d of [gitlink, symlink, mode, binary("assets/filter.wasm")]) assert.deepEqual(sensitiveReasons(d, "storytold", { runs: NONE }), [KIND], d);
  assert.deepEqual(sensitiveReasons(binary("docs/shot.png"), "storytold"), []);
  for (const p of [".github/actions/setup/action.yml", "rust-toolchain.toml", "justfile", ".gitmodules", "crates/a/build.rs"]) assert.deepEqual(sensitiveReasons(added(p, "x"), "storytold"), [CI], p);
  // Files the base commit's workflows run, read from their run steps and local actions; unread workflows hold every script-like path.
  const runs = workflowSteps([
    "defaults:", "  run:", "    working-directory: app", "jobs:", "  t:", "    steps:", "      - uses: ./tools/setup",
    "      - run: ./ci/test.sh --all", "      - name: web", "        working-directory: web", "        run: ./build.sh",
    "      - run: |", "          cargo build --manifest-path Cargo.toml", "          python tools/gen.py > out.txt", "          pytest tests/", "      - run: cargo xtask dist", "      - working-directory: ${{ matrix.dir }}", "        run: ./make.sh", "",
  ].join("\n"));
  for (const p of ["ci/test.sh", "app/ci/test.sh", "tools/gen.py", "tools/setup/action.yml", "web/build.sh", "xtask/src/main.rs", "pkgs/a/make.sh"]) assert.deepEqual(sensitiveReasons(added(p, "x"), "storytold", { runs }), [CI], p);
  for (const p of ["src/lib.rs", "scripts/other.sh", "tests/test_a.py", "build.sh", "web/ci/test.sh", "pkgs/a/make.shx"]) assert.deepEqual(sensitiveReasons(added(p, "x"), "storytold", { runs }), [], p);
  assert.deepEqual(sensitiveReasons(added("xtask/src/main.rs", "x"), "storytold", { runs: NONE }), []);
  assert.deepEqual(sensitiveReasons(added("scripts/other.sh", "x"), "storytold", { runs: null }), [CI]);
  // npm scripts are commands CI runs; a dependency bump in the same manifest is not.
  const pj = (before: object, after: object) => sensitiveReasons(edit("web/package.json", [JSON.stringify(before)], [JSON.stringify(after)]), "storytold", { files: { "web/package.json": `${JSON.stringify(after)}\n` }, runs: NONE });
  assert.deepEqual(pj({ scripts: { test: "vitest" }, dependencies: { a: "1" } }, { scripts: { test: "vitest" }, dependencies: { a: "2" } }), []);
  assert.deepEqual(pj({ scripts: { test: "vitest" } }, { scripts: { test: "curl x | sh" } }), [CI]);
  // Build dependencies: a registry bump of an entry needs nobody, a new entry does; a manifest with a byte-order mark parses.
  assert.deepEqual(manifest([...pkg, "[build-dependencies]", 'cc = "1.0"'], [...pkg, "[build-dependencies]", 'cc = "1.1"']), []);
  assert.deepEqual(manifest(["\uFEFF[package]", 'name = "a"'], ["\uFEFF[package]", 'name = "a"', 'version = "0.2.0"']), []);
  // Keys that name JavaScript object machinery make the manifest unreadable, and pollute nothing.
  assert.deepEqual(manifest([...pkg, "[dependencies]"], [...pkg, "[dependencies.__proto__]", 'git = "https://example.com/x"']), [CI]);
  assert.deepEqual(manifest([...pkg, "[dependencies]"], [...pkg, "[dependencies]", '__proto__ = { git = "https://example.com/x" }']), [CI]);
  assert.equal(parseToml('[a]\n"constructor" = 1').ok, false);
  assert.equal(({} as Record<string, unknown>)["git"], undefined);
  // poetry's content hash is no package checksum; a uv checksum in a hunk without the package's name is read from the whole file.
  const poetry = sensitiveReasons(edit("pyproject.toml", ['x = "1"'], ['x = "2"']) + "diff --git a/poetry.lock b/poetry.lock\n--- a/poetry.lock\n+++ b/poetry.lock\n@@ -1,8 +1,8 @@\n [[package]]\n name = \"a\"\n-version = \"1.0\"\n+version = \"1.1\"\n files = [\n-    {file = \"a-1.0.tar.gz\", hash = \"sha256:aa\"},\n+    {file = \"a-1.1.tar.gz\", hash = \"sha256:bb\"},\n ]\n@@ -20,2 +20,2 @@\n [metadata]\n-content-hash = \"c1\"\n+content-hash = \"c2\"\n", "storytold", { files: { "pyproject.toml": 'x = "2"\n' }, runs: NONE });
  assert.deepEqual(poetry, []);
  const uvHead = ["[[package]]", 'name = "a"', 'version = "1.1"', 'source = { registry = "https://pypi.org/simple" }', "dependencies = [", '  { name = "b" },', "]", 'sdist = { url = "https://x/a-1.1.tar.gz", hash = "sha256:bb" }', ""].join("\n");
  const uvDiff = (v: [string, string]) => "diff --git a/uv.lock b/uv.lock\n--- a/uv.lock\n+++ b/uv.lock\n@@ -3 +3 @@\n-version = \"1.0\"\n+version = \"1.1\"\n@@ -8 +8 @@\n-sdist = { url = \"https://x/a-" + v[0] + ".tar.gz\", hash = \"sha256:" + v[1] + "\" }\n+sdist = { url = \"https://x/a-1.1.tar.gz\", hash = \"sha256:bb\" }\n";
  const uv = (d: string, files: Record<string, string>) => sensitiveReasons(edit("pyproject.toml", ['x = "1"'], ['x = "2"']) + d, "storytold", { files: { "pyproject.toml": 'x = "2"\n', ...files }, runs: NONE });
  assert.deepEqual(uv(uvDiff(["1.0", "aa"]), { "uv.lock": uvHead }), []);
  assert.deepEqual(uv(uvDiff(["1.0", "aa"]), {}), [LOCK_CHECKSUM_REASON]);
  assert.deepEqual(sensitiveReasons(bump, "storytold", { files: files.files, runs }), []);
  // Both names of a renamed file, and git's quoted names.
  assert.deepEqual(sensitiveReasons("diff --git a/.github/workflows/ci.yml b/notes/ci-old.yml\nsimilarity index 100%\nrename from .github/workflows/ci.yml\nrename to notes/ci-old.yml\n", "storytold"), [CI]);
  assert.deepEqual(sensitiveReasons('diff --git "a/.github/workflows/\\303\\251.yml" "b/.github/workflows/\\303\\251.yml"\nnew file mode 100644\n--- /dev/null\n+++ "b/.github/workflows/\\303\\251.yml"\n@@ -0,0 +1 @@\n+on: push\n', "storytold"), [CI]);
  assert.deepEqual(sensitiveReasons('diff --git "a/x\\q" "b/x\\q"\nnew file mode 100644\n', "storytold"), [UNREADABLE_PATH_REASON]);

  // Links: a line whose text starts with "++", a scheme without slashes, an attribute split over lines, dot segments.
  for (const lines of [["++ ![x](https://evil.example/p.png)"], ["[x](http:evil.example/login)"], ['<a href="https:/', '/evil.example/login">x</a>'], ['<a href="https:/&Tab;/evil.example">x</a>'], ["![x](https://github.com/storytold/../other/repo/raw/main/p.png)"]]) {
    assert.deepEqual(sensitiveReasons(added("docs/guide.md", ...lines), "storytold"), [LINK], lines.join(" / "));
  }
  assert.deepEqual(sensitiveReasons(added("docs/guide.md", "[x](../guide.md)", "![a](images/a.png)", "https://github.com/storytold/app/issues/1", "see https://storytold.github.io/x"), "storytold"), []);
});

test("the reviews are shown test files while they fit, the rule counts the rest as unread, and build scripts resolve from every manifest spelling", () => {
  const big = "x".repeat(MAX_DIFF_CHARS);
  const diff = added("src/lib.rs", "mod fixtures;") + added("src/fixtures/mod.rs", "pub fn f() {}") + added("Cargo.lock", "[[package]]");
  const shown = codeDiff(diff, MAX_DIFF_CHARS);
  assert.deepEqual([shown.files, shown.testsOmitted, shown.lockfilesOmitted], [["src/lib.rs", "src/fixtures/mod.rs"], [], ["Cargo.lock"]]);
  const cut = codeDiff(added("src/lib.rs", "mod fixtures;") + added("tests/it.rs", big), MAX_DIFF_CHARS);
  assert.deepEqual([cut.files, cut.testsOmitted], [["src/lib.rs"], ["tests/it.rs"]]);
  assert.ok(sensitiveReasons(added("src/lib.rs", "mod fixtures;") + added("tests/it.rs", big), "storytold").includes(TESTS_UNREAD_REASON));

  const forms = ['package = { name = "a", build = "gen.rs" }', '[package]\n"build" = "gen.rs"', '["package"]\nbuild = "gen.rs"', '[package]\nbuild = """gen.rs"""', '[package]\nbuild = "g\\u0065n.rs"', 'package . build = "gen.rs"'];
  for (const toml of forms) assert.deepEqual([...buildScripts(["c/Cargo.toml", "c/gen.rs"], () => toml)], ["c/gen.rs"], toml);
  // The Fix-issue triage is neither offered nor allowed a build script a manifest names.
  const scripts = new Set(["c/gen.rs"]);
  assert.deepEqual(sourcePaths(["c/gen.rs", "c/src/lib.rs"], 10, scripts), ["c/src/lib.rs"]);
  const reply = (f: string) => JSON.stringify([{ ref: "app#5", fixable: true, reason: "r", crate: "c", files: [f] }]);
  assert.deepEqual([reply("c/src/lib.rs"), reply("c/gen.rs")].map((r) => parseTriage(r, "app#5", [{ name: "c", dir: "c" }], ["c/gen.rs", "c/src/lib.rs"], scripts).ok), [true, false]);
  // A cached diff that needs what the rule reads beside it waits for it, a few reads at most; one that needs nothing does not.
  const script = added("ci/run.sh", "x");
  const incomplete = { files: {}, runs: null, complete: false };
  assert.deepEqual([extrasPending(script, null, 0), extrasPending(script, incomplete, 2), extrasPending(script, incomplete, 3), extrasPending(added("src/lib.rs", "x"), null, 0)], [true, true, false, false]);
  // While they are pending the PR holds on the conservative reasons, is not asked about, and gets a re-read (an hour after the last one).
  const waiting = (lastRead: number | null) => decidePr(prFacts({ sensitive: [EXTRAS_PENDING_REASON], diffPending: { lastRead } }));
  const kinds = (p: ReturnType<typeof decidePr>) => p.actions.map((a) => a.kind);
  assert.deepEqual([waiting(null).state, kinds(waiting(null))], ["needs-decision", ["premerge"]]);
  assert.deepEqual([kinds(waiting(NOW - 60_000)), kinds(waiting(NOW - 2 * 3600_000))], [[], ["premerge"]]);
  assert.deepEqual(kinds(decidePr(prFacts({ sensitive: [EXTRAS_PENDING_REASON], diffPending: { lastRead: null, paceAt: NOW + 60_000 } }))), []);
  // The instance runs at most REREADS_PER_HOUR re-reads in a rolling hour.
  const cache = mkdtempSync(join(tmpdir(), "reread-pace-")), was = process.env.AUTOCRAFT_DIFF_CACHE;
  process.env.AUTOCRAFT_DIFF_CACHE = cache;
  try {
    const t0 = 1_000_000;
    for (let i = 0; i < REREADS_PER_HOUR; i++) assert.equal(takeRereadSlot(t0 + i), true);
    assert.deepEqual([takeRereadSlot(t0 + 1000), rereadPaceAt(t0 + 1000), takeRereadSlot(t0 + 3600_000)], [false, t0 + 3600_000, true]);
  } finally {
    if (was === undefined) delete process.env.AUTOCRAFT_DIFF_CACHE; else process.env.AUTOCRAFT_DIFF_CACHE = was;
    rmSync(cache, { recursive: true, force: true });
  }
  // A manifest that does not parse makes every Rust file of its crate outside src/ a build script.
  assert.deepEqual([...buildScripts(["c/Cargo.toml", "c/gen.rs", "c/src/lib.rs"], () => "[package\nbuild = 'gen.rs'")].sort(), ["c/gen.rs"]);
});
