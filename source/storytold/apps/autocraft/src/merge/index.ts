// Stage 6, Integrate (first part): merges the queued PRs that may merge, one
// at a time, through the configured merge command, and asks a "Merge this PR?"
// decision for taken PRs the merge rule doesn't cover. No model calls.
//
//   autocraft merge --repo R [--limit N] [--apply]
//
// Without --apply it is a dry run: it reads the local tables only, calls
// nothing and writes nothing.
import { scopeRepos } from "../pilot.ts";
import { FAST_FLOOR, workScores } from "../fasttrack.ts";
import { mergeHeld } from "./holds.ts";
import { backlogHeld, duplicateHeld } from "../dupes/held.ts";
import { baseRefusal, recordLiveBase } from "./base.ts";
import { mergeApprovalOf } from "./approval.ts";
import { markReread } from "./ci-approval.ts";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { connect } from "../db.ts";
import { actionable, ask, factsOf, getDecision } from "../decisions.ts";
import { CLI_BY, type By } from "../core/gates.ts";
import { guard, guardRepo, liveOf } from "../core/guard.ts";
import { planned } from "../core/select.ts";
import { claimForWork } from "../github/claim.ts";
import { pipelineMe } from "../github/pipeline-account.ts";
import { mergeViaCommand, MERGE_RECORDED_ENV, type Writer } from "../github/write.ts";
import { Client, markMerged, type Querier } from "../mirror.ts";
import { refreshChecks } from "../review/checks.ts";
import { readGate } from "./changes-requested.ts";
import { liveGateChecked } from "../review/discussion.ts";
import { fillReviewSummaries, reviewText } from "../review/summary.ts";
import { verificationOf } from "../verify/results.ts";
import { TIER_LABEL } from "../whitelist.ts";
import { closeMergedQuestions, withdrawBlockedQuestions, setAsideSupersededQuestions, withdrawGroupedQuestions, withdrawOtherHeadQuestions } from "./withdraw.ts";
import { buildQueue, UNSURE_REASON, PREMERGE_DEFECT_REASON, PREMERGE_UNSURE_REASON, PREMERGE_FAILED_REASON, ciAllows, countStates, HEAD_FACT, MERGE_OPTIONS, mergeDecisionId, QUEUE_STATES, VERIFY_UNAVAILABLE, verifyAllows, type QueueEntry } from "./queue.ts";

export { buildQueue, countStates, QUEUE_STATES, type QueueEntry, type QueueState } from "./queue.ts";
import { envVar } from "../env.ts";
import { effectiveCi, optionalChecks } from "../optional-checks.ts";
import { jobItem } from "../runner/job-items.ts";
import { sweepStaleAnswers } from "../answers/sweep.ts";
import { verifyOverride } from "./verify-override.ts";
import { askHoldDecisions } from "../act/index.ts";
import { authFailure, isWaiting, laneForDecision, markExecDone, noWriteReason, setExecState, SIGN_IN_REASON, type Lane, type LaneDeps } from "../github/user-lane.ts";
import { ownerOf } from "../owners.ts";
import { readEnvFor } from "../github/read.ts";

/** Name of the built-in guarded merge (`autocraft safe-merge`); any other `$AUTOCRAFT_MERGE_CMD` is run as an external command that must accept `--head <sha>` and refuse when the PR head differs. */
export const DEFAULT_MERGE_COMMAND = "safe-merge";

/** `--allow-failed` for each optional check of the repo, only for the built-in command (another command may not know the flag). */
export function allowFailedArgs(db: DatabaseSync, repo: string, cmd: string): string[] {
  return cmd === DEFAULT_MERGE_COMMAND ? optionalChecks(db, repo).flatMap((n) => ["--allow-failed", n]) : [];
}
const CLI = fileURLToPath(new URL("../cli.ts", import.meta.url));
const ACTOR = "merge";

