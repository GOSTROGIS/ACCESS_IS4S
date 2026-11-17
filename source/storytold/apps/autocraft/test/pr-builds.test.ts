import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { claim } from "../src/build/tasks.ts";
import { createEnv, hello } from "../src/build/envs.ts";
import { setFeature } from "../src/build/features.ts";
import { collectPrBuilds, prBuildDue, runPrBuilds } from "../src/prbuild/index.ts";
import { selectPrBuilds, setPerDay, setScope } from "../src/prbuild/select.ts";
import { prBuildView } from "../src/prbuild/view.ts";

const sha = (c: string) => c.repeat(40);
const noFetch = { baseOf: async () => "b".repeat(40), fetchCrates: async () => ({ ok: true as const, rust: true, crates: [] }) };

function setup() {
  const db = connect(":memory:");
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('app', 'public'), ('vault', 'private')").run();
  for (const r of ["app", "vault"]) db.prepare("INSERT INTO tracked_repos (name, pipeline) VALUES (?, 1)").run(r);
  const add = (repo: string, number: number, author: string, assoc: string, head: string) =>
    db.prepare("INSERT INTO items (repo, number, kind, state, author, author_association, head_oid, is_draft, created_at) VALUES (?, ?, 'pr', 'OPEN', ?, ?, ?, 0, ?)")
      .run(repo, number, author, assoc, head, `2026-11-0${number}T00:00:00Z`);
  add("app", 1, "stranger", "NONE", sha("a"));
  add("app", 2, "regular", "MEMBER", sha("b"));
  add("app", 3, "held-one", "NONE", sha("c"));
  add("vault", 4, "stranger", "NONE", sha("d"));
  db.prepare("INSERT INTO outside_holds (repo, number, author, kind, reason) VALUES ('app', 3, 'held-one', 'pr', 'limit')").run();
  const rust = () => true;
  const tasks = () => db.prepare("SELECT number, step, priority, plan, warm_role FROM build_tasks ORDER BY id").all() as { number: number; step: string; priority: number; plan: string; warm_role: string }[];
  return { db, add, rust, tasks };
}

