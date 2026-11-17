// The private fix as build rounds across jobs: a job ends once it has queued a round's build tasks, the next job reads the
// result and resumes the model session, and nothing is built or kept outside the local ref unless every wording check passed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { connect } from "../src/db.ts";
import type { Exec } from "../src/fixup/git.ts";
import { advanceSecurityFixes } from "../src/security/actions.ts";
import { runFix, type FixDeps } from "../src/security/fix.ts";
import { rawFinding, reconcileFindings } from "../src/security/store.ts";
import { sweepSessions } from "../src/prepush/resume.ts";
import { regressionName } from "../src/verify/types.ts";
import { patchFor } from "../src/verify/plan.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const db = connect(join(mkdtempSync(join(SCRATCH, "secfix-rounds-")), "dash.db"));
// A confidential build environment that has reported: private fixes and their builds can run.
db.prepare("INSERT INTO build_envs (id, label, kind, slots, key_hash, confidential, confidential_since, confidential_online_at, created_at) VALUES ('vault', 'vault', 'remote', 1, 'x', 1, '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z')").run();
const SHA = "b".repeat(40);
const SRC = "crates/psd/src/layer.rs";
let seq = 0;

db.prepare("INSERT INTO security_scans (id, repo, state, started_by, started_at, commit_sha) VALUES (1, 'photocraft', 'done', 'boss', '2026-11-05T00:00:00Z', ?)").run(SHA);

function finding(): number {
  const n = ++seq;
  const at = "2026-11-05T00:00:00Z";
  db.prepare(`INSERT INTO security_findings (repo, number, scan_id, area, title, severity, urgent, state, refs, reach, impact, fingerprint, created_at, updated_at)
    VALUES ('photocraft', ?, 1, 'psd', 'Layer length trusted', 'high', 0, 'fixing', ?, 'open file', 'writes outside', ?, ?, ?)`).run(n, JSON.stringify([{ path: SRC, line: 118, claim: "" }]), `fp${n}`, at, at);
  return n;
}
const testNameOf = (n: number): string => regressionName(createHash("sha256").update(`photocraft#${n}`).digest("hex").slice(0, 10));
const reply = (n: number, added = "fn check() {}"): string => {
  const edit = `diff --git a/${SRC} b/${SRC}\n--- a/${SRC}\n+++ b/${SRC}\n@@ -1,1 +1,2 @@\n fn read() {}\n+${added}\n`;
  return `TITLE: Check layer length\nSUMMARY: Compare the length with the remaining data.\n---PATCH---\n${edit}${patchFor("crates/psd", testNameOf(n), "#[test]\nfn it_fails() {}\n")}`;
};

