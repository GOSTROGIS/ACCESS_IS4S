// GET /api/flow: the pipeline as a flowchart for the home page. Adds up the
// per-repo summary rows (src/flow/summary.ts), which the runner keeps current,
// and shapes them into nodes and edges (src/flow/shape.ts). Read-only, anyone signed in.
import type { DatabaseSync } from "node:sqlite";
import type { Flow } from "../../../web/src/api/types.ts";
import { latestRun } from "../../classify/settled.ts";
import { branchMembers, type Refs } from "../../flow/count.ts";
import { buildFlow } from "../../flow/shape.ts";
import { readSummary } from "../../flow/summary.ts";
import type { Req } from "../types.ts";
import { needVisible, visibleRepos } from "./visible.ts";

export async function flow(db: DatabaseSync, req: Req): Promise<Flow> {
  const repo = req.query.get("repo") || null;
  if (repo) await needVisible(db, req, repo);
  const { counts, countedAt, uncounted } = readSummary(db, repo, undefined, await visibleRepos(db, req));
  const lastSync = (db.prepare("SELECT MAX(ended_at) AS t FROM sync_runs WHERE error IS NULL").get() as { t: string | null }).t
    ?? (db.prepare("SELECT value AS t FROM settings WHERE key = 'org_high_water'").get() as { t: string } | undefined)?.t ?? null;
  return buildFlow(counts, { repo, now: new Date().toISOString(), lastSync, run: latestRun(db), countedAt, uncounted: uncounted.length });
}

// The Items browser asks for the same branch page after page; its refs are kept briefly.
const picks = new WeakMap<DatabaseSync, { key: string; at: number; refs: Refs | null }>();
const PICK_MAX_AGE = 30_000;

/** The refs a `flow=<node>.<branch>` filter of the Items browser picks, or null for a key that names no item-backed branch. */
export function flowMembers(db: DatabaseSync, key: string): Refs | null {
  const hit = picks.get(db);
  if (hit && hit.key === key && Date.now() - hit.at < PICK_MAX_AGE) return hit.refs;
  const refs = branchMembers(db, key);
  picks.set(db, { key, at: Date.now(), refs });
  return refs;
}
