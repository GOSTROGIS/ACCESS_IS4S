// The Carry step: stores the carried review (carry.ts) for each PR whose Plan holds a `carry` action. Calls no model.
import type { DatabaseSync } from "node:sqlite";
import { planned } from "../core/select.ts";
import { staleReviews } from "./discussion.ts";
import { carriedReview, CARRIED } from "./carry.ts";
import { saveOpus } from "./opus.ts";
import { jobItem } from "../runner/job-items.ts";

export function runCarry(db: DatabaseSync, repo: string, log: (line: string) => void = console.log): number {
  const stale = staleReviews(db, repo);
  const runId = `carry-${repo}-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}`;
  let n = 0;
  for (const { facts: f, action } of planned(db, "carry", { repo })) {
    const c = { repo, number: f.number, head_oid: action.head! };
    const k = carriedReview(db, c, stale);
    if (!k) continue;
    saveOpus(db, runId, c, { mode: CARRIED, base: k.from, baseRef: k.baseRef, model: CARRIED, review: k.review, servingMetadata: k.servingMetadata, snap: { seen: k.seen, hash: k.hash } });
    jobItem(db, repo, f.number, `carried review: ${k.review.reason}`, log);
    n++;
  }
  return n;
}