type World = { calls: string[]; asks: { id: string; resume?: string; previous?: unknown }[]; deps: FixDeps; reviews: string[] };
function world(n: number, replies: (round: number) => string): World {
  const calls: string[] = [];
  const asks: World["asks"] = [];
  const reviews: string[] = [];
  const exec: Exec = async (cmd, args) => {
    const a = args.join(" ");
    calls.push(`${cmd} ${a}`);
    if (a.includes("ls-tree")) return { code: 0, stdout: `${SRC}\n`, stderr: "" };
    if (a.includes("rev-parse --git-dir")) return { code: 0, stdout: ".\n", stderr: "" };
    if (a.includes("write-tree")) return { code: 0, stdout: `${"c".repeat(40)}\n`, stderr: "" };
    if (a.includes("commit-tree")) return { code: 0, stdout: `${"d".repeat(40)}\n`, stderr: "" };
    if (a.includes("diff-tree")) return { code: 0, stdout: `:100644 100644 a b M\0${SRC}\0:000000 100644 a b A\0crates/psd/tests/${testNameOf(n)}.rs\0`, stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const deps: FixDeps = {
    exec, root: SCRATCH, log: () => {}, cancelled: () => false,
    fetchCrates: async () => ({ ok: true, rust: true, crates: [{ name: "psd", dir: "crates/psd" }] }) as never,
    checkout: async () => "/checkout",
    who: async () => ({ login: "pipeline-bot", email: "bot@example.com" }),
    ask: async (id, input, o) => {
      const r = o.session?.resume;
      asks.push({ id, ...(r && { resume: r.message }), previous: (input as { previous?: unknown }).previous });
      if (id === "security.fixcheck") { reviews.push("review"); return { text: '{"verdict":"approve","reasons":"ok","problems":[]}', cost: 1 }; }
      const dir = mkdtempSync(join(SCRATCH, "sess-"));
      return { text: replies(asks.filter((x) => x.id === "security.fix").length), cost: 1, resumed: r !== undefined, kept: { id: `s${asks.length}`, dir, account: "a", checkout: "/checkout" } };
    },
  };
  return { calls, asks, deps, reviews };
}

const rounds = (n: number) => db.prepare("SELECT * FROM security_fix_rounds WHERE repo = 'photocraft' AND number = ? ORDER BY round").all(n) as { round: number; state: string; head_task: number; base_task: number; session: string | null }[];
const result = (code: number) => JSON.stringify([{ step: "test", exitCode: code, durationMs: 1, timedOut: false }]);
const plan = JSON.stringify([{ name: "test", cmd: ["cargo", "test"], network: "none", timeoutSec: 10 }]);
/** Ends a round's tasks as the worker would: the head task with `head` as the exit code of its step, the base task with `base`. */
function end(n: number, head: number, base: number): void {
  const r = rounds(n).at(-1)!;
  db.prepare("UPDATE build_tasks SET state = ?, plan = ?, results = ? WHERE id = ?").run(head === 0 ? "done" : "failed", plan, result(head), r.head_task);
  db.prepare("UPDATE build_tasks SET state = 'failed', plan = ?, results = ? WHERE id = ?").run(plan, result(base), r.base_task);
  db.prepare("INSERT INTO build_task_logs (task_id, seq, step, chunk) VALUES (?, 1, 'test', 'assertion failed: left == right')").run(r.head_task);
}
const tasks = (): number => (db.prepare("SELECT COUNT(*) AS n FROM build_tasks").get() as { n: number }).n;
const fixJobs = (n: number): number => (db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE step = 'security-fix' AND json_extract(params, '$.number') = ?").get(n) as { c: number }).c;

describe("security fix rounds", () => {
  test("a failed build ends the job; the next job resumes the session with the failure and no job waits on a build", async () => {
    const n = finding();
    const w = world(n, () => reply(n));
    assert.match(await runFix(db, "photocraft", n, w.deps), /round 1 queued for build/);
    assert.equal(w.asks.length, 1, "the job ends once the round's tasks are queued");
    assert.equal(rawFinding(db, "photocraft", n)!.state, "fixing");
    assert.deepEqual(rounds(n).map((r) => r.state), ["building"]);
    const first = rounds(n)[0]!;
    const dir = (JSON.parse(first.session!) as Record<string, { dir: string }>)[""]!.dir;
    assert.ok(existsSync(dir), "the session store stays with the building round");
    // While the tasks run there is nothing to do, no job is queued, and the finding is not reset.
    assert.equal(await advanceSecurityFixes(db), 0);
    db.prepare("UPDATE security_findings SET updated_at = '2026-11-01T00:00:00Z' WHERE number = ?").run(n);
    reconcileFindings(db, "photocraft");
    assert.equal(rawFinding(db, "photocraft", n)!.state, "fixing");
    assert.equal(sweepSessions(db, new Date()), 0, "a building round's session is not swept inside the window");

    end(n, 101, 101);
    assert.equal(await advanceSecurityFixes(db), 1);
    assert.equal(await advanceSecurityFixes(db), 0, "no second job while one is queued");
    assert.equal(fixJobs(n), 1);
    assert.match(await runFix(db, "photocraft", n, w.deps), /round 2 queued for build/);
    const second = w.asks[1]!;
    assert.match(second.resume ?? "", /assertion failed/);
    assert.equal((db.prepare("SELECT resumed FROM security_calls WHERE kind = 'fix' AND finding_number = ? ORDER BY id").all(n) as { resumed: number }[]).map((r) => r.resumed).join(), "0,1");
    assert.deepEqual(rounds(n).map((r) => r.state), ["failed", "building"]);
  });

  test("a passed build gets the review and a commit that exists only on the local ref", async () => {
    const n = finding();
    const w = world(n, () => reply(n));
    await runFix(db, "photocraft", n, w.deps);
    end(n, 0, 101);
    assert.match(await runFix(db, "photocraft", n, w.deps), /fix ready \(2 files, round 1\)/);
    assert.equal(w.reviews.length, 1);
    const row = rawFinding(db, "photocraft", n)!;
    assert.equal(row.state, "ready");
    assert.equal(row.fix_commit, "d".repeat(40));
    assert.equal(row.fix_ref, `refs/autocraft/security/photocraft-${n}`);
    assert.ok(w.calls.some((c) => c.includes("update-ref") && c.includes(row.fix_ref!)));
    assert.ok(!w.calls.some((c) => /(^| )(push|send-pack)( |$)/.test(c)), "nothing is pushed");
    assert.deepEqual(rounds(n), [], "the rounds are forgotten when the fix ends");
    assert.deepEqual((db.prepare("SELECT round, state FROM security_fix_log WHERE repo = 'photocraft' AND number = ?").all(n) as { round: number; state: string }[]).map((r) => `${r.round}:${r.state}`), ["1:passed"], "the log keeps the round");
  });

  test("a failed word check never queues a build", async () => {
    const n = finding();
    const before = tasks();
    const w = world(n, () => reply(n, "// block the attacker"));
    await runFix(db, "photocraft", n, w.deps);
    assert.equal(w.asks.length, 3, "every round fails before its build");
    assert.equal(tasks(), before);
    assert.deepEqual(rounds(n), []);
    const row = rawFinding(db, "photocraft", n)!;
    assert.equal(row.state, "new");
    assert.match(row.note ?? "", /attacker/);
    assert.match(row.last_failure ?? "", /attacker/);
  });

  test("rounds left by a dead fix job are logged under their own attempt when the finding is reconciled", async () => {
    const n = finding();
    db.prepare("UPDATE security_findings SET fix_attempts = 1 WHERE number = ?").run(n);
    await runFix(db, "photocraft", n, world(n, () => reply(n)).deps);
    db.prepare("UPDATE security_fix_rounds SET state = 'failed', failure = 'boom' WHERE number = ?").run(n);
    db.prepare("UPDATE security_findings SET updated_at = '2026-11-01T00:00:00Z' WHERE number = ?").run(n);
    reconcileFindings(db, "photocraft");
    const row = rawFinding(db, "photocraft", n)!;
    assert.equal(row.state, "new");
    assert.match(row.last_failure ?? "", /ended before/);
    assert.deepEqual(rounds(n), []);
    assert.deepEqual((db.prepare("SELECT attempt, round, state FROM security_fix_log WHERE number = ?").all(n) as { attempt: number; round: number; state: string }[]).map((r) => `${r.attempt}:${r.round}:${r.state}`), ["1:1:failed"]);
  });

  test("a round building past 4 hours is cancelled and read; a pipeline fix waits for the switch, an operator's does not", async () => {
    const n = finding(), m = finding();
    for (const [k, by] of [[n, "boss"], [m, "pipeline"]] as const) {
      db.prepare("UPDATE security_findings SET decided_by = ? WHERE number = ?").run(by, k);
      await runFix(db, "photocraft", k, world(k, () => reply(k)).deps);
      db.prepare("UPDATE security_fix_rounds SET created_at = '2020-01-01T00:00:00Z' WHERE number = ?").run(k);
    }
    assert.equal(await advanceSecurityFixes(db, false), 1, "only the operator's fix continues with the pipeline off");
    const job = db.prepare("SELECT requested_by FROM jobs WHERE step = 'security-fix' AND json_extract(params, '$.number') = ?").get(n) as { requested_by: string };
    assert.equal(job.requested_by, "boss");
    const r = rounds(n)[0]!;
    assert.equal((db.prepare("SELECT state FROM build_tasks WHERE id = ?").get(r.head_task) as { state: string }).state, "cancelled");
    assert.equal(fixJobs(m), 0);
    assert.equal(await advanceSecurityFixes(db, true), 1);
  });
});
