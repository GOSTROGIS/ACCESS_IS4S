// A cifix job reads the failures of its PRs at once (model calls overlap while the queue has room) and skips a PR another job works.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { setCallContext } from "../src/agents/call.ts";
import { connect } from "../src/db.ts";
import { runCifix, type CifixDeps } from "../src/cifix/index.ts";
import { setPushApproval } from "../src/fixup/approval.ts";
import { exec, type Exec } from "../src/fixup/git.ts";
import type { Querier } from "../src/mirror.ts";
import { take } from "../src/runner/leases.ts";
import { validating } from "./gql.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "cifix-pool-"));
process.env.AUTOCRAFT_DIFF_CACHE = join(dir, "diffs");
process.env.AUTOCRAFT_ARTIFACT_DIR = join(dir, "artifacts");
writeFileSync(join(dir, "accounts.json"), JSON.stringify([{ id: "a1", configDir: join(dir, "a1") }]));
process.env.AUTOCRAFT_ACCOUNTS = join(dir, "accounts.json");
after(() => setCallContext(null));

const T0 = "2026-01-01T00:00:00Z", T1 = "2026-01-02T00:00:00Z";
const CODE_LOG = "test\tcargo test\t2026-01-01T00:00:00Z error[E0425]: cannot find value `b` in this scope\ntest\tcargo test\t2026-01-01T00:00:01Z  --> src/lib.rs:2:20\n";
const git = (cwd: string, ...args: string[]): string => {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};

/** Two PRs (#7, #8) with a failing gate check, one model slot pool of 8, and a fake model that waits until `calls` calls are in flight. */
function setup(calls = 2) {
  const root = mkdtempSync(join(dir, "w-"));
  const work = join(root, "work");
  mkdirSync(join(work, "src"), { recursive: true });
  git(work, "init", "-q", "-b", "fix");
  const heads: Record<number, string> = {};
  for (const n of [7, 8]) {
    writeFileSync(join(work, "src/lib.rs"), `fn a() {}\nfn main() { b(); }\n// ${n}\n`);
    git(work, "add", "-A");
    git(work, "commit", "-q", "-m", `pr ${n}`);
    heads[n] = git(work, "rev-parse", "HEAD");
  }
  const fork = join(root, "fork.git");
  git(root, "clone", "-q", "--bare", work, fork);
  for (const n of [7, 8]) git(fork, "update-ref", `refs/pull/${n}/head`, heads[n]!);
  const db = connect(join(root, "t.db"));
  for (const n of [7, 8]) {
    db.prepare(`INSERT INTO items (repo, number, kind, state, title, author, additions, deletions, head_oid, created_at, updated_at) VALUES ('app', ?, 'pr', 'OPEN', 'Rename', 'someone', 5, 0, ?, '${T0}', '${T0}')`).run(n, heads[n]);
    db.prepare(`INSERT INTO opus_reviews (repo, number, head_oid, run_id, at, model, verdict, reason, fixes, sure, mode) VALUES ('app', ?, ?, 'rv', '${T0}', 'm', 'take', 'ok', '[]', 1, 'full')`).run(n, heads[n]);
    db.prepare(`INSERT INTO pr_checks (repo, number, head_oid, state, is_draft, overall, checks, mergeable, maintainer_can_modify, fetched_at) VALUES ('app', ?, ?, 'OPEN', 0, 'failure', '[{"name":"gate / test","state":"failure"}]', 'MERGEABLE', 1, '${T1}')`).run(n, heads[n]);
  }
  db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(T0);
  setPushApproval(db, "op", "app", true);
  db.prepare("INSERT OR IGNORE INTO claude_accounts (id, label) VALUES ('a1', 'a1')").run();
  db.prepare("UPDATE claude_accounts SET enabled = 1, max_concurrent = 8 WHERE id = 'a1'").run();
  const querier: Querier = validating({
    spent: 0, remaining: 5000,
    async query(_q: string, v: { n: number }) {
      return { repository: { pullRequest: {
        id: `PR${v.n}`, number: v.n, commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [{ __typename: "CheckRun", name: "gate / test", status: "COMPLETED", conclusion: "FAILURE" }] } } } }] }, state: "OPEN", isDraft: false, headRefOid: heads[v.n], headRefName: "fix", maintainerCanModify: true, mergeable: "MERGEABLE",
        headRepository: { nameWithOwner: "contrib/app" }, assignees: { nodes: [] }, reviewDecision: null,
      } } };
    },
  });
  const run: Exec = async (cmd, args, o = {}) => {
    if (cmd === "gh") return { code: 0, stdout: JSON.stringify({ login: "pipeline-bot", id: 42, node_id: "U42" }), stderr: "" };
    const net = args.some((a) => a.startsWith("https://github.com/"));
    const sub = args.map((a) => (a.startsWith("https://github.com/") ? fork : a)).filter((a, i, all) => !(a === "-c" && all[i + 1] === "protocol.file.allow=never") && a !== "protocol.file.allow=never");
    return exec("git", net ? sub : args, { ...o });
  };
  const asked: string[] = [];
  let overlap = false;
  let release!: () => void;
  const both = new Promise<void>((r) => (release = r));
  const deps: CifixDeps = {
    querier, exec: run, now: () => new Date("2026-01-03T00:00:00Z"), root: join(root, "cache"),
    fetchDiff: async () => ({ ok: true, text: "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1 +1 @@\n-x\n+fn a() {}\n" }),
    gh: async (args) => {
      if (args[0] === "api" && args[1]!.includes("/pulls/")) return `${"b".repeat(40)}\n`;
      if (args[0] === "api") return JSON.stringify({ check_runs: [{ name: "gate / test", status: "completed", conclusion: "failure", completed_at: "2026-01-03T12:00:00Z", details_url: "https://github.com/storytold/app/actions/runs/11/job/5" }] });
      return CODE_LOG;
    },
    ask: async (_db, input) => {
      asked.push(input[0]!.ref);
      if (asked.length === calls) { overlap = true; release(); }
      // Waits for the other PR's call with no clock; if the calls never overlap this deadlocks and the test timeout reports it.
      await both;
      return null;
    },
    check: async () => null,
  };
  return { db, deps, asked, overlap: () => overlap };
}

test("two PRs of one cifix job make their model calls at once", { timeout: 120_000 }, async () => {
  const w = setup();
  await runCifix(w.db, { repo: "app", dryRun: false }, () => {}, w.deps);
  assert.deepEqual([...w.asked].sort(), ["app#7", "app#8"]);
  assert.equal(w.overlap(), true, "the second call started while the first was still waiting");
});

test("a PR whose lease another running job holds is skipped", { timeout: 120_000 }, async () => {
  const w = setup(1);
  const add = (step: string): number => Number(w.db.prepare("INSERT INTO jobs (step, params, requested_by, requested_at, state, started_at) VALUES (?, '{}', 'pipeline', ?, 'running', ?)").run(step, T0, T0).lastInsertRowid);
  const mine = add("cifix"), other = add("fixup");
  assert.ok(take(w.db, "pr:app#8", other, "fixup"));
  setCallContext({ jobId: mine, step: "cifix", stage: 1, cancelled: () => false });
  const lines: string[] = [];
  await runCifix(w.db, { repo: "app", dryRun: false }, (l) => lines.push(l), w.deps);
  assert.deepEqual(w.asked, ["app#7"]);
  assert.ok(lines.some((l) => l.includes("pr:app#8: skipped")));
});
