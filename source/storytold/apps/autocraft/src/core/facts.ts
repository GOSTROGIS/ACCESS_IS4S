// Facts: everything the review-to-merge rules read about open PRs, loaded in one pass for a whole database or a slice of it.
// Each concept has one definition here. Where a step selector and the merge queue used different
// definitions, the queue's wins; the differences are listed in the report of this change, not here.
import { pipelineWrites } from "./rules.ts";
import { quietFixPrs } from "../security/quiet.ts";
export { quietFixPrs };
import type { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { commentApprovalOf } from "../act/approval.ts";
import { actionable } from "../decisions.ts";
import { ownLogins } from "../github/identity.ts";
import { notOwnIntegrationSql, groupHeldSql, backlogHeldSql } from "../dupes/held.ts";
import { conflictAskRetryAt, conflictBucket } from "../fixup/conflict-state.ts";
import { pushApprovalOf } from "../fixup/approval.ts";
import { authorWrites } from "../fixup/author-permission.ts";
import { longLivedOf, pushable, sameRepo, type LongLived } from "../fixup/pushable.ts";
import { FAST_FLOOR, fastScoreSql } from "../fasttrack.ts";
import { latestRun, refereeClosed, settledLookup } from "../classify/settled.ts";
import { redMainRepos, MAIN_FIX_BRANCH_PREFIX } from "../mainci/index.ts";
import { batchStates, membersOf } from "../merge/batch-store.ts";
import { changesRequestedWhy, gatesOf, GATE_FAILURES, failureNote, type ReviewFact } from "../merge/changes-requested.ts";
import { ciApprovalOf } from "../merge/ci-approval.ts";
import { defaultBranchOf } from "../merge/base.ts";
import { mergeApprovalOf } from "../merge/approval.ts";
import { mergeHolds } from "../merge/holds.ts";
import { repoHasNoCi } from "../merge/no-ci.ts";
import { effectiveCi } from "../optional-checks.ts";
import { inPilot, pilotSql, pipelineRepos } from "../pilot.ts";
import { holdMap } from "../outside.ts";
import { attemptsOf, parseFixes } from "../fixup/candidates.ts";
import { operatorTries, operatorTriesLeft, operatorWork, queuedOperatorFix } from "../preapproval/state.ts";
import { getTask, TERMINAL } from "../build/tasks.ts";
import { SINCE_KEY } from "../postmerge/select.ts";
import { verifyOverride } from "../merge/verify-override.ts";
import { unknownOf } from "../merge/mergeable.ts";
import { BASE_NAME, OPEN_GROUP_SQL, PIPELINE_LOGIN_KEY, OPEN_QUESTION_SQL, UNSURE_AT_SQL, mergeDecisionId, holdDecisionId } from "./rules.ts";
import { getRule, STATS_SQL, tierOf, tierKey, tiersOf, type AuthorRef, type Tier } from "../whitelist.ts";
import { findingsOf, premergeAt, premergeFixUsed } from "../premerge/store.ts";
import { headOf } from "../review/candidates.ts";
import { parsePublic } from "../review/opus-parse.ts";
import { cachedDiffExtras, diffRereads, extrasPending, rereadPaceAt, diffCacheDir, splitDiff } from "../review/diff.ts";
import { ownerOf, slugOf } from "../owners.ts";
import { EXTRAS_PENDING_REASON, sensitiveReasons } from "./sensitive.ts";
import { CARRIED, carriedReview } from "../review/carry.ts";
import { postSource } from "../review/post-source.ts";
import { staleReviews } from "../review/discussion.ts";
import { nextUtcMidnight, reviewHolds } from "../review/gate.ts";
import { scopeAnswers, unsettledScope } from "../review/candidates.ts";
import { NOT_RUST_REASON, PRIVATE_REASON, cachedRust } from "../verify/candidates.ts";
import { CIFIX_PUSH_STATES, CIFIX_TRY_STATES, MAX_FAILURES, labelWithScopeAnswer, sizeOf, unsentAsk } from "./rules.ts";
import type { AssignFacts, PrFacts, PrTier } from "./plan.ts";
import { settledBySql } from "../settlers.ts";
import { activeTrips, brokeHeads } from "../push-outcomes.ts";

export type { PrFacts } from "./plan.ts";

export type LoadOptions = {
  repo?: string;
  /** Only these PRs, as "repo#number". */
  refs?: Iterable<string>;
  /** Decision time in ms (default: the clock). */
  now?: number;
  /** The GitHub App's slug, when it is not to be read from the registered app (null: none). */
  appSlug?: string | null;
  /** The classification run for labels (default: latestRun). */
  run?: string | null;
};

type Row = {
  repo: string; number: number; author: string | null; author_id: number | null; state: "OPEN" | "MERGED" | "CLOSED"; review_decision: string | null; head_oid: string | null; updated_at: string | null; is_draft: number | null;
  additions: number | null; deletions: number | null; i_mergeable: string | null; head_repo: string | null; head_ref: string | null; base_ref: string | null; i_can: number | null;
  c_head: string | null; c_at: string | null; c_state: string | null; c_draft: number | null; overall: string | null; c_checks: string | null; c_mergeable: string | null; c_can: number | null;
  r_head: string | null; r_at: string | null; r_verdict: string | null; r_sure: number | null; r_mode: string | null; r_reason: string | null; r_fixes: string | null; r_public: string | null; r_conflicts: string | null;
  assignees: string | null; score: number | null; in_pilot: number; not_integration: number; batch_pr: number; held_backlog: number; held_dup: number;
};

const parseList = (s: string | null): unknown[] => { try { const v = JSON.parse(s ?? "[]") as unknown; return Array.isArray(v) ? v : []; } catch { return []; } };
const safeJson = (s: string | null): unknown => { try { return JSON.parse(s!); } catch { return null; } };

const SELECT = `SELECT i.repo, i.number, i.author, i.author_id, i.assignees, i.state, i.review_decision, i.head_oid, i.updated_at, i.is_draft, i.additions, i.deletions, i.mergeable AS i_mergeable,
    i.head_repo, i.head_ref, i.base_ref, i.maintainer_can_modify AS i_can,
    c.head_oid AS c_head, c.fetched_at AS c_at, c.state AS c_state, c.is_draft AS c_draft, c.overall, c.checks AS c_checks, c.mergeable AS c_mergeable, c.maintainer_can_modify AS c_can,
    l.head_oid AS r_head, l.at AS r_at, l.verdict AS r_verdict, l.sure AS r_sure, l.mode AS r_mode, l.reason AS r_reason, l.fixes AS r_fixes, l.public_review AS r_public, l.conflicts AS r_conflicts,
    ${fastScoreSql("i.repo", "i.number", "p.score")} AS score,
    ${pilotSql("i")} AS in_pilot, ${notOwnIntegrationSql("i")} AS not_integration,
    EXISTS (SELECT 1 FROM main.merge_batches mb WHERE mb.repo = i.repo AND mb.pr_number = i.number) AS batch_pr,
    ${backlogHeldSql("i")} AS held_backlog,
    (EXISTS (SELECT 1 FROM decisions dh WHERE dh.kind = 'duplicate' AND dh.id NOT LIKE '%:dupegroup:%' AND dh.repo = i.repo AND dh.number = i.number AND (dh.answer IS NULL OR dh.answer = 'close'))
      OR ${groupHeldSql("i")}) AS held_dup
  FROM items i
  LEFT JOIN pr_checks c ON c.repo = i.repo AND c.number = i.number
  LEFT JOIN item_rank p ON p.repo = i.repo AND p.number = i.number
  LEFT JOIN opus_reviews l ON l.repo = i.repo AND l.number = i.number AND l.head_oid = (
    SELECT r.head_oid FROM opus_reviews r WHERE r.repo = i.repo AND r.number = i.number AND r.verdict IS NOT NULL ORDER BY r.at DESC, r.rowid DESC LIMIT 1)
  WHERE i.kind = 'pr' AND (i.state = 'OPEN' OR (i.state = 'MERGED' AND l.verdict IN ('take', 'take-fix'))
    OR EXISTS (SELECT 1 FROM merges mm WHERE mm.repo = i.repo AND mm.number = i.number AND mm.outcome = 'merged'))`;

const sensitiveMemo = new Map<string, { reasons: string[]; lines: number; pending: boolean; lastRead: number | null }>();
/** A file's identity for the memo: modification time and size, without reading it. */
const stamp = (f: string): string => { try { const st = statSync(f); return `${st.mtimeMs}/${st.size}`; } catch { return "-"; } };
/**
 * The sensitive-content reasons and the changed-line count of the diff cached for this head; null when it is not cached (a
 * review or pre-merge review caches it). The count is the rule's size fact: it is of this head, not of the mirror's row.
 * `pending`: the diff waits for what the rule reads beside it (whole files, workflow steps); its reasons are then the
 * conservative ones, holding the PR for whatever could not be read, until a re-read settles them.
 */
function diffFactsAt(repo: string, number: number, head: string): { reasons: string[]; lines: number; pending: boolean; lastRead: number | null } | null {
  const file = join(diffCacheDir(), repo, `${number}-${head}.diff`);
  const key = `${repo}#${number}@${head}:${stamp(file)}:${stamp(`${file}.base`)}:${stamp(`${file}.files.json`)}:${stamp(`${file}.reread`)}`;
  const hit = sensitiveMemo.get(key);
  if (hit) return hit;
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const extras = cachedDiffExtras(repo, number, head), rereads = diffRereads(repo, number, head);
  const out = {
    reasons: sensitiveReasons(text, ownerOf(repo), extras ?? {}), lines: splitDiff(text).reduce((n, f) => n + f.lines, 0),
    pending: extrasPending(text, extras, rereads.count), lastRead: rereads.at,
  };
  sensitiveMemo.set(key, out);
  return out;
}

/** The statements named by the given stored `conflicts` values (JSON [{id, reason}]), one entry per id with the first reason; unknown ids and unreadable values count for nothing. */
function statementConflicts(find: { get(id: number): unknown }, stored: unknown[]): PrFacts["statementConflicts"] {
  const out: PrFacts["statementConflicts"] = [];
  for (const v of stored) {
    if (!Array.isArray(v)) continue;
    for (const h of v as { id?: unknown; reason?: unknown }[]) {
      if (typeof h?.id !== "number" || out.some((d) => d.id === h.id)) continue;
      const d = find.get(h.id) as { id: number; repo: string; number: number | null; text: string } | undefined;
      if (d) out.push({ id: d.id, where: d.number === null ? d.repo : `${d.repo}#${d.number}`, text: d.text, reason: typeof h.reason === "string" ? h.reason : "" });
    }
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Facts of every open PR (and merged PRs with a take or take-fix review) of the database, repo or refs given. One pass: per-repo values are read once. */
export function loadPrFacts(db: DatabaseSync, opts: LoadOptions = {}): PrFacts[] {
  const now = opts.now ?? Date.now();
  /** The `unsent` fact of a step's ask comments that never reached GitHub; absent when the ask is due as if none had failed. */
  const unsentOf = (ats: string[]): { unsent?: { until: number } | "final" } => { const u = unsentAsk(ats, now); return u === null ? {} : { unsent: u }; };
  // When the next diff re-read may run (the instance's hourly pace, a rate-limit pause); read once per load.
  let paceAt: number | undefined;
  const params: Record<string, string> = {};
  let where = "";
  if (opts.repo) { where += " AND i.repo = :repo"; params.repo = opts.repo; }
  if (opts.refs) { where += " AND i.repo || '#' || i.number IN (SELECT value FROM json_each(:refs))"; params.refs = JSON.stringify([...opts.refs]); }
  const rows = db.prepare(`${SELECT}${where} ORDER BY i.repo, i.number`).all(params) as Row[];

  // Values read once for all PRs.
  const run = opts.run !== undefined ? opts.run : latestRun(db);
  const settled = settledLookup(db, run);
  const stale = staleReviews(db, opts.repo);
  const staleActionable = staleReviews(db, opts.repo, true);
  const scope = scopeAnswers(db);
  const unsettled = unsettledScope(db);
  const gates = gatesOf(db, opts.repo);
  const holds = mergeHolds(db, opts.repo);
  const inBatch = batchStates(db, opts.repo);
  const own = ownFixPrs(db, opts.repo, opts.appSlug);
  const assigned = assignmentsOf(db, opts.repo);
  const mainRed = redMainRepos(db);
  const tripped = activeTrips(db);
  const brokeAt = brokeHeads(db, opts.repo);
  // carriedReview only carries our own plain fix-up (no carry or pre-merge source) as the head: skip its compiles for other PRs.
  const ourFixupHead = db.prepare("SELECT 1 FROM fixups WHERE repo = ? AND number = ? AND to_head = ? AND state = 'pushed' AND source IS NULL LIMIT 1");
  const ourSameDiffMerge = db.prepare("SELECT 1 FROM conflict_merges WHERE repo = ? AND number = ? AND to_head = ? AND state = 'merged' AND own_diff = 'same' LIMIT 1");
  // A head we pushed, or the head our push moved off (the mirror may still show it, and our own comment makes its review stale).
  const pushedHere = db.prepare("SELECT 1 FROM push_outcomes WHERE repo = ?1 AND number = ?2 AND (to_oid = ?3 OR from_oid = ?3)");
  const pushedOffRows = db.prepare("SELECT at FROM push_outcomes WHERE repo = ?1 AND number = ?2 AND from_oid = ?3 AND to_oid <> ?3");
  const answers = new Map(actionable(db).filter((a) => a.kind === "merge").map((a) => [a.id, a.answer]));
  const pipelineOn = pipelineWrites((db.prepare("SELECT value FROM main.settings WHERE key = 'pipeline_enabled'").get() as { value: string } | undefined)?.value);
  const posts = new Map((db.prepare("SELECT repo, number, review_id, head_oid, posted_at, opus_at FROM review_posts").all() as { repo: string; number: number; review_id: string; head_oid: string | null; posted_at: string | null; opus_at: string | null }[])
    .map((p) => [`${p.repo}#${p.number}`, p]));
  const grouped = new Set((db.prepare(`SELECT gi.repo || '#' || gi.number AS ref FROM dupe_group_items gi JOIN decisions g ON g.id = gi.decision_id
    WHERE ${OPEN_GROUP_SQL} AND gi.role <> 'stay'`).all() as { ref: string }[]).map((r) => r.ref));
  const activeBatched = new Set((db.prepare(`SELECT b.repo || '#' || p.number AS ref FROM main.merge_batch_prs p JOIN main.merge_batches b ON b.id = p.batch_id WHERE b.state IN ('checking', 'open')`).all() as { ref: string }[]).map((x) => x.ref));
  const mergedByPipeline = new Map((db.prepare(`SELECT m.repo || '#' || m.number AS ref, MIN(m.at) AS merged_at,
      (SELECT x.head_oid FROM merges x WHERE x.repo = m.repo AND x.number = m.number AND x.outcome = 'merged' ORDER BY x.at DESC, x.rowid DESC LIMIT 1) AS head
    FROM merges m WHERE m.outcome = 'merged' GROUP BY m.repo, m.number`).all() as { ref: string; merged_at: string; head: string | null }[]).map((x) => [x.ref, x]));
  const pmReviews = new Map((db.prepare("SELECT repo || '#' || number AS ref, at, error FROM postmerge_reviews").all() as { ref: string; at: string; error: string | null }[]).map((x) => [x.ref, x]));
  const since = (db.prepare("SELECT value FROM settings WHERE key = ?").get(SINCE_KEY) as { value: string } | undefined)?.value ?? "9999";
  const operator = operatorWork(db, opts.repo);
  const carries = db.prepare(`SELECT k.decision_id, k.attempts FROM dupe_carries k WHERE k.repo = ? AND k.number = ? AND k.state = 'queued' ORDER BY k.number`);
  const carryUnsent = db.prepare("SELECT created_at FROM fixups WHERE repo = ? AND number = ? AND source = 'carry' AND carry_decision = ? AND state = 'comment-unsent'");
  const carryPoints = db.prepare("SELECT detail FROM dupe_group_items WHERE decision_id = ? AND kind = 'pr' AND role = 'close' ORDER BY number");
  const fixupRows = db.prepare("SELECT state FROM fixups WHERE repo = ? AND number = ? AND from_head = ? AND source IS NULL AND state IN ('pushed', 'cannot-push', 'too-large', 'asked', 'comment-failed', 'push-denied', 'linting')");
  const fixupUnsent = db.prepare("SELECT created_at FROM fixups WHERE repo = ? AND number = ? AND from_head = ? AND source IS NULL AND state = 'comment-unsent'");
  const lintFixup = db.prepare("SELECT source, lint_task FROM fixups WHERE repo = ? AND number = ? AND from_head = ? AND state = 'linting' AND COALESCE(source, '') != 'operator' ORDER BY rowid");
  // An operator's fix-up works the current head, with or without a review there, so its stored patch is read at the head before the review is.
  const lintOperator = db.prepare("SELECT lint_task FROM fixups WHERE repo = ? AND number = ? AND from_head = ? AND state = 'linting' AND source = 'operator' ORDER BY rowid");
  const taskEnded = (id: number | null): boolean => { const t = id != null ? getTask(db, id) : null; return !t || TERMINAL.includes(t.state); };
  const lintCifix = db.prepare("SELECT lint_task FROM ci_fixes WHERE repo = ? AND number = ? AND head = ? AND state = 'linting' ORDER BY rowid");
  const lintConflict = db.prepare("SELECT lint_task FROM conflict_merges WHERE repo = ? AND number = ? AND from_head = ? AND state = 'linting' ORDER BY rowid");
  const cifixRows = db.prepare("SELECT state, created_at, task_id, runs, reason FROM ci_fixes WHERE repo = ? AND number = ? AND head = ? ORDER BY created_at, rowid");
  const cifixTotals = db.prepare(`SELECT COALESCE(SUM(state IN (${CIFIX_PUSH_STATES.map(() => "?").join(",")})), 0) AS pushes, COALESCE(SUM(state IN (${CIFIX_TRY_STATES.map(() => "?").join(",")})), 0) AS tries FROM ci_fixes WHERE repo = ? AND number = ?`);
  const queued = rows.filter((r) => r.in_pilot && r.not_integration && (r.r_verdict === "take" || r.r_verdict === "take-fix") && r.author);
  const tiers = tiersOf(db, queued.map((r) => ({ login: r.author!, id: r.author_id })));

  const repoMemo = new Map<string, { f: PrFacts["repoFacts"]; pub: boolean; longLived: LongLived; defaultBranch: string | null }>();
  const repoOf = (repo: string) => {
    let m = repoMemo.get(repo);
    if (!m) {
      m = {
        f: { mergeApproved: !!mergeApprovalOf(db, repo), pushApproved: pushApprovalOf(db, repo) !== null, commentApproved: commentApprovalOf(db, repo) !== null, ciApproved: ciApprovalOf(db, repo) !== null,
          noCi: repoHasNoCi(db, repo), mainRed: mainRed.has(repo) },
        pub: !!db.prepare("SELECT 1 FROM repos WHERE name = ? AND visibility = 'public'").get(repo),
        longLived: longLivedOf(db, repo),
        defaultBranch: defaultBranchOf(db, repo),
      };
      repoMemo.set(repo, m);
    }
    return m;
  };

  const stackedOnQ = db.prepare("SELECT number FROM items WHERE repo = ? AND kind = 'pr' AND state = 'OPEN' AND head_ref = ? AND lower(head_repo) = ? AND number != ? ORDER BY number LIMIT 1");
  const merges = db.prepare("SELECT outcome, reason, ci, mergeable, at, (SELECT COUNT(*) FROM merges m2 WHERE m2.repo = merges.repo AND m2.number = merges.number AND m2.head_oid = merges.head_oid AND m2.outcome = 'refused') AS refusals FROM merges WHERE repo = ? AND number = ? AND head_oid = ? ORDER BY at DESC, rowid DESC LIMIT 1");
  const retriedAfter = db.prepare("SELECT 1 FROM audit WHERE target = ? AND action = 'retry' AND at > ? LIMIT 1");
  const waiting = db.prepare("SELECT runs, approved, reread, failed, cross_repo, approved_at FROM ci_run_approvals WHERE repo = ? AND number = ? AND head_oid = ?");
  const verifs = db.prepare("SELECT state, kind, summary, note FROM verifications WHERE repo = ? AND number = ? AND head_sha = ?");
  const decision = db.prepare("SELECT id FROM decisions WHERE id = ?");
  const holdRow = db.prepare("SELECT answer FROM decisions WHERE id = ?");
  // An item has one open question at a time (src/merge/withdraw.ts): a Hold question would set another one aside, so it waits for that one.
  const otherOpen = db.prepare("SELECT 1 FROM decisions WHERE repo = ? AND number = ? AND answer IS NULL AND id NOT LIKE '%~replaced-%' AND id NOT LIKE '%:dupegroup:%' AND kind IN ('scope', 'merge', 'close') LIMIT 1");
  const holdQuestionOf = (repo: string, number: number, id: string): PrFacts["decision"]["hold"] => {
    const row = holdRow.get(id) as { answer: string | null } | undefined;
    return { asked: !!row, open: !!row && row.answer === null, answer: row?.answer ?? null, otherOpen: !!otherOpen.get(repo, number) };
  };
  const statement = db.prepare("SELECT id, repo, number, text FROM owner_statements WHERE id = ?");
  const openQuestion = db.prepare(OPEN_QUESTION_SQL);
  const answeredAfter = db.prepare(`SELECT 1 FROM decisions WHERE id = ? AND kind = 'merge' AND answer = 'merge' AND answered_at > ? AND ${settledBySql("decisions")}`);
  const pushChain = pushChainOf(db);
  const ownHead = ownHeadOf(db);
  const unsureAt = db.prepare(UNSURE_AT_SQL);
  const reviewRows = db.prepare("SELECT author, author_association AS association, review_state AS state, created_at AS at FROM comments WHERE repo = ? AND number = ? AND kind = 'review'");
  const batchTip = db.prepare(`SELECT a.runs, a.approved, a.reread, a.failed, a.cross_repo FROM merge_batches b
    JOIN ci_run_approvals a ON a.repo = b.repo AND a.number = b.pr_number AND a.head_oid = b.commit_sha
    WHERE b.repo = ? AND b.pr_number = ? AND b.state = 'open'
      AND NOT EXISTS (SELECT 1 FROM merge_batch_prs p WHERE p.batch_id = b.id AND NOT EXISTS (
        SELECT 1 FROM final_reviews l WHERE l.repo = b.repo AND l.number = p.number AND l.head_oid = p.head_oid AND l.verdict IN ('take', 'take-fix')
          AND l.head_oid = (SELECT r.head_oid FROM opus_reviews r WHERE r.repo = l.repo AND r.number = l.number AND r.verdict IS NOT NULL ORDER BY r.at DESC, r.rowid DESC LIMIT 1)))
    ORDER BY b.id LIMIT 1`);

  const batchOf = db.prepare("SELECT id, commit_sha FROM merge_batches WHERE repo = ? AND pr_number = ? AND state IN ('checking', 'open') ORDER BY id LIMIT 1");
  const pipelineOn_ = pipelineRepos(db);

  type Wait = { runs: string; approved: string; reread: number; failed: string; cross_repo: number; approved_at: string | null };
  const runsOf = (w: Wait | undefined, ciApproved: boolean): PrFacts["runs"] => {
    if (!w) return null;
    const runs = parseList(w.runs) as { id: number; event?: string }[];
    const failed = JSON.parse(w.failed || "{}") as Record<string, number>;
    const waiting = runs.length + (w.reread ? 1 : 0);
    const blocked: NonNullable<PrFacts["runs"]>["blocked"] = !waiting ? null : !ciApproved ? "off" : runs.some((x) => (failed[x.id] ?? 0) >= MAX_FAILURES) ? "failed"
      : !w.reread && (!w.cross_repo || !runs.some((x) => x.event === "pull_request")) ? "unsupported" : null;
    return { waiting, reread: !!w.reread, crossRepo: !!w.cross_repo, approvable: runs.filter((x) => x.event === "pull_request" && (failed[x.id] ?? 0) < MAX_FAILURES).length, blocked };
  };

  const holdOf = reviewHolds(db, now);
  const outsideHolds = holdMap(db);
  const out: PrFacts[] = [];
  for (const r of rows) {
    // The queue leaves merged PRs outside the pilot and our own integration PRs out.
    if (r.state !== "OPEN" && (!r.in_pilot || !r.not_integration)) continue;
    const ref = `${r.repo}#${r.number}`;
    const rf = repoOf(r.repo);
    const fresh = !!r.c_at && (!r.updated_at || r.c_at > r.updated_at);
    const integration = !r.not_integration;
    // An integration PR takes part when its repo's pipeline is on or every member is in scope (fast track); its head is the batch tip, where the run approvals are recorded.
    const batchRow = integration ? (batchOf.get(r.repo, r.number) as { id: number; commit_sha: string } | undefined) : undefined;
    const inScope = integration ? pipelineOn_.has(r.repo) || (!!batchRow && (members => members.length > 0 && members.every((m) => inPilot(db, r.repo, m.number)))(membersOf(db, batchRow.id))) : !!r.in_pilot;
    const head = batchRow?.commit_sha ?? headOf(r);
    const pushedOff = r.state === "OPEN" && !integration && !!head && (pushedOffRows.all(r.repo, r.number, head) as { at: string }[]).some((p) => !r.updated_at || Date.parse(r.updated_at) < Date.parse(p.at));
    const lines = (r.additions ?? 0) + (r.deletions ?? 0);
    const base: PrFacts = {
      repo: r.repo, number: r.number, ...(pushedOff ? { pushedOff } : {}), assignment: assigned(ref, r.assignees), now, pipelineOn, tripped, ghState: r.state, head, draft: fresh ? r.c_state !== "OPEN" || !!r.c_draft : !!r.is_draft,
      author: r.author, authorIsPipeline: r.author !== null && own.isOwn(r.repo, r.author), tier: "not", lines, size: sizeOf(lines), label: null, needsDecisionFlag: false,
      scopeAnswer: scope.get(ref) ?? null,
      inScope, ...(outsideHolds.has(ref) ? { outsideHold: outsideHolds.get(ref)! } : {}), integration, batchPr: !!r.batch_pr, heldBacklog: !!r.held_backlog, heldDuplicate: !r.held_backlog && !!r.held_dup, quiet: own.quiet.has(ref), mergeHeld: holds.has(ref),
      fast: (r.score ?? 0) >= FAST_FLOOR, score: r.score, repoFacts: rf.f,
      review: null, post: { postable: false, posted: null },
      checksHere: false, checksOpen: false, ci: "unknown", mergeable: r.i_mergeable ?? "UNKNOWN", unknown: null, runs: null,
      lastMerge: null, runsApprovedAfterMerge: false, verifyOverride: false, verification: null, verifyUnavailable: null,
      decision: { asked: false, openQuestion: false, answer: null, mergeAnswerAfterReview: false, inOpenGroup: grouped.has(ref), hold: { asked: false, open: false, answer: null, otherOpen: !!otherOpen.get(r.repo, r.number) } },
      premerge: null, premergeFixUsed: false, sensitive: null, statementConflicts: [], pushable: false, pushChain: [], conflict: null, inActiveBatch: activeBatched.has(ref), fixup: null, carry: [], lint: [], cifix: null, postmerge: null, batch: null, mainFix: false, baseOffDefault: false, stackedOn: null, changesRequested: null, gateFailureNote: null,
    };
    base.inFlight = r.state === "OPEN" && !integration && !!r.author && own.isOwn(r.repo, r.author) && own.prs.has(ref);
    if (integration) {
      base.runs = runsOf(batchTip.get(r.repo, r.number) as Wait | undefined, rf.f.ciApproved);
      out.push(base);
      continue;
    }
    if (!inScope) {
      const v = head ? (verifs.get(r.repo, r.number, head) as { state: string } | undefined) : undefined;
      base.outside = {
        review: r.r_head && r.r_head === head && r.r_verdict && !stale.has(`${ref}@${r.r_head}`) ? r.r_verdict : null,
        verify: v?.state ?? null, ci: head && r.c_head === head ? r.overall ?? null : null,
      };
      out.push(base);
      continue;
    }

    const s = settled(r.repo, r.number);
    base.label = labelWithScopeAnswer(s.label ?? null, base.scopeAnswer);
    base.needsDecisionFlag = s.flags.includes("needs decision") || (unsettled.has(ref) && !scope.has(ref));
    base.labelUnsure = s.status === "settled" && !!s.referee && !s.referee.sure && refereeClosed(s.referee);
    const pm = mergedByPipeline.get(ref);
    if (pm) base.postmerge = { mergedAt: pm.merged_at, head: pm.head, since, review: pmReviews.get(ref) ?? null };
    // Checks describe the PR when they were fetched for the reviewed head (or, without a review, the current one).
    const checksAtHead = r.c_head === (r.r_head ?? head);
    base.mergeable = (checksAtHead ? r.c_mergeable : r.i_mergeable) ?? "UNKNOWN";
    // An author whose permission has not been read yet counts as able to write: the job that pushes reads it first.
    base.pushable = pushable(r.head_repo, r.repo, checksAtHead ? r.c_can : r.i_can, r.head_ref, rf.longLived, false, sameRepo(r.head_repo, r.repo) && authorWrites(db, r.repo, r.number) !== "no");
    const ow = operator.get(ref);
    if (ow && r.state === "OPEN") base.operator = { fix: head && ow.fixHeads.has(head) && queuedOperatorFix(db, r.repo, r.number, head) ? { attempts: operatorTries(db, r.repo, r.number) } : null, hold: ow.hold, premerge: !!head && ow.premergeHeads.has(head) };
    // A fix-up request holds the PR's merge only while the planner can work it: same head, pushable, approved, not conflicting, not a draft, tries left.
    if (base.operator?.fix && !base.heldBacklog && !base.draft && base.mergeable !== "CONFLICTING" && base.pushable && base.repoFacts.pushApproved && operatorTriesLeft(db, r.repo, r.number)) base.operator.hold = true;
    if (ow && r.state === "OPEN" && head) {
      for (const x of lintOperator.all(r.repo, r.number, head) as { lint_task: number | null }[]) base.lint.push({ step: "fixup", source: "operator", ended: taskEnded(x.lint_task) });
      if (base.lint.length) base.inFlight = true;
    }
    if (r.state === "OPEN" && !base.heldBacklog) {
      for (const k of carries.all(r.repo, r.number) as { decision_id: string; attempts: number }[]) {
        const hasPoints = (carryPoints.all(k.decision_id) as { detail: string | null }[]).some((x) => {
          try { const c = (JSON.parse(x.detail ?? "null") as { carry?: unknown } | null)?.carry; return Array.isArray(c) && c.some((p) => typeof p === "string"); } catch { return false; }
        });
        const u = unsentAsk((carryUnsent.all(r.repo, r.number, k.decision_id) as { created_at: string }[]).map((x) => x.created_at), now);
        if (hasPoints) base.carry.push({ attempts: k.attempts, ...(u !== null && u !== "final" ? { unsent: u } : {}) });
      }
    }
    if (r.state === "OPEN" && head && !base.draft) { const hold = holdOf(r.repo, r.number, head); if (hold) base.reviewHold = hold; }
    if (!r.r_head || !r.r_verdict || !r.r_at) { out.push(base); continue; }

    const take = r.r_verdict === "take" || r.r_verdict === "take-fix";
    const chain = take ? pushChain(r.repo, r.number, r.r_head) : [r.r_head];
    const unsure = take && (r.r_sure === 0 || chain.some((h) => unsureAt.get(r.repo, r.number, h)));
    base.review = {
      head: r.r_head, at: r.r_at, verdict: r.r_verdict, unsure, mode: r.r_mode, reason: r.r_reason ?? "", fixes: parseList(r.r_fixes).length,
      stale: stale.has(`${ref}@${r.r_head}`), staleActionable: staleActionable.has(`${ref}@${r.r_head}`),
    };
    base.pushChain = chain;
    base.decision.hold = holdQuestionOf(r.repo, r.number, holdDecisionId(r.repo, r.number, r.r_head));
    if (r.state === "OPEN" && head && head !== r.r_head && (ourFixupHead.get(r.repo, r.number, head) || ourSameDiffMerge.get(r.repo, r.number, head)) && carriedReview(db, { repo: r.repo, number: r.number, head_oid: head }, stale)) base.carriable = true;
    if (r.state === "OPEN" && (chain.length > 1 || (!!head && !!pushedHere.get(r.repo, r.number, head)))) base.inFlight = true;
    const diffFacts = diffFactsAt(r.repo, r.number, r.r_head);
    // While the extras are pending the reasons are the conservative ones, and the wait itself keeps the PR off the rule.
    base.sensitive = diffFacts ? (diffFacts.pending ? [...diffFacts.reasons, EXTRAS_PENDING_REASON] : diffFacts.reasons) : null;
    if (diffFacts?.pending) base.diffPending = { lastRead: diffFacts.lastRead, paceAt: paceAt ??= rereadPaceAt(now) };
    if (diffFacts) { base.lines = diffFacts.lines; base.size = sizeOf(diffFacts.lines); }
    base.statementConflicts = statementConflicts(statement, [safeJson(r.r_conflicts), safeJson(premergeAt(db, r.repo, r.number, r.r_head)?.conflicts ?? null)]);
    const p = posts.get(ref);
    // A carried review has no text of its own: the post uses the text of the review it was carried from.
    const src = r.r_mode === CARRIED ? postSource(db, r.repo, r.number, r.r_head) : null;
    const hasPublic = src ? src.hasPublic : r.r_public !== null;
    const pub = src ? src.public : !hasPublic ? { ok: true } : parsePublic(safeJson(r.r_public!));
    base.post = {
      postable: (hasPublic || !!p?.review_id) && !!pub,
      posted: p ? { head: p.head_oid, at: p.posted_at, opusAt: p.opus_at } : null,
    };
    // The CI fix state at one head: the rows it recorded and its limits.
    const cifixAt = (cfHead: string): NonNullable<PrFacts["cifix"]> => {
      const prior = cifixRows.all(r.repo, r.number, cfHead) as { state: string; created_at: string; task_id: number | null; runs: string | null; reason: string | null }[];
      const totals = cifixTotals.get(...CIFIX_PUSH_STATES, ...CIFIX_TRY_STATES, r.repo, r.number) as { pushes: number; tries: number };
      const formatting = prior.find((x) => x.state === "formatting");
      const task = formatting?.task_id != null ? getTask(db, formatting.task_id) : null;
      const infra = prior.find((x) => x.state === "infra");
      return {
        states: prior.map((x) => x.state), tries: prior.filter((x) => CIFIX_TRY_STATES.includes(x.state)).length,
        rerunAt: prior.find((x) => x.state === "rerun" || x.state === "rerunning")?.created_at ?? null,
        infraRuns: infra ? (parseList(infra.runs ?? "[]") as number[]) : null,
        formattingTask: formatting?.task_id ?? null, formatterEnded: !task || TERMINAL.includes(task.state),
        totalPushes: totals.pushes, totalTries: totals.tries, checksAt: r.c_at,
        skipReason: [...prior].reverse().find((x) => x.state === "skipped")?.reason ?? null,
        ...unsentOf(prior.filter((x) => x.state === "comment-unsent").map((x) => x.created_at)),
      };
    };
    // A non-take review at an earlier head while the review gate waits on red CI at the new head: the CI fix cannot start, so the contributor is asked (src/core/decide.ts unreviewedRed).
    if (!take && r.state === "OPEN" && head && head !== r.r_head && base.reviewHold?.kind === "ci" && base.reviewHold.red && r.c_head === head && effectiveCi(db, r.repo, r.overall ?? "none", r.c_checks) === "failure") {
      base.ci = "failure";
      base.gateRed = true;
      base.cifix = cifixAt(head);
    }
    if (!take) { out.push(base); continue; }

    const wait = waiting.get(r.repo, r.number, r.r_head) as Wait | undefined;
    const checksHere = r.c_head === r.r_head;
    base.checksHere = checksHere;
    base.checksOpen = checksHere && r.c_state === "OPEN" && !r.c_draft;
    const approvedPending = parseList(wait?.approved ?? "[]").length > 0;
    base.ci = checksHere ? (approvedPending ? "pending" : effectiveCi(db, r.repo, r.overall ?? "none", r.c_checks)) : "unknown";
    base.runs = runsOf(wait, rf.f.ciApproved);
    // Our push to this head turned its required checks red: the CI fix works on it now, without waiting for a review of the new head.
    // A head that our own push or the review's CI gate (red CI at a new head, reviewed earlier) left red is repaired against that head.
    const redNow = r.c_head === head && effectiveCi(db, r.repo, r.overall ?? "none", r.c_checks) === "failure";
    base.brokeByUs = brokeAt.get(ref) === head && redNow;
    base.gateRed = !base.brokeByUs && !!base.reviewHold?.red && !!head && head !== r.r_head && redNow;
    if (r.state === "OPEN") {
      const from = carriedSources(db, r.repo, r.number);
      if (from.length) {
        const t = tiersOf(db, from.filter((x) => x.author).map((x) => ({ login: x.author!, id: x.id })));
        base.carriedFrom = from.map((x) => ({ number: x.number, author: x.author, tier: (x.author ? t.get(tierKey({ login: x.author, id: x.id })) : undefined) ?? "not" }));
      }
    }
    base.tier = (r.author ? tiers.get(tierKey({ login: r.author, id: r.author_id })) : undefined) ?? "not";
    // The pipeline's own Fix PRs count as whitelisted at a head the pipeline itself pushed (others may push to the branch); an operator's deny still wins.
    const ownHere = !!r.author && own.isOwn(r.repo, r.author) && own.prs.has(ref) && !!head && ownHead(r.repo, r.number, head);
    if (base.tier === "not" && ownHere) base.tier = "whitelisted";

    const last = merges.get(r.repo, r.number, r.r_head) as { outcome: string; reason: string | null; ci: string | null; mergeable: string | null; at: string; refusals: number } | undefined;
    // An operator's Retry after a refusal asks for another try now, without waiting for CI or the mergeable state to change.
    // A fresh Merge answer after a refusal asks for another try, as a Retry does.
    if (last && !(last.outcome === "refused" && (retriedAfter.get(mergeDecisionId(r.repo, r.number, r.r_head), last.at) || answeredAfter.get(mergeDecisionId(r.repo, r.number, r.r_head), last.at)))) {
      base.lastMerge = { outcome: last.outcome, reason: last.reason, ci: last.ci, mergeable: last.mergeable, refusals: last.refusals };
      base.runsApprovedAfterMerge = !!wait?.approved_at && wait.approved_at > last.at;
    }
    base.verification = (verifs.get(r.repo, r.number, r.r_head) as PrFacts["verification"] | undefined) ?? null;
    if (base.verification?.state === "failed" || base.verification?.state === "error") base.verifyOverride = verifyOverride(db, r.repo, r.number, r.r_head);
    if (!base.verification || base.verification.state === "stale") {
      base.verifyUnavailable = !rf.pub ? PRIVATE_REASON : rf.f.noCi && cachedRust(r.repo, r.r_head) === false ? NOT_RUST_REASON : null;
    }
    if (r.state === "OPEN" && base.mergeable !== "MERGEABLE" && base.mergeable !== "CONFLICTING") base.unknown = unknownOf(db, r.repo, r.number, r.r_head);
    const id = mergeDecisionId(r.repo, r.number, r.r_head);
    const given = answers.get(id) ?? null;
    base.decision = {
      asked: !!decision.get(id), openQuestion: r.state === "OPEN" && !!openQuestion.get(r.repo, r.number), answer: given,
      mergeAnswerAfterReview: given === "merge" && !!answeredAfter.get(id, r.r_at), inOpenGroup: grouped.has(ref),
      hold: base.decision.hold,
    };
    if (r.state !== "OPEN") { out.push(base); continue; }

    const row = premergeAt(db, r.repo, r.number, r.r_head);
    if (row) {
      const all = findingsOf(row);
      const defects = all.filter((f) => f.severity === "defect");
      base.premerge = { at: row.at, tries: row.tries, hasFindings: row.findings !== null, unsure: row.unsure !== 0, defects: defects.length, defectsAllFixable: defects.every((f) => f.fix), fixesSafe: parseFixes(JSON.stringify(defects.map((f) => f.fix))).length === defects.length, minor: all.length - defects.length, error: row.error ?? null };
      if (defects.length) base.premergeFixUsed = premergeFixUsed(db, r.repo, r.number);
    }
    if (base.mergeable === "CONFLICTING" && r.base_ref) {
      const bucket = conflictBucket(db, { repo: r.repo, number: r.number, head: r.r_head, pushable: base.pushable }, { push: rf.f.pushApproved, comment: rf.f.commentApproved }, now);
      const until = bucket === "capped" ? nextUtcMidnight(now) : bucket === "ask-retry" ? conflictAskRetryAt(db, r.repo, r.number, r.r_head, now) : undefined;
      base.conflict = { bucket, base: r.base_ref, baseOk: BASE_NAME.test(r.base_ref), ...(until !== undefined ? { until } : {}) };
    }
    if (r.r_verdict === "take-fix") {
      base.fixup = {
        fixes: parseFixes(r.r_fixes).length, attempts: attemptsOf(db, r.repo, r.number), recorded: (fixupRows.all(r.repo, r.number, r.r_head) as { state: string }[]).map((x) => x.state),
        ...unsentOf((fixupUnsent.all(r.repo, r.number, r.r_head) as { created_at: string }[]).map((x) => x.created_at)),
      };
    }
    {
      const ended = taskEnded;
      for (const x of lintFixup.all(r.repo, r.number, r.r_head) as { source: string | null; lint_task: number | null }[]) {
        base.lint.push({ step: "fixup", source: x.source === "premerge" || x.source === "carry" || x.source === "operator" ? x.source : "review", ended: ended(x.lint_task) });
      }
      for (const x of lintCifix.all(r.repo, r.number, base.brokeByUs || base.gateRed ? head : r.r_head) as { lint_task: number | null }[]) base.lint.push({ step: "cifix", source: "review", ended: ended(x.lint_task) });
      for (const x of lintConflict.all(r.repo, r.number, r.r_head) as { lint_task: number | null }[]) base.lint.push({ step: "conflict", source: "review", ended: ended(x.lint_task) });
      if (base.lint.length && r.state === "OPEN") base.inFlight = true;
    }
    if (base.ci === "failure" || base.brokeByUs || base.gateRed) {
      const cfHead = base.brokeByUs || base.gateRed || (head && head !== r.r_head) ? head : r.r_head;
      base.cifix = cifixAt(cfHead ?? r.r_head!);
    }
    base.batch = inBatch.get(`${ref}@${r.r_head}`) ?? null;
    if (r.base_ref && r.state === "OPEN") base.stackedOn = (stackedOnQ.get(r.repo, r.base_ref, `${slugOf(r.repo)}`.toLowerCase(), r.number) as { number: number } | undefined)?.number ?? null;
    base.baseOffDefault = !!r.base_ref && !!rf.defaultBranch && r.base_ref !== rf.defaultBranch;
    base.mainFix = !!r.head_ref?.startsWith(MAIN_FIX_BRANCH_PREFIX) && ownHere;
    const gate = gates.get(ref);
    const { why, live } = changesRequestedWhy(gate, r.updated_at, reviewRows.all(r.repo, r.number) as ReviewFact[], r.review_decision);
    if (gate && gate.failures >= GATE_FAILURES) base.gateFailureNote = failureNote(gate.failures);
    if (why) base.changesRequested = { why, live };
    out.push(base);
  }
  return out;
}

/** Facts of one PR, or null when it is not an open PR (or a merged one with a take review). */
export function loadPrFact(db: DatabaseSync, repo: string, number: number, opts: Omit<LoadOptions, "repo" | "refs"> = {}): PrFacts | null {
  return loadPrFacts(db, { ...opts, repo, refs: [`${repo}#${number}`] })[0] ?? null;
}
export type { PrTier };

// ---- small readers shared with the merge modules ----

/** Returns a function that gives the head and the earlier heads AutoCraft itself pushed it from (a `pushing` row is a push that started and may have landed) (conflict merges of the base, fix-up pushes, carry-over pushes), newest first. */
export function pushChainOf(db: DatabaseSync): (repo: string, number: number, head: string) => string[] {
  const from = db.prepare(`SELECT from_head FROM conflict_merges WHERE repo = ?1 AND number = ?2 AND to_head = ?3 AND state IN ('merged', 'pushing')
    UNION SELECT from_head FROM fixups WHERE repo = ?1 AND number = ?2 AND to_head = ?3 AND state IN ('pushed', 'pushing')
    UNION SELECT from_head FROM dupe_carries WHERE repo = ?1 AND number = ?2 AND to_head = ?3 AND from_head IS NOT NULL
    UNION SELECT head FROM ci_fixes WHERE repo = ?1 AND number = ?2 AND to_head = ?3 AND state IN ('pushed', 'pushing')`);
  return (repo, number, head) => {
    const chain = [head];
    for (let k = 0; k < chain.length; k++) for (const f of from.all(repo, number, chain[k]!) as { from_head: string }[]) if (!chain.includes(f.from_head)) chain.push(f.from_head);
    return chain;
  };
}

/** Returns a function telling whether a PR's head is the pipeline's own work: a commit it pushed to its own branch, or one reached from such a commit only through its own later pushes. */
export function ownHeadOf(db: DatabaseSync): (repo: string, number: number, head: string) => boolean {
  const chain = pushChainOf(db);
  const pushed = db.prepare("SELECT 1 FROM main.own_commits WHERE repo = ? AND sha = ?");
  return (repo, number, head) => chain(repo, number, head).some((h) => !!pushed.get(repo, h));
}

/** True when any stored Opus review at the head (the current row or an overwritten one in the history) was a take or take-fix with sure = 0. */
export function headWasUnsure(db: DatabaseSync, repo: string, number: number, head: string): boolean {
  return !!db.prepare(UNSURE_AT_SQL).get(repo, number, head);
}

/** The closed PRs whose parts a pushed carry-over put on this PR, with their authors. */
function carriedSources(db: DatabaseSync, repo: string, number: number): { number: number; author: string | null; id: number | null }[] {
  const rows = db.prepare(`SELECT DISTINCT g.number, g.detail, i.author, i.author_id AS id FROM dupe_carries c
    JOIN dupe_group_items g ON g.decision_id = c.decision_id AND g.kind = 'pr' AND g.role = 'close'
    LEFT JOIN items i ON i.repo = c.repo AND i.number = g.number
    WHERE c.repo = ? AND c.number = ? AND c.outcome LIKE 'pushed%'`).all(repo, number) as { number: number; detail: string | null; author: string | null; id: number | null }[];
  return rows.filter((x) => { try { const p = (JSON.parse(x.detail ?? "null") as { carry?: unknown } | null)?.carry; return Array.isArray(p) && p.length > 0; } catch { return false; } })
    .map((x) => ({ number: x.number, author: x.author, id: x.id }));
}

export { tierKey, tiersOf, type AuthorRef };

/** PRs the pipeline opened itself from a Fix issues attempt or for a red default branch, as `repo#number`, when authored by its own account. */
export function ownFixPrs(db: DatabaseSync, repo?: string, slug?: string | null): { login: string | null; prs: Set<string>; quiet: Set<string>; isOwn: (repo: string, author: string | null) => boolean } {
  const logins = new Map<string, Set<string>>();
  const isOwn = (r: string, author: string | null): boolean => {
    if (!author) return false;
    let set = logins.get(r);
    if (!set) logins.set(r, (set = ownLogins(db, r, slug)));
    return set.has(author);
  };
  const login = (db.prepare("SELECT value FROM main.settings WHERE key = ?").get(PIPELINE_LOGIN_KEY) as { value: string } | undefined)?.value ?? null;
  const prs = new Set<string>();
  const quiet = quietFixPrs(db, repo);
  if (!login) return { login, prs, quiet, isOwn };
  for (const ref of quiet) prs.add(ref);
  for (const r of db.prepare("SELECT repo, pr_url FROM main.fix_attempts WHERE pr_url IS NOT NULL" + (repo ? " AND repo = ?" : "")).all(...(repo ? [repo] : [])) as { repo: string; pr_url: string }[]) {
    const m = r.pr_url.match(/\/pull\/(\d+)$/);
    if (m) prs.add(`${r.repo}#${m[1]}`);
  }
  for (const r of db.prepare("SELECT repo, pr_number AS n FROM main.main_fixes WHERE pr_number IS NOT NULL" + (repo ? " AND repo = ?" : "")).all(...(repo ? [repo] : [])) as { repo: string; n: number }[]) prs.add(`${r.repo}#${r.n}`);
  return { login, prs, quiet, isOwn };
}

/** Reads the pipeline account and the last successful assign or unassign of every item from the audit once; the returned function gives an item's assignment facts from its mirrored `assignees` (JSON). */
export function assignmentsOf(db: DatabaseSync, repo?: string): (ref: string, assignees: string | null) => AssignFacts {
  const login = (db.prepare("SELECT value FROM main.settings WHERE key = ?").get(PIPELINE_LOGIN_KEY) as { value: string } | undefined)?.value ?? null;
  const last = new Map<string, string | null>();
  for (const r of db.prepare(`SELECT target, details FROM audit WHERE action = 'assign' AND rowid IN (SELECT MAX(rowid) FROM audit
    WHERE action IN ('assign', 'unassign') AND COALESCE(details, '') NOT LIKE '%"error":%' ${repo ? "AND target >= ? AND target < ?" : ""} GROUP BY target)`)
    .all(...(repo ? [`${repo}#`, `${repo}$`] : [])) as { target: string; details: string | null }[]) {
    last.set(r.target, (safeJson(r.details) as { assignee?: string } | null)?.assignee ?? null);
  }
  return (ref, assignees) => {
    const list = parseList(assignees).filter((x): x is string => typeof x === "string");
    const by = last.get(ref);
    // Without a recorded account, the audit's own assignee stands for it.
    return { login: login ?? by ?? null, assignees: list, ours: by !== undefined && (login === null || by === login) };
  };
}
