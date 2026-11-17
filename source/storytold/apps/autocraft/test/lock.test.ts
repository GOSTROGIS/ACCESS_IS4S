import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { acquireLock, lockHeld } from "../src/mirror.ts";

test("a lock file naming this process is stale (a container's init reuses pids)", () => {
  const path = join(mkdtempSync(join(tmpdir(), "lock-")), "runner.lock");
  writeFileSync(path, String(process.pid));
  assert.equal(lockHeld(path), false);
  const release = acquireLock(path);
  assert.ok(release);
  release();
});
