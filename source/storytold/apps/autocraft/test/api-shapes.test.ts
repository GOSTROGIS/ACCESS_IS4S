// The response shapes the web client reads (web/src/api/types.ts): each main GET endpoint answers 200 with the fields the
// client names. Keys typed through `keys<T>()` fail to compile when the client's type drops them.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { AccessOverview, BatchList, CostReport, Flow, Item, MainCi, PipelineState, Progress, PromptsReport, QueuePage, User, WorkList } from "../web/src/api/types.ts";
import type { ItemPageData } from "../src/dash/api/item-page.ts";
import { apiRoutes } from "../src/dash/api/index.ts";
import { loadConfig } from "../src/dash/server/config.ts";
import { startServer } from "../src/dash/server/index.ts";
import { FakeProvider } from "../src/dash/server/provider.ts";
import { tmpdir, world } from "./world-db.ts";

const keys = <T>() => (...k: (keyof T & string)[]): string[] => k;

const w = world().repo().pr(1).review(1).verified(1).premerge(1, "clean").pr(2, { ci: "failure" }).issue(3);
w.db.prepare("INSERT INTO security_scans (id, repo, state, started_by, started_at) VALUES (900, 'app', 'done', 'op', '2026-01-01T00:00:00Z')").run();
w.db.prepare(`INSERT INTO security_findings (repo, number, scan_id, area, title, severity, urgent, state, refs, reach, impact, fingerprint, fix_attempts, last_failure, created_at, updated_at)
  VALUES ('app', 1, 900, 'a', 't', 'high', 0, 'new', '[]', 'r', 'i', 'fp1', 1, 'the test passes without the fix', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).run();
w.db.prepare("INSERT INTO security_fix_log (repo, number, attempt, round, state, failure, title, created_at, ended_at) VALUES ('app', 1, 1, 1, 'failed', 'the test passes without the fix', 't', '2026-01-01T00:00:00Z', '2026-01-01T00:10:00Z')").run();
let base = "";
let stop: () => Promise<void>;
const jar = new Map<string, string>();
let csrf = "";

async function get(path: string): Promise<{ status: number; json: unknown }> {
  const r = await fetch(new URL(path, base), { headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), accept: "application/json" }, redirect: "manual" });
  for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); jar.set(kv!.slice(0, kv!.indexOf("=")), kv!.slice(kv!.indexOf("=") + 1)); }
  csrf = r.headers.get("x-csrf-token") ?? csrf;
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : undefined };
}

/** [path, fields of the object, or of the first row of the array]. */
const OBJECTS: [string, string[]][] = [
  ["/api/me", keys<User>()("login", "role", "writeRepos")],
  ["/api/progress", keys<Progress>()("funnel", "repos", "decisionsOpen", "mainCi")],
  ["/api/items/app/1", keys<Item>()("repo", "number", "title", "state", "author", "additions", "deletions", "ci", "mergeable", "classifications", "reviews", "premerge", "stages", "queue")],
  ["/api/security/findings", ["groups"]],
  ["/api/security/findings/app/1/page", ["finding", "decision", "choices", "status", "attempts", "rounds", "history", "costUsd"]],
  ["/api/items/app/1/page", keys<ItemPageData>()("repo", "number", "kind", "state", "title", "author", "stamp", "header", "status", "costUsd", "reviews", "timeline", "github")],
  ["/api/items", ["total", "byStatus", "rows"]],
  ["/api/queue/page", keys<QueuePage>()("tab", "repos", "counts", "rows", "mergeRows", "batches", "total", "next")],
  ["/api/queue", ["rows", "counts", "total", "next"]],
  ["/api/queue/batches", keys<BatchList>()("batches", "total", "next")],
  ["/api/decisions", ["decisions", "total", "byKind", "next"]],
  ["/api/pipeline", ["stages", "steps", "runner", "sync", "counts"]],
  ["/api/pipeline/state", keys<PipelineState>()("enabled", "changedBy", "limits", "pilot")],
  ["/api/pipeline/jobs", ["jobs", "total"]],
  ["/api/flow", keys<Flow>()("repo", "nodes", "edges")],
  ["/api/work", keys<WorkList>()("rows", "total", "next")],
  ["/api/cost", keys<CostReport>()("runs", "total", "stages", "repos", "series")],
  ["/api/agents", ["runs", "nextCursor"]],
  ["/api/rates", ["window", "bucket", "stages", "accounts"]],
  ["/api/prompts", keys<PromptsReport>()("commit", "prompts")],
  ["/api/main-ci", keys<MainCi>()("summary", "repos")],
  ["/api/tasks", ["tasks", "next"]],
  ["/api/access", keys<AccessOverview>()("entries", "sessions")],
  ["/api/audit", ["entries", "total", "actions"]],
  ["/api/contributors", ["rule", "total", "byTier", "contributors"]],
  ["/api/classifiers", ["runs", "run", "overall", "confusion"]],
  ["/api/build/summary", ["queued", "running", "slots", "free", "online"]],
  ["/api/repos/all", ["name", "tracked", "openPrs", "openIssues", "pipeline", "merging", "pushing", "commenting"]],
  ["/api/home", ["needs", "problems", "phases", "running", "progress", "done"]],
  ["/api/items/status", ["rows", "byPhase", "total", "nextCursor"]],
  ["/api/search?q=PR", ["repo", "number", "kind", "title", "state"]],
];

describe("dashboard API shapes", () => {
  before(async () => {
    const dir = tmpdir("api-shapes");
    const perms = join(dir, "perms.json");
    writeFileSync(perms, JSON.stringify({ op: { app: "admin" } }));
    const config = loadConfig({ AUTOCRAFT_DEV_AUTH: "1", AUTOCRAFT_LISTEN: "127.0.0.1:0", AUTOCRAFT_DB: join(dir, "x.db"), AUTOCRAFT_DEV_PERMS: perms });
    const s = await startServer({ config, db: w.db, provider: new FakeProvider(perms), routes: apiRoutes({}) });
    base = s.url;
    stop = s.close;
    const hop = async (p: string) => {
      const r = await fetch(new URL(p, base), { headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, redirect: "manual" });
      for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); jar.set(kv!.slice(0, kv!.indexOf("=")), kv!.slice(kv!.indexOf("=") + 1)); }
      return r.headers.get("location")!;
    };
    const auth = await hop("/auth/signin?return_to=/");
    const cb = await hop(`${auth}&login=op`);
    await hop(cb);
  });
  after(async () => { await stop(); w.close(); });

  for (const [path, fields] of OBJECTS) {
    test(path, async () => {
      const { status, json } = await get(path);
      assert.equal(status, 200);
      const obj = (Array.isArray(json) ? json[0] : json) as Record<string, unknown>;
      assert.ok(obj, `${path} returned no row`);
      for (const f of fields) assert.ok(f in obj, `${path} lacks ${f}`);
    });
  }

  test("an approval answers with the one repo it changed", async () => {
    await get("/api/me");
    const r = await fetch(new URL("/api/repos/labels-approve", base), {
      method: "POST", headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), "x-csrf-token": csrf, "content-type": "application/json" }, body: JSON.stringify({ name: "app" }),
    });
    const json = (await r.json()) as { name?: string; labels?: { approved: boolean }; error?: string };
    assert.equal(r.status, 200, String(json.error));
    assert.equal(json.name, "app");
    assert.equal(json.labels?.approved, true);
  });

  test("an unknown item answers 404 JSON, not a page", async () => {
    const { status, json } = await get("/api/items/app/999");
    assert.equal(status, 404);
    assert.ok((json as { error: string }).error);
  });
});
