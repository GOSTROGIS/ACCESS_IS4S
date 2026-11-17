// Wire types for the dashboard API. They mirror the server's tables
// (docs/dashboard-spec.md, Data) in camelCase.

import type { StageId } from "../../../src/stages/registry.ts";
export type RepoName = string;

export interface ItemRef {
  repo: RepoName;
  number: number;
}

export type ItemKind = "pr" | "issue";

/** What an item reference shows next to `repo#number`; null when the item is not in the mirror. */
export interface ItemShown {
  kind: ItemKind | null;
  state: ItemState | null;
  title: string | null;
}

export type DecisionKind = "scope" | "duplicate" | "close" | "merge" | "hold" | "split" | "other";

export interface OptionTexts {
  option: string;
  hash: string;
  texts: { number: number; step: "close" | "details" | "suggestion"; text: string }[];
}

export interface DecisionOption {
  key: string;
  label: string;
  /** One short line shown under the label on wide layouts. */
  hint?: string;
  /** What picking this option does on GitHub, e.g. "closes the PR on GitHub"; absent when it writes nothing. */
  writes?: string;
}

export type Relation = "duplicate-of" | "duplicated-by" | "links" | "overlaps" | "fixes";

export interface RelatedItem extends ItemRef {
  relation: Relation;
  title: string;
  state: ItemState;
  kind: ItemKind;
}

export type Classifier = "haiku" | "jev" | "sonnet" | "owner";
export type TypeLabel = "bugfix" | "performance" | "missing feature" | "small extra" | "plugin candidate" | "infra";
export type Want = "yes" | "no" | "unclear";

export interface Classification {
  classifier: Classifier;
  at: string;
  typeLabel: TypeLabel;
  want: Want;
  reference: string | null;
  reason: string;
  dupOf: number | null;
}

export interface Claim {
  login: string;
  since: string;
}

/**
 * A non-binding pick by anyone signed in. Shown to people with the giver's GitHub
 * permission on the repo; never read by the pipeline. The operator can adopt it.
 */
export interface Opinion {
  id: string;
  login: string;
  /** option key, or null for a note without a pick */
  option: string | null;
  note: string | null;
  at: string;
  permission: "write" | "none";
  /** Sent by an agent through the Inbox MCP server for this login. */
  via?: "mcp";
}

/** One item of a duplicate group decision, with the role the comparison gave it and the model's points about it, each shown whole. */
export interface DuplicateMember {
  number: number;
  kind: "pr" | "issue";
  role: "keep" | "close" | "stay";
  title: string | null;
  state: ItemState | null;
  /** What this item does better than the kept one. */
  better: string[];
  /** Parts worth carrying over into the kept one. */
  carry: string[];
  /** What it adds beyond the kept one. */
  adds: string[];
}

export type ExecState = "pending" | "waiting-token" | "waiting-permission" | "done" | "failed";

export interface Decision {
  id: string;
  kind: DecisionKind;
  repo: RepoName;
  /** null for a batch */
  number: number | null;
  items: (ItemRef & ItemShown)[];
  /** Kind, state and title of the item of a single decision; null for a batch. */
  shown: ItemShown | null;
  title: string;
  question: string;
  /** AI summary of the item or batch, 2–6 sentences. */
  summary: string;
  summaryBy: string;
  summaryAt: string;
  /** The issue or PR description (GitHub-flavoured Markdown); null for a batch. */
  body: string | null;
  context: string[];
  facts: string[];
  options: DecisionOption[];
  recommended: string;
  /** One sentence from the model that recommended it; empty when there is none. */
  recommendedReason: string;
  /** Duplicate group decisions: every member with its role; empty for other decisions. */
  group: DuplicateMember[];
  /** Merge? and Close? decisions: the review's risks, each whole; empty otherwise. */
  risks: string[];
  /** True while Undo still works: answered and not yet applied or posted. */
  undoable: boolean;
  /** The viewer may answer, undo their own answer and use Backlog on this decision: an operator, or a maintainer with write access where the app acts for them (setting `maintainer_writes`). */
  canSettle: boolean;
  /** The prepare step is writing this decision's options and recommendation (asked, or the PR got a push since the last prepare). */
  preparing: boolean;
  /** The choices are from an earlier prepare and the decision's prepares of the day are used up; Re-prepare updates them. */
  preparedEarlier?: boolean;
  /** Open and snoozed: out of the inbox until new activity on the item (a GitHub comment or push, a feedback post, an operator message), which clears it. */
  snoozed: { by: string; at: string } | null;
  publicText: string | null;
  /** Group decisions: per answer, the exact comments it posts and a hash of them that the answer sends back. */
  optionTexts: OptionTexts[];
  askedAt: string;
  askedBy: string;
  docket: string | null;
  answer: string | null;
  answerNote: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  appliedAt: string | null;
  /** The GitHub write of the answer while it is not done (repos on the app's identity only): waiting for the answering operator's sign-in or access, failed, or pending. null otherwise. */
  /** `approvalsRepo`: the repo whose approvals hold the write back, for operators who can change them. */
  exec: { state: ExecState; reason: string | null; approvalsRepo?: string } | null;
  /** Login of the person whose card is applying an answer to this open decision; nobody else may answer meanwhile. */
  settling?: string | null;
  /** The press that holds this open decision waits for room under the daily GitHub write limit: who pressed, the place in line (null while disputed), and a dispute of the press. */
  queued?: { card: number; by: string; place: number | null; reason: string; dispute: { by: string; reason: string; at: string } | null } | null;
  /** Someone disputed the answer before the pipeline applied it: the pipeline ignores it until the answerer or an operator keeps it or undoes it. */
  dispute?: { by: string; reason: string; at: string } | null;
  /** Answered, not applied, and the answerer can no longer settle (lost the role, or the setting is off): an operator reassigns it. */
  orphaned?: boolean;
  /** The opinion the operator adopted as the answer, if any. */
  adoptedOpinion: Opinion | null;
  opinions: Opinion[];
  exceptions: (ItemRef & { answer: string })[];
  claim: Claim | null;
  commentCount: number;
  related: RelatedItem[];
  classifications: Classification[];
  /** The item's area; null when it has none, absent in mocks. */
  area?: string | null;
  /** null or absent for a batch and before the item was rated. */
  priority?: PriorityInfo | null;
  /** Place in line for the item's next queued stage; null or absent when not queued and for a batch. */
  queue?: QueueSlot | null;
}

export interface DecisionComment {
  id: string;
  login: string;
  at: string;
  body: string;
  /** Sent by an agent through the Inbox MCP server for this login. */
  via?: "mcp";
}

export type ItemState = "open" | "merged" | "closed";
export type CiState = "passing" | "failing" | "pending" | "none";
export type Mergeable = "clean" | "conflicts" | "unknown";
export type Tier = "whitelisted" | "not" | "override-allow" | "override-deny";
export type Stage =
  | "classified"
  | "labeled"
  | "reviewed"
  | "take"
  | "hold"
  | "close"
  | "needs-decision"
  | "batched"
  | "merged"
  | "closed"
  | "fixed-by-us"
  | "verify-planned"
  | "verify-ci-enough"
  | "verify-error"
  | "verify-unavailable"
  | "verified"
  | "verify-failed";

export interface StageEntry {
  stage: Stage;
  at: string;
  by: string;
  note: string | null;
}

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
}

/** A GitHub comment or review on an item, from the mirror. Untrusted text: render as Markdown, never as HTML. */
export interface ItemComment {
  id: string;
  author: string;
  at: string;
  body: string;
  kind: "comment" | "review";
  /** reviews: APPROVED | CHANGES_REQUESTED | COMMENTED */
  reviewState: string | null;
}

/** Priority level, P0 (critical) to P4 (backlog). */
export type PriorityLevel = "P0" | "P1" | "P2" | "P3" | "P4";

/** Priority level of an item (src/priority). `model`: jev, haiku or jev-unsure. */
export interface PriorityInfo {
  level: PriorityLevel;
  model: string;
  reason: string | null;
}

export interface Item extends ItemRef {
  kind: ItemKind;
  title: string;
  body: string;
  state: ItemState;
  author: string;
  tier: Tier;
  authorMerged: number;
  authorClosedUnmerged: number;
  additions: number;
  deletions: number;
  /** PRs: how many files the PR changes, from the mirror; null when unknown. */
  changedFiles: number | null;
  /** Per-file changes; read per head by the activity sync; empty until it has read the PR (at most 100 files). */
  files: ChangedFile[];
  /** "none" also when the mirror has no check data for the item. */
  ci: CiState;
  ciChecks: { name: string; state: CiState; minutes: number | null }[];
  mergeable: Mergeable;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  mergedBy: string | null;
  /** Whether the repo's pipeline is switched on; absent in mocks that do not say. */
  pipelineOn?: boolean;
  related: RelatedItem[];
  classifications: Classification[];
  /** The item's area; null when it has none, absent in mocks. */
  area?: string | null;
  stages: StageEntry[];
  comments: ItemComment[];
  /** Explicit mentions in watched Discord channels; absent in mocks that have none. */
  discord?: DiscordInfo;
  decisionIds: string[];
  /** For the latest classification run. */
  settled: Settled;
  /** PRs: the Verify stage's result for the newest head it looked at; null when none. */
  verification: ItemVerification | null;
  /** PRs: our own build of the newest head; null when the pr-builds switch is off or there is none. Absent in mocks without one. */
  prBuild?: ItemPrBuild | null;
  /** PRs: the Fix-up step's tries, oldest first. */
  fixups: ItemFixup[];
  /** PRs the pipeline merged: the post-merge review; null or absent when there is none. */
  postmerge?: ItemPostmerge | null;
  /** PRs: the pre-merge review of every reviewed head, newest first; absent in mocks without one. */
  premerge?: ItemPremerge[];
  /** Opus checks of the patches we wrote for this item (Fix-up, Fix), oldest first. */
  patchChecks?: ItemPatchCheck[];
  /** PRs: the Opus review of the newest reviewed head, and the verdict later stages use; null before the first review. */
  reviews: ItemReviews | null;
  /** The Act step's GitHub writes after an operator's answer, oldest first. */
  actions: ItemAction[];
  /** Releases an operator can use on this item now (the item waits for a person). */
  releases: ItemReleases;
  /** null or absent before the item was rated. */
  priority?: PriorityInfo | null;
  /** Place in line for the item's next queued stage; null or absent when not queued. */
  queue?: QueueSlot | null;
  /** PRs: the newest pre-approved merge ("Fix-up for … then merge"); null or absent when there is none. */
  preapproval?: Preapproval | null;
}

/**
 * An operator's merge approval given ahead of a fix-up: the fix-up runs with the operator's instructions, a fresh review and CI
 * follow, and the PR goes to the merge queue only if the review says take and CI is green. Any other outcome asks a prepared question.
 * States: "fixup" (fix-up running or queued), "review" (waiting for the review of the fix-up's head), "ci" (review take, waiting for CI),
 * "queued" (in the merge queue), "merged", "asked" (review or CI did not pass: a new question was asked), "cancelled" (someone else
 * pushed, the PR closed, or an operator cancelled), "failed" (the fix-up could not push).
 */
export interface Preapproval {
  id: number;
  by: string;
  at: string;
  instructions: string;
  state: "fixup" | "review" | "ci" | "queued" | "merged" | "asked" | "cancelled" | "failed";
  /** The head the fix-up started from, and the head it pushed (null until it pushed). */
  fromHead: string;
  head: string | null;
  /** Why it ended in asked, cancelled or failed, one plain sentence. */
  reason: string | null;
  updatedAt: string;
}

export type VerificationKind = "ci-enough" | "tests" | "regression" | "error" | "unavailable";
export type VerificationState = "planned" | "running" | "passed" | "failed" | "error" | "ci-enough" | "stale" | "unavailable";
export interface ItemVerification {
  headSha: string;
  baseSha: string | null;
  /** False when the PR has a newer head than the one verified. */
  current: boolean;
  kind: VerificationKind;
  reason: string;
  /** Crates and test filters (kind tests), or the crate and size of the added regression test. */
  plan: { crates: string[]; tests: string[]; testLines: number | null } | null;
  state: VerificationState;
  summary: string | null;
  note: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** Head task first, then the base task of a regression. */
  tasks: { id: number; role: "head" | "base"; state: TaskState; results: TaskResult[]; endedAt: string | null }[];
}

