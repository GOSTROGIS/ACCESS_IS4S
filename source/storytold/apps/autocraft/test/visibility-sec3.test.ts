// Text the planner stores once for every reader (queue rows, plan reasons, waits, decision facts) and the Needs feed are cut per
// reader: viewers get no staff text, a quiet pull request no staff discussion, and nobody a name of a repo hidden from them.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { addLogin } from "../src/access.ts";
import { finishRun, insertRun } from "../src/agents/runs.ts";
import { connect } from "../src/db.ts";
import { ask } from "../src/decisions.ts";
import { scopeToTracked } from "../src/repos.ts";
import { apiRoutes } from "../src/dash/api/index.ts";
import { loadConfig } from "../src/dash/server/config.ts";
import { startServer } from "../src/dash/server/index.ts";
import { FakeProvider } from "../src/dash/server/provider.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "visibility-sec3-"));
const dbFile = join(dir, "dash.db");
const permsFile = join(dir, "perms.json");
writeFileSync(permsFile, JSON.stringify({}));
const db = connect(dbFile);
let base = "";
let close: () => Promise<void>;
const OPTS = [{ key: "a", label: "A" }, { key: "b", label: "B" }];

before(async () => {
  const now = new Date().toISOString();
  db.exec("DELETE FROM tracked_repos; INSERT INTO tracked_repos (name, pipeline) VALUES ('open-app', 1), ('vault', 1), ('oldrepo', 1)");
  db.exec("DELETE FROM tracked_repos WHERE name = 'oldrepo'");
  db.exec("INSERT INTO repos (name, visibility) VALUES ('open-app', 'public'), ('vault', 'private'), ('oldrepo', 'private')");
  const item = db.prepare("INSERT INTO items (repo, number, kind, state, title, body, head_oid, author, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  for (const [repo, n, kind] of [["open-app", 1, "pr"], ["open-app", 2, "pr"], ["open-app", 10, "issue"], ["vault", 7, "pr"], ["vault", 9, "pr"], ["oldrepo", 5, "pr"]] as const)
    item.run(repo, n, kind, "OPEN", `title ${repo}#${n}`, "body", kind === "pr" ? `h${n}` : null, "alice", now, now);
  // open-app#2 is the quiet pull request of a security finding.
  db.prepare("INSERT INTO security_scans (id, repo, state, started_by, started_at) VALUES (1, 'open-app', 'done', 'boss', ?)").run(now);
  db.prepare(`INSERT INTO security_findings (repo, number, scan_id, area, title, severity, urgent, state, refs, reach, impact, fingerprint, created_at, updated_at, fix_pr)
    VALUES ('open-app', 50, 1, 'a', 't', 'high', 0, 'landing', '[]', 'r', 'i', 'fp', ?, ?, 2)`).run(now, now);
  // Queue rows as the planner stores them, with staff text in every field a viewer must not read.
  const plan = db.prepare("INSERT INTO item_plans (repo, number, kind, head, state, actions, wait, reasons, note, view, planned_at) VALUES (?, ?, 'pr', ?, 'needs-decision', '[]', ?, ?, 'MARK-PLAN-NOTE', ?, ?)");
  for (const [repo, n] of [["open-app", 1], ["open-app", 2], ["oldrepo", 5]] as const) {
    const wait = repo === "open-app" && n === 1 ? "vault#7, which blocks its review" : null;
    const view = {
      gh: "OPEN", scope: true, next: n === 2 ? "Fix-up MARK-NEXT" : "Merge", status: { phase: "Merge", waiting: wait, next: "Merge", since: now },
      queue: { author: "alice", tier: "not", head: `h${n}`, size: "S", label: "bug", verdict: "take", reason: "MARK-REVIEW-REASON", fixes: 0, ci: "success", mergeable: "MERGEABLE",
        path: null, eligible: false, decisionId: null, answer: null, refusedReason: "MARK-REFUSED", reviewedAt: now, held: false, blockedLive: false, noCi: false, runsWaiting: 0, runsBlocked: null,
        verify: { state: "failed", kind: "build", summary: "MARK-VERIFY-SUMMARY", note: "MARK-VERIFY-NOTE" } },
    };
    plan.run(repo, n, `h${n}`, wait, JSON.stringify(['conflicts with vault#9: "MARK-OWNER-NOTE" (MARK-MODEL-REASON)', "verification failed: MARK-VERIFY-SUMMARY"]), JSON.stringify(view), now);
  }
  for (const n of [1, 2]) db.prepare("INSERT INTO item_rank (repo, number, score, breakdown, computed_at) VALUES ('open-app', ?, 10, ?, ?)").run(n, JSON.stringify({ level: 1, size: "S" }), now);
  // A job across all repos and a sync whose texts name the hidden repo.
  db.prepare("INSERT INTO jobs (step, params, requested_by, requested_at, state, started_at, ended_at, summary, error) VALUES ('dupes-compare', '{}', 'pipeline', ?, 'failed', ?, ?, 'compared vault#7', 'vault#7 failed')").run(now, now, now);
  db.prepare("INSERT INTO sync_runs (started_at, ended_at, mode, items, error) VALUES (?, ?, 'search', 0, 'vault: not found')").run(now, now);
  db.prepare("INSERT INTO merge_batches (repo, branch, state, base_sha, commit_sha, summary, created_at, updated_at) VALUES ('oldrepo', 'integration-oldrepo-1', 'open', 'b', 'c', 'MARK-OLD-BATCH', ?, ?)").run(now, now);
  // A review of open-app#1 that names an operator's statement made on vault#9; a hold on vault#9 blocked by open-app#10.
  db.prepare("INSERT INTO owner_statements (id, source_kind, source_id, repo, number, item_title, author, text, at) VALUES (1, 'decision-note', 'x', 'vault', 9, 'title vault#9', 'boss', 'MARK-OWNER-NOTE', ?)").run(now);
  const review = db.prepare("INSERT INTO opus_reviews (repo, number, head_oid, run_id, at, verdict, reason, sure, mode, conflicts, blocked_by) VALUES (?, ?, ?, 'r', ?, ?, 'ok', 1, 'full', ?, ?)");
  review.run("open-app", 1, "h1", now, "take", JSON.stringify([{ id: 1, reason: "MARK-MODEL-REASON" }]), null);
  review.run("vault", 9, "h9", now, "hold", null, JSON.stringify(["open-app#10"]));
  ask(db, [
    { id: "open-app#10:scope", kind: "scope", repo: "open-app", number: 10, question: "A or B?", options: OPTS, recommended: "a", summary: "s" },
    { id: "open-app#2:scope", kind: "scope", repo: "open-app", number: 2, question: "A or B?", options: OPTS, recommended: "a", summary: "s" },
  ]);
  db.prepare("INSERT INTO decision_comments (id, decision_id, login, at, body) VALUES ('c1', 'open-app#2:scope', 'maint', ?, 'MARK-QUIET-COMMENT')").run(now);
  // A model call recorded without item rows, about the hidden repo.
  finishRun(db, insertRun(db, { jobId: null, step: "dupes.compare-prs.opus", stage: 1, promptId: "p", promptVersion: "1", provider: "claude", model: "m", accountId: null, items: [], prompt: "prompt about vault#7" }), { state: "done", output: "vault" });
  addLogin(db, "cli", "boss", "operator", null);
  addLogin(db, "cli", "maint", "maintainer", null);
  addLogin(db, "cli", "reader", "viewer", null);
  scopeToTracked(db);
  const config = loadConfig({ AUTOCRAFT_DEV_AUTH: "1", AUTOCRAFT_LISTEN: "127.0.0.1:0", AUTOCRAFT_DB: dbFile, AUTOCRAFT_DEV_PERMS: permsFile });
  const s = await startServer({ config, db, provider: new FakeProvider(permsFile), routes: apiRoutes() });
  base = s.url;
  close = s.close;
});
after(async () => {
  await close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function signIn(login: string) {
  const jar = new Map<string, string>();
  const send = async (path: string) => {
    const r = await fetch(new URL(path, base), { headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), accept: "application/json" }, redirect: "manual" });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(";");
      jar.set(kv!.slice(0, kv!.indexOf("=")), kv!.slice(kv!.indexOf("=") + 1));
    }
    return r;
  };
  const start = await send("/auth/signin?return_to=/");
  const auth = await send(`${start.headers.get("location")}&login=${login}`);
  assert.equal((await send(auth.headers.get("location")!)).status, 303);
  return async (path: string): Promise<string> => {
    const r = await send(path);
    assert.equal(r.status, 200, `${login} ${path}`);
    return r.text();
  };
}

