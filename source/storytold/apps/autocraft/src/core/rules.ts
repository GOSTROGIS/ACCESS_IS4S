// Constants and pure helpers of the merge rule, shared by the old modules (which re-export them) and by decide.ts. No imports.

/** Type labels whose PRs may merge without asking. */
export const RULE_LABELS = ["bugfix", "infra"];
/** Sizes that may merge without asking. */
export const RULE_SIZES = ["S", "M"];
/** Tiers that count as on the whitelist. */
export type Tier = "whitelisted" | "not" | "allow" | "deny";
export const RULE_TIERS: Tier[] = ["whitelisted", "allow"];

/** Why an unsure Opus take is asked about instead of merged by the rule. */
export const UNSURE_REASON = "Opus was unsure";
export const PREMERGE_UNSURE_REASON = "the pre-merge review could not verify a claim of the description";
export const PREMERGE_DEFECT_REASON = "the pre-merge review found a defect";
export const PREMERGE_FAILED_REASON = "the pre-merge review failed";

/** Verification states that let a PR merge. */
export const VERIFY_OK = ["passed", "ci-enough"];
export const verifyOk = (state: string | null | undefined): boolean => !!state && VERIFY_OK.includes(state);
/** A PR in a repo Verify cannot build is merged only on an operator's answer, which says "not verified". */
export const VERIFY_UNAVAILABLE = "unavailable";
/** A failed or errored verification is asked about in the Merge? question; an operator's Merge answer given after the result stands (`override`, src/merge/verify-override.ts). */
export const verifyAllows = (path: "rule" | "operator" | null, state: string | null | undefined, override = false): boolean =>
  verifyOk(state) || (path === "operator" && (state === VERIFY_UNAVAILABLE || (override && (state === "failed" || state === "error"))));

/** A PR whose mergeable state stayed unknown for several checks reads is requested once from GitHub's REST endpoint (src/merge/mergeable.ts); a null answer asks a person. */
export const UNKNOWN_REREADS = 1;

/** A refusal caused by GitHub or the network, not by the PR: tried once more before a person is asked. */
export const TRANSIENT_REFUSAL = /\b5\d\d\b|timed? ?out|ETIMEDOUT|ECONN|EAI_AGAIN|rate limit|temporar|unavailable|bad gateway/i;

