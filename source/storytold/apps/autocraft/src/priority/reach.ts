// Reach signals of open items, read from the mirror in a few set-wide queries
// (about 21,000 items): no per-item query.
import type { DatabaseSync } from "node:sqlite";
import { parseRef } from "../classify/parse.ts";
import { latestRun, settledTable } from "../classify/settled.ts";
import type { Reach } from "./score.ts";

const key = (repo: string, n: number) => `${repo}#${n}`;

/** Confirmed duplicates per canonical item, from the duplicates stage's `duplicate_pairs` table. Empty when the table or a column is missing. */
export function duplicateCounts(db: DatabaseSync): Map<string, number> {
  const out = new Map<string, number>();
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'duplicate_pairs'").get();
  if (!exists) return out;
  const cols = new Set((db.prepare("PRAGMA table_info(duplicate_pairs)").all() as { name: string }[]).map((c) => c.name));
  if (!["repo", "canonical", "verdict"].every((c) => cols.has(c))) return out;
  const rows = db.prepare("SELECT repo, canonical FROM duplicate_pairs WHERE verdict = 'duplicate' AND canonical IS NOT NULL").all() as { repo: string; canonical: string | number }[];
  for (const r of rows) {
    // The canonical item is a number in the pair's repo, or a "repo#number" ref.
    const ref = typeof r.canonical === "number" || /^\d+$/.test(String(r.canonical)) ? { repo: r.repo, number: Number(r.canonical) } : parseRef(String(r.canonical));
    if (ref) out.set(key(ref.repo, ref.number), (out.get(key(ref.repo, ref.number)) ?? 0) + 1);
  }
  return out;
}

/** Reach of every open item that has a priority row. */
export function reachOfOpenItems(db: DatabaseSync, nowMs: number = Date.now()): Map<string, Reach> {
  const commenters = new Map<string, number>();
  for (const r of db.prepare("SELECT repo, number, COUNT(DISTINCT author) AS n FROM comments WHERE kind = 'comment' GROUP BY repo, number").all() as { repo: string; number: number; n: number }[])
    commenters.set(key(r.repo, r.number), r.n);
  const security = new Set<string>();
  settledTable(db, latestRun(db));
  for (const r of db.prepare("SELECT repo, number FROM temp.item_settled WHERE security = 1").all() as { repo: string; number: number }[])
    security.add(key(r.repo, r.number));
  // A PR that closes issues counts for the PR and for each issue.
  const linked = new Map<string, number>();
  const bump = (k: string) => linked.set(k, (linked.get(k) ?? 0) + 1);
  for (const r of db.prepare("SELECT repo, number, closing_issues FROM items WHERE kind = 'pr' AND state = 'OPEN' AND closing_issues IS NOT NULL AND closing_issues <> '[]'").all() as { repo: string; number: number; closing_issues: string }[]) {
    let nums: unknown;
    try { nums = JSON.parse(r.closing_issues); } catch { continue; }
    if (!Array.isArray(nums)) continue;
    for (const n of nums) if (typeof n === "number") { bump(key(r.repo, n)); bump(key(r.repo, r.number)); }
  }
  const dups = duplicateCounts(db);
  const out = new Map<string, Reach>();
  const rows = db.prepare(`SELECT i.repo, i.number, i.comments_count, i.created_at FROM items i
    JOIN item_priority p ON p.repo = i.repo AND p.number = i.number WHERE i.state = 'OPEN'`).all() as { repo: string; number: number; comments_count: number | null; created_at: string | null }[];
  for (const r of rows) {
    const k = key(r.repo, r.number), created = r.created_at ? Date.parse(r.created_at) : NaN;
    out.set(k, {
      comments: r.comments_count ?? 0, commenters: commenters.get(k) ?? 0, linked: linked.get(k) ?? 0, duplicates: dups.get(k) ?? 0,
      security: security.has(k), ageDays: Number.isNaN(created) ? 0 : Math.max(0, (nowMs - created) / 86_400_000),
    });
  }
  return out;
}
