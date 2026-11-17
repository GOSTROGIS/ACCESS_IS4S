// Input and limits of the prepare prompt. No Node imports: the prompt registry imports this file.

/** What the prepare call sees of one open decision. */
export type PrepareInput = {
  /** "repo#number" of the item (a group decision: its primary item). */
  ref: string;
  /** Where the call may read the checkout inside the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  /** Set when the repo's reference folder is mounted at /reference; not part of the quoted JSON. */
  reference?: boolean;
  /** A decision about several items, or one that is not the item's current question: the reply has a summary and a pick only; not part of the quoted JSON. */
  group?: boolean;
  /** The item as the prompt sees it: title, body, author association, labels, first comments. */
  item: Record<string, unknown>;
  /** A group decision's members, same shape as `item`. */
  members?: Record<string, unknown>[];
  /** A pull request's head commit, size and diff (the code files; null when it is too large or unavailable). */
  pr?: { head: string | null; lines: { additions: number | null; deletions: number | null; files: number | null }; diff: string | null; /** Current CI overall state (null: unknown) and mergeable state; the decision's facts are from ask time. */ live?: { ci: string | null; mergeable: string } };
  question: string;
  facts: string[];
  options: { key: string; label: string; hint: string }[];
  /** The core actions of the decision with the extra kinds each takes; empty for a decision without cores (a group). */
  cores: { key: string; label: string; extras: string[] }[];
  /** What stopped the pipeline: the output of the call that asked, as stored (review, classifier labels, duplicate comparison, the question's context). */
  stopped: Record<string, unknown>;
  /** The operator messages of the item's conversation, newest last, as the conversation prompt shows them. */
  operator_turns?: string;
  /** Second call only: why parts of the first reply were dropped, so the model corrects them. */
  previous?: string[];
};

export const PREPARE_REASON_MAX = 200;
/** The prompt asks for about PREPARE_SUMMARY_TARGET characters; a longer summary is kept up to PREPARE_SUMMARY_MAX so a long reply is not thrown away. */
export const PREPARE_SUMMARY_TARGET = 800;
export const PREPARE_SUMMARY_MAX = 2500;
export const PREPARE_BODY_LIMIT = 4000;
export const PREPARE_DIFF_LIMIT = 120_000;
export const PREPARE_STOPPED_LIMIT = 6000;
export const PREPARE_TURNS_LIMIT = 6000;
export const PREPARE_MEMBERS = 8;

export const SAMPLE_PREPARE: PrepareInput[] = [{
  ref: "photocraft#1562",
  item: {
    ref: "photocraft#1562", kind: "issue", title: "Add an in-app AI assistant for 16-bit PNG cleanup",
    body: "Adds an assistant panel. The default endpoint is our hosted service (paid plan). The reference app has this, see docs/gaps.md row 14.",
    author_association: "NONE", labels: ["enhancement"], comments: [],
  },
  question: "Is this wanted in core?",
  facts: ["photocraft issue, opened 3 days ago, 0 comments", "author: someone, new contributor"],
  options: [
    { key: "take", label: "Wanted in core", hint: "In scope: brings us closer to the reference app. Keep open; PRs go to review." },
    { key: "plugin", label: "Plug-in candidate", hint: "Not for core. Keep open and label it plugin candidate." },
    { key: "need-info", label: "Check the reference app", hint: "Ask how the reference app behaves before deciding." },
    { key: "close", label: "Out of scope", hint: "Not wanted. Close with a short reason." },
  ],
  cores: [
    { key: "o:take", label: "Wanted in core", extras: ["comment", "label", "unlabel", "assign", "open_issue"] },
    { key: "o:plugin", label: "Plug-in candidate", extras: ["comment", "label", "unlabel", "assign", "open_issue"] },
    { key: "o:need-info", label: "Check the reference app", extras: ["comment", "label", "unlabel", "assign"] },
    { key: "o:close", label: "Out of scope", extras: ["label", "unlabel", "assign", "open_issue"] },
    { key: "backlog", label: "Later", extras: [] },
  ],
  stopped: {
    context: "The classifiers settled on missing feature and flagged it as needing a maintainer's call.",
    classifications: [{ classifier: "jev", type_label: "missing feature", want: "unclear", reason: "Asks for a feature the reference app may have." }],
  },
}];
