// The pipeline switch and the autopilot behind it. With the switch on, the
// runner looks for work whenever a content topic changed, a job finished or an
// operator released work (a 5-minute timer is only a fallback), and queues one
// job per stage that has work, no job of its own queued or running, and an
// item limit left for the day. A job that handled nothing is not queued again
// until the input it saw changes (its fingerprint); a failed job is retried
// after a short, growing backoff. Stages run in pipeline order; a failure in
// one does not stop the others. Turned off, no new jobs are queued and running
// jobs finish.
//
// The planner reads the database, writes only its Plan cache (item_plans) and queues jobs; the runner starts them.
// Each lane's `detect` reads the Plans of the pass (src/core/plan-set.ts).
import { RECOMMEND_RETRY_MS } from "../core/item-rules.ts";
import type { DatabaseSync } from "node:sqlite";
import type { PipelineState, StageLimit } from "../../web/src/api/types.ts";
import { readSeqs, TOPICS } from "../live.ts";
import { pendingConversations } from "../conversations/store.ts";
import { plannedItems, type PlannedItem } from "../core/select-items.ts";
import { loadPlanSet, type PlanSet } from "../core/plan-set.ts";
import { gates, type Want } from "../core/gates.ts";
import type { Action, ActionKind } from "../core/plan.ts";
import { writePlanCache } from "../core/plan-cache.ts";
import { refreshLiveness } from "../liveness.ts";
import { embedderId, modelName } from "../embed/model.ts";
import { embedDue } from "../embed/store.ts";
import { commentApprovalOf } from "../act/approval.ts";
import { selectFixups } from "../fixup/select.ts";
import { needsWork } from "../merge/ci-approval.ts";
import { batchesDue } from "../merge/batch-store.ts";
import { trackedNames } from "../repos.ts";
import { inFlightNow, planned, type Planned } from "../core/select.ts";
import { isQueueState } from "../core/plan.ts";
import { isWork } from "../core/assignment.ts";
import { postCandidates } from "../review/post.ts";
import { collectDue } from "../verify/results.ts";
import { featureOn } from "../build/features.ts";
import { nightlyRepos } from "../nightly/index.ts";
import { prBuildDue, reposWithQueuedBuilds } from "../prbuild/index.ts";
import { actLimit, actUsedToday } from "../conversations/usage.ts";
import { queueHead } from "../conversations/queue.ts";
import { compareKeys, targetKeys } from "../act/order.ts";
import { openedToday, perDay } from "../fixissue/index.ts";
import { audit } from "../dash/audit.ts";
import { defaultPerDay, lanesInOrder, limitSteps, zeroOnlySteps } from "../stages/registry.ts";
import { applyUsedAnswers } from "../decisions-used.ts";
import { premergeCandidates } from "../premerge/review.ts";
import { pendingDefects, selectPostmerge } from "../postmerge/select.ts";
import { mainFixDue } from "../mainfix/index.ts";
import { latestRun } from "../classify/settled.ts";
import { PIPELINE_DRAIN } from "../core/rules.ts";
import { DEADLINE_ERROR, enqueue, JobError, now, requestCancel, RUNNER_STOPPED } from "./jobs.ts";
import { claudePauseReason } from "../agents/accounts.ts";
import { tripReasonOfStep } from "../push-outcomes.ts";
import { STEP_STAGE } from "../core/push-outcome.ts";
import { jobBlock, stepParallel, type Active } from "./concurrency.ts";
import { knownStep, loadSteps, STEPS, modelsOf, usesClaude, type Params, type StepDef } from "./steps.ts";
import { pilotItems, scopeRepos } from "../pilot.ts";
import { refreshOutsideHolds } from "../outside.ts";
import { JUDGEMENT_MODELS, judgementModel } from "../decide/judgement.ts";
import { FAST_FLOOR, fastFirst, fastScoreOf } from "../fasttrack.ts";

/** Fallback only: the planner normally runs on a content change, a finished job or a release. */
export const PLAN_EVERY_MS = 5 * 60_000;
/** Failed jobs of a step are retried after 1, 2, 4, 8, 16 minutes, then every 30. */
export const FAIL_BACKOFF_MS = 60_000;
export const FAIL_BACKOFF_MAX_MS = 30 * 60_000;
/** Checks younger than this count as current for the review that follows. */
export const CHECKS_FRESH_MS = 5 * 60_000;
/** How often the CI and mergeable state of a repo with PRs waiting for CI (or an open batch PR) is read again. */
export const WAITING_CI_RECHECK_MS = 60_000;
export const AUTOPILOT_USER = "pipeline";

export const KEY_ENABLED = "pipeline_enabled";
const KEY_BY = "pipeline_changed_by", KEY_AT = "pipeline_changed_at";
const KEY_PLANNED_AT = "pipeline_planned_at", KEY_SEQS_SEEN = "pipeline_seqs_seen", KEY_WAKE_AT = "pipeline_wake_at", KEY_STATUS = "pipeline_status";
const KEY_CURSOR = "pipeline_review_cursor";
const KEY_VERIFY_CURSOR = "pipeline_verify_cursor";
const KEY_RESET = "limit_reset_at:";

