import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The build worker runs src/ from a git archive with no node_modules, and the CLI imports every command module at start,
// so a static import of a package anywhere in src/ stops the worker. Packages are loaded with a dynamic import where used.
test("server code imports only node: modules and relative files at the top level", () => {
  const root = new URL("../src", import.meta.url).pathname;
  const bad: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(".ts")) {
        for (const m of readFileSync(p, "utf8").matchAll(/^import (?!type )[^;]*? from "([^"]+)"/gm)) {
          if (!m[1].startsWith(".") && !m[1].startsWith("node:")) bad.push(`${p.slice(root.length + 1)}: ${m[1]}`);
        }
      }
    }
  };
  walk(root);
  assert.deepEqual(bad, []);
});
