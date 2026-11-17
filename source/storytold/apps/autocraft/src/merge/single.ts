// Merging a few clean ready PRs one at a time instead of through an integration batch. Only the way a PR that
// may merge already does changes here: the merge rule, per-repo approval, Verify and the final review still decide whether.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { cachedDiff, ghDiff, type DiffFetcher } from "../review/diff.ts";
import { mergeApprovalOf } from "./approval.ts";
import { activeBatches } from "./batch-store.ts";
import type { By } from "../core/gates.ts";
import { runMerge, type MergeDeps, type MergeSummary } from "./index.ts";
import { planned } from "../core/select.ts";

export const SINGLE_MERGE_KEY = "single_merge_max";
export const SINGLE_MERGE_DEFAULT = 3;
export const SINGLE_MERGE_LIMIT = 100;

/** Most ready PRs of a repo that merge one at a time; above it, or at 0, they go through a batch. */
export function singleMergeMax(db: DatabaseSync): number {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(SINGLE_MERGE_KEY) as { value: string } | undefined;
  const n = row === undefined ? NaN : Number(row.value);
  return Number.isInteger(n) && n >= 0 && n <= SINGLE_MERGE_LIMIT ? n : SINGLE_MERGE_DEFAULT;
}

export function setSingleMergeMax(db: DatabaseSync, n: unknown, by: string): number {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > SINGLE_MERGE_LIMIT) throw new Error(`the single-merge limit must be a whole number from 0 to ${SINGLE_MERGE_LIMIT}`);
  const was = singleMergeMax(db);
  db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(SINGLE_MERGE_KEY, String(n));
  if (n !== was) audit(db, by, "single-merge-max", "merge", { max: n, was });
  return n;
}

/** Every path a unified diff touches (both sides of a rename), or null when it has no files or a header cannot be read. */
export function pathsOfDiff(text: string): string[] | null {
  const out = new Set<string>();
  const headers = text.match(/^diff --git /gm)?.length ?? 0;
  let parsed = 0;
  for (const m of text.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) { out.add(m[1]!); out.add(m[2]!); parsed++; }
  // Quoted (escaped) names are not parsed: the caller must not take such a diff as disjoint.
  return headers === 0 || parsed !== headers ? null : [...out];
}

/**
 * The PRs of the repo to merge one at a time, or null when the batch path applies: none ready, more than the
 * limit, a diff that cannot be read, or two PRs changing one file. A workspace manifest or lockfile is a file
 * like any other here, so two PRs that both change one overlap. The diffs are the ones the reviews cached.
 */
export async function planSingles(db: DatabaseSync, repo: string, fetchDiff: DiffFetcher = ghDiff): Promise<Set<number> | null> {
  const max = singleMergeMax(db);
  // A PR aimed at a non-default branch merges singly on its own path and takes no part in this count or the file overlap.
  const ready = planned(db, "merge", { repo }).filter((p) => !p.facts.baseOffDefault);
  if (max === 0 || !ready.length || ready.length > max) return null;
  const seen = new Set<string>();
  for (const { facts, action } of ready) {
    const d = await cachedDiff(repo, facts.number, action.head!, fetchDiff);
    if (!d.ok) return null;
    const paths = pathsOfDiff(d.text);
    if (!paths) return null;
    for (const p of paths) {
      if (seen.has(p)) return null;
      seen.add(p);
    }
  }
  return new Set(ready.map((p) => p.facts.number));
}

/**
 * Merges the planned PRs in order when the single path applies, and returns null when the batches should run.
 * Each merge is preceded by a fresh read of the PR; the first PR that is no longer mergeable at the same head
 * with green checks ends the round.
 */
export async function runSingles(
  db: DatabaseSync, params: { repo: string; limit?: number; onMerged?: (n: number) => void; by?: By },
  log: (line: string) => void = console.log, deps?: MergeDeps, fetchDiff?: DiffFetcher,
): Promise<MergeSummary | null> {
  if (!mergeApprovalOf(db, params.repo)) throw new Error(`merging in ${params.repo} is not approved`);
  if (activeBatches(db, params.repo).length) return null;
  const plan = await planSingles(db, params.repo, fetchDiff);
  if (!plan) return null;
  log(`merge ${params.repo}: ${plan.size} PRs ready, none sharing a file; merging them one at a time`);
  return runMerge(db, { repo: params.repo, limit: params.limit, dryRun: false, only: (e) => plan.has(e.number), stopOnRefusal: true, onMerged: params.onMerged, by: params.by }, log, deps);
}

export const commands = {
  "merge-single": {
    summary: "merge-single [N]: show or set how many ready PRs of a repo merge one at a time instead of in a batch (0 = always batch)",
    async run(args: string[]): Promise<void> {
      const { connect } = await import("../db.ts");
      const db = connect();
      if (args.length > 1) throw new Error("usage: merge-single [N]");
      if (args[0] !== undefined) {
        if (!/^\d{1,3}$/.test(args[0])) throw new Error("N must be a whole number from 0 to 100");
        setSingleMergeMax(db, Number(args[0]), "cli");
      }
      console.log(`single-merge limit: ${singleMergeMax(db)}`);
    },
  },
};
