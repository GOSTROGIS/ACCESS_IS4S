// Filing from Discord under the person's GitHub account: no token gives a stored-hashed sign-in state, the callback stores
// the token, a signed-in report is created with the footer and audited, junk and the per-login limit refuse, and
// forgetting removes the token and queues its revoke. No network: the provider, `gh` and the junk judges are fakes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { connect } from "../src/db.ts";
import { fileIssue, forgetReporter, type FileHooks } from "../src/discord/file-issue.ts";
import { readReporter } from "../src/discord/reporter.ts";
import { TokenBox } from "../src/dash/server/crypto.ts";
import type { Provider, Tokens } from "../src/dash/server/provider.ts";
import { reporterSignIn } from "../src/dash/server/reporter-signin.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "discord-file-"));
const db = connect(join(dir, "d.db"));
after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
db.exec("INSERT INTO repos (name, visibility) VALUES ('photocraft', 'public'); INSERT OR IGNORE INTO tracked_repos (name) VALUES ('photocraft')");

const box = new TokenBox("s".repeat(40));
const tokens: Tokens = { access: "ghu_access", expiresAt: Date.now() + 3_600_000, refresh: "ghr_refresh", refreshExpiresAt: Date.now() + 86_400_000 };
const provider = {
  authorizeUrl: (state: string) => `https://github.example/authorize?state=${state}`,
  exchange: async (code: string) => (code === "good" ? tokens : null),
  identity: async () => ({ login: "octo", id: 7 }),
} as unknown as Provider;

const calls: { args: string[]; input?: string }[] = [];
let junk = false;
const hooks: FileHooks = {
  box, provider, baseUrl: "https://craft.example",
  exec: async (_cmd, args, opts) => { calls.push({ args, input: opts?.input }); return { code: 0, stdout: args[1] === "create" ? "https://github.com/storytold/photocraft/issues/41\n" : "", stderr: "" }; },
  judge: { jev: async () => (junk ? 0.95 : 0.05), haiku: async () => junk },
};
const deps = { db, log: () => {} };
const req = { reporter: "rep1", repo: "photocraft", title: "Export ignores quality", body: "Quality 40 gives the same size as 100.", kind: "bug" as const };

describe("filing from Discord", () => {
  test("no token: a sign-in link whose state is stored hashed; the callback stores the token", async () => {
    const r = await fileIssue(deps, req, hooks);
    assert.equal(r.status, "sign-in");
    const state = new URL((r as { url: string }).url).searchParams.get("state")!;
    assert.match((r as { url: string }).url, /^https:\/\/craft\.example\/discord\/github\/start\?state=/);
    const stored = db.prepare("SELECT state_hash, reporter FROM reporter_states").get() as { state_hash: string; reporter: string };
    assert.equal(stored.state_hash, createHash("sha256").update(state).digest("hex"));
    assert.equal(stored.reporter, "rep1");

    const d = { db, box, provider, baseUrl: "https://craft.example" };
    const start = await reporterSignIn(d, new URL(`http://x/discord/github/start?state=${state}`), new Map(), "n");
    assert.match(start!.r.redirect!, /^https:\/\/github\.example\/authorize/);
    const cb = new URL(`http://x/discord/github/callback?state=${state}&code=good`);
    assert.equal((await reporterSignIn(d, cb, new Map(), "n"))!.r.status, 400, "needs the browser's cookie");
    const ok = await reporterSignIn(d, new URL(`http://x/discord/github/callback?state=${state}&code=good`), new Map([["__Host-craft_reporter", state]]), "n");
    assert.match(ok!.r.html!, /Signed in as octo\. Go back to Discord and press File it\./);
    assert.equal(readReporter(db, box, "rep1")!.tokens!.access, "ghu_access");
    assert.equal((await reporterSignIn(d, cb, new Map([["__Host-craft_reporter", state]]), "n"))!.r.status, 400, "the state is single use");
  });

  test("signed in: junk is refused, then the issue is created with the footer and audited", async () => {
    junk = true;
    assert.deepEqual(await fileIssue(deps, req, hooks), { status: "refused", reason: "That does not look like a bug report or a feature request." });
    assert.equal(calls.length, 0);
    junk = false;
    const r = await fileIssue(deps, req, hooks);
    assert.deepEqual(r, { status: "filed", number: 41, url: "https://github.com/storytold/photocraft/issues/41", login: "octo" });
    assert.equal(calls[0]!.input, "Quality 40 gives the same size as 100.\n\nFiled from Discord with AutoCraft.");
    assert.ok(calls[1]!.args.includes("bug"), "labelled");
    const a = db.prepare("SELECT login, target, details FROM audit WHERE action = 'discord-issue-open'").get() as { login: string; target: string; details: string };
    const det = JSON.parse(a.details);
    assert.deepEqual([a.login, a.target, det.state, det.number, det.url], ["octo", "photocraft", "done", 41, "https://github.com/storytold/photocraft/issues/41"]);
    assert.ok(!a.details.includes("Quality 40"), "the text is not kept in the audit row");
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM audit WHERE action = 'discord-issue-label'").get() as { c: number }).c, 1);
  });

  test("a fourth issue in 24 hours by the same login is refused", async () => {
    await fileIssue(deps, req, hooks);
    await fileIssue(deps, req, hooks);
    const r = await fileIssue(deps, req, hooks);
    assert.equal(r.status, "refused");
  });

  test("a refused filing gives its slot back", async () => {
    const before = (db.prepare("SELECT COUNT(*) AS c FROM discord_filed").get() as { c: number }).c;
    junk = true;
    await fileIssue(deps, req, hooks);
    junk = false;
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM discord_filed").get() as { c: number }).c, before);
  });

  test("forgetReporter removes the token and queues its revoke", () => {
    assert.equal(forgetReporter(db, "rep1"), true);
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM discord_filed WHERE reporter = 'rep1'").get() as { c: number }).c, 0);
    assert.equal(readReporter(db, box, "rep1"), null);
    const q = db.prepare("SELECT login, kind, aad FROM user_token_revocations").get() as { login: string; kind: string; aad: string };
    assert.deepEqual({ ...q }, { login: "octo", kind: "token", aad: "reporter_tokens:rep1" });
    assert.equal(forgetReporter(db, "rep1"), false);
  });
});
