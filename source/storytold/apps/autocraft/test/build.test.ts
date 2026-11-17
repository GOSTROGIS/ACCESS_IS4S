// Build environments: claim matching, lost workers, cancels, worker key auth, size caps,
// the artifact type allowlist, and the dashboard API (visibility, operator-only writes, downloads).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { BuildTaskDetail, TaskPage } from "../web/src/api/types.ts";
import { addLogin } from "../src/access.ts";
import { sniff } from "../src/build/artifacts.ts";
import { authenticate, createEnv, hello, listEnvs, rotateKey, updateEnv } from "../src/build/envs.ts";
import { appendLog, MAX_LOG_BYTES, cancelTask, claim, createTask, getTask } from "../src/build/tasks.ts";
import { startWorkerServer } from "../src/build/worker-api.ts";
import { connect } from "../src/db.ts";
import { apiRoutes } from "../src/dash/api/index.ts";
import { loadConfig } from "../src/dash/server/config.ts";
import { startServer } from "../src/dash/server/index.ts";
import { FakeProvider } from "../src/dash/server/provider.ts";
import { scopeToTracked } from "../src/repos.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "build-test-"));
process.env.AUTOCRAFT_ARTIFACT_DIR = join(dir, "artifacts");
const db = connect(join(dir, "build.db"));
const SHA = "a".repeat(40);
const PLAN = [{ name: "t", cmd: ["true"], network: "none" as const, timeoutSec: 10 }];
const CAPS = { os: "linux", arch: "x86_64", cpus: 8, memGb: 32, diskGb: 200, display: false, gpu: false, toolchains: ["rust-stable", "node-24"] };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);

let n = 0;
/** A registered, enabled environment that has said hello. */
function env(opts: { slots?: number; caps?: Partial<typeof CAPS>; enabled?: boolean } = {}) {
  const id = `env-${++n}`;
  const { key } = createEnv(db, { id, label: id, kind: "local-sandbox", slots: opts.slots ?? 2 }, "op");
  hello(db, id, { version: "1.0", capabilities: { ...CAPS, ...opts.caps }, slots: 8 });
  if (opts.enabled === false) updateEnv(db, id, { enabled: false }, "op");
  return { id, key };
}
const task = (over: Partial<Parameters<typeof createTask>[1]> = {}) => createTask(db, { step: "verify", repo: "open-app", headSha: SHA, plan: PLAN, ...over });
const clear = () => db.exec("DELETE FROM build_tasks; DELETE FROM build_task_logs; DELETE FROM build_artifacts");

before(() => {
  db.exec("INSERT INTO tracked_repos (name, pipeline) VALUES ('open-app', 1), ('vault', 0)");
  db.exec("INSERT INTO repos (name, visibility) VALUES ('open-app', 'public'), ('vault', 'internal')");
});
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("task source", () => {
});

describe("claim", () => {






});

describe("lost workers and cancels", () => {


});

