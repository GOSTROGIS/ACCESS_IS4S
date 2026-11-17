// The identity map: which identity a grant carries, what the audit row records per repo setting, and that no write
// function in src/github/write.ts records a row without one.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { AppError } from "../src/github/app.ts";
import { RepoNotInInstallationError } from "../src/github/install-token.ts";
import { commitIdentity, identityFor, identityOfDecision, githubIdentity, IdentityRefused, setGithubIdentity, setGithubIdentityChecked } from "../src/github/identity.ts";
import { closeItem } from "../src/github/write.ts";
import type { GuardedItem } from "../src/core/guard.ts";
import type { Querier } from "../src/mirror.ts";
import { SCRATCH } from "./scratch.ts";

const grant = (as: string): GuardedItem => ({ scope: "item", action: { kind: "act" }, repo: "app", number: 7, as }) as unknown as GuardedItem;
const q: Querier = { query: async () => ({}) } as unknown as Querier;

test("a decision answered by someone maps to that login, anything else to the app", () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `identity-${process.pid}.db`));
  const ins = db.prepare("INSERT INTO decisions (id, kind, question, options, asked_at, answer, answered_by) VALUES (?, 'close', 'q', '[]', 't', ?, ?)");
  ins.run("d1", "yes", "example-user");
  ins.run("d2", null, "example-user");
  assert.equal(identityOfDecision(db, "d1"), "user:example-user");
  assert.equal(identityOfDecision(db, "d2"), "app");
  assert.equal(identityOfDecision(db, "missing"), "app");
  assert.equal(identityOfDecision(db, undefined), "app");
  assert.equal(identityFor(grant("user:example-user"), "close"), "user:example-user");
  assert.equal(identityFor(grant("user:example-user"), "merge"), "user:example-user");
  assert.equal(identityFor(grant("user:example-user")), "app", "any other write is the app's");
});

test("the audit row records legacy until the identity is switched, then the grant's identity", async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `identity-audit-${process.pid}.db`));
  db.prepare("INSERT OR IGNORE INTO tracked_repos (name) VALUES ('app')").run();
  const w = { db, login: "act", mint: async () => "ghs_test", appClient: () => q };
  const item = { repo: "app", number: 7, id: "I_1", pr: false };
  const last = () => JSON.parse((db.prepare("SELECT details FROM audit WHERE action = 'act-close' ORDER BY rowid DESC LIMIT 1").get() as { details: string }).details) as { identity: string };
  assert.equal(githubIdentity(db), "box");
  await closeItem(w, grant("user:example-user"), q, item);
  assert.equal(last().identity, "legacy");
  assert.equal(setGithubIdentity(db, "op", "app"), true);
  await closeItem(w, grant("user:example-user"), q, item);
  assert.equal(last().identity, "user:example-user");
  await closeItem(w, grant("app"), q, item);
  assert.equal(last().identity, "app");
  assert.throws(() => setGithubIdentity(db, "op", "bot"));
  assert.equal(setGithubIdentity(db, "op", "box"), true);
  assert.equal(githubIdentity(db), "box");
});

test("every audited write in write.ts takes its identity from a grant", () => {
  const src = readFileSync(new URL("../src/github/write.ts", import.meta.url), "utf8");
  const calls = src.split("\n").filter((l) => /\b(recorded|viaGh)\(w, /.test(l) && !/function /.test(l));
  assert.ok(calls.length >= 25, `found ${calls.length} audited calls`);
  for (const l of calls) assert.match(l, /\b(recorded|viaGh)\(w, (idOf\(w, g(, "close")?\)|identity|"legacy"|`user:\$\{w\.login\}`), /, l.trim().slice(0, 80));
  // The rows started with begin() directly (labels, merge, command-line merge) carry the identity in their details.
  const begins = src.split("\n").filter((l) => /\bbegin\(w, /.test(l) && !/function /.test(l));
  assert.equal(begins.length, 4);
  for (const l of begins) assert.match(l, /begin\(w, (action, target, details|"labels-apply", .*det\(it\)|"merge", target, base|"merge", .*details(, splitSlug\(repoSlug\)\.owner)?)\)/);
  assert.match(src, /identity: idOf\(w, it\.g\)/);
  assert.match(src, /base = \{ \.\.\.details, method, identity: idOf\(w, g, "merge"\)(, \.\.\.jobOf\(\))? \}/);
  assert.match(src, /identity: "legacy"/);
});

test("commits are authored by the app's bot user on an app-lane repo and by the box account on a legacy one", async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `identity-commit-${process.pid}.db`));
  db.prepare("INSERT INTO tracked_repos (name) VALUES ('app')").run();
  const box = async () => ({ login: "box", email: "1+box@users.noreply.github.com" });
  const deps = { slug: () => "demo-app", botId: async () => 42 };
  assert.deepEqual(await commitIdentity(db, "app", box, deps), { name: "box", login: "box", email: "1+box@users.noreply.github.com" });
  setGithubIdentity(db, "t", "app");
  assert.deepEqual(await commitIdentity(db, "app", box, deps), { name: "demo-app[bot]", login: "demo-app[bot]", email: "42+demo-app[bot]@users.noreply.github.com" });
});

test("switching to the app is refused with the uncovered repos listed, and a switch ends the sessions", async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `identity-switch-${process.pid}.db`));
  db.prepare("INSERT INTO tracked_repos (name) VALUES ('covered'), ('outside')").run();
  const mint = async (_owner: string, repo: string) => { if (repo === "outside") throw new RepoNotInInstallationError("o", repo); return "t"; };
  await assert.rejects(setGithubIdentityChecked(db, "op", "app", { registered: () => false, mint }), (e: unknown) => e instanceof IdentityRefused && e.repos.length === 0);
  await assert.rejects(setGithubIdentityChecked(db, "op", "app", { registered: () => true, mint }), (e: unknown) => e instanceof IdentityRefused && e.repos.join() === "outside" && /outside/.test(e.message));
  assert.equal(githubIdentity(db), "box");
  // A GitHub failure is "could not confirm", not "not covered".
  const flaky = async () => { throw Object.assign(new AppError("GET /x: HTTP 502"), { status: 502 }); };
  await assert.rejects(setGithubIdentityChecked(db, "op", "app", { registered: () => true, mint: flaky }), (e: unknown) => e instanceof IdentityRefused && e.transient);
  db.prepare("DELETE FROM tracked_repos WHERE name = 'outside'").run();
  db.prepare("INSERT INTO sessions (id_hash, login, csrf, created_at, last_seen, expires_at) VALUES ('h', 'op', 'c', ?, ?, ?)").run(new Date().toISOString(), new Date().toISOString(), new Date(Date.now() + 1e6).toISOString());
  assert.equal(await setGithubIdentityChecked(db, "op", "app", { registered: () => true, mint }), true);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n, 0);
});
