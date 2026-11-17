// The Plan cache: `item_plans` holds what the planner decided for each PR and item at the end of its last pass, for the
// dashboard to read. The planner is its only writer. A pass writes the rows that changed, and deletes the rows of items that
// left the Plans, in one transaction.
import type { DatabaseSync } from "node:sqlite";
import { holdWait } from "../outside.ts";
import { cifixBucket, fixupOf, queueEntry } from "./decide.ts";
import { nextStep } from "./decide-item.ts";
import { mergeDecisionId } from "./rules.ts";
import { isWork } from "./assignment.ts";
import type { ItemFacts, Plan, PrFacts, WaitKind } from "./plan.ts";
import { isQueueState } from "./plan.ts";
import { statusOf, type ItemStatus } from "./item-status.ts";
import { loadPlanSet, type PlanSet, type PlanSetOptions } from "./plan-set.ts";

/** The merge-queue fields of a PR whose Plan is in a queue state: what the Queue page and the flow counts show besides the Plan's own state, reasons and note. */
export type QueueView = {
  author: string | null; tier: string; head: string; size: string; label: string | null; verdict: "take" | "take-fix"; reason: string; fixes: number;
  ci: string; mergeable: string; path: "rule" | "operator" | null; eligible: boolean; decisionId: string | null; answer: string | null; refusedReason: string | null;
  reviewedAt: string; held: boolean; blockedLive: boolean; noCi: boolean; runsWaiting: number; runsBlocked: "off" | "failed" | "unsupported" | null;
  verify: { state: string; kind: string | null; summary: string | null; note: string | null } | null;
  conflictNote?: string; mainFix?: true;
};

export type FixupBucket = "fix" | "unapproved" | "asked" | "hold";
export type CifixBucket = "cifix-queued" | "cifix-rerun" | "cifix-failed";

/** What the dashboard reads besides the Plan columns, per row; keys are left out when empty. */
export type PlanView = {
  /** The Work page's next-step text; absent for a PR outside the item facts (merged, or in an untracked repo). */
  next?: string;
  /** In the pipeline's scope and not our own integration PR. */
  scope?: true;
  /** Settled label of the current classification run. */
  label?: string;
  /** GitHub state of a PR. */
  gh?: "OPEN" | "MERGED" | "CLOSED";
  fixup?: FixupBucket;
  cifix?: CifixBucket;
  queue?: QueueView;
  /** Who the wait is on, as the planner typed it; absent when nothing is awaited (read by the liveness check). */
  waitKind?: WaitKind;
  /** Phase, wait and next step; `since` is when phase or wait last changed. */
  status: ItemStatus;
};

export type PlanRow = {
  repo: string; number: number; kind: "pr" | "issue"; head: string | null; state: string; item_state: string | null;
  actions: string; wait: string | null; reasons: string; note: string | null; view: string;
};

const CIFIX_BUCKETS: Record<string, CifixBucket> = { work: "cifix-queued", formatting: "cifix-queued", collect: "cifix-queued", linting: "cifix-queued", rerun: "cifix-rerun", "rerun-wait": "cifix-rerun", "comment-wait": "cifix-queued", failed: "cifix-failed", capped: "cifix-failed" };

/** The fix-up bucket the flow counts show for a PR: a take-fix review's own, or a pre-merge round's. */
function fixupBucketOf(f: PrFacts, plan: Plan): FixupBucket | undefined {
  const x = fixupOf(f);
  if (x) return x.bucket === "fix" || x.bucket === "unapproved" || x.bucket === "asked" ? x.bucket : "hold";
  if (f.premerge && plan.actions.some((a) => a.kind === "fixup" && a.params?.source === "premerge")) return f.pushable && f.repoFacts.pushApproved ? "fix" : f.pushable ? "unapproved" : "hold";
  return undefined;
}

function queueViewOf(f: PrFacts, plan: Plan): QueueView {
  const r = f.review!;
  const merged = plan.state === "merged";
  const x = queueEntry(f, merged, !merged);
  return {
    author: f.author, tier: f.tier, head: r.head, size: f.size, label: f.label, verdict: r.verdict as "take" | "take-fix", reason: r.reason, fixes: r.fixes, ci: f.ci, mergeable: f.mergeable,
    path: plan.path, eligible: plan.eligible, decisionId: f.decision.asked ? mergeDecisionId(f.repo, f.number, r.head) : null, answer: x.answer, refusedReason: x.refusedReason,
    reviewedAt: r.at, held: f.mergeHeld, blockedLive: plan.state === "changes-requested" && !!f.changesRequested?.live, noCi: x.noCi,
    runsWaiting: f.runs?.waiting ?? 0, runsBlocked: f.runs?.blocked ?? null, verify: f.verification,
    ...(plan.conflictNote !== null ? { conflictNote: plan.conflictNote } : {}), ...(f.mainFix ? { mainFix: true as const } : {}),
  };
}