describe("worker API", () => {
  let url = "";
  let close: () => Promise<void>;
  before(async () => {
    const w = await startWorkerServer({ db, listen: "127.0.0.1:0" });
    url = w.url;
    close = w.close;
  });
  after(() => close());
  const call = (key: string | null, path: string, body?: unknown, method = "POST", type = "application/json") =>
    fetch(`${url}${path}`, {
      method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { "content-type": type } : {}) },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? new Uint8Array(body) : typeof body === "string" ? body : JSON.stringify(body),
    });

  test("keys: missing, wrong, other environment's and rotated keys are refused", async () => {
    const a = env(), b = env();
    assert.equal((await call(null, "/worker/claim", { free: 1 })).status, 401);
    assert.equal((await call("cwk_nope_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "/worker/claim", { free: 1 })).status, 401);
    assert.equal((await call(a.key.slice(0, -1) + "x", "/worker/claim", { free: 1 })).status, 401);
    assert.equal((await call(a.key, "/worker/claim", { free: 1 })).status, 200);
    assert.equal(authenticate(db, a.key)!.id, a.id);
    assert.equal(authenticate(db, b.key)!.id, b.id);
    const { key } = rotateKey(db, a.id, "op");
    assert.equal((await call(a.key, "/worker/claim", { free: 1 })).status, 401);
    assert.equal((await call(key, "/worker/claim", { free: 1 })).status, 200);
    assert.ok(!(db.prepare("SELECT key_hash FROM build_envs WHERE id = ?").get(a.id) as { key_hash: string }).key_hash.includes(key));   // only a hash is stored
  });

  test("a task of another environment cannot be touched", async () => {
    clear();
    const a = env(), b = env();
    const id = task();
    claim(db, a.id, 1);
    assert.equal((await call(b.key, `/worker/tasks/${id}/heartbeat`)).status, 409);
    assert.equal((await call(b.key, `/worker/tasks/${id}/log`, { step: "t", chunk: "x" })).status, 409);
    assert.equal((await call(a.key, `/worker/tasks/${id}/start`)).status, 200);
  });



  test("log appends stop at the cap and the stored bytes never pass it", () => {
    clear();
    const e = env();
    const id = task();
    claim(db, e.id, 1);
    const chunk = "x".repeat(60 * 1024);
    let last = { truncated: false };
    for (let i = 0; i < Math.ceil(MAX_LOG_BYTES / chunk.length) + 3; i++) last = appendLog(db, e.id, id, "t", chunk);
    assert.equal(last.truncated, true);
    assert.equal((db.prepare("SELECT log_bytes FROM build_tasks WHERE id = ?").get(id) as { log_bytes: number }).log_bytes, MAX_LOG_BYTES);
    const stored = (db.prepare("SELECT SUM(LENGTH(chunk)) AS n FROM build_task_logs WHERE task_id = ?").get(id) as { n: number }).n;
    assert.ok(stored <= MAX_LOG_BYTES + 100, `stored ${stored}`);
  });

  test("hello stores capabilities; bad ones are refused", async () => {
    const e = env();
    assert.equal((await call(e.key, "/worker/hello", { version: "2.1", slots: 3, capabilities: { ...CAPS, os: "plan9" } })).status, 400);
    const ok = await call(e.key, "/worker/hello", { version: "2.1", slots: 3, capabilities: CAPS });
    assert.deepEqual(await ok.json(), { envId: e.id, label: e.id, slots: 2 });
    assert.equal(listEnvs(db).find((x) => x.id === e.id)!.version, "2.1");
  });


  test("artifacts: only PNG, JSON, JUnit XML and UTF-8 text are accepted; the type comes from the bytes", async () => {
    clear();
    const e = env();
    const id = task();
    claim(db, e.id, 1);
    const put = (name: string, body: Buffer | string, type = "application/octet-stream") => call(e.key, `/worker/tasks/${id}/artifacts/${name}`, body, "PUT", type);
    assert.equal((await put("shot.png", PNG, "text/html")).status, 200);
    assert.equal((await put("r.json", '{"a":1}')).status, 200);
    assert.equal((await put("junit.xml", '<?xml version="1.0"?><testsuites><testsuite/></testsuites>')).status, 200);
    assert.equal((await put("page.html", "<html><script>alert(1)</script></html>", "text/html")).status, 200);
    assert.equal((await put("tool", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 1, 2, 3]))).status, 415);
    assert.equal((await put("bin.dat", Buffer.from([0xff, 0xfe, 0xfd, 0xfc]))).status, 415);
    assert.equal((await put("empty.txt", "")).status, 400);
    assert.equal((await put("..%2Fescape", "x")).status, 400);
    assert.equal((await put(".hidden", "x")).status, 400);
    const types = Object.fromEntries(getTask(db, id)!.artifacts.map((a) => [a.name, a.contentType]));
    assert.deepEqual(types, { "junit.xml": "application/xml", "page.html": "text/plain", "r.json": "application/json", "shot.png": "image/png" });
    assert.equal(sniff(Buffer.from("<html>")), "text/plain");
    assert.equal(sniff(Buffer.from("{broken")), "text/plain");
  });
});

