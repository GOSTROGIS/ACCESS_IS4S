import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ownerOfArgs, ownerOfVariables, readEnv, readEnvFor } from "../src/github/read.ts";

const dbWith = (identity?: string): DatabaseSync => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)");
  if (identity) db.prepare("INSERT INTO settings VALUES ('github_identity', ?)").run(identity);
  return db;
};

test("reads inherit under box and carry only the installation token under app", async () => {
  process.env.GH_TOKEN = "box-account-token";
  const minted: string[] = [];
  const mint = async (owner: string) => { minted.push(owner); return "ghs_install"; };
  assert.equal(await readEnv("acme", { db: dbWith(), mint }), undefined);
  const env = await readEnv("acme", { db: dbWith("app"), mint });
  assert.equal(env?.GH_TOKEN, "ghs_install");
  assert.ok(!Object.values(env ?? {}).includes("box-account-token"));
  assert.deepEqual(minted, ["acme"]);
  const none = await readEnv(undefined, { db: dbWith("app"), mint, defaultOwner: () => "tracked" });
  assert.equal(none?.GH_TOKEN, "ghs_install");
  assert.equal(minted[1], "tracked");
  await assert.rejects(readEnv("acme", { db: dbWith("app"), mint: async () => { throw new Error("boom"); } }), /app identity: .*boom/);
  assert.equal(ownerOfArgs(["api", "repos/acme/x/pulls/1"]), "acme");
  assert.equal(ownerOfArgs(["pr", "diff", "1", "--repo", "org2/x"]), "org2");
  assert.equal(ownerOfArgs(["pr", "view", "-R=org3/x"]), "org3");
  assert.equal(ownerOfArgs(["issue", "list", "-R", "org4/x"]), "org4");
  assert.equal(ownerOfVariables({ q: "repo:org5/x is:pr updated:2026-01-01" }), "org5");
  assert.equal(ownerOfVariables({ login: "org6" }), "org6");
  // local git and pushes never get a token or a mint
  assert.equal(await readEnvFor("git", ["-c", "core.hooksPath=/dev/null", "rev-parse", "HEAD"]), undefined);
  assert.equal(await readEnvFor("git", ["push", "https://github.com/a/b.git"]), undefined);
  delete process.env.GH_TOKEN;
});