/** Our own workspace build of a PR head: a second opinion beside upstream CI, never a merge gate. `disagree`: it failed while CI passed at the same head. */
export interface ItemPrBuild {
  headSha: string;
  /** False when the PR has a newer head than the one built. */
  current: boolean;
  state: "queued" | "running" | "passed" | "failed" | "error" | "stale";
  /** The failing step and exit code, or the error; null for viewers and for a pass. */
  summary: string | null;
  disagree: boolean;
  ci: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export type ReviewVerdictName = "take" | "take-fix" | "hold" | "close";

/** One reviewer's verdict on a head commit. */
export interface ReviewSide {
  verdict: ReviewVerdictName;
  reason: string;
  fixes: { file: string; change: string }[];
  risks: string[];
  at: string;
}

/**
 * The Opus review of a PR head. `opus` is null while the head has not been reviewed. `final` is the verdict every
 * later stage reads: Opus's. An unsure take or take-fix stays take or take-fix and never merges without an operator's answer.
 */
export interface ItemReviews {
  head: string;
  /** The head is the PR's current head. */
  current: boolean;
  opus: (ReviewSide & { sure: boolean; mode: "full" | "delta"; baseHead: string | null }) | null;
  final: { verdict: ReviewVerdictName; reason: string; decided: boolean };
  /** Earlier owner statements that the Opus or the pre-merge review at this head says the PR goes against. Such a PR is never merged without an operator's answer. */
  conflicts: {
    id: number; repo: RepoName; number: number | null; kind: ItemKind | null; state: ItemState | null;
    /** Title of the item the statement was said about; null when unknown. */
    title: string | null;
    /** The start of what was said. */
    excerpt: string;
    reason: string;
  }[];
}

export type PostmergeSeverity = "defect" | "minor";

/** What became of one finding: filed as an issue, or why it was not. */
export type PostmergeFiling =
  | { state: "filed"; issue: { number: number; url: string | null; state: ItemState | null; title: string | null } }
  | { state: "duplicate"; duplicateOf: number }
  | { state: "limit" }
  | { state: "minor" }
  | { state: "pending" }
  /** `gh issue create` was started and its answer is not recorded: the issue may exist. */
  | { state: "unknown" }
  | { state: "failed"; attempts: number }
  /** The file the finding cites is no longer on the default branch. */
  | { state: "stale" }
  /** The text names the product or the pipeline's account. */
  | { state: "refused" }
  /** Never filed automatically: `earlier` follow-ups of the PR exist, or `fix`: the PR itself fixes a follow-up issue. */
  | { state: "held"; reason: "earlier" | "fix" };

/** A follow-up issue filed for the PR by an earlier review of it. */
export type PostmergeEarlier =
  | { state: "filed"; title: string; issue: { number: number; url: string | null; state: ItemState | null; title: string | null } }
  | { state: "unknown"; title: string };

export interface PostmergeFinding {
  severity: PostmergeSeverity;
  title: string;
  /** Markdown, written for the public issue. */
  body: string;
  file: string | null;
  line: number | null;
  filing: PostmergeFiling;
  /** Internal notes: the stage that should have caught it and why it did not. Present only for operators and maintainers. */
  missedBy?: string | null;
  missedWhy?: string | null;
}

/** The post-merge review of a PR the pipeline merged. */
export interface ItemPostmerge {
  at: string;
  model: string | null;
  /** The commit the review read. */
  mergeSha: string;
  /** Why there is no review yet (for example too large to review); null when there is one. */
  error: string | null;
  findings: PostmergeFinding[];
  /** Follow-ups of earlier reviews of the PR. */
  earlier: PostmergeEarlier[];
}

/** One finding of the pre-merge review. */
export interface PremergeFinding {
  severity: "defect" | "minor";
  file: string;
  line: number;
  title: string;
  /** The input and the wrong result it leads to. */
  scenario: string;
  fix?: { file: string; change: string };
}

/** The pre-merge review of one PR head. */
export interface ItemPremerge {
  head: string;
  at: string;
  model: string | null;
  findings: PremergeFinding[];
  searched: string | null;
  /** Why the last try stored no review; null once a review is stored. */
  error: string | null;
  tries: number;
}

export type FixupState = "pushed" | "failed" | "refused" | "cannot-push" | "too-large" | "asked" | "rejected" | "push-denied" | "superseded" | "infra" | "rerun" | "rerunning" | "formatting" | "pushing" | "skipped" | "capped" | "comment-failed" | "comment-unsent";
/** The operator releases of an item: the last path segment of POST /api/items/:repo/:n/<action>. */
export type ReleaseAction = "review-again" | "verify-again" | "fix-again" | "batch-again";

/** Operator releases that apply to an item right now. */
export interface ItemReleases {
  /** A hold review at the current head can be cleared so the head is reviewed again. */
  reviewAgain: boolean;
  /** A failed or errored verification at the current head can be planned again. */
  verifyAgain: boolean;
  /** A skipped or failed fix attempt can be tried again. */
  fixAgain: boolean;
  /** A PR held by a failed single-PR batch at its current head can go through a batch again. */
  batchAgain: boolean;
}

export interface ItemPatchCheck {
  kind: "fixup" | "fixissue";
  /** The commit the patch applies to. */
  subject: string;
  patchHash: string;
  round: number;
  verdict: "approve" | "reject";
  reasons: string;
  problems: string[];
  model: string;
  createdAt: string;
}

export interface ItemFixup {
  /** ci-fix: a try of the CI fix kind (the head is the one whose check failed); absent for a review fix-up. */
  kind?: "ci-fix";
  fromHead: string;
  toHead: string | null;
  state: FixupState;
  reason: string | null;
  files: string[];
  attempt: number;
  createdAt: string;
}

export interface ItemAction {
  decisionId: string;
  /** Kind of the decision the action came from; null when that decision is gone. */
  decisionKind?: DecisionKind | null;
  kind: string;
  state: "done" | "skipped" | "failed";
  commentUrl: string | null;
  reason: string | null;
  createdAt: string;
}

/**
 * Settled type label for one classification run: Jev's label when its top
 * probability is at least 0.9, else Haiku's when Haiku agrees with Jev.
 * `waiting`: Jev unsure, Haiku hasn't answered; `disagree`: Haiku gave another label and the Sonnet referee is unsure or has not answered yet; a referee that is sure settles it.
 */
export type SettledStatus = "settled" | "waiting" | "disagree" | "unclassified";

export interface Settled {
  status: SettledStatus;
  /** Set only when `status` is `settled`. */
  label: TypeLabel | null;
  source: "jev" | "haiku" | "sonnet" | null;
  /** Jev's top probability. */
  confidence: number | null;
  jevLabel: TypeLabel | null;
  haikuLabel: TypeLabel | null;
  /** Jev's flags when Jev is sure, otherwise every flag either classifier raised. */
  flags: string[];
  /** The Sonnet referee's answer to a Jev/Haiku disagreement; settles the item when `sure`, else a person decides. */
  referee: { label: TypeLabel; sure: boolean; reason: string } | null;
}

/** Where a text query matched. `text` marks each match with U+0002 before and U+0003 after it. */
export interface Snippet {
  field: "title" | "body" | "comment";
  /** The comment's author. */
  author: string | null;
  text: string;
}

export type ItemSort = "relevance" | "updated" | "created" | "number" | "merged" | "discord";

/** `status: "unsettled"` stands for waiting and disagree together. */
export type StatusFilter = SettledStatus | "unsettled";

export interface ItemFilter {
  /** Full-text query: words (all must match), "quoted phrases", prefix*, -excluded, OR. */
  q?: string;
  /** Only `text`; other search modes may be added. */
  mode?: "text";
  repo?: RepoName[];
  kind?: ItemKind;
  /** Default `open`. */
  /** `merged-by-us`: PRs AutoCraft merged (its merge step or a merged batch), newest merge first. */
  state?: ItemState | "all" | "merged-by-us";
  /** Settled label. */
  label?: TypeLabel;
  status?: StatusFilter[];
  /** Every flag listed must be set. */
  flag?: string[];
  author?: string;
  /** Updated on or after this date (YYYY-MM-DD). */
  since?: string;
  /** Only items a watched Discord channel mentions. */
  discord?: boolean;
  /** A flowchart branch, `<node>.<branch>` (FlowNode.id, FlowBranch.id): only the items it counts. */
  flow?: string;
  /** Default `relevance` with a query, else `updated`. */
  sort?: ItemSort;
  /** Default true. */
  desc?: boolean;
  limit?: number;
  offset?: number;
  /** Classification run; default the latest. */
  run?: string;
}

export interface ItemListRow extends ItemRef {
  kind: ItemKind;
  state: ItemState;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  /** Messages in watched Discord channels that name the item. */
  discord?: number;
  settled: Settled;
  /** Latest pipeline stage. */
  stage: Stage | null;
  /** With a text query only. */
  snippet: Snippet | null;
  /** Place in line for the next queued stage; null when the next step is not queued. */
  queue?: QueueSlot | null;
  /** How AutoCraft merged a PR; null when it did not. */
  mergedHow?: "rule" | "operator" | "batch" | null;
  /** When AutoCraft merged it; set with `mergedHow`. */
  mergedAt?: string | null;
}

export interface ItemList {
  total: number;
  rows: ItemListRow[];
  /** Matches per settled status, under every filter except `status`. */
  byStatus: Record<SettledStatus, number>;
  run: string | null;
}

export interface SearchHit extends ItemRef {
  kind: ItemKind;
  title: string;
  author: string;
  state: ItemState;
}

export interface Done {
  mergedByPipeline: number;
  closedByPipeline: number;
  closedByOthers: number;
}

export interface Funnel {
  open: number;
  /** Settled type label (see `Settled`). */
  classified: number;
  /** Jev unsure, Haiku hasn't answered yet. */
  secondOpinion: number;
  /** Jev unsure and Haiku gave another label. */
  disagreement: number;
  reviewed: number;
  take: number;
  hold: number;
  close: number;
  waiting: number;
  batched: number;
}

export interface RepoProgress {
  repo: RepoName;
  funnel: Funnel;
  done: Done;
  decisionsOpen: number;
  /** open items at the end of each day since tracking began */
  openTrend: number[];
}

export interface Progress {
  /** When tracking began; done counts and trends start here. */
  trackingSince: string;
  now: string;
  funnel: Funnel;
  done: Done;
  /** items closed or merged per hour by anyone, oldest first, last 24 h */
  perHour: number[];
  /** the same, by the pipeline only */
  perHourPipeline: number[];
  decisionsOpen: number;
  decisionsAnsweredToday: number;
  repos: RepoProgress[];
  /** Repos per CI state of the default branch; the top bar shows it. */
  mainCi: MainCiSummary;
}

/** CI on a repo's default branch: red = a gate check failed; optional = only optional checks failed; none = no checks. */
export type MainCiState = "green" | "red" | "optional" | "running" | "none";
export type MainCiSummary = Record<MainCiState, number>;
export interface MainCiRepo {
  repo: RepoName;
  state: MainCiState;
  branch: string;
  headSha: string;
  headline: string | null;
  committedAt: string | null;
  /** The checks that failed at the head; url is the run's page. */
  failing: { name: string; url: string | null }[];
  /** When the culprit head turned red; null unless the head is red. */
  redSince: string | null;
  lastGreenSha: string | null;
  /** The first red head after the last green one, with the PR its message names. */
  culprit: { sha: string; headline: string | null; pr: number | null } | null;
  updatedAt: string;
  /** What AutoCraft is doing about the red head ("rerunning failed jobs", "asked an operator", "needs a fix", ...); null when nothing. */
  autocraft: string | null;
}
/** One open item the liveness check flags: `stuck` (nothing is due and nobody is asked) or `long` (live, but unchanged past the limit). */
export interface StuckItem {
  repo: RepoName;
  number: number;
  kind: "pr" | "issue";
  verdict: "stuck" | "long";
  /** Why it is stuck, or for a long item why it is live. */
  cause: string;
  state: string;
  wait: string | null;
  phase: string;
  /** When the plan state or wait last changed. */
  since: string;
  title: string | null;
}
/** GET /api/stuck. */
export interface StuckItems {
  checkedAt: string | null;
  open: number;
  stuck: number;
  long: number;
  items: StuckItem[];
}
/** GET /api/main-ci: red first, then optional, running, none, green; each group by name. */
export interface MainCi {
  summary: MainCiSummary;
  repos: MainCiRepo[];
}

export type Role = "operator" | "maintainer" | "viewer";

export interface User {
  login: string;
  role: Role;
  /** repos where GitHub grants write, maintain or admin */
  writeRepos: RepoName[];
  /** Deployment setting `maintainer_writes`: maintainers with write access settle decisions on repos that use the app's identity. */
  maintainerWrites: boolean;
}

export interface DecisionFilter {
  repo?: RepoName[];
  kind?: DecisionKind[];
  /** minimum age in days */
  minAge?: number;
  /** Every open question, not only the ones the person can settle (and the disputes they resolve). */
  all?: boolean;
  /** with exactly one `repo`: only decisions about this item (its own, or a group that lists it) */
  number?: number;
  /** "opinions": open decisions that have at least one opinion */
  /** "open" leaves out snoozed decisions; "snoozed" lists only them. */
  status?: "open" | "opinions" | "answered" | "backlog" | "snoozed";
  /** page size (server default 100, at most 500); `total` counts every match */
  limit?: number;
  /** the `next` of the previous page */
  after?: string;
  offset?: number;
}

export interface DecisionList {
  decisions: Decision[];
  total: number;
  byKind: Partial<Record<DecisionKind, number>>;
  oldestAskedAt: string | null;
  /** Cursor for the next page (`after`), or null on the last one. */
  next: string | null;
}

/** The requester's decisions inbox count, in total and per repo (a batch counts for each repo it names). */
export interface OpenDecisionCounts {
  total: number;
  byRepo: Record<string, number>;
}

export interface AnswerInput {
  /** An option key, or "handled" (operators; `note` required): closes the question with the note and writes nothing to GitHub. */
  answer: string;
  note?: string;
  exceptions?: (ItemRef & { answer: string })[];
  /** Group decisions: the hash of the shown comments for this answer. */
  textsHash?: string;
}

// ---- Contributors, Repos and Access (docs/dashboard-spec.md, Pages) ----

export type OverrideStatus = "allow" | "deny";

export interface WhitelistRule {
  minMerged: number;
  /** 0 to 1 */
  minRate: number;
}

export interface Contributor {
  login: string;
  /** Effective status: an override wins over the automatic tier. */
  tier: Tier;
  /** From merge history under the current rule, ignoring any override. */
  autoTier: "whitelisted" | "not";
  override: OverrideStatus | null;
  /** False for an allow given to another GitHub account than the one the login is bound to now (or to no recorded account). */
  overrideInEffect: boolean;
  /** Operators only; absent for everyone else. */
  overrideNote?: string | null;
  overrideBy: string | null;
  overrideAt: string | null;
  merged: number;
  closedUnmerged: number;
  open: number;
  /** merged / (merged + closed unmerged); null with no finished PRs */
  mergeRate: number | null;
  lastMerge: string | null;
  repos: RepoName[];
}

export type ContributorSort = "login" | "tier" | "merged" | "closed" | "open" | "rate" | "last" | "repos";

export interface ContributorFilter {
  /** part of the login */
  q?: string;
  tier?: Tier;
  repo?: RepoName;
  sort?: ContributorSort;
  desc?: boolean;
  /** page size (server default 50, at most 500) and offset */
  limit?: number;
  offset?: number;
}

export interface ContributorList {
  rule: WhitelistRule;
  /** rows matching every filter */
  total: number;
  /** authors matching `q` and `repo`, per effective tier (before the tier filter) */
  byTier: Record<Tier, number>;
  contributors: Contributor[];
}

/** What a whitelist rule would do, before it is saved. Counts are of every author. */
export interface RulePreview {
  rule: WhitelistRule;
  authors: number;
  /** allowed under the current rule: whitelisted by the rule or by an allow override */
  allowedNow: number;
  allowedAfter: number;
  /** status changes; overrides never change; at most 20 logins each, most merged first */
  gained: { count: number; logins: string[] };
  lost: { count: number; logins: string[] };
}

export interface OverrideInput {
  /** null clears the override */
  status: OverrideStatus | null;
  /** private note, at most 300 characters */
  note?: string;
}

/** The Label stage for one repo: approval and what the plan holds. */
export interface RepoApproval {
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface RepoLabels {
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  /** open items that would get labels */
  toAdd: number;
  /** open items with nothing to add: already labelled or not settled */
  skipped: number;
  /** open items with a different type label set by a person */
  conflicts: number;
}

export interface TrackedRepo {
  name: RepoName;
  /** GitHub org or user that owns the repo */
  owner: string;
  tracked: boolean;
  openPrs: number | null;
  openIssues: number | null;
  /** issue and PR rows in the mirror */
  mirrored: number;
  syncedAt: string | null;
  /** null for repos that are not tracked */
  labels: RepoLabels | null;
  /** Whether the pipeline may merge pull requests here; null for repos that are not tracked */
  merging: RepoApproval | null;
  /** Whether the Fix-up step may push to contributor branches here; null for repos that are not tracked */
  pushing: RepoApproval | null;
  /** Whether the Act step may comment on and close items here; null for repos that are not tracked */
  commenting: RepoApproval | null;
  /** Fix issues: pushes to the pipeline's fork and opens PRs and comments for issue fixes. */
  fixing: RepoApproval | null;
  /** Fix red main: reruns flaky failed jobs on a red default branch and opens an issue on an operator's answer. */
  mainFixing: RepoApproval | null;
  /** CI runs: approves the runs GitHub holds for reviewed outside pull requests. */
  ciApproving: RepoApproval | null;
  /** Checks whose failure does not stop a merge or turn main red; set by operators. Empty for repos that are not tracked. */
  optionalChecks: string[];
  /** Check names seen on the repo's recent PRs and default-branch heads. */
  seenChecks: string[];
  /** Whether the pipeline stages run on this repo; off means sync only. False for repos that are not tracked. */
  pipeline: boolean;
}

export interface AccessEntry {
  login: string;
  role: Role;
  addedBy: string | null;
  addedAt: string | null;
  note: string | null;
  /** active sessions */
  sessions: number;
}

export interface SessionInfo {
  id: number;
  login: string;
  createdAt: string;
  lastSeen: string;
  expiresAt: string;
  userAgent: string | null;
  /** the session making this request */
  current: boolean;
}

/** Messages that name the item. Links need the server's key file; the count does not. */
export interface DiscordInfo {
  count: number;
  links: { url: string; at: string }[];
  /** Messages that asked for attention on the item; the links are the same messages, newest first. */
  signals?: number;
  signalLinks?: { url: string; at: string }[];
}

export interface DiscordChannel {
  channelId: string;
  guildId: string;
  guildName: string | null;
  name: string | null;
  watched: boolean;
  /** Tracked repo whose new-issue page the bot's "File a new issue" button opens; null uses the top search result's repo. */
  defaultRepo: string | null;
  /** Name of the category the channel sits in; null when it has none. The list arrives in Discord's sidebar order. */
  category: string | null;
}

export interface DiscordSetup {
  /** `off` while the runner has not started the gateway client (no token file). */
  state: "off" | "connecting" | "connected" | "reconnecting" | "failed";
  detail: string | null;
  at: string | null;
  channels: DiscordChannel[];
  /** Tracked repos a channel's default can be. */
  repos: string[];
  contact: string;
  /** Whether the bot adds a reaction to messages it recorded against items. */
  reactOn: boolean;
  /** The public privacy page. */
  privacyPath: string;
  /** Linked Discord accounts: the opaque row id, the dashboard login and when. */
  links: { id: string; login: string; linkedAt: string }[];
}

/** A single-use code to type into the bot in Discord, and when it stops working. */
export interface DiscordLinkCode {
  code: string;
  expiresAt: string;
}

/** Whether the signed-in user has linked a Discord account. */
export interface DiscordAccount {
  linked: boolean;
  at: string | null;
  /** False when the server cannot make link codes, so the menu hides "Link Discord". */
  configured: boolean;
}

/** A live agent token of any login (operators see all of them). */
export type AccessToken = McpToken & { login: string };
export interface GithubAppStatus {
  /** The app's keys are in the secrets file. */
  configured: boolean;
  /** The instance-wide GitHub identity: the box account, or the GitHub App (writes and dashboard sign-in). */
  identity: "box" | "app";
  /** False when the server has no secrets file to keep the keys in. */
  canRegister: boolean;
  defaultName: string;
  /** The session's CSRF token, for the registration form. */
  csrf: string;
  /** The signed-in operator has let the app act as them; null when no app is registered. */
  authorized: boolean | null;
  app: { id: string; slug: string; name: string | null; installUrl: string; transferUrl: string } | null;
  /** Each account the app is installed on, with the repos it covers. */
  installations: { owner: string; selection: "all" | "selected"; repos: string[] }[];
  /** Org setup links that can still be used. */
  links: GithubSetupLink[];
  /** Set when GitHub could not be read. */
  error: string | null;
}

/** A one-time link for an organization's owner to set the app up; the link's URL is shown once, when it is created. */
export interface GithubSetupLink {
  id: string;
  org: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface AccessOverview {
  entries: AccessEntry[];
  sessions: SessionInfo[];
  tokens: AccessToken[];
}

export interface AuditEntry {
  at: string;
  login: string;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
}

export interface AuditFilter {
  /** the actor or the target */
  login?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

// ---- classifiers ----------------------------------------------------------

/** One run in which at least two classifiers judged the same items. */
export interface ClassifierRun {
  id: string;
  at: string;
  /** Pairs with items in both, `a` being the one with probabilities when only one has them. */
  pairs: { a: string; b: string; items: number }[];
}

export interface Agreement {
  n: number;
  agree: number;
}

export interface ConfidenceBand {
  /** Label such as "≥0.99" or "0.95–0.99". */
  band: string;
  n: number;
  agree: number;
  /** Items at or above this band's lower bound, and those that agree. */
  cumN: number;
  cumAgree: number;
}

export interface FlagAgreement {
  flag: string;
  n: number;
  agree: number;
  both: number;
  onlyA: number;
  onlyB: number;
}

export interface ClassifierReport {
  runs: ClassifierRun[];
  run: string;
  a: string;
  b: string;
  labels: string[];
  items: number;
  overall: Agreement;
  byKind: { pr: Agreement; issue: Agreement };
  /** Grouped by classifier `a`'s label. */
  byLabel: ({ label: string } & Agreement)[];
  byRepo: ({ repo: string } & Agreement)[];
  /** `confusion[i][j]`: `a` said labels[i], `b` said labels[j]. */
  confusion: number[][];
  /** Bands of classifier `a`'s top-label probability; empty when `a` recorded none. */
  bands: ConfidenceBand[];
  flags: FlagAgreement[];
}

export interface Disagreement {
  repo: string;
  number: number;
  kind: ItemKind;
  state: ItemState | null;
  title: string;
  a: { label: string | null; prob: number | null };
  b: { label: string | null; prob: number | null };
}

export interface DisagreementList {
  total: number;
  rows: Disagreement[];
}

export interface DisagreementFilter {
  run: string;
  a: string;
  b: string;
  /** Either classifier's label. */
  label?: string;
  /** A band label from `ClassifierReport.bands`. */
  band?: string;
  limit?: number;
  offset?: number;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  /** every action the log knows, for the filter */
  actions: string[];
}

// ---- run and cost ---------------------------------------------------------

export interface UsageTotals {
  calls: number;
  items: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Sum of the costs agents reported; null when none did. */
  usd: number | null;
  /** First start to last end, in seconds. */
  wallSeconds: number;
}

export interface CostReport {
  runs: { id: string; from: string; to: string }[];
  /** A run id, or "" for all runs. */
  run: string;
  total: UsageTotals;
  /** Distinct items with a classification in the run (or all runs); `total.items` counts an item once per model. */
  itemsClassified: number;
  stages: ({ stage: string; model: string } & UsageTotals)[];
  repos: ({ repo: string } & UsageTotals)[];
  /** Spend per time bucket; `bucket` is an ISO hour or day. */
  series: { bucket: string; tokens: number; usd: number | null }[];
  bucketSize: "hour" | "day";
}

// ---- pipeline (runner jobs, steps, the on/off switch and stage limits) ------------------------------

export type JobState = "queued" | "running" | "done" | "failed" | "cancelled";

/** A step parameter. Only enums, tracked repos, bounded whole numbers and run ids: never free text. */
export type StepParam =
  | { name: string; label: string; help?: string; required: boolean; kind: "enum"; options: string[]; default?: string }
  | { name: string; label: string; help?: string; required: boolean; kind: "repo"; options: string[] }
  | { name: string; label: string; help?: string; required: boolean; kind: "int"; min: number; max: number; default?: number }
  | { name: string; label: string; help?: string; required: boolean; kind: "run-id"; default?: string };

export type JobParams = Record<string, string | number>;

export interface JobUsage {
  /** Model calls (token_usage rows) made by the job. */
  calls: number;
  input: number;
  output: number;
  /** Sum of reported costs; null when no call reported one. */
  costUsd: number | null;
}

export interface Job {
  id: number;
  step: string;
  params: JobParams;
  /** A login, `pipeline` (the autopilot) or `cli`. */
  requestedBy: string;
  requestedAt: string;
  state: JobState;
  startedAt: string | null;
  endedAt: string | null;
  progress: string | null;
  summary: string | null;
  error: string | null;
  cancelRequested: boolean;
  usage: JobUsage | null;
  /** Models the job's step uses, e.g. ["jev", "haiku"]; known before any call is made. */
  models: string[];
  /** Labels of the Claude accounts used by the job's agent runs, running or finished. */
  accounts: string[];
}

/** An item a job handled: what happened to it, and the decision the job asked about it (null when none). */
export interface JobItem extends ItemRef, ItemShown {
  outcome: string | null;
  decision: string | null;
}

export interface JobDetail extends Job {
  /** The items the job handled, in the order it handled them; hidden repos left out. */
  items: JobItem[];
  /** The end of the job's log, with anything token-like replaced; null for viewers. */
  log: string | null;
  logTruncated: boolean;
}

export interface JobList {
  jobs: Job[];
  total: number;
}

export interface JobFilter {
  step?: string;
  state?: JobState;
  limit?: number;
  offset?: number;
}

export type StageLimit = { step: string; title: string; perDay: number | null; usedToday: number; pausedReason: string | null;
  /** The circuit-breaker stage that paused this step (fixup, cifix, fixissue, merge); an operator resumes it. */
  tripped?: string;
  /** What the stage is doing when nothing pauses it: "running", "queued", or why it is not starting ("nothing to do", "waiting for CI on 3 PRs in x"). */
  status?: string | null };
export type PipelineState = { /** The model that prepares every question's options and recommendation (the prepare step), and the models an operator may pick ("opus", "sonnet"). */ judgementModel: string; judgementModels: string[]; enabled: boolean; /** Switched to drain: no new jobs, jobs already running keep their writes; shown as "Draining". Never true with enabled. */ draining: boolean; changedBy: string | null; changedAt: string | null; heartbeat: string | null; limits: StageLimit[]; /** "repo#number" refs the pipeline is limited to; empty when there is no pilot. */ pilot: string[]; outside: OutsideState };

export interface PipelineStep {
  name: string;
  title: string;
  description: string;
  stage: number;
  requires: "operator";
  params: StepParam[];
  /** null when the step can run; otherwise why not. */
  unavailable: string | null;
  lastJob: Job | null;
}

export interface PipelineStage {
  n: number;
  name: string;
  /** How the stage runs today. */
  mode: "automatic" | "steps" | "planned";
  steps: string[];
  state: "running" | "queued" | "ok" | "failed" | "idle" | "planned";
}

export interface SyncRun {
  startedAt: string;
  endedAt: string | null;
  mode: string | null;
  items: number | null;
  error: string | null;
}

export interface PipelineOverview {
  stages: PipelineStage[];
  steps: PipelineStep[];
  runner: { lastSeen: string | null; alive: boolean };
  sync: { lastFinishedAt: string | null; runs: SyncRun[] };
  counts: { queued: number; running: number };
}

// ---- prompts ----------------------------------------------------------------

/** One registered model prompt (src/prompts), as the Prompts page shows it. */
export interface PromptInfo {
  id: string;
  stage: string;
  purpose: string;
  /** The first is the default. */
  models: string[];
  runner: "claude" | "jev";
  /** The command line, as a shell would show it; the prompt or request goes on stdin. */
  command: string;
  settings: { label: string; value: string }[];
  /** Items per call, attempts per item and the time limit per call. */
  limits: { perCall: number; attempts: number; timeoutSeconds: number };
  /** Static text with `{{name}}` placeholders; for Jev, the request body. */
  template: string;
  /** Claude without tools: the fixed text sent as `--system-prompt`; null when the call keeps the CLI's own system prompt (sandboxed) or is a Jev request. */
  system: string | null;
  placeholders: { name: string; meaning: string }[];
  /** Jev only: every question with its type and criteria. */
  questions: { id: string; type: string; instructions: string; criteria: Record<string, string> | null }[];
  output: string;
  validation: string;
  /** Exactly what would be sent on stdin for `exampleItems` (made-up items). */
  example: string;
  exampleItems: string[];
}

export interface PromptsReport {
  /** Git commit the server runs, or null when unknown. */
  commit: string | null;
  prompts: PromptInfo[];
  /** Comments the pipeline posts on GitHub; fixed text, no model. */
  comments: CommentTemplate[];
}

export interface CommentTemplate {
  id: string;
  stage: string;
  purpose: string;
  /** The text with `{{name}}` placeholders. */
  text: string;
  placeholders: { name: string; meaning: string }[];
  /** The text for made-up values. */
  example: string;
}

// ---- merge queue ------------------------------------------------------------

/**
 * Where a taken PR stands in the merge queue:
 * ready (may merge by the rule now), decision-answered-merge (the operator answered merge),
 * refused (the merge command or a pre-merge check said no; tried again next run),
 * waiting-ci (CI pending or none, or GitHub still computing mergeability), ci-failed, conflict,
 * needs-fix-up (take-fix), waiting-premerge (rule-path PRs waiting for the pre-merge review), waiting-verify (no passed verification at the head yet), verify-failed, verify-error,
 * needs-decision (outside the rule; Merge? asked or about to be),
 * declined (the operator answered hold or close), merged,
 * held-duplicate (an open Duplicate? decision keeps it out of every later stage), held-backlog (answered Backlog),
 * batch-checking (in an integration batch whose combined tree is being checked), in-batch (the batch PR is open),
 * batch-failed (failed alone in a batch: on hold until a new head), changes-requested (a maintainer's
 * changes-requested review stands), waiting-main-ci (ready, but the repo's main CI is red; AutoCraft's main-fix PRs are not held).
 */
export type QueueState =
  | "ready"
  | "decision-answered-merge"
  | "refused"
  | "waiting-ci"
  | "ci-failed"
  | "conflict"
  | "needs-fix-up"
  | "waiting-premerge"
  | "waiting-verify"
  | "verify-failed"
  | "verify-error"
  | "needs-decision"
  | "declined"
  | "merged"
  | "held-duplicate"
  | "held-backlog"
  | "batch-checking"
  | "in-batch"
  | "batch-failed"
  | "ci-approval"
  | "changes-requested"
  | "waiting-main-ci";

/** An integration batch: PRs landed together through one integration branch and one PR. */
export type BatchState = "checking" | "open" | "merged" | "failed" | "split" | "superseded";

export interface QueueBatch {
  id: number;
  repo: RepoName;
  branch: string;
  /** `<owner>/<repo>` the branch was pushed to; null while the batch is being checked. */
  fork: string | null;
  state: BatchState;
  /** Default-branch commit the batch was built on. */
  baseSha: string;
  /** How many PRs the batch took; `prs` lists those still in the queue view. */
  size: number;
  /** The member PRs in batch order, as queue rows. */
  prs: QueueRow[];
  /** The batch's own PR on the storytold repo, once opened. */
  prNumber: number | null;
  prUrl: string | null;
  /** Why it failed or was replaced; the failure summary of a held PR. */
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What a member PR did in its batch: `in` (still part of it, or carried to a later batch), `removed` (an operator took it out or stopped the batch), `merged`, `failed` (it failed alone and is on hold). */
export type BatchMemberState = "in" | "removed" | "merged" | "failed";

export interface BatchMemberDetail {
  repo: RepoName;
  number: number;
  /** Null when the mirror has no row for the PR. */
  title: string | null;
  /** The PR's own state on GitHub. */
  itemState: ItemState | null;
  headOid: string;
  state: BatchMemberState;
  /** Why it left (removed, failed); null for the other states. */
  reason: string | null;
}

export type BatchEventKind = "opened" | "task" | "push" | "pr" | "ci" | "removed" | "stopped" | "failed" | "split" | "superseded" | "merged";

/** One step of the batch's own history, from its row, its sandbox task and the audit log. `by` is the operator behind a control, shown to staff only. */
export interface BatchEvent {
  id: string;
  at: string;
  kind: BatchEventKind;
  summary: string;
  by: string | null;
  /** Another batch (parent or child) or the batch's sandbox task, when the event names one. */
  batchId?: number;
  taskId?: number;
  /** A member PR the event is about. */
  number?: number;
}

/** The batch PR's CI at its head: the checks sync's last read. */
export interface BatchCi {
  state: "success" | "failure" | "pending" | "none";
  fetchedAt: string;
  checks: { name: string; state: "success" | "failure" | "pending" | "skipped"; url: string }[];
}

export interface BatchDetail {
  id: number;
  repo: RepoName;
  branch: string;
  fork: string | null;
  state: BatchState;
  baseSha: string;
  /** Head of the integration branch. */
  commitSha: string;
  parentId: number | null;
  childIds: number[];
  prNumber: number | null;
  prUrl: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  /** When the batch PR landed; null unless merged. */
  mergedAt: string | null;
  taskId: number | null;
  /** Build batches: null when the batch was not built; skipped means the PR opened without a passed build. */
  buildState: "pending" | "passed" | "failed" | "skipped" | null;
  buildTries: number;
  /** Why the build was skipped; null otherwise. */
  buildSkipped: string | null;
  /** Merge commit of the batch PR; null until merged and for batches merged before it was recorded. */
  mergeSha: string | null;
  ci: BatchCi | null;
  members: BatchMemberDetail[];
  /** Oldest first. */
  events: BatchEvent[];
}

export interface BatchFilter {
  repo?: RepoName;
  /** page size (server default 20, at most 100) and the `next` cursor of the previous page */
  limit?: number;
  after?: string;
}

export interface BatchList {
  /** Newest first. */
  batches: QueueBatch[];
  /** Batches matching the filter, every page. */
  total: number;
  next: string | null;
}

export interface QueueRow {
  repo: RepoName;
  number: number;
  title: string;
  author: string;
  tier: Tier;
  /** Head commit the review is for. */
  head: string;
  size: "S" | "M" | "L";
  label: TypeLabel | null;
  verdict: "take" | "take-fix";
  reason: string;
  fixes: number;
  /** CI at the reviewed head: success | failure | pending | none, or unknown before checks were fetched for it. */
  ci: "success" | "failure" | "pending" | "none" | "unknown";
  mergeable: Mergeable;
  state: QueueState;
  /** How it may merge: by the rule, by the operator's answer, or not yet. */
  path: "rule" | "operator" | null;
  /** Why the merge-without-asking rule doesn't cover it. */
  outsideRule: string[];
  decisionId: string | null;
  answer: string | null;
  refusedReason: string | null;
  /** Why a maintainer's review blocks the PR, or that its reviews cannot be read; null otherwise. */
  note: string | null;
  reviewedAt: string;
  /** The Verify stage's result at the reviewed head; null when none. `summary` is the failure or error text, or the plan's reason. */
  verify: { state: string; kind: string | null; summary: string | null; note: string | null } | null;
  /** For a conflicting PR: what Fix-up does about it, e.g. "conflict: merging main". */
  conflictNote?: string | null;
  /** Issues in the same repo the PR closes when it merges (GitHub's closing references); empty or absent when none are known. */
  closes?: number[];
  /** Our own build of the PR head; absent when the switch is off or there is none. */
  prBuild?: ItemPrBuild | null;
}

export interface QueueFilter {
  repo?: RepoName;
  /** "merged" lists merged PRs; without a state they are left out. */
  state?: QueueState;
  /** `merge.<branch>` of the flowchart: lists that branch's PRs and ignores `state`. */
  flow?: string;
  /** page size (server default 100, at most 500) and the `next` cursor of the previous page */
  limit?: number;
  after?: string;
}

export interface QueueList {
  rows: QueueRow[];
  /** Per state, for the repo filter (ignores the state filter). */
  counts: Record<QueueState, number>;
  /** Rows matching the filters, every page. */
  total: number;
  /** Cursor for the next page (`after`), or null on the last one. */
  next: string | null;
}

export interface WorkBreakdown {
  /** The level used for the order, after the security raise. */
  level: PriorityLevel;
  /** The stored level, null when the item has not been rated (P2 counts). */
  rated: PriorityLevel | null;
  security: boolean;
  type: string | null;
  size: "S" | "M" | "L" | "XL";
  /** lines (PR), triage (issue, from Fix triage) or default (not known yet). */
  sizeSource: "lines" | "triage" | "default";
  /** 0 to 99, breaks ties inside a level. */
  reach: number;
}

export interface WorkRow {
  repo: RepoName;
  number: number;
  kind: ItemKind;
  title: string;
  /** Sort key (see src/rank/score.ts); for a tooltip only. */
  score: number;
  level: PriorityLevel;
  size: "S" | "M" | "L" | "XL";
  breakdown: WorkBreakdown;
  label: TypeLabel | null;
  /** The pipeline step the item waits for, in words. */
  next: string;
  /** App path of the list where a person resolves what the item waits for, or null. */
  nextHref: string | null;
}

export interface WorkFilter {
  repo?: RepoName;
  kind?: ItemKind;
  limit?: number;
  offset?: number;
}

export interface WorkList {
  rows: WorkRow[];
  /** Open ranked items matching the filters, every page. */
  total: number;
  /** `offset` of the next page, or null on the last one. */
  next: number | null;
}

/** A search hit ranked by embedding similarity (`/api/similar`, `/api/search?mode=semantic`). */
export interface SimilarHit extends SearchHit {
  /** Cosine similarity of the two embeddings; near-duplicates score about 0.9 and up. */
  score: number;
  /** How a closed issue was closed. */
  stateReason: "completed" | "not-planned" | "duplicate" | null;
  /** The item's settled type label (see src/classify/settled.ts); null while unsettled. */
  label: string | null;
  labelBy: string | null;
}

// ---- flowchart (home page) ----------------------------------------------------

/** The nodes of the flowchart, in pipeline order (docs/pipeline.md). */
export type FlowNodeId = StageId;

/** What items in a branch wait on: a model step, CI, a person, the runner (a step that needs no model), a build environment (a build task), or nothing. */
export type FlowWait = "model" | "ci" | "person" | "runner" | "sandbox" | "nothing";

/**
 * Where a branch's link goes. `items` opens the Items browser with these params
 * (`flow=<node>.<branch>` picks exactly the branch's items); `decisions`,
 * `queue` and `work` open those pages with these params.
 */
export interface FlowLink {
  page: "items" | "decisions" | "queue" | "work";
  params: Record<string, string>;
}

export interface FlowBranch {
  /** Unique within the node. */
  id: string;
  label: string;
  /** null where nothing is counted yet (a planned stage). */
  count: number | null;
  waitsOn: FlowWait;
  /** A person acts on the items here. */
  gate: boolean;
  tone: "ok" | "warn" | "bad" | "neutral" | "merged" | "accent";
  link: FlowLink | null;
  hint: string;
}

export interface FlowNode {
  id: FlowNodeId;
  title: string;
  /** Stage number in docs/pipeline.md. */
  stage: number;
  /** auto: runs on its own; steps: runner steps; gate: a person decides; planned: not built yet. */
  mode: "auto" | "steps" | "gate" | "planned";
  /** One line under the title, e.g. "21,310 open". */
  summary: string;
  /** Items in the node, where that is one number. */
  total: number | null;
  branches: FlowBranch[];
  /** Movement in the last 24 hours. */
  recent: { label: string; count: number }[];
  /** What the node waits on now: the waitsOn of its branches that hold items. */
  waitsOn: FlowWait[];
  /** Extra facts shown on the node, e.g. "Repos approved: 3 of 26". */
  facts: { label: string; value: string }[];
  /** Runner steps (src/runner/steps.ts) of the stage. */
  steps: string[];
  /** Prompt ids (src/prompts) the stage sends. */
  prompts: string[];
}

export interface FlowEdge {
  from: FlowNodeId;
  to: FlowNodeId;
  /** The branch of `from` the edge leaves from, if any. */
  branch: string | null;
  label: string;
  /** null on planned edges. */
  count: number | null;
}

export interface Flow {
  repo: RepoName | null;
  now: string;
  lastSync: string | null;
  /** When the counts were taken: the oldest of the per-repo summaries they add up. */
  countedAt: string | null;
  /** Tracked repos left out because they have no counts yet; the runner adds them within minutes. */
  uncounted: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ---- Claude accounts, agent runs and rates -------------------------------------------------------------

export type AccountUsage = {
  fiveHourPct: number | null; fiveHourResetsAt: string | null;   // ISO
  weeklyPct: number | null; weeklyResetsAt: string | null;
  readAt: string | null;                                          // when the reading was taken
};
export type ClaudeAccount = {
  id: string;            // short key from the box config, e.g. "b"; never an email or path
  label: string;         // set by an operator; the only name the UI shows
  enabled: boolean;
  maxConcurrent: number; // agent runs at once on this account
  running: number;       // agent runs active now
  usage: AccountUsage;
  pausedReason: string | null; // e.g. "5-hour use 92 % (pauses at 90 %)"
  auth: AccountAuth;
  login: AccountLogin | null;  // operators only: the sign-in or token request in progress, or the last one's outcome
  token: AccountToken;
};
/** The long-lived token of an account (never its value). Dates are ISO; `expiresAt` is about one year after `setAt`. */
export type AccountToken = { state: "none" | "set" | "rejected"; setAt: string | null; expiresAt: string | null; rejectedAt: string | null };
/** From `claude auth status` and the credentials file's expiry date; no email. Null fields: not read yet. */
export type AccountAuth = { loggedIn: boolean | null; method: string | null; plan: string | null; expiresAt: string | null; checkedAt: string | null };
export type AccountLoginState = "starting" | "waiting" | "checking" | "done" | "failed" | "cancelled";
export type AccountLogin = { state: AccountLoginState; url: string | null; message: string | null; kind: "login" | "token" };
/** Usage levels (%, 1 to 100) at which an account stops taking calls. */
export type UsagePause = { fiveHour: number; weekly: number };
/** Whether Jev is in use; `unavailable` says why not (Haiku then does its work) and since when. */
export type JevStatus = { enabled: boolean; unavailable: { reason: string; since: string } | null };
export type AccountInput = { label?: string; enabled?: boolean; maxConcurrent?: number };

export type AgentRunState = "running" | "done" | "failed";
export type AgentRun = {
  id: number;
  jobId: number | null;
  step: string;              // runner step name
  stage: number;             // stage number from docs/pipeline.md
  promptId: string;          // prompt registry id
  promptVersion: string;     // registry version or content hash
  provider: "claude" | "jev";
  model: string;             // e.g. "sonnet", "haiku", "jev"
  accountId: string | null;  // null for Jev
  accountLabel: string | null;
  items: (ItemRef & ItemShown)[];   // at most 50
  itemCount: number;         // all items in the call
  state: AgentRunState;
  startedAt: string;
  endedAt: string | null;
  inputTokens: number | null; outputTokens: number | null;
  cacheReadTokens: number | null; cacheWriteTokens: number | null;
  costUsd: number | null;    // USD; Jev is input tokens at the flat price; null for runs from before costs were stored
  summary: string | null;    // one line: verdict counts, error class
  progress?: string;         // running calls with tools: the latest thing the model is doing
};
export type AgentRunDetail = AgentRun & {
  prompt: string | null;     // rendered prompt; null once past retention (ten years)
  output: string | null;     // raw model output, same retention
  error: string | null;
  tools: AgentRunTool[];     // tool uses in order
  textsHidden?: boolean;     // prompt, output and tool arguments are withheld from this user (viewers)
};
export type AgentRunTool = {
  seq: number;
  tool: string;              // e.g. "Read", "mcp__build__check"
  args: string | null;       // scrubbed JSON, capped; null for viewers without text access; results are never stored
  resultBytes: number | null;
  isError: boolean;
  startedAt: string | null;  // null when the call's output was not streamed
  endedAt: string | null;
  check: { id: number; command: string; crate: string | null; testName: string | null; outcome: string | null } | null;
};
export type AgentRunPage = { runs: AgentRun[]; nextCursor: string | null };
export type AgentRunFilter = { state?: AgentRunState | "recent"; step?: string; account?: string; repo?: string; cursor?: string; limit?: number };

export type RateBucket = { t: string; items: number; runs: number; failed: number };
export type Rates = {
  window: "24h" | "7d"; bucket: "hour" | "day";
  stages: { step: string; title: string; buckets: RateBucket[] }[];
  accounts: { id: string; label: string; samples: { t: string; fiveHourPct: number | null; weeklyPct: number | null }[] }[];
};

// ---- Build environments and tasks -----------------------------------------------------------------------

export type Capabilities = {
  os: "linux" | "macos" | "windows";
  arch: "x86_64" | "aarch64";
  cpus: number; memGb: number; diskGb: number;
  display: boolean;          // can render UI (Xvfb or real) for screenshots
  gpu: boolean;
  toolchains: string[];      // e.g. ["rust-stable", "node-24"]
  warmSigner?: boolean;      // holds the warm-snapshot signing key; takes no PR-code tasks
};
export type Requires = Partial<Pick<Capabilities, "os" | "arch" | "display" | "gpu">> & {
  toolchains?: string[]; minMemGb?: number; minDiskGb?: number;
};
export type EnvKind = "local-sandbox" | "remote";
export type BuildEnv = {
  id: string; label: string; kind: EnvKind;
  enabled: boolean; online: boolean; lastSeenAt: string | null;
  slots: number; running: number;
  capabilities: Capabilities | null;   // as last reported by the worker
  version: string | null;              // worker software version
  pausedReason: string | null;         // e.g. "disk 12 GB free (needs 20)"
  /** Set by an operator: the only environments that take the security lane's private tasks, and they take no PR code. */
  confidential: boolean;
};
export type EnvInput = { label?: string; enabled?: boolean; slots?: number; confidential?: boolean };
export type EnvCreate = { id: string; label: string; kind: EnvKind; slots: number; confidential?: boolean };
export type TaskStep = {
  name: string;                         // "fetch deps", "build", "test", "screenshot"
  cmd: string[];                        // argv, run inside the container
  network: "fetch" | "none";            // "fetch": registry/GitHub egress allowed; "none": no network
  timeoutSec: number;
  artifacts?: string[];                 // globs under /out to return
  bare?: boolean;                       // run without the /target and /cache mounts
};
export type TaskState = "queued" | "claimed" | "running" | "done" | "failed" | "cancelled" | "lost";
export type TaskResult = { step: string; exitCode: number | null; durationMs: number; timedOut: boolean; peakMemBytes?: number; oomKilled?: boolean };
export type TaskArtifact = { name: string; bytes: number; contentType: string };
export type BuildTask = {
  id: number; jobId: number | null; step: string;   // pipeline step that created it
  repo: RepoName; number: number | null;            // PR
  headSha: string; baseSha: string | null;
  requires: Requires; priority: number;
  plan: TaskStep[];
  state: TaskState; envId: string | null; envLabel: string | null;
  cancelRequested: boolean;
  queuedAt: string; claimedAt: string | null; startedAt: string | null; endedAt: string | null;
  heartbeatAt: string | null;
  results: TaskResult[];
  artifacts: TaskArtifact[];
  summary: string | null;
  /** Bytes of the unified diff applied to the checkout before the plan; null when the task has none. */
  patchBytes: number | null;
  /** Shared build cache: `build` fills it, `use` reads it. */
  warm: { key: string; role: "use" | "build" } | null;
  /** The integration batch this task checks (step merge-batch); null for other tasks. */
  batch: TaskBatch | null;
  /** Kind, state and title of the PR in `number`; null with `number` null. */
  item: ItemShown | null;
  /** Set for a build of the default branch head with no PR and no patch (warm and baseline runs). */
  baseline: { branch: string | null } | null;
  /** The environment the worker ran the steps in; null until the task finishes, or when it failed before the steps. */
  sandbox: SandboxEnv | null;
};
/** `fork` is the `<owner>/<repo>` the batch branch was pushed to; null before the push. `shown` lists kind, state and title of each of `prs`, in order. `commitSha` is the integration commit, `baseSha` the default branch head it was built on. */
export type TaskBatch = { id: number; branch: string; fork: string | null; commitSha: string; baseSha: string; prs: number[]; shown: ItemShown[] };
/** Image and CI-gate inputs a task ran with. Worker-sent: shown as plain text only. */
export type SandboxEnv = { image: string; baseImage: string; packages: string[]; craftFontsRef: string | null; craftI18nRev: string | null };
/** Worker-sent text: shown as plain text only, never as markup. */
export type BuildTaskDetail = BuildTask & { /** null (with the patch) for viewers: staff only. */ logTail: string | null; logBytes: number; logTruncated: boolean; patch: string | null };
export type TaskFilter = { state?: TaskState | "active"; env?: string; repo?: string; cursor?: string; limit?: number };
export type TaskPage = { tasks: BuildTask[]; next: string | null };
/** Queued and running tasks and the slots left over the online, enabled environments (the flowchart's Verify node). */
export type BuildFeatureName = "screenshots" | "push-tests" | "batch-build" | "scan-tests" | "nightly" | "pr-builds";
/** `repos` lists the repos whose own switch is on; scan-tests has none. */
export type BuildFeatureState = { feature: BuildFeatureName; on: boolean; repoScoped: boolean; repos: string[] };
export type PrBuildScope = "outside" | "all";
/** `repos` is every tracked repo the viewer can see. `prBuilds`: the scope of each of those repos and the builds a repo may start a day. */
export type BuildFeatures = { features: BuildFeatureState[]; repos: string[]; prBuilds: { scopes: Record<string, PrBuildScope>; perDay: number } };
/** `on` switches; `scope` (with `repo`, pr-builds only) and `perDay` (pr-builds only) set the build scope and the daily cap. At least one of the three. */
export type BuildFeatureInput = { feature: BuildFeatureName; on?: boolean; repo?: string; scope?: PrBuildScope; perDay?: number };


/** Validator of one screenshot command parameter: a fixed set of values, an integer range, or an anchored regular expression. */
export type ScreenshotParam = { enum: string[] } | { int: [number, number] } | { chars: string; min: number; max: number };
export type ScreenshotCommand = { doc: string; params: Record<string, ScreenshotParam>; argv?: string[]; line?: Record<string, string | number | boolean>; capture?: boolean };
/** The operator-edited setup of one repo; also the body of PUT /api/build/screenshots/:repo. */
export type ScreenshotConfigJson = { package: string; example: string; driver: "args" | "jsonl"; commands: Record<string, ScreenshotCommand>; ui_paths: string[]; size?: string };
export type ScreenshotSetup = { repo: string; config: ScreenshotConfigJson; updatedBy: string; updatedAt: string };
export type ScreenshotSetups = { setups: ScreenshotSetup[] };
// ---- Nightly page (/api/nightly) ---------------------------------------------

export type NightlyState = "queued" | "pass" | "fail" | "error" | "skipped" | "warn";
/** One check on one night; `taskId` links to the build task, null while nothing ran (skipped). */
export type NightlyCell = { state: NightlyState; taskId: number | null; summary: string | null; issueNumber: number | null };
/** `cells` align with the repo's `nights`, newest first; null where the check had no result that night. */
export type NightlyCheckRow = {
  id: string; label: string; enabled: boolean; experimental: boolean; needs: "fuzz-dir" | "benches" | null;
  /** Which selection inputs the check takes. */
  takes: "crates" | "targets" | null;
  crates: string[]; targets: string[]; cells: (NightlyCell | null)[];
};
export type NightlyBench = { name: string; unit: string; latest: number; /** Latest against the median of the 7 nights before it, in percent (positive = slower); null with too little history. */ deltaPct: number | null; points: number[]; at: string };
export type NightlyRepo = { repo: string; on: boolean; nights: { runId: number; startedAt: string; sha: string }[]; checks: NightlyCheckRow[]; benches: NightlyBench[] };
export type NightlyGrid = { repos: NightlyRepo[] };
export type NightlySeries = { repo: string; bench: string; unit: string; points: { sha: string; at: string; value: number }[] };
export type NightlySelectInput = { repo: string; check: string; enabled: boolean; crates?: string[]; targets?: string[] };

export type BuildSummary = { queued: number; running: number; slots: number; free: number; online: number };

// ---- Queue page (/api/queue/page) -------------------------------------------

export type QueueTab = "all" | "review" | "fix" | "verify" | "merge";

/** An item's place in line for its next queued stage (src/rank/position.ts), 1-based among the visible items with the same next stage. */
export interface QueueSlot {
  /** Stage name as shown: Review, Opus review, Fix, Fix-up, Verify, Merge. */
  stage: string;
  /** The Queue tab that lists the stage. */
  tab: Exclude<QueueTab, "all"> | "act";
  place: number;
}

/** Place of a fast-tracked item among the open fast-tracked items, first to run first. */
export interface FastPosition {
  /** From 1. */
  position: number;
  of: number;
  /** 1 to 10: heavier items go first; left out where only the order is known. */
  weight?: number;
}

/** One row of the All, Review, Fix and Verify tabs: a work row with its fast-track place. */
export interface QueueWorkRow extends WorkRow {
  queue?: QueueSlot | null;
  fast: FastPosition | null;
  /** A PR whose merge an operator holds. */
  held: boolean;
}

/**
 * How a PR came into the merge queue: `review` (a take review; the merge rule or a Merge? question decides), `answer` (an operator
 * answered Merge?), `queued` (an operator added it with Queue items), `preapproved` (an operator pre-approved the merge with a fix-up).
 * `by` is the operator, null for `review` and for anyone but staff; `at` is when.
 */
export interface QueueOrigin {
  how: "review" | "answer" | "queued" | "preapproved";
  by: string | null;
  at: string | null;
}

/** One row of the Merge tab: a merge queue row with its fast-track place, hold and how it came in. */
export interface QueueMergeRow extends QueueRow {
  fast: FastPosition | null;
  held: boolean;
  added?: QueueOrigin;
}

/** What a PR waits for before it merges. */
export type MergeWait = "ready" | "refused" | "ci" | "premerge" | "verify" | "re-review" | "batch-check" | "batch-ci" | "held";

/** A PR in "Next merges", in the order it merges. */
export interface NextMerge {
  repo: RepoName;
  number: number;
  title: string;
  waitsFor: MergeWait;
  /** The wait in words. */
  label: string;
  fast: FastPosition | null;
  /** The integration batch the PR is in, if any. */
  batch: { id: number; branch: string } | null;
}

export interface QueuePageCounts {
  all: number;
  review: number;
  fix: number;
  verify: number;
  merge: number;
}

/** `pipeline`: repos with the pipeline on, plus fast-tracked items of any repo; `all`: every repo; otherwise one repo. */
export type QueueRepos = "pipeline" | "all" | RepoName;

export interface QueuePageFilter {
  tab?: QueueTab;
  repos?: QueueRepos;
  /** `repo:number`: the first page is cut long enough to include this item. */
  item?: string;
  limit?: number;
  offset?: number;
}

export interface QueuePage {
  tab: QueueTab;
  /** Index of the requested `item` in this tab's list (rows or merge rows), or null when the tab does not list it. */
  itemIndex?: number | null;
  repos: QueueRepos;
  counts: QueuePageCounts;
  /** All, Review, Fix, Verify tabs (empty on Merge). */
  rows: QueueWorkRow[];
  /** Merge tab only: open PRs that are not in a batch in flight. */
  mergeRows: QueueMergeRow[];
  /** Merge tab only: up to ten PRs in merge order. */
  nextMerges: NextMerge[];
  /** Merge tab only: batches in flight, with their PRs. */
  batches: QueueBatch[];
  /** Rows matching the tab, every page. */
  total: number;
  /** `offset` of the next page, or null on the last one. */
  next: number | null;
}

// ---- conversations with Opus (src/dash/api/conversations.ts) ----

/** "replaced": a later Opus reply proposed a new set; the card can no longer run. */
/** A proposed card's drafts as an operator edited them; a field left out stays as it is. */
export type CardEdit = { text?: string; issue?: { title: string; body: string }; instructions?: string };

export type ConversationCardState = "proposed" | "queued" | "running" | "done" | "failed" | "dismissed" | "replaced";

/**
 * An action Opus proposed. `title` is written by the server from the card's parameters; `text` is the card's editable comment.
 * A card with `settles` is a resolution: it runs its steps, then settles the item's open question, all from one button.
 * A card without it is a single action that leaves the question open (for example asking the author something).
 */
export interface ConversationCard {
  id: number;
  /** Digest of the card's text and steps: a press sends it back, so it runs only the card as shown. */
  digest: string;
  /** "resolution" for cards Opus proposes from now on; the other kinds are single actions on older turns. */
  kind: "resolution" | "comment" | "answer" | "label" | "backlog" | "duplicate" | "resolve" | "close";
  title: string;
  /** The viewer may press, edit and dismiss this card (same rule as `Decision.canSettle`, over every repo the card writes to). */
  canSettle: boolean;
  /** What runs, in order, one plain line each (e.g. "Post the comment below", "Close the issue as completed"); empty for a card that only settles the question. */
  steps: string[];
  /** The open decision's option this card settles with: the card is Opus's draft for that option's row. Absent: an outcome of its own (handled, a close, a step-only action). */
  option?: string;
  /** Why a proposed card may be out of date: "pr-changed" (a push since it was proposed; it refuses to run) or "new-comments" (GitHub comments since; it still runs). */
  stale?: "pr-changed" | "new-comments";
  /** Index in `steps` of the comment step, whose text is `text`. Absent: the card has no comment. */
  commentStep?: number;
  /** The open-issue step's draft (at most one per card), editable like `text`; `step` is its index in `steps`. `repo` is where it opens. */
  issue?: { step: number; repo: RepoName; title: string; body: string };
  /** The fix-up step's instructions to the fix-up model (at most one per card), editable like `text`; `step` is its index in `steps`. `merge`: a pre-approved merge follows. Never posted to GitHub. */
  fixup?: { step: number; instructions: string; merge: boolean };
  /** How the open question ends when the card runs, e.g. 'Answers the scope question with "Small extra"', "Closes the scope question as handled". Absent: the question stays open. */
  settles?: string;
  /** The primary button: the action in a few words, written by the server from the card's parameters. */
  label: string;
  /** The card's first line: the action with its key parameter, e.g. "Close issue as completed", "Close as duplicate of #12". */
  headline: string;
  /** One line under the headline: "Comment: …", "Reason: …", "Issue: …" or "Instructions: …". Absent: the card has no text. */
  preview?: string;
  text?: string;
  /** An answer or close card that writes to GitHub: what it does, e.g. "closes the PR on GitHub". The button asks for a second confirmation. */
  writes?: string;
  state: ConversationCardState;
  /** Set when state is queued: the press found no room under the daily GitHub write limit; `place` counts from 1 in the order the cards run (null while disputed). */
  queued?: { place: number | null; reason: string; dispute: { by: string; reason: string; at: string } | null };
  /** Set when state is done; `link` is empty when the action wrote nothing on GitHub. */
  done?: { at: string; link: string; label: string };
  /** Set when state is failed. */
  error?: string;
  /** Who pressed the button or dismissed the card, and when. */
  by?: string;
  at?: string;
  /** Run from a decision's choices (`conversations.doChoice`), not proposed by Opus as a card. */
  fromChoice?: boolean;
  /** The text was edited by an operator before it ran. */
  edited?: boolean;
  /** Who edited the text, when `edited`. */
  editedBy?: string;
}

// ---- Decision choices: one core action plus extras ---------------------------------

/** The GitHub write a core or an extra performs; one pill each in the UI. */
export type ActionTag = "merge" | "close" | "reopen" | "comment" | "open_issue" | "label" | "unlabel" | "assign" | "request_review" | "push" | "move";
export type ExtraKind = "comment" | "open_issue" | "label" | "unlabel" | "assign" | "request_reviewers";
/** `o:<option>`, `fixup-merge`, `backlog`, `x:close:<completed|not_planned>`, `x:duplicate:<n>`, `x:transfer:<repo>`, `x:fixup`, `x:review`. */
export type CoreKey = string;

export interface ChoiceExtra {
  id: string;
  kind: ExtraKind;
  tag: ActionTag;
  /** Ticked: Opus's tick before the user changes it. */
  on: boolean;
  text?: string;
  title?: string;
  body?: string;
  label?: string;
  login?: string;
  logins?: string[];
  repo?: string;
}

export interface ChoiceCore {
  key: CoreKey;
  label: string;
  /** reason: closing cores; instructions: fix-up cores; target: duplicate-of number or transfer repo. */
  params?: { reason?: string; instructions?: string; target?: string };
  /** GitHub writes the core itself performs; empty when it only records an answer in AutoCraft. */
  writes: ActionTag[];
  /** What AutoCraft does after the answer: one short fixed phrase (lower case, no full stop), shown after "AutoCraft". */
  autocraft: string;
  extras: ChoiceExtra[];
  /** Opus drafted this core's params and extras (beyond the offered list). */
  drafted: boolean;
}

export interface DecisionChoices {
  id: string;
  decisionId: string;
  pick: { core: CoreKey; reason: string } | null;
  cores: ChoiceCore[];
  /** The newest card run from these choices. */
  run?: { cardId: number; state: ConversationCardState; error?: string };
  source: "prepare" | "conversation" | "converted";
  at: string;
}

/** Body of `conversations.doChoice`. */
export interface DoChoiceBody {
  core: CoreKey;
  params?: { reason?: string; instructions?: string };
  /** Ticked extras only, with the user's own text edits. */
  extras: { id: string; text?: string; title?: string; body?: string }[];
  note?: string;
}

export interface ConversationTurn {
  id: number;
  kind: "operator" | "opus" | "system";
  /** The operator's login, "opus" or "system". */
  login: string;
  at: string;
  body: string;
  /** Opus turns: the cards, in the order Opus proposed them. */
  actions: ConversationCard[];
  /** Opus turns: why proposed cards were dropped. */
  notes: string[];
  /** Operator turns: pending while Opus has not answered, failed when it gave no usable reply. */
  status?: "pending" | "answered" | "failed";
  error?: string;
}

export interface Conversation {
  repo: RepoName;
  number: number;
  /** False when the item has no conversation yet; turns is then empty. */
  exists: boolean;
  /** An operator message waits for Opus's reply. */
  pending: boolean;
  /** While a reply is being written: what Opus did last, up to five plain lines, newest last. */
  progress?: string[];
  startedBy: string | null;
  /** Maintainer posts an operator included for Opus. `source` is "decision-comment:<id>" or "decision-opinion:<id>"; `sent` once Opus has been given it (it can no longer be removed). */
  includes: { source: string; by: string; at: string; sent: boolean }[];
  turns: ConversationTurn[];
  /** The item's open bound decision's answer choices; null or absent when it has none. */
  choices?: DecisionChoices | null;
}

// ---- Areas -------------------------------------------------------------------

export interface AreaDef {
  name: string;
  description: string;
}
export interface AreaProposalArea extends AreaDef {
  state: "open" | "accepted" | "ignored";
}
/** A model's proposal waiting for an operator: kind "propose" is a whole list, "suggest" is areas to add. */
export interface AreaProposal {
  id: number;
  kind: "propose" | "suggest";
  areas: AreaProposalArea[];
  createdAt: string;
  createdBy: string | null;
}
export interface RepoAreas {
  repo: RepoName;
  /** null until a list is saved. */
  version: number | null;
  areas: AreaDef[];
  savedAt: string | null;
  savedBy: string | null;
  /** Open items without an area (never asked, none of these, or unassigned by a removed area). */
  unassigned: number;
  /** Open items per area, most first; areas without open items are left out. */
  counts: { area: string; open: number }[];
  versions: { version: number; at: string; by: string | null; note: string | null }[];
  proposals: AreaProposal[];
}
export type AreaEditBody =
  | { op: "add"; name: string; description: string }
  | { op: "rename"; from: string; to: string }
  | { op: "merge"; from: string; into: string }
  | { op: "remove"; name: string }
  | { op: "describe"; name: string; description: string };
/** Which model step to queue: propose a list, suggest new areas, or re-scan the unassigned items. */
export type AreaStep = "propose" | "suggest" | "rescan";

// ---- Item trace ----------------------------------------------------------------

export type TraceKind = "github" | "plan" | "job" | "model-call" | "check" | "review" | "decision" | "write" | "step" | "conversation";
export type TraceActor = { type: "person" | "step" | "model"; name: string };
/** Ids needed to fetch an event's details: runs, tasks and decisions have their own endpoints; the rest use the trace detail endpoint. */
export type TraceRef = {
  runId?: number; /** A review's model calls, oldest first (a fix turn or repeat adds one). */ runIds?: number[]; jobId?: number; taskId?: number; checkId?: number; decisionId?: string; auditRowid?: number;
  reviewId?: string; commentId?: string; head?: string; toHead?: string;
  /** The integration batch the event belongs to (merge, hold and batch writes). */
  batchId?: number;
};
export type TraceEvent = {
  /** Stable across fetches, for example "run:123". */
  id: string;
  kind: TraceKind;
  at: string;
  /** Commit the event belongs to, when known; the page groups by it. */
  head: string | null;
  actor: TraceActor;
  summary: string;
  /** GitHub comments and reviews: the text as Markdown, cut at 20,000 characters (`bodyCut` then true). */
  body?: string;
  bodyCut?: boolean;
  ref: TraceRef;
  /** A review's summed model-call cost; null when none of its calls has a recorded cost. */
  costUsd?: number | null;
  /** Model calls only. */
  call?: {
    /** The prompt the call ran; calls of one step and prompt family are grouped on the item page. */
    promptId?: string; /** The step's display name. */ step?: string;
    model: string; provider: string; account: string | null; state: string;
    inputTokens: number | null; outputTokens: number | null; costUsd: number | null; toolCalls: number; endedAt: string | null;
  };
};
export type ItemTraceHeader = {
  now: { state: string | null; head: string | null; plannedAt: string | null; text: string; waitsOn: string | null; reasons: string[]; note: string | null };
  /** The plan's due actions in order. */
  next: { kind: string; head: string | null }[];
  who: {
    assignees: string[]; autocraftAssigned: boolean;
    openDecisions: { id: string; kind: string; question: string }[];
    holds: { by: string; at: string }[];
  };
};
export type ItemTrace = { header: ItemTraceHeader; events: TraceEvent[]; nextCursor: string | null; stamp: string };
/** The answer to `since=<stamp>` when nothing the first page or the header shows has changed. */
export type ItemTraceUnchanged = { unchanged: true; stamp: string };
export type ItemTraceQuery = { kinds?: TraceKind[]; autocraftOnly?: boolean; cursor?: string; limit?: number; since?: string };
/** The item an activity event belongs to, for an ItemRef; null fields when the mirror lacks the item. */
export type ActivityItem = { repo: string; number: number; kind: ItemKind | null; state: ItemState | null; title: string | null };
export type ActivityEvent = TraceEvent & { item: ActivityItem };
export type ActivityPage = { events: ActivityEvent[]; nextCursor: string | null; stamp: string };
export type ActivityQuery = { kinds?: TraceKind[]; repo?: string; autocraftOnly?: boolean; cursor?: string; limit?: number; since?: string };
export type ItemTraceDetail = { id: string; kind: TraceKind; at: string; summary: string; fields: Record<string, unknown> };

// ---- Needs you (src/dash/api/needs.ts) ----

export type NeedsCounts = { decisions: number; feedback: number; stopped: number };
export type NeedsFeedbackRow = {
  /** Stable across fetches: "decision-comment:<id>", "decision-opinion:<id>", "turn:<id>" or "comment:<id>". */
  id: string;
  source: "decision" | "operator" | "github";
  /** The item the text is on; null for a batch decision. */
  item: ({ repo: RepoName; number: number } & ItemShown) | null;
  author: string;
  at: string;
  /** Markdown. */
  text: string;
  /** What the text is attached to, as an app path. */
  href: string;
  hrefLabel: string;
  /** Answered or replied to after the text was written. */
  handled: boolean;
};
export type NeedsFeedbackPage = { rows: NeedsFeedbackRow[]; nextCursor: string | null };
export type NeedsResume = { type: "trip"; stage: string } | { type: "link"; to: string } | { type: "retry"; decision: string } | { type: "fixes"; repo: RepoName } | { type: "outside"; author: string };
export type NeedsStoppedRow = {
  id: string;
  kind: "breaker" | "limit" | "account" | "act" | "fix-group" | "outside-group";
  title: string;
  reason: string;
  since: string | null;
  /** A fix-group row: how many issues of the repo have a stopped fix. */
  count?: number;
  resume: NeedsResume;
};
/** The items held for one outside author. */
export type NeedsOutsideList = { rows: NeedsOutsideRow[] };
/** An issue whose fix attempt stopped; Fix again clears it. */
export type NeedsFixRow = { id: string; repo: RepoName; number: number; title: string; reason: string; since: string | null; impact: string | null };
export type NeedsFixPage = { rows: NeedsFixRow[]; nextCursor: string | null };
export type NeedsPage = { counts: NeedsCounts; feedback: NeedsFeedbackPage | null; stopped: NeedsStoppedRow[] };
// ---- Next page -------------------------------------------------------------------

export interface NextItem extends ItemRef, ItemShown {
  /** The plan action that makes the item due, and its bucket. */
  action: string;
  bucket: string | null;
  /** The item's next-step text from the planner. */
  why: string;
  fast: boolean;
  rank: number | null;
  inFlight: boolean;
  /** The step's next job covers this item. */
  next: boolean;
  /** Why the guard would refuse the item's write, or null. */
  blocked: string | null;
}

export interface NextStep {
  lane: string;
  title: string;
  stage: string;
  steps: string[];
  canRun: boolean;
  kind: "ok" | "running" | "off" | "breaker" | "limit" | "account" | "backoff" | "approval";
  /** Why the step cannot run now, or null. */
  why: string | null;
  /** The planner's last reading of the step, when it holds back. */
  note: string | null;
  /** Items due for the step; `items` may hold fewer. */
  total: number;
  /** In the order the step takes them. */
  items: NextItem[];
}

export interface NextWaiting extends ItemRef, ItemShown {
  wait: string;
  why: string | null;
}

export interface NextPage {
  steps: NextStep[];
  waiting: NextWaiting[];
  waitingTotal: number;
}
// ---- Now page (GET /api/now) ---------------------------------------------------

/** A thing that needs attention; `to` is the page where it is fixed. `info` problems do not break "all healthy". */
export type NowProblem = { id: string; area: "pipeline" | "runner" | "workers" | "breaker" | "limit" | "account" | "jev" | "main-ci" | "jobs" | "sync" | "deadline" | "liveness"; tone: "bad" | "warn"; text: string; to: string; since: string | null; /** Set on a job stopped for running past its step's limit: the step an operator acknowledges to clear the warning. */ ackStep?: string };
export type NowHealth = {
  pipeline: { enabled: boolean; by: string | null; at: string | null };
  problems: NowProblem[];
};
export type NowEntryKind = "job" | "call" | "task" | "batch" | "write" | "merge" | "decision" | "failure";
/**
 * One unit of work in the Now feed, newest started first. A job is the same entry while it runs and after it ends; the GitHub writes
 * made on its items during its run attach to it as `writes`. Writes with no job stand alone.
 */
export type NowEntry = {
  key: string;
  /** Every event this entry stands for (a job's writes, a group's members); an entry that gains ids is the same entry, grown. */
  ids: string[];
  /** The merge batch this entry is about; the row links to its page. */
  batchId: number | null;
  kind: NowEntryKind;
  state: "running" | "queued" | "done" | "failed";
  /** When it started or happened. */
  at: string;
  endedAt: string | null;
  /** The step's title as the dashboard shows it, or the sentence for a write, decision or failure. */
  title: string;
  /** Model and account for calls, environment for tasks, the branch for batches. */
  what: string | null;
  /** The outcome once ended. */
  summary: string | null;
  /** The latest progress line while running. */
  progress: string | null;
  actor: string;
  item: (ItemRef & ItemShown) | null;
  /** The repo of an entry that is not about items (shown as "System" when null). */
  repo: string | null;
  /** The items it covers, at most 200; `itemCount` is the true total. */
  items: (ItemRef & ItemShown)[];
  itemCount: number;
  more: number;
  /** Trace event id on the first item's page; null when the entry has no item. */
  event: string | null;
  /** The run, job, task, batch or decision page. */
  detail: string | null;
  writes: { summary: string; items: (ItemRef & ItemShown)[]; more: number }[];
  /** Model calls and build tasks of a running job, shown under it. */
  children: NowEntry[];
};
export type NowFeed = { entries: NowEntry[]; nextCursor: string | null };
export type Now = { health: NowHealth; /** Titles of housekeeping jobs that are running, shown as one line. */ alsoRunning: string[] } & NowFeed;

// ---- security deep scan (operators and maintainers only; viewers get 404) ----------------------------------

/** A scan is active in `modeling` (including while it waits in the job queue), `scanning` and `verifying`. */
export type ScanState = "modeling" | "scanning" | "verifying" | "done" | "stopped" | "capped" | "failed";
export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingState = "new" | "dismissed" | "backlog" | "fixing" | "ready" | "landing" | "landed" | "advisory" | "awaiting-admin" | "published";
export type FindingAction = "fix" | "dismiss" | "backlog" | "reopen" | "land" | "advisory" | "publish";

export interface ScanView {
  id: number;
  repo: string;
  /** The pinned commit of the default branch; null before the scan has fetched it. */
  commit: string | null;
  state: ScanState;
  /** The spend cap in dollars; null means none. */
  capUsd: number | null;
  costUsd: number;
  /** Estimated total cost, recorded after the threat model; null before. */
  estimateUsd: number | null;
  areasTotal: number;
  areasDone: number;
  /** Findings that survived verification so far. */
  findingCount: number;
  startedBy: string;
  startedAt: string;
  endedAt: string | null;
  error: string | null;
}

export interface FindingSummary {
  repo: string;
  number: number;
  /** `<repo>:finding:<n>` */
  key: string;
  scanId: number;
  title: string;
  severity: FindingSeverity;
  /** The model judged that it needs an immediate release. */
  urgent: boolean;
  /** Name of the scanned area. */
  area: string;
  state: FindingState;
  createdAt: string;
  updatedAt: string;
  /** State of the finding's scan test; absent when it has none. */
  scanTest?: ScanTestState;
}

/** building: the test is being built and run; confirmed: it fails on the pinned commit; not-shown: it passes there; could-not-build: it did not build or run. */
export type ScanTestState = "building" | "confirmed" | "not-shown" | "could-not-build";
/** A test the scan wrote for the finding and ran in the build worker on the pinned commit. */
export interface FindingScanTest { state: ScanTestState; detail: string | null; path: string; source: string }

export interface FindingRef { path: string; line: number; /** What the line shows; empty when the model gave none. */ claim: string }
export interface FindingVerification { kind: "test" | "reasoning"; result: string; notes: string; /** Verify score, 1 to 10; null for a finding that was not verified. */ score: number | null; /** A failing test the model proposed; the scan does not run it. */ proposedTest: string | null }
/** One event of the finding's scan that concerns it: the threat model, its area's scan, its verification (model calls, with cost), or a later scan that found it again (`duplicate`, no cost). */
export interface FindingCall { kind: "model" | "area" | "verify" | "test" | "fix" | "review" | "duplicate"; at: string; endedAt: string | null; ok: boolean; costUsd: number | null }

export interface FindingView extends FindingSummary {
  refs: FindingRef[];
  reach: string;
  impact: string;
  verification: FindingVerification | null;
  scanTestResult: FindingScanTest | null;
  /** The unified diff of the private fix, once there is one. */
  fixDiff: string | null;
  fixPr: number | null;
  /** Link to the fix pull request: the public one for a quiet landing, the one inside the advisory's private fork for the advisory route. */
  fixPrUrl: string | null;
  ghsaId: string | null;
  /** Link to the draft or published advisory. */
  advisoryUrl: string | null;
  /** One line: why the last fix attempt failed, or what a repository admin must do. */
  note: string | null;
  /** The reason given when dismissing. */
  reason: string | null;
  decidedBy: string | null;
  timeline: FindingCall[];
}

export interface SecurityOverview { scans: ScanView[]; findings: FindingSummary[] }

export type ScanAreaState = "pending" | "running" | "done" | "failed";
export interface ScanArea { idx: number; name: string; risk: number; why: string | null; paths: string[]; state: ScanAreaState; costUsd: number }
export interface ScanEntryPoint { name: string; kind: string; where: string }
export type ScanCallState = "running" | "done" | "failed";
/** One model call of a scan, in order. `runId` links the agent run holding its prompt and output (null for a call that made none). */
export interface ScanCall {
  id: number;
  kind: FindingCall["kind"];
  areaName: string | null;
  findingNumber: number | null;
  state: ScanCallState;
  startedAt: string;
  endedAt: string | null;
  costUsd: number | null;
  runId: number | null;
  /** The latest line of what a running call is doing. */
  progress: string | null;
}
export interface ScanDetail {
  scan: ScanView;
  summary: string | null;
  entryPoints: ScanEntryPoint[];
  areas: ScanArea[];
  calls: ScanCall[];
  findings: FindingSummary[];
}

/** One of the signed-in user's agent tokens for the Inbox MCP server; the token itself is shown only when made. `canAnswer`: an operator's token whose agent may answer decisions. */
export type McpToken = { id: number; label: string | null; canAnswer: boolean; createdAt: string; lastUsedAt: string | null; expiresAt: string };
/** The user's live tokens, the most they may hold, and the server's MCP path (on the dashboard's own origin). */
export type McpTokens = { tokens: McpToken[]; max: number; path: string; /** Whether an operator may make a token that answers decisions. */ answering: boolean };
/** After making a token: the list, the new token's id, and its value, shown this once. */
export type McpTokenCreated = McpTokens & { id: number; token: string };

// ---- redesign: one status per item, Home, the two-sided item page, findings as items ----------------------------

export type ItemPhase = "Triage" | "Waiting for a person" | "Review" | "Fixing" | "Verifying" | "In queue" | "Merged" | "Closed" | "Held" | "Out of scope" | "Pipeline off";

/** Where an item is, what it waits for and what happens next; every page draws the same line. */
export interface ItemStatus {
  phase: ItemPhase;
  /** What it waits for, in words ("CI on a1b2c3d", "a Merge? answer"); null when it does not wait. */
  waiting: string | null;
  /** What happens when the wait ends. */
  next: string | null;
  /** When the item entered this state. */
  since: string;
  /** Held for model work because its author is outside the team: over the daily limit or in a surge. */
  outside?: OutsideHold;
}

/** Why an outside author's item waits for model work. `limit` is the author's daily limit for the item's kind. */
export type OutsideHold = { reason: "limit" | "surge"; author: string; kind: "pr" | "issue"; limit: number };
/** The outside-author protections: the three numbers (0 turns one off) and how many items are held now. */
export type OutsideState = { prsPerDay: number; issuesPerDay: number; surgePerHour: number; heldByLimit: number; heldBySurge: number; authors: number; /** The surge breaker while it is tripped. */ tripped: { reason: string; since: string } | null };
/** One item held for its author, in the group row of Needs you. */
export type NeedsOutsideRow = { id: string; repo: RepoName; number: number; title: string; kind: "pr" | "issue"; reason: "limit" | "surge"; createdAt: string | null };

export type ProblemKind = "stopped" | "health" | "stuck" | "gave-up";
export interface HomeProblem { kind: ProblemKind; title: string; detail: string; to: string }
/** Decision kinds, staff-only findings, and the Feedback and Stopped tabs of Needs you; `total` counts what the Needs you badge counts. */
export type NeedKind = DecisionKind | "security" | "feedback" | "stopped";
export interface HomeNeed { id: string; kind: NeedKind; repo: RepoName; number: number | null; title: string; recommendation: string | null; askedAt: string; itemKind: ItemKind | null; to: string }
export interface HomeDone { at: string; what: "merged" | "closed" | "review posted"; repo: RepoName; number: number; title: string; kind: ItemKind }
export interface Home {
  needs: { total: number; byKind: Partial<Record<NeedKind, number>>; oldest: HomeNeed[] };
  problems: HomeProblem[];
  /** Counts per phase; each opens Items filtered to that phase. */
  phases: Record<ItemPhase, number>;
  running: string;
  progress: { openNow: number; openAtStart: number; done24h: number; byAutoCraftPct: number; perHour: number[]; spendTodayUsd: number };
  done: HomeDone[];
}

export type ReviewTrigger = "new-head" | "discussion" | "operator" | "base" | "model-change";
export type ReviewVerdict = "take" | "take-fix" | "hold" | "close";
export interface ReviewClaim { path: string; line: number; text: string }
/** One Opus review of a head. On GitHub the reviews are one comment, edited in place. */
export interface OpusReviewEntry {
  id: string;
  head: string;
  /** The PR's head is still this commit. */
  current: boolean;
  at: string;
  trigger: ReviewTrigger;
  /** Why it ran, in a sentence ("Two new commits since the last review"). */
  why: string;
  verdict: ReviewVerdict;
  sure: boolean;
  summary: string;
  fixes: string[];
  risks: string[];
  claims: ReviewClaim[];
  /** Items this review says must land first; empty when none. */
  blockedBy: ItemRef[];
  costUsd: number;
}
export interface ReviewHistory { latest: OpusReviewEntry | null; earlier: OpusReviewEntry[] }


export type HistoryKind = "model" | "write" | "decision" | "event";
export interface HistoryCall { label: string; kind: "model" | "tool"; costUsd: number | null }
export interface HistoryEntry {
  id: string;
  at: string;
  step: string;
  outcome: string;
  /** Model that ran the step, if any. */
  model: string | null;
  costUsd: number | null;
  kind: HistoryKind;
  calls: HistoryCall[];
  /** The GitHub write this row made; links to the same write on the GitHub side. */
  writeId: string | null;
}

export type GithubTab = "conversation" | "commits" | "checks" | "files";
export interface GithubEvent {
  id: string;
  type: "opened" | "comment" | "review" | "label" | "push" | "merged" | "closed";
  at: string;
  actor: string;
  body: string | null;
  /** Set for AutoCraft's own writes: the identity it wrote as and the history row that made it. */
  autocraft: { as: string; historyId: string } | null;
}
export interface GithubSide {
  description: string;
  events: GithubEvent[];
  checks: { name: string; state: CiState }[];
  commits: { sha: string; message: string; author: string; at: string; byAutoCraft: boolean }[];
  files: { path: string; additions: number; deletions: number }[];
  url: string;
  /** When AutoCraft last read the item from GitHub. */
  syncedAt: string | null;
}

/** What the item page header and its overflow menu need: labels, people, queue place and the operator's controls. */
export interface ItemPageHeader {
  labels: string[];
  assignees: string[];
  autocraftAssigned: boolean;
  pipelineOn: boolean;
  discord: DiscordInfo | null;
  queue: QueueSlot | null;
  fastTracked: boolean;
  held: boolean;
  preapproval: Preapproval | null;
  releases: ItemReleases;
  tier: Tier;
  /** PRs: size from changed lines; null for issues. */
  size: "S" | "M" | "L" | "XL" | null;
}

export type ItemBarTone = "running" | "queued" | "waiting" | "failed" | "done" | "idle";
export interface ItemBarHeadline {
  tone: ItemBarTone;
  /** What is happening, without the model and the elapsed time of a running job. */
  text: string;
  /** What happens next, in words; null when nothing is known. */
  next: string | null;
  /** Running: the model of the job's call in flight. */
  model: string | null;
  /** Running: when the job started; the page counts the elapsed time from it. */
  startedAt: string | null;
  /** The job behind the headline (running, queued or failed), when there is one. */
  jobId: number | null;
  /** Held for model work because its author is outside the team; operators get a Release button. */
  outside?: OutsideHold;
}
export interface ItemBarStep {
  /** Registry stage id. */
  stage: string;
  title: string;
  state: "done" | "current" | "failed" | "next";
  /** The current stage has a job running (animated); otherwise it is waiting. */
  running: boolean;
  /** When a done or failed stage ended. */
  at: string | null;
  costUsd: number | null;
  jobId: number | null;
}
export interface ItemBar { headline: ItemBarHeadline; steps: ItemBarStep[] }

export type TimelineTone = "ok" | "warn" | "bad" | "neutral";
export type TimelineIcon = "review" | "fixup" | "merge" | "push" | "github" | "check" | "job" | "chat" | "person";
/** One line of the item's story: a turn of a person or Opus, or a line of the harness's work (`kind: "harness"`; the page folds runs of the minor ones). */
export interface TimelineEntry {
  /** Stable across fetches. */
  id: string;
  at: string;
  kind: "person" | "opus" | "harness";
  /** A login, "Opus" or "AutoCraft". */
  actor: string;
  icon: TimelineIcon;
  text: string;
  tone: TimelineTone;
  costUsd: number | null;
  /** Shown on its own; the other harness lines fold into runs. */
  major: boolean;
  jobId: number | null;
  /** The review's id in `reviews`. */
  reviewId: string | null;
  /** The GitHub-side write this line made, to jump there. */
  githubId: string | null;
  /** A pushed commit's short sha. */
  commit: string | null;
  /** The pre-approved merge this line belongs to, for Try again and Cancel. */
  preapproval: { id: number; state: Preapproval["state"]; latest: boolean } | null;
  calls: HistoryCall[];
  /** The longer text of the line: a message, a note, instructions. Markdown when `markdown`. */
  body: string | null;
  markdown: boolean;
  /** More detail, one per line: reasons, files, findings. */
  lines: string[];
  /** A maintainer's or operator's post on a question: its include-for-Opus source, the question and the option picked. */
  feedback: { source: string; decisionId: string; pick: string | null; write: boolean; open: boolean } | null;
}
/** The screenshot run of a pull request's latest head: images at the base ("before") and at the head ("after"), served by the task artifact route. */
export interface ScreenshotRun {
  head: string;
  /** Whether `head` is still the PR's head. */
  current: boolean;
  state: "planned" | "running" | "rendered" | "compared" | "error" | "stale" | "skipped";
  verdict: "unchanged" | "as-claimed" | "unrelated" | "unclear" | "regression" | null;
  clear: boolean | null;
  comparison: string | null;
  /** The run's clear regression holds the merge. */
  held: boolean;
  /** The planner's reason, or the error text of a run in state error. */
  reason: string | null;
  model: string | null;
  at: string;
  shots: { name: string; before: { taskId: number; name: string }; after: { taskId: number; name: string } }[];
}
export interface ItemPageData {
  repo: RepoName;
  number: number;
  kind: ItemKind;
  state: ItemState;
  title: string;
  author: string;
  /** Changes when anything the page shows changes; send it back as `since`. */
  stamp: string;
  header: ItemPageHeader;
  status: ItemStatus;
  /** The live status bar: what is happening to the item now and its path through the pipeline. */
  bar: ItemBar;
  costUsd: number;
  /** Opus's reviews, newest first: the detail of the review lines of the timeline. */
  reviews: ReviewHistory;
  /** The item's story, oldest first (last 200 lines). */
  timeline: TimelineEntry[];
  github: GithubSide;
  /** PRs: our own build of the newest head; null or absent when the pr-builds switch is off or there is none. */
  prBuild?: ItemPrBuild | null;
  /** The latest head's screenshot run, for operators and maintainers; empty otherwise. */
  screenshots: ScreenshotRun[];
}
/** The answer to `since=<stamp>` when nothing on the item page has changed. */
export type ItemPageUnchanged = { unchanged: true; stamp: string };

/** One row of the Items list. */
export interface ItemStatusRow {
  repo: RepoName;
  number: number;
  kind: ItemKind;
  state: ItemState;
  title: string;
  status: ItemStatus;
  updatedAt: string;
}
export interface ItemStatusFilter { q?: string; phase?: ItemPhase; kind?: ItemKind; repo?: RepoName[]; /** Only items mentioned in a watched Discord channel. */ discord?: boolean; cursor?: string }
/** `byPhase` and `total` count every row that matches the filter except `phase`; `nextCursor` is null on the last page. */
export interface ItemStatusList { rows: ItemStatusRow[]; byPhase: Record<ItemPhase, number>; total: number; nextCursor: string | null }

/** A finding's status line, on the shape items use. */
export interface FindingRow { repo: RepoName; number: number; title: string; severity: FindingSeverity; state: FindingState; urgent: boolean; area: string; status: ItemStatus; attempts: number; updatedAt: string }
export type SecurityGroup = "Needs a person" | "Fixing" | "Ready to land" | "Landing" | "Landed or published" | "Dismissed or backlog";
export interface SecurityList { groups: { group: SecurityGroup; rows: FindingRow[] }[] }
export interface FixRound { round: number; outcome: "passed" | "failed"; why: string; at: string; costUsd: number }
export interface FindingPageData { finding: FindingView; /** The finding's open question and its choices, in the shape decisions use; null when nothing is open. */ decision: Decision | null; choices: DecisionChoices | null; status: ItemStatus; attempts: number; rounds: FixRound[]; history: HistoryEntry[]; costUsd: number }

export type DownloadsRange = "all" | "today" | "yesterday" | "7d" | "30d" | "90d" | "12m" | "1h" | "3h" | "6h" | "12h";

export interface DownloadsBar { key: string; label: string; count: number }

export interface DownloadsReport {
  range: DownloadsRange;
  from: string | null;
  to: string;
  /** First recorded poll; ranges starting earlier only count from here. Null before the first poll. */
  historyFrom: string | null;
  apps: { repo: string; name: string }[];
  totals: { downloads: number; issuesOpened: number; issuesClosed: number; prsMerged: number; stars: number; issuesPer1k: number | null };
  /** `stars` is gained in the range, or the total for "all". */
  byApp: { repo: string; name: string; downloads: number; stars: number }[];
  platforms: DownloadsBar[];
  processors: DownloadsBar[];
  formats: DownloadsBar[];
  /** Top 7 releases ("<App> v<x>") and "Other versions". */
  versions: DownloadsBar[];
  /** Newest 50. */
  releases: { repo: string; app: string; tag: string; publishedAt: string; latest: boolean; downloads: number; issues: number; per1k: number | null }[];
}
