// Records that attach to an item: the items a job handled, and the job that queued a build task.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { setCallContext } from "../src/agents/call.ts";
import { createTask } from "../src/build/tasks.ts";
import { connect } from "../src/db.ts";
import { itemJobs, jobItem } from "../src/runner/job-items.ts";
import { JOB_KEEP_MS, pruneJobs } from "../src/runner/jobs.ts";
import { askMergeDecisions } from "../src/merge/index.ts";
import { SCRATCH } from "./scratch.ts";
import { world } from "./world-db.ts";

mkdirSync(SCRATCH, { recursive: true });
const db = connect(join(mkdtempSync(join(SCRATCH, "job-items-")), "t.db"));
after(() => setCallContext(null));

test("a job records the items it handled, tags their log lines, and stamps the build tasks it queues", () => {
  const job = Number(db.prepare("INSERT INTO jobs (step, params, requested_by, requested_at, state, ended_at) VALUES ('fixup', '{}', 'cli', 't', 'done', '2020-01-01T00:00:00Z')").run().lastInsertRowid);
  const lines: string[] = [];
  jobItem(db, "o/app", 7, "outside a job", (l) => lines.push(l));
  assert.deepEqual(itemJobs(db, "o/app", 7), [], "nothing is stored outside a job");

  setCallContext({ jobId: job, step: "fixup", stage: 6, cancelled: () => false });
  jobItem(db, "o/app", 7, "pushed\nabc", (l) => lines.push(l));
  jobItem(db, "o/app", 8, "held", (l) => lines.push(l));
  assert.deepEqual(lines, ["[o/app#7] outside a job", "[o/app#7] pushed abc", "[o/app#8] held"]);
  assert.deepEqual(itemJobs(db, "o/app", 7).map((r) => [r.jobId, r.outcome]), [[job, "pushed abc"]]);

  const sha = "a".repeat(40);
  const id = createTask(db, { step: "verify", repo: "app", number: 7, headSha: sha, plan: [{ name: "t", cmd: ["true"], network: "none", timeoutSec: 10 }] });
  assert.equal((db.prepare("SELECT job_id FROM build_tasks WHERE id = ?").get(id) as { job_id: number }).job_id, job);

  pruneJobs(db, Date.parse("2020-01-02T00:00:00Z") + JOB_KEEP_MS);
  assert.deepEqual(itemJobs(db, "o/app", 7), [], "a pruned job takes its item rows");
});

test("merge-ask records the PR it asked about together with the decision id", () => {
  const w = world().repo().pr(1).review(1, { sure: false }).verified(1).premerge(1, "clean");
  try {
    const job = Number(w.db.prepare("INSERT INTO jobs (step, params, requested_by, requested_at, state) VALUES ('merge-ask', '{}', 'cli', 't', 'running')").run().lastInsertRowid);
    setCallContext({ jobId: job, step: "merge-ask", stage: 10, cancelled: () => false });
    const ids = askMergeDecisions(w.db, { log: () => {} });
    assert.equal(ids.length, 1);
    const rows = w.db.prepare("SELECT repo, number, outcome, ref FROM job_items WHERE job_id = ?").all(job);
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ repo: "app", number: 1, outcome: "asked Merge?", ref: ids[0] }]);
  } finally {
    setCallContext(null);
    w.close();
  }
});
