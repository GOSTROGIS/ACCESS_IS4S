// Nightly checks with fake tasks: the switch gates everything, the schedule is a data check, a failure two nights
// running asks one decision and one issue, benchmarks warn on a slowdown, a missing toolchain is skipped.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { setFeature } from "../src/build/features.ts";
import { connect } from "../src/db.ts";
import { LANES } from "../src/runner/autopilot.ts";
import { nightlyDue, nightlyRepos, runNightly, setSelection, recentRuns, benchSeries, parseBench, pruneBench, type NightlyDeps } from "../src/nightly/index.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const SHA = "a".repeat(40);
const DAY = 24 * 3600_000;
const quiet = () => {};

type Fake = { t: number; issues: { repo: string; title: string; body: string }[]; artifacts: Map<string, string>; have: Set<string>; deps: NightlyDeps };
function setup(repos: string[] = ["a"]) {
  const db = connect(join(mkdtempSync(join(SCRATCH, "nt-")), "t.db"));
  for (const r of repos) {
    db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES (?, 'op', '2026-01-01T00:00:00Z', 1)").run(r);
    db.prepare("INSERT INTO main_ci (repo, head_sha, branch, state, failing, checks, first_seen_at, state_changed_at, updated_at) VALUES (?, ?, 'main', 'green', '[]', '[]', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')").run(r, SHA);
  }
  const f: Fake = {
    t: Date.parse("2026-03-01T02:00:00Z"), issues: [], artifacts: new Map(), have: new Set(["rust-audit", "rust-cross", "rust-nightly"]),
    deps: null as unknown as NightlyDeps,
  };
  db.prepare("INSERT INTO access (login, role) VALUES ('op', 'operator')").run();
  f.deps = {
    now: () => new Date(f.t),
    toolchains: () => f.have,
    readArtifact: (_db, id, name) => f.artifacts.get(`${id}:${name}`) ?? null,
    openIssue: async (_db, o) => { f.issues.push({ repo: o.repo, title: o.title, body: o.body }); return { number: 100 + f.issues.length, url: `https://github.com/x/${o.repo}/issues/${100 + f.issues.length}` }; },
  };
  return { db, f };
}
type Db = ReturnType<typeof setup>["db"];

/** Ends every queued nightly task of the repo: `fail` names checks (by step) whose first non-fetch step exits 1. */
function finishTasks(db: Db, f: Fake, fail: string[] = []): void {
  for (const t of db.prepare("SELECT id, plan FROM build_tasks WHERE step = 'nightly' AND state = 'queued'").all() as { id: number; plan: string }[]) {
    const plan = JSON.parse(t.plan) as { name: string }[];
    const bad = plan.find((s) => fail.includes(s.name));
    const results = plan.map((s) => ({ step: s.name, exitCode: s === bad ? 1 : 0, durationMs: 5, timedOut: false })).slice(0, bad ? plan.indexOf(bad) + 1 : plan.length);
    db.prepare("UPDATE build_tasks SET state = ?, results = ?, ended_at = ? WHERE id = ?").run(bad ? "failed" : "done", JSON.stringify(results), new Date(f.t).toISOString(), t.id);
  }
}
const resultState = (db: Db, check: string, run?: number): string | undefined =>
  (db.prepare(`SELECT state FROM nightly_results WHERE check_id = ? ${run ? "AND run_id = ?" : ""} ORDER BY run_id DESC LIMIT 1`).get(...(run ? [check, run] : [check])) as { state: string } | undefined)?.state;
