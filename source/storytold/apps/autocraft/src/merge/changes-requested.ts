// A formal "changes requested" review by someone with write access blocks the merge. GitHub's rule: a
// reviewer's CHANGES_REQUESTED stands, across pushes, until that reviewer approves or the review is dismissed.
// Comments and COMMENTED reviews neither block nor clear it. `reviewDecision` alone cannot decide this: it is
// null when the repo does not require reviews.
//
// Live reads (GraphQL `latestOpinionatedReviews(writersOnly: true)`) are decided on write access, because
// `authorAssociation` is relative to the viewer: a private org member can show as CONTRIBUTOR or NONE.
// The mirror stores only the association, so there a reviewer blocks unless the association says a stranger.
import type { DatabaseSync } from "node:sqlite";
import type { Querier } from "../mirror.ts";

export type ReviewFact = { id?: string | null; author: string | null; association: string | null; state: string | null; at: string | null };

/** Selection of the latest review per reviewer with write access, shared by every live read. */
export const FORMAL_REVIEWS = "latestOpinionatedReviews(first: 100, writersOnly: true) { nodes { id author { login } authorAssociation createdAt submittedAt state } }";

/** Associations that cannot be a maintainer. Anything else, and an unknown association, may be one. */
const STRANGER = ["NONE", "FIRST_TIMER", "FIRST_TIME_CONTRIBUTOR", "MANNEQUIN"];
const FORMAL = ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"];

/** Logins whose latest formal review in the mirror is CHANGES_REQUESTED, unless their association rules them out. */
export function changesRequestedBy(reviews: ReviewFact[]): string[] {
  const latest = new Map<string, ReviewFact>();
  const ordered = reviews.map((r, i) => ({ r, i })).sort((a, b) => (a.r.at ?? "").localeCompare(b.r.at ?? "") || a.i - b.i);
  for (const { r } of ordered) {
    if (!r.author || !FORMAL.includes(r.state ?? "")) continue;
    latest.set(r.author, r);
  }
  return [...latest.values()].filter((r) => r.state === "CHANGES_REQUESTED" && !STRANGER.includes(r.association ?? "")).map((r) => r.author!).sort();
}

/** Logins of a live writers-only read whose latest review is CHANGES_REQUESTED. */
export const blockedByWriters = (formal: ReviewFact[]): string[] => formal.filter((r) => r.state === "CHANGES_REQUESTED" && r.author).map((r) => r.author!).sort();

const REASON = "changes requested by a maintainer";
export const reasonFor = (by: string[]): string => `${REASON} (${by.join(", ")})`;

/** Why the mirrored reviews block the merge, or null. `decision` is GitHub's reviewDecision, an extra signal when the review list is cut short. */
export function refuseReviews(reviews: ReviewFact[], decision?: string | null): string | null {
  const by = changesRequestedBy(reviews);
  if (by.length) return reasonFor(by);
  return decision === "CHANGES_REQUESTED" ? REASON : null;
}

/** Why a live writers-only read blocks the merge, or null. */
export function refuseLive(formal: ReviewFact[], decision?: string | null): string | null {
  const by = blockedByWriters(formal);
  if (by.length) return reasonFor(by);
  return decision === "CHANGES_REQUESTED" ? REASON : null;
}

/**
 * Why a maintainer's changes request blocks the PR, or null. A live read newer than the PR's last change decides;
 * otherwise the mirrored reviews and GitHub's review decision do. The merge queue and the CI fix share this.
 */
export function changesRequestedWhy(live: Gate | undefined, updatedAt: string | null, reviews: ReviewFact[], decision: string | null | undefined): { why: string | null; live: boolean } {
  const fresh = live && live.readAt > (updatedAt ?? "") ? live : null;
  if (fresh) return { why: fresh.blocked ? reasonFor(fresh.by) : null, live: true };
  return { why: refuseReviews(reviews, decision), live: false };
}

/** Failed live reads in a row after which the queue says so. */
export const GATE_FAILURES = 3;

export type Gate = { blocked: boolean; by: string[]; readAt: string; failures: number };

/** What the live reads stored for the PRs, as `repo#number`. */
export function gatesOf(db: DatabaseSync, repo?: string): Map<string, Gate> {
  const rows = db.prepare(`SELECT repo, number, blocked, by_login, read_at, failures FROM review_gates ${repo ? "WHERE repo = ?" : ""}`).all(...(repo ? [repo] : [])) as
    { repo: string; number: number; blocked: number | null; by_login: string | null; read_at: string | null; failures: number }[];
  return new Map(rows.map((r) => [`${r.repo}#${r.number}`, { blocked: r.blocked === 1, by: r.by_login ? r.by_login.split(",") : [], readAt: r.read_at ?? "", failures: r.failures }]));
}

/** Stores a successful live read. The table is ours, so a sync cannot wipe it; the queue trusts it over the mirror until the PR changes. */
export function recordGate(db: DatabaseSync, repo: string, number: number, formal: ReviewFact[], decision: string | null | undefined, at = new Date().toISOString()): string | null {
  const reason = refuseLive(formal, decision);
  db.prepare(`INSERT INTO review_gates (repo, number, blocked, by_login, read_at, failures) VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT (repo, number) DO UPDATE SET blocked = excluded.blocked, by_login = excluded.by_login, read_at = excluded.read_at, failures = 0`)
    .run(repo, number, reason ? 1 : 0, blockedByWriters(formal).join(","), at);
  return reason;
}

export function recordGateFailure(db: DatabaseSync, repo: string, number: number): void {
  db.prepare("INSERT INTO review_gates (repo, number, failures) VALUES (?, ?, 1) ON CONFLICT (repo, number) DO UPDATE SET failures = failures + 1").run(repo, number);
}

const SMALL_QUERY = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewDecision ${FORMAL_REVIEWS} } } }`;
type Formal = { id?: string; author?: { login?: string } | null; authorAssociation?: string; submittedAt?: string; createdAt?: string; state?: string };

/** The writers-only reviews as facts. */
export const factsOf = (nodes: Formal[]): ReviewFact[] =>
  nodes.map((n) => ({ id: n.id ?? null, author: n.author?.login ?? null, association: n.authorAssociation ?? null, state: n.state ?? null, at: n.submittedAt ?? n.createdAt ?? null }));

/** A small live read of one PR's formal reviews, stored. Returns the block reason or null; a failed read is counted and returns undefined. */
export async function readGate(db: DatabaseSync, q: Querier, owner: string, repo: string, number: number, log: (line: string) => void = () => {}): Promise<string | null | undefined> {
  try {
    const res = await q.query(SMALL_QUERY, { owner, name: repo, number });
    const pr = res?.repository?.pullRequest;
    if (!pr) throw new Error("no such PR");
    return recordGate(db, repo, number, factsOf((pr.latestOpinionatedReviews?.nodes ?? []) as Formal[]), pr.reviewDecision);
  } catch (e) {
    recordGateFailure(db, repo, number);
    log(`  ${repo}#${number}: could not read its reviews (${String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 200)})`);
    return undefined;
  }
}

/** The note the queue shows when live reads keep failing. */
export const failureNote = (n: number): string => `reviews could not be read from GitHub ${n} times in a row`;