export type CommandResult = { code: number; stdout: string; stderr: string };
export type MergeDeps = {
  querier: Querier;
  /** Runs the merge command; throws only when it can't be started. */
  run: (cmd: string, args: string[], env?: Record<string, string>) => Promise<CommandResult>;
  now: () => Date;
  /** The user lane's token source and transports; default: the secrets file's app. */
  lane?: LaneDeps;
  /** `$AUTOCRAFT_MERGE_CMD`, default the built-in `safe-merge`. */
  mergeCommand: string;
};

export type MergeParams = {
  repo: string;
  /** Most merges to attempt in this run. */
  limit?: number;
  /** Default true: only `dryRun: false` merges, assigns or asks. */
  dryRun?: boolean;
  /** Only PRs this accepts are merged. */
  only?: (e: QueueEntry) => boolean;
  /** Only the PRs whose merge action is single-only are merged (the rest are left to the integration batches). */
  singleOnly?: boolean;
  /** Stop at the first PR that is refused; the rest wait for the next round. */
  stopOnRefusal?: boolean;
  /** Called with the running count of PRs merged, after each merge. */
  onMerged?: (merged: number) => void;
  /** Who asked; default: an operator at the command line. */
  by?: By;
};

export type MergeSummary = {
  runId: string; repo: string; dryRun: boolean;
  states: Record<string, number>;
  /** PRs tried (or, in a dry run, that would be). */
  attempted: string[]; merged: string[]; refused: { ref: string; reason: string }[];
  /** Merge? decisions asked (or that would be). */
  asked: string[];
};

export async function spawnRun(cmd: string, args: string[], env?: Record<string, string>, replaceEnv = false): Promise<CommandResult> {
  // Without an environment of its own, a gh command reads and writes as the current identity (the app's token under `app`).
  const own = env ? undefined : await readEnvFor(cmd, args);
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: own ?? (env ? (replaceEnv ? env : { ...process.env, ...env }) : process.env) });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** Runs the merge command; the built-in name runs `autocraft safe-merge` from this checkout. */
export function mergeRun(cmd: string, args: string[], env?: Record<string, string>): Promise<CommandResult> {
  // With `env` (a user's token set) the child gets exactly that environment: no box token is left in it.
  return cmd === DEFAULT_MERGE_COMMAND ? spawnRun(process.execPath, ["--no-warnings", CLI, "safe-merge", ...args], { ...env, [MERGE_RECORDED_ENV]: "1" }, !!env) : spawnRun(cmd, args, env, !!env);
}

export function defaultDeps(): MergeDeps {
  return { querier: new Client(1000), run: mergeRun, now: () => new Date(), mergeCommand: envVar("MERGE_CMD") || DEFAULT_MERGE_COMMAND };
}

const refOf = (e: { repo: string; number: number }) => `${e.repo}#${e.number}`;
const short = (sha: string) => sha.slice(0, 7);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);

// ---- GitHub reads ----

export type PrInfo = { id: string; head: string; state: string; assignees: string[]; authors: number; commits: number; baseRef: string };

export const PR_INFO_QUERY = `query($owner: String!, $name: String!, $n: Int!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $n) {
      id headRefOid baseRefName state
      assignees(first: 10) { nodes { login } }
      commits(first: 100) { totalCount nodes { commit { authors(first: 10) { nodes { email name user { login } } } } } }
    }
  }
}`;

type InfoNode = {
  id: string; headRefOid: string; baseRefName: string; state: string; assignees?: { nodes?: { login: string }[] };
  commits?: { totalCount: number; nodes?: { commit?: { authors?: { nodes?: { email?: string | null; name?: string | null; user?: { login: string } | null }[] } } }[] };
};

