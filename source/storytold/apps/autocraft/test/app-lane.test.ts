// The app lane of src/github/write.ts: a repo on the legacy identity runs every command exactly as before; a repo on the
// app identity runs them with the installation token as the whole child environment (the box account's token is not in
// it), never for a user grant, and never falls back to the box account when no token can be minted.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { setGithubIdentity } from "../src/github/identity.ts";
import { AppNotInstalledError, TOKEN_ENV } from "../src/github/install-token.ts";
import { ghComment, pushOwnBranch } from "../src/github/write.ts";
import type { GuardedItem, GuardedRepo } from "../src/core/guard.ts";
import type { ExecOpts } from "../src/fixup/git.ts";
import { SCRATCH } from "./scratch.ts";

const BOX = "ghp_box_account_token";
const APP = "ghs_installation_token";
const item = (as: string): GuardedItem => ({ scope: "item", action: { kind: "act" }, repo: "lane", number: 7, as }) as unknown as GuardedItem;
const repoGrant = { scope: "repo", need: "merge", repo: "lane", as: "app" } as unknown as GuardedRepo;
const note = { by: "fixed" } as never;

test("app identity: the installation token is the whole child environment; legacy and user grants are untouched", async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `app-lane-${process.pid}.db`));
  db.prepare("INSERT OR IGNORE INTO tracked_repos (name) VALUES ('lane')").run();
  process.env.GITHUB_TOKEN = BOX;
  process.env.GH_TOKEN = BOX;
  let mintFails = false;
  const w = { db, login: "t", mint: async () => { if (mintFails) throw new AppNotInstalledError("storytold"); return APP; } };
  const seen: (ExecOpts | undefined)[] = [];
  const exec = async (_c: string, _a: string[], o?: ExecOpts) => { seen.push(o); return { code: 0, stdout: "https://github.com/storytold/lane/issues/7#issuecomment-1", stderr: "" }; };
  const gitSeen: unknown[] = [];
  const git = { git: async (_a: string[], o?: unknown) => { gitSeen.push(o); return { code: 0, stdout: "", stderr: "" }; } };
  const comment = (as: string) => ghComment(w, item(as), exec, "act-comment", { repo: "lane", number: 7, pr: false }, note, "hi");

  await comment("app");
  assert.equal(seen.length, 1);
  assert.equal(seen.pop()!.env, undefined); // legacy: the call is as it always was (gh inherits the box environment)

  setGithubIdentity(db, "op", "app");
  await comment("app");
  const o = seen.pop()!;
  assert.equal(o.replaceEnv, true);
  assert.equal(o.env!.GH_TOKEN, APP);
  assert.equal(o.env![TOKEN_ENV], APP);
  assert.equal(o.env!.GITHUB_TOKEN, undefined);
  assert.ok(!Object.values(o.env!).includes(BOX));

  // A comment is the app's whoever's answer it carries out; only a merge or close keeps the person's lane.
  await comment("user:example-user");
  assert.equal(seen.pop()!.env!.GH_TOKEN, APP);

  await pushOwnBranch(w, repoGrant, git as never, "batch-push", { repo: "lane", remote: "storytold/lane", branch: "autocraft/x", sha: "a".repeat(40) });
  assert.equal((gitSeen.pop() as { app: { env: Record<string, string> } }).app.env.GH_TOKEN, APP);

  mintFails = true;
  const r = await comment("app");
  assert.equal(r.code, 1);
  assert.match(r.stderr, /not installed on storytold/);
  assert.equal(seen.length, 0);
  const row = db.prepare("SELECT details FROM audit WHERE action = 'act-comment' ORDER BY rowid DESC LIMIT 1").get() as { details: string };
  assert.equal(JSON.parse(row.details).state, "failed");
});
