import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SHADOWED_TABLES } from "../src/repos.ts";

// The runner and dashboard connections shadow these tables with temp views; an unqualified write there fails ("cannot modify ... because it is a view").
test("every write to a table the scoped connection shadows names main.", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; });
  const write = new RegExp(`\\b(?:INSERT(?: OR [A-Z]+)? INTO|UPDATE|DELETE FROM|REPLACE INTO) (?:${SHADOWED_TABLES.join("|")})\\b(?=[\\s(])`);
  const bad: string[] = [];
  for (const f of walk("src")) {
    let inTrigger = false;
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      // Trigger bodies may not qualify names; there they resolve in the trigger's own schema.
      if (/CREATE TRIGGER/.test(line)) inTrigger = true;
      if (!inTrigger && write.test(line)) bad.push(`${f}:${i + 1}`);
      if (inTrigger && /^\s*END\b/.test(line)) inTrigger = false;
    });
  }
  assert.deepEqual(bad, []);
});
