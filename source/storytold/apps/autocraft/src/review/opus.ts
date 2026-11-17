// Stage 5, Review: Opus reviews every wanted PR, one PR per call, and its verdict is the
// one every later stage reads (the `final_reviews` view). After a new push Opus reads only
// the delta since the head it reviewed before. Reads GitHub (diffs); never writes to it.
import type { DatabaseSync } from "node:sqlite";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { currentJobId, queueRoom } from "../agents/call.ts";
import { pool } from "../classify/run.ts";
import { runModelStep } from "../agents/step.ts";
import { REVIEW_OPUS } from "../agents/steps.ts";
import { Client, type Querier } from "../mirror.ts";
import { checksOf, refreshChecks } from "./checks.ts";
import { openBlockers } from "./blockers.ts";
import { isScopeQuestion, settledScope } from "./candidates.ts";
import { recordReviewFailure, reviewHolds } from "./gate.ts";
import { MAX_RERUNS_PER_DAY, countRerun, discussionOf, ensurePipelineLogin, liveDiscussion, markedStaleSince, staleReviews, withRetry, type Snapshot } from "./discussion.ts";
import { withdrawHoldQuestion, withdrawMergeQuestion } from "../merge/withdraw.ts";
import { headWasUnsure, mergeDecisionId, holdDecisionId } from "../merge/queue.ts";
import { defaultBranchOf, recordLiveBase, reviewedBaseOf } from "../merge/base.ts";
import { relatedOpen, latestReview } from "../postmerge/related.ts";
import { HISTORY_COPY_SQL } from "../db.ts";
import type { DiscussionEntry } from "./parse.ts";
import { reviewAfterBaseMerge } from "./own-diff.ts";
import { MAX_DIFF_CHARS, cachedDiff, cachedDiffBase, codeDiff, ghDelta, ghDiff, type DeltaFetcher, type DiffFetcher } from "./diff.ts";
import { selectOpusCandidates, type OpusCandidate } from "./opus-candidates.ts";
import { carriedOutcome, rawReason, type EarlierOpus, type OpusPr, type OpusReview, type UnappliedFix } from "./opus-parse.ts";
import { ourCommitsSince } from "./ours.ts";
import { relatedStatements } from "../memory/retrieve.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { checkoutForPr } from "../sandbox/index.ts";
import { referenceDir } from "../reference.ts";
import { defaultSemanticDeps, type SemanticDeps } from "../reference-lint.ts";
import { jobItem } from "../runner/job-items.ts";

const PROMPT = CLAUDE_PROMPTS["review.opus"];
export { MAX_DIFF_CHARS };
export const TOO_LARGE = "too large to review automatically";

export type OpusParams = {
  repo: string; limit?: number; dryRun?: boolean;
  /** Called with the running count of PRs handled. */
  onHandled?: (n: number) => void;
};
export type OpusDeps = {
  /** Reads the live head and state of the candidates just before the model calls; absent: the mirror's view stands. */
  querier?: Querier;
  fetchDiff: DiffFetcher; fetchDelta: DeltaFetcher; model: string; maxChars: number;
  /** Host directory with a read-only checkout of the PR head for a sandboxed call, or null to ask without tools. Absent: no tools. */
  checkout?: (repo: string, number: number, head: string) => Promise<string | null>;
  /** The Jev and Haiku calls of the semantic reference check; absent: the real ones. */
  semantic?: SemanticDeps;
};
export type OpusSummary = {
  runId: string; repo: string; candidates: number; reviewed: number; dropped: number;
  verdicts: Record<string, number>; missing: string[]; skipped: string[];
};

const now = () => new Date().toISOString();
const scopeSettledField = (db: DatabaseSync, repo: string, number: number): { scope_settled?: NonNullable<OpusPr["scope_settled"]> } => {
  const s = settledScope(db, repo, number);
  return s ? { scope_settled: s } : {};
};
const refOf = (c: { repo: string; number: number }) => `${c.repo}#${c.number}`;

export function defaultOpusDeps(): OpusDeps {
  return { querier: new Client(500), fetchDiff: ghDiff, fetchDelta: ghDelta, model: PROMPT.models[0]!, maxChars: MAX_DIFF_CHARS, checkout: (r, n, h) => checkoutForPr(r, n, h, console.log) };
}

