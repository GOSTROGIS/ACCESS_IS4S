// The merge queue as a view of Plans: every PR with a take or take-fix review at its current head commit, with the fields the
// dashboard, the flow counts and the merge executors show. Nothing here decides: state, path, reasons and notes come from
// decidePr (src/core/decide.ts); the rest is read from the facts. Reads only local tables; no GitHub calls.
import type { DatabaseSync } from "node:sqlite";
import { decidePr, queueEntry } from "../core/decide.ts";
import { loadPrFacts } from "../core/facts.ts";
import { isQueueState, QUEUE_STATES, type PrFacts, type QueueState } from "../core/plan.ts";
import { mergeDecisionId, VERIFY_UNAVAILABLE } from "../core/rules.ts";
import { claimsOf, findingsOf, premergeAt, type PremergeFinding } from "../premerge/store.ts";
import type { Claim } from "../review/opus-parse.ts";
import type { Tier } from "../whitelist.ts";

export { QUEUE_STATES, type QueueState };
export {
  RULE_LABELS, RULE_SIZES, RULE_TIERS, UNSURE_REASON, PREMERGE_DEFECT_REASON, PREMERGE_UNSURE_REASON, PREMERGE_FAILED_REASON, VERIFY_OK, verifyOk, VERIFY_UNAVAILABLE, verifyAllows, ciAllows,
  MERGE_OPTIONS, mergeDecisionId, holdDecisionId, HEAD_FACT, OPEN_GROUP_SQL, PIPELINE_LOGIN_KEY,
} from "../core/rules.ts";
export { NO_CI_SAMPLE, repoHasNoCi } from "./no-ci.ts";
export { headWasUnsure, ownFixPrs } from "../core/facts.ts";
export { countStates } from "../core/plan-read.ts";

export type QueueEntry = {
  repo: string; number: number; title: string; author: string | null; tier: Tier;
  head: string; size: string; label: string | null; verdict: "take" | "take-fix";
  reason: string; fixes: number; ci: string; mergeable: string;
  state: QueueState;
  /** The merge rule or an operator's answer lets it merge now (a refused PR still counts while its retry waits for a change). */
  eligible: boolean;
  /** How the PR may merge: by the rule, by an operator's answer, or not yet. */
  path: "rule" | "operator" | null;
  /** Why the rule doesn't cover it; empty when it does. */
  outsideRule: string[];
  decisionId: string | null;
  /** Actions runs at the reviewed head that wait for a maintainer's approval (see ci-approval.ts); 0 when none or unknown. */
  runsWaiting: number;
  /** Why the pipeline does not approve them: the repo's CI approval is off, approving failed twice, or they are not runs it approves (not a fork's pull_request); null when it will. */
  runsBlocked: "off" | "failed" | "unsupported" | null;
  /** The repo has no CI at all (not just no checks on this PR yet). */
  noCi: boolean;
  /** The operator's answer to the Merge? decision at this head, when there is one. */
  answer: string | null;
  refusedReason: string | null;
  reviewedAt: string;
  /** An operator holds the PR's merge (src/merge/controls.ts): it is reviewed and fixed as usual but does not merge, alone or in a batch. */
  held: boolean;
  /** A line on the state: why a maintainer's review blocks it, or that its reviews cannot be read. */
  note: string | null;
  /** The block (state changes-requested) comes from a live read newer than the PR's last update, not from the mirrored reviews alone. */
  blockedLive: boolean;
  /** The verification of the PR's current head, or null when there is none. */
  verify: { state: string; kind: string | null; summary: string | null; note: string | null } | null;
  /** For a conflicting PR: what Fix-up does about it ("conflict: merging main", "conflict: asked the contributor", "conflict: held"), or null. */
  conflictNote?: string | null;
  /** The PR is one AutoCraft opened to fix main CI (branch prefix MAIN_FIX_BRANCH_PREFIX); it merges alone, also while main is red. */
  mainFix?: boolean;
  /** The pre-merge review of the head, read for open PRs the rule would otherwise merge; null when not read (outside the rule, or an operator's Merge answer). fix: every defect has a fix and a fix-up may apply them; defect: a defect to decide on; failed: three tries failed; retry: a try failed, more are left. */
  premerge: { state: "none" | "clean" | "fix" | "defect" | "unsure" | "failed" | "retry"; defects: PremergeFinding[]; /** Claims of the description the review could not settle (unknown impact, or unverified). */ unknownClaims: Claim[]; minor: number; error: string | null } | null;
};