export async function prInfo(q: Querier, repo: string, n: number): Promise<PrInfo | null> {
  const d = await q.query(PR_INFO_QUERY, { owner: ownerOf(repo), name: repo, n }) as { repository?: { pullRequest?: InfoNode | null } };
  const p = d.repository?.pullRequest;
  if (!p) return null;
  const who = new Set<string>();
  for (const c of p.commits?.nodes ?? [])
    for (const a of c.commit?.authors?.nodes ?? []) who.add(a.user?.login ? `@${a.user.login}` : (a.email || a.name || "?").toLowerCase());
  return {
    id: p.id, head: p.headRefOid, state: p.state, assignees: (p.assignees?.nodes ?? []).map((a) => a.login),
    authors: who.size, commits: p.commits?.totalCount ?? 0, baseRef: p.baseRefName,
  };
}

/** Squash keeps one author; a PR with commits by several (or more commits than we can read) is merged as is. */
export const methodOf = (info: PrInfo): "squash" | "merge" => (info.authors > 1 || info.commits > 100 ? "merge" : "squash");


// ---- decisions ---------------------------------------------------------------

/** The Merge? question for a take PR outside the rule; its facts carry the head commit. */
export function mergeQuestion(e: QueueEntry, why: string | null = null): Record<string, unknown> & { id: string } {
  const fixes = e.fixes ? `; ${e.fixes} fix${e.fixes === 1 ? "" : "es"} listed` : "";
  const pre = [
    ...(e.premerge?.defects ?? []).filter(() => e.outsideRule.includes(PREMERGE_DEFECT_REASON)).map((f) => `pre-merge defect: ${f.file}:${f.line} ${f.title}: ${f.scenario}`),
    ...(e.premerge?.unknownClaims ?? []).filter(() => e.outsideRule.includes(PREMERGE_UNSURE_REASON)).map((c) => `pre-merge could not settle a claim of the description: ${c.claim} (${c.evidence})`),
    ...(e.outsideRule.includes(PREMERGE_UNSURE_REASON) && !e.premerge?.unknownClaims.length ? ["pre-merge could not check the description's claims list"] : []),
    ...(e.outsideRule.includes(PREMERGE_FAILED_REASON) ? [`pre-merge review failed: ${(e.premerge?.error ?? "no review stored").replace(/^retry: /, "")}`] : []),
  ];
  const where = `size ${e.size}, label ${e.label ?? "not settled"}; author: ${e.author ?? "unknown"}, ${TIER_LABEL[e.tier]}`;
  const ci = `CI ${e.noCi ? "none: the repo has no CI checks" : e.ci}, mergeable ${e.mergeable.toLowerCase()}`;
  const verify = e.verify?.state === VERIFY_UNAVAILABLE
    ? `not verified: ${e.verify.summary ?? "Verify cannot build this repo"}`
    : `verify: ${e.verify ? `${e.verify.kind ?? "unknown"}, ${e.verify.state}${e.verify.note ? `: ${e.verify.note}` : ""}` : "none"}`;
  // A question has at most five facts: pre-merge lines take the place of the separate size, CI and verify lines, and defects beyond the first share one fact.
  const facts = pre.length
    ? [`${where}; ${ci}; ${verify}`, `review: ${e.verdict}: ${e.reason}${fixes}`, pre[0]!, ...(pre.length > 1 ? [pre.slice(1).join(" | ")] : []), `${HEAD_FACT}${e.head}`]
    : [where, ci, verify, `review: ${e.verdict}: ${e.reason}${fixes}`, `${HEAD_FACT}${e.head}`];
  return {
    id: mergeDecisionId(e.repo, e.number, e.head), kind: "merge", repo: e.repo, number: e.number,
    question: "Merge this PR?",
    context: `The review says take, but the merge-without-asking rule doesn't cover it: ${e.outsideRule.join(", ")}.`,
    facts,
    options: Object.values(MERGE_OPTIONS).map((o) => ({ ...o })),
    // A recommendation always comes with the review's reason for it.
    ...(e.outsideRule.includes(UNSURE_REASON) || e.outsideRule.includes(PREMERGE_UNSURE_REASON) || e.outsideRule.includes(PREMERGE_DEFECT_REASON) || e.outsideRule.includes(PREMERGE_FAILED_REASON) || !why ? {} : { recommended: "merge", recommended_reason: why }),
    asked_by: ACTOR,
  };
}

