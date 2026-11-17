// What the Fix stage reads about issues from the local tables. Which issues it works on is the Plans' (core/decide-item.ts).
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const ATTEMPT_STATES = ["retry", "testing", "passed", "pr-opened", "skipped", "failed"] as const;

export type IssueCandidate = { repo: string; number: number; title: string; body: string; hash: string; score: number | null };

/** Setting that marks a repo without a Rust workspace at its root, set by the step when it finds out. */
export const notRustKey = (repo: string): string => `fixissue_not_rust:${repo}`;

export const textHash = (title: string, body: string): string => createHash("sha256").update(title).update("\0").update(body).digest("hex").slice(0, 16);

/** A closing or addressing keyword followed by a same-repo issue number. */
const CLOSING = /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?|address(?:es|ed)?)\s*:?\s+#(\d+)/gi;
const MENTION = /(?<![\w/])#(\d+)/g;

/** Text without links: a reference inside a URL, an HTML link or a markdown link (dependabot's release notes) is not a reference to the repo's own issue. */
const withoutLinks = (t: string): string => t.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " ").replace(/\[[^\]]*\]\([^)]*\)/g, " ").replace(/https?:\/\/\S+/g, " ");

/** The open PR that holds an issue: `closes` when it has a closing-issue link or a Fixes/Closes/Resolves/Addresses #n, else it only mentions the issue. */
export type OpenPr = { number: number; closes: boolean };

/**
 * Issues an open PR in the repo closes or addresses (any author), and issues a person's open PR mentions by number
 * (a bot's PR, such as a dependency update, is not asked about its mentions). A PR that closes an issue wins over one that mentions it.
 */
export function issuesWithOpenPr(db: DatabaseSync, repo: string): Map<number, OpenPr> {
  const prs = db.prepare("SELECT number, author, body, title, closing_issues FROM items WHERE repo = ? AND kind = 'pr' AND state = 'OPEN' ORDER BY number DESC").all(repo) as { number: number; author: string | null; body: string | null; title: string | null; closing_issues: string | null }[];
  const out = new Map<number, OpenPr>();
  for (const p of prs) {
    const text = withoutLinks(`${p.title ?? ""}\n${p.body ?? ""}`);
    const closes = new Set<number>();
    try {
      for (const n of JSON.parse(p.closing_issues ?? "[]") as unknown[]) if (typeof n === "number") closes.add(n);
    } catch { /* fall through to the text */ }
    for (const m of text.matchAll(CLOSING)) closes.add(Number(m[1]));
    for (const n of closes) out.set(n, { number: p.number, closes: true });
    if (/\[bot\]$/i.test(p.author ?? "")) continue;
    for (const m of text.matchAll(MENTION)) { const n = Number(m[1]); if (!out.has(n)) out.set(n, { number: p.number, closes: false }); }
  }
  return out;
}

/** Whether an open PR in the repo closes issue `n` or a person's open PR mentions it. */
export const hasOpenPr = (db: DatabaseSync, repo: string, n: number): boolean => issuesWithOpenPr(db, repo).has(n);
