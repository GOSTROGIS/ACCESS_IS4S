// The security deep scan with a fake model: areas and findings, verify dropping a disproved finding, the spend cap,
// and who may see or act on the findings over the JSON API.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { FindingView, ScanDetail, ScanView, SecurityOverview } from "../web/src/api/types.ts";
import { addLogin } from "../src/access.ts";
import { connect } from "../src/db.ts";
import { scopeToTracked } from "../src/repos.ts";
import { apiRoutes } from "../src/dash/api/index.ts";
import { loadConfig } from "../src/dash/server/config.ts";
import { startServer } from "../src/dash/server/index.ts";
import { FakeProvider } from "../src/dash/server/provider.ts";
import { insertRun } from "../src/agents/runs.ts";
import { linkRepeatedFindings, runScan, type Ask, type ScanDeps } from "../src/security/scan.ts";
import { securityRepo } from "../src/security/rules.ts";
import { autoFixConfirmed } from "../src/security/actions.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "security-test-"));
const dbFile = join(dir, "dash.db");
const permsFile = join(dir, "perms.json");
writeFileSync(permsFile, "{}");
const tree = join(dir, "tree");
mkdirSync(join(tree, "crates/psd/src"), { recursive: true });
mkdirSync(join(tree, "crates/net/src"), { recursive: true });
writeFileSync(join(tree, "crates/psd/src/layer.rs"), Array.from({ length: 200 }, (_, i) => `// line ${i + 1}`).join("\n"));
writeFileSync(join(tree, "crates/net/src/update.rs"), Array.from({ length: 80 }, (_, i) => `// line ${i + 1}`).join("\n"));

const db = connect(dbFile);
let base = "";
let close: () => Promise<void>;