test("nothing is queued while the switch is off; on, only the outside PR of a public repo is built, and scope all adds the insider's", async () => {
  const { db, tasks } = setup();
  assert.equal(prBuildDue(db, "app"), false);
  assert.equal((await runPrBuilds(db, "app", () => {}, noFetch)).queued, 0);
  assert.equal(tasks().length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pr_builds").get()!.n, 0);

  setFeature(db, "pr-builds", true, "op");
  assert.equal(prBuildDue(db, "app"), false, "the repo's own switch is still off");
  setFeature(db, "pr-builds", true, "op", "app");
  setFeature(db, "pr-builds", true, "op", "vault");
  assert.equal(prBuildDue(db, "app"), true);
  assert.equal((await runPrBuilds(db, "vault", () => {}, noFetch)).queued, 0, "private repo");
  assert.equal((await runPrBuilds(db, "app", () => {}, noFetch)).queued, 1);
  const [t, ...rest] = tasks();
  assert.equal(rest.length, 0);
  assert.deepEqual([t!.number, t!.step, t!.priority, t!.warm_role], [1, "pr-build", -5, "use"]);
  assert.ok((JSON.parse(t!.plan) as { cmd: string[] }[]).every((s) => s.cmd.includes("--workspace") || s.cmd[0] === "sh"));
  assert.equal((await runPrBuilds(db, "app", () => {}, noFetch)).queued, 0, "one build per head");

  setScope(db, "app", "all");
  assert.deepEqual(selectPrBuilds(db, "app", { rust: () => true }).map((c) => c.number), [2], "held PR 3 stays out");
  setPerDay(db, 1);
  assert.deepEqual(selectPrBuilds(db, "app", { rust: () => true }), [], "daily cap reached");
});

test("collect: pass, a failure where CI passed is noted without a hold, a moved head is stale", async () => {
  const { db, add, tasks } = setup();
  setFeature(db, "pr-builds", true, "op");
  setFeature(db, "pr-builds", true, "op", "app");
  setScope(db, "app", "all");
  add("app", 5, "stranger", "NONE", sha("e"));
  await runPrBuilds(db, "app", () => {}, noFetch);
  assert.deepEqual(tasks().map((t) => t.number), [1, 2, 5]);
  const id = (n: number) => (db.prepare("SELECT id FROM build_tasks WHERE number = ?").get(n) as { id: number }).id;
  const result = (n: number, steps: [string, number][]) => {
    const plan = JSON.parse((db.prepare("SELECT plan FROM build_tasks WHERE number = ?").get(n) as { plan: string }).plan) as { name: string }[];
    const done = steps.map(([step, exitCode]) => ({ step, exitCode, durationMs: 1, timedOut: false }));
    db.prepare("UPDATE build_tasks SET state = ?, results = ? WHERE number = ?").run(done.every((r) => r.exitCode === 0) && done.length === plan.length ? "done" : "failed", JSON.stringify(done), n);
  };
  result(1, [["fetch deps", 0], ["build", 0], ["test", 0]]);
  result(2, [["fetch deps", 0], ["build", 0], ["test", 101]]);
  db.prepare("INSERT INTO pr_checks (repo, number, head_oid, overall, checks, fetched_at) VALUES ('app', 2, ?, 'success', '[]', '2099-01-01T00:00:00Z')").run(sha("b"));
  db.prepare("UPDATE items SET head_oid = ? WHERE repo = 'app' AND number = 5").run(sha("f"));
  const verifsBefore = JSON.stringify(db.prepare("SELECT * FROM verifications").all());

  const s = collectPrBuilds(db, "app", () => {});
  assert.deepEqual([s.passed, s.failed, s.disagreements, s.stale], [1, 1, 1, 1]);
  const state = (n: number) => db.prepare("SELECT state, disagree, summary FROM pr_builds WHERE number = ?").get(n) as { state: string; disagree: number; summary: string | null };
  assert.equal(state(1).state, "passed");
  assert.deepEqual([state(2).state, state(2).disagree, state(2).summary], ["failed", 1, "test failed with exit code 101"]);
  assert.equal(state(5).state, "stale");
  assert.equal((db.prepare("SELECT state FROM build_tasks WHERE id = ?").get(id(5)) as { state: string }).state, "cancelled");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM stages WHERE stage = 'pr-build-disagree'").get() as { n: number }).n, 0, "the note never becomes the item's latest stage");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM stages WHERE stage = 'hold'").get() as { n: number }).n, 0);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM verifications").all()), verifsBefore);
  assert.equal(prBuildView(db, "app", 2, sha("b"), true)?.disagree, true);
  assert.equal(prBuildView(db, "app", 2, sha("b"), false)?.summary, null, "viewers get the state only");
  setFeature(db, "pr-builds", false, "op", "app");
  assert.equal(prBuildView(db, "app", 2, sha("b"), true), null, "hidden while the switch is off");
});

const claimer = (db: ReturnType<typeof connect>) => {
  createEnv(db, { id: "env-one", label: "env-one", kind: "local-sandbox", slots: 4 }, "op");
  hello(db, "env-one", { version: "1", capabilities: { os: "linux", arch: "x86_64", cpus: 8, memGb: 32, diskGb: 200, display: false, gpu: false, toolchains: ["rust-stable"] }, slots: 4 });
  return () => claim(db, "env-one", 4).tasks.map((t) => t.repo);
};

test("switching off stops queued builds, and the worker does not claim them while it is off", async () => {
  const { db, tasks } = setup();
  setFeature(db, "pr-builds", true, "op");
  setFeature(db, "pr-builds", true, "op", "app");
  await runPrBuilds(db, "app", () => {}, noFetch);
  assert.equal(tasks().length, 1);
  // Off by the settings alone (as a stale row would be): the claim skips it.
  db.prepare("UPDATE settings SET value = 'off' WHERE key = 'build_feature:pr-builds:app'").run();
  assert.deepEqual(claimer(db)(), []);
  db.prepare("UPDATE settings SET value = 'on' WHERE key = 'build_feature:pr-builds:app'").run();
  setFeature(db, "pr-builds", false, "op", "app");
  assert.equal((db.prepare("SELECT state FROM build_tasks").get() as { state: string }).state, "cancelled");
  assert.equal((db.prepare("SELECT state FROM pr_builds").get() as { state: string }).state, "stale");
});

test("an operator's cancel is not retried; a lost task is retried once", async () => {
  const { db, tasks } = setup();
  setFeature(db, "pr-builds", true, "op");
  setFeature(db, "pr-builds", true, "op", "app");
  await runPrBuilds(db, "app", () => {}, noFetch);
  db.prepare("UPDATE build_tasks SET state = 'cancelled'").run();
  collectPrBuilds(db, "app", () => {});
  assert.equal(tasks().length, 1);
  assert.deepEqual({ ...(db.prepare("SELECT state, summary FROM pr_builds").get() as object) }, { state: "error", summary: "the build task was cancelled" });

  const t2 = setup();
  setFeature(t2.db, "pr-builds", true, "op");
  setFeature(t2.db, "pr-builds", true, "op", "app");
  await runPrBuilds(t2.db, "app", () => {}, noFetch);
  t2.db.prepare("UPDATE build_tasks SET state = 'lost'").run();
  assert.equal(collectPrBuilds(t2.db, "app", () => {}).retried, 1);
  assert.equal(t2.tasks().length, 2);
});

test("a failure that CI later contradicts is noted once, when CI turns green", async () => {
  const { db } = setup();
  setFeature(db, "pr-builds", true, "op");
  setFeature(db, "pr-builds", true, "op", "app");
  await runPrBuilds(db, "app", () => {}, noFetch);
  db.prepare("UPDATE build_tasks SET state = 'failed', results = ?").run(JSON.stringify([{ step: "fetch deps", exitCode: 0, durationMs: 1, timedOut: false }, { step: "build", exitCode: 1, durationMs: 1, timedOut: false }]));
  assert.equal(collectPrBuilds(db, "app", () => {}).disagreements, 0);
  db.prepare("INSERT INTO pr_checks (repo, number, head_oid, overall, checks, fetched_at) VALUES ('app', 1, ?, 'success', '[]', '2099-01-01T00:00:00Z')").run(sha("a"));
  assert.equal(prBuildDue(db, "app"), true);
  assert.equal(collectPrBuilds(db, "app", () => {}).disagreements, 1);
  assert.equal(collectPrBuilds(db, "app", () => {}).disagreements, 0);
  assert.equal(prBuildView(db, "app", 1, sha("a"), true)?.disagree, true);
});
