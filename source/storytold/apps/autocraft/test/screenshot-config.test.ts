import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { ScreenshotConfigError, deleteConfig, getConfig, paramValueError, parseScreenshotConfig, putConfig } from "../src/verify/screenshot-config.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const fresh = () => connect(join(mkdtempSync(join(SCRATCH, "sc-")), "t.db"));

const good = () => ({
  package: "photocraft-ui-egui", example: "snapshot", driver: "args", size: "1440x900", ui_paths: ["crates/ui*/**"],
  commands: { snap: { doc: "Render the main window.", params: { size: { enum: ["1440x900", "1024x768"] } }, argv: ["--out", "{out}", "--size", "{size}"], capture: true } },
});
const mutate = (f: (c: ReturnType<typeof good>) => void) => {
  const c = good();
  f(c);
  return parseScreenshotConfig(c);
};

test("a valid setup parses; unknown placeholders, shell characters and validator-less params are rejected", () => {
  assert.ok("ok" in parseScreenshotConfig(good()));
  assert.ok("ok" in parseScreenshotConfig(JSON.stringify(good())));
  assert.match((mutate((c) => { c.commands.snap.argv.push("{nope}"); }) as { error: string }).error, /unknown placeholder \{nope\}/);
  assert.ok("error" in mutate((c) => { c.package = "x; rm -rf /"; }));
  assert.ok("error" in mutate((c) => { c.package = "-p"; }));
  assert.ok("error" in mutate((c) => { (c.commands.snap.params as Record<string, unknown>).size = {}; }));
  const size = (spec: unknown) => mutate((c) => { (c.commands.snap.params as Record<string, unknown>).size = spec; });
  // No regular-expression syntax can be expressed: groups, alternation, quantifiers, escapes and classes are refused.
  for (const chars of ["(a+)+", "a|b", "a*", "\\d", "[a]", "a-Z", "z-a", "^a", "a-z-9"]) assert.ok("error" in size({ chars, min: 1, max: 5 }), chars);
  assert.ok("error" in size({ re: "^(a+)+$" }));
  assert.ok("error" in size({ chars: "a-z", min: 1, max: 201 }));
  assert.ok("error" in size({ chars: "a-z", min: 0, max: 5 }));
  assert.ok("ok" in size({ chars: "A-Za-z0-9_./ -", min: 1, max: 60 }));
  // A negative int that fills a whole argv element could read as an option.
  assert.ok("error" in mutate((c) => { (c.commands.snap.params as Record<string, unknown>).n = { int: [-1, 3] }; c.commands.snap.argv.push("{n}"); }));
  assert.ok("ok" in mutate((c) => { (c.commands.snap.params as Record<string, unknown>).n = { int: [-1, 3] }; c.commands.snap.argv.push("--n={n}"); }));
  // Placeholder names are own keys of params.
  assert.ok("error" in mutate((c) => { c.commands.snap.argv.push("{constructor}"); }));
  assert.ok("error" in mutate((c) => { c.commands.snap.capture = false; }));
  assert.ok("error" in mutate((c) => { c.ui_paths = ["../x"]; }));
});

test("put, get and delete are audited; a bad config is not stored; arguments are checked against their validators", () => {
  const db = fresh();
  assert.throws(() => putConfig(db, "op", "app", { ...good(), driver: "nope" }), ScreenshotConfigError);
  assert.equal(getConfig(db, "app"), null);
  const c = putConfig(db, "op", "app", good());
  assert.equal(getConfig(db, "app")?.commands.snap?.capture, true);
  assert.equal(getConfig(db, "app")?.updatedBy, c.updatedBy);
  assert.equal(deleteConfig(db, "op", "app"), true);
  assert.equal(getConfig(db, "app"), null);
  assert.equal((db.prepare("SELECT count(*) AS n FROM audit WHERE action = 'screenshot-config'").get() as { n: number }).n, 2);
  assert.equal(paramValueError({ enum: ["a"] }, "a"), null);
  assert.notEqual(paramValueError({ chars: "a-z-", min: 1, max: 5 }, "-x"), null);
  assert.equal(paramValueError({ chars: "a-z-", min: 1, max: 5 }, "ab-c"), null);
  assert.notEqual(paramValueError({ chars: "a-z", min: 1, max: 3 }, "abcd"), null);
  assert.notEqual(paramValueError({ int: [1, 3] }, 4), null);
});