before(async () => {
  db.prepare("INSERT INTO repos (name, visibility, default_branch, open_prs, open_issues) VALUES ('photocraft', 'public', 'main', 0, 0), ('secret', 'private', 'main', 0, 0)").run();
  addLogin(db, "cli", "boss", "operator", null);
  addLogin(db, "cli", "viewer1", "viewer", null);
  addLogin(db, "cli", "maint", "maintainer", null);
  db.prepare("INSERT OR IGNORE INTO main.tracked_repos (name, added_by, added_at) VALUES ('photocraft', 'cli', 'x'), ('secret', 'cli', 'x')").run();
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
    if (method === "POST") headers["x-csrf-token"] = this.csrf;
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

const ref = (path: string, line: number) => ({ path, line, claim: "shows it" });
const found = (title: string, refs: unknown[], extra: object = {}) => ({ title, severity: "high", urgent: false, confidence: 0.9, category: "path_traversal", refs, reach: "open file -> layer.rs:10", impact: "writes outside the folder", ...extra });

/** A model that plans two real areas and one that does not exist, finds three things in the first area (one real, one that verify disproves, one with a line past the end of its file) and nothing in the second. */
function fakeModel(costs = { model: 1, area: 2, verify: 0.5 }, calls: string[] = []): ScanDeps {
  const ask = (async (id: string, input: { finding?: { title: string } }) => {
    calls.push(id);
    if (id === "security.model") {
      return { cost: costs.model, text: `Plan:\n${JSON.stringify({
        summary: "An editor.", entry_points: [{ name: "Open PSD", kind: "file-open", where: "crates/psd/src/layer.rs:10" }],
        areas: [
          { name: "Updates", paths: ["crates/net"], entry_points: [], risk: 2, why: "network" },
          { name: "PSD reader", paths: ["crates/psd/src"], entry_points: ["Open PSD"], risk: 5, why: "parses files" },
          { name: "Ghost", paths: ["crates/none"], entry_points: [], risk: 4, why: "not in the tree" },
        ],
      })}` };
    }
    if (id === "security.area") {
      const psd = JSON.stringify(input).includes("PSD reader");
      return { cost: costs.area, text: JSON.stringify({ findings: psd ? [
        found("Layer length trusted", [ref("crates/psd/src/layer.rs", 118)]),
        found("Name read unchecked", [ref("crates/psd/src/layer.rs", 40)]),
        found("Beyond the file", [ref("crates/psd/src/layer.rs", 900)]),
        found("Low confidence", [ref("crates/psd/src/layer.rs", 50)], { confidence: 0.4 }),
      ] : [] }) };
    }
    const disproved = input.finding?.title === "Name read unchecked";
    return { cost: costs.verify, text: JSON.stringify({ verdict: disproved ? "disproved" : "confirmed", score: disproved ? 2 : 9, result: "Followed the path in layer.rs:118.", notes: "", proposed_test: disproved ? undefined : "parse a layer with len = u32::MAX" }) };
  }) as Ask;
  return { ask, checkout: async () => ({ dir: tree, sha: "a".repeat(40) }), cancelled: () => false, log: () => {} };
}

const newScan = (cap: number | null): number => Number(db.prepare("INSERT INTO security_scans (repo, state, cap_usd, started_by, started_at) VALUES ('photocraft', 'modeling', ?, 'boss', '2026-11-05T00:00:00Z')").run(cap).lastInsertRowid);
const scanOf = (id: number) => db.prepare("SELECT * FROM security_scans WHERE id = ?").get(id) as { state: string; cost_usd: number; areas_done: number; areas_total: number; estimate_usd: number | null; commit_sha: string };

describe("security deep scan", () => {
  test("areas become findings and verify drops the disproved one; a confirmed finding's fix starts once", async () => {
    const calls: string[] = [];
    const id = newScan(null);
    await runScan(db, id, { ...fakeModel(undefined, calls), confirmed: (n) => autoFixConfirmed(db, "photocraft", n) });
    const s = scanOf(id);
    assert.equal(s.state, "done");
    assert.equal(s.areas_total, 2, "the area that is not in the checkout is dropped");
    assert.equal(s.areas_done, 2);
    assert.equal(s.commit_sha, "a".repeat(40));
    assert.deepEqual(calls, ["security.model", "security.area", "security.verify", "security.verify", "security.area"], "riskiest area first; one verify per finding");
    assert.equal(s.cost_usd, 1 + 2 + 0.5 * 2 + 2);
    const rows = db.prepare("SELECT title, state, verification FROM security_findings WHERE scan_id = ? ORDER BY number").all(id) as { title: string; state: string; verification: string }[];
    assert.deepEqual(rows.map((r) => [r.title, r.state]), [["Layer length trusted", "fixing"], ["Name read unchecked", "disproved"]]);
    assert.equal(JSON.parse(rows[0]!.verification).proposedTest, "parse a layer with len = u32::MAX");
    const fixes = () => db.prepare("SELECT requested_by, json_extract(params, '$.number') AS n FROM jobs WHERE step = 'security-fix'").all() as { requested_by: string; n: number }[];
    const confirmed = (db.prepare("SELECT number FROM security_findings WHERE scan_id = ? AND title = 'Layer length trusted'").get(id) as { number: number }).number;
    assert.deepEqual(fixes().map((j) => [j.requested_by, j.n]), [["pipeline", confirmed]]);
    // Back to new as after a failed fix: the finding is left for the operator, not started again.
    db.prepare("UPDATE security_findings SET state = 'new' WHERE scan_id = ?").run(id);
    assert.equal(await autoFixConfirmed(db), 0);
    // A fix the pipeline switch cancelled does not count: once the finding is back to new, the fix is queued again.
    db.prepare("UPDATE jobs SET state = 'cancelled' WHERE step = 'security-fix'").run();
    db.prepare("UPDATE security_findings SET state = 'fixing', updated_at = '2026-01-01T00:00:00Z' WHERE scan_id = ? AND title = 'Layer length trusted'").run(id);
    assert.equal(await autoFixConfirmed(db), 1);
    db.prepare("UPDATE security_findings SET state = 'new' WHERE scan_id = ?").run(id);
    db.prepare("DELETE FROM jobs WHERE step = 'security-fix'").run();
    db.prepare("DELETE FROM audit WHERE action = 'security-finding-fix'").run();
    // A second scan does not raise the same findings again, nor ask to verify them.
    const again = newScan(null);
    const calls2: string[] = [];
    await runScan(db, again, fakeModel(undefined, calls2));
    assert.deepEqual(calls2.filter((c) => c === "security.verify"), []);
  });

  test("a cap stops the scan before the call that would pass it", async () => {
    const none: string[] = [];
    const low = newScan(0.5);
    await runScan(db, low, fakeModel(undefined, none));
    assert.equal(scanOf(low).state, "capped");
    assert.deepEqual(none, [], "no call starts when even the first would pass the cap");

    // $1 threat model, $2 area scan, then a verify (about $0.6) would pass $3.5.
    db.prepare("DELETE FROM security_findings").run();
    const mid = newScan(3.5);
    await runScan(db, mid, fakeModel());
    const s = scanOf(mid);
    assert.equal(s.state, "capped");
    assert.equal(s.cost_usd, 3);
    const left = db.prepare("SELECT state, verification FROM security_findings WHERE scan_id = ?").all(mid) as { state: string; verification: string }[];
    assert.ok(left.length > 0 && left.every((f) => f.state === "new" && JSON.parse(f.verification).score === null), "findings found before the cap are kept and marked as not verified");
  });

  test("viewers get 404 on the security endpoints; maintainers read; operators act", async () => {
    db.prepare("DELETE FROM security_findings").run();
    const boss = await signedIn("boss"), maint = await signedIn("maint"), viewer = await signedIn("viewer1");
    const started = await boss.post<ScanView>("/api/repos/photocraft/security/scans", { capUsd: 50 });
    assert.equal(started.state, "modeling");
    assert.equal(started.capUsd, 50);
    await boss.post("/api/repos/photocraft/security/scans", { capUsd: 50 }, 409);
    await runScan(db, started.id, fakeModel());

    const view = await maint.get<SecurityOverview>("/api/repos/photocraft/security");
    assert.equal(view.scans[0]!.state, "done");
    assert.deepEqual(view.findings.map((f) => f.title), ["Layer length trusted"]);
    const n = view.findings[0]!.number;
    const detail = await maint.get<FindingView>(`/api/security/findings/photocraft/${n}`);
    assert.equal(detail.verification?.kind, "reasoning");
    assert.equal(detail.timeline.map((c) => c.kind).join(), "model,area,verify");
    await maint.post(`/api/security/findings/photocraft/${n}`, { action: "dismiss", reason: "x" }, 403);

    for (const path of ["/api/repos/photocraft/security", `/api/security/findings/photocraft/${n}`]) await viewer.get(path, 404);
    await viewer.post("/api/repos/photocraft/security/scans", { capUsd: 50 }, 404);
    await viewer.post(`/api/security/findings/photocraft/${n}`, { action: "backlog" }, 404);
    // The scan's job and model calls are not listed for viewers, and are for operators.
    const jobs = (c: Client) => c.get<{ jobs: { step: string }[] }>("/api/pipeline/jobs");
    assert.equal((await jobs(viewer)).jobs.filter((j) => j.step === "security-scan").length, 0);
    assert.equal((await jobs(boss)).jobs.filter((j) => j.step === "security-scan").length, 1);
    const runId = insertRun(db, { jobId: null, step: "security-scan", stage: 9, promptId: "security.area", promptVersion: "1", provider: "claude", model: "opus", accountId: null, items: [{ repo: securityRepo("photocraft"), number: 1 }], prompt: "p" });
    const runs = (c: Client) => c.get<{ runs: { id: number }[] }>("/api/agents?limit=200");
    assert.ok(!(await runs(viewer)).runs.some((r) => r.id === runId));
    assert.ok((await runs(maint)).runs.some((r) => r.id === runId));
    await viewer.get(`/api/agents/${runId}`, 404);

    const dismissed = await boss.post<FindingView>(`/api/security/findings/photocraft/${n}`, { action: "dismiss", reason: "not reachable" });
    assert.equal(dismissed.state, "dismissed");
    assert.equal(dismissed.reason, "not reachable");
    await boss.post(`/api/security/findings/photocraft/${n}`, { action: "dismiss", reason: "again" }, 409);
    assert.equal((await boss.post<FindingView>(`/api/security/findings/photocraft/${n}`, { action: "reopen" })).state, "new");
    assert.equal((await boss.post<FindingView>(`/api/security/findings/photocraft/${n}`, { action: "backlog" })).state, "backlog");
    for (const action of ["land", "advisory", "publish"]) await boss.post(`/api/security/findings/photocraft/${n}`, { action }, 409);
    const audits = (db.prepare("SELECT action FROM audit WHERE action LIKE 'security-%' ORDER BY rowid").all() as { action: string }[]).map((a) => a.action);
    assert.deepEqual(audits, ["security-scan-start", "security-finding-dismiss", "security-finding-reopen", "security-finding-backlog"]);
  });
  test("the scan page lists every call with its agent run, and is 404 for viewers", async () => {
    const boss = await signedIn("boss"), viewer = await signedIn("viewer1");
    const id = newScan(null);
    const model = fakeModel();
    const ask = (async (kind: string, input: unknown) => {
      const runId = insertRun(db, { jobId: null, step: "security-scan", stage: 9, promptId: kind, promptVersion: "1", provider: "claude", model: "opus", accountId: null, items: [{ repo: securityRepo("photocraft"), number: id }], prompt: `prompt of ${kind}` });
      return { ...(await (model.ask as (k: string, i: unknown) => Promise<object>)(kind, input)), runId };
    }) as Ask;
    await runScan(db, id, { ...model, ask });
    const d = await boss.get<ScanDetail>(`/api/security/scans/${id}`);
    assert.equal(d.scan.state, "done");
    assert.deepEqual(d.calls.map((c) => c.kind).slice(0, 2), ["model", "area"]);
    assert.ok(d.calls.every((c) => c.runId !== null));
    assert.ok(d.areas.some((a) => a.name === "PSD reader" && a.state === "done"));
    assert.ok((await boss.get<ScanView[]>("/api/security/scans?repo=photocraft")).some((s) => s.id === id));
    await viewer.get(`/api/security/scans/${id}`, 404);
    await viewer.get("/api/security/scans", 404);
  });

  test("a call that fails after spending still counts against the cap", async () => {
    db.prepare("DELETE FROM security_findings").run();
    const model = fakeModel();
    const ask: Ask = (async (id: string, input: object) => (id === "security.area" ? { text: null, cost: 2 } : (model.ask as (i: string, x: object) => Promise<unknown>)(id, input))) as Ask;
    const id = newScan(3.5);
    await runScan(db, id, { ...model, ask });
    const s = scanOf(id);
    assert.equal(s.state, "capped", "the failed area call used $2, so the retry would pass the cap");
    assert.equal(s.cost_usd, 3);
  });

  test("findings that share an entry point but not a sink are both kept; a repeat (same sink and category, same title, or two more shared refs) is linked to the earlier finding", async () => {
    db.prepare("DELETE FROM security_findings").run();
    const model = fakeModel();
    const entry = ref("crates/psd/src/layer.rs", 10);
    const ask: Ask = (async (id: string, input: object) => {
      if (id !== "security.area") return (model.ask as (i: string, x: object) => Promise<unknown>)(id, input);
      if (!JSON.stringify(input).includes("PSD reader")) return { cost: 1, text: JSON.stringify({ findings: [] }) };
      return { cost: 1, text: JSON.stringify({ findings: [
        found("Layer length trusted", [ref("crates/psd/src/layer.rs", 118), entry, ref("crates/psd/src/layer.rs", 60)]),
        found("Channel count trusted", [ref("crates/psd/src/layer.rs", 140), entry]),
        found("Crafted header escapes the output folder", [ref("crates/psd/src/layer.rs", 120), entry]),
        found("Unchecked size copies heap bytes out", [ref("crates/psd/src/layer.rs", 118), entry, ref("crates/psd/src/layer.rs", 61)], { category: "memory_disclosure" }),
      ] }) };
    }) as Ask;
    const a = newScan(null);
    await runScan(db, a, { ...model, ask });
    const titles = () => (db.prepare("SELECT title FROM security_findings WHERE state = 'new' ORDER BY number").all() as { title: string }[]).map((r) => r.title);
    assert.deepEqual(titles(), ["Layer length trusted", "Channel count trusted"]);
    const b = newScan(null);
    await runScan(db, b, { ...model, ask });
    assert.equal(titles().length, 2, "the second scan adds nothing visible");
    const dupes = db.prepare("SELECT duplicate_of FROM security_findings WHERE state = 'duplicate' ORDER BY number").all() as { duplicate_of: number }[];
    assert.equal(dupes.length, 6);
    const boss = await signedIn("boss");
    const first = await boss.get<FindingView>("/api/security/findings/photocraft/" + dupes[0]!.duplicate_of);
    assert.ok(first.timeline.some((c) => c.kind === "duplicate"));
    // A repeat stored as its own finding (an older rule) is linked at runner start; a second pass changes nothing.
    db.prepare("UPDATE security_findings SET state = 'new', duplicate_of = NULL WHERE state = 'duplicate' AND title = 'Unchecked size copies heap bytes out'").run();
    assert.equal(linkRepeatedFindings(db), 2);
    assert.equal(linkRepeatedFindings(db), 0);
    assert.equal(titles().length, 2);
  });

  test("a capped scan continues with a higher cap: finished work is not redone, the next area runs", async () => {
    db.prepare("DELETE FROM security_findings").run();
    const boss = await signedIn("boss"), maint = await signedIn("maint");
    // $1 model, $2 PSD area (two findings to verify), then a verify would pass $3.5.
    const id = newScan(3.5);
    await runScan(db, id, fakeModel());
    assert.equal(scanOf(id).state, "capped");
    const before = scanOf(id);

    await maint.post(`/api/security/scans/${id}/continue`, { cap: 50 }, 403);
    await boss.post(`/api/security/scans/${id}/continue`, { cap: 3 }, 400);
    const other = await boss.post<ScanView>("/api/repos/photocraft/security/scans", { capUsd: 5 });
    await boss.post(`/api/security/scans/${id}/continue`, { cap: 50 }, 409);
    db.prepare("UPDATE security_scans SET state = 'done' WHERE id = ?").run(other.id);

    const resumed = await boss.post<ScanView>(`/api/security/scans/${id}/continue`, { cap: 50 });
    assert.equal(resumed.state, "verifying", "findings the cap left unchecked are verified first");
    assert.equal(resumed.capUsd, 50);
    await boss.post(`/api/security/scans/${id}/continue`, { cap: 50 }, 409);

    const calls: string[] = [];
    await runScan(db, id, fakeModel(undefined, calls));
    assert.deepEqual(calls, ["security.verify", "security.verify", "security.area"], "no threat model, no second call for the finished PSD area");
    const s = scanOf(id);
    assert.equal(s.state, "done");
    assert.equal(s.commit_sha, before.commit_sha);
    assert.equal(s.areas_done, 2);
    assert.equal(s.cost_usd, before.cost_usd + 0.5 * 2 + 2);
    const rows = db.prepare("SELECT state FROM security_findings WHERE scan_id = ? ORDER BY number").all(id) as { state: string }[];
    assert.deepEqual(rows.map((r) => r.state), ["new", "disproved"]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM security_areas WHERE scan_id = ?").get(id) as { n: number }).n, 2);
    assert.ok((db.prepare("SELECT 1 FROM audit WHERE action = 'security-scan-continue'").get()));
    await boss.post(`/api/security/scans/${id}/continue`, { cap: 90 }, 409);
  });

  test("a maintainer who cannot see the repo sees none of its scan jobs", async () => {
    const boss = await signedIn("boss"), maint = await signedIn("maint");
    const started = await boss.post<ScanView>("/api/repos/secret/security/scans", { capUsd: 1 });
    db.prepare("UPDATE jobs SET state = 'running', progress = 'area 1', started_at = ? WHERE id = (SELECT job_id FROM security_scans WHERE id = ?)").run(new Date().toISOString(), started.id);
    const steps = (c: Client) => c.get<{ jobs: { step: string; params: { repo?: string } }[] }>("/api/pipeline/jobs").then((r) => r.jobs.filter((j) => j.step === "security-scan" && j.params.repo === "secret").length);
    assert.equal(await steps(boss), 1);
    assert.equal(await steps(maint), 0);
    const nowJobs = (c: Client) => c.get<{ entries: { kind: string; title: string }[] }>("/api/now").then((r) => r.entries.filter((e) => e.kind === "job" && e.title === "Security deep scan").length);
    assert.equal(await nowJobs(boss), 1);
    assert.equal(await nowJobs(maint), 0);
    await maint.get("/api/repos/secret/security", 404);
    const audit = await maint.get<{ entries: { action: string; target: string }[] }>("/api/audit");
    assert.ok(!audit.entries.some((e) => e.target?.startsWith("secret:")));
  });
});