const getSetting = (db: DatabaseSync, key: string): string | null =>
  (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
const setSetting = (db: DatabaseSync, key: string, value: string): void => {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
};

// ---- lanes ---------------------------------------------------------------------

/** The first (best-scored) planned PR of each repo. */
const firstByRepo = (items: Planned[]): Map<string, Planned> => {
  const out = new Map<string, Planned>();
  for (const p of items) if (!out.has(p.facts.repo)) out.set(p.facts.repo, p);
  return out;
};

/**
 * Repos with a PR of ours we broke come first, then repos with work of ours in flight, then the rest, each group in the given order:
 * a job takes one repo, so finishing what AutoCraft started beats starting new work.
 */
function flightFirst(plans: PlanSet, repos: string[]): string[] {
  const broke = new Set(plans.prs.filter((p) => p.facts.brokeByUs && p.plan.actions.some(isWork)).map((p) => p.facts.repo));
  const flying = new Set([...plans.prs, ...plans.items].filter((p) => p.plan.actions.some(isWork) && inFlightNow(p.facts, p.plan.state)).map((p) => p.facts.repo));
  const rank = (r: string): number => (broke.has(r) ? 0 : flying.has(r) ? 1 : 2);
  return [...repos].sort((a, b) => rank(a) - rank(b));
}

/** One job the autopilot may queue; `params` leaves out `limit`, which the planner sets. */
export type Candidate = {
  step: string; params: Params;
  /** Polls an external system (CI, GitHub, the sandbox): it may run again on unchanged inputs, at most once a minute. */
  poll?: boolean;
  /** Another job that must also be startable now, e.g. the review that follows a checks job. */
  gate?: { step: string; params: Params; poll?: boolean };
};
/** A pipeline stage in order. `detect` lists the jobs that have work, best first. */
export type Lane = {
  name: string;
  /** Every step the lane may queue. When none of them can start (busy, paused, limit reached, cooling down), the lane is not detected at all. */
  steps?: string[];
  /** Its jobs are per repo: the lane's jobs are judged one repo at a time. */
  perRepo?: boolean;
  /** The change topics the lane's input lives in (default: INPUT_TOPICS). A job that handled nothing is not queued again while these and `extra` are unchanged. */
  topics?: string[];
  /** Input that no topic reports, e.g. the state of sandbox tasks. */
  extra?: (db: DatabaseSync) => string;
  /** Least time between two of the lane's jobs: for cheap recomputes whose input moves in bursts (a sync writes in several transactions) and that no stage waits on. */
  minGapMs?: number;
  detect: (db: DatabaseSync, ctx: PlanCtx) => Candidate[];
  /** Work score of the lane's best item, null when it has none. Lanes that define it share capacity: see orderLanes(). */
  topScore?: (db: DatabaseSync, ctx: PlanCtx) => number | null;
  /** Runs when the candidate was queued; may write. */
  chosen?: (db: DatabaseSync, c: Candidate) => void;
};

/** What every lane's detect shares, resolved once per planner pass. */
export type PlanCtx = {
  run: string | null; tracked: string[];
  /** The Plans of the pass: facts loaded and decided once. Lanes read them; a lane run without them (a test) loads them on first use. */
  plans?: PlanSet;
  /** Times (ms) at which something the lanes wait for becomes due; the planner wakes at the earliest. */
  wake?: number[];
  /** Why a stage waits on an outside system (CI, the sandbox), keyed by step; shown on the Pipeline page. */
  notes?: Record<string, string>;
};

/** Only the repos in scope (pipeline on, narrowed by the pilot) are planned for; a job for another repo is never proposed. */
export const planCtx = (db: DatabaseSync): PlanCtx => {
  // The outside-author holds first: the facts below read them through the pilot condition (src/outside.ts).
  const wake: number[] = [];
  try {
    const outside = refreshOutsideHolds(db);
    if (outside.wakeAt !== null) wake.push(outside.wakeAt);
  } catch (e) {
    console.error(`autopilot: outside-author holds: ${(e as Error).message}`);
  }
  const scope = scopeRepos(db);
  const run = latestRun(db);
  return { run, tracked: trackedNames(db).filter((r) => scope.has(r)), plans: loadPlanSet(db, { run }), wake, notes: {} };
};

/** The pass's Plans (loaded on first use when the ctx came without). */
const plansOf = (db: DatabaseSync, ctx: PlanCtx): PlanSet => (ctx.plans ??= loadPlanSet(db, { run: ctx.run }));

/** Whether the guard would let the pipeline make the write an action stands for: the global switch and the repo's approval. */
const wantOf = (a: Action): Want => ({ kind: a.kind, ...(typeof a.params?.bucket === "string" ? { bucket: a.params.bucket } : {}) });
const allowed = <T extends { facts: Planned["facts"] | PlannedItem["facts"]; action: Action }>(ps: T[]): T[] =>
  ps.filter((p) => gates(p.facts, wantOf(p.action), "pipeline") === null);
/** The same test for a write that needs no per-item fact, judged on the repo's own facts. */
function repoAllows(plans: PlanSet, repo: string, want: Want): boolean {
  const f = plans.prs.find((p) => p.facts.repo === repo)?.facts ?? plans.items.find((p) => p.facts.repo === repo)?.facts;
  return !f || gates(f, want, "pipeline") === null;
}

/** Topics whose changes call for a plan: content the stages read. Job logs, usage, agent runs, sandbox environments and tasks, audit entries the item-trace bookkeeping and the limits topic (its tables are already read through the jobs topic) do not. */
export const INPUT_TOPICS = TOPICS.filter((t) => !["jobs", "usage", "agents", "envs", "tasks", "access", "github", "plans", "trace", "limits", "claims", "conversation-includes", "decision-choices", "decision-snooze", "security", "discord", "discord-links", "downloads", "build-features", "pr-builds", "nightly"].includes(t));

/** Sandbox tasks that ended, for lanes that read their results. */
const tasksSig = (db: DatabaseSync): string =>
  String((db.prepare("SELECT COUNT(*) AS n FROM main.build_tasks WHERE state IN ('done', 'failed', 'cancelled', 'lost')").get() as { n: number }).n);

/** Daily limits are not a topic of their own (they share `jobs`). */
const limitsSig = (db: DatabaseSync): string =>
  String((db.prepare("SELECT group_concat(step || '=' || COALESCE(per_day, 'n'), ',') AS s FROM (SELECT step, per_day FROM stage_limits ORDER BY step)").get() as { s: string | null }).s ?? "")
  + String((db.prepare(`SELECT group_concat(key || '=' || value, ',') AS s FROM (SELECT key, value FROM settings WHERE key LIKE '${KEY_RESET}%' OR key = 'step_parallel' ORDER BY key)`).get() as { s: string | null }).s ?? "");

const repoOf = (c: Candidate): string | null => (typeof c.params.repo === "string" ? c.params.repo : null);

type JobEnd = { id: number; endedAt: string; state: string; items: number | null; acted: number | null; lease_skips: number | null; lease_skip_keys: string | null };

function lastJobEnd(db: DatabaseSync, step: string, repo: string | null, requestedBy?: string): JobEnd | undefined {
  return db.prepare(`SELECT id, ended_at AS endedAt, state, items, acted, lease_skips, lease_skip_keys FROM jobs WHERE step = ? AND (? IS NULL OR repo = ?)
    AND ended_at IS NOT NULL AND (? IS NULL OR requested_by = ?) AND COALESCE(error, '') <> ? ORDER BY id DESC LIMIT 1`)
    .get(step, repo, repo, requestedBy ?? null, requestedBy ?? null, RUNNER_STOPPED) as JobEnd | undefined;
}

/** A job that changed nothing: it handled no items and made no other progress (a batch advanced, a PR opened, a decision asked). */
const wasIdle = (j: { items: number | null; acted: number | null }): boolean => !j.items && !j.acted;

// ---- fingerprints ----------------------------------------------------------------

type FpRecord = { job: number; fp: string };
const fpKey = (step: string, repo: string | null): string => `pipeline_fp:${step}|${repo ?? ""}`;

/** What the lane's input looked like: the step, its repo, and the counters of the topics it reads. */
export function fingerprintOf(db: DatabaseSync, lane: Pick<Lane, "topics" | "extra">, step: string, params: Params, seqs: Record<string, number> = readSeqs(db)): string {
  const topics = lane.topics ?? INPUT_TOPICS;
  return [step, typeof params.repo === "string" ? params.repo : "", ...topics.map((t) => seqs[t] ?? 0), lane.extra?.(db) ?? ""].join("|");
}

function fpRecord(db: DatabaseSync, step: string, repo: string | null): FpRecord | null {
  const v = getSetting(db, fpKey(step, repo));
  if (!v) return null;
  try { return JSON.parse(v) as FpRecord; } catch { return null; }
}

/** Tracked repos after `cursor` first, wrapping round. */
export function roundRobin(repos: string[], cursor: string | null): string[] {
  const sorted = [...repos].sort();
  const after = sorted.filter((r) => cursor !== null && r > cursor);
  return [...after, ...sorted.filter((r) => !after.includes(r))];
}

/** Per repo approved for fixing issues: whether a patch round is due and its first new candidate (highest score). */
function fixWork(db: DatabaseSync, tracked: string[], plans: PlanSet): Map<string, { retry: boolean; top?: { number: number; score: number | null } }> {
  const repos = new Set(tracked), out = new Map<string, { retry: boolean; top?: { number: number; score: number | null } }>();
  for (const p of allowed(plannedItems(db, "fixissue", { plans }))) {
    const { repo, number, score } = p.facts;
    if (!repos.has(repo)) continue;
    const w = out.get(repo) ?? out.set(repo, { retry: false }).get(repo)!;
    if (p.action.params?.source === "retry") w.retry = true;
    else w.top ??= { number, score };
  }
  return out;
}

/** The highest of the scores, null when there is none. */
export const bestScore = (scores: (number | null | undefined)[]): number | null => {
  const some = scores.filter((s): s is number => typeof s === "number");
  return some.length ? Math.max(...some) : null;
};

/**
 * Lanes that have a topScore trade places by it: the lane whose best item has the higher work score comes
 * first, so its job is queued first. A lane without work goes last; ties keep the pipeline order. Other
 * lanes keep their places.
 */
export function orderLanes<T extends { name: string }>(lanes: T[], tops: Map<string, number | null>): T[] {
  const shared = lanes.filter((l) => tops.has(l.name));
  const sorted = [...shared].sort((a, b) => (tops.get(b.name) ?? -1) - (tops.get(a.name) ?? -1));
  let k = 0;
  return lanes.map((l) => (tops.has(l.name) ? sorted[k++]! : l));
}

/** Repos with a CI-fix action of one of the buckets that the guard lets the pipeline carry out (rerun: CI approval; work and collect: a push, or a comment on a closed branch). */
function cifixRepos(db: DatabaseSync, ctx: PlanCtx, buckets: string[]): string[] {
  const repos = new Set(ctx.tracked);
  const due = allowed(planned(db, "cifix", { plans: plansOf(db, ctx) })).filter((p) => buckets.includes(String(p.action.params?.bucket)));
  return flightFirst(plansOf(db, ctx), [...new Set(due.map((p) => p.facts.repo))].filter((r) => repos.has(r)).sort());
}

/** The code of each lane, keyed by name. Names, steps and order come from the stage registry. */
const LANE_CODE: Omit<Lane, "steps">[] = [
  {
    name: "classify",
    detect: (db, ctx) => (ctx.run && plannedItems(db, "classify", { plans: plansOf(db, ctx) }).length ? [{ step: "classify-new", params: {} }] : []),
  },
  {
    // Items without a priority at their current text hash; the scores of the others are refreshed by the same job.
    name: "priority",
    detect: (db, ctx) => (plannedItems(db, "prioritize", { plans: plansOf(db, ctx) }).length ? [{ step: "prioritize", params: {} }] : []),
  },
  {
    // Work score from the stored priority, size, type and security flag; no model. It is cheap and has no work test of its own:
    // the fingerprint (items, fix triage, priorities; not its own output) decides whether its input moved.
    name: "rank",
    topics: INPUT_TOPICS.filter((t) => t !== "ranks"),
    extra: (db) => String((db.prepare("SELECT COUNT(*) || ':' || COALESCE(MAX(at), '') AS s FROM main.item_priority").get() as { s: string }).s),
    minGapMs: 60_000,
    detect: () => [{ step: "rank", params: {} }],
  },
  {
    name: "embed",
    detect: (db, ctx) => (embedDue(db, embedderId(modelName()), plansOf(db, ctx)) ? [{ step: "embed", params: {} }] : []),
  },
  {
    // Before Decide: items held as duplicates wait out the later stages.
    name: "dupes",
    detect: (db, ctx) => {
      const plans = plansOf(db, ctx);
      return plannedItems(db, "dupes", { plans }).length || plannedItems(db, "dupe-answer", { plans }).length ? [{ step: "dupes", params: {} }] : [];
    },
  },
  {
    // Each duplicate group is compared once its pairs are checked; the comparison asks the group decision.
    name: "dupes-compare",
    detect: (db, ctx) => (plannedItems(db, "dupes-compare", { plans: plansOf(db, ctx) }).length ? [{ step: "dupes-compare", params: {} }] : []),
  },
  {
    name: "decide",
    // Open scope decisions without a recommendation (asked before recommendations existed) also need a job; an answered-null one has recommended_by set.
    detect: (db, ctx) => {
      // A recommendation that failed is tried again once its backoff ends.
      for (const r of db.prepare("SELECT recommend_failed_at AS at FROM decisions WHERE answer IS NULL AND recommend_failed_at > ?").all(new Date(Date.now() - RECOMMEND_RETRY_MS).toISOString()) as { at: string }[]) ctx.wake?.push(Date.parse(r.at) + RECOMMEND_RETRY_MS);
      return plannedItems(db, "decide", { plans: plansOf(db, ctx) }).length ? [{ step: "decide", params: {} }] : [];
    },
  },
  {
    // One repo per job, round robin; the repo's checks come before its review.
    name: "review",
    perRepo: true,
    detect: (db, ctx) => {
      const out: Candidate[] = [];
      const top = firstByRepo(planned(db, "review", { plans: plansOf(db, ctx) }));
      // A PR waiting out the minimum time between reviews, the conflict merge cap or the backoff of an unsent comment is planned again when it ends.
      for (const p of plansOf(db, ctx).prs) {
        const f = p.facts;
        for (const t of [f.reviewHold?.until, f.conflict?.until, f.fixup?.unsent, f.cifix?.unsent, ...f.carry.map((c) => c.unsent)]) {
          const at = typeof t === "object" ? t.until : t;
          if (typeof at === "number") ctx.wake?.push(at);
        }
      }
      // No other stage re-reads the checks of a head that was stored as running or red: a PR whose review waits for CI has its repo's checks read again, at most once per WAITING_CI_RECHECK_MS.
      const ciWait = new Set(plansOf(db, ctx).prs.filter((p) => p.facts.reviewHold?.kind === "ci" && !p.facts.reviewHold.red && p.plan.wait === p.facts.reviewHold.wait).map((p) => p.facts.repo));
      for (const repo of flightFirst(plansOf(db, ctx), fastFirst(db, roundRobin(ctx.tracked, getSetting(db, KEY_CURSOR)), (r) => top.get(r)?.facts.number))) {
        if (!top.has(repo)) continue;
        const checks = lastJobEnd(db, "checks", repo);
        const fresh = checks?.state === "done" && Date.now() - Date.parse(checks.endedAt) < CHECKS_FRESH_MS;
        const review = { step: "opus-review", params: { repo } };
        out.push(fresh ? review : { step: "checks", params: { repo }, poll: true, gate: review });
      }
      // A repo whose waiting heads have all been pending for more than an hour is read every 5 minutes instead.
      const young = new Set(plansOf(db, ctx).prs.filter((p) => ciWait.has(p.facts.repo) && p.facts.reviewHold?.kind === "ci" && !p.facts.reviewHold.red)
        .filter((p) => { const u = (db.prepare("SELECT updated_at FROM items WHERE repo = ? AND number = ?").get(p.facts.repo, p.facts.number) as { updated_at: string | null } | undefined)?.updated_at; return !!u && Date.now() - Date.parse(u) <= 3600_000; })
        .map((p) => p.facts.repo));
      for (const repo of [...ciWait].sort()) {
        if (out.some((c) => c.params.repo === repo)) continue;
        const last = lastJobEnd(db, "checks", repo);
        const gap = young.has(repo) ? WAITING_CI_RECHECK_MS : 5 * 60_000;
        if (last && Date.now() - Date.parse(last.endedAt) < gap) {
          ctx.wake?.push(Date.parse(last.endedAt) + gap);
          continue;
        }
        out.push({ step: "checks", params: { repo }, poll: true });
      }
      return out;
    },
    topScore: (db, ctx) => {
      const top = firstByRepo(planned(db, "review", { plans: plansOf(db, ctx) }));
      return bestScore(ctx.tracked.map((repo) => top.get(repo)?.facts.score));
    },
    chosen: (db, c) => {
      if (c.step === "opus-review") setSetting(db, KEY_CURSOR, String(c.params.repo));
    },
  },
  {
    name: "labels",
    perRepo: true,
    detect: (db, ctx) => {
      if (!ctx.run) return [];
      const repos = new Set(allowed(plannedItems(db, "label", { plans: plansOf(db, ctx) })).map((p) => p.facts.repo));
      return ctx.tracked.filter((repo) => repos.has(repo)).map((repo) => ({ step: "labels-apply", params: { repo } }));
    },
  },
  {
    // Needs no merge approval: asking writes only decisions.
    name: "merge-ask",
    detect: (db, ctx) => {
      const repos = new Set(ctx.tracked);
      return allowed(planned(db, "ask-merge", { plans: plansOf(db, ctx) })).some((p) => repos.has(p.facts.repo)) ? [{ step: "merge-ask", params: {} }] : [];
    },
  },
  {
    // Batches in flight and PRs waiting for CI are external waits: they are read again every WAITING_CI_RECHECK_MS, on unchanged inputs too.
    name: "merge",
    perRepo: true,
    extra: tasksSig,
    detect: (db, ctx) => {
      const plans = plansOf(db, ctx);
      // The merge queue: PRs with a queue state (merged ones too), in repos approved for merging.
      const queue = plans.prs.filter((p) => p.facts.ghState !== "CLOSED" && isQueueState(p.plan.state) && p.facts.repoFacts.mergeApproved)
        .map((p) => ({ repo: p.facts.repo, number: p.facts.number, state: p.plan.state, eligible: p.plan.eligible }));
      const due = new Set(allowed(planned(db, "merge", { plans })).map((p) => p.facts.repo));
      const batches = new Set(batchesDue(db));
      const out: Candidate[] = [];
      // A merge job that advanced a batch runs again at once; one that only watched waits.
      const later = (step: string, repo: string): boolean => {
        const last = lastJobEnd(db, step, repo);
        if (last && (step === "checks" || wasIdle(last)) && Date.now() - Date.parse(last.endedAt) < WAITING_CI_RECHECK_MS) {
          ctx.wake?.push(Date.parse(last.endedAt) + WAITING_CI_RECHECK_MS);
          const n = queue.filter((e) => e.repo === repo && e.state === "waiting-ci").length;
          (ctx.notes ??= {})[step] = n ? `waiting for CI on ${n} PR${n === 1 ? "" : "s"} in ${repo}` : `waiting for the batch PR's CI in ${repo}`;
          return true;
        }
        return false;
      };
      // The repo whose eligible PR is fast-tracked first goes first.
      const topEligible = (r: string): number | undefined => queue.filter((e) => e.repo === r && e.eligible).sort((a, b) => (fastScoreOf(db, r, b.number) ?? -1) - (fastScoreOf(db, r, a.number) ?? -1))[0]?.number;
      for (const repo of flightFirst(plans, fastFirst(db, [...new Set([...due, ...batches])].sort(), topEligible))) {
        const poll = batches.has(repo);
        if (poll && later("merge", repo)) continue;
        out.push({ step: "merge", params: { repo }, ...(poll ? { poll } : {}) });
      }
      // No other stage refreshes a PR that waits only for CI or for GitHub to compute its mergeable state.
      const waiting = [...new Set(queue.filter((e) => e.state === "waiting-ci").map((e) => e.repo))].filter((repo) => !due.has(repo) && !batches.has(repo) && !later("checks", repo)).sort();
      for (const repo of waiting) out.push({ step: "checks", params: { repo }, poll: true, gate: { step: "merge", params: { repo }, poll: true } });
      return out;
    },
  },
  {
    // Comments and closes after operator answers, and Close? decisions for reviewed PRs.
    name: "act",
    perRepo: true,
    // Queued card presses: the drain runs when the first press fits under the daily limit, so the room (and the limit) is part of the input.
    extra: (db) => {
      const h = queueHead(db);
      return h ? `queue:${h.fits ? 1 : 0}:${actLimit(db) ?? "n"}` : "";
    },
    detect: (db, ctx) => {
      // Repos in the order of their best target: item priority level, then repos that Act served least recently (so one busy repo does not keep the shared daily limit), then the oldest answer.
      const best = new Map<string, { band: number; at: string }>();
      const targets = allowed(plannedItems(db, "act", { plans: plansOf(db, ctx) })).flatMap((p) => (typeof p.action.params?.decisionId === "string" ? [{ decisionId: p.action.params.decisionId, repo: p.facts.repo, number: p.facts.number }] : []));
      const keys = targetKeys(db, targets);
      for (const t of targets) {
        const k = keys.get(t.decisionId);
        if (k && (!best.has(t.repo) || compareKeys(k, best.get(t.repo)) < 0)) best.set(t.repo, k);
      }
      for (const p of allowed(plannedItems(db, "act", { plans: plansOf(db, ctx) }))) if (!best.has(p.facts.repo)) best.set(p.facts.repo, { band: 0, at: "" });
      // The press at the head of the queue is carried out by the job of its repo once it fits; until then the planner wakes at the next UTC midnight, when room returns.
      const head = queueHead(db);
      if (head && !head.fits) ctx.wake?.push(nextUtcMidnight(Date.now()));
      else if (head && ctx.tracked.includes(head.repo) && commentApprovalOf(db, head.repo)) best.set(head.repo, { band: 5, at: "" });
      const served = new Map(ctx.tracked.map((repo) => [repo, lastJobEnd(db, "act", repo)?.endedAt ?? ""]));
      return ctx.tracked.filter((repo) => best.has(repo)).sort((a, b) => best.get(b)!.band - best.get(a)!.band || (served.get(a)! < served.get(b)! ? -1 : served.get(a)! > served.get(b)! ? 1 : 0) || compareKeys(best.get(a), best.get(b)) || a.localeCompare(b)).map((repo) => ({ step: "act", params: { repo } }));
    },
  },
  {
    name: "fixup",
    perRepo: true,
    // A stored patch is collected when its lint task ends.
    extra: tasksSig,
    detect: (db, ctx) => {
      const plans = plansOf(db, ctx);
      const sels = new Map(ctx.tracked.map((repo) => [repo, selectFixups(db, repo, ctx.run, plans)]));
      const repos = ctx.tracked.filter((repo) => {
        const sel = sels.get(repo)!;
        const push = repoAllows(plans, repo, { kind: "fixup", bucket: "fix" }), ask = repoAllows(plans, repo, { kind: "fixup", bucket: "ask" });
        return (push && (sel.fix.length > 0 || sel.lint.length > 0 || sel.conflictMerge.length > 0)) || (ask && (sel.ask.length > 0 || sel.conflictAsk.length > 0));
      });
      return flightFirst(plans, fastFirst(db, repos.sort(), (r) => { const sel = sels.get(r)!; return (sel.lint[0] ?? sel.fix[0] ?? sel.ask[0] ?? sel.conflictMerge[0] ?? sel.conflictAsk[0])?.number; })).map((repo) => ({ step: "fixup", params: { repo } }));
    },
  },
  {
    // One repo per job, round robin; the repo's checks come before its planning.
    name: "verify",
    perRepo: true,
    extra: tasksSig,
    detect: (db, ctx) => {
      const out: Candidate[] = [];
      const plans = plansOf(db, ctx);
      const top = firstByRepo([...planned(db, "verify", { plans, bucket: "plan" }), ...planned(db, "verify", { plans, bucket: "unavailable" })]);
      for (const repo of flightFirst(plans, fastFirst(db, roundRobin(ctx.tracked, getSetting(db, KEY_VERIFY_CURSOR)), (r) => top.get(r)?.facts.number))) {
        if (!top.has(repo)) continue;
        const checks = lastJobEnd(db, "checks", repo);
        const fresh = checks?.state === "done" && Date.now() - Date.parse(checks.endedAt) < CHECKS_FRESH_MS;
        const verify = { step: "verify", params: { repo } };
        out.push(fresh ? verify : { step: "checks", params: { repo }, poll: true, gate: verify });
      }
      return out;
    },
    chosen: (db, c) => {
      if (c.step === "verify") setSetting(db, KEY_VERIFY_CURSOR, String(c.params.repo));
    },
  },
  {
    name: "verify-collect",
    extra: tasksSig,
    detect: (db) => (collectDue(db) ? [{ step: "verify-collect", params: {} }] : []),
  },
  {
    // Our own build of PR heads (pr-builds feature): queues new builds and collects finished ones, no model call. Off: no repo is detected.
    name: "pr-build",
    perRepo: true,
    extra: tasksSig,
    detect: (db, ctx) => [...new Set([...ctx.tracked, ...reposWithQueuedBuilds(db)])].filter((repo) => prBuildDue(db, repo)).sort().map((repo) => ({ step: "pr-build", params: { repo } })),
  },
  {
    name: "fixissue",
    perRepo: true,
    extra: tasksSig,
    detect: (db, ctx) => {
      const work = fixWork(db, ctx.tracked, plansOf(db, ctx));
      return flightFirst(plansOf(db, ctx), fastFirst(db, [...work.keys()].sort(), (r) => work.get(r)!.top?.number)).map((repo) => ({ step: "fixissue", params: { repo } }));
    },
    topScore: (db, ctx) => bestScore([...fixWork(db, ctx.tracked, plansOf(db, ctx)).values()].map((w) => w.top?.score)),
  },
  {
    name: "fixissue-collect",
    extra: tasksSig,
    // Finished build tasks, or a passed fix to open in a repo approved for fixing while the day's pull request limit has room.
    detect: (db, ctx) => {
      const due = plannedItems(db, "fixissue-collect", { plans: plansOf(db, ctx) });
      const opens = allowed(due).some((p) => p.action.params?.source === "passed") && openedToday(db, new Date()) < perDay(db);
      return due.some((p) => p.action.params?.source === "testing") || opens ? [{ step: "fixissue-collect", params: {} }] : [];
    },
  },
  {
    // Label disagreements outside the scope labels, after Jev and Haiku have both answered.
    name: "referee",
    detect: (db, ctx) => {
      // An item whose Opus call failed is asked again once its backoff ends.
      if (ctx.run) for (const r of db.prepare("SELECT json_extract(probs, '$.opusFailedAt') AS at FROM classifications WHERE classifier = 'sonnet' AND run_id = ? AND json_extract(probs, '$.opusFailedAt') > ?").all(ctx.run, new Date(Date.now() - RECOMMEND_RETRY_MS).toISOString()) as { at: string }[]) ctx.wake?.push(Date.parse(r.at) + RECOMMEND_RETRY_MS);
      return ctx.run && plannedItems(db, "referee", { plans: plansOf(db, ctx) }).length ? [{ step: "referee", params: {} }] : [];
    },
  },
  {
    // A review carried to our checked fix-up needs no model, so this runs while Claude is paused.
    name: "review-carry",
    perRepo: true,
    detect: (db, ctx) => {
      const due = new Set(planned(db, "carry", { plans: plansOf(db, ctx) }).map((p) => p.facts.repo));
      return ctx.tracked.filter((repo) => due.has(repo)).sort().map((repo) => ({ step: "review-carry", params: { repo } }));
    },
  },
  {
    // The final Opus reviews, posted as one PR review each in repos approved for comments.
    name: "review-post",
    perRepo: true,
    detect: (db, ctx) => {
      const due = new Set(allowed(planned(db, "post-review", { plans: plansOf(db, ctx) })).map((p) => p.facts.repo));
      return ctx.tracked.filter((repo) => due.has(repo)).sort().map((repo) => ({ step: "review-post", params: { repo } }));
    },
  },
  {
    // Operator messages in conversations; answered whether or not the item's repo is in scope, since an operator started them.
    name: "conversation",
    detect: (db) => (pendingConversations(db).length ? [{ step: "conversation", params: {} }] : []),
  },
  {
    // Runs GitHub holds for approval on reviewed outside PRs; the checks job records them, the step approves.
    name: "ci-approve",
    perRepo: true,
    detect: (db, ctx) => ctx.tracked.filter((repo) => repoAllows(plansOf(db, ctx), repo, { kind: "approve-ci" }) && needsWork(db, repo, ctx.run, plansOf(db, ctx)).length).sort().map((repo) => ({ step: "ci-approve", params: { repo } })),
  },
  {
    // Failing gate checks of wanted PRs: the log is read, a formatter run is queued or collected, or a patch is written and pushed.
    name: "cifix",
    perRepo: true,
    extra: tasksSig,
    detect: (db, ctx) => {
      // A stored patch whose lint task ended is collected by the same step.
      const lint = allowed(planned(db, "lint", { plans: plansOf(db, ctx), bucket: "cifix" })).map((p) => p.facts.repo).filter((r) => ctx.tracked.includes(r));
      return flightFirst(plansOf(db, ctx), [...new Set([...cifixRepos(db, ctx, ["work", "collect"]), ...lint])].sort()).map((repo) => ({ step: "cifix", params: { repo } }));
    },
  },
  {
    // The planner decides which items left the path to merge; this lane only carries out the unassign actions.
    name: "unassign",
    perRepo: true,
    detect: (db, ctx) => {
      const plans = plansOf(db, ctx), repos = new Set(ctx.tracked);
      const due = [...allowed(planned(db, "unassign", { plans })), ...allowed(plannedItems(db, "unassign", { plans }))];
      return [...new Set(due.map((p) => p.facts.repo))].filter((r) => repos.has(r)).sort().map((repo) => ({ step: "unassign", params: { repo } }));
    },
  },
  {
    name: "cifix-rerun",
    perRepo: true,
    detect: (db, ctx) => cifixRepos(db, ctx, ["rerun"]).map((repo) => ({ step: "cifix-rerun", params: { repo } })),
  },
  {
    // The adversarial review of each PR head the merge rule would merge; the queue holds the PR until it is stored.
    name: "premerge",
    perRepo: true,
    detect: (db, ctx) => {
      const repos = new Set(ctx.tracked);
      const due = new Set(premergeCandidates(db, { plans: plansOf(db, ctx), ...(ctx.wake ? { wake: ctx.wake } : {}) }).map((e) => e.repo));
      return [...due].filter((repo) => repos.has(repo)).sort().map((repo) => ({ step: "premerge", params: { repo } }));
    },
  },
  {
    // Opus reviews what each pipeline merge landed; reads only, so it needs no repo approval.
    name: "postmerge",
    perRepo: true,
    detect: (db, ctx) => ctx.tracked.filter((repo) => selectPostmerge(db, repo, Date.now(), ctx.run, plansOf(db, ctx)).length).sort().map((repo) => ({ step: "postmerge", params: { repo } })),
  },
  {
    // The defects of those reviews become issues in repos approved for comments.
    name: "postmerge-file",
    perRepo: true,
    detect: (db, { tracked }) => tracked.filter((repo) => commentApprovalOf(db, repo) && pendingDefects(db, repo).length).sort().map((repo) => ({ step: "postmerge-file", params: { repo } })),
  },
  {
    // A red default branch in a repo approved for it: flaky failures are rerun once, infrastructure failures become a decision, code failures are recorded.
    name: "main-fix",
    perRepo: true,
    // A rerun waits for the next reading of the head or a time limit; the clock moves with no change in the data.
    extra: (db) => {
      const n = (db.prepare("SELECT COUNT(*) AS n FROM main.main_fixes WHERE state = 'rerun-requested'").get() as { n: number }).n;
      return n ? `${n}:${Math.floor(Date.now() / 300_000)}` : "";
    },
    detect: (db, { tracked }) => tracked.filter((repo) => mainFixDue(db, repo)).sort().map((repo) => ({ step: "main-fix", params: { repo } })),
  },
  {
    // The nightly checks of repos with the build feature on: queued once a day per repo (in data, from the last run's time), collected when their tasks end.
    name: "nightly",
    perRepo: true,
    // The day's schedule moves with the clock, not with a change in the data.
    extra: (db) => (featureOn(db, "nightly") ? String(Math.floor(Date.now() / 3_600_000)) : ""),
    detect: (db, { tracked }) => nightlyRepos(db, tracked).map((repo) => ({ step: "nightly", params: { repo } })),
  },
];

export const LANES: Lane[] = buildLanes(LANE_CODE);

/** Every registry lane needs its code and every code entry a registry lane; a mismatch is a programming error. */
export function buildLanes(code: Omit<Lane, "steps">[]): Lane[] {
  const reg = lanesInOrder();
  const names = new Set(reg.map((l) => l.name));
  const missing = reg.filter((l) => !code.some((c) => c.name === l.name)).map((l) => l.name);
  const extra = code.filter((c) => !names.has(c.name)).map((c) => c.name);
  if (missing.length || extra.length) throw new Error(`autopilot lanes and the stage registry differ: no detect for [${missing}], no registry lane for [${extra}]`);
  return reg.map((l) => ({ ...code.find((c) => c.name === l.name)!, steps: l.steps }));
}

// ---- limits and usage ----------------------------------------------------------

export const dayStart = (ms: number = Date.now()): string => `${new Date(ms).toISOString().slice(0, 10)}T00:00:00.000Z`;

type LimitRow = { step: string; per_day: number | null; updated_by: string | null; updated_at: string | null };

/** Daily limits that apply until an operator sets one. */
export const DEFAULT_PER_DAY: Record<string, number> = defaultPerDay();

export const limitRow = (db: DatabaseSync, step: string): LimitRow =>
  (db.prepare("SELECT * FROM stage_limits WHERE step = ?").get(step) as LimitRow | undefined) ?? { step, per_day: DEFAULT_PER_DAY[step] ?? null, updated_by: null, updated_at: null };

/** Items handled by the step's jobs that started today (UTC) and after the operator's last reset of its count; for Act, also the GitHub writes of conversation cards. */
export function usageToday(db: DatabaseSync, step: string, ms: number = Date.now()): number {
  if (step === "act") return actUsedToday(db, ms);
  const day = dayStart(ms), reset = getSetting(db, KEY_RESET + step);
  return (db.prepare("SELECT COALESCE(SUM(items), 0) AS n FROM jobs WHERE step = ? AND started_at >= ?").get(step, reset && reset > day ? reset : day) as { n: number }).n;
}

/** The part of its `limit` that each queued or running job of the step has not used yet: the day's limit keeps it for them. */
export function reservedByJobs(db: DatabaseSync, step: string): number {
  const rows = db.prepare("SELECT params, items FROM jobs WHERE step = ? AND state IN ('queued', 'running')").all(step) as { params: string; items: number | null }[];
  let n = 0;
  for (const r of rows) {
    let limit: unknown;
    try { limit = (JSON.parse(r.params) as { limit?: unknown }).limit; } catch { continue; }
    if (typeof limit === "number") n += Math.max(0, limit - (r.items ?? 0));
  }
  return n;
}

/** The `limit` a job of the step may get (undefined when the step has none), or null when the day's limit leaves less than the step's minimum. `wanted` is a limit asked for (default: the step's). */
export function jobLimit(db: DatabaseSync, step: StepDef, ms: number = Date.now(), wanted?: number): { limit?: number } | null {
  const lp = step.params.find((p) => p.name === "limit" && p.kind === "int");
  if (!lp || lp.kind !== "int") return {};
  const perDay = limitRow(db, step.name).per_day;
  const limit = Math.min(wanted ?? lp.default ?? lp.max, lp.max, perDay === null ? Infinity : perDay - usageToday(db, step.name, ms) - reservedByJobs(db, step.name));
  return limit < lp.min ? null : { limit };
}

/**
 * Why a command-line run of the step cannot start now, or null: the gate() rules of the planner that are not pacing
 * (a job of the step for the same repo is queued or running, the step already works its most repos, a running job
 * holds the step's mutex, the daily limit, a pause).
 */
export function cliGate(db: DatabaseSync, step: { name: string }, steps: Map<string, StepDef>, params: Params = {}, ms: number = Date.now()): string | null {
  const busy = jobBlock(db, steps, { step: step.name, repo: typeof params.repo === "string" ? params.repo : null, number: typeof params.number === "number" ? params.number : null }, { mutex: true });
  if (busy) return busy;
  return pauseReason(db, step.name, ms, { backoff: false });
}

/** The steps an operator release (operator-actions.ts) hands new work to. */
const RELEASE_STEPS: Record<string, string[]> = {
  "batch-again": ["merge"], "review-again": ["opus-review"], "verify-again": ["verify"], "fix-again": ["fixissue"],
};

/** When an operator last released work for the step, or null. */
function releasedAt(db: DatabaseSync, step: string): string | null {
  const actions = Object.keys(RELEASE_STEPS).filter((a) => RELEASE_STEPS[a]!.includes(step));
  if (!actions.length) return null;
  return (db.prepare(`SELECT MAX(at) AS at FROM audit WHERE action IN (${actions.map(() => "?").join(", ")})`).get(...actions) as { at: string | null }).at;
}

/** The least wait after a job stopped for running past its deadline. */
export const DEADLINE_BACKOFF_MS = 3600_000;

/** Minutes-long wait after `failures` failed jobs in a row: 1, 2, 4, 8, 16 minutes, then 30. */
export const failureDelayMs = (failures: number): number => Math.min(FAIL_BACKOFF_MAX_MS, FAIL_BACKOFF_MS * 2 ** Math.max(0, failures - 1));

/**
 * Failed autopilot jobs of the step (of the repo, when given) since its last success: when it may run again, else null.
 * An operator release since the last failure ends it. After a single failure, so does a changed input (`fp` given and
 * different from the one the failed job saw); later failures wait out the backoff, because inputs that change every
 * minute would otherwise retry a failing step at once, every time. Jobs a runner restart ended do not count.
 */
export function failureBackoff(db: DatabaseSync, step: string, ms: number = Date.now(), o: { repo?: string | null; fp?: string } = {}): { until: number; failures: number } | null {
  const rows = db.prepare(`SELECT id, state, ended_at, error FROM jobs WHERE step = ? AND (? IS NULL OR repo = ?) AND requested_by = ? AND state IN ('done', 'failed')
    AND COALESCE(error, '') <> ? ORDER BY id DESC LIMIT 12`).all(step, o.repo ?? null, o.repo ?? null, AUTOPILOT_USER, RUNNER_STOPPED) as { id: number; state: string; ended_at: string | null; error: string | null }[];
  let failures = 0;
  while (failures < rows.length && rows[failures]!.state === "failed") failures++;
  if (!failures || !rows[0]!.ended_at) return null;
  const released = releasedAt(db, step);
  if (released && released > rows[0]!.ended_at) return null;
  // A job stopped for its deadline did paid work that a rerun would repeat: a changed input does not end the wait.
  const stopped = DEADLINE_ERROR.test(rows[0]!.error ?? "");
  if (o.fp !== undefined && failures === 1 && !stopped) {
    const rec = fpRecord(db, step, o.repo ?? null);
    if (rec && rec.job === rows[0]!.id && rec.fp !== o.fp) return null;
  }
  const until = Date.parse(rows[0]!.ended_at) + (stopped ? Math.max(DEADLINE_BACKOFF_MS, failureDelayMs(failures)) : failureDelayMs(failures));
  return until > ms ? { until, failures } : null;
}

const hhmm = (ms: number): string => `${new Date(ms).toISOString().slice(11, 16)} UTC`;

/** Why the stage cannot start jobs now, or null. The one place a stage's pause is decided. A step's models are taken at their defaults. */
export function pauseReason(db: DatabaseSync, step: string, ms: number = Date.now(), o: { backoff?: boolean } = {}): string | null {
  const l = limitRow(db, step), used = usageToday(db, step, ms);
  const tripped = tripReasonOfStep(db, step);
  if (tripped) return tripped;
  if (l.per_day === 0) return "paused: the daily limit is 0";
  if (l.per_day !== null && used >= l.per_day) return `daily limit of ${l.per_day} items reached; resumes at 00:00 UTC`;
  const b = o.backoff === false ? null : failureBackoff(db, step, ms);
  if (b !== null) return `failed ${b.failures} time${b.failures === 1 ? "" : "s"} in a row; retry at ${hhmm(b.until)}`;
  // Steps that call Claude (decide, opus-review, the Haiku part of classify-new) wait for an account with headroom.
  if (usesClaude(modelsOf(knownStep(step), {}))) return claudePauseReason(db, ms);
  return null;
}

// ---- state ---------------------------------------------------------------------

/** On: the planner queues jobs and the runner starts them. Draining and off are both not enabled. */
export const isEnabled = (db: DatabaseSync): boolean => getSetting(db, KEY_ENABLED) === "1";
/** Draining: like off for new work, but the writes of jobs already running go through. */
export const isDraining = (db: DatabaseSync): boolean => getSetting(db, KEY_ENABLED) === PIPELINE_DRAIN;

export function setEnabled(db: DatabaseSync, enabled: boolean, by: string, mode: "off" | "drain" = "off"): void {
  setSetting(db, KEY_ENABLED, enabled ? "1" : mode === "drain" ? PIPELINE_DRAIN : "0");
  setSetting(db, KEY_BY, by);
  setSetting(db, KEY_AT, now());
  // Automatic jobs still waiting are dropped; running ones finish.
  if (!enabled) {
    const waiting = db.prepare("SELECT id, step FROM jobs WHERE state = 'queued' AND requested_by = ?").all(AUTOPILOT_USER) as { id: number; step: string }[];
    for (const j of waiting) {
      requestCancel(db, j.id, by);
      audit(db, by, "job-cancel", `job:${j.id}`, { step: j.step, state: "queued", reason: "pipeline switched off" });
    }
  }
  // Turning on plans at once; the sync that already happened is not new.
  if (enabled) db.prepare("DELETE FROM settings WHERE key = ?").run(KEY_PLANNED_AT);
}

/** How many of the newest jobs deadlineStops looks at. */
const STOP_WINDOW = 5000;

/** Jobs the runner stopped for running past their step's limit that nobody has acknowledged and no later job of the step has beaten. */
export function deadlineStops(db: DatabaseSync): { step: string; jobId: number; error: string; endedAt: string; count: number }[] {
  const floor = Number((db.prepare("SELECT MAX(id) AS m FROM jobs").get() as { m: number | null }).m ?? 0) - STOP_WINDOW;
  const rows = db.prepare("SELECT step, id, error, ended_at AS endedAt FROM jobs WHERE id > ? AND state = 'failed' AND (error LIKE 'stopped: ran past %' OR error LIKE 'stopped: no progress for %') ORDER BY id DESC").all(floor) as { step: string; id: number; error: string; endedAt: string }[];
  const lastDone = db.prepare("SELECT MAX(id) AS m FROM jobs WHERE step = ? AND state = 'done'");
  // The acknowledgement is an audit row, which the header's query refetches on and the planner does not.
  const acked = db.prepare("SELECT MAX(at) AS at FROM audit WHERE action = 'deadline-ack' AND target = ?");
  const out: { step: string; jobId: number; error: string; endedAt: string; count: number }[] = [];
  const steps = [...new Set(rows.map((r) => r.step))];
  for (const step of steps) {
    const mine = rows.filter((r) => r.step === step), latest = mine[0]!;
    const done = Number((lastDone.get(step) as { m: number | null }).m ?? 0);
    if (done > latest.id) continue;
    const ack = (acked.get(`step:${step}`) as { at: string | null }).at;
    if (ack && ack >= latest.endedAt) continue;
    out.push({ step, jobId: latest.id, error: latest.error, endedAt: latest.endedAt, count: mine.filter((r) => r.id > done).length });
  }
  return out;
}

/** An operator acknowledges the deadline stops of a step: they leave the warnings until the next one. */
export function ackDeadline(db: DatabaseSync, step: string, by: string): void {
  audit(db, by, "deadline-ack", `step:${step}`, {});
}

/** Steps that have a row in stage_limits, in pipeline order. */
export const LIMIT_STEPS = limitSteps();

/** Steps whose jobs cannot be sized to what remains of the day: only no limit or a pause makes sense. */
export const ZERO_ONLY = zeroOnlySteps();

export class LimitError extends Error {
  status = 400;
}

export function setLimit(db: DatabaseSync, step: unknown, input: unknown, by: string): { perDay: number | null } {
  if (typeof step !== "string" || !LIMIT_STEPS.includes(step)) throw Object.assign(new LimitError("no such stage"), { status: 404 });
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new LimitError("the body must be a JSON object");
  const keys = Object.keys(input);
  if (keys.some((k) => k !== "perDay")) throw new LimitError("only perDay can be set");
  const perDay = (input as { perDay?: unknown }).perDay;
  if (perDay === undefined) throw new LimitError("perDay is required (null means no limit)");
  if (ZERO_ONLY.includes(step) && perDay !== null && perDay !== 0) throw new LimitError(`${step} cannot be sized by a daily limit: use none, or 0 to pause it`);
  if (perDay !== null && (typeof perDay !== "number" || !Number.isInteger(perDay) || perDay < 0 || perDay > 100_000)) throw new LimitError("perDay must be null or a whole number from 0 to 100000");
  db.prepare(`INSERT INTO stage_limits (step, per_day, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (step) DO UPDATE SET per_day = excluded.per_day, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .run(step, perDay, by, now());
  audit(db, by, "stage-limit", `step:${step}`, { perDay });
  return { perDay };
}

/** Starts today's count of one step (or of all) again from zero. */
export function resetLimitCount(db: DatabaseSync, step: unknown, by: string): { steps: string[] } {
  const steps = step === "all" ? LIMIT_STEPS : typeof step === "string" && LIMIT_STEPS.includes(step) ? [step] : null;
  if (!steps) throw Object.assign(new LimitError("no such stage"), { status: 404 });
  const at = now();
  for (const st of steps) setSetting(db, KEY_RESET + st, at);
  audit(db, by, "limit-reset", step === "all" ? "step:all" : `step:${step}`, { steps });
  return { steps };
}

/** What a stage is doing now: running, queued, or why it is not (the planner's last reading); null when unknown. */
function stepStatus(db: DatabaseSync, step: string, why: string | undefined): string | null {
  const j = db.prepare("SELECT state FROM jobs WHERE step = ? AND state IN ('running', 'queued') ORDER BY state = 'running' DESC LIMIT 1").get(step) as { state: string } | undefined;
  if (j) return j.state;
  return why ?? null;
}

export async function stageLimits(db: DatabaseSync): Promise<StageLimit[]> {
  const steps = await loadSteps();
  const why = stageStatus(db);
  return LIMIT_STEPS.map((step) => {
    const l = limitRow(db, step);
    return { step, title: steps.get(step)?.title ?? step, perDay: l.per_day, usedToday: usageToday(db, step), pausedReason: pauseReason(db, step), tripped: tripReasonOfStep(db, step) !== null ? STEP_STAGE[step] : undefined, status: stepStatus(db, step, why[step]) };
  });
}

export async function pipelineState(db: DatabaseSync): Promise<Omit<PipelineState, "outside">> {
  return {
    judgementModel: judgementModel(db), judgementModels: [...JUDGEMENT_MODELS],
    enabled: isEnabled(db), draining: isDraining(db), changedBy: getSetting(db, KEY_BY), changedAt: getSetting(db, KEY_AT),
    heartbeat: getSetting(db, "runner_heartbeat"), limits: await stageLimits(db), pilot: pilotItems(db),
  };
}

// ---- planner -------------------------------------------------------------------

export type PlanOptions = { lanes?: Lane[]; nowMs?: number; log?: (line: string) => void };

/** A job the detection pass wants queued; `params` include the `limit` the gate set. */
export type Proposal = { lane: string; step: string; params: Params; fp?: string; gate?: { step: string; params: Params } };
/** `wakeAt`: when a wait the pass found ends (ms), null when none. `status`: why each stage without a proposal is not starting. */
export type Detected = {
  proposals: Proposal[]; logs: string[]; wakeAt?: number | null; status?: Record<string, string>;
  /** Milliseconds the pass spent: loading and deciding the Plans, the lanes, writing the Plan cache; and the cache rows written and deleted. */
  timing?: { loadMs: number; lanesMs: number; cacheMs: number; written: number; deleted: number };
};

/** The fewest proposals one lane hands to apply: one per repo, in order, so that when the first is refused at enqueue (or the step is full at step_parallel) the next repo's goes in. */
const PROPOSALS_PER_LANE = 3;

const nextUtcMidnight = (ms: number): number => Date.parse(dayStart(ms)) + 86_400_000;

/**
 * Detection: loads and decides the Plans of every PR and item once, then returns, per lane, the candidates whose
 * step is idle, not backing off, not unchanged since a job that handled nothing, and has limit left. A lane is the
 * items whose Plan holds its action, minus what the guard would refuse (gates()). The only write is the Plan cache
 * (item_plans), so the runner can do it on another connection while it keeps polling; applyProposals() queues the result.
 * The order of the checks on a lane: a step of the lane can start (gate), the lane's items, the guard's gates() per
 * item or repo, the pipeline scope, then gate() per candidate: same-step job, pause and daily limit, failure backoff,
 * unchanged input, minimum gap.
 */
export async function detectAutopilot(db: DatabaseSync, opts: PlanOptions = {}): Promise<Detected> {
  const lanes = opts.lanes ?? LANES, ms = opts.nowMs ?? Date.now();
  const logs: string[] = [];
  const log = (l: string) => { logs.push(l); opts.log?.(l); };
  const steps = await loadSteps();
  const proposals: Proposal[] = [];
  const t0 = performance.now();
  const ctx = planCtx(db);
  const loadMs = performance.now() - t0;
  const scope = scopeRepos(db);
  const seqs = readSeqs(db);
  const status: Record<string, string> = {};
  const perLane = Math.max(PROPOSALS_PER_LANE, Math.min(stepParallel(db), 16));
  // Pause and limit do not change during the pass: one answer per step.
  const paused = new Map<string, string | null>();
  const limitLeft = new Map<string, { limit?: number } | null>();

  const pausedWhy = (stepName: string): string | null => {
    if (!paused.has(stepName)) {
      const why = pauseReason(db, stepName, ms, { backoff: false });
      paused.set(stepName, why);
      if (why) ctx.wake?.push(/daily limit/.test(why) ? nextUtcMidnight(ms) : ms + 60_000);
    }
    return paused.get(stepName)!;
  };
  const note = (stepName: string, why: string) => { status[stepName] ??= why; };

  /**
   * The job's `limit` (undefined when the step has none), or null when it cannot start now. With `lane`, the
   * input checks apply too: failure backoff and "nothing changed since a job that handled nothing".
   */
  const gate = (stepName: string, params: Params, lane?: Lane, poll = false, precheck = false): { limit?: number } | null => {
    const step = steps.get(stepName);
    if (!step) return null;
    const pending: Active[] = proposals.filter((p) => p.step === stepName).map((p) => ({ id: 0, step: p.step, state: "proposed", repo: typeof p.params.repo === "string" ? p.params.repo : null, number: typeof p.params.number === "number" ? p.params.number : null }));
    const repo0 = typeof params.repo === "string" ? params.repo : null;
    if (jobBlock(db, steps, { step: stepName, repo: repo0, number: typeof params.number === "number" ? params.number : null }, { extra: pending, precheck })) return null;
    const reason = pausedWhy(stepName);
    if (reason) { note(stepName, reason); return null; }
    if (lane) {
      const repo = typeof params.repo === "string" ? params.repo : null;
      const fp = fingerprintOf(db, lane, stepName, params, seqs);
      const b = failureBackoff(db, stepName, ms, { repo, fp });
      if (b) {
        ctx.wake?.push(b.until);
        note(stepName, `failed ${b.failures} time${b.failures === 1 ? "" : "s"} in a row; retry at ${hhmm(b.until)}`);
        const key = `${stepName}:${b.until}`;
        if (!warned.has(key)) { warned.add(key); log(`autopilot: ${stepName}: failed ${b.failures} times in a row; retry at ${hhmm(b.until)}`); }
        return null;
      }
      if (!poll && unchangedSinceIdle(db, stepName, repo, fp)) { note(stepName, "nothing to do: its input has not changed since the last run"); return null; }
      if (lane.minGapMs) {
        const last = lastJobEnd(db, stepName, repo, AUTOPILOT_USER);
        const next = last ? Date.parse(last.endedAt) + lane.minGapMs : 0;
        if (next > ms) { ctx.wake?.push(next); return null; }
      }
    }
    if (!limitLeft.has(stepName)) limitLeft.set(stepName, jobLimit(db, step, ms));
    return limitLeft.get(stepName)!;
  };

  const tops = new Map<string, number | null>();
  for (const lane of lanes) {
    if (!lane.topScore) continue;
    try { tops.set(lane.name, lane.topScore(db, ctx)); } catch (e) { log(`autopilot: ${lane.name}: ${(e as Error).message}`); }
  }
  for (const lane of orderLanes(lanes, tops)) {
    try {
      // A lane whose steps cannot start is not worth detecting.
      if (lane.steps && !lane.steps.some((s) => gate(s, {}, undefined, false, true))) continue;
      const candidates = lane.detect(db, ctx);
      if (!candidates.length) { for (const s of lane.steps ?? []) note(s, "nothing to do"); continue; }
      let taken = 0;
      for (const c of candidates) {
        const outside = [c, c.gate].find((x) => x && typeof x.params.repo === "string" && !scope.has(x.params.repo));
        if (outside) { note(outside.step, "outside the pipeline scope"); continue; }
        if (c.gate && !gate(c.gate.step, c.gate.params, lane, c.gate.poll)) continue;
        const g = gate(c.step, c.params, lane, c.poll);
        if (!g) continue;
        const params: Params = { ...c.params, ...(g.limit === undefined ? {} : { limit: g.limit }) };
        proposals.push({ lane: lane.name, step: c.step, params, fp: fingerprintOf(db, lane, c.step, c.params, seqs), ...(c.gate ? { gate: c.gate } : {}) });
        if (++taken >= perLane) break;
      }
    } catch (e) {
      log(`autopilot: ${lane.name}: ${(e as Error).message}`);
    }
  }
  // The lists the Next page shows come from the same pass, so the page needs no Plans of its own.
  if (!opts.lanes) {
    try { storeLaneItems(db, lanes, ctx); } catch (e) { log(`autopilot: next items: ${(e as Error).message}`); }
  }
  const lanesMs = performance.now() - t0 - loadMs;
  // The Plan cache: the planner's output for the dashboard.
  let cache = { written: 0, deleted: 0 };
  const t1 = performance.now();
  try { cache = writePlanCache(db, ctx.plans!); } catch (e) { log(`autopilot: plan cache: ${(e as Error).message}`); }
  const cacheMs = performance.now() - t1;
  // The liveness check follows the plan cache and stores its own result at most every few minutes.
  try { refreshLiveness(db); } catch (e) { log(`autopilot: liveness: ${(e as Error).message}`); }
  if (loadMs + lanesMs + cacheMs > 2000) log(`autopilot: pass took ${Math.round(loadMs + lanesMs + cacheMs)} ms: plans ${Math.round(loadMs)}, lanes ${Math.round(lanesMs)}, cache ${Math.round(cacheMs)} (${cache.written} rows written, ${cache.deleted} deleted)`);
  // A stage with a candidate the checks above held back says why; the others had no candidate or start now.
  Object.assign(status, ctx.notes ?? {});
  for (const p of proposals) delete status[p.step];
  const wakes = (ctx.wake ?? []).filter((t) => t > ms);
  return { proposals, logs, wakeAt: wakes.length ? Math.min(...wakes) : null, status, timing: { loadMs, lanesMs, cacheMs, ...cache } };
}

/** True when a running job holds a lease on one of the keys a job skipped (a job from before the keys were recorded: on any lease). */
function skippedLeaseHeld(db: DatabaseSync, keys: string | null): boolean {
  return !!db.prepare(`SELECT 1 FROM work_leases l JOIN jobs j ON j.id = l.job_id WHERE j.state = 'running'${keys ? " AND l.key IN (SELECT value FROM json_each(?))" : ""} LIMIT 1`).get(...(keys ? [keys] : []));
}

/** True when the last autopilot job of the step (and repo) handled nothing and saw the input `fp` still describes. An operator release since then ends it. */
function unchangedSinceIdle(db: DatabaseSync, step: string, repo: string | null, fp: string): boolean {
  const last = lastJobEnd(db, step, repo, AUTOPILOT_USER);
  if (!last || last.state !== "done" || !wasIdle(last)) return false;
  // A job that skipped items another job was working retries once no running job holds a lease on any of them. While one does, the step stays parked, so the planner does not queue it in a loop.
  if (last.lease_skips && !skippedLeaseHeld(db, last.lease_skip_keys)) return false;
  const rec = fpRecord(db, step, repo);
  if (!rec || rec.job !== last.id || rec.fp !== fp) return false;
  return !((releasedAt(db, step) ?? "") > last.endedAt);
}

const warned = new Set<string>();

/** Queues the proposals: per lane and repo the first one that is accepted. Returns the queued job ids. */
export async function applyProposals(db: DatabaseSync, proposals: Proposal[], opts: PlanOptions & { wakeAt?: number | null; status?: Record<string, string> } = {}): Promise<number[]> {
  const lanes = opts.lanes ?? LANES, log = opts.log ?? (() => {});
  const queued: number[] = [];
  const done = new Set<string>();
  // Jobs queued in this pass and the steps their proposals gate: they hold a repo of the step, so with step_parallel 1 no other repo takes it.
  const reserved: Active[] = [];
  const asActive = (step: string, params: Params, state: string): Active => ({ id: 0, step, state, repo: typeof params.repo === "string" ? params.repo : null, number: typeof params.number === "number" ? params.number : null });
  const steps = await loadSteps();
  try { applyUsedAnswers(db); } catch (e) { log(`autopilot: answers: ${(e as Error).message}`); }
  // Marks the next planner pass wants: when a wait ends, and why stages are not starting.
  if (opts.wakeAt) setSetting(db, KEY_WAKE_AT, new Date(opts.wakeAt).toISOString());
  else db.prepare("DELETE FROM settings WHERE key = ?").run(KEY_WAKE_AT);
  if (opts.status) setSetting(db, KEY_STATUS, JSON.stringify(opts.status));
  for (const p of proposals) {
    const slot = `${p.lane}\0${typeof p.params.repo === "string" ? p.params.repo : ""}`;
    if (done.has(slot)) continue;
    try {
      // The detection ran a moment ago: a job of the same step and repo may have been queued since.
      if (jobBlock(db, steps, { step: p.step, repo: typeof p.params.repo === "string" ? p.params.repo : null, number: typeof p.params.number === "number" ? p.params.number : null }, { reserved })) continue;
      if (p.gate && jobBlock(db, steps, { step: p.gate.step, repo: typeof p.gate.params.repo === "string" ? p.gate.params.repo : null }, { reserved })) continue;
      // The limit is what is left now, so two proposals of one step cannot both carry the whole remainder.
      const job = await enqueue(db, p.step, p.params, AUTOPILOT_USER, (step, params) => {
        if (typeof params.limit !== "number") return params;
        const lim = jobLimit(db, step, Date.now(), params.limit);
        return lim ? { ...params, ...lim } : null;
      });
      queued.push(job.id);
      reserved.push(asActive(p.step, p.params, "queued"));
      if (p.gate) reserved.push(asActive(p.gate.step, p.gate.params, "gated"));
      done.add(slot);
      if (p.fp !== undefined) setSetting(db, fpKey(p.step, typeof p.params.repo === "string" ? p.params.repo : null), JSON.stringify({ job: job.id, fp: p.fp } satisfies FpRecord));
      const c: Candidate = { step: p.step, params: Object.fromEntries(Object.entries(p.params).filter(([k]) => k !== "limit")) };
      lanes.find((l) => l.name === p.lane)?.chosen?.(db, c);
      log(`autopilot: job ${job.id}: ${p.step} ${JSON.stringify(job.params)}`);
    } catch (e) {
      if (!(e instanceof JobError)) {
        log(`autopilot: ${p.lane}: ${(e as Error).message}`);
        done.add(slot);
      } else log(`autopilot: ${p.step}: not queued: ${e.message}`);
    }
  }
  return queued;
}

/** Detection and queueing in one go, on one connection. */
export async function planAutopilot(db: DatabaseSync, opts: PlanOptions = {}): Promise<number[]> {
  const found = await detectAutopilot(db, opts);
  return applyProposals(db, found.proposals, { ...opts, wakeAt: found.wakeAt ?? null, ...(found.status ? { status: found.status } : {}) });
}

/** What the planner's marks say about the content stages read and the limits that apply to them. */
function inputSignature(db: DatabaseSync): string {
  const seqs = readSeqs(db);
  return [...INPUT_TOPICS.map((t) => seqs[t] ?? 0), limitsSig(db), tasksSig(db)].join(",");
}

/**
 * Whether the planner is due now (also with the switch off: the Plan cache must follow the data; the runner queues nothing then): a content topic changed, an autopilot job finished, an operator released
 * work, a wait the last pass found has ended, or the fallback timer ran out. Moves the planner's marks when
 * it is, so the caller must then plan.
 */
export function planDue(db: DatabaseSync, nowMs: number = Date.now()): boolean {
  const t = nowMs;
  const sig = inputSignature(db);
  const changed = sig !== (getSetting(db, KEY_SEQS_SEEN) ?? "");
  const plannedAt = getSetting(db, KEY_PLANNED_AT);
  const planned = plannedAt === null ? 0 : Date.parse(plannedAt);
  const wake = getSetting(db, KEY_WAKE_AT);
  const finished = db.prepare("SELECT 1 FROM jobs WHERE requested_by = ? AND ended_at > ?").get(AUTOPILOT_USER, plannedAt ?? "");
  const released = db.prepare(`SELECT 1 FROM audit WHERE action IN (${Object.keys(RELEASE_STEPS).map(() => "?").join(", ")}) AND at > ?`)
    .get(...Object.keys(RELEASE_STEPS), plannedAt ?? "");
  const woken = wake !== null && Date.parse(wake) <= t;
  if (!changed && plannedAt !== null && t - planned < PLAN_EVERY_MS && !finished && !released && !woken) return false;
  setSetting(db, KEY_SEQS_SEEN, sig);
  setSetting(db, KEY_PLANNED_AT, new Date(t).toISOString());
  // The pass about to run sets the next wake time when it is applied. With the switch off nothing is applied, so a
  // wake time that has passed would stay and make every tick plan again.
  if (woken) db.prepare("DELETE FROM settings WHERE key = ?").run(KEY_WAKE_AT);
  return true;
}

/** Why each stage is not starting, as the last planner pass saw it; keyed by step. */
export function stageStatus(db: DatabaseSync): Record<string, string> {
  try { return JSON.parse(getSetting(db, KEY_STATUS) ?? "{}") as Record<string, string>; } catch { return {}; }
}

// ---- what each lane will take next ----------------------------------------------

/** The plan actions whose items a lane's job works on, in the order the lane's own selection lists them. Lanes without items are absent. */
export const LANE_KINDS: Record<string, ActionKind[]> = {
  classify: ["classify"], priority: ["prioritize"], embed: ["embed"], dupes: ["dupes", "dupe-answer"], "dupes-compare": ["dupes-compare"], decide: ["decide"],
  review: ["review"], labels: ["label"], "merge-ask": ["ask-merge"], merge: ["merge"], act: ["act"], fixup: ["fixup", "conflict"], verify: ["verify"],
  fixissue: ["fixissue"], "fixissue-collect": ["fixissue-collect"], referee: ["referee"], "review-carry": ["carry"], "review-post": ["post-review"],
  "ci-approve": ["approve-ci"], cifix: ["cifix", "lint"], unassign: ["unassign"], premerge: ["premerge"],
};

/** Lanes whose jobs are not about listed items (counters, collection, operator messages, per-repo scans); every other lane needs a LANE_KINDS entry. */
export const NO_ITEM_LANES = ["rank", "verify-collect", "pr-build", "conversation", "postmerge", "postmerge-file", "main-fix", "cifix-rerun", "nightly"];

export type LaneItem = {
  repo: string; number: number; kind: "pr" | "issue"; action: string; bucket: string | null;
  fast: boolean; rank: number | null; inFlight: boolean;
  /** The next job of the lane covers this item's repo. */
  next: boolean;
  /** Why the guard would refuse the item's write, or null. */
  blocked: string | null;
  /** The decision the item's action carries out, when its params name one. */
  decisionId?: string;
};

/**
 * The items a lane's jobs work on, in the order its next jobs take them: the repos in the order `detect` lists
 * its candidates, and within a repo the order the planner's own selection (planned, plannedItems) gives. Items of
 * other repos follow. The dashboard's Next page reads this, so it cannot drift from what the autopilot picks.
 */
export function laneItems(db: DatabaseSync, ctx: PlanCtx, lane: Pick<Lane, "name" | "perRepo" | "detect">): LaneItem[] {
  const kinds = LANE_KINDS[lane.name];
  if (!kinds) return [];
  const plans = plansOf(db, ctx);
  const seen = new Set<string>(), all: LaneItem[] = [];
  const add = (f: Planned["facts"] | PlannedItem["facts"], state: string, a: Action) => {
    const ref = `${f.repo}#${f.number}`;
    if (seen.has(ref)) return;
    seen.add(ref);
    const refused = gates(f, wantOf(a), "pipeline");
    const blocked = !ctx.tracked.includes(f.repo) ? "outside the pipeline scope" : refused === "The pipeline is off" ? null : refused;
    const fast = (fastScoreOf(db, f.repo, f.number) ?? 0) >= FAST_FLOOR;
    all.push({
      repo: f.repo, number: f.number, kind: "kind" in f ? f.kind : "pr", action: a.kind, bucket: typeof a.params?.bucket === "string" ? a.params.bucket : null,
      fast, rank: f.score, inFlight: inFlightNow(f, state), next: false, blocked,
      ...(typeof a.params?.decisionId === "string" ? { decisionId: a.params.decisionId } : {}),
    });
  };
  for (const k of kinds) {
    for (const p of planned(db, k, { plans })) add(p.facts, p.plan.state, p.action);
    for (const p of plannedItems(db, k, { plans })) add(p.facts, p.plan.state, p.action);
  }
  const repos: string[] = [];
  for (const c of lane.detect(db, ctx)) { const r = repoOf(c); if (r && !repos.includes(r)) repos.push(r); }
  const picked = (i: LaneItem) => !lane.perRepo || repos.includes(i.repo);
  const first = lane.perRepo ? repos.flatMap((r) => all.filter((i) => i.repo === r)) : all;
  const rest = all.filter((i) => !first.includes(i));
  return [...first, ...rest].map((i) => ({ ...i, next: picked(i) && !i.blocked }));
}

const plain = (why: string): string => { const t = why.replace(/^(paused|tripped): /, ""); return t.charAt(0).toUpperCase() + t.slice(1); };

/** The most items of one lane the planner stores. */
const NEXT_PER_LANE = 500;
export type StoredLaneItems = Record<string, { total: number; items: LaneItem[] }>;

/** Writes each lane's items as this pass sees them: only the lanes that changed. The table belongs to the `plans` topic, which the planner does not take as input. */
function storeLaneItems(db: DatabaseSync, lanes: Lane[], ctx: PlanCtx): void {
  const old = new Map((db.prepare("SELECT lane, total, items FROM lane_next").all() as { lane: string; total: number; items: string }[]).map((r) => [r.lane, r]));
  const put = db.prepare("INSERT OR REPLACE INTO lane_next (lane, total, items, at) VALUES (?, ?, ?, ?)");
  const at = new Date().toISOString();
  for (const lane of lanes) {
    const all = laneItems(db, ctx, lane);
    const prev = old.get(lane.name);
    old.delete(lane.name);
    if (!all.length) { if (prev) db.prepare("DELETE FROM lane_next WHERE lane = ?").run(lane.name); continue; }
    const items = JSON.stringify(all.slice(0, NEXT_PER_LANE));
    if (!prev || prev.total !== all.length || prev.items !== items) put.run(lane.name, all.length, items, at);
  }
  for (const lane of old.keys()) db.prepare("DELETE FROM lane_next WHERE lane = ?").run(lane);
}

/** The lane lists of the planner's last pass, keyed by lane name. */
export function storedLaneItems(db: DatabaseSync): StoredLaneItems {
  const out: StoredLaneItems = {};
  for (const r of db.prepare("SELECT lane, total, items FROM lane_next").all() as { lane: string; total: number; items: string }[]) out[r.lane] = { total: r.total, items: JSON.parse(r.items) as LaneItem[] };
  return out;
}

/** The lanes that carry out the write of an answered decision: close and comment, merge, label, fix-up and issue fix. */
const HELD_LANES = ["act", "merge", "labels", "fixup", "fixissue"];

export type Held = { reason: string; approval: boolean };
/** Reads the stored lane lists once; call it once per request and ask per decision. */
export function heldLookup(db: DatabaseSync): (repo: string, number: number, decisionId?: string) => Held | null {
  const rows = new Map((db.prepare(`SELECT lane, total, items FROM lane_next WHERE lane IN (${HELD_LANES.map(() => "?").join(",")})`).all(...HELD_LANES) as { lane: string; total: number; items: string }[]).map((r) => [r.lane, r]));
  const parsed = new Map<string, LaneItem[]>();
  const gateOf = new Map<string, Held | null>();
  const laneHold = (name: string): Held | null => {
    if (!gateOf.has(name)) {
      const lane = LANES.find((l) => l.name === name);
      const g = lane ? laneGate(db, lane, new Map(STEPS.map((x) => [x.name, x]))) : null;
      gateOf.set(name, g && !g.canRun && g.kind !== "running" && g.why ? { reason: plain(g.why), approval: false } : null);
    }
    return gateOf.get(name)!;
  };
  return (repo, number, decisionId) => {
    for (const [name, row] of rows) {
      if (!parsed.has(name)) parsed.set(name, JSON.parse(row.items) as LaneItem[]);
      const items = parsed.get(name)!;
      const item = items.find((i) => i.repo === repo && i.number === number && (!i.decisionId || !decisionId || i.decisionId === decisionId));
      if (item) {
        if (item.blocked) return { reason: plain(item.blocked), approval: /not approved$/.test(item.blocked) };
        return laneHold(name);
      }
      // The stored list is capped: an item beyond it is judged by the lane's own gate alone.
      if (row.total > items.length && name === "act") { const h = laneHold(name); if (h) return h; }
    }
    return null;
  };
}

/**
 * Why no Act job will run for `repo` now, or null: the pipeline is off or draining, off for the repo, Act is tripped, or its daily limit is 0.
 * A reached daily limit is not a block: queued presses wait for it. Presses that cannot be carried out are refused with this reason instead of queued.
 */
export function actBlockedReason(db: DatabaseSync, repo: string): string | null {
  if (!isEnabled(db)) return isDraining(db) ? "the pipeline is draining" : "the pipeline is off";
  if (!scopeRepos(db).has(repo)) return `the pipeline is off for ${repo}`;
  const tripped = tripReasonOfStep(db, "act");
  if (tripped) return `Act is ${tripped}`;
  if (limitRow(db, "act").per_day === 0) return "the daily limit of Act is 0";
  return null;
}

export type LaneGate = { canRun: boolean; kind: "ok" | "running" | "off" | "breaker" | "limit" | "account" | "backoff"; why: string | null };

/** Whether a job of the lane can start now, from the same checks the planner's gate() makes. */
export function laneGate(db: DatabaseSync, lane: Pick<Lane, "steps">, allSteps: Map<string, StepDef>, ms: number = Date.now()): LaneGate {
  if (!isEnabled(db)) return { canRun: false, kind: "off", why: isDraining(db) ? "The pipeline is draining" : "The pipeline is off" };
  const steps = lane.steps ?? [];
  let blocked: LaneGate | null = null;
  for (const s of steps) {
    // Blocked only when no repo can start: the step already works its most repos.
    const full = jobBlock(db, allSteps, { step: s, repo: null }, { precheck: true });
    if (full) { blocked ??= { canRun: false, kind: "running", why: full.replace(/ \(step_parallel\)$/, "") }; continue; }
    const why = pauseReason(db, s, ms);
    if (!why) return { canRun: true, kind: "ok", why: null };
    const kind = /^tripped/.test(why) ? "breaker" : /daily limit/.test(why) ? "limit" : /^failed/.test(why) ? "backoff" : "account";
    blocked ??= { canRun: false, kind, why: plain(why) };
  }
  return blocked ?? { canRun: true, kind: "ok", why: null };
}