function viewOf(pr: { facts: PrFacts; plan: Plan } | null, item: { facts: ItemFacts; plan: Parameters<typeof nextStep>[0] } | null, wait: string | null, waitKind: WaitKind | null, plannedAt: string): PlanView {
  const v = { status: { phase: "Triage", waiting: null, next: null, since: plannedAt } } as PlanView;
  if (item) {
    v.next = nextStep(item.plan, item.facts, pr?.facts ?? null);
    if (item.facts.inScope && !item.facts.integration) v.scope = true;
    if (item.facts.classification.label) v.label = item.facts.classification.label;
  } else if (pr && pr.facts.inScope && !pr.facts.integration) v.scope = true;
  if (pr) {
    v.gh = pr.facts.ghState;
    const fx = fixupBucketOf(pr.facts, pr.plan);
    if (fx) v.fixup = fx;
    const cf = cifixBucket(pr.facts);
    if (cf && CIFIX_BUCKETS[cf]) v.cifix = CIFIX_BUCKETS[cf];
    if (isQueueState(pr.plan.state) && pr.facts.review) v.queue = queueViewOf(pr.facts, pr.plan);
  }
  if (wait !== null && waitKind) v.waitKind = waitKind;
  v.status = {
    ...statusOf({ gh: pr?.facts.ghState ?? null, state: pr?.plan.state ?? null, itemState: item?.plan.state ?? null, wait, waitKind, scopeAnswered: pr?.facts.scopeAnswer != null, next: v.next ?? null, reviewBlocked: pr?.facts.reviewHold?.kind === "blocked", inPipeline: item?.facts.inScope ?? pr?.facts.inScope, ...((item?.facts.outsideHold ?? pr?.facts.outsideHold) ? { outside: (item?.facts.outsideHold ?? pr?.facts.outsideHold)! } : {}) }),
    since: plannedAt,
  };
  return v;
}

/** One row per PR or item of the set. A PR with item facts gets both its plans in one row. */
export function planRows(plans: PlanSet, plannedAt: string = new Date().toISOString()): PlanRow[] {
  const prs = new Map(plans.prs.map((p) => [`${p.facts.repo}#${p.facts.number}`, p]));
  const rows: PlanRow[] = [];
  for (const { facts: f, plan: item } of plans.items) {
    const ref = `${f.repo}#${f.number}`;
    const pr = prs.get(ref) ?? null;
    prs.delete(ref);
    const actions = [...item.actions, ...(pr?.plan.actions ?? [])];
    const work = actions.some(isWork);
    const hold = f.outsideHold ?? pr?.facts.outsideHold;
    const wait = hold ? holdWait(hold) : work ? null : pr?.plan.wait ?? item.wait;
    const waitKind = hold ? "system" as const : work ? null : pr?.plan.wait != null ? pr.plan.waitKind : item.waitKind;
    rows.push({
      repo: f.repo, number: f.number, kind: f.kind, head: pr?.facts.head ?? null, state: pr ? pr.plan.state : item.state, item_state: item.state,
      actions: JSON.stringify(actions), wait, reasons: JSON.stringify(pr?.plan.reasons ?? []), note: pr?.plan.note ?? null,
      view: JSON.stringify(viewOf(pr, { facts: f, plan: item }, wait, waitKind, plannedAt)),
    });
  }
  // PRs outside the item facts: merged ones with a take review, and PRs of repos that are not tracked.
  for (const { facts: f, plan } of prs.values()) {
    rows.push({ repo: f.repo, number: f.number, kind: "pr", head: f.head, state: plan.state, item_state: null, actions: JSON.stringify(plan.actions), wait: plan.wait, reasons: JSON.stringify(plan.reasons), note: plan.note, view: JSON.stringify(viewOf({ facts: f, plan }, null, plan.wait, plan.waitKind, plannedAt)) });
  }
  return rows;
}

const sig = (r: PlanRow): string => JSON.stringify([r.kind, r.head, r.state, r.item_state, r.actions, r.wait, r.reasons, r.note, r.view]);