/** The Merge? question with the review's one-sentence reason as the reason of its recommendation. */
const questionWithReason = (db: DatabaseSync) => (e: QueueEntry) => mergeQuestion(e, reviewText(db, e.repo, e.number, e.head)?.why ?? null);

/** The head commit an answered Merge? decision was asked at, from its facts. */
export function answeredHead(db: DatabaseSync, id: string): string | null {
  const d = getDecision(db, id);
  const f = d ? factsOf(d).find((x) => x.startsWith(HEAD_FACT)) : undefined;
  return f ? f.slice(HEAD_FACT.length).trim() : null;
}


/** Asks the Merge? questions of the entries and sets aside the PR's unanswered questions at its other heads. */
function askDue(db: DatabaseSync, due: QueueEntry[], at: string, log: (line: string) => void = console.log): string[] {
  if (!due.length) return [];
  const qs = due.map(questionWithReason(db));
  ask(db, qs.map((q) => ({ ...q, asked_at: at })));
  due.forEach((e, i) => jobItem(db, e.repo, e.number, "asked Merge?", log, qs[i]!.id));
  for (const e of due) withdrawOtherHeadQuestions(db, e.repo, e.number, e.head, at);
  setAsideSupersededQuestions(db, at);
  return qs.map((q) => q.id);
}

/**
 * Asks the Merge? decisions that are due in the given repos (default: all), whether or not the repo has
 * a merge approval or a PR the rule could merge. Writes decisions only, nothing to GitHub.
 */
export function askMergeDecisions(db: DatabaseSync, opts: { repos?: string[]; run?: string | null; at?: string; log?: (line: string) => void } = {}): string[] {
  const repos = opts.repos && new Set(opts.repos);
  const queue = buildQueue(db, { merged: "exclude", ...(opts.run === undefined ? {} : { run: opts.run }) });
  const asks = new Set(planned(db, "ask-merge", { ...(opts.run === undefined ? {} : { run: opts.run }) }).filter((p) => !p.action.params?.hold && (!repos || repos.has(p.facts.repo))).map((p) => `${p.facts.repo}#${p.facts.number}`));
  const due = queue.filter((e) => asks.has(`${e.repo}#${e.number}`));
  const at = opts.at ?? new Date().toISOString();
  withdrawBlockedQuestions(db, queue.filter((e) => !repos || repos.has(e.repo)), at);
  for (const r of repos ?? new Set(queue.map((e) => e.repo))) withdrawGroupedQuestions(db, at, r);
  const ids = askDue(db, due, at, opts.log);
  for (const r of repos ?? new Set(planned(db, "ask-merge", {}).filter((p) => p.action.params?.hold).map((p) => p.facts.repo))) ids.push(...askHoldDecisions(db, at, r));
  fillReviewSummaries(db, at);
  return ids;
}

// ---- the step ----------------------------------------------------------------

