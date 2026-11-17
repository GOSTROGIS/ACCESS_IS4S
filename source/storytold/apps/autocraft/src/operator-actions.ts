// Operator releases for items that stop waiting for a person: clear a review hold at the current head,
// plan Verify again after it failed or errored, try a skipped or failed issue fix again, try the integration batch
// again after a single-PR batch failed. Each changes
// only local tables (the pipeline then picks the item up as usual) and is audited; none writes to GitHub.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "./dash/audit.ts";
import { connect } from "./db.ts";
import { batchStates, updateBatch } from "./merge/batch-store.ts";
import { headOf } from "./review/candidates.ts";

export class ActionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ItemActions = { reviewAgain: boolean; verifyAgain: boolean; fixAgain: boolean; batchAgain: boolean };

type ItemRow = { kind: string; state: string; head_oid: string | null; updated_at: string | null; c_head: string | null; c_at: string | null };

function openItem(db: DatabaseSync, repo: string, n: number): ItemRow & { head: string | null } {
  const r = db.prepare(`SELECT i.kind, i.state, i.head_oid, i.updated_at, c.head_oid AS c_head, c.fetched_at AS c_at
    FROM items i LEFT JOIN pr_checks c ON c.repo = i.repo AND c.number = i.number WHERE i.repo = ? AND i.number = ?`).get(repo, n) as ItemRow | undefined;
  if (!r) throw new ActionError(404, `no item ${repo}#${n} in the mirror`);
  if (r.state !== "OPEN") throw new ActionError(409, `${repo}#${n} is not open`);
  return { ...r, head: headOf(r) };
}

const heldReview = (db: DatabaseSync, repo: string, n: number, head: string | null) =>
  head ? db.prepare("SELECT reason FROM final_reviews WHERE repo = ? AND number = ? AND head_oid = ? AND verdict = 'hold'").get(repo, n, head) as { reason: string } | undefined : undefined;
const failedVerify = (db: DatabaseSync, repo: string, n: number, head: string | null) =>
  head ? db.prepare("SELECT state, summary FROM verifications WHERE repo = ? AND number = ? AND head_sha = ? AND state IN ('failed', 'error')").get(repo, n, head) as { state: string; summary: string | null } | undefined : undefined;
export const stoppedFix = (db: DatabaseSync, repo: string, n: number) =>
  db.prepare("SELECT state, round, retries, push_tries, reason, summary FROM fix_attempts WHERE repo = ? AND number = ? AND state IN ('skipped', 'failed') AND pr_url IS NULL").get(repo, n) as
    { state: string; round: number; retries: number; push_tries: number; reason: string | null; summary: string | null } | undefined;

const failedBatch = (db: DatabaseSync, repo: string, n: number, head: string | null) =>
  head && batchStates(db, repo).get(`${repo}#${n}@${head}`) === "batch-failed"
    ? db.prepare(`SELECT b.id, b.summary FROM main.merge_batches b JOIN main.merge_batch_prs p ON p.batch_id = b.id
        WHERE b.repo = ? AND b.state = 'failed' AND p.number = ? AND p.head_oid = ? ORDER BY b.id DESC LIMIT 1`).get(repo, n, head) as { id: number; summary: string | null } | undefined
    : undefined;

/** Which releases apply to the item now; the Item page shows only these. */
export function actionsOf(db: DatabaseSync, repo: string, n: number): ItemActions {
  const r = db.prepare(`SELECT i.kind, i.state, i.head_oid, i.updated_at, c.head_oid AS c_head, c.fetched_at AS c_at
    FROM items i LEFT JOIN pr_checks c ON c.repo = i.repo AND c.number = i.number WHERE i.repo = ? AND i.number = ?`).get(repo, n) as ItemRow | undefined;
  if (!r || r.state !== "OPEN") return { reviewAgain: false, verifyAgain: false, fixAgain: false, batchAgain: false };
  const head = headOf(r);
  return r.kind === "pr"
    ? { reviewAgain: !!heldReview(db, repo, n, head), verifyAgain: !!failedVerify(db, repo, n, head), fixAgain: false, batchAgain: !!failedBatch(db, repo, n, head) }
    : { reviewAgain: false, verifyAgain: false, fixAgain: !!stoppedFix(db, repo, n), batchAgain: false };
}

