// Pre-merge review results (table premerge_reviews): one row per PR head, read by the merge queue.
import type { DatabaseSync } from "node:sqlite";
import { PREMERGE_MAX_TRIES } from "../core/rules.ts";

/** A failed head counts as failed after this many tries. */
export { PREMERGE_MAX_TRIES };

export type { PremergeFinding } from "./types.ts";
import type { PremergeFinding } from "./types.ts";
import type { Claim, StatementConflict } from "../review/opus-parse.ts";

export type PremergeRow = {
  repo: string; number: number; head_oid: string;
  /** When the row was last written (a review or a failed try). */
  at: string;
  run_id: string | null; model: string | null; serving_metadata: string | null;
  /** JSON PremergeFinding[]; null while no try has produced a review. */
  findings: string | null;
  /** What the reviewer searched, as free text. */
  searched: string | null;
  /** JSON StatementConflict[]; null when none. */
  conflicts: string | null;
  /** 1 when the review left a claim unverified. */
  unsure: number | null;
  /** JSON Claim[]; null when the review listed none. */
  claims: string | null;
  /** Why the last try stored no review; null once a review is stored. */
  error: string | null;
  tries: number;
  /** The base branch the review read the diff against; null on rows stored earlier. */
  base_ref: string | null;
};

export type PremergeSave = {
  repo: string; number: number; head: string; at: string;
  runId?: string | null; model?: string | null;
  /** Opaque stored attribution; compatibility copies must preserve future versions. */
  servingMetadata?: string | null;
  /** A stored review. Without it, `error` records a failed try. */
  findings?: PremergeFinding[];
  searched?: string | null;
  /** The statements the review named as conflicts (a stored review only). */
  conflicts?: StatementConflict[];
  unsure?: boolean;
  claims?: Claim[];
  error?: string | null;
  /** The failure is final: no more tries (the head cannot be reviewed at all). */
  final?: boolean;
  /** The base branch the diff was read against (a stored review only). */
  baseRef?: string | null;
};

/** Stores a review (clears the error) or counts a failed try. */
export function savePremerge(db: DatabaseSync, s: PremergeSave): void {
  const args = [s.repo, s.number, s.head, s.at, s.runId ?? null, s.model ?? null] as const;
  if (s.findings) {
    db.prepare(`INSERT INTO premerge_reviews (repo, number, head_oid, at, run_id, model, findings, searched, conflicts, unsure, claims, base_ref, serving_metadata, error, tries) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
      ON CONFLICT (repo, number, head_oid) DO UPDATE SET at = excluded.at, run_id = excluded.run_id, model = excluded.model,
        findings = excluded.findings, searched = excluded.searched, conflicts = excluded.conflicts, unsure = excluded.unsure, claims = excluded.claims, base_ref = excluded.base_ref, serving_metadata = excluded.serving_metadata, error = NULL`).run(...args, JSON.stringify(s.findings), s.searched ?? null, s.conflicts?.length ? JSON.stringify(s.conflicts) : null, s.unsure ? 1 : 0, s.claims?.length ? JSON.stringify(s.claims) : null, s.baseRef ?? null, s.servingMetadata ?? null);
    return;
  }
  db.prepare(`INSERT INTO premerge_reviews (repo, number, head_oid, at, run_id, model, error, tries, serving_metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (repo, number, head_oid) DO UPDATE SET at = excluded.at, run_id = excluded.run_id, model = excluded.model,
      error = excluded.error, tries = CASE WHEN ? THEN excluded.tries ELSE tries + 1 END`).run(...args, s.error ?? "failed", s.final ? PREMERGE_MAX_TRIES : 1, s.servingMetadata ?? null, s.final ? 1 : 0);
}

/** The pre-merge review of a head, when it read the diff against the base branch the head's Opus review read (a row or review that recorded none counts as matching). */
export function premergeAt(db: DatabaseSync, repo: string, number: number, head: string): PremergeRow | null {
  return (db.prepare(`SELECT p.* FROM premerge_reviews p
    LEFT JOIN opus_reviews o ON o.repo = p.repo AND o.number = p.number AND o.head_oid = p.head_oid LEFT JOIN repos r ON r.name = p.repo
    WHERE p.repo = ? AND p.number = ? AND p.head_oid = ?
      AND (p.base_ref IS NULL OR COALESCE(o.base_ref, r.default_branch) IS NULL OR p.base_ref = COALESCE(o.base_ref, r.default_branch))`).get(repo, number, head) as PremergeRow | undefined) ?? null;
}

/** The PR already had a pre-merge fix round (any fixups row with source premerge, pushed or not). */
export function premergeFixUsed(db: DatabaseSync, repo: string, number: number): boolean {
  return !!db.prepare("SELECT 1 FROM fixups WHERE repo = ? AND number = ? AND source = 'premerge' AND state NOT IN ('linting', 'superseded') LIMIT 1").get(repo, number);
}

/** Claims of a stored row; empty when none or unreadable. */
export function claimsOf(row: PremergeRow | null): Claim[] {
  try { const v = row?.claims ? (JSON.parse(row.claims) as unknown) : []; return Array.isArray(v) ? (v as Claim[]) : []; } catch { return []; }
}

/** Findings of a stored row; empty when none or unreadable. */
export function findingsOf(row: PremergeRow | null): PremergeFinding[] {
  try { return row?.findings ? (JSON.parse(row.findings) as PremergeFinding[]) : []; } catch { return []; }
}
