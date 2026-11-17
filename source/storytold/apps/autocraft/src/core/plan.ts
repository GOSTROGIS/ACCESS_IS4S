// The vocabulary of a Plan: what state an item is in and which actions are due. No imports: the web build may use it.

/** Why an outside author's item waits for model work: over the author's daily budget, or created in a surge. */
export type OutsideHoldInfo = { reason: "limit" | "surge"; author: string; kind: "pr" | "issue"; /** The author's daily limit for the item's kind. */ limit: number };

/** Queue states of PRs that have a take or take-fix review at their current head (the merge queue's list). */
export const QUEUE_STATES = [
  "ready", "decision-answered-merge", "refused", "waiting-ci", "waiting-premerge", "ci-failed", "conflict",
  "needs-fix-up", "waiting-verify", "verify-failed", "verify-error", "needs-decision", "declined", "merged", "held-duplicate", "held-backlog",
  "batch-checking", "in-batch", "batch-failed", "ci-approval", "changes-requested", "waiting-main-ci",
] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

/** States of open PRs outside the merge queue. */
export const OTHER_PR_STATES = [
  "out-of-scope", // repo pipeline off or not a pilot item, and not fast-tracked
  "integration", // an integration batch PR the pipeline opened itself
  "pushed", // our push moved the PR off the head the mirror still shows: nothing is planned until a sync shows the new head
  "backlog", // a Backlog answer holds it (no take review at its head)
  "duplicate", // a duplicate decision holds it (no take review at its head)
  "draft", // a draft, or closed on GitHub, with no take review
  "opus-hold", // the review at the head says hold
  "opus-close", // the review at the head says close
  "review-stale", // reviewed, but the head moved or the discussion moved on: due a new review
  "label-not-reviewed", // its settled label is not one that gets a code review
  "scope", // waits for a scope answer (or the answer keeps it out of core)
  "not-reviewed", // no review yet: due a review
  "closed", // closed or merged on GitHub, outside the merge queue (post-merge review only)
] as const;

export const PLAN_STATES = [...QUEUE_STATES, ...OTHER_PR_STATES] as const;
export type PlanState = (typeof PLAN_STATES)[number];

export type ActionKind =
  | "review" | "carry" | "post-review" | "verify" | "approve-ci" | "premerge" | "ask-merge" | "merge"
  | "fixup" | "conflict" | "cifix" | "lint" | "postmerge"
  // item steps (issues and PRs)
  | "classify" | "referee" | "prioritize" | "embed" | "dupes" | "dupe-answer" | "dupes-compare" | "decide" | "label"
  | "act" | "fixissue" | "fixissue-collect"
  // the pipeline's account leaves an item that is off the path to merge (src/core/assignment.ts)
  | "unassign";

/** Who an item is assigned to as mirrored, and whether the last successful assign or unassign in the audit is our assignment of the pipeline account. `login`: the pipeline account (null when unknown: nothing is released). */
export type AssignFacts = { login: string | null; assignees: string[]; ours: boolean };

export type Action = { kind: ActionKind; head: string | null; params?: Record<string, unknown> };

/** Where a head's unsent ask comments leave the next ask (src/core/rules.ts unsentAsk); absent when it is due. */
export type UnsentAsk = { until: number } | "final";
export type LintFact = { step: "fixup" | "cifix" | "conflict"; source: "review" | "premerge" | "carry" | "operator"; ended: boolean };

/** Who a wait is on: a person at the repo (an operator or maintainer to approve or answer), the PR's contributor, or the system (CI, a sync, a model step, a timer). */
export type WaitKind = "person" | "contributor" | "system";

export type Plan = {
  repo: string; number: number; head: string | null;
  state: PlanState;
  /** How it may merge. */
  path: "rule" | "operator" | null;
  /** Why it is outside the merge rule, in the queue's wording. */
  reasons: string[];
  note: string | null;
  /** Every action due now, in priority order. */
  actions: Action[];
  /** The conflict-handling note ("conflict: merging main"); apart from `note`, which is the queue's own. */
  conflictNote: string | null;
  /** What it waits on when no main-path action is due. */
  wait: string | null;
  /** Who `wait` is on; null exactly when `wait` is. */
  waitKind: WaitKind | null;
  /** The merge rule or an operator's answer lets it merge now (a refused PR still counts while its retry waits for a change). */
  eligible: boolean;
};

