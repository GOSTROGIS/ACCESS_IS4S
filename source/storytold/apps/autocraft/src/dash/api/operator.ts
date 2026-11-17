// Operator-only releases on the Item page: review again, verify again, try the fix again.
// They change local tables only; the pipeline picks the item up on its next pass.
import type { DatabaseSync } from "node:sqlite";
import { ActionError, batchAgain, fixAgain, reviewAgain, stoppedFix, verifyAgain } from "../../operator-actions.ts";
import { ask, getDecision } from "../../decisions.ts";
import { SCOPE_OPTIONS } from "../../decide/decision.ts";
import { applyAnswer } from "./decisions.ts";
import { cancelPreapproval, retryPreapproval } from "../../preapproval/index.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { needVisible } from "./visible.ts";

async function run(db: DatabaseSync, req: Req, f: (db: DatabaseSync, by: string, repo: string, n: number) => void): Promise<{ ok: true }> {
  if (req.user.role !== "operator") throw new HttpError(403, "only operators can release an item");
  const repo = req.params.repo!;
  const n = Number(req.params.n);
  if (!Number.isInteger(n)) throw new HttpError(400, "not an item number");
  await needVisible(db, req, repo);
  try {
    f(db, req.user.login, repo, n);
  } catch (e) {
    if (e instanceof ActionError) throw new HttpError(e.status, e.message);
    throw e;
  }
  return { ok: true };
}

/** Operator: cancels the PR's pre-approved merge while it is before the merge queue's merge. */
export async function cancelItemPreapproval(db: DatabaseSync, req: Req) {
  if (req.user.role !== "operator") throw new HttpError(403, "only operators can cancel a pre-approved merge");
  const repo = req.params.repo!;
  const n = Number(req.params.n);
  if (!Number.isInteger(n)) throw new HttpError(400, "not an item number");
  await needVisible(db, req, repo);
  try {
    return await cancelPreapproval(db, req.user.login, repo, n);
  } catch (e) {
    throw new HttpError(409, (e as Error).message);
  }
}

/** Operator: queues the failed pre-approved merge again with the same instructions. */
export async function retryItemPreapproval(db: DatabaseSync, req: Req) {
  if (req.user.role !== "operator") throw new HttpError(403, "only operators can retry a pre-approved merge");
  const repo = req.params.repo!;
  const n = Number(req.params.n);
  if (!Number.isInteger(n)) throw new HttpError(400, "not an item number");
  await needVisible(db, req, repo);
  try {
    return await retryPreapproval(db, req.user.login, repo, n);
  } catch (e) {
    throw new HttpError(409, (e as Error).message);
  }
}

/**
 * Operator: puts an issue with a stopped fix in the Backlog, or closes it. Both go through a scope decision the operator answers
 * at once, so the Backlog hold and the close (comment, act limit, approvals) follow the same paths as any decision.
 */
export async function stopFixItem(db: DatabaseSync, req: Req): Promise<{ ok: true }> {
  if (req.user.role !== "operator") throw new HttpError(403, "only operators can decide an issue");
  const repo = req.params.repo!;
  const n = Number(req.params.n);
  if (!Number.isInteger(n)) throw new HttpError(400, "not an item number");
  await needVisible(db, req, repo);
  const answer = (req.json as { answer?: unknown } | undefined)?.answer;
  if (answer !== "close" && answer !== "backlog") throw new HttpError(400, "answer must be close or backlog");
  const it = db.prepare("SELECT kind, state, title FROM items WHERE repo = ? AND number = ?").get(repo, n) as { kind: string; state: string; title: string | null } | undefined;
  if (!it || it.kind !== "issue" || it.state !== "OPEN") throw new HttpError(409, `${repo}#${n} is not an open issue`);
  const a = stoppedFix(db, repo, n);
  if (!a) throw new HttpError(409, `${repo}#${n} has no skipped or failed fix attempt`);
  if (!(await req.user.canWrite(repo).catch(() => false))) throw new HttpError(403, `no write access to ${repo.split("/").pop()}`);
  const id = `${repo}#${n}:scope:fix-stopped`;
  if (getDecision(db, id)?.answer) throw new HttpError(409, `${repo}#${n} was already decided this way`);
  ask(db, [{
    id, kind: "scope", repo, number: n, question: "What happens to this issue?", context: `The fix attempt ${a.state === "failed" ? "failed" : "was skipped"}${a.reason ?? a.summary ? `: ${a.reason ?? a.summary}` : ""}`, facts: [],
    options: [{ ...SCOPE_OPTIONS.close }, { ...SCOPE_OPTIONS.take }], recommended: null, asked_by: req.user.login, asked_at: new Date().toISOString(),
  }]);
  applyAnswer(db, getDecision(db, id)!, req.user.login, { answer }, "dashboard");
  return { ok: true };
}

export const reviewItemAgain = (db: DatabaseSync, req: Req) => run(db, req, reviewAgain);
export const verifyItemAgain = (db: DatabaseSync, req: Req) => run(db, req, verifyAgain);
export const fixItemAgain = (db: DatabaseSync, req: Req) => run(db, req, fixAgain);
export const batchItemAgain = (db: DatabaseSync, req: Req) => run(db, req, batchAgain);