/** True when the PR may be merged now (ready, approved, or retried after a refusal). */
export const eligible = (e: Pick<QueueEntry, "eligible">): boolean => e.eligible;

export type QueueOptions = {
  repo?: string;
  /** Which PRs by GitHub state: open ones only, merged ones only, or both (default). */
  merged?: "exclude" | "only" | "all";
  /** Keyset page: entries after this PR in (repo, number) order, at most `limit` of them. */
  after?: { repo: string; number: number };
  limit?: number;
  /** Repos left out. */
  exclude?: string[];
  /** Only these PRs, as "repo#number". */
  refs?: Iterable<string>;
  /** The classification run for labels, resolved once by the caller (default: latestRun). */
  run?: string | null;
};

/** The queue row of a PR whose Plan is in a queue state. */
function entryOf(db: DatabaseSync, f: PrFacts, plan: ReturnType<typeof decidePr>, title: string): QueueEntry {
  const r = f.review!;
  const merged = plan.state === "merged";
  const x = queueEntry(f, merged, !merged);
  let premerge: QueueEntry["premerge"] = null;
  if (x.premerge) {
    const row = premergeAt(db, f.repo, f.number, r.head);
    const all = findingsOf(row);
    const defects = all.filter((d) => d.severity === "defect");
    premerge = { state: x.premerge, defects, unknownClaims: claimsOf(row).filter((c) => c.impact === "unknown"), minor: all.length - defects.length, error: row?.error ?? null };
  }
  return {
    repo: f.repo, number: f.number, title, author: f.author, tier: f.tier, head: r.head, size: f.size, label: f.label,
    verdict: r.verdict as "take" | "take-fix", reason: r.reason, fixes: r.fixes, ci: f.ci, mergeable: f.mergeable,
    state: plan.state as QueueState, eligible: plan.eligible, path: plan.path, outsideRule: plan.reasons,
    decisionId: f.decision.asked ? mergeDecisionId(f.repo, f.number, r.head) : null,
    runsWaiting: f.runs?.waiting ?? 0, runsBlocked: f.runs?.blocked ?? null, noCi: x.noCi, answer: x.answer, refusedReason: x.refusedReason,
    reviewedAt: r.at, held: f.mergeHeld, note: plan.note, blockedLive: plan.state === "changes-requested" && !!f.changesRequested?.live,
    verify: f.verification, ...(plan.conflictNote !== null ? { conflictNote: plan.conflictNote } : {}), ...(f.mainFix ? { mainFix: true } : {}), premerge,
  };
}

export function buildQueue(db: DatabaseSync, opts: QueueOptions = {}): QueueEntry[] {
  const which = opts.merged ?? "all";
  const title = db.prepare("SELECT title FROM items WHERE repo = ? AND number = ?");
  const out: QueueEntry[] = [];
  for (const f of loadPrFacts(db, { ...(opts.repo ? { repo: opts.repo } : {}), ...(opts.refs ? { refs: opts.refs } : {}), ...(opts.run !== undefined ? { run: opts.run } : {}) })) {
    if (opts.exclude?.includes(f.repo)) continue;
    if (which === "exclude" ? f.ghState !== "OPEN" : which === "only" ? f.ghState !== "MERGED" : f.ghState === "CLOSED") continue;
    if (opts.after && (f.repo < opts.after.repo || (f.repo === opts.after.repo && f.number <= opts.after.number))) continue;
    const plan = decidePr(f);
    if (!isQueueState(plan.state)) continue;
    out.push(entryOf(db, f, plan, ((title.get(f.repo, f.number) as { title: string | null } | undefined)?.title ?? "")));
    if (opts.limit && out.length >= Math.floor(opts.limit)) break;
  }
  return out;
}
