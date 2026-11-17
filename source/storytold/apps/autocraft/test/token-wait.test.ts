// A sandboxed call waits for an account whose login token has enough lifetime left;
// a host-only call on the same account starts.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { allocation, startClaudeRun, WaitLimitError } from "../src/agents/call.ts";
import { connect } from "../src/db.ts";
import { useTestAccount } from "./accounts-fixture.ts";
import { SCRATCH } from "./scratch.ts";

test("a near-expiry token holds a sandboxed call back and leaves host-only calls alone", async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `token-wait-${process.pid}.db`));
  const box = useTestAccount(db);
  mkdirSync(`${box.configDir}t`, { recursive: true });
  const creds = join(`${box.configDir}t`, ".credentials.json");
  writeFileSync(creds, JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() + 10 * 60_000 } }));
  const call = { promptId: "review.opus", promptVersion: "1", provider: "claude" as const, model: "m", items: [], prompt: "p" };
  const quiet = () => {};
  allocation.pollMs = 10;

  await assert.rejects(startClaudeRun(db, call, quiet, 50, 30 * 60_000), WaitLimitError);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM agent_runs").get() as { n: number }).n, 0);
  assert.equal((await startClaudeRun(db, call, quiet, 50)).accountId, "t");

  writeFileSync(creds, JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() + 3 * 3600_000 } }));
  assert.equal((await startClaudeRun(db, call, quiet, 50, 30 * 60_000)).accountId, "t");
});