export async function runMerge(db: DatabaseSync, params: MergeParams, log: (line: string) => void = console.log, deps?: MergeDeps): Promise<MergeSummary> {
  const { repo } = params;
  const w: Writer = { db, login: ACTOR };
  const dryRun = params.dryRun ?? true;
  if (params.limit !== undefined && !(Number.isInteger(params.limit) && params.limit >= 0)) throw new Error("limit must be a whole number ≥ 0");
  const at = () => (deps?.now() ?? new Date()).toISOString();
  const runId = `merge-${repo}-${at().replace(/[-:]/g, "").slice(0, 15)}`;
  if (!scopeRepos(db).has(repo)) {
    log(`merge ${repo}: not in the pipeline scope; nothing done`);
    return { runId, repo, dryRun, states: {}, attempted: [], merged: [], refused: [], asked: [] };
  }
  const d = deps ?? defaultDeps();
  // A PR in changes-requested is read live again each run: the mirror alone can block wrongly (the association is relative to the viewer) and a blocked PR never reaches the merge-time read.
  if (!dryRun) {
    for (const e of buildQueue(db, { repo, merged: "exclude" })) if (e.state === "changes-requested") await readGate(db, d.querier, ownerOf(repo), repo, e.number, log);
    // Set aside before the picks are made: a PR whose merge answer goes away here must not be picked and refused.
    // A Merge? question open for a PR a maintainer has since blocked no longer applies.
    const withdrawn = withdrawBlockedQuestions(db, buildQueue(db, { repo }).filter((e) => e.state !== "merged"), at());
    if (withdrawn) log(`  withdrew ${withdrawn} Merge? decision${withdrawn === 1 ? "" : "s"} of PRs with changes requested`);
    sweepStaleAnswers(db, at(), repo);
    const grouped = withdrawGroupedQuestions(db, at(), repo);
    if (grouped) log(`  set aside ${grouped} Merge? decision${grouped === 1 ? "" : "s"} of PRs in a duplicate group`);
  }
  const queue = buildQueue(db, { repo });
  const open = queue.filter((e) => e.state !== "merged");
  const states = countStates(queue);
  const scores = workScores(db, repo);
  const fast = (e: QueueEntry) => (scores.get(e.number) ?? 0) >= FAST_FLOOR;
  const byRank = (a: QueueEntry, b: QueueEntry) => (scores.get(b.number) ?? -1) - (scores.get(a.number) ?? -1) || a.number - b.number;
  // Fast-tracked PRs first, in the order added (their score falls with the order); then rule merges before answered ones, each by work score, unranked last.
  const mergeDue = new Map(planned(db, "merge", { repo }).map((p) => [p.facts.number, p.action.params?.singleOnly === true]));
  let picks = open.filter((e) => mergeDue.has(e.number) && (!params.only || params.only(e)) && (!params.singleOnly || mergeDue.get(e.number))).sort((a, b) =>
    fast(a) || fast(b) ? Number(fast(b)) - Number(fast(a)) || byRank(a, b) : a.path === b.path ? byRank(a, b) : a.path === "rule" ? -1 : 1);
  // An answered merge that waits for its operator's token or access takes no slot of the limit; it comes back when retried.
  picks = picks.filter((e) => !(e.path === "operator" && isWaiting(db, e.decisionId)));
  if (params.limit !== undefined) picks = picks.slice(0, params.limit);
  const askDueNow = new Set(planned(db, "ask-merge", { repo }).filter((p) => !p.action.params?.hold).map((p) => p.facts.number));
  const ask1 = open.filter((e) => askDueNow.has(e.number));
  const summary: MergeSummary = { runId, repo, dryRun, states, attempted: [], merged: [], refused: [], asked: [] };
  log(`merge ${repo}: ${queue.length} in the queue (${QUEUE_STATES.filter((s) => states[s]).map((s) => `${states[s]} ${s}`).join(", ") || "none"})`);

  if (dryRun) {
    summary.attempted = picks.map(refOf);
    summary.asked = ask1.map((e) => mergeDecisionId(e.repo, e.number, e.head));
    for (const e of picks) log(`  would merge ${refOf(e)} at ${short(e.head)} (${e.path === "rule" ? "by the rule" : "operator answered merge"})`);
    for (const e of ask1) log(`  would ask Merge? for ${refOf(e)}: ${e.outsideRule.join(", ")}`);
    log(`merge ${repo}: dry run, nothing called or written`);
    return summary;
  }

  // Every taken PR in the queue gets one `batched` stage row per head.
  const batched = db.prepare("SELECT 1 FROM stages WHERE repo = ? AND number = ? AND stage = 'batched' AND note LIKE ?");
  const stage = db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, ?, ?, ?, ?)");
  for (const e of open) {
    if (!batched.get(e.repo, e.number, `queued at ${short(e.head)}%`)) stage.run(e.repo, e.number, "batched", at(), ACTOR, `queued at ${short(e.head)}: ${e.state}`);
  }

  if (ask1.length) {
    summary.asked = askDue(db, ask1, at(), log);
    log(`  asked ${summary.asked.length} Merge? decision${summary.asked.length === 1 ? "" : "s"}`);
  }
  const holds = askHoldDecisions(db, at(), repo);
  if (holds.length) { summary.asked.push(...holds); log(`  asked ${holds.length} Hold decision${holds.length === 1 ? "" : "s"}`); }
  fillReviewSummaries(db, at());

  // What GitHub reported for the PR being tried, once known; a refusal records it so the autopilot retries only when it changes.
  let seen: { ci: string; mergeable: string } | null = null;
  const saveAttempt = (e: QueueEntry, method: string | null, outcome: "merged" | "refused", reason: string | null) =>
    db.prepare("INSERT INTO merges (repo, number, head_oid, run_id, at, path, method, outcome, reason, ci, mergeable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(e.repo, e.number, e.head, runId, at(), e.path!, method, outcome, reason, seen?.ci ?? e.ci, seen?.mergeable ?? e.mergeable);
  const refuse = (e: QueueEntry, method: string | null, reason: string) => {
    saveAttempt(e, method, "refused", reason);
    if (/action_required/.test(reason)) markReread(db, e.repo, e.number, e.head);
    audit(db, ACTOR, "merge-refused", refOf(e), { run: runId, head: e.head, path: e.path, method, reason });
    summary.refused.push({ ref: refOf(e), reason });
    log(`  ${refOf(e)}: refused: ${reason}`);
  };

  // One PR at a time; any error that isn't a refusal stops the run.
  for (const e of picks) {
    if (params.stopOnRefusal && summary.refused.length) break;
    if (!mergeApprovalOf(db, repo)) { log(`  merging in ${repo} is no longer approved; stopping`); break; }
    if (mergeHeld(db, repo, e.number)) { log(`  ${refOf(e)}: merge held since the queue was read; skipped`); continue; }
    if (backlogHeld(db, repo, e.number) || duplicateHeld(db, repo, e.number)) { log(`  ${refOf(e)}: held since the queue was read; skipped`); continue; }
    // An operator's Merge answer in a repo on the app's identity is made as that operator, with their token.
    let lane: Lane | null = null;
    if (e.path === "operator" && e.decisionId) {
      const lr = await laneForDecision(db, d.lane, e.decisionId, [repo]);
      if (lr && !("lane" in lr)) {
        if (!("transient" in lr)) setExecState(db, e.decisionId, lr.state, lr.reason);
        log(`  ${refOf(e)}: ${"transient" in lr ? `not merged yet: ${lr.transient}` : `waiting: ${lr.reason}`}`);
        continue;
      }
      if (lr) { lane = lr.lane; setExecState(db, e.decisionId, "pending"); }
    }
    summary.attempted.push(refOf(e));
    seen = null;
    const [ch] = await refreshChecks(db, d.querier, repo, [e.number]);
    // GitHub often has no mergeable state yet right after a merge: end the round without a refusal on record.
    if (params.stopOnRefusal && summary.merged.length && ch?.state === "OPEN" && ch.mergeable === "UNKNOWN") { log(`  ${refOf(e)}: GitHub has not computed its mergeable state yet; left for the next round`); summary.attempted.pop(); break; }
    if (ch) seen = { ci: effectiveCi(db, repo, ch.overall ?? "none", ch.checks), mergeable: ch.mergeable ?? "UNKNOWN" };
    if (!ch) { refuse(e, null, "GitHub returned no such PR"); continue; }
    if (ch.state !== "OPEN") { refuse(e, null, `no longer open on GitHub (${ch.state.toLowerCase()})`); continue; }
    if (ch.head_oid !== e.head) { refuse(e, null, `head moved from ${short(e.head)} to ${short(ch.head_oid)} since the review`); continue; }
    const ver = verificationOf(db, repo, e.number, ch.head_oid);
    if (!verifyAllows(e.path, ver?.state, verifyOverride(db, repo, e.number, ch.head_oid))) { refuse(e, null, `verification at ${short(ch.head_oid)} is ${ver?.state ?? "missing"}, not passed`); continue; }
    if (e.path === "operator") {
      const still = actionable(db).some((a) => a.id === e.decisionId && a.answer === MERGE_OPTIONS.merge.key);
      if (!still) { refuse(e, null, "the operator's merge answer is gone"); continue; }
      const h = answeredHead(db, e.decisionId!);
      if (h !== ch.head_oid) { refuse(e, null, `head moved since the operator's answer (${h ? short(h) : "no head recorded"} → ${short(ch.head_oid)})`); continue; }
    }
    const ci = effectiveCi(db, repo, ch.overall, ch.checks);
    if (!ciAllows(e.path, ci, e.noCi) || ch.mergeable !== "MERGEABLE") {
      refuse(e, null, `not ready at merge time: CI ${ci}, mergeable ${(ch.mergeable ?? "unknown").toLowerCase()}`);
      continue;
    }
    const info = await prInfo(d.querier, repo, e.number);
    if (!info) { refuse(e, null, "GitHub returned no such PR"); continue; }
    if (info.head !== e.head) { refuse(e, null, `head moved from ${short(e.head)} to ${short(info.head)} since the review`); continue; }
    const baseWhy = baseRefusal(db, repo, e.head, e.number, info.baseRef);
    // A retargeted PR is not a refusal either: the mirror takes the new base, which makes the review stale, so it is reviewed again against it.
    if (baseWhy) { recordLiveBase(db, repo, e.number, e.head, info.baseRef); log(`  ${refOf(e)}: ${baseWhy}; reviewed again first`); continue; }
    // Not a refusal: no merges row, so the queue keeps the PR and takes it up again once it is reviewed again.
    // The same read checks for a maintainer's changes-requested review, whatever merge command runs next.
    const gate = await liveGateChecked(db, d.querier, repo, e.number, e.head, log);
    if (gate === null) continue;
    if (gate.blocked) { log(`  ${refOf(e)}: ${gate.blocked}; not merged`); continue; }
    if (gate.moved) {
      audit(db, ACTOR, "merge-held-for-discussion", refOf(e), { run: runId, head: e.head, path: e.path });
      log(`  ${refOf(e)}: new comments or reviews since the final review; not merged, it is reviewed again first`);
      continue;
    }
    // A hold may have been set during the calls above.
    if (mergeHeld(db, repo, e.number)) { log(`  ${refOf(e)}: merge held meanwhile; skipped`); summary.attempted.pop(); continue; }
    const ag = guardRepo(db, repo, "merge", params.by ?? CLI_BY);
    if ("refused" in ag) log(`  ${refOf(e)}: not assigned: ${ag.refused}`);
    else await claimForWork(w, ag, d.querier, repo, e.number, "pr", () => pipelineMe(log), { run: runId }, log);
    const method = methodOf(info);
    const g = await guard(db, { repo, number: e.number }, { kind: "merge", head: e.head, ...(e.path === "operator" ? { decisionId: e.decisionId ?? undefined } : {}) }, params.by ?? CLI_BY, liveOf(db, d.querier));
    if ("refused" in g) {
      // Not recorded as a merge attempt: the PR is tried again once the reason is gone.
      summary.refused.push({ ref: refOf(e), reason: g.refused });
      log(`  ${refOf(e)}: not merged: ${g.refused}`);
      continue;
    }
    const r = await mergeViaCommand(w, d.run, d.mergeCommand, g, { method, extra: allowFailedArgs(db, repo, d.mergeCommand) }, { run: runId, head: e.head, path: e.path }, undefined, lane?.env);
    if (r.code !== 0) {
      const why = oneLine(r.stderr) || oneLine(r.stdout) || `exit code ${r.code}`;
      const denied = lane && e.decisionId ? authFailure(new Error(why)) : null;
      if (denied === "transient") { log(`  ${refOf(e)}: not merged yet: ${why}`); summary.attempted.pop(); continue; }
      if (denied) {
        // The user's token may not merge: wait for their access. No refusal is recorded, so the PR stays queued.
        setExecState(db, e.decisionId!, denied, denied === "waiting-token" ? SIGN_IN_REASON : noWriteReason(repo));
        log(`  ${refOf(e)}: waiting: ${why}`);
        summary.attempted.pop();
        continue;
      }
      if (lane && e.decisionId) setExecState(db, e.decisionId, "failed", why);
      refuse(e, method, `${d.mergeCommand}: ${why}`);
      continue;
    }
    saveAttempt(e, method, "merged", null);
    markMerged(db, e.repo, e.number, at());
    closeMergedQuestions(db, e.repo, e.number, at());
    stage.run(e.repo, e.number, "merged", at(), ACTOR, `${method} at ${short(e.head)}${e.path === "operator" ? ", operator answered merge" : ""}`);
    jobItem(db, e.repo, e.number, `merged by ${method} at ${short(e.head)}`, log);
    if (e.path === "operator") db.prepare("UPDATE main.decisions SET applied_at = ? WHERE id = ? AND applied_at IS NULL").run(at(), e.decisionId);
    summary.merged.push(refOf(e));
    params.onMerged?.(summary.merged.length);
    log(`  ${refOf(e)}: merged (${method})`);
  }
  markExecDone(db);
  log(`merge ${repo}: ${summary.merged.length} merged, ${summary.refused.length} refused, ${summary.asked.length} asked; run ${runId}`);
  return summary;
}

