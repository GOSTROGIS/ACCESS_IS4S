// The CI fix step's candidate shape and limits. The PRs come from their Plans (cifix/select.ts): an open PR whose current head has a
// final take or take-fix review and whose checks (read at that head) fail.
import { CIFIX_MAX_PUSHES_PER_PR, CIFIX_MAX_TRIES, CIFIX_MAX_TRIES_PER_PR } from "../core/rules.ts";

/** Tries per head (a formatter run, a pushed or rejected patch) before the step leaves the PR to a person. */
export const MAX_TRIES = CIFIX_MAX_TRIES;
/** Pushed CI fixes and tries in all, over every head of a PR: our own pushes make new heads, so a per-head limit alone never ends. */
export const MAX_PUSHES_PER_PR = CIFIX_MAX_PUSHES_PER_PR;
export const MAX_TRIES_PER_PR = CIFIX_MAX_TRIES_PER_PR;

export type CifixCandidate = {
  repo: string; number: number; head: string; verdict: "take" | "take-fix"; reason: string;
  /** This try's number at the head. */
  attempt: number;
  /** branch: the branch accepts our push. comment: it does not, and the repo allows comments. */
  route: "branch" | "comment";
  /** The one rerun of this head was done; the failure is read again as something to fix. */
  rerun: boolean;
  /** When the rerun was requested (ISO), else null. */
  rerunAt: string | null;
  /** A stored model patch whose lint task ended: the collect step pushes it with the format changes folded in, or asks the model again with the findings. */
  lint?: { servingMetadata?: string | null; rowid: number; round: number; task: number | null; state: string; patch: string; files: string[]; /** The kept model session that wrote the patch (src/prepush/resume.ts). */ session: string | null };
};

export type CifixSelection = {
  /** PRs the step reads, triages and fixes. */
  work: CifixCandidate[];
  /** Formatter tasks that ended: their results are applied. */
  collect: { c: CifixCandidate; task: number }[];
  /** PRs at their push or try limit: a final `capped` row with a note on the item is written once. */
  capped: CifixCandidate[];
  /** PRs whose CI fix is capped or gave up at this head: the contributor is asked once, naming the failing checks. */
  ask: CifixCandidate[];
  /** Stored patches whose lint task ended (the Plan's `lint` action, step cifix). */
  lint: CifixCandidate[];
  /** Infra failures due their one rerun, with the run ids to rerun. */
  rerun: { c: CifixCandidate; runs: number[] }[];
};
