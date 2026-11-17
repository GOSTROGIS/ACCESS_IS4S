// Review prompt input types and limits. No I/O and no Node imports: the
// prompt registry (also loaded by the web mockup) imports this file.

/** Characters kept of one discussion entry and of a PR's whole discussion. */
export const ENTRY_LIMIT = 1200;
export const TOTAL_LIMIT = 9000;

export type DiscussionEntry = {
  kind: "thread" | "review" | "comment" | "note";
  author?: string | null;
  at?: string | null;
  /** Reviews: APPROVED, CHANGES_REQUESTED or COMMENTED. */
  state?: string | null;
  /** Threads: where the comment sits. */
  path?: string;
  line?: number | null;
  /** Threads: the code the comment is about has since changed. */
  outdated?: boolean;
  /** Threads: the latest replies, ours left out. */
  replies?: { author: string | null; body: string }[];
  body: string;
};

export const REVIEW_BODY_LIMIT = 2000;
export const VERDICTS = ["take", "take-fix", "hold", "close"] as const;
export type ReviewVerdict = (typeof VERDICTS)[number];