export const isQueueState = (s: PlanState): s is QueueState => (QUEUE_STATES as readonly string[]).includes(s);

// ---- facts of a PR ----------------------------------------------------------------------------------------------
// The type lives here, not in facts.ts, so that decide.ts can use it without reaching node:*. facts.ts re-exports it.

export type PrTier = "whitelisted" | "not" | "allow" | "deny";

/** The latest Opus review of the PR (newest `at`, then rowid; any verdict). */
export type ReviewFacts = {
  head: string;
  at: string;
  verdict: string;
  /** Unsure at this head or anywhere in the chain of heads AutoCraft pushed it from: only an operator's Merge answer given after this review lets it merge. */
  unsure: boolean;
  mode: string | null;
  reason: string;
  /** Number of fixes the review lists. */
  fixes: number;
  /** The discussion moved on after the review read it, or an operator marked it stale (no daily cap). */
  stale: boolean;
  /** `stale` as the Review step counts it: a PR at its daily cap of discussion-triggered re-reviews is not due again. */
  staleActionable: boolean;
};

export type PrFacts = {
  repo: string; number: number;
  /** Time of the decision, ms. */
  now: number;
  /** The global pipeline switch. decide() ignores it; gates() applies it to the pipeline's own writes. */
  pipelineOn: boolean;
  /** Stages that stopped themselves (circuit breaker), by stage name (fixup, cifix, fixissue, merge): the reason. gates() refuses their writes. */
  tripped?: Partial<Record<string, string>>;
  /** A push of ours made the required checks at this head go red: CI fix works on it ahead of other work, even before a review of this head. */
  brokeByUs?: boolean;
  /** The head is new and its CI is red, and the PR has a take or take-fix review of an earlier head: CI fix works from that review and the contributor path is the normal one. */
  gateRed?: boolean;
  /** The head has no review, but the review of the earlier head carries to it (src/review/carry.ts): the Carry step stores it and no model reviews the head. */
  carriable?: boolean;
  /** Why a due review waits (src/review/gate.ts): an open blocker, CI at the head not finished or not passed, the PR's daily review cap, or the minimum time since its last review. */
  reviewHold?: { kind: "blocked" | "ci" | "cap" | "interval" | "failed"; wait: string; /** When a timed wait ends (ms). */ until?: number; /** A ci hold whose head's CI has failed. */ red?: boolean; person?: boolean };
  /** AutoCraft has its own work on this PR: one of its pushes (fix-up, CI fix, base merge) at or since the reviewed head, a stored lint patch, or the PR is our own fix PR. It ends when the PR is closed; selection also drops it while the plan waits on a person (see inFlightNow). */
  inFlight?: boolean;
  /** Our push moved this open PR off its mirrored head and no sync has run since (the mirror's updatedAt is not after the push). */
  pushedOff?: boolean;
  assignment: AssignFacts;
  /** GitHub state as mirrored. */
  ghState: "OPEN" | "MERGED" | "CLOSED";
  /** The PR's current head commit (checks fetched after the mirror's last update win over the mirror). */
  head: string | null;
  /** A draft, or not open on GitHub, as the freshest of mirror and checks says. */
  draft: boolean;
  author: string | null;
  authorIsPipeline: boolean;
  tier: PrTier;
  /** Closed PRs whose parts the pipeline carried onto this PR, with their authors' tiers. Carried code is held to its source authors' tiers, not the PR author's. */
  carriedFrom?: { number: number; author: string | null; tier: PrTier }[];
  lines: number;
  size: "S" | "M" | "L";
  /** Settled label of the current classification run. */
  label: string | null;
  needsDecisionFlag: boolean;
  /** The label was settled by a referee that was unsure (Opus, or Sonnet then Opus failing): the PR never takes the rule path. */
  labelUnsure?: boolean;
  /** The answer of the latest answered scope decision about the PR (a batch decision applies to its items). */
  scopeAnswer: string | null;

  // scope
  /** In scope: fast-tracked, or its repo's Pipeline switch is on and, with a pilot set, it is a pilot item. */
  inScope: boolean;
  /** Held for model work because its author is outside the team and over a limit or in a surge (src/outside.ts); such an item is not in scope. */
  outsideHold?: OutsideHoldInfo;
  /** An integration batch PR the pipeline opened itself. */
  integration: boolean;
  /** Any merge batch's own PR (without the author check). */
  batchPr: boolean;
  heldBacklog: boolean;
  /** Held by a duplicate decision (pair or group), not counting a Backlog answer. */
  heldDuplicate: boolean;
  /** The quiet pull request of a security fix that is not yet public: nothing is posted about it on GitHub. */
  quiet?: boolean;
  /** An operator holds its merge. */
  mergeHeld: boolean;
  fast: boolean;
  /** Fast-track score, else the rank score; null when unranked. Lanes order by it, highest first, then by number. */
  score: number | null;
  repoFacts: {
    mergeApproved: boolean; pushApproved: boolean; commentApproved: boolean; ciApproved: boolean;
    /** The repo has no CI at all. */
    noCi: boolean;
    /** The default branch's CI is red. */
    mainRed: boolean;
  };

  review: ReviewFacts | null;
  /** Posting the review: whether there is public text (or an earlier post to edit), and our earlier post. */
  post: { postable: boolean; posted: { head: string | null; at: string | null; opusAt: string | null } | null };

  // checks at the reviewed head
  /** The checks were fetched for the reviewed head. */
  checksHere: boolean;
  /** At the reviewed head: the checks say open and not a draft. */
  checksOpen: boolean;
  /** CI at the reviewed head with optional checks applied; "pending" while approved runs have not finished; "unknown" when the checks are of another head. */
  ci: string;
  mergeable: string;
  /** The mergeable state has read as unknown since `since`, and was read again `rereads` times (src/merge/mergeable.ts); null when it is known. */
  unknown: { since: string; reads: number; rereads: number; stuck: boolean } | null;
  /** Workflow runs waiting for approval at the head the checks describe (for an integration PR: at the batch tip). */
  runs: {
    waiting: number; reread: boolean; crossRepo: boolean; approvable: number;
    /** Why the pipeline does not approve them: the repo's CI approval is off, approving failed twice, or they are not runs it approves (not a fork's pull_request); null when it will. */
    blocked: "off" | "failed" | "unsupported" | null;
  } | null;

  /** The latest merge attempt at the reviewed head. */
  lastMerge: { outcome: string; reason: string | null; ci: string | null; mergeable: string | null; /** Refused tries at this head. */ refusals?: number } | null;
  /** Runs were approved after that attempt. */
  runsApprovedAfterMerge: boolean;
  /** An operator's Merge answer after the failed or errored verification of the head stands (src/merge/verify-override.ts). */
  verifyOverride: boolean;
  verification: { state: string; kind: string | null; summary: string | null; note: string | null } | null;
  /** Why Verify cannot build the repo (private, not Rust without CI), or null. */
  verifyUnavailable: string | null;

  decision: {
    /** A Merge? question exists at the reviewed head. */
    asked: boolean;
    /** An unanswered Merge? question exists at any head. */
    openQuestion: boolean;
    /** The operator answer at the reviewed head that counts (not yet applied, not Backlog). */
    answer: string | null;
    /** The operator's Merge answer was given after the review's `at`. */
    mergeAnswerAfterReview: boolean;
    /** Member of an open duplicate group (asked after the group is answered). */
    inOpenGroup: boolean;
    /** The Hold question of a review that says hold, at the reviewed head: asked at all, still unanswered, and the answer given. */
    hold: { asked: boolean; open: boolean; answer: string | null; /** Another open question of the item (scope, Merge?, Close?) is asked first. */ otherOpen: boolean };
  };

  /** The pre-merge review row at the reviewed head. */
  premerge: { at: string; tries: number; hasFindings: boolean; /** The review left a claim of the description unverified. */ unsure: boolean; defects: number; defectsAllFixable: boolean; /** Every defect's fix names a safe path, so a fix-up can apply them. */ fixesSafe: boolean; minor: number; error: string | null } | null;
  premergeFixUsed: boolean;
  /** Owner statements (owner_statements) that the Opus review or the pre-merge review at the reviewed head says the PR goes against; any makes the PR ask for a Merge? answer. */
  /** Reasons from the PR's diff that keep it off the merge rule (README, brand files, third-party links); read from the diff cache at the reviewed head, null when the diff is not cached. */
  sensitive: string[] | null;
  /**
   * The cached diff waits for what the merge rule reads beside it (whole files, workflow steps): `sensitive` holds the
   * conservative reasons, and the pre-merge step reads the diff again (no model call). `lastRead`: the last such re-read (ms);
   * `paceAt`: the earliest time the instance's re-read pace and the rate-limit pause allow the next one (ms).
   */
  diffPending?: { lastRead: number | null; paceAt?: number };
  statementConflicts: { id: number; where: string; text: string; reason: string }[];
  /** The PR's head branch may be pushed to (source of the maintainer flag follows `checksHere`). */
  pushable: boolean;
  /** Heads the PR was pushed from by AutoCraft, newest first, starting with the reviewed head. */
  pushChain: string[];
  /** For a conflicting open PR: what fix-up does and the base branch. */
  conflict: { bucket: string; base: string; /** The base branch name is one fix-up may merge. */ baseOk: boolean; /** When a capped bucket ends, or an ask-retry bucket's comment is due again (ms). */ until?: number } | null;
  /** Member of a merge batch that is checking or open, at any head. */
  inActiveBatch: boolean;
  /** Fix-up of a take-fix review at the current head: its usable fixes, the tries used and the final rows recorded at the head (fixups.state, no source). */
  fixup: { fixes: number; attempts: number; recorded: string[]; /** Ask comments at the head that never reached GitHub: the next one is due at `until` (ms), or the asks are final. */ unsent?: UnsentAsk } | null;
  /** Queued carry-over jobs of the duplicate groups (one per group decision) whose closed PRs left points to carry: tries used. */
  carry: { attempts: number; /** Its ask comment did not reach GitHub: the next is due at `until` (ms). */ unsent?: { until: number } }[];
  /**
   * An operator's fix-up (src/preapproval): `fix` is the queued one for the current head with the tries the PR's operator fix-ups used;
   * `hold` is true while a pre-approved merge waits for its fix-up, review or CI (or an operator fix-up request is still worked), so nothing merges or asks Merge? meanwhile.
   * `premerge` is true when the PR's pre-approved merge waits for the pre-merge review of this head.
   */
  operator?: { fix: { attempts: number } | null; hold: boolean; premerge: boolean };
  /** Stored model patches at the reviewed head whose lint task is queued, oldest first: `ended` once the task has a final state. A CI fix's source is `review`. */
  lint: LintFact[];
  /** CI fix state at the reviewed head, loaded while CI fails. */
  cifix: {
    /** ci_fixes states at the head, oldest first. */
    states: string[]; tries: number; rerunAt: string | null; infraRuns: number[] | null;
    formattingTask: number | null; formatterEnded: boolean;
    totalPushes: number; totalTries: number;
    /** The reason of the head's skipped CI fix (nothing to fix), or null. */
    skipReason: string | null;
    /** When the checks were fetched (ISO). */
    checksAt: string | null;
    /** Comments at the head that never reached GitHub, as on `fixup`. */
    unsent?: UnsentAsk;
  } | null;
  /** The pipeline merged the PR: when, and what the stored post-merge review looks like. */
  postmerge: { mergedAt: string; head: string | null; since: string; review: { at: string; error: string | null } | null } | null;
  /** The batch the reviewed head is in. */
  batch: "batch-checking" | "in-batch" | "batch-failed" | null;
  /** The PR is one AutoCraft opened to fix main CI. */
  mainFix: boolean;
  /** The PR's base is not its repository's default branch: it merges singly (into the base its review read), never in an integration batch. */
  baseOffDefault: boolean;
  /** The open PR of this repository whose head branch is this PR's base (a stacked PR); null when none. */
  stackedOn: number | null;
  /** A maintainer's formal block: why, and whether from a live read. */
  changesRequested: { why: string; live: boolean } | null;
  /** The note when live review reads failed several times in a row. */
  gateFailureNote: string | null;
  /** For a PR outside the pipeline's scope (no other review facts are loaded): what its stored rows say, enough for the Work page to name the step it waits on. */
  outside?: { review: string | null; verify: string | null; ci: string | null };
};

