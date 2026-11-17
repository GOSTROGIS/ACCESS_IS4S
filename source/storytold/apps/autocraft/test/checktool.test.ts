import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CheckTool } from "../src/checktool/index.ts";

describe("check tool", () => {
  test("a command outside fmt, clippy, check and test is refused before anything is queued", async () => {
    let applied = 0;
    const tool = new CheckTool({ db: {} as never, step: "fixup", repo: "app", number: 1, head: "a".repeat(40), base: null, applies: async () => { applied++; return null; } });
    for (const command of ["build", "rm -rf /", "clippy; ls", undefined]) {
      const r = await tool.run({ patch: "diff --git a/x.rs b/x.rs\n", command });
      assert.equal(r.isError, true);
      assert.match(r.text, /^refused: command must be one of fmt, clippy, check, test/);
    }
    assert.equal((await tool.run({ patch: "p", command: "test", crate: "app; ls" })).isError, true);
    assert.equal(applied, 0);
    assert.equal(tool.calls, 0);
  });
});

describe("clippy reminder", () => {
  test("a Rust diff from a call that never got a clippy result needs the reminder", async () => {
    const { needsClippy } = await import("../src/classify/run.ts");
    const diff = "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1 +1 @@\n-a\n+b\n";
    assert.equal(needsClippy({ ran: new Set() }, diff), true);
    assert.equal(needsClippy({ ran: new Set(["clippy"]) }, diff), false);
    assert.equal(needsClippy({ ran: new Set() }, diff.replaceAll("lib.rs", "README.md")), false);
  });
});

describe("check limits", () => {
  test("parallel calls cannot get past the call limit, and close() stops later ones", async () => {
    let applied = 0;
    const tool = new CheckTool({ db: {} as never, step: "fixup", repo: "app", number: 1, head: "a".repeat(40), base: null, applies: async () => { applied++; return "no"; } }, { calls: 2, wallMs: 1000 });
    // A patch the stage refuses is not a call; with the call count taken, the limit message comes first.
    (tool as unknown as { calls: number }).calls = 2;
    const rs = await Promise.all([1, 2, 3].map(() => tool.run({ patch: "p", command: "check" })));
    assert.ok(rs.every((r) => r.isError && /calls are used up/.test(r.text)));
    assert.equal(applied, 0);
    tool.close();
    assert.match((await tool.run({ patch: "p", command: "check" })).text, /model call is over/);
  });
});