test("viewers read no staff text of queue rows or of a quiet pull request's feedback, and nobody an untracked repo's batches", async () => {
  const boss = await signIn("boss"), reader = await signIn("reader"), maint = await signIn("maint");
  assert.match(await boss("/api/queue"), /MARK-REVIEW-REASON/);
  const queue = JSON.parse(await reader("/api/queue")) as { rows: { repo: string; number: number; outsideRule: string[] }[] };
  assert.deepEqual(queue.rows.map((r) => `${r.repo}#${r.number}`), ["open-app#1", "open-app#2"]);
  assert.doesNotMatch(JSON.stringify(queue), /MARK-/);
  assert.deepEqual(queue.rows[0]!.outsideRule, ["conflicts with an owner statement", "verification failed"]);
  assert.deepEqual(queue.rows[1]!.outsideRule, []);
  for (const get of [reader, maint]) assert.doesNotMatch(await get("/api/queue/batches"), /oldrepo/);
  assert.match(await maint("/api/needs?feedback=1"), /MARK-QUIET-COMMENT/);
  // The quiet pull request keeps its tab (from the stored next step) without the text.
  assert.match(await boss("/api/work"), /MARK-NEXT/);
  assert.doesNotMatch(await reader("/api/work"), /MARK-/);
  const fix = JSON.parse(await reader("/api/queue/page?tab=fix&repos=all")) as { rows: { number: number; next: string }[] };
  assert.deepEqual(fix.rows.map((r) => [r.number, r.next]), [[2, ""]]);
  const needs = JSON.parse(await reader("/api/needs?feedback=1")) as { feedback: { rows: { item: { number: number } | null; text: string }[] } };
  assert.equal(needs.feedback.rows.find((r) => r.item?.number === 2)?.text, "");
});

test("a maintainer who cannot see a repo finds its name in no fact, wait, statement conflict or model call", async () => {
  const boss = await signIn("boss"), maint = await signIn("maint");
  assert.match(await boss("/api/decisions/open-app%2310%3Ascope"), /Blocks the review of vault#9/);
  assert.match(await boss("/api/agents"), /dupes/);
  assert.match(await boss("/api/pipeline/jobs/1"), /vault#7 failed/);
  for (const path of ["/api/decisions/open-app%2310%3Ascope", "/api/items/open-app/10/decision", "/api/next", "/api/items/status", "/api/queue",
    "/api/items/open-app/1", "/api/items/open-app/1/page", "/api/items/open-app/1/trace", "/api/agents", "/api/pipeline", "/api/pipeline/jobs", "/api/pipeline/jobs/1", "/api/now", "/api/now/feed"])
    assert.doesNotMatch(await maint(path), /vault/, path);
  assert.match(await maint("/api/items/open-app/1/page"), /another item, which blocks its review/);
});