/** A merge refusal that only reports the state of CI, mergeable or the head: it clears when that state changes. Any other refusal is asked about. */
export const STATE_REFUSAL = /^(not ready at merge time|head moved|no longer open|GitHub returned no such PR|the operator's merge answer is gone|verification at)/;
export const ciAllows = (path: "rule" | "operator" | null, ci: string | null | undefined, noCi: boolean): boolean =>
  ci === "success" || (path === "operator" && ci === "none" && noCi);

export type Size = "S" | "M" | "L";
/** Same S and M bounds as the dashboard's size column; its L and XL are both L here. */
export function sizeOf(linesChanged: number): Size {
  return linesChanged <= 50 ? "S" : linesChanged <= 300 ? "M" : "L";
}

/** Type labels whose PRs get a code review; plugin candidates do not. */
export const REVIEW_LABELS = ["bugfix", "performance", "missing feature", "small extra", "infra"];
/** Scope answers that keep a PR in core (the keys of SCOPE_OPTIONS.take and ["small-extra"]). */
export const KEEP_IN_CORE: string[] = ["take", "small-extra"];

/**
 * A PR's type label once a person answered its scope question: the answer settles a label the classifiers left open
 * (a disagreement between two scope labels has no referee) or chose against it. Other answers leave the label as it is.
 */
export function labelWithScopeAnswer(label: string | null, answer: string | null): string | null {
  if (answer === "small-extra") return "small extra";
  if (answer === "take") return label && REVIEW_LABELS.includes(label) ? label : "missing feature";
  return label;
}

/** Approval attempts per CI run before the PR is left to a person. */
export const MAX_FAILURES = 2;
/** A failed head counts as failed after this many pre-merge tries. */
export const PREMERGE_MAX_TRIES = 3;
/** How long a failed try waits before the next one. */
export const RETRY_AFTER_MS = 3600_000;

/** Queue states a PR leaves for its batch's state while it is in a batch. */
export const BATCHABLE = ["ready", "decision-answered-merge", "refused", "waiting-ci"];
/** States that wait while the repo's main CI is red. */
export const MAIN_RED_HELD = ["ready", "decision-answered-merge", "refused"];

/** The queue's note for a conflicted PR, or null when nothing acts on it. */
export function conflictNote(bucket: string, base: string): string | null {
  switch (bucket) {
    case "merge": case "linting": return `conflict: merging ${base}`;
    case "ask": case "asked": return "conflict: asked the contributor";
    case "ask-retry": return "conflict: the ask comment is tried again";
    case "held": return "conflict: held";
    case "capped": return "conflict: merge cap for today reached";
    default: return null;
  }
}

/** Fix-up tries per PR (pushed, failed, refused or rejected) before the step leaves it to a person. */
export const FIXUP_MAX_ATTEMPTS = 2;
/** Lint rounds (a lint task on a stored model patch) per head before the patch is abandoned. */
export const LINT_MAX_ROUNDS = 2;
/** Base branch names a conflict merge accepts. */
export const BASE_NAME = /^[A-Za-z0-9._/-]+$/;

/** CI fix: tries per head, pushed fixes and tries per PR over all heads. */
export const CIFIX_MAX_TRIES = 2;
export const CIFIX_MAX_PUSHES_PER_PR = 2;
export const CIFIX_MAX_TRIES_PER_PR = 4;
/** Merges of the base branch into one PR per UTC day (pushed ones, over all heads); a busy base branch otherwise keeps a PR in a merge, check and review loop. */
export const CONFLICT_MAX_MERGES_PER_PR_PER_DAY = 2;
export const CIFIX_TRY_STATES = ["formatting", "linting", "superseded", "pushing", "pushed", "failed", "refused", "rejected"];
export const CIFIX_PUSH_STATES = ["pushing", "pushed"];
/** States that end the CI fix step's work at a head. */
/** A stored model patch waits for its lint task or for the collect step. */
export const LINT_STATE = "linting";
export const CIFIX_FINAL_STATES = ["pushed", "pushing", "asked", "push-denied", "cannot-push", "skipped", "comment-failed"];

/**
 * An ask comment that never reached GitHub (the app lane got no token, so no request went out) is recorded as
 * `comment-unsent` and asked again after these delays; one more unsent row past them is final, as `comment-failed` is.
 */
export const COMMENT_UNSENT_DELAYS_MS = [10 * 60_000, 60 * 60_000];
/** Where a head's unsent ask comments (`ats`: their rows' times, ISO) leave the next ask: due (null), due at `until` (ms), or final. */
export function unsentAsk(ats: readonly string[], nowMs: number): { until: number } | "final" | null {
  if (ats.length === 0) return null;
  if (ats.length > COMMENT_UNSENT_DELAYS_MS.length) return "final";
  const until = Math.max(...ats.map((a) => Date.parse(a))) + COMMENT_UNSENT_DELAYS_MS[ats.length - 1]!;
  return until > nowMs ? { until } : null;
}

// ---- merge decisions and their SQL (no imports) ----

/** The PR has an unanswered Merge? question at any head. */
export const OPEN_QUESTION_SQL = "SELECT 1 FROM decisions WHERE repo = ? AND number = ? AND kind = 'merge' AND answer IS NULL AND id NOT LIKE '%~replaced-%' LIMIT 1";

export const UNSURE_AT_SQL = `SELECT 1 FROM opus_review_history WHERE repo = ?1 AND number = ?2 AND head_oid = ?3 AND verdict IN ('take', 'take-fix') AND sure = 0
  UNION ALL SELECT 1 FROM opus_reviews WHERE repo = ?1 AND number = ?2 AND head_oid = ?3 AND verdict IN ('take', 'take-fix') AND sure = 0 LIMIT 1`;

/** SQL condition on `g` (a decisions row): a duplicate group decision that is unanswered or answered "keep #N instead" with the new roles not applied yet. */
export const OPEN_GROUP_SQL = `(g.kind = 'duplicate' AND g.id LIKE '%:dupegroup:%' AND (g.answer IS NULL
  OR (g.answer LIKE 'keep:%' AND COALESCE((SELECT dg.applied_answer FROM dupe_groups dg WHERE dg.decision_id = g.id), '') <> g.answer)))`;

/** Option keys of a "Merge this PR?" decision. Only an operator's answer counts. */
export const MERGE_OPTIONS = {
  merge: { key: "merge", label: "Merge", hint: "Merge once CI is green at this head commit." },
  hold: { key: "hold", label: "Hold", hint: "Keep it open and out of the merge queue." },
  close: { key: "close", label: "Close", hint: "Not wanted as it is; post a short comment and close the PR." },
} as const;

/** Options of the "Hold" question asked for a PR whose Opus review says hold. Review again, and a fix-up first, are offered as cores (src/decide/choices.ts). */
export const HOLD_OPTIONS = {
  wait: { key: "wait", label: "Wait for the author", hint: "Keep it open and leave it to the author; asked again after a new commit or review." },
  close: { key: "close", label: "Close", hint: "Not wanted as it is; post a short comment and close the PR." },
} as const;

/** One Hold question per PR head. */
export const holdDecisionId = (repo: string, number: number, head: string): string => `${repo}#${number}:hold@${head}`;

/** One open decision per PR head: a push gets a new one. */
export const mergeDecisionId = (repo: string, number: number, head: string): string => `${repo}#${number}:merge@${head}`;
export const HEAD_FACT = "head commit ";

/** Setting that holds the pipeline account's login, recorded wherever the pipeline pushes as that account. */
export const PIPELINE_LOGIN_KEY = "pipeline_login";

/** Build-tool (check) calls one patch-writing model call may make, and the wall time they may take in all. */
export const CHECK_MAX_CALLS = 6;
export const CHECK_MAX_WALL_MS = 45 * 60_000;
/** One check is stopped after CHECK_LIMIT_FACTOR times the repo's median recent duration of that command, clamped to [CHECK_LIMIT_MIN_MS, CHECK_LIMIT_MAX_MS]; without CHECK_HISTORY_MIN finished runs it gets the maximum. */
export const CHECK_LIMIT_FACTOR = 5;
export const CHECK_LIMIT_MIN_MS = 5 * 60_000;
export const CHECK_LIMIT_MAX_MS = 15 * 60_000;
export const CHECK_HISTORY_MIN = 3;
export const CHECK_HISTORY_RUNS = 20;
/** Lines of command output the tool returns to the model. */
export const CHECK_OUTPUT_LINES = 150;

/**
 * Value of the `pipeline_enabled` setting: "1" is on, "drain" is draining (no new jobs; jobs already running keep their writes),
 * anything else is off (running jobs stop writing).
 */
export const PIPELINE_DRAIN = "drain";
/** Whether a job's GitHub writes pass the pipeline switch: on, or draining. */
export const pipelineWrites = (value: string | undefined): boolean => value === "1" || value === PIPELINE_DRAIN;
