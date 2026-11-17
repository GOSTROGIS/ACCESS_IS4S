// Duplicate groups and their comparison sets. Items joined by duplicate pairs form
// a group; the members of one kind (PRs, issues) are compared together in one call
// (compare.ts), and the stored result is current while no member's state has changed,
// no member joined or left, no issue's text has changed and no PR's diff size has moved by
// more than 20% since the compared head. A head push or a PR text edit alone does not
// make it stale, but a decision binds each PR member to the head the comparison read.
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { pickCanonical } from "./canonical.ts";
import { inPilot } from "../pilot.ts";

type Edge = { repo: string; a: number; b: number; similarity: number; jev_p: number | null; haiku: string | null };

/** Duplicate pairs whose items still have the checked text. */
export function duplicateEdges(db: DatabaseSync, repo?: string): Edge[] {
  return db.prepare(`SELECT p.repo, p.a, p.b, p.similarity, p.jev_p, p.haiku FROM duplicate_pairs p
    JOIN items ia ON ia.repo = p.repo AND ia.number = p.a AND ia.embed_hash = p.a_hash
    JOIN items ib ON ib.repo = p.repo AND ib.number = p.b AND ib.embed_hash = p.b_hash
    WHERE p.verdict = 'duplicate' AND p.by_operator = 0 ${repo ? "AND p.repo = ?" : ""} ORDER BY p.repo, p.a, p.b`).all(...(repo ? [repo] : [])) as Edge[];
}

export type Group = { repo: string; canonical: number; why: string; members: number[]; edges: Edge[] };

export function duplicateGroups(db: DatabaseSync, repo?: string): Group[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const edges = duplicateEdges(db, repo);
  for (const e of edges) {
    for (const n of [e.a, e.b]) if (!parent.has(`${e.repo}#${n}`)) parent.set(`${e.repo}#${n}`, `${e.repo}#${n}`);
    parent.set(find(`${e.repo}#${e.a}`), find(`${e.repo}#${e.b}`));
  }
  const by = new Map<string, Edge[]>();
  for (const e of edges) by.set(find(`${e.repo}#${e.a}`), [...(by.get(find(`${e.repo}#${e.a}`)) ?? []), e]);
  return [...by.values()].map((es) => {
    const members = [...new Set(es.flatMap((e) => [e.a, e.b]))].sort((x, y) => x - y);
    const c = pickCanonical(db, es[0]!.repo, members);
    return { repo: es[0]!.repo, canonical: c.number, why: c.why, members, edges: es };
  });
}

export type Kind = "pr" | "issue";
export type Member = { number: number; kind: Kind; state: string; title: string | null; head_oid: string | null; embed_hash: string | null; comments_count: number | null; additions: number | null; deletions: number | null; closing_issues: string | null };

/** The members of one kind of a group: what one comparison covers. */
export type KindSet = { repo: string; kind: Kind; key: string; members: Member[]; hash: string };

export const setKey = (kind: Kind, numbers: number[]): string => `${kind}:${[...numbers].sort((a, b) => a - b).join(",")}`;

/** Changes whenever a member's state does, an issue's text, or the issues a PR closes; a PR's head and other text are left out (its diff size is checked on its own). */
export function setHash(members: Member[]): string {
  const rows = [...members].sort((a, b) => a.number - b.number).map((m) => (m.kind === "pr" ? [m.number, m.state, m.closing_issues] : [m.number, m.state, m.embed_hash]));
  return createHash("sha1").update(JSON.stringify(rows)).digest("hex");
}

/** The hash that rows stored before diff sizes were kept carry: state, head commit and text of every member. */
function legacySetHash(members: Member[]): string {
  const rows = [...members].sort((a, b) => a.number - b.number).map((m) => [m.number, m.state, m.head_oid, m.embed_hash]);
  return createHash("sha1").update(JSON.stringify(rows)).digest("hex");
}

export const DIFF_SIZE_CHANGE = 0.2;
const sizeOf = (m: { additions: number | null; deletions: number | null }): number | null => (m.additions === null || m.deletions === null ? null : m.additions + m.deletions);

