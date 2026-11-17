// The commits our pipeline pushed to a PR between two heads, for the review prompt and for carrying a verdict over our own fix-up.
import type { DatabaseSync } from "node:sqlite";

export type OurCommit = { kind: "fix-up" | "pre-merge fix" | "operator fix-up" | "CI fix" | "base merge" | "carry"; sha: string; note: string; fixes_meant: string[]; from: string };

type Row = { from: string; kind: OurCommit["kind"]; note: string | null; source?: string | null };

/** What a carry commit holds: parts of the closed duplicates, named with their authors. */
function carriedNote(db: DatabaseSync, repo: string, decision: string | null): string {
  const rows = decision ? db.prepare("SELECT g.number, i.author FROM dupe_group_items g LEFT JOIN items i ON i.repo = ? AND i.number = g.number WHERE g.decision_id = ? AND g.kind = 'pr' AND g.role = 'close' ORDER BY g.number").all(repo, decision) as { number: number; author: string | null }[] : [];
  return rows.length ? `parts carried from the closed duplicate PRs ${rows.map((x) => `#${x.number}${x.author ? ` by ${x.author}` : ""}`).join(", ")}: code written by those authors, not by the pipeline` : "parts carried from closed duplicate PRs: code written by their authors, not by the pipeline";
}

/** The commit of ours that made `head`, or null when no push of ours ended there (a contributor's commit). */
function madeBy(db: DatabaseSync, repo: string, number: number, head: string): Row | null {
  const a = db.prepare("SELECT from_head AS f, reason, source, carry_decision FROM fixups WHERE repo = ? AND number = ? AND to_head = ? AND state = 'pushed' ORDER BY rowid DESC").get(repo, number, head) as { f: string; reason: string | null; source: string | null; carry_decision: string | null } | undefined;
  if (a?.source === "carry") return { from: a.f, kind: "carry", note: carriedNote(db, repo, a.carry_decision), source: a.source };
  if (a) return { from: a.f, kind: a.source === "premerge" ? "pre-merge fix" : a.source === "operator" ? "operator fix-up" : "fix-up", note: a.reason, source: a.source };
  const b = db.prepare("SELECT head AS f, reason, kind FROM ci_fixes WHERE repo = ? AND number = ? AND to_head = ? AND state = 'pushed' ORDER BY rowid DESC").get(repo, number, head) as { f: string; reason: string | null; kind: string } | undefined;
  if (b) return { from: b.f, kind: "CI fix", note: b.reason ?? `fix for the failing ${b.kind} check` };
  const c = db.prepare("SELECT from_head AS f, reason FROM conflict_merges WHERE repo = ? AND number = ? AND to_head = ? AND state = 'merged' ORDER BY rowid DESC").get(repo, number, head) as { f: string; reason: string | null } | undefined;
  if (c) return { from: c.f, kind: "base merge", note: c.reason ?? "merged the base branch into the PR" };
  const d = db.prepare("SELECT from_head AS f FROM dupe_carries WHERE repo = ? AND number = ? AND to_head = ? AND outcome LIKE 'pushed%' AND from_head IS NOT NULL").get(repo, number, head) as { f: string } | undefined;
  if (d) return { from: d.f, kind: "carry", note: "carried parts of closed duplicates onto the PR" };
  return null;
}

/** The fixes the review at `head` asked for, as "file: change". */
function fixesAsked(db: DatabaseSync, repo: string, number: number, head: string): string[] {
  const r = db.prepare("SELECT fixes FROM opus_review_history WHERE repo = ? AND number = ? AND head_oid = ? AND verdict IS NOT NULL ORDER BY at DESC, rowid DESC LIMIT 1").get(repo, number, head) as { fixes: string | null } | undefined;
  try {
    const v = JSON.parse(r?.fixes ?? "[]") as { file?: unknown; change?: unknown }[];
    return v.filter((x) => typeof x.file === "string" && typeof x.change === "string").slice(0, 8).map((x) => `${x.file}: ${x.change}`);
  } catch { return []; }
}

/**
 * Our commits that lead from `earlier` to `head`, oldest first. `complete` is false when the way back from `head` meets a commit that
 * is not ours before it reaches `earlier` (a contributor pushed in between), so the list then holds only the newest part.
 */
export function ourCommitsSince(db: DatabaseSync, repo: string, number: number, earlier: string, head: string): { commits: OurCommit[]; complete: boolean; sources: (string | null | undefined)[] } {
  const commits: OurCommit[] = [], sources: (string | null | undefined)[] = [];
  let h = head, complete = false;
  for (let i = 0; i < 20 && h !== earlier; i++) {
    const row = madeBy(db, repo, number, h);
    if (!row) break;
    commits.unshift({ kind: row.kind, sha: h, from: row.from, note: row.note ?? "", fixes_meant: row.kind === "fix-up" ? fixesAsked(db, repo, number, row.from) : [] });
    sources.unshift(row.source);
    h = row.from;
  }
  complete = h === earlier;
  return { commits, complete, sources };
}