describe("dashboard API", () => {
  let base = "";
  let stop: () => Promise<void>;
  let hiddenTask = 0, openTask = 0;
  before(async () => {
    clear();
    db.exec("DELETE FROM build_envs");
    addLogin(db, "cli", "boss", "operator", null);
    addLogin(db, "cli", "viewer1", "viewer", null);
    addLogin(db, "cli", "maint1", "maintainer", null);
    scopeToTracked(db);
    const perms = join(dir, "perms.json");
    writeFileSync(perms, "{}");
    const s = await startServer({
      config: loadConfig({ AUTOCRAFT_DEV_AUTH: "1", AUTOCRAFT_LISTEN: "127.0.0.1:0", AUTOCRAFT_DB: join(dir, "build.db"), AUTOCRAFT_DEV_PERMS: perms }),
      db, provider: new FakeProvider(perms), routes: apiRoutes(),
    });
    base = s.url;
    stop = s.close;
    openTask = task({ repo: "open-app" });
    hiddenTask = task({ repo: "vault" });
  });
  after(() => stop());

  async function signedIn(login: string) {
    const jar = new Map<string, string>();
    let csrf = "";
    const send = async (path: string, init: { method?: string; body?: unknown } = {}) => {
      const r = await fetch(new URL(path, base), {
        method: init.method ?? "GET", redirect: "manual",
        headers: {
          cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), accept: "application/json", origin: new URL(base).origin,
          ...(init.body !== undefined ? { "content-type": "application/json", "x-csrf-token": csrf } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      for (const c of r.headers.getSetCookie()) {
        const [kv] = c.split(";");
        jar.set(kv!.slice(0, kv!.indexOf("=")), kv!.slice(kv!.indexOf("=") + 1));
      }
      return r;
    };
    const start = await send("/auth/signin?return_to=/");
    const auth = await send(`${start.headers.get("location")}&login=${login}`);
    await send(auth.headers.get("location")!);
    csrf = (await send("/api/me")).headers.get("x-csrf-token") ?? "";
    return { send, get: async <T>(p: string) => (await send(p)).json() as Promise<T> };
  }

  test("tasks of a repo the viewer cannot see are left out of lists and answer 404", async () => {
    const v = await signedIn("viewer1");
    assert.deepEqual((await v.get<TaskPage>("/api/tasks")).tasks.map((t) => t.id), [openTask]);
    assert.equal((await v.send(`/api/tasks/${hiddenTask}`)).status, 404);
    assert.equal((await v.send(`/api/tasks/${openTask}`)).status, 200);
    assert.equal((await v.send("/api/tasks?repo=vault")).status, 404);
    assert.deepEqual(await v.get("/api/build/summary"), { queued: 1, running: 0, slots: 0, free: 0, online: 0 });
    const o = await signedIn("boss");
    assert.deepEqual((await o.get<TaskPage>("/api/tasks")).tasks.map((t) => t.id), [hiddenTask, openTask]);
    assert.equal((await o.get<BuildTaskDetail>(`/api/tasks/${hiddenTask}`)).repo, "vault");
  });


  test("writes are for operators and audited; the key is shown once and never listed", async () => {
    const v = await signedIn("viewer1");
    assert.equal((await v.send("/api/envs", { method: "POST", body: { id: "nope", label: "x", kind: "remote", slots: 1 } })).status, 403);
    assert.equal((await v.send(`/api/tasks/${openTask}/cancel`, { method: "POST", body: {} })).status, 403);
    const o = await signedIn("boss");
    const made = await o.send("/api/envs", { method: "POST", body: { id: "sandbox", label: "Sandbox", kind: "local-sandbox", slots: 2 } });
    assert.equal(made.status, 200);
    const { env: e, key } = (await made.json()) as { env: { id: string }; key: string };
    assert.match(key, /^cwk_sandbox_/);
    assert.equal(JSON.stringify(await o.get("/api/envs")).includes(key), false);
    assert.equal(JSON.stringify(await o.get("/api/envs")).includes("key_hash"), false);
    assert.equal((await o.send("/api/envs", { method: "POST", body: { id: "sandbox", label: "x", kind: "remote", slots: 1 } })).status, 409);
    assert.equal((await o.send(`/api/envs/${e.id}`, { method: "PUT", body: { slots: 0 } })).status, 400);
    assert.equal((await o.send(`/api/envs/${e.id}`, { method: "PUT", body: { enabled: false } })).status, 200);
    // a disabled environment is hidden from viewers
    assert.deepEqual(await v.get("/api/envs"), []);
    const rot = (await (await o.send(`/api/envs/${e.id}/rotate-key`, { method: "POST", body: {} })).json()) as { key: string };
    assert.notEqual(rot.key, key);
    assert.equal(authenticate(db, key), null);
    assert.equal((await o.send(`/api/tasks/${openTask}/cancel`, { method: "POST", body: {} })).status, 200);
    const actions = (db.prepare("SELECT action FROM audit WHERE action LIKE 'env-%' OR action = 'task-cancel' ORDER BY rowid").all() as { action: string }[]).map((r) => r.action);
    assert.ok(["env-create", "env-change", "env-rotate-key", "task-cancel"].every((a) => actions.includes(a)), actions.join());
  });

  test("artifact downloads are attachments with nosniff and a sandbox policy; PNG is inline", async () => {
    clear();
    const e = env();
    const id = task({ repo: "open-app" });
    claim(db, e.id, 1);
    const w = await startWorkerServer({ db, listen: "127.0.0.1:0" });
    try {
      const put = (name: string, body: Buffer | string) => fetch(`${w.url}/worker/tasks/${id}/artifacts/${name}`, { method: "PUT", headers: { authorization: `Bearer ${e.key}` }, body: typeof body === "string" ? body : new Uint8Array(body) });
      assert.equal((await put("page.html", "<script>alert(1)</script>")).status, 200);
      assert.equal((await put("shot.png", PNG)).status, 200);
    } finally {
      await w.close();
    }
    const v = await signedIn("maint1");
    const html = await v.send(`/api/tasks/${id}/artifacts/page.html`);
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-disposition") ?? "", /^attachment; filename="page.html"; filename\*=UTF-8''page\.html$/);
    assert.match(html.headers.get("content-type") ?? "", /^text\/plain/);
    assert.equal(html.headers.get("x-content-type-options"), "nosniff");
    assert.equal(html.headers.get("content-security-policy"), "sandbox");
    assert.equal(await html.text(), "<script>alert(1)</script>");
    const png = await v.send(`/api/tasks/${id}/artifacts/shot.png`);
    assert.match(png.headers.get("content-disposition") ?? "", /^inline/);
    assert.equal(png.headers.get("content-type"), "image/png");
    assert.equal(png.headers.get("content-security-policy"), "sandbox");
    assert.equal((await v.send(`/api/tasks/${id}/artifacts/missing.txt`)).status, 404);
    assert.equal((await v.send(`/api/tasks/${id}/artifacts/..%2F..%2Fbuild.db`)).status, 404);
    const hidden = task({ repo: "vault" });
    assert.equal((await v.send(`/api/tasks/${hidden}/artifacts/x.txt`)).status, 404);
  });
});

describe("cancel and the worker API limiter", () => {
  test("cancelling a claimed task records the cancel; a finished task is a 409 with no audit row", () => {
    clear();
    const e = env();
    const id = task();
    claim(db, e.id, 1);
    assert.equal(getTask(db, id)!.state, "claimed");
    const t = cancelTask(db, id, "op");
    assert.equal(t.state, "cancelled");
    assert.equal(t.cancelRequested, true);
    assert.equal(t.summary, "Cancelled by an operator.");
    const audits = () => (db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'task-cancel'").get() as { n: number }).n;
    const before = audits();
    assert.throws(() => cancelTask(db, id, "op"), /already cancelled/);
    assert.equal(audits(), before);
  });

  test("the failed-key limiter persists across requests: the 31st wrong key is a 429", async () => {
    const w = await startWorkerServer({ db, listen: "127.0.0.1:0" });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 31; i++) statuses.push((await fetch(`${w.url}/worker/hello`, { method: "POST", headers: { authorization: "Bearer wrong-key" } })).status);
      assert.ok(statuses.slice(0, 30).every((s) => s === 401), statuses.join());
      assert.equal(statuses[30], 429);
    } finally {
      await w.close();
    }
  });
});