export function kindSetsOf(db: DatabaseSync, g: Group): KindSet[] {
  const get = db.prepare("SELECT number, kind, state, title, head_oid, embed_hash, comments_count, additions, deletions, closing_issues FROM items WHERE repo = ? AND number = ?");
  // Left out: a rejected (closed, unmerged) PR; an item already closed as a duplicate, or whose pair decision is answered close (the act step closes it).
  const gone = db.prepare(`SELECT 1 FROM decisions WHERE kind = 'duplicate' AND repo = ? AND number = ? AND id LIKE '%:duplicate@%' AND answer = 'close'`);
  // A member our own group Act closed can never become a kept item later.
  const closedByUs = db.prepare("SELECT 1 FROM dupe_group_posts p JOIN dupe_groups g ON g.decision_id = p.decision_id WHERE g.repo = ? AND p.number = ? AND p.step = 'close' AND p.url IS NOT NULL");
  const reason = db.prepare("SELECT state_reason FROM items WHERE repo = ? AND number = ?");
  const members = g.members.map((n) => get.get(g.repo, n) as Member | undefined).filter((m): m is Member => {
    if (!m) return false;
    if (m.kind === "pr" && m.state === "CLOSED") return false;
    if (gone.get(g.repo, m.number) || closedByUs.get(g.repo, m.number)) return false;
    return (reason.get(g.repo, m.number) as { state_reason: string | null }).state_reason !== "DUPLICATE";
  });
  return (["pr", "issue"] as const).flatMap((kind) => {
    const ms = members.filter((m) => m.kind === kind);
    return ms.length ? [{ repo: g.repo, kind, key: setKey(kind, ms.map((m) => m.number)), members: ms, hash: setHash(ms) }] : [];
  });
}

export type StoredComparison = {
  repo: string; key: string; kind: Kind; members: number[]; hash: string; kept: number; source: "model" | "closed" | "rule" | "single";
  model: string | null; reason: string | null; result: ComparisonResult | null; error: string | null; attempts: number; at: string;
  /** What the model wrote for the decision: 2 or 3 sentences, and one sentence of reason. Absent or null on rows stored earlier. */
  summary?: string | null; why?: string | null;
  /** JSON {number: additions + deletions} of the PR members when compared; null on rows stored earlier. */
  sizes?: string | null;
  /** JSON {number: head} of the PR members the comparison read; null on rows stored earlier. */
  heads?: string | null;
};
/** The per-member answers of a comparison, in the shape of the prompt replies. */
export type ComparisonResult = {
  others: { number: number; duplicate?: boolean; better?: string[]; carry?: string[]; adds?: string[]; via?: number }[];
  rounds: number;
};

export function storedComparison(db: DatabaseSync, repo: string, key: string): StoredComparison | null {
  const r = db.prepare("SELECT * FROM dupe_comparisons WHERE repo = ? AND key = ?").get(repo, key) as
    (Omit<StoredComparison, "members" | "result"> & { members: string; result: string | null }) | undefined;
  if (!r) return null;
  let result: ComparisonResult | null = null;
  try { result = r.result ? (JSON.parse(r.result) as ComparisonResult) : null; } catch { /* no result */ }
  return { ...r, members: JSON.parse(r.members) as number[], result };
}