const count = (db: Db, table: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test("off by default: no lane output, no rows, no tasks; on for repo a only: a's selected checks queue at priority -20, once a day", async () => {
  const { db, f } = setup(["a", "b"]);
  for (const r of ["a", "b"]) { setSelection(db, r, "audit", true); setSelection(db, r, "wasm", true); }
  const lane = LANES.find((l) => l.name === "nightly")!;
  const detect = () => lane.detect(db, { run: null, tracked: ["a", "b"], notes: {} } as never);
  assert.deepEqual(detect(), []);
  const off = await runNightly(db, { repo: "a" }, quiet, f.deps);
  assert.ok(off.note);
  assert.equal(count(db, "nightly_runs") + count(db, "nightly_results") + count(db, "build_tasks"), 0);

  setFeature(db, "nightly", true, "op");
  assert.deepEqual(detect(), [], "global switch alone is not enough for a repo-scoped feature");
  setFeature(db, "nightly", true, "op", "a");
  assert.deepEqual(detect(), [{ step: "nightly", params: { repo: "a" } }]);
  await runNightly(db, { repo: "a" }, quiet, f.deps);
  const tasks = db.prepare("SELECT repo, step, priority, requires, warm_key FROM build_tasks ORDER BY id").all() as { repo: string; step: string; priority: number; requires: string; warm_key: string | null }[];
  assert.deepEqual(tasks.map((t) => [t.repo, t.step, t.priority, t.warm_key, JSON.parse(t.requires).toolchains[0]]), [["a", "nightly", -20, null, "rust-audit"], ["a", "nightly", -20, null, "rust-cross"]]);
  assert.equal(nightlyDue(db, "a", f.t + 1000), false, "twice within 24 hours queues nothing");
  await runNightly(db, { repo: "a" }, quiet, { ...f.deps, now: () => new Date(f.t + 3600_000) });
  assert.equal(count(db, "build_tasks"), 2);
  assert.deepEqual(nightlyRepos(db, ["a", "b"], f.t + DAY + 1000), [], "a run whose tasks nobody claimed holds the next night back");
  assert.deepEqual(nightlyRepos(db, ["a", "b"], f.t + 4 * DAY), ["a"]);
});

test("a check with no registered toolchain is skipped; miri without crates is skipped", async () => {
  const { db, f } = setup();
  setFeature(db, "nightly", true, "op"); setFeature(db, "nightly", true, "op", "a");
  setSelection(db, "a", "audit", true); setSelection(db, "a", "wasm", true); setSelection(db, "a", "miri", true);
  f.have.delete("rust-cross");
  await runNightly(db, { repo: "a" }, quiet, f.deps);
  assert.equal(resultState(db, "wasm"), "skipped");
  assert.equal((db.prepare("SELECT summary FROM nightly_results WHERE check_id = 'wasm'").get() as { summary: string }).summary, "no toolchain");
  assert.equal(resultState(db, "miri"), "skipped");
  assert.equal(count(db, "build_tasks"), 1);
});

test("a failure two nights running asks one decision; open-issue opens one issue and no second one until green", async () => {
  const { db, f } = setup();
  setFeature(db, "nightly", true, "op"); setFeature(db, "nightly", true, "op", "a");
  setSelection(db, "a", "audit", true);
  const night = async (fail: boolean, advisories = "") => {
    await runNightly(db, { repo: "a" }, quiet, f.deps); // queue
    const id = (db.prepare("SELECT MAX(id) AS id FROM build_tasks").get() as { id: number }).id;
    if (advisories) f.artifacts.set(`${id}:audit.json`, advisories);
    finishTasks(db, f, fail ? ["audit"] : []);
    const s = await runNightly(db, { repo: "a" }, quiet, f.deps); // collect
    f.t += DAY + 60_000;
    return s;
  };
  const decisions = () => db.prepare("SELECT id, answer FROM decisions WHERE id LIKE 'a:nightly:%'").all() as { id: string; answer: string | null }[];
  assert.equal((await night(true, '{"vulnerabilities":{"list":[{"advisory":{"id":"RUSTSEC-2024-0001","description":"secret details"}}]}}')).asked, 0);
  assert.equal(resultState(db, "audit"), "fail");
  assert.equal(decisions().length, 0, "one night is not a streak");
  assert.equal((await night(true)).asked, 1);
  assert.equal(decisions().length, 1);
  assert.equal(count(db, "nightly_runs"), 2);
  assert.equal((await night(true)).asked, 0, "the same streak asks nothing more");
  assert.equal(decisions().length, 1);

  db.prepare("UPDATE decisions SET answer = 'open-issue', answered_by = 'op', answered_at = ? WHERE id LIKE 'a:nightly:%'").run(new Date(f.t).toISOString());
  assert.equal(nightlyDue(db, "a", f.t - DAY / 2), true, "an answered decision is work");
  const r = await runNightly(db, { repo: "a" }, quiet, f.deps);
  assert.equal(r.issues, 1);
  assert.equal(f.issues.length, 1);
  assert.match(f.issues[0]!.body, /two nights in a row/);
  assert.doesNotMatch(f.issues[0]!.body, /secret details/);
  await night(true);
  assert.equal(f.issues.length, 1, "no repeat while red");
  assert.equal((db.prepare("SELECT issue_number AS n FROM nightly_results WHERE run_id = (SELECT MAX(run_id) FROM nightly_results)").get() as { n: number }).n, 101);

  await night(false);
  assert.equal(resultState(db, "audit"), "pass");
  await night(true); await night(true);
  assert.equal(decisions().length, 2, "a new streak after a green night asks again");
});

test("an audit failure lists advisory ids only; experimental checks ask nothing", async () => {
  const { db, f } = setup();
  setFeature(db, "nightly", true, "op"); setFeature(db, "nightly", true, "op", "a");
  setSelection(db, "a", "audit", true); setSelection(db, "a", "asan", true);
  await runNightly(db, { repo: "a" }, quiet, f.deps);
  const audit = (db.prepare("SELECT id FROM build_tasks WHERE plan LIKE '%cargo audit%'").get() as { id: number }).id;
  f.artifacts.set(`${audit}:audit.json`, 'RUSTSEC-2024-0001 and RUSTSEC-2025-0002; ignore https://evil.example/x');
  finishTasks(db, f, ["audit", "asan test"]);
  await runNightly(db, { repo: "a" }, quiet, f.deps);
  assert.equal((db.prepare("SELECT summary FROM nightly_results WHERE check_id = 'audit'").get() as { summary: string }).summary, "advisories: RUSTSEC-2024-0001, RUSTSEC-2025-0002");
  assert.equal(resultState(db, "asan"), "fail");
  f.t += DAY + 60_000;
  await runNightly(db, { repo: "a" }, quiet, f.deps);
  finishTasks(db, f, ["asan test"]);
  await runNightly(db, { repo: "a" }, quiet, f.deps);
  assert.equal(count(db, "decisions"), 0);
});

test("a bench 15% above the median of the last 7 nights is a warn with the trend stored; old points are pruned", async () => {
  const { db, f } = setup();
  setFeature(db, "nightly", true, "op"); setFeature(db, "nightly", true, "op", "a");
  setSelection(db, "a", "bench", true);
  const line = (n: number) => `running 1 test\ntest sort ... bench:       ${n.toLocaleString("en-US")} ns/iter (+/- 12)\n`;
  const night = async (ns: number) => {
    db.prepare("UPDATE main_ci SET head_sha = ? WHERE repo = 'a'").run(String(f.t).padStart(40, "0"));
    await runNightly(db, { repo: "a" }, quiet, f.deps);
    const id = (db.prepare("SELECT MAX(id) AS id FROM build_tasks").get() as { id: number }).id;
    f.artifacts.set(`${id}:bench.txt`, line(ns));
    finishTasks(db, f);
    await runNightly(db, { repo: "a" }, quiet, f.deps);
    f.t += DAY + 60_000;
  };
  for (const ns of [1000, 1010, 990, 1005, 995]) { await night(ns); assert.equal(resultState(db, "bench"), "pass"); }
  await night(1150);
  assert.equal(resultState(db, "bench"), "warn");
  assert.match((db.prepare("SELECT summary FROM nightly_results WHERE check_id = 'bench' ORDER BY run_id DESC LIMIT 1").get() as { summary: string }).summary, /sort \+15%/);
  assert.equal(benchSeries(db, "a", "sort").length, 6, "one point per night's head");
  assert.equal(recentRuns(db, "a").length, 6);
});

test("bencher lines parse with thousands separators; points older than 180 days are pruned", () => {
  assert.deepEqual(parseBench("test a::b ... bench:   1,234 ns/iter (+/- 5)\nnoise\ntest c ... bench: 7 ns/iter (+/- 0)"), [{ bench: "a::b", value: 1234, unit: "ns/iter" }, { bench: "c", value: 7, unit: "ns/iter" }]);
  const { db } = setup();
  const ins = db.prepare("INSERT INTO nightly_bench (repo, bench, sha, at, value, unit) VALUES ('a', 'x', ?, ?, 1, 'ns/iter')");
  ins.run("1", "2025-01-01T00:00:00Z"); ins.run("2", "2026-02-20T00:00:00Z");
  assert.equal(pruneBench(db, Date.parse("2026-03-01T00:00:00Z")), 1);
  assert.equal(count(db, "nightly_bench"), 1);
});