/** Writes the rows that differ from the stored ones and deletes the stored rows with no Plan. Returns the numbers written and deleted. */
export function writePlanCache(db: DatabaseSync, plans: PlanSet, plannedAt: string = new Date().toISOString()): { written: number; deleted: number } {
  const rows = planRows(plans, plannedAt);
  const stored = new Map<string, string>();
  const storedStatus = new Map<string, ItemStatus | undefined>();
  const storedState = new Map<string, { state: string; wait: string | null; head: string | null }>();
  for (const r of db.prepare("SELECT repo, number, kind, head, state, item_state, actions, wait, reasons, note, view FROM main.item_plans").all() as PlanRow[]) {
    stored.set(`${r.repo}#${r.number}`, sig(r));
    storedStatus.set(`${r.repo}#${r.number}`, (JSON.parse(r.view) as Partial<PlanView>).status);
    storedState.set(`${r.repo}#${r.number}`, { state: r.state, wait: r.wait, head: r.head });
  }
  // `since` moves only when phase or wait does; recomputing it every pass would change every row's signature.
  for (const r of rows) {
    const old = storedStatus.get(`${r.repo}#${r.number}`);
    const v = JSON.parse(r.view) as PlanView;
    if (old && old.phase === v.status.phase && old.waiting === v.status.waiting && old.since !== v.status.since) r.view = JSON.stringify({ ...v, status: { ...v.status, since: old.since } });
  }
  const changed = rows.filter((r) => stored.get(`${r.repo}#${r.number}`) !== sig(r));
  const keep = new Set(rows.map((r) => `${r.repo}#${r.number}`));
  const gone = [...stored.keys()].filter((k) => !keep.has(k));
  if (!changed.length && !gone.length) return { written: 0, deleted: 0 };
  const put = db.prepare(`INSERT INTO main.item_plans (repo, number, kind, head, state, item_state, actions, wait, reasons, note, view, planned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (repo, number) DO UPDATE SET kind = excluded.kind, head = excluded.head, state = excluded.state, item_state = excluded.item_state,
      actions = excluded.actions, wait = excluded.wait, reasons = excluded.reasons, note = excluded.note, view = excluded.view, planned_at = excluded.planned_at`);
  const del = db.prepare("DELETE FROM main.item_plans WHERE repo = ? AND number = ?");
  const hist = db.prepare("INSERT INTO main.plan_history (repo, number, head, old_state, new_state, old_wait, wait, reasons, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const r of changed) {
      const old = storedState.get(`${r.repo}#${r.number}`);
      if (!old || old.state !== r.state || old.wait !== r.wait) hist.run(r.repo, r.number, r.head, old?.state ?? null, r.state, old?.wait ?? null, r.wait, r.reasons, plannedAt);
    }
    for (const r of changed) put.run(r.repo, r.number, r.kind, r.head, r.state, r.item_state, r.actions, r.wait, r.reasons, r.note, r.view, plannedAt);
    for (const k of gone) {
      const i = k.lastIndexOf("#"), repo = k.slice(0, i), number = Number(k.slice(i + 1)), old = storedState.get(k)!;
      // A row for the exit, so the item's return does not read as a first plan.
      hist.run(repo, number, old.head, old.state, "gone", old.wait, null, "[]", plannedAt);
      del.run(repo, number);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { written: changed.length, deleted: gone.length };
}

/** Plans decided and cached at once: the planner's own pass does this after every detection. */
export function refreshPlanCache(db: DatabaseSync, opts: PlanSetOptions = {}): { written: number; deleted: number } {
  return writePlanCache(db, loadPlanSet(db, opts));
}

export type PlanHistoryRow = { head: string | null; oldState: string | null; newState: string; oldWait: string | null; wait: string | null; reasons: string[]; at: string };

/** The state changes of an item's plan, oldest first. */
export function planHistory(db: DatabaseSync, repo: string, number: number): PlanHistoryRow[] {
  return (db.prepare("SELECT head, old_state, new_state, old_wait, wait, reasons, at FROM main.plan_history WHERE repo = ? AND number = ? ORDER BY id").all(repo, number) as
    { head: string | null; old_state: string | null; new_state: string; old_wait: string | null; wait: string | null; reasons: string; at: string }[])
    .map((r) => ({ head: r.head, oldState: r.old_state, newState: r.new_state, oldWait: r.old_wait, wait: r.wait, reasons: JSON.parse(r.reasons) as string[], at: r.at }));
}

/** Deletes plan history older than `keepMs` (the jobs' horizon). Returns the number of rows. */
export function prunePlanHistory(db: DatabaseSync, keepMs: number, nowMs: number = Date.now()): number {
  return Number(db.prepare("DELETE FROM main.plan_history WHERE at < ?").run(new Date(nowMs - keepMs).toISOString()).changes);
}