/** `set` is the compared snapshot: its members' sizes are stored, not whatever the items hold by now. */
export function saveComparison(db: DatabaseSync, c: StoredComparison, set?: KindSet): void {
  const sizes: Record<number, number> = {}, heads: Record<number, string> = {};
  if (c.kind === "pr" && set) {
    for (const m of set.members) { const z = sizeOf(m); if (z !== null) sizes[m.number] = z; if (m.head_oid) heads[m.number] = m.head_oid; }
  } else if (c.kind === "pr") {
    const get = db.prepare("SELECT additions, deletions, head_oid FROM items WHERE repo = ? AND number = ?");
    for (const n of c.members) {
      const m = (get.get(c.repo, n) as { additions: number | null; deletions: number | null; head_oid: string | null } | undefined) ?? { additions: null, deletions: null, head_oid: null };
      const z = sizeOf(m); if (z !== null) sizes[n] = z; if (m.head_oid) heads[n] = m.head_oid;
    }
  }
  db.prepare(`INSERT OR REPLACE INTO dupe_comparisons (repo, key, kind, members, hash, kept, source, model, reason, result, error, attempts, at, summary, why, sizes, heads)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(c.repo, c.key, c.kind, JSON.stringify(c.members), c.hash, c.kept, c.source, c.model, c.reason, c.result ? JSON.stringify(c.result) : null, c.error, c.attempts, c.at, c.summary ?? null, c.why ?? null, c.kind === "pr" ? JSON.stringify(sizes) : null, c.kind === "pr" ? JSON.stringify(heads) : null);
}

/** True when a PR member's diff size differs by more than 20% from the size stored at compare time. */
function diffMoved(c: StoredComparison, members: Member[]): boolean {
  let at: Record<string, number>;
  try { at = JSON.parse(c.sizes ?? "{}") as Record<string, number>; } catch { return false; }
  return members.some((m) => {
    const then = at[m.number], now = sizeOf(m);
    // A size unknown at compare time counts as moved once it is known.
    if (now === null) return false;
    return then === undefined || Math.abs(now - then) > DIFF_SIZE_CHANGE * Math.max(then, 1);
  });
}

/**
 * The head of PR `n` that its latest stored comparison read; undefined when no comparison is stored or the latest recorded no
 * heads (stored before heads were kept), so nothing binds the PR to code a comparison saw; null when the comparison read no head of it.
 */
export function comparedHead(db: DatabaseSync, repo: string, n: number): string | null | undefined {
  const r = db.prepare(`SELECT heads, json_extract(heads, '$."' || :n || '"') AS head FROM dupe_comparisons
    WHERE repo = :repo AND kind = 'pr' AND EXISTS (SELECT 1 FROM json_each(members) WHERE value = :n) ORDER BY at DESC LIMIT 1`).get({ repo, n }) as { heads: string | null; head: string | null } | undefined;
  return !r || r.heads == null ? undefined : r.head ?? null;
}

/** The stored comparison of the set when it is current. */
export const currentComparison = (db: DatabaseSync, s: KindSet): StoredComparison | null => {
  const c = storedComparison(db, s.repo, s.key);
  if (!c) return null;
  if (c.hash === s.hash) return diffMoved(c, s.members) ? null : c;
  return c.sizes == null && c.hash === legacySetHash(s.members) ? c : null;
};

export const DROP_PAUSE_MS = 10 * 60_000;
export const RULE_RETRY_MS = 15 * 60_000;
export const RULE_ATTEMPTS = 3;
const dropKey = (s: { repo: string; key: string }) => `dupe_drop:${s.repo}:${s.key}`;

/** Remembers that the set changed on GitHub since the sync, so it is not tried again for a while. */
export function rememberDrop(db: DatabaseSync, s: KindSet, at: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(dropKey(s), `${s.hash}|${at}`);
}

function recentlyDropped(db: DatabaseSync, s: KindSet, nowMs: number): boolean {
  const v = (db.prepare("SELECT value FROM settings WHERE key = ?").get(dropKey(s)) as { value: string } | undefined)?.value;
  if (!v) return false;
  const [hash, at] = v.split("|");
  return hash === s.hash && nowMs - Date.parse(at!) < DROP_PAUSE_MS;
}

/** A stored rule result is tried again after 15 minutes, three times at most, while no decision of the group is answered. */
function retryable(db: DatabaseSync, c: StoredComparison, nowMs: number): boolean {
  if (c.source !== "rule" || c.attempts >= RULE_ATTEMPTS || nowMs - Date.parse(c.at) < RULE_RETRY_MS) return false;
  const placeholders = c.members.map(() => "?").join(",");
  return !db.prepare(`SELECT 1 FROM dupe_group_items gi JOIN decisions d ON d.id = gi.decision_id
    WHERE gi.repo = ? AND gi.number IN (${placeholders}) AND d.answer IS NOT NULL AND d.answer <> 'superseded' LIMIT 1`).get(c.repo, ...c.members);
}

/** Sets that need a comparison: an open member is in the pilot and no current result is stored (or a rule result may be retried), and the set did not just change on GitHub. */
export function dueSets(db: DatabaseSync, repo?: string, nowMs: number = Date.now()): KindSet[] {
  const out: KindSet[] = [];
  for (const g of duplicateGroups(db, repo))
    for (const s of kindSetsOf(db, g)) {
      if (!s.members.some((m) => m.state === "OPEN" && inPilot(db, s.repo, m.number))) continue;
      const c = currentComparison(db, s);
      if ((!c || retryable(db, c, nowMs)) && !recentlyDropped(db, s, nowMs)) out.push(s);
    }
  return out;
}