type Saved = { snap?: Snapshot; mode: "full" | "delta" | "carried"; base: string | null; model: string | null; review: OpusReview; /** The fixes this review was given as unapplied, with what the reply did with each. */ unapplied?: (UnappliedFix & { outcome: string })[];
  /** The base branch the reviewed diff was read against (a delta or carried review: the earlier review's); absent: the cached diff's, else the mirrored base. */ baseRef?: string | null };

/**
 * Stores the Opus row of a head commit, then a `reviewed` stages row and a take/hold/close
 * stages row (take-fix counts as take). A second review of the same head counts against
 * the PR's daily cap unless an operator or a merge-time check asked for it.
 * A review of the head against another base than the one before it voids what was decided for the old diff:
 * the Merge answer, the pre-merge review and the verification.
 */
export function saveOpus(db: DatabaseSync, runId: string | null, c: { repo: string; number: number; head_oid: string }, s: Saved): void {
  const at = now(), r = s.review;
  const again = db.prepare("SELECT at FROM opus_reviews WHERE repo = ? AND number = ? AND head_oid = ?").get(c.repo, c.number, c.head_oid) as { at: string } | undefined;
  const baseRef = s.baseRef !== undefined ? s.baseRef : reviewedBase(db, c);
  const before = again ? reviewedBaseOf(db, c.repo, c.number, c.head_oid) ?? defaultBranchOf(db, c.repo) : null;
  const rebased = !!before && !!baseRef && before !== baseRef;
  const reviewed = db.prepare("SELECT at FROM opus_reviews WHERE repo = ? AND number = ? AND head_oid = ? AND verdict IS NOT NULL").get(c.repo, c.number, c.head_oid) as { at: string } | undefined;
  if (reviewed && !markedStaleSince(db, c.repo, c.number, reviewed.at)) countRerun(db, c.repo, c.number);
  // A head that was ever unsure keeps its Merge? question (and a person's answer to it) through a re-review that stays take or take-fix.
  // An answered question is withdrawn as for any re-review: the head then needs a new answer.
  const unanswered = !!db.prepare("SELECT 1 FROM decisions WHERE id = ? AND answer IS NULL").get(mergeDecisionId(c.repo, c.number, c.head_oid));
  const keepsQuestion = !!again && !rebased && unanswered && (r.verdict === "take" || r.verdict === "take-fix") && headWasUnsure(db, c.repo, c.number, c.head_oid);
  // An answered, unapplied merge answer stands through a re-review at the same head and base unless the verdict got worse.
  const keepsAnswer = !!again && !rebased && (r.verdict === "take" || r.verdict === "take-fix") && r.sure
    && !!db.prepare("SELECT 1 FROM decisions WHERE id = ? AND answer = 'merge' AND applied_at IS NULL").get(mergeDecisionId(c.repo, c.number, c.head_oid));
  if (again && !keepsQuestion && !keepsAnswer) {
    const worse = r.verdict === "take" || r.verdict === "take-fix" ? "the new review is unsure" : `the new review is a ${r.verdict}`;
    withdrawMergeQuestion(db, c.repo, c.number, c.head_oid, at, rebased ? `the base branch changed from ${before} to ${baseRef}` : `superseded by a new review: ${worse}`);
  }
  if (rebased) {
    db.prepare("DELETE FROM premerge_reviews WHERE repo = ? AND number = ? AND head_oid = ?").run(c.repo, c.number, c.head_oid);
    db.prepare("UPDATE verifications SET state = 'stale' WHERE repo = ? AND number = ? AND head_sha = ?").run(c.repo, c.number, c.head_oid);
  }
  // The Hold question belongs to one review: a review made again at the head asks it anew if the verdict is still hold.
  // An unanswered or Wait-answered question stays while the verdict is still hold: its review time moves, so the prepare is written again.
  const holdId = holdDecisionId(c.repo, c.number, c.head_oid);
  const keepsHold = r.verdict === "hold" && !!db.prepare("SELECT 1 FROM decisions WHERE id = ? AND (answer IS NULL OR answer = 'wait')").get(holdId);
  if (again && !keepsHold) withdrawHoldQuestion(db, c.repo, c.number, c.head_oid, at, "superseded by a new review");
  // The row about to be replaced may predate the history: copy it first.
  db.prepare(`${HISTORY_COPY_SQL} AND o.repo = ? AND o.number = ? AND o.head_oid = ?`).run(c.repo, c.number, c.head_oid);
  const risks = JSON.stringify(r.risks), fixes = r.fixes.length ? JSON.stringify(r.fixes) : null, pub = r.public ? JSON.stringify(r.public) : null, claims = r.claims.length ? JSON.stringify(r.claims) : null;
  // Only open tracked items other than the PR can block it: a reference that is already closed would end the wait at once.
  // A scope question is no blocker once a person has settled scope for this PR.
  const scopeSettled = settledScope(db, c.repo, c.number) !== null;
  const blockers = r.verdict === "hold" ? openBlockers(db, r.blocked_by.filter((x) => x !== `${c.repo}#${c.number}`)).filter((b) => !(scopeSettled && isScopeQuestion(db, b))) : [];
  const blockedBy = blockers.length ? JSON.stringify(blockers) : null;
  db.prepare(`INSERT INTO opus_review_history (repo, number, head_oid, at, model, mode, verdict, sure, reason, risks, fixes, summary, why, public_review, claims, blocked_by, trigger, job_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(c.repo, c.number, c.head_oid, at, s.model, s.mode, r.verdict, r.sure ? 1 : 0, r.reason, risks, fixes, r.summary, r.why, pub, claims, blockedBy,
    again ? (markedStaleSince(db, c.repo, c.number, again.at) ? "operator" : rebased ? "base" : "discussion") : "new-head", currentJobId());
  db.prepare(`INSERT OR REPLACE INTO opus_reviews (repo, number, head_oid, run_id, at, model, mode, base_head, verdict, sure, reason, fixes, risks, public_review, seen_at, disc_hash, summary, why, conflicts, claims, blocked_by, base_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(c.repo, c.number, c.head_oid, runId, at, s.model, s.mode, s.base, r.verdict,
    r.sure ? 1 : 0, r.reason, fixes, risks, pub, s.snap?.seen ?? at, s.snap?.hash ?? null, r.summary, r.why, r.conflicts.length ? JSON.stringify(r.conflicts) : null, claims, blockedBy, baseRef);
  db.prepare("DELETE FROM main.settings WHERE key = ?").run(`review_fail:${c.repo}#${c.number}@${c.head_oid}`);
  db.prepare("DELETE FROM opus_carried_fixes WHERE repo = ? AND number = ? AND head_oid = ?").run(c.repo, c.number, c.head_oid);
  for (const u of s.unapplied ?? []) {
    db.prepare("INSERT INTO opus_carried_fixes (repo, number, head_oid, from_head, file, change, outcome, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(c.repo, c.number, c.head_oid, u.head, u.file, u.change, u.outcome, at);
  }
  const stage = db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, ?, ?, ?, ?)");
  stage.run(c.repo, c.number, "reviewed", at, "opus-review", `${r.verdict}${r.sure ? "" : " (unsure)"} at ${c.head_oid.slice(0, 7)}: ${r.reason}`);
  stage.run(c.repo, c.number, r.verdict === "take-fix" ? "take" : r.verdict, at, "opus-review", r.reason);
}

/** The Opus review of the PR's latest earlier head that a model wrote (not a too-large hold), for the delta. */
export function earlierOpus(db: DatabaseSync, c: { repo: string; number: number; head_oid: string }, skip = 0): EarlierOpus | null {
  const o = db.prepare(`SELECT head_oid, verdict, sure, reason, fixes FROM opus_reviews
    WHERE repo = ? AND number = ? AND head_oid <> ? AND verdict IS NOT NULL AND model IS NOT NULL ORDER BY at DESC, rowid DESC LIMIT 1 OFFSET ?`).get(c.repo, c.number, c.head_oid, skip) as
    { head_oid: string; verdict: string; sure: number; reason: string; fixes: string | null } | undefined;
  if (!o) return null;
  let fixes: EarlierOpus["fixes"] = [];
  try { fixes = JSON.parse(o.fixes ?? "[]") as EarlierOpus["fixes"]; } catch { /* none */ }
  return { head: o.head_oid, verdict: o.verdict, sure: o.sure === 1, reason: o.reason, fixes };
}

/**
 * The fixes of the PR's latest earlier reviewed head, when that review was a take-fix whose fixes were never pushed
 * and never posted as a comment (a conflict merge of ours or an author push made a new head first).
 */
export function unappliedFixes(db: DatabaseSync, c: { repo: string; number: number; head_oid: string }): UnappliedFix[] {
  // A hold in between (an author push the reviewer could not judge) does not make the older take-fix's fixes moot.
  let e = earlierOpus(db, c);
  if (e?.verdict === "hold") e = earlierOpus(db, c, 1);
  if (!e || e.verdict !== "take-fix") return [];
  if (db.prepare("SELECT 1 FROM fixups WHERE repo = ? AND number = ? AND from_head = ? AND state IN ('pushed', 'asked')").get(c.repo, c.number, e.head)) return [];
  return e.fixes.filter((f) => typeof f?.file === "string" && !!f.file.trim() && typeof f.change === "string").map((f) => ({ head: e.head, file: f.file, change: f.change }));
}

/** The base branch the review's diff was computed against; the mirrored base when the cached diff does not say. */
function reviewedBase(db: DatabaseSync, c: { repo: string; number: number; head_oid: string }): string | null {
  return cachedDiffBase(c.repo, c.number, c.head_oid)
    ?? (db.prepare("SELECT base_ref FROM items WHERE repo = ? AND number = ?").get(c.repo, c.number) as { base_ref: string | null } | undefined)?.base_ref ?? null;
}

/** `base`: the earlier head a delta was read from; `baseRef`: the base branch the whole PR diff was read against. */
export type PreparedOpus =
  | { kind: "no-diff"; error: string }
  | { kind: "large"; mode: "full" | "delta"; base: string | null; baseRef: string | null }
  | { kind: "no-threads"; error: string }
  | { kind: "ready"; input: OpusPr; snap: Snapshot; mode: "full" | "delta"; base: string | null; baseRef: string | null; /** A maintainer's entry was left out of the discussion for length. */ maintDropped?: boolean };

/**
 * Builds the Opus prompt input of a candidate: diff (full, or the delta since the last Opus review),
 * size cap and discussion. `independent`: the whole diff with no earlier review, discussion or unapplied fixes, for a
 * review that must not be anchored on the first one (the pre-merge review); the snapshot then marks the time of the read.
 */
export async function prepareOpusInput(db: DatabaseSync, repo: string, c: OpusCandidate, deps: OpusDeps, log: (line: string) => void, opts: { independent?: boolean } = {}): Promise<PreparedOpus> {
  const liveBase = (db.prepare("SELECT base_ref FROM items WHERE repo = ? AND number = ?").get(repo, c.number) as { base_ref: string | null } | undefined)?.base_ref;
  const d = await cachedDiff(repo, c.number, c.head_oid, deps.fetchDiff, liveBase);
  if (!d.ok) return d.tooLarge ? { kind: "large", mode: "full", base: null, baseRef: liveBase ?? null } : { kind: "no-diff", error: d.error };
  const baseRef = d.base ?? liveBase ?? null;
  // The read saw the PR's live base: the mirror takes it at once, so the review is not compared with a base the next sync would replace.
  if (d.base && liveBase !== undefined && d.base !== liveBase) recordLiveBase(db, repo, c.number, c.head_oid, d.base, { by: "opus-review", keepDiff: true });
  const ch = checksOf(db, repo, c.number);
  // Test files are shown while they fit the size cap; the merge rule sends a PR whose tests do not fit to a person.
  const cd = codeDiff(d.text, deps.maxChars);
  // The size cap applies to the whole PR, so a small push never lets a too-large PR through as a delta.
  if (cd.text.length > deps.maxChars || (!cd.files.length && cd.testsOmitted.length)) return { kind: "large", mode: "full", base: null, baseRef };
  if (opts.independent) {
    const input: OpusPr = {
      ref: refOf(c), title: c.title, body: c.body, author_association: c.author_association, size: c.size, lines_changed: c.lines_changed,
      ci: ch?.overall ?? "unknown", mergeable: ch?.mergeable ?? null, files: cd.files, tests_omitted: cd.testsOmitted, lockfiles_omitted: cd.lockfilesOmitted,
      mode: "full", earlier_opus: null, diff: cd.text,
      related_open: relatedOpen(db, repo, c.number, cd.files), review_history: latestReview(db, repo, c.number, c.head_oid),
    };
    return { kind: "ready", input: { ...input, statements: relatedStatements(db, repo, c.number), ...scopeSettledField(db, repo, c.number) }, snap: { seen: now(), hash: null }, mode: "full", base: null, baseRef };
  }
  let mode: "full" | "delta" = "full", diff = cd.text, base: string | null = null;
  // A delta stands on the earlier review only when that review read the PR against the same base branch; after a retarget the whole diff is reviewed.
  const prior = earlierOpus(db, c);
  const priorBase = prior ? reviewedBaseOf(db, repo, c.number, prior.head) ?? defaultBranchOf(db, repo) : null;
  const earlier = prior && (priorBase === null || baseRef === null || priorBase === baseRef) ? prior : null;
  // A merge commit of ours carries the base branch's changes since the earlier head, so a delta of the heads would show unrelated changes: the delta is taken between the PR's own diffs.
  const merged = db.prepare("SELECT from_head, own_diff, own_delta FROM conflict_merges WHERE repo = ? AND number = ? AND to_head = ? AND state = 'merged' ORDER BY rowid DESC").get(repo, c.number, c.head_oid) as { from_head: string; own_diff: string | null; own_delta: string | null } | undefined;
  if (earlier && !merged) {
    const delta = await deps.fetchDelta(repo, earlier.head, c.head_oid);
    // A delta whose test files do not all fit is not used: the full diff shows them.
    const dd = delta.ok ? codeDiff(delta.text, deps.maxChars) : null;
    if (dd && !dd.testsOmitted.length) { mode = "delta"; diff = dd.text; base = earlier.head; }
    else if (!delta.ok) log(`  ${refOf(c)}: delta since ${earlier.head.slice(0, 7)} unavailable (${delta.error}); full diff`);
  } else if (earlier && merged?.own_delta && reviewAfterBaseMerge(merged.own_diff) === "delta" && merged.from_head === earlier.head && earlier.sure && (earlier.verdict === "take" || earlier.verdict === "take-fix")) {
    // The delta was computed from the local commits when the merge was made; the diff of the earlier head is never fetched by number.
    const dd = codeDiff(merged.own_delta, deps.maxChars);
    if (dd.text && !dd.testsOmitted.length) { mode = "delta"; diff = dd.text; base = earlier.head; }
  }
  if (diff.length > deps.maxChars) return { kind: "large", mode, base, baseRef };
  let discussion: DiscussionEntry[], snap: Snapshot, maintDropped: boolean;
  try {
    // What the PR's previous review read is not lost to the budget silently: only maintainers' words since then must fit.
    const since = (db.prepare("SELECT COALESCE(seen_at, at) AS seen FROM opus_reviews WHERE repo = ? AND number = ? AND verdict IS NOT NULL ORDER BY at DESC, rowid DESC LIMIT 1").get(repo, c.number) as { seen: string } | undefined)?.seen ?? "";
    ({ entries: discussion, snap, maintDropped } = discussionOf(db, repo, c.number, deps.querier ? await withRetry(() => liveDiscussion(deps.querier!, db, repo, c.number)) : undefined, since));
  } catch (e) {
    return { kind: "no-threads", error: String((e as Error).message ?? e) };
  }
  const unapplied = unappliedFixes(db, c);
  // Our own commits since the earlier reviewed head, for the reviewer to check against what was asked of them.
  const ours = earlier ? ourCommitsSince(db, repo, c.number, earlier.head, c.head_oid).commits.map(({ from: _from, ...x }) => x) : [];
  const input: OpusPr = {
    ref: refOf(c), title: c.title, body: c.body, author_association: c.author_association, size: c.size, lines_changed: c.lines_changed,
    ci: ch?.overall ?? "unknown", mergeable: ch?.mergeable ?? null, files: cd.files, tests_omitted: cd.testsOmitted, lockfiles_omitted: cd.lockfilesOmitted,
    mode, earlier_opus: mode === "delta" ? earlier : null, ...(unapplied.length ? { unapplied_fixes: unapplied } : {}), ...(ours.length ? { pipeline_commits: ours } : {}), diff, discussion,
    related_open: relatedOpen(db, repo, c.number, cd.files),
    statements: relatedStatements(db, repo, c.number),
    ...scopeSettledField(db, repo, c.number),
  };
  return { kind: "ready", input, snap, mode, base, baseRef, ...(maintDropped ? { maintDropped } : {}) };
}

export async function runOpusReview(db: DatabaseSync, params: OpusParams, log: (line: string) => void = console.log, deps: OpusDeps = defaultOpusDeps()): Promise<OpusSummary> {
  const { repo } = params;
  const runId = `opus-review-${repo}-${now().replace(/[-:]/g, "").slice(0, 15)}`;
  let cands = selectOpusCandidates(db, repo);
  const uncapped = staleReviews(db, repo, true);
  const allStale = staleReviews(db, repo);
  const capped = [...allStale].filter((k) => !uncapped.has(k));
  if (capped.length) log(`opus-review ${repo}: ${capped.join(", ")} not reviewed again: already ${MAX_RERUNS_PER_DAY} re-reviews today after new discussion`);
  const summary: OpusSummary = { runId, repo, candidates: cands.length, reviewed: 0, dropped: 0, verdicts: {}, missing: [], skipped: [] };
  if (params.limit !== undefined) cands = cands.slice(0, params.limit);
  if (params.dryRun || !cands.length) {
    log(`opus-review ${repo}: ${summary.candidates} candidates${params.dryRun ? "; dry run, nothing fetched or asked" : ""}`);
    return summary;
  }
  if (deps.querier) {
    // The mirror can be minutes behind: a PR closed, turned draft or pushed since selection returns as a candidate at its new head on a later pass.
    let live;
    try {
      live = await refreshChecks(db, deps.querier, repo, cands.map((c) => c.number), log);
    } catch (e) {
      log(`opus-review ${repo}: live state unavailable (${String((e as Error).message ?? e)}); nothing asked`);
      return summary;
    }
    const asked = cands.length;
    const holds = reviewHolds(db);
    const byNumber = new Map(live.map((l) => [l.number, l]));
    cands = cands.filter((c) => {
      const l = byNumber.get(c.number);
      const ok = !!l && l.state === "OPEN" && !l.is_draft && l.head_oid === c.head_oid;
      // The checks were just read: a head whose CI is running or red waits for the next push or the finished run.
      const hold = ok ? holds(c.repo, c.number, c.head_oid) : null;
      if (hold) { log(`  ${refOf(c)}: not reviewed, waits for ${hold.wait}`); return false; }
      if (!ok) log(`  ${refOf(c)}: dropped, ${l ? `now ${l.state}${l.is_draft ? " draft" : ""} at ${l.head_oid.slice(0, 7)}` : "not found on GitHub"}`);
      return ok;
    });
    summary.dropped = asked - cands.length;
    await ensurePipelineLogin(db, deps.querier).catch(() => {});
    if (!cands.length) return summary;
  }
  let handled = 0;
  const tally = (c: { repo: string; number: number }, r: OpusReview) => { summary.verdicts[r.verdict] = (summary.verdicts[r.verdict] ?? 0) + 1; summary.reviewed++; jobItem(db, c.repo, c.number, `Opus review: ${r.verdict}${r.sure ? "" : " (unsure)"}`, log); };
  await pool(cands.map((c) => async () => {
    const start = now();
    const p = await prepareOpusInput(db, repo, c, deps, log);
    if (p.kind === "no-diff") {
      jobItem(db, c.repo, c.number, `no diff: ${p.error}`, log);
      summary.skipped.push(refOf(c));
      return;
    }
    if (p.kind === "large") {
      const r: OpusReview = { ref: refOf(c), verdict: "hold", sure: true, reason: TOO_LARGE, fixes: [], risks: [], summary: null, why: null, public: null, conflicts: [], claims: [], blocked_by: [] };
      saveOpus(db, runId, c, { mode: p.mode, base: p.base, baseRef: p.baseRef, model: null, review: r });
      tally(c, r);
      params.onHandled?.(++handled);
      return;
    }
    if (p.kind === "no-threads") {
      log(`  ${refOf(c)}: review threads unavailable (${p.error}); not reviewed this pass`);
      summary.skipped.push(refOf(c));
      return;
    }
    const { input, snap, mode, base, baseRef } = p;
    const checkout = (await deps.checkout?.(repo, c.number, c.head_oid)) ?? undefined;
    if (checkout) input.repo_dir = REPO_PATH;
    const dir = referenceDir(repo);
    const semantic = dir ? deps.semantic ?? defaultSemanticDeps(db, input.ref) : undefined;
    const r = await runModelStep(db, REVIEW_OPUS, input, {
      model: deps.model, checkout, reference: checkout ? dir : undefined, ctx: { dir, semantic },
      usage: { run: runId, agent: `opus-${refOf(c).replace("#", "-")}`, stage: "review", items: (ok) => (ok ? 1 : 0) },
      onReply: (reply) => {
        if (reply.fixTurn) log(`  ${refOf(c)}: reply lint: ${reply.problems?.length ? `${reply.problems.length} problems left after the fix turn` : "fixed by one fix turn"}`);
        else if (reply.problems?.length) log(`  ${refOf(c)}: reply lint: ${reply.problems.length} problems, no fix turn possible`);
      },
    });
    let got: OpusReview | null = r.ok ? r.value.review : null;
    const gotText = r.ok ? r.value.text : "";
    if (got) {
      // The outcome is read from the uncut reason, as the lint does.
      const outcomes = (input.unapplied_fixes ?? []).map((u) => ({ ...u, outcome: carriedOutcome({ ...got!, reason: rawReason(gotText) ?? got!.reason }, u) }));
      // A take that neither made nor explained an earlier fix goes to a person before it can merge.
      if (got.verdict === "take") {
        const risks = outcomes.filter((u) => u.outcome === "unaddressed").map((u) => `an earlier fix was neither made nor explained: ${u.file}: ${u.change.length > 100 ? `${u.change.slice(0, 100)}...` : u.change}`);
        if (risks.length) got = { ...got, sure: false, risks: [...got.risks, ...risks] };
      }
      // A maintainer's word the model was not shown leaves the take to a person.
      if (p.maintDropped && got.sure && (got.verdict === "take" || got.verdict === "take-fix")) got = { ...got, sure: false, risks: [...got.risks, "a maintainer's comment was left out of the review for length"] };
      saveOpus(db, runId, c, { mode, base, baseRef, model: deps.model, review: got, snap, unapplied: outcomes });
      tally(c, got);
    } else {
      recordReviewFailure(db, c.repo, c.number, c.head_oid);
      jobItem(db, c.repo, c.number, "no valid Opus review", log);
      summary.missing.push(refOf(c));
    }
    params.onHandled?.(++handled);
  }), () => queueRoom(db));
  log(`opus-review ${repo}: ${summary.reviewed} reviewed (${Object.entries(summary.verdicts).map(([v, k]) => `${k} ${v}`).join(", ")}); ${summary.skipped.length} without a diff, ${summary.missing.length} without an answer`);
  return summary;
}


export const commands = {
  "opus-review": {
    summary: "opus-review --repo R [--limit N] [--dry-run]: Opus code review of wanted PRs, one verdict per head commit",
    async run(args: string[]): Promise<void> {
      const f: Record<string, string | true> = {};
      for (let i = 0; i < args.length; i++) {
        const n = args[i]!.replace(/^--/, "");
        if (!["repo", "limit", "dry-run"].includes(n)) throw new Error(`unknown option ${args[i]}; options: --repo --limit --dry-run`);
        if (n === "dry-run") f[n] = true;
        else {
          const v = args[++i];
          if (v === undefined) throw new Error(`--${n} needs a value`);
          f[n] = v;
        }
      }
      if (typeof f.repo !== "string") throw new Error("missing --repo");
      const limit = typeof f.limit === "string" ? Number(f.limit) : undefined;
      if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) throw new Error("--limit is a positive whole number");
      const { connect } = await import("../db.ts");
      await runOpusReview(connect(), { repo: f.repo, limit, dryRun: f["dry-run"] === true });
    },
  },
};
