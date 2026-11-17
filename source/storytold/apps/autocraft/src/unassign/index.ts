// The unassign step: carries out the `unassign` actions of the Plans (src/core/assignment.ts holds the rule). Each item's assignees
// are read from GitHub just before the write, so an assignment made by a person meanwhile is never touched.
import type { DatabaseSync } from "node:sqlite";
import { guardRepo } from "../core/guard.ts";
import { planned } from "../core/select.ts";
import { plannedItems } from "../core/select-items.ts";
import type { PlanSet } from "../core/plan-set.ts";
import type { By } from "../core/gates.ts";
import { issueInfo, pullRequestInfo, releaseItem } from "../github/claim.ts";
import type { Writer } from "../github/write.ts";
import { pipelineMe, setPipelineLogin } from "../github/pipeline-account.ts";
import { Client, type Querier } from "../mirror.ts";
import type { Exec } from "../fixup/git.ts";
import { jobItem } from "../runner/job-items.ts";
import { leaseItem } from "../runner/leases.ts";
import { ownerOf } from "../owners.ts";

export const ACTOR = "unassign";
const oneLine = (s: string, max = 200) => s.replace(/\s+/g, " ").trim().slice(0, max);

export type UnassignResult = { unassigned: string[]; failed: string[]; due: number };

export type UnassignParams = { repo: string; by: By; runId: string; log?: (line: string) => void; querier?: Querier; exec?: Exec; plans?: PlanSet };

/** Unassigns the pipeline's account from the items of one repo that the Plans say are off the path to merge. One item failing does not stop the others. */
export async function runUnassign(db: DatabaseSync, p: UnassignParams): Promise<UnassignResult> {
  const log = p.log ?? (() => {});
  const q = p.querier ?? new Client(500);
  const out: UnassignResult = { unassigned: [], failed: [], due: 0 };
  const opts = { repo: p.repo, ...(p.plans ? { plans: p.plans } : {}) };
  const due = [
    ...planned(db, "unassign", opts).map((x) => ({ pr: true, number: x.facts.number })),
    ...plannedItems(db, "unassign", opts).filter((x) => x.facts.kind === "issue").map((x) => ({ pr: false, number: x.facts.number })),
  ];
  out.due = due.length;
  if (!due.length) return out;
  const g = guardRepo(db, p.repo, null, p.by);
  if ("refused" in g) { log(`${p.repo}: ${g.refused}`); return out; }
  const w: Writer = { db, login: ACTOR };
  const me = await pipelineMe(log, p.exec);
  if (!me) return out;
  setPipelineLogin(db, me.login);
  for (const d of due) {
    const ref = `${p.repo}#${d.number}`;
    // A running job works the item (it may have just claimed it): leave the claim alone.
    const release = leaseItem(db, `${d.pr ? "pr" : "issue"}:${ref}`, log);
    if (!release) continue;
    try {
      const info = await (d.pr ? pullRequestInfo(q, ownerOf(p.repo), p.repo, d.number) : issueInfo(q, ownerOf(p.repo), p.repo, d.number));
      if (info && await releaseItem(w, g, q, p.repo, d.number, info, me, { run: p.runId })) { out.unassigned.push(ref); jobItem(db, p.repo, d.number, `unassigned from ${me.login}`, log); }
    } catch (e) {
      out.failed.push(ref);
      jobItem(db, p.repo, d.number, `could not unassign: ${oneLine(String((e as Error).message ?? e))}`, log);
    } finally {
      release();
    }
  }
  return out;
}
