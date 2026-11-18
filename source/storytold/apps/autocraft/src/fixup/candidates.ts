// What the fix-up step works on (the PRs come from their Plans, fixup/select.ts): candidate shapes, fix lists and tries.
import type { DatabaseSync } from "node:sqlite";
import { FORMAT_REASONS, safePath } from "./patch.ts";
import type { ConflictCandidate } from "./conflict-state.ts";
import { FIXUP_MAX_ATTEMPTS } from "../core/rules.ts";

/** Fix-up tries per PR (pushed, failed, refused or rejected) before the step leaves it to a person. */
export const MAX_ATTEMPTS = FIXUP_MAX_ATTEMPTS;

export type Fix = { file: string; change: string };
/** Parts of PRs closed as duplicates that a duplicate group's kept PR should take over (src/act/dupe-groups.ts queues them). */
export type Carry = { decisionId: string; /** The suggestion comment stored with the answer, posted as it is when the branch can't be pushed to. */ suggestion: string | null; sources: { number: number; head: string | null; points: string[] }[] };
/** `carry` set: the candidate is a carry-over job; its fixes are worked out from the source PRs' diffs when it runs. */
/** `model` wrote the text the ask comment carries: the Opus review's fix list, or the stored suggestion of a carry-over. */
export type FixCandidate = { repo: string; number: number; head: string; reason: string; fixes: Fix[]; attempt: number; model: string | null; servingMetadata?: string | null; carry?: Carry;
  /** `premerge`: the fixes are the pre-merge review's defect fixes; the PR's one pre-merge round, apart from the take-fix tries. */
  source?: "premerge" | "operator";
  /** An operator's fix-up (source `operator`): the instructions replace the fix list; the files are the PR's own changed files. */
  operator?: { id: number; instructions: string };
  /** A stored model patch whose lint task ended: the collect step pushes it with the format changes folded in, or asks the model again with the findings. */
  lint?: LintWork };
/** The fixups row of a stored patch: `lint_state` is `pending` (first task) or `requeued` (the lost task was queued once more). */
export type LintWork = { servingMetadata?: string | null; rowid: number; round: number; task: number | null; state: string; patch: string; /** The kept model session that wrote the patch (src/prepush/resume.ts). */ session: string | null; /** An operator fix-up model's list of what the patch changes. */ changes: string[] };
export type FixSelection = {
  /** Take-fix PRs we may push to, in a repo with push approval. */
  fix: FixCandidate[];
  /** Take-fix PRs we can't push to that have no hold row at this head yet. */
  cannotPush: FixCandidate[];
  /** Take-fix PRs we can't push to, in a repo with comment approval, with no comment at this head yet. */
  ask: FixCandidate[];
  /** Stored patches whose lint task ended (the Plan's `lint` action, step fixup). */
  lint: FixCandidate[];
  /** Conflicted take / take-fix PRs we may push to: the default branch is merged in. */
  conflictMerge: ConflictCandidate[];
  /** Conflicted PRs we can't push to, in a repo with comment approval, with no comment at this head yet. */
  conflictAsk: ConflictCandidate[];
};

export function parseFixes(s: string | null): Fix[] {
  try {
    const v = JSON.parse(s ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((f): f is Fix => !!f && typeof f.file === "string" && typeof f.change === "string" && safePath(f.file)) : [];
  } catch { return []; }
}

export const FIXUP_STATES = ["pushing", "pushed", "failed", "refused", "rejected", "cannot-push", "too-large", "asked", "comment-failed", "comment-unsent", "push-denied", "superseded"] as const;
export type FixupState = (typeof FIXUP_STATES)[number];

/** States that count as a try; the other three are recorded once per head and end the step's work on that head. */
const ATTEMPT_STATES: FixupState[] = ["pushing", "pushed", "failed", "refused", "rejected"];

/** Refusals for a wrong hunk header count (fixed by recounting since) are not tries. Pre-merge rounds have their own budget. */
export function attemptsOf(db: DatabaseSync, repo: string, number: number): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM fixups WHERE repo = ? AND number = ? AND source IS NULL AND state IN (${ATTEMPT_STATES.map(() => "?").join(",")})
      AND NOT (state = 'refused' AND (${FORMAT_REASONS.map(() => "COALESCE(reason, '') LIKE ?").join(" OR ")}))`)
    .get(repo, number, ...ATTEMPT_STATES, ...FORMAT_REASONS.map((r) => `${r}%`)) as { n: number }).n;
}
