import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildScripts, editable, operatorEditable } from "../src/fixup/patch.ts";

const walk = (root: string, dir = ""): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(root, join(dir, e.name)) : [join(dir, e.name)]));

test("only the build scripts Cargo runs are refused, not modules named build.rs", () => {
  const root = mkdtempSync(join(tmpdir(), "buildrs-"));
  try {
    const put = (p: string, text: string) => { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), text); };
    put("Cargo.toml", "[workspace]\nmembers = [\"crates/*\"]\n");
    put("src/build.rs", "");
    put("crates/x/Cargo.toml", "[package]\nname = \"x\"\n");
    put("crates/x/build.rs", "");
    put("crates/x/src/build.rs", "");
    put("crates/doc/Cargo.toml", "[package]\nname = \"doc\"\nbuild = \"tools/gen.rs\"\n");
    put("crates/doc/build.rs", "");
    put("crates/doc/tools/gen.rs", "");
    put("crates/doc/src/build.rs", "");
    put("crates/off/Cargo.toml", "[package]\nname = \"off\"\nbuild = false\n");
    put("crates/off/build.rs", "");
    const scripts = buildScripts(walk(root), (p) => readFileSync(join(root, p), "utf8"));
    for (const f of [editable, operatorEditable]) {
      for (const ok of ["src/build.rs", "crates/x/src/build.rs", "crates/doc/src/build.rs", "crates/doc/build.rs", "crates/off/build.rs"]) assert.equal(f(ok, scripts), true, `${f.name} ${ok}`);
      for (const no of ["crates/x/build.rs", "crates/doc/tools/gen.rs"]) assert.equal(f(no, scripts), false, `${f.name} ${no}`);
      // Without a checkout every build.rs is refused.
      assert.equal(f("crates/doc/src/build.rs"), false);
    }
    assert.equal(operatorEditable("crates/x/Cargo.toml", scripts), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
