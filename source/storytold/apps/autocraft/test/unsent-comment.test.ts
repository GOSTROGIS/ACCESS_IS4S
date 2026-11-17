// An ask comment that never reached GitHub (the GitHub App's installation token could not be minted, so no request went
// out) is asked again after a backoff, and not before; a comment whose request went out stays final.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { mock, test } from "node:test";
import { connect } from "../src/db.ts";
import { setCommentApproval } from "../src/act/approval.ts";
import { CLI_BY } from "../src/core/gates.ts";
import { loadPrFacts } from "../src/core/facts.ts";
import { decidePr } from "../src/core/decide.ts";
import { askConflict, type ConflictRun } from "../src/fixup/conflict.ts";
import type { ConflictCandidate } from "../src/fixup/conflict-state.ts";
import type { FixupDeps, FixupSummary } from "../src/fixup/index.ts";
import { setGithubIdentity } from "../src/github/identity.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "unsent-comment-"));
const T0 = Date.parse("2026-11-10T12:00:00Z");
const HEAD = "a".repeat(40);
const MIN = 60_000;

test("a conflict ask whose token mint failed is asked again after the backoff, not before; one whose request went out is final", async () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    const db = connect(join(dir, "t.db"));
    const iso = (ms: number) => new Date(ms).toISOString();
    db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(iso(T0 - 60 * MIN));
    setCommentApproval(db, "op", "app", true);
    setGithubIdentity(db, "op", "app");
    // A contributor's PR from a fork we can't push to, taken by the review, that conflicts with main.
    db.prepare(`INSERT INTO items (repo, number, kind, state, title, author, additions, deletions, head_oid, head_ref, head_repo, base_ref, maintainer_can_modify, mergeable, created_at, updated_at)
      VALUES ('app', 1, 'pr', 'OPEN', 'Fix a thing', 'someone', 5, 0, ?, 'fix', 'contrib/app', 'main', 0, 'CONFLICTING', ?, ?)`).run(HEAD, iso(T0 - 60 * MIN), iso(T0 - 60 * MIN));
    db.prepare("INSERT INTO opus_reviews (repo, number, head_oid, run_id, at, model, verdict, reason, fixes, sure, mode) VALUES ('app', 1, ?, 'rv', ?, 'm', 'take', 'right', '[]', 1, 'full')").run(HEAD, iso(T0 - 30 * MIN));

    db.prepare("INSERT INTO verifications (repo, number, head_sha, kind, reason, state, created_at) VALUES ('app', 1, ?, 'ci-enough', 'upstream CI', 'ci-enough', ?)").run(HEAD, iso(T0 - 20 * MIN));
    const plan = () => decidePr(loadPrFacts(db, { now: Date.now() }).find((f) => f.number === 1)!);
    const plannedAsk = () => plan().actions.some((a) => a.kind === "conflict" && a.params?.bucket === "ask");
    const rows = () => (db.prepare("SELECT state FROM conflict_merges WHERE repo = 'app' AND number = 1 ORDER BY rowid").all() as { state: string }[]).map((r) => r.state);

    let mintFails = true;
    let sent = 0;
    const exec = async () => { sent++; return { code: 1, stdout: "", stderr: "HTTP 502: Bad Gateway" }; };
    const querier = { spent: 0, remaining: 5000, async query() {
      return { repository: { pullRequest: { id: "PR1", number: 1, state: "OPEN", isDraft: false, headRefOid: HEAD, headRefName: "fix", baseRefName: "main", maintainerCanModify: false, mergeable: "CONFLICTING", headRepository: { nameWithOwner: "contrib/app" }, assignees: { nodes: [] } } } };
    } };
    const log: string[] = [];
    const x = {
      repo: "app", runId: "run", log: (l: string) => log.push(l), d: { querier, exec } as unknown as FixupDeps,
      gw: { db, login: "pipeline", mint: async () => { if (mintFails) throw new Error("POST /app/installations/1/access_tokens HTTP 500"); return "ghs_token"; } },
      at: () => new Date().toISOString(), summary: { asked: [], failed: [], held: [] } as unknown as FixupSummary,
      prQuery: "query", scrub: (s: string) => s, handled: { n: 0 }, by: CLI_BY,
    } as unknown as ConflictRun;
    const c = { repo: "app", number: 1, head: HEAD, base: "main", title: "Fix a thing", reason: "right", attempt: 1, pushable: false } as ConflictCandidate;

    assert.equal(plannedAsk(), true);
    await askConflict(db, x, c);
    assert.deepEqual(rows(), ["comment-unsent"]);
    assert.equal(sent, 0, "no request went out");

    // Before the backoff ends the plan has no ask, and the step's guard refuses one.
    mock.timers.setTime(T0 + 9 * MIN);
    assert.equal(plannedAsk(), false);
    assert.deepEqual([plan().wait, plan().waitKind], ["the comment asking the contributor to resolve the conflict again after 12:10: the last one did not reach GitHub", "system"]);
    await askConflict(db, x, c);
    assert.deepEqual(rows(), ["comment-unsent"]);

    // After it the ask is due again. This time the request goes out and fails: GitHub may have posted it, so it is final.
    mock.timers.setTime(T0 + 11 * MIN);
    assert.equal(plannedAsk(), true);
    mintFails = false;
    await askConflict(db, x, c);
    assert.equal(sent, 1);
    assert.deepEqual(rows(), ["comment-unsent", "comment-failed"]);
    mock.timers.setTime(T0 + 24 * 60 * MIN);
    assert.equal(plannedAsk(), false);
  } finally {
    mock.timers.reset();
  }
});
