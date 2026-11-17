// What the planner and the fix-up step read of operator fix-ups and pre-approved merges. No writes here.
import type { DatabaseSync } from "node:sqlite";
import { settlesLoginSql } from "../settlers.ts";
import { FIXUP_MAX_ATTEMPTS } from "../core/rules.ts";

/** Fix-up states that count as a try; a row left in `pushing` by a crash counts too. */
const TRY_STATES = ["pushing", "pushed", "failed", "refused", "rejected"];
/** Fix-up states that end the work of an operator fix-up (`linting` is a stored patch waiting for its lint task; `superseded` is one the plan dropped). */
const ENDED_STATES = ["pushing", "pushed", "failed", "refused", "rejected", "cannot-push", "too-large", "push-denied", "asked", "comment-failed", "superseded"];
/** A request counts only while the person who made it still settles on the repo (an operator, or a maintainer under src/settlers.ts): its push is made as them. */
const BY_SETTLES = settlesLoginSql("o.by", "o.repo");
const ENDED_SQL = `EXISTS (SELECT 1 FROM fixups f WHERE f.operator_fix = o.id AND f.source = 'operator' AND f.state IN (${ENDED_STATES.map(() => "?").join(",")}))`;

/** Tries the operator's fix-ups used on the PR; the fix-up limit of the PR applies to them as to the review's. */
export function operatorTries(db: DatabaseSync, repo: string, number: number): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM fixups WHERE repo = ? AND number = ? AND source = 'operator' AND state IN (${TRY_STATES.map(() => "?").join(",")})`)
    .get(repo, number, ...TRY_STATES) as { n: number }).n;
}
export const operatorTriesLeft = (db: DatabaseSync, repo: string, number: number): boolean => operatorTries(db, repo, number) < FIXUP_MAX_ATTEMPTS;

export type OperatorFix = { id: number; head: string; instructions: string; by: string; preapprovalId: number | null };

/** The operator fix-up of the PR still to work at `head`: queued and without a final fixups row of its own (matched by the request's id). */
export function queuedOperatorFix(db: DatabaseSync, repo: string, number: number, head: string): OperatorFix | null {
  const r = db.prepare(`SELECT id, from_head, instructions, by, preapproval_id FROM operator_fixups o WHERE repo = ? AND number = ? AND from_head = ? AND state = 'queued'
    AND ${BY_SETTLES} AND NOT ${ENDED_SQL}
    ORDER BY id DESC LIMIT 1`).get(repo, number, head, ...ENDED_STATES) as { id: number; from_head: string; instructions: string; by: string; preapproval_id: number | null } | undefined;
  return r ? { id: r.id, head: r.from_head, instructions: r.instructions, by: r.by, preapprovalId: r.preapproval_id } : null;
}

export type OperatorWork = { fixHeads: Set<string>; hold: boolean; /** The pushed head of a pre-approved merge waiting for its pre-merge review (state `ci`). */ premergeHeads: Set<string> };

/** Per PR ("repo#n"): the heads with an operator fix-up still to work, whether a pre-approved merge is before its merge answer, and the heads due a pre-merge review. Small tables, read once per pass. */
export function operatorWork(db: DatabaseSync, repo?: string): Map<string, OperatorWork> {
  const out = new Map<string, OperatorWork>();
  const get = (r: string, n: number): OperatorWork => {
    const k = `${r}#${n}`;
    let w = out.get(k);
    if (!w) out.set(k, (w = { fixHeads: new Set(), hold: false, premergeHeads: new Set() }));
    return w;
  };
  const q = (sql: string) => db.prepare(`${sql}${repo ? " AND repo = ?" : ""}`).all(...(repo ? [repo] : []));
  for (const o of db.prepare(`SELECT repo, number, from_head FROM operator_fixups o WHERE state = 'queued' AND ${BY_SETTLES} AND NOT ${ENDED_SQL}${repo ? " AND repo = ?" : ""}`).all(...ENDED_STATES, ...(repo ? [repo] : [])) as { repo: string; number: number; from_head: string }[]) get(o.repo, o.number).fixHeads.add(o.from_head);
  for (const p of q("SELECT repo, number, state, head FROM preapprovals WHERE state IN ('fixup', 'review', 'ci')") as { repo: string; number: number; state: string; head: string | null }[]) {
    const w = get(p.repo, p.number);
    w.hold = true;
    if (p.state === "ci" && p.head) w.premergeHeads.add(p.head);
  }
  return out;
}

export type OpenRequest = { id: number; repo: string; number: number; head: string; preapprovalId: number | null; started: boolean };

/** Every operator fix-up request still queued (no final fixups row of its own); `started` when a fixups row of it exists (a stored patch or a push under way). */
export function openOperatorFixups(db: DatabaseSync): OpenRequest[] {
  const rows = db.prepare(`SELECT id, repo, number, from_head, preapproval_id, EXISTS (SELECT 1 FROM fixups f WHERE f.operator_fix = o.id) AS started FROM operator_fixups o WHERE state = 'queued' AND ${BY_SETTLES} AND NOT ${ENDED_SQL} AND repo IN (SELECT name FROM main.tracked_repos)`)
    .all(...ENDED_STATES) as { id: number; repo: string; number: number; from_head: string; preapproval_id: number | null; started: number }[];
  return rows.map((r) => ({ id: r.id, repo: r.repo, number: r.number, head: r.from_head, preapprovalId: r.preapproval_id, started: !!r.started }));
}
