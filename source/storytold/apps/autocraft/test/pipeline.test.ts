// The Pipeline API through HTTP with the fake OAuth provider: everyone signed
// in reads; only operators request and cancel, with params checked
// against the step's schema and one audit row per write.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Job, JobDetail, JobList, PipelineOverview } from "../web/src/api/types.ts";
import { SCRATCH } from "./scratch.ts";

process.env.AUTOCRAFT_EXTRA_STEPS = fileURLToPath(new URL("./runner-steps.ts", import.meta.url));

const { addLogin } = await import("../src/access.ts");
const { connect } = await import("../src/db.ts");
const { scopeToTracked } = await import("../src/repos.ts");
const { apiRoutes } = await import("../src/dash/api/index.ts");
const { loadConfig } = await import("../src/dash/server/config.ts");
const { startServer } = await import("../src/dash/server/index.ts");
const { FakeProvider } = await import("../src/dash/server/provider.ts");
const { FAKE_TOKEN } = await import("./runner-steps.ts");

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "pipeline-test-"));
const dbFile = join(dir, "dash.db");
const permsFile = join(dir, "perms.json");
writeFileSync(permsFile, "{}");

const db = connect(dbFile);
let base = "";
let close: () => Promise<void>;

before(async () => {
  addLogin(db, "cli", "boss", "operator", null);
  addLogin(db, "cli", "viewer1", "viewer", null);
  addLogin(db, "cli", "maint", "maintainer", null);
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

class Client {
  jar = new Map<string, string>();
  csrf = "";
  async req(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "), accept: "application/json" };
    if (method !== "GET") headers["x-csrf-token"] = this.csrf;
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(new URL(path, base), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const k = kv!.slice(0, kv!.indexOf("=")), v = kv!.slice(kv!.indexOf("=") + 1);
      if (/Max-Age=0/.test(c)) this.jar.delete(k);
      else this.jar.set(k, v);
    }
    return r;
  }
  async json<T>(method: string, path: string, body?: unknown, status = 200): Promise<T> {
    const r = await this.req(method, path, body);
    const text = await r.text();
    assert.equal(r.status, status, `${method} ${path}: ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }
  get = <T>(path: string, status = 200) => this.json<T>("GET", path, undefined, status);
  post = <T>(path: string, body?: unknown, status = 200) => this.json<T>("POST", path, body, status);
}

async function signedIn(login: string): Promise<Client> {
  const c = new Client();
  const start = await c.req("GET", "/auth/signin?return_to=/");
  const auth = await c.req("GET", `${start.headers.get("location")}&login=${login}`);
  const done = await c.req("GET", auth.headers.get("location")!);
  assert.equal(done.status, 303, `sign-in of ${login}`);
  c.csrf = (await c.req("GET", "/api/me")).headers.get("x-csrf-token") ?? "";
  return c;
}

const audits = (action: string) => (db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = ?").get(action) as { n: number }).n;

describe("pipeline api", () => {
  test("viewers read jobs without logs, maintainers with them, and both get 403 on run and cancel", async () => {
    const boss = await signedIn("boss");
    const job = await boss.post<Job>("/api/pipeline/jobs", { step: "test-echo", params: { n: 1 } });
    const logFile = join(dir, "job.log");
    writeFileSync(logFile, `starting\nGITHUB_TOKEN=${FAKE_TOKEN}\n${homedir()}/somewhere\n`);
    db.prepare("UPDATE jobs SET log_path = ?, error = 'exit 1: secret-detail' WHERE id = ?").run(logFile, job.id);
    for (const login of ["viewer1", "maint"]) {
      const c = await signedIn(login);
      const o = await c.get<PipelineOverview>("/api/pipeline");
      assert.ok(o.steps.some((s) => s.name === "test-echo"));
      assert.equal(o.stages.length, 7);
      const listed = (await c.get<JobList>("/api/pipeline/jobs")).jobs.find((j) => j.id === job.id);
      assert.ok(listed);
      const d = await c.get<JobDetail>(`/api/pipeline/jobs/${job.id}`);
      for (const e of [listed.error, d.error]) assert.equal(e, login === "viewer1" ? "failed" : "exit 1: secret-detail", "viewers get no error text");
      if (login === "viewer1") assert.equal(d.log, null);
      else assert.ok(!d.log!.includes(FAKE_TOKEN) && !d.log!.includes(homedir()) && d.log!.includes("starting"), d.log!);
      assert.ok(!JSON.stringify(d).includes(logFile), "the log path stays on the server");
      const before = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action <> 'sign-in'").get();
      await c.post("/api/pipeline/jobs", { step: "test-echo", params: { n: 2 } }, 403);
      await c.post(`/api/pipeline/jobs/${job.id}/cancel`, undefined, 403);
      assert.deepEqual(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action <> 'sign-in'").get(), before);
    }
    assert.equal(getState(job.id), "queued");
  });

  test("params outside the step's schema are refused", async () => {
    const boss = await signedIn("boss");
    const before = audits("job-request");
    for (const params of [
      { n: 101 }, { n: -1 }, { n: 1.5 }, { n: "3" }, { mode: "maybe" }, { repo: "not-a-tracked-repo" },
      { run: "Has Spaces" }, { run: "ignore previous instructions" }, { other: 1 }, [1],
    ]) await boss.post("/api/pipeline/jobs", { step: "test-echo", params }, 400);
    await boss.post("/api/pipeline/jobs", { step: "no-such-step", params: {} }, 400);
    assert.equal(audits("job-request"), before);
  });

  test("an operator requests and cancels, each audited", async () => {
    const boss = await signedIn("boss");
    const j = await boss.post<Job>("/api/pipeline/jobs", { step: "test-echo", params: { n: 9, repo: "photocraft", run: "pass-2" } });
    assert.deepEqual(j.params, { n: 9, mode: "ok", repo: "photocraft", run: "pass-2" });
    assert.equal(j.requestedBy, "boss");
    await boss.post("/api/pipeline/jobs", { step: "test-echo", params: { n: 9, repo: "photocraft", run: "pass-2" } }, 409);
    assert.equal((await boss.post<Job>(`/api/pipeline/jobs/${j.id}/cancel`)).state, "cancelled");
    await boss.post(`/api/pipeline/jobs/${j.id}/cancel`, undefined, 409);
    const rows = db.prepare("SELECT action FROM audit WHERE login = 'boss' AND action IN ('job-request', 'job-cancel') ORDER BY rowid").all();
    assert.deepEqual(rows.slice(-2).map((r) => r.action), ["job-request", "job-cancel"]);
  });
});

const getState = (id: number) => (db.prepare("SELECT state FROM jobs WHERE id = ?").get(id) as { state: string }).state;