/** Removes the hold review at the PR's current head so the Review stage reviews that head again. */
export function reviewAgain(db: DatabaseSync, by: string, repo: string, n: number): void {
  const it = openItem(db, repo, n);
  if (it.kind !== "pr") throw new ActionError(409, `${repo}#${n} is not a pull request`);
  const held = heldReview(db, repo, n, it.head);
  if (!held) throw new ActionError(409, `${repo}#${n} has no review hold at its current head`);
  db.prepare("DELETE FROM opus_reviews WHERE repo = ? AND number = ? AND head_oid = ?").run(repo, n, it.head);
  audit(db, by, "review-again", `${repo}#${n}`, { head: it.head, reason: held.reason });
}

/** Marks the failed or errored verification of the current head stale so Verify plans it again. */
export function verifyAgain(db: DatabaseSync, by: string, repo: string, n: number): void {
  const it = openItem(db, repo, n);
  if (it.kind !== "pr") throw new ActionError(409, `${repo}#${n} is not a pull request`);
  const v = failedVerify(db, repo, n, it.head);
  if (!v) throw new ActionError(409, `${repo}#${n} has no failed or errored verification at its current head`);
  db.prepare("UPDATE verifications SET state = 'stale' WHERE repo = ? AND number = ? AND head_sha = ?").run(repo, n, it.head);
  audit(db, by, "verify-again", `${repo}#${n}`, { head: it.head, was: v.state, summary: v.summary });
}

/** Forgets a skipped or failed fix attempt (and so its round and retry counts) so the issue is eligible for Fix once more. */
export function fixAgain(db: DatabaseSync, by: string, repo: string, n: number): void {
  const it = openItem(db, repo, n);
  if (it.kind !== "issue") throw new ActionError(409, `${repo}#${n} is not an issue`);
  const a = stoppedFix(db, repo, n);
  if (!a) throw new ActionError(409, `${repo}#${n} has no skipped or failed fix attempt`);
  db.prepare("DELETE FROM fix_attempts WHERE repo = ? AND number = ?").run(repo, n);
  audit(db, by, "fix-again", `${repo}#${n}`, { was: a.state, round: a.round, reason: a.reason ?? a.summary });
}

/** Marks the failed batch that holds the PR's current head superseded, keeping its summary, so the merge queue considers the PR again. */
export function batchAgain(db: DatabaseSync, by: string, repo: string, n: number): void {
  const it = openItem(db, repo, n);
  if (it.kind !== "pr") throw new ActionError(409, `${repo}#${n} is not a pull request`);
  const b = failedBatch(db, repo, n, it.head);
  if (!b) throw new ActionError(409, `${repo}#${n} is not held by a failed batch at its current head`);
  updateBatch(db, b.id, new Date().toISOString(), { state: "superseded" });
  audit(db, by, "batch-again", `${repo}#${n}`, { head: it.head, batch: b.id, summary: b.summary });
}

export const commands = {
  item: {
    summary: "item batch-again REPO NUMBER --by LOGIN: release a PR held by a failed integration batch",
    run(args: string[]): void {
      const [sub, repo, num] = args;
      const by = args[args.indexOf("--by") + 1];
      if (sub !== "batch-again" || !repo || !/^\d+$/.test(num ?? "") || !args.includes("--by") || !by) {
        console.error("usage: autocraft item batch-again <repo> <number> --by <login>");
        process.exit(2);
      }
      try {
        batchAgain(connect(), by, repo, Number(num));
        console.log(`${repo}#${num}: released from its failed batch`);
      } catch (e) {
        if (!(e instanceof ActionError)) throw e;
        console.error(e.message);
        process.exit(1);
      }
    },
  },
};