// ---- facts and plans of an item's triage steps (issues and PRs) -----------------------------------------------------

/** Where an open item stands in the triage steps (classify, referee, scope decision), in the order Work's next-step text checks them. */
export const ITEM_STATES = [
  "held-duplicate", // an open or accepted Duplicate? decision holds it
  "held-backlog", // a Backlog answer holds it
  "referee-due", // Jev and Haiku disagree, it is not a scope call, and the referee (Sonnet, then Opus when Sonnet was unsure) has not settled it
  "unclassified", // no Jev or Haiku verdict in the run
  "waiting-haiku", // Jev is unsure and Haiku has not given its second opinion
  "scope-open", // a scope decision about it waits for an answer
  "scope-due", // a scope decision is due (needs-decision flag, or a scope-vs-scope disagreement) and nobody asked yet
  "classified", // settled, nothing in the triage steps blocks it; later steps depend on its kind
] as const;
export type ItemState = (typeof ITEM_STATES)[number];

export type ItemFacts = {
  repo: string; number: number;
  kind: "pr" | "issue";
  /** Open on GitHub as mirrored. A closed item is in the facts only while an answered close of it is not applied (the Act step records it as already closed); nothing else is planned for it. */
  open: boolean;
  /** Time of the decision, ms. */
  now: number;
  /** Open item as the mirror says (the freshest-checks rule of PrFacts is for the PR path only). */
  draft: boolean;
  /** In scope: fast-tracked, or its repo's Pipeline switch is on and, with a pilot set, it is a pilot item. */
  inScope: boolean;
  /** Held for model work because its author is outside the team and over a limit or in a surge (src/outside.ts); such an item is not in scope. */
  outsideHold?: OutsideHoldInfo;
  /** An integration batch PR the pipeline opened itself. */
  integration: boolean;
  /** A Backlog answer or a duplicate decision (pair, group) holds it. */
  held: "backlog" | "duplicate" | null;
  fast: boolean;
  score: number | null;
  /** The global pipeline switch. decideItem ignores it; gates() applies it to the pipeline's own writes. */
  pipelineOn: boolean;
  /** As on PrFacts. */
  tripped?: Partial<Record<string, string>>;
  /** An open fix round for the issue (retry, testing or passed), or the item is our own fix PR. */
  inFlight?: boolean;
  assignment: AssignFacts;
  /** The repo's approvals for the writes below. decideItem does not apply them: gates() does. */
  repoFacts: { labelsApproved: boolean; commentApproved: boolean; fixIssueApproved: boolean };

  /** The classification run every step reads (the current run, else the newest verdict run). */
  run: string | null;
  classification: {
    /** The settled rule with the referee's answer applied. */
    status: "settled" | "waiting" | "disagree" | "unclassified";
    label: string | null;
    flags: string[];
    jevLabel: string | null; haikuLabel: string | null;
    referee: { sure: boolean; final: boolean; failedAt?: string | null } | null;
    /** Jev's verdict in the run: its time, whether the item's classifier input changed since, and whether Jev is unsure of the type or a flag. */
    jev: { at: string; changed: boolean; unsure: boolean } | null;
    /** Haiku's verdict in the run; `aloneCurrent`: it classified the item alone at its current input (that settles it without Jev). */
    haiku: { at: string; aloneCurrent: boolean } | null;
  };

  /** Hash of the item's embedded text (stored by sync, else computed). */
  embedHash: string;
  /** Hash of the stored vector of the current embedding model, null when there is none. */
  embeddedHash: string | null;
  /** Hash the priority row was made at. */
  priorityHash: string | null;
  /** Hash of the text at the item's last duplicate scan. */
  scannedHash: string | null;
  /** Unchecked duplicate pairs the item is in (pair rule: open on one side, text current, one side in scope). */
  pairsToCheck: number;
  /** Member of a duplicate group whose decision is due to be asked. */
  inGroupToAsk: boolean;
  /** Member of a duplicate kind-set that needs a comparison. */
  inCompareSet: boolean;
  /** Ids of the operator's duplicate answers (pair or group decisions) that concern the item and are not applied yet. */
  dupeAnswers: string[];

  scope: {
    /** An unanswered scope decision covers the item (its own or a batch's). */
    open: boolean;
    /** The answer of the latest answered scope decision covering the item. */
    answer: string | null;
    /** A decision exists that keeps Decide from asking again: any open decision, any scope decision (a maintainer answer that no longer counts excepted), any Backlog answer. */
    covered: boolean;
    /** One of its open decisions (any kind) has no prepare for its current state (src/decide/prepared.ts): failed tries so far at the current head and the time of the last failure. */
    recommend: { failures: number; failedAt: string | null } | null;
  };

  labels: {
    /** The item is the quiet pull request of a security fix that is still landing: it gets no `security` label. */
    quietFix?: boolean;
    /** Labels on GitHub as mirrored. */
    existing: string[];
    /** An operator answered the scope decision with "plugin". */
    pluginAnswer: boolean;
    /** The note of the item's latest "labeled" stage row ("added: a, b"). */
    labeledNote: string | null;
  };

  /** Operator answers "close" that the Act step applies to this item: one per decision, with the state of its action row (null: none yet; done and skipped are final). */
  answeredClose: { decisionId: string; kind: "scope" | "close" | "duplicate" | "merge" | "hold"; security: boolean; action: string | null; /** A member of a duplicate group decision: the Act step closes it, and its close record (not an actions row) ends the target. */ group?: boolean; /** The decision waits for its operator's token or access: no act action until it is retried or answered again. */ waiting?: boolean }[];
  /** The final Opus review at the PR's latest review head says close. `atHead`: that is the PR's current head. `asked`: the Close? decision at that head exists. */
  closeReview: { head: string; atHead: boolean; asked: boolean } | null;

  /** The Fix stage's view of an issue. */
  fix: {
    /** Its fix attempt. `textChanged`: the issue's title or body changed since the attempt (read only for a skipped attempt).
     *  `headDone`: the head build task is in a terminal state; `baseDone`: there is no base task or it is terminal. */
    attempt: { state: string; textChanged: boolean; headDone: boolean; baseDone: boolean } | null;
    publicRepo: boolean;
    /** The step found the repo has no Rust workspace at its root. */
    notRust: boolean;
    /** The open PR that holds the issue: one that closes or addresses it (`closes`), else a person's PR that mentions it by number; null when there is none. */
    openPr: { number: number; closes: boolean } | null;
    /** The priority row's impact level (P0 to P4). */
    impact: string | null;
    /** The latest scope decision about the issue itself, and whether an operator answered it. */
    scopeDecision: { answer: string | null; byOperator: boolean } | null;
  };
};

/** What is due for an open item in the triage steps. */
export type ItemPlan = {
  repo: string; number: number; kind: "pr" | "issue";
  state: ItemState;
  actions: Action[];
  /** What it waits on when no action is due. */
  wait: string | null;
  /** Who `wait` is on; null exactly when `wait` is. */
  waitKind: WaitKind | null;
};

/** The item's plans together: the triage plan, and for a PR the review-to-merge Plan; `actions` lists both, triage first. */
export type ItemView = {
  repo: string; number: number; kind: "pr" | "issue";
  head: string | null;
  item: ItemPlan;
  pr: Plan | null;
  actions: Action[];
  /** The Work page's next-step text. */
  next: string;
};
