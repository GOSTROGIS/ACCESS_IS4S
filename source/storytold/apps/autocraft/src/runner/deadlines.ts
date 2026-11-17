// The longest a job of a step may run. The bound comes from the code's own limits: every model call the job can make, at its
// prompt's time limit, times its attempts, plus the check tool's wall time for a patch call and a turn for each lint round,
// times the items of the job. The registry's `maxMin` (src/stages/registry.ts) is the floor from the history of finished jobs;
// the deadline is the larger of the two, so a job is never stopped while the code would still let it work.
import { CHECK_MAX_WALL_MS, LINT_MAX_ROUNDS } from "../core/rules.ts";
import { CLAUDE_PROMPTS, type ClaudePromptId } from "../prompts/index.ts";
import { AREAS_MAX, FINDINGS_PER_AREA_MAX } from "../security/rules.ts";
import { stepMaxMin } from "../stages/registry.ts";

/** One call per item. `lint`: follow-up turns of the same call (one per lint round). */
type Call = { id: ClaudePromptId; lint?: boolean };
/** `items`: the job's items when its params have no `limit`. */
type Plan = { calls: Call[]; items: number };

const item = (id: ClaudePromptId, lint = false): Call => ({ id, ...(lint && { lint }) });

/**
 * Steps whose job makes one call (or a few) per item. The others keep the registry's `maxMin`: the steps with no model call, and the
 * batched Jev and Haiku steps (classify, priority, duplicates), whose calls take seconds and have their own time limit each.
 */
export const STEP_PLANS: Record<string, Plan> = {
  referee: { calls: [item("referee.sonnet")], items: 100 },
  "dupes-compare": { calls: [item("dupes.compare-prs.opus"), item("dupes.compare-issues.sonnet")], items: 20 },
  decide: { calls: [item("decide.prepare")], items: 50 },
  conversation: { calls: [item("conversation.turn")], items: 30 },
  "areas-propose": { calls: [item("areas.propose")], items: 1 },
  "areas-suggest": { calls: [item("areas.suggest")], items: 1 },
  "opus-review": { calls: [item("review.opus")], items: 10 },
  premerge: { calls: [item("premerge.opus")], items: 10 },
  postmerge: { calls: [item("postmerge.opus")], items: 10 },
  fixup: { calls: [item("fixup.patch", true), item("fixup.conflict", true)], items: 5 },
  cifix: { calls: [item("cifix.patch", true)], items: 5 },
  "main-fix": { calls: [item("mainfix.classify"), item("cifix.patch", true)], items: 1 },
  fixissue: { calls: [item("fixissue.triage"), item("fixissue.patch", true)], items: 3 },
  verify: { calls: [item("verify.plan")], items: 10 },
  "verify-collect": { calls: [item("verify.summary")], items: 10 },
  // One threat model, then per area an audit and a verify of each finding it may report, and a scan test of each (feature scan-tests).
  "security-scan": { calls: [item("security.model"), ...Array.from({ length: AREAS_MAX }, () => item("security.area")), ...Array.from({ length: AREAS_MAX * FINDINGS_PER_AREA_MAX }, () => item("security.verify")), ...Array.from({ length: AREAS_MAX * FINDINGS_PER_AREA_MAX }, () => item("security.scantest"))], items: 1 },
  // A job holds one round: the review of a passed build and the next patch, or one patch. The build runs between jobs.
  "security-fix": { calls: [item("security.fix", true), item("security.fixcheck")], items: 1 },
};

/** Minutes one call can take: each attempt runs the first turn and the lint follow-ups at the prompt's time limit, and a patch call adds the check tool's wall time. */
function callMin(c: Call): number {
  const p = CLAUDE_PROMPTS[c.id];
  const turns = 1 + (c.lint ? LINT_MAX_ROUNDS : 0);
  const check = "sandbox" in p && p.sandbox && "check" in p.sandbox && p.sandbox.check ? CHECK_MAX_WALL_MS / 60_000 : 0;
  return p.limits.attempts * (turns * p.limits.timeoutSeconds / 60 + check);
}

/** The longest the code lets a job of `step` work with `items` items (default: the plan's), in minutes, or null for a step with no model call. */
export function stepBoundMin(step: string, items?: number): number | null {
  const plan = STEP_PLANS[step];
  if (!plan) return null;
  const n = items ?? plan.items;
  let total = 0;
  for (const c of plan.calls) {
    total += n * callMin(c);
  }
  return total;
}

/** Margin on the bound: a quarter and a few minutes for the work around the calls (git, GitHub, the database). */
const margin = (min: number): number => Math.ceil(min * 1.25) + 5;

/** The deadline of a job of `step` in minutes. `items`: the job's `limit` param, when it has one. */
export function stepDeadlineMin(step: string, items?: number): number {
  const bound = stepBoundMin(step, items);
  return Math.max(stepMaxMin(step), bound === null ? 0 : margin(bound));
}

/** The longest one model call of `step` can legitimately take, in minutes, or null for a step with no model call in STEP_PLANS. */
export function longestCallMin(step: string): number | null {
  const plan = STEP_PLANS[step];
  return plan ? Math.max(...plan.calls.map(callMin)) : null;
}

/** Minutes a job of `step` may show no progress (no new job log line): its longest single call plus 10; the registry floor for a step with no model call. */
export function stepNoProgressMin(step: string): number {
  const call = longestCallMin(step);
  return call === null ? stepMaxMin(step) : Math.ceil(call) + 10;
}