function parseArgs(args: string[]): { repo: string; limit?: number; apply: boolean } {
  let repo: string | undefined, limit: number | undefined, apply = false, dry = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--repo") repo = args[++i];
    else if (a === "--limit") limit = Number(args[++i]);
    else if (a === "--apply") apply = true;
    else if (a === "--dry-run") dry = true;
    else throw new Error(`unknown option ${a}; options: --repo R --limit N --apply --dry-run`);
  }
  if (!repo) throw new Error("missing --repo");
  if (apply && dry) throw new Error("--apply and --dry-run exclude each other");
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 0)) throw new Error("--limit is a whole number");
  return { repo, limit, apply };
}

export const commands = {
  "merge-ask": {
    summary: "merge-ask: ask the Merge? decisions that are due in every repo (writes decisions only)",
    run(): void {
      const ids = askMergeDecisions(connect());
      console.log(`Asked Merge? on ${ids.length} PR${ids.length === 1 ? "" : "s"}`);
    },
  },
  merge: {
    summary: "merge --repo R [--limit N] [--apply]: merge queued PRs that may merge, ask Merge? for the rest (dry run unless --apply)",
    async run(args: string[]): Promise<void> {
      const f = parseArgs(args);
      await runMerge(connect(), { repo: f.repo, limit: f.limit, dryRun: !f.apply });
    },
  },
  queue: {
    summary: "queue [--repo R]: the merge queue with each PR's state and verification",
    run(args: string[]): void {
      const i = args.indexOf("--repo");
      const q = buildQueue(connect(), { repo: i >= 0 ? args[i + 1] : undefined });
      const c = countStates(q);
      console.log(QUEUE_STATES.map((s) => `${s}: ${c[s]}`).join(", "));
      for (const e of q) console.log(`${refOf(e)}\t${e.state}\t${e.verdict}\t${e.size}\t${e.label ?? "-"}\t${e.ci}\t${e.mergeable}\t${e.verify?.state ?? "-"}\t${e.refusedReason ?? e.outsideRule.join("; ")}`);
    },
  },
};
