// The pipeline account is the box account's user, never the bot a read or write lane answers as.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { pipelineAccount, pipelineMe, setPipelineLogin } from "../src/github/pipeline-account.ts";
import { ensurePipelineLogin, pipelineLogin } from "../src/review/discussion.ts";
import type { Exec } from "../src/fixup/git.ts";
import type { Querier } from "../src/mirror.ts";
import { SCRATCH } from "./scratch.ts";

const box: Exec = async (_c, _a, o) => (o?.inherit
  ? { code: 0, stdout: JSON.stringify({ login: "box-user", id: 5, node_id: "U5" }), stderr: "" }
  : { code: 0, stdout: JSON.stringify({ login: "app[bot]", id: 9, node_id: "B9" }), stderr: "" });

test("the pipeline account is the box login, and a bot login is never stored", async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `pipeline-account-${process.pid}.db`));
  assert.deepEqual(await pipelineAccount(box), { login: "box-user", nodeId: "U5", email: "5+box-user@users.noreply.github.com" });
  assert.deepEqual(await pipelineMe(() => {}, box), { id: "U5", login: "box-user" });
  const none: Exec = async () => ({ code: 1, stdout: "", stderr: "not logged in" });
  const lines: string[] = [];
  assert.equal(await pipelineMe((l) => lines.push(l), none), null);
  assert.match(lines[0]!, /skipped/);
  assert.equal(setPipelineLogin(db, "autocraft-bot[bot]"), false);
  assert.equal(pipelineLogin(db), "");
  // The querier's viewer is the bot; it is not consulted.
  const botQ = { query: async () => ({ viewer: { login: "autocraft-bot[bot]" } }) } as unknown as Querier;
  await ensurePipelineLogin(db, botQ, box);
  assert.equal(pipelineLogin(db), "box-user");
  assert.ok(!pipelineLogin(db).endsWith("[bot]"));
});
