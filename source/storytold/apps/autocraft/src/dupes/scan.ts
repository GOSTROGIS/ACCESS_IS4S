// Candidate pairs: for each open item that is new or whose text changed (its
// stored embed_hash differs from the one at its last scan), its nearest
// neighbours in the same repo from the vector index.
import type { DatabaseSync } from "node:sqlite";
import { notOwnIntegrationSql } from "./held.ts";
import { quietSqlFor } from "../security/quiet.ts";
import type { VectorIndex } from "../embed/vectors.ts";

/**
 * Cosine similarity of the embedding model (bge-small) from which a neighbour becomes a candidate pair. The same bug in other
 * words can score in the 0.7s, and the pair check that follows is cheap; below 0.75 Jev finds almost no duplicates.
 * Changing it rescans every item once (src/db.ts).
 */
export const SIM_THRESHOLD = 0.75;
/** Most neighbours kept per scanned item. */
export const MAX_NEIGHBOURS = 3;
/** Neighbours looked up per item before the filters; the filters drop some. */
const LOOKUP = 20;
export const CLOSED_WINDOW_DAYS = 365;
const DAY = 86_400_000;

export type ScanItem = {
  repo: string; number: number; kind: string; state: string; embed_hash: string;
  closed_at: string | null; merged_at: string | null; closing_issues: string | null;
};
const COLS = "i.repo, i.number, i.kind, i.state, i.embed_hash, i.closed_at, i.merged_at, i.closing_issues";

const issuesOf = (i: ScanItem): number[] => {
  try { const v = JSON.parse(i.closing_issues ?? "[]") as unknown; return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : []; } catch { return []; }
};

/** One is a PR that closes the other. */
export function linked(x: ScanItem, y: ScanItem): boolean {
  return (x.kind === "pr" && issuesOf(x).includes(y.number)) || (y.kind === "pr" && issuesOf(y).includes(x.number));
}

/** Whether `other` may be compared with `item`: not itself, not linked to it, the same kind, and open or closed within the last year. */
export function comparable(item: ScanItem, other: ScanItem, nowMs: number): boolean {
  if (item.repo !== other.repo || item.number === other.number || linked(item, other) || item.kind !== other.kind) return false;
  if (other.state === "OPEN") return true;
  const at = Date.parse(other.merged_at ?? other.closed_at ?? "");
  return Number.isFinite(at) && nowMs - at <= CLOSED_WINDOW_DAYS * DAY;
}

export type Pair = { repo: string; a: number; b: number; a_hash: string; b_hash: string; similarity: number };

export function neighbourPairs(db: DatabaseSync, index: VectorIndex, item: ScanItem, nowMs: number, threshold = SIM_THRESHOLD, cap = MAX_NEIGHBOURS): Pair[] {
  const v = index.vectorOf(db, item.repo, item.number);
  if (!v) return [];
  // A quiet pull request is never paired: a duplicate close or group question would name it on GitHub.
  const quiet = db.prepare(`SELECT 1 AS q WHERE ${quietSqlFor("?", "?")}`);
  if (quiet.get(item.repo, item.number)) return [];
  const get = db.prepare(`SELECT ${COLS} FROM items i WHERE i.repo = ? AND i.number = ? AND ${notOwnIntegrationSql("i")} AND NOT ${quietSqlFor("i.repo", "i.number")}`);
  const out: Pair[] = [];
  for (const h of index.nearest(db, v, LOOKUP, `${item.repo}#${item.number}`, item.repo)) {
    if (h.score < threshold || out.length >= cap) break;
    const o = get.get(h.repo, h.number) as ScanItem | undefined;
    if (!o || !o.embed_hash || !comparable(item, o, nowMs)) continue;
    const [x, y] = item.number < o.number ? [item, o] : [o, item];
    out.push({ repo: item.repo, a: x.number, b: y.number, a_hash: x.embed_hash, b_hash: y.embed_hash, similarity: Math.round(h.score * 10000) / 10000 });
  }
  return out;
}

/** Stores the item's new pairs and marks it scanned. Pairs already checked at these hashes, and pairs an operator ruled on, are not added again. Returns the number added. */
export function scanItem(db: DatabaseSync, index: VectorIndex, item: ScanItem, now: Date): number {
  const pairs = neighbourPairs(db, index, item, now.getTime());
  const ruled = db.prepare("SELECT 1 FROM duplicate_pairs WHERE repo = ? AND a = ? AND b = ? AND by_operator = 1");
  const put = db.prepare(`INSERT OR IGNORE INTO duplicate_pairs (repo, a, b, a_hash, b_hash, similarity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  let added = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const p of pairs) {
      if (ruled.get(p.repo, p.a, p.b)) continue;
      added += Number(put.run(p.repo, p.a, p.b, p.a_hash, p.b_hash, p.similarity, now.toISOString()).changes);
    }
    db.prepare("INSERT INTO duplicate_scans (repo, number, hash, at) VALUES (?, ?, ?, ?) ON CONFLICT (repo, number) DO UPDATE SET hash = excluded.hash, at = excluded.at").run(item.repo, item.number, item.embed_hash, now.toISOString());
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return added;
}
