// The pipeline steps the runner can run. Each step is a declaration: who may
// request it, a params schema, an optional mutex and the function that runs
// it. Adding a step means adding one entry to STEPS (and the module its `run`
// imports); the dashboard, the API, the autopilot and the runner pick it up from here.
//
// Params are only enums, tracked repo names, bounded integers and run ids:
// nothing a person types can reach a model's prompt or a shell.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import { byOfJob } from "../core/gates.ts";
import { featureOn } from "../build/features.ts";
import { envVar } from "../env.ts";
import { stageOfStep } from "../stages/registry.ts";

type Base = { name: string; label: string; help?: string; required?: boolean };
export type ParamDef =
  | (Base & { kind: "enum"; options: string[]; default?: string })
  | (Base & { kind: "repo" })                                        // a tracked repo
  | (Base & { kind: "int"; min: number; max: number; default?: number })
  | (Base & { kind: "run-id"; default?: string });                   // RUN_ID below

export type Params = Record<string, string | number>;

export const RUN_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;

export type StepContext = {
  db: DatabaseSync;
  job: { id: number; requestedBy: string; startedAt: string };
  params: Params;
  /** One line shown on the dashboard while the job runs. */
  progress(text: string): void;
  /** A line in the job's log. Logs are shown to everyone signed in: no secrets. */
  log(line: string): void;
  /** Model calls recorded in token_usage under this run id (from the job's start) count as the job's usage. */
  usageRun(runId: string): void;
  /** Items this job has handled so far (units attempted, such as items sent to a model), counted against the stage's daily limit. Pass the running total as work goes: it is saved at once, so a failed or stopped job keeps its count. */
  handled(n: number): void;
  /** Progress that is not an item: a batch started, opened or advanced, a decision asked. A job with no items and no acted is recorded as having done nothing, and the autopilot does not queue it again until its input changes. */
  acted(n: number): void;
  /** Set when a cancel was requested; long loops should stop between units of work. */
  cancelled(): boolean;
  /** True when no new item should start: a cancel was requested, the deadline passed, or a pipeline job runs while the pipeline is not on. The current item finishes. */
  stopping(): boolean;
};

export type StepDef = {
  name: string;
  /** Model-call queue class: 2 security, 1 path to merge, 0 (default) triage and after merge. A higher class takes a freed account slot first. */
  priority?: 0 | 1 | 2;
  title: string;
  /** One or two plain sentences for the Pipeline page. */
  description: string;
  /** Stage number in docs/pipeline.md. */
  stage: number;
  /** Who may start or cancel it. Anything that writes to GitHub or spends model quota is operator-only. */
  requires: "operator";
  /**
   * A named mutex: running jobs of steps that share the name run one at a time. Only for work on shared run tables or
   * global state. Other steps have at most one queued or running job per repo (security-fix: per finding), and the
   * `step_parallel` setting limits how many repos one step works at once.
   */
  exclusive?: string;
  params: ParamDef[];
  /** Models the step calls, known before any call is made: a list, or derived from the params. Empty or absent for steps that call none. */
  models?: string[] | ((params: Params) => string[]);
  /** null when the step can run; otherwise why not, shown on the page. */
  available?: () => string | null;
  /** Checks a request beyond the schema (null = fine), at request time and again before the run. */
  check?: (db: DatabaseSync, params: Params) => Promise<string | null> | string | null;
  /** Runs the step in the job's child process and returns a one-line summary. */
  run: (ctx: StepContext) => Promise<string>;
};

/** Labelling writes to GitHub only for repos in the pipeline scope that an operator approved on the Repos page. */
async function checkApproved(db: DatabaseSync, p: Params): Promise<string | null> {
  const { approvalOf } = await import("../labels/approval.ts");
  const { scopeRepos } = await import("../pilot.ts");
  if (!scopeRepos(db).has(String(p.repo))) return `${p.repo} is not in the pipeline scope`;
  return approvalOf(db, String(p.repo)) ? null : `labelling ${p.repo} is not approved`;
}

export function modelsOf(step: StepDef | undefined, params: Params): string[] {
  const m = step?.models;
  return typeof m === "function" ? m(params) : (m ?? []);
}

/** Models served through a Claude account (everything but Jev, which has none). */
export const usesClaude = (models: string[]): boolean => models.some((m) => m !== "jev");

/** Merging is opt-in per repo: tracked repos include ones we do not maintain. */
async function checkMergeApproved(db: DatabaseSync, p: Params): Promise<string | null> {
  const { mergeApprovalOf } = await import("../merge/approval.ts");
  return mergeApprovalOf(db, String(p.repo)) ? null : `merging in ${p.repo} is not approved`;
}

/** Approving workflow runs of outside contributors' PRs is opt-in per repo. */
async function checkCiApproved(db: DatabaseSync, p: Params): Promise<string | null> {
  const { ciApprovalOf } = await import("../merge/ci-approval.ts");
  return ciApprovalOf(db, String(p.repo)) ? null : `approving CI runs in ${p.repo} is not approved`;
}

/** The nightly checks run only for repos whose build feature is switched on. */
function checkNightlyOn(db: DatabaseSync, p: Params): string | null {
  return featureOn(db, "nightly", String(p.repo)) ? null : `the Nightly checks feature is off for ${p.repo}`;
}

/** Acting on a red default branch is opt-in per repo. */
async function checkMainFixApproved(db: DatabaseSync, p: Params): Promise<string | null> {
  const { mainFixApprovalOf } = await import("../mainfix/approval.ts");
  return mainFixApprovalOf(db, String(p.repo)) ? null : `fixing a red main in ${p.repo} is not approved`;
}

/** Comments and closes are opt-in per repo: tracked repos include ones we do not maintain. */
async function checkCommentApproved(db: DatabaseSync, p: Params): Promise<string | null> {
  const { commentApprovalOf } = await import("../act/approval.ts");
  return commentApprovalOf(db, String(p.repo)) ? null : `commenting in ${p.repo} is not approved`;
}

/** Pushing to contributors' branches and commenting the fixes are each opt-in per repo; the fix-up step needs either. */
async function checkPushApproved(db: DatabaseSync, p: Params): Promise<string | null> {
  const { pushApprovalOf } = await import("../fixup/approval.ts");
  const { commentApprovalOf } = await import("../act/approval.ts");
  return pushApprovalOf(db, String(p.repo)) || commentApprovalOf(db, String(p.repo)) ? null : `pushing fix-ups or commenting in ${p.repo} is not approved`;
}

/** Opening fix PRs from issues is opt-in per repo. */
async function checkFixIssueApproved(db: DatabaseSync, p: Params): Promise<string | null> {
  const { fixIssueApprovalOf } = await import("../fixissue/approval.ts");
  return fixIssueApprovalOf(db, String(p.repo)) ? null : `fixing issues in ${p.repo} is not approved`;
}

const SECURITY_FINDING_PARAMS: ParamDef[] = [
  { name: "repo", label: "Repo", kind: "repo", required: true },
  { name: "number", label: "Finding", kind: "int", min: 1, max: 1_000_000_000, required: true, help: "the finding's number in the repo" },
];

/** The finding exists and is in a state the step works on. */
async function securityFindingCheck(db: DatabaseSync, p: Params, states: string[]): Promise<string | null> {
  const row = db.prepare("SELECT state FROM security_findings WHERE repo = ? AND number = ?").get(String(p.repo), Number(p.number)) as { state: string } | undefined;
  if (!row) return "no such finding";
  return states.includes(row.state) ? null : `the finding is ${row.state}`;
}

async function securityLandDeps(ctx: StepContext): Promise<import("../security/land.ts").LandDeps> {
  const { exec, fixupDir } = await import("../fixup/git.ts");
  const { whoAmI } = await import("../fixup/index.ts");
  return { exec, root: fixupDir(), who: () => whoAmI(exec), log: ctx.log };
}

/** The run number a step records in agent_runs.stage: its stage's, from the registry. */
function runStage(step: string): number {
  const s = stageOfStep(step);
  if (!s) throw new Error(`step ${step} is in no stage of the registry`);
  return s.runStage;
}

export const STEPS: StepDef[] = [
  {
    name: "classify-new",
    title: "Classify new and changed items",
    description: "Jev labels open items that have no verdict in the current classification run, or whose text changed since; Haiku gives a second opinion where Jev is under 90 % sure.",
    stage: runStage("classify-new"),
    requires: "operator",
    exclusive: "classify",
    models: ["jev", "haiku"],
    params: [{ name: "limit", label: "At most", kind: "int", min: 1, max: 5000, default: 500, help: "items per model in this job" }],
    run: async (ctx) => (await import("./classify.ts")).classifyNew(ctx),
  },
  {
    name: "classify-all",
    title: "Classification pass",
    description: "Jev labels every open item of the tracked repos into the given run, then Haiku the ones Jev is unsure of. A stopped pass continues where it left off when started again with the same run id; once complete, the run becomes the current one.",
    stage: runStage("classify-all"),
    requires: "operator",
    exclusive: "classify",
    models: ["jev", "haiku"],
    params: [
      { name: "run", label: "Run id", kind: "run-id", required: true, help: "lowercase letters, digits and dashes" },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 30000, default: 30000, help: "items per model in this job" },
    ],
    run: async (ctx) => (await import("./classify.ts")).classifyAll(ctx),
  },
  {
    name: "embed",
    title: "Embed items",
    description: "Computes local sentence embeddings of new and changed items for similar items and semantic search. Runs on this machine; no model quota.",
    stage: runStage("embed"),
    requires: "operator",
    exclusive: "embed",
    params: [
      { name: "all", label: "Every item", kind: "enum", options: ["no", "yes"], default: "no", help: "yes embeds all items again, not only new and changed ones" },
      { name: "threads", label: "Threads", kind: "int", min: 1, max: 8, default: 4 },
    ],
    run: async (ctx) => {
      const { embedCommand } = await import("../embed/index.ts");
      ctx.handled(await embedCommand([...(ctx.params.all === "yes" ? ["--all"] : []), "--threads", String(ctx.params.threads)], ctx.handled));
      return ctx.params.all === "yes" ? "embedded every item" : "embedded new and changed items";
    },
  },
  {
    name: "labels-ensure",
    title: "Create the pipeline labels on GitHub",
    description: "Creates the labels of the set that the repo is missing. Refused unless the operator has approved labelling for that repo.",
    stage: runStage("labels-ensure"),
    requires: "operator",
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }],
    check: checkApproved,
    run: async (ctx) => {
      const repo = String(ctx.params.repo);
      const refused = await checkApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const { ensureLabels } = await import("../labels/github.ts");
      const { Client } = await import("../mirror.ts");
      const missing = await ensureLabels(new Client(500), repo, true, { db: ctx.db, login: ctx.job.requestedBy }, undefined, byOfJob(ctx.job.requestedBy));
      for (const l of missing) ctx.log(`${repo}: created "${l.name}"`);
      return missing.length ? `created ${missing.length} labels on ${repo}` : `${repo}: all labels exist`;
    },
  },
  {
    name: "labels-apply",
    title: "Apply labels on GitHub",
    description: "Puts the settled type label and flags of the current classification run onto the open items of one repo on GitHub. Refused unless the operator has approved labelling for that repo.",
    stage: runStage("labels-apply"),
    requires: "operator",
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 5000, default: 500, help: "items to label in this job" },
    ],
    check: checkApproved,
    run: async (ctx) => {
      const repo = String(ctx.params.repo);
      const refused = await checkApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const { latestRun } = await import("../classify/settled.ts");
      const runId = latestRun(ctx.db);
      if (!runId) throw new Error("there is no classification run yet");
      const { applyLabels, ensureLabels } = await import("../labels/github.ts");
      const { Client } = await import("../mirror.ts");
      // Approval for labelling covers creating the set's labels the repo lacks.
      for (const l of await ensureLabels(new Client(500), repo, true, { db: ctx.db, login: ctx.job.requestedBy }, undefined, byOfJob(ctx.job.requestedBy))) ctx.log(`${repo}: created "${l.name}"`);
      const r = await applyLabels(ctx.db, new Client(500), repo, { runId, limit: Number(ctx.params.limit), apply: true, login: ctx.job.requestedBy, by: byOfJob(ctx.job.requestedBy), log: ctx.log, onLabeled: ctx.handled });
      return `${repo}: labelled ${r.labeled} of ${r.planned} items in ${r.batches} batches, ${r.failed.length} failed`;
    },
  },
  {
    name: "decide",
    priority: 1,
    title: "Ask decisions",
    description: "Turns items that need a decision, and items where Jev and Haiku disagree between scope labels, into decisions on the dashboard, then prepares every open decision: one call of the judgement model writes the summary, the pick and drafted answers from what stopped the pipeline. Each prepare call counts as an item.",
    stage: runStage("decide"),
    requires: "operator",
    models: () => ["opus"],
    params: [
      { name: "repo", label: "Repo", kind: "repo", help: "every tracked repo when empty" },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 500, default: 50, help: "decisions to ask in this job; also the most prepare calls" },
    ],
    run: async (ctx) => {
      const { runDecide } = await import("../decide/index.ts");
      const r = await runDecide(ctx.db, {
        repos: ctx.params.repo ? [String(ctx.params.repo)] : undefined,
        limit: Number(ctx.params.limit),
        onSent: ctx.handled,
      }, ctx.log);
      if (r.usageRun) ctx.usageRun(r.usageRun);
      return `asked ${r.asked} decisions; ${r.prepared} prepared`;
    },
  },
  {
    name: "main-ci",
    title: "Read CI on the default branches",
    description: "Reads the head commit and the checks of the default branch of every synced repo from GitHub in one query, and stores the state of each: green, red, optional failing, running or no CI. Writes nothing to GitHub.",
    stage: runStage("main-ci"),
    requires: "operator",
    params: [{ name: "repo", label: "Repo", kind: "repo", help: "every synced repo when empty" }],
    run: async (ctx) => {
      const { pollMainCi } = await import("../mainci/index.ts");
      const { Client } = await import("../mirror.ts");
      const r = await pollMainCi(ctx.db, new Client(1000), typeof ctx.params.repo === "string" ? ctx.params.repo : undefined, ctx.log);
      ctx.handled(r.heads);
      return `read the default branch of ${r.repos} repos`;
    },
  },
  {
    name: "checks",
    title: "Refresh CI and merge state",
    description: "Reads the CI and merge state of every open pull request of one repo from GitHub. Writes nothing to GitHub.",
    stage: runStage("checks"),
    requires: "operator",
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }],
    run: async (ctx) => {
      const { runChecks } = await import("../review/index.ts");
      const r = await runChecks(ctx.db, { repo: String(ctx.params.repo) }, ctx.log);
      ctx.handled(r.prs);
      return `${ctx.params.repo}: refreshed ${r.prs} open pull requests`;
    },
  },
  {
    name: "merge",
    title: "Merge queued pull requests",
    description: "Lands the pull requests of one repo that may merge in integration batches: up to 10 at a time are merged into one integration branch, checked in the sandbox, opened as one pull request on the storytold repo and merged with merge commits through the safe-merge command once upstream CI is green. A failed batch is split in half; a single failing PR is held. Pull requests in a repo the sandbox cannot build are merged one at a time. When a few pull requests are ready (at most the single-merge limit, 3 by default), each is mergeable with green CI and no two change the same file, they are merged one at a time in order without a batch; each is checked again just before its merge and the first that is no longer ready ends the round.",
    stage: runStage("merge"),
    requires: "operator",
    models: [],
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 10, help: "pull requests to start or merge in this job" },
    ],
    check: checkMergeApproved,
    run: async (ctx) => {
      const { runMerge } = await import("../merge/index.ts");
      const { runBatches } = await import("../merge/batch.ts");
      const { runSingles } = await import("../merge/single.ts");
      const refused = await checkMergeApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const repo = String(ctx.params.repo), limit = Number(ctx.params.limit);
      const singly = await runSingles(ctx.db, { repo, limit, onMerged: ctx.handled, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      if (singly) {
        ctx.acted(singly.merged.length + singly.asked.length);
        return `${repo}: ${singly.merged.length} merged singly, ${singly.refused.length} refused, ${singly.asked.length} decisions asked`;
      }
      const b = await runBatches(ctx.db, { repo, limit, onMerged: ctx.handled, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      ctx.usageRun(b.runId);
      let single = { merged: [] as string[], attempted: [] as string[], refused: [] as unknown[], asked: [] as string[] };
      if (limit > b.merged.length) {
        single = await runMerge(ctx.db, { repo, limit: limit - b.merged.length, dryRun: false, singleOnly: true, onMerged: (n) => ctx.handled(b.merged.length + n), by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      }
      ctx.acted(b.started.length + b.published.length + b.split.length + b.superseded.length + b.failed.length + single.merged.length + single.asked.length + b.merged.length);
      return `${repo}: ${b.merged.length} merged in batches (${b.started.length} started, ${b.published.length} opened, ${b.split.length} split), ${single.merged.length} merged singly, ${single.asked.length} decisions asked`;
    },
  },
  {
    name: "merge-ask",
    title: "Ask Merge? decisions",
    description: "Asks a \"Merge this PR?\" decision for every taken pull request the merge rule does not cover once its verification is in, in all tracked repos, whether or not merging is approved there. Calls no model and writes nothing to GitHub.",
    stage: runStage("merge-ask"),
    requires: "operator",
    models: [],
    params: [],
    run: async (ctx) => {
      const { askMergeDecisions } = await import("../merge/index.ts");
      const { trackedNames } = await import("../repos.ts");
      const ids = askMergeDecisions(ctx.db, { repos: trackedNames(ctx.db), log: ctx.log });
      ctx.handled(ids.length);
      return `Asked Merge? on ${ids.length} PR${ids.length === 1 ? "" : "s"}`;
    },
  },
  {
    name: "act",
    title: "Comment and close",
    description: "Posts one short comment and closes the items an operator answered Out of scope or Close, and asks a \"Close this PR?\" decision for each PR whose review says close. Skips an item that already closed or whose PR head moved. Calls no model.",
    stage: runStage("act"),
    requires: "operator",
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 20, help: "items to act on in this job" },
    ],
    check: checkCommentApproved,
    run: async (ctx) => {
      const { runAct } = await import("../act/index.ts");
      const refused = await checkCommentApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const r = await runAct(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), dryRun: false, onHandled: ctx.handled, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      ctx.acted(r.done.length + r.skipped.length + r.failed.length + r.asked.length + (r.cards ?? 0));
      const line = `${r.repo}: ${r.done.length} closed, ${r.skipped.length} skipped, ${r.failed.length} failed, ${r.asked.length} decisions asked${r.cards ? `, ${r.cards} queued presses carried out` : ""}`;
      // A failed target ends the job as failed, so the registered failure backoff spaces its next tries (a target stops after ACT_MAX_ATTEMPTS).
      if (r.failed.length) throw new Error(`${line}; ${r.failed[0]!.ref}: ${r.failed[0]!.reason}`);
      return line;
    },
  },
  {
    name: "fixup",
    priority: 1,
    title: "Fix up take-fix pull requests",
    description: "For take-fix pull requests we may push to, Sonnet turns the review's fix list into a diff that is checked and applied on top of the reviewed head, checked by Opus, pushed to the contributor's branch and noted with one short comment. For a pull request it cannot push to, in a repo approved for comments, it posts the fixes as one comment instead. The new head is reviewed again.",
    stage: runStage("fixup"),
    requires: "operator",
    models: ["sonnet", "opus"],
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 5, help: "pull requests to fix up in this job" },
    ],
    check: checkPushApproved,
    run: async (ctx) => {
      const { runFixup } = await import("../fixup/index.ts");
      const refused = await checkPushApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const r = await runFixup(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), dryRun: false, onHandled: ctx.handled, stopping: ctx.stopping, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      ctx.acted(r.pushed.length + r.asked.length + r.failed.length + r.held.length);
      return `${r.repo}: pushed ${r.pushed.length}, ${r.asked.length} asked, ${r.failed.length} failed or refused, ${r.held.length} held`;
    },
  },
  {
    name: "verify",
    priority: 1,
    title: "Plan verification of taken pull requests",
    description: "Sonnet decides per taken pull request of one repo whether CI is enough, or which crates and tests a build machine should run, or (bug fixes) a regression test that fails before the change. Queues the build tasks; reads GitHub, writes nothing to it.",
    stage: runStage("verify"),
    requires: "operator",
    models: ["sonnet"],
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 10, help: "PRs to plan in this job" },
    ],
    run: async (ctx) => {
      const { runVerify } = await import("../verify/index.ts");
      const r = await runVerify(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), onHandled: ctx.handled, stopping: ctx.stopping }, ctx.log);
      ctx.usageRun(r.runId);
      const k = Object.entries(r.kinds).map(([x, n]) => `${n} ${x}`).join(", ");
      return `${r.repo}: planned ${r.handled} of ${r.candidates} candidates${k ? ` (${k})` : ""}; ${r.errors} errors, ${r.tasks.length} tasks queued`;
    },
  },
  {
    name: "verify-collect",
    priority: 1,
    title: "Collect verification results",
    description: "Reads the finished build tasks of each pending verification and sets passed, failed or error from their exit codes. For a failure, Haiku summarises the log; the failure becomes a hold. Cancels the tasks of a PR whose head moved on, and queued warm builds of a branch that moved on.",
    stage: runStage("verify-collect"),
    requires: "operator",
    models: ["haiku"],
    params: [],
    run: async (ctx) => {
      const { runCollect } = await import("../verify/results.ts");
      const r = await runCollect(ctx.db, { stopping: ctx.stopping }, ctx.log);
      ctx.usageRun(r.runId);
      ctx.handled(r.changed);
      return `${r.looked} pending: ${r.passed} passed, ${r.failed} failed, ${r.errors} errors, ${r.retried} retried, ${r.stale} stale, ${r.running} running; ${r.warmCancelled} warm builds cancelled`;
    },
  },
  {
    name: "pr-build",
    priority: 1,
    title: "Build pull requests",
    description: "Queues our own workspace build of open pull request heads of one repo (outside authors' PRs, or every PR, as the repo's scope says) and records the finished ones. A second opinion beside upstream CI: it never holds a PR; a build that fails where CI passed is noted on the item. No model call, nothing written to GitHub.",
    stage: runStage("pr-build"),
    requires: "operator",
    models: [],
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }],
    run: async (ctx) => {
      const { runPrBuilds } = await import("../prbuild/index.ts");
      const r = await runPrBuilds(ctx.db, String(ctx.params.repo), ctx.log);
      ctx.handled(r.queued + r.passed + r.failed + r.errors + r.stale + r.retried);
      return `${ctx.params.repo}: ${r.queued} queued, ${r.passed} passed, ${r.failed} failed (${r.disagreements} where CI passed), ${r.errors} errors, ${r.stale} stale, ${r.retried} retried`;
    },
  },
  {
    name: "prioritize",
    title: "Prioritize open items",
    description: "Jev rates the priority level (P0 to P4, P4 = backlog) of open items whose text has no priority yet; Haiku decides where Jev is under 90 % sure. Then every item's reach (the tie-breaker inside a level) is recomputed from comments, linked PRs, duplicates, age and the security flag.",
    stage: runStage("prioritize"),
    requires: "operator",
    models: ["jev", "haiku"],
    params: [{ name: "limit", label: "At most", kind: "int", min: 1, max: 30000, default: 1000, help: "items sent to Jev in this job" }],
    run: async (ctx) => {
      const { runPrioritize } = await import("../priority/index.ts");
      const r = await runPrioritize(ctx.db, { limit: Number(ctx.params.limit), onSent: ctx.handled, cancelled: ctx.cancelled, log: ctx.log });
      return r.due ? `rated ${r.saved} of ${r.sent} items (${r.jev} by Jev, ${r.haiku} by Haiku), ${r.due - r.sent > 0 ? r.due - r.sent : 0} left; ${r.rescored} reach values changed` : `nothing new to rate; ${r.rescored} reach values changed`;
    },
  },
  {
    name: "dupes",
    title: "Find duplicates",
    description: "Looks up the nearest neighbours of new and changed open items in the same repo, among open items and items closed in the last year. Jev checks each pair; Haiku gives a second opinion where Jev is under 90 % sure either way. Each confirmed duplicate becomes a \"Close as a duplicate?\" decision; the act step closes only on an operator's answer. Writes nothing to GitHub.",
    stage: runStage("dupes"),
    requires: "operator",
    exclusive: "dupes",
    models: ["jev", "haiku"],
    params: [{ name: "limit", label: "At most", kind: "int", min: 1, max: 5000, default: 2000, help: "pairs to check in this job" }],
    run: async (ctx) => {
      const { runDupes } = await import("../dupes/index.ts");
      const r = await runDupes(ctx.db, { limit: Number(ctx.params.limit), onHandled: ctx.handled }, ctx.log);
      const v = Object.entries(r.verdicts).map(([k, n]) => `${n} ${k}`).join(", ");
      ctx.acted(r.scanned + r.pairsAdded + r.asked.length + r.answersApplied);
      return `scanned ${r.scanned} items, ${r.pairsAdded} new pairs; checked ${r.checked}${v ? ` (${v})` : ""}; ${r.asked.length} decisions asked, ${r.answersApplied} answers applied`;
    },
  },
  {
    name: "fixissue",
    priority: 1,
    title: "Fix issues",
    description: "The issue path of the pipeline. For open bugfix issues with a clear fix, Sonnet triages the issue, then writes a fix and a regression test as a diff that is checked and queued as build tasks: the test must fail on main and everything must pass with the fix. Rounds that fail are tried again, three at most.",
    stage: runStage("fixissue"),
    requires: "operator",
    models: ["sonnet", "haiku"],
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 20, default: 3, help: "issues to start in this job" },
    ],
    check: checkFixIssueApproved,
    run: async (ctx) => {
      const { runFixIssue } = await import("../fixissue/index.ts");
      const refused = await checkFixIssueApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const r = await runFixIssue(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), dryRun: false, onHandled: ctx.handled, stopping: ctx.stopping, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      ctx.usageRun(r.runId);
      return `${r.repo}: ${r.started.length} started, ${r.skipped.length} not a clear fix, ${r.queued.length} further rounds queued`;
    },
  },
  {
    name: "fixissue-collect",
    priority: 1,
    title: "Collect fix results",
    description: "Reads the finished build tasks of each fix attempt. A fix passes when its tests pass and the regression test fails without it; Opus then checks the patch; on a reject the round fails and Opus's reasons go into the next round. Then the commit is pushed to the pipeline's fork, the pull request is opened and the issue gets one comment. For a failed round, Haiku summarises the log for the next round.",
    stage: runStage("fixissue-collect"),
    requires: "operator",
    models: ["haiku", "opus"],
    params: [],
    run: async (ctx) => {
      const { runFixIssueCollect } = await import("../fixissue/index.ts");
      const r = await runFixIssueCollect(ctx.db, { stopping: ctx.stopping, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      ctx.usageRun(r.runId);
      ctx.handled(r.changed);
      return `${r.looked} pending: ${r.passed} passed, ${r.opened} PRs opened, ${r.failedRounds} failed rounds, ${r.failed} failed, ${r.retried} retried`;
    },
  },
  {
    name: "security-scan",
    priority: 2,
    title: "Security deep scan",
    description: "Audits the default branch of a repo for vulnerabilities: Opus builds a threat model and splits the code into areas, scans each area read-only, then tries to disprove every finding. Started only by an operator on the repo page, with an optional spend cap; findings are visible to operators and maintainers only and nothing goes to GitHub.",
    stage: 9,
    requires: "operator",
    models: ["opus"],
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "scan", label: "Scan", kind: "int", min: 1, max: 1_000_000_000, required: true, help: "the scan row the API created" },
    ],
    check: async (db, p) => {
      const row = db.prepare("SELECT repo, state FROM security_scans WHERE id = ?").get(Number(p.scan)) as { repo: string; state: string } | undefined;
      if (!row || row.repo !== p.repo) return "no such scan";
      return ["modeling", "scanning", "verifying"].includes(row.state) ? null : `the scan already ended (${row.state})`;
    },
    run: async (ctx) => {
      const { runScan } = await import("../security/scan.ts");
      const { realDeps } = await import("../security/real.ts");
      const { usageRunId } = await import("../security/real.ts");
      ctx.usageRun(usageRunId(Number(ctx.params.scan)));
      const { autoFixConfirmed } = await import("../security/actions.ts");
      const deps = realDeps(ctx.db, Number(ctx.params.scan), { cancelled: ctx.cancelled, log: ctx.log, progress: ctx.progress });
      return runScan(ctx.db, Number(ctx.params.scan), { ...deps, confirmed: (n) => autoFixConfirmed(ctx.db, String(ctx.params.repo), n) });
    },
  },
  {
    name: "security-fix",
    priority: 2,
    title: "Security fix",
    description: "Writes the private fix of one finding on the scan's pinned commit: Opus writes the patch and a regression test, the worker container builds and tests it, and Opus reviews the diff. A failed round is repeated in the same model session while the prompt cache is warm. The commit stays in the local cache and is never pushed. Starts on its own when verify confirms the finding, once per finding; after a failed fix an operator starts it again from the finding page. Nothing goes to GitHub.",
    stage: 9,
    requires: "operator",
    models: ["opus"],
    params: SECURITY_FINDING_PARAMS,
    check: (db, p) => securityFindingCheck(db, p, ["fixing"]),
    run: async (ctx) => {
      const { runFix, defaultFixDeps } = await import("../security/fix.ts");
      const { usageRunId } = await import("../security/real.ts");
      const { rawFinding } = await import("../security/store.ts");
      const repo = String(ctx.params.repo), n = Number(ctx.params.number);
      const scan = rawFinding(ctx.db, repo, n)!.scan_id;
      ctx.usageRun(usageRunId(scan));
      const { leaseItem } = await import("./leases.ts");
      const release = leaseItem(ctx.db, `finding:${repo}#${n}`, ctx.log);
      if (!release) return `${repo}#${n}: another job is working this finding`;
      try {
        return await runFix(ctx.db, repo, n, defaultFixDeps(ctx.db, scan, { cancelled: ctx.cancelled, log: ctx.log }));
      } finally { release(); }
    },
  },
  {
    name: "security-land",
    priority: 2,
    title: "Land a security fix",
    description: "Opens the finding's fix as a plain pull request from the pipeline's fork, with a neutral branch, title and description. The normal Verify and merge path takes it from there. Started only by an operator.",
    stage: 9,
    requires: "operator",
    exclusive: "security-write",
    params: SECURITY_FINDING_PARAMS,
    check: (db, p) => securityFindingCheck(db, p, ["landing"]),
    run: async (ctx) => {
      const { runLand } = await import("../security/land.ts");
      return runLand(ctx.db, String(ctx.params.repo), Number(ctx.params.number), byOfJob(ctx.job.requestedBy), await securityLandDeps(ctx));
    },
  },
  {
    name: "security-advisory",
    priority: 2,
    title: "Security advisory route",
    description: "For an urgent finding: creates the draft advisory and its private fork, pushes the fix there with the box account's token and opens the pull request inside the fork. A repository admin merges it on the advisory page. Started only by an operator.",
    stage: 9,
    requires: "operator",
    exclusive: "security-write",
    params: SECURITY_FINDING_PARAMS,
    check: (db, p) => securityFindingCheck(db, p, ["landing"]),
    run: async (ctx) => {
      const { runAdvisory } = await import("../security/land.ts");
      return runAdvisory(ctx.db, String(ctx.params.repo), Number(ctx.params.number), byOfJob(ctx.job.requestedBy), await securityLandDeps(ctx));
    },
  },
  {
    name: "security-publish",
    priority: 2,
    title: "Publish a security advisory",
    description: "Publishes the finding's advisory after a release, and requests a CVE when asked (public repositories only). Started only by an operator.",
    stage: 9,
    requires: "operator",
    exclusive: "security-write",
    params: [...SECURITY_FINDING_PARAMS, { name: "cve", label: "CVE", kind: "int", min: 0, max: 1, default: 0, help: "1 to request a CVE" }],
    check: (db, p) => securityFindingCheck(db, p, ["landed", "advisory"]),
    run: async (ctx) => {
      const { runPublish } = await import("../security/land.ts");
      return runPublish(ctx.db, String(ctx.params.repo), Number(ctx.params.number), byOfJob(ctx.job.requestedBy), Number(ctx.params.cve) === 1, await securityLandDeps(ctx));
    },
  },
  {
    name: "rank",
    title: "Rank open items",
    description: "Computes the work rank of every open item: priority level (raised by one for the security flag), type label, size (changed lines of a PR, the Fix triage's estimate for an issue), then reach. Review, Fix (which skips P4), Verify, Fix-up, Decide and the merge queue take their items in this order. Calls no model and writes nothing to GitHub.",
    stage: runStage("rank"),
    requires: "operator",
    exclusive: "rank",
    models: [],
    params: [],
    run: async (ctx) => {
      const { runRank } = await import("../rank/index.ts");
      const r = runRank(ctx.db);
      ctx.handled(r.changed + r.removed);
      return `${r.items} open items ranked, ${r.changed} changed, ${r.removed} removed`;
    },
  },
  {
    name: "referee",
    title: "Referee label disagreements",
    description: "Sonnet settles items where Jev and Haiku chose different type labels and at least one is not a scope label (scope disagreements go to Decide). A sure answer settles the type. When Sonnet is unsure, Opus answers; its label settles the item either way, and an unsure Opus also flags a scope decision for an operator.",
    stage: runStage("referee"),
    requires: "operator",
    models: ["sonnet", "opus"],
    params: [{ name: "limit", label: "At most", kind: "int", min: 1, max: 500, default: 100, help: "items sent to the referee models in this job" }],
    run: async (ctx) => {
      const { latestRun } = await import("../classify/settled.ts");
      const { refereeItems } = await import("../classify/referee.ts");
      const { itemOf, plannedItems } = await import("../core/select-items.ts");
      const run = latestRun(ctx.db);
      if (!run) throw new Error("There is no classification run yet; start a classification pass first.");
      const due = plannedItems(ctx.db, "referee", { run }).slice(0, Number(ctx.params.limit));
      if (!due.length) return `Nothing to referee in run ${run}.`;
      const asked = (source: string) => due.filter((p) => p.action.params?.source === source).map((p) => itemOf(ctx.db, p.facts.repo, p.facts.number));
      const sonnet = asked("sonnet"), opus = asked("opus");
      let sent = 0;
      const onSent = (n: number) => ctx.handled(sent + n);
      const gotSonnet = sonnet.length ? await refereeItems(ctx.db, run, sonnet, { pipeline: true, onSent, cancelled: ctx.cancelled }) : 0;
      sent += sonnet.length;
      const gotOpus = opus.length ? await refereeItems(ctx.db, run, opus, { pipeline: true, model: "opus", onSent, cancelled: ctx.cancelled }) : 0;
      ctx.usageRun(run);
      return `Run ${run}: Sonnet answered ${gotSonnet} of ${sonnet.length}, Opus ${gotOpus} of ${opus.length} disagreements.`;
    },
  },
  {
    name: "opus-review",
    priority: 1,
    title: "Review pull requests",
    description: "Opus reviews, one pull request per call, the pull requests we want from one repo: take, take with fixes, hold or close. After a new push it reads only the changes since the head it reviewed before. Its verdict and fix list are the ones every later stage reads.",
    stage: runStage("opus-review"),
    requires: "operator",
    models: ["opus"],
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 10, help: "pull requests to review in this job" },
    ],
    run: async (ctx) => {
      const { runOpusReview } = await import("../review/opus.ts");
      const r = await runOpusReview(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), onHandled: ctx.handled }, ctx.log);
      ctx.usageRun(r.runId);
      const v = Object.entries(r.verdicts).map(([k, n]) => `${n} ${k}`).join(", ");
      return `${r.repo}: reviewed ${r.reviewed} of ${r.candidates} candidates${v ? ` (${v})` : ""}; ${r.skipped.length} without a diff, ${r.missing.length} without an answer`;
    },
  },
  {
    name: "review-carry",
    title: "Carry reviews",
    description: "Stores the earlier take or take-fix review on the new head of a pull request whose only new commit is our own checked fix-up. Calls no model, so it runs while models are paused. The Review step leaves such heads to it.",
    stage: runStage("review-carry"),
    requires: "operator",
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }],
    run: async (ctx) => {
      const { runCarry } = await import("../review/carry-step.ts");
      const repo = String(ctx.params.repo);
      return `${repo}: carried ${runCarry(ctx.db, repo, ctx.log)} reviews`;
    },
  },
  {
    name: "review-post",
    title: "Post final reviews",
    description: "Posts the final Opus review of each pull request of one repo as one pull request review (a comment, never an approval or a change request) that says it is AI-generated and names the model. A review at a new head edits the earlier one. Skips a pull request that closed or moved on. Calls no model.",
    stage: runStage("review-post"),
    requires: "operator",
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 20, help: "reviews to post in this job" },
    ],
    check: checkCommentApproved,
    run: async (ctx) => {
      const { runReviewPost } = await import("../review/post.ts");
      const refused = await checkCommentApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const r = await runReviewPost(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), dryRun: false, onHandled: ctx.handled, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      return `${r.repo}: ${r.posted.length} posted, ${r.edited.length} edited, ${r.skipped.length} skipped, ${r.failed.length} failed`;
    },
  },
  {
    name: "premerge",
    priority: 1,
    title: "Pre-merge review",
    description: "Opus reads, one pull request head per call, the diff of each PR the merge rule would merge without a person, independently of the first review, and lists defects and minor findings. The merge queue holds those PRs until the review is stored. Reads GitHub; writes only to the local database.",
    stage: runStage("premerge"),
    requires: "operator",
    models: ["opus"],
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 10, help: "pull requests to review in this job" },
    ],
    run: async (ctx) => {
      const { runPremerge } = await import("../premerge/review.ts");
      const r = await runPremerge(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), onHandled: ctx.handled }, ctx.log);
      ctx.usageRun(r.runId);
      return `${r.repo}: reviewed ${r.reviewed} of ${r.candidates.length} candidates; ${r.findings} findings (${r.defects} defects), ${r.failed.length} without an answer, ${r.moved.length} moved`;
    },
  },
  {
    name: "postmerge",
    title: "Review merged pull requests",
    description: "Opus reads, one pull request per call, what each pipeline merge landed in one repo, with our own commits and reviews of the PR, and lists defects and minor findings. Reads GitHub; writes only to the local database.",
    stage: runStage("postmerge"),
    requires: "operator",
    models: ["opus"],
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 10, help: "merged pull requests to review in this job" },
    ],
    run: async (ctx) => {
      const { runPostmerge } = await import("../postmerge/review.ts");
      const r = await runPostmerge(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), onHandled: ctx.handled }, ctx.log);
      ctx.usageRun(r.runId);
      return `${r.repo}: reviewed ${r.reviewed} of ${r.candidates} candidates; ${r.findings} findings (${r.defects} defects), ${r.failed.length} without an answer`;
    },
  },
  {
    name: "postmerge-file",
    title: "File post-merge defects as issues",
    description: "Opens one GitHub issue for each defect of a post-merge review that no open item covers yet, in a repo approved for comments. Minor findings are never filed. Refused unless the operator approved commenting for the repo. Calls no model.",
    stage: runStage("postmerge-file"),
    requires: "operator",
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 20, help: "issues to open in this job" },
    ],
    check: checkCommentApproved,
    run: async (ctx) => {
      const { runPostmergeFile } = await import("../postmerge/file.ts");
      const refused = await checkCommentApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const r = await runPostmergeFile(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), onHandled: ctx.handled, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      ctx.acted(r.filed.length + r.failed.length + r.unknown.length);
      return `${r.repo}: ${r.filed.length} issues filed, ${r.limited} over the limit, ${r.failed.length} failed${r.unknown.length ? `, ${r.unknown.length} with an unknown outcome (check GitHub)` : ""}`;
    },
  },
  {
    name: "dupes-compare",
    title: "Compare duplicate groups",
    description: "Compares each group of duplicates in one pass: Opus, with read-only tools on the base checkout, for the pull requests of a group (diffs, titles, bodies and linked issues; CI and review state as background), Sonnet for its issues. It picks the best item to keep, lists what the others do better or add, and asks one decision per group. A closed or merged member wins without a call; a failed call falls back to the older-wins rule. A group is compared again only when a member's state, head or text changes. Writes nothing to GitHub.",
    stage: runStage("dupes-compare"),
    requires: "operator",
    exclusive: "dupes",
    models: ["opus", "sonnet"],
    params: [{ name: "limit", label: "At most", kind: "int", min: 1, max: 200, default: 20, help: "groups (per kind) to compare in this job" }],
    run: async (ctx) => {
      const { runDupeCompare } = await import("../dupes/compare.ts");
      const r = await runDupeCompare(ctx.db, { limit: Number(ctx.params.limit), onHandled: ctx.handled }, ctx.log);
      return `${r.due} due: ${r.compared} compared by a model, ${r.byRule} by rule, ${r.closedWins} won by a closed member, ${r.single} single, ${r.dropped} dropped; ${r.asked.length} decisions asked`;
    },
  },
  {
    name: "conversation",
    priority: 1,
    title: "Answer conversations",
    description: "Answers each operator message in an item's conversation with one Opus call, with read-only tools on the item's repository, the workspace and the item tools. The reply may propose action cards that an operator runs with a button; nothing runs by itself. Messages are answered even for a repo whose pipeline is off. Each answered message counts as one item.",
    stage: runStage("conversation"),
    requires: "operator",
    models: ["opus"],
    params: [{ name: "limit", label: "At most", kind: "int", min: 1, max: 200, default: 30, help: "messages to answer in this job" }],
    run: async (ctx) => {
      const { runConversations } = await import("../conversations/run.ts");
      const r = await runConversations(ctx.db, { limit: Number(ctx.params.limit), onHandled: ctx.handled, cancelled: ctx.cancelled }, ctx.log);
      ctx.usageRun(r.usageRun);
      return `${r.answered} of ${r.waiting} messages answered`;
    },
  },
  {
    name: "areas-propose",
    title: "Propose areas",
    description: "One Opus call proposes the area list of a repo (10 to 25 areas with one-line descriptions), reading the repo's default branch, its docs and a sample of its open item titles. The proposal waits on the repo's page; nothing changes until an operator accepts it.",
    stage: runStage("areas-propose"),
    requires: "operator",
    models: ["opus"],
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }],
    run: async (ctx) => {
      const { proposeAreas } = await import("../areas/propose.ts");
      const { baseCheckout } = await import("../dupes/compare.ts");
      const repo = String(ctx.params.repo), usageRun = `areas-${ctx.job.id}`;
      ctx.usageRun(usageRun);
      ctx.handled(1);
      const id = await proposeAreas(ctx.db, repo, { by: ctx.job.requestedBy, checkout: (r) => baseCheckout(ctx.db, r), usageRun, log: ctx.log });
      return id === null ? `${repo}: no usable proposal` : `${repo}: proposal ${id} is waiting for an operator`;
    },
  },
  {
    name: "areas-suggest",
    title: "Suggest areas",
    description: "Sonnet reads a sample of the repo's open items that have no area and suggests new areas for them. An operator accepts or ignores each suggestion; accepting saves a new list version and re-scans the unassigned items.",
    stage: runStage("areas-suggest"),
    requires: "operator",
    models: ["sonnet"],
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }],
    run: async (ctx) => {
      const { suggestAreas } = await import("../areas/propose.ts");
      const repo = String(ctx.params.repo), usageRun = `areas-${ctx.job.id}`;
      ctx.usageRun(usageRun);
      ctx.handled(1);
      const id = await suggestAreas(ctx.db, repo, { by: ctx.job.requestedBy, usageRun, log: ctx.log });
      return id === null ? `${repo}: no new area suggested` : `${repo}: suggestion ${id} is waiting for an operator`;
    },
  },
  {
    name: "areas-rescan",
    title: "Re-scan areas",
    description: "Asks again for the open items of a repo that have no area (never asked, none of these, or unassigned by a removed area) against the repo's current area list: Jev first, Haiku where Jev is under 90 % sure or unavailable.",
    stage: runStage("areas-rescan"),
    requires: "operator",
    exclusive: "classify",
    models: ["jev", "haiku"],
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 30000, default: 5000, help: "items in this job" },
    ],
    run: async (ctx) => {
      const { assignAreas } = await import("../areas/assign.ts");
      const usageRun = `areas-${ctx.job.id}`;
      ctx.usageRun(usageRun);
      const r = await assignAreas(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), rescan: true, usageRun, onSent: ctx.handled, cancelled: ctx.cancelled, progress: ctx.progress, log: ctx.log });
      return `${ctx.params.repo}: ${r.due} items asked; Jev settled ${r.jev}, Haiku ${r.haiku}; ${r.none} fit none of the areas, ${r.left} unanswered`;
    },
  },
  {
    name: "unassign",
    title: "Unassign",
    description: "Takes the pipeline's account off the open pull requests and issues that left the path to merge (waiting on a person, given up by a stage, out of scope), so someone else may pick them up. Only its own assignment is removed, and only while it is the sole assignee; the assignees are read from GitHub before each write. Calls no model.",
    stage: runStage("unassign"),
    requires: "operator",
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }],
    run: async (ctx) => {
      const { runUnassign } = await import("../unassign/index.ts");
      const repo = String(ctx.params.repo);
      const r = await runUnassign(ctx.db, { repo, by: byOfJob(ctx.job.requestedBy), runId: `unassign-${ctx.job.id}`, log: ctx.log });
      ctx.acted(r.unassigned.length);
      if (r.due && r.failed.length === r.due) throw new Error(`${repo}: could not unassign on ${r.failed.join(", ")}`);
      return `${repo}: ${r.unassigned.length} unassigned${r.failed.length ? `, ${r.failed.length} failed` : ""}`;
    },
  },
  {
    name: "ci-approve",
    title: "Approve waiting CI runs",
    description: "Approves the Actions runs that GitHub holds for a maintainer's approval on outside contributors' pull requests, once the PR's current head has a final take or take-fix review. Skips a PR that is closed, a draft or at another head. Calls no model.",
    stage: runStage("ci-approve"),
    requires: "operator",
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 30, help: "pull requests to approve runs for in this job" },
    ],
    check: checkCiApproved,
    run: async (ctx) => {
      const { approveRuns } = await import("../merge/ci-approval.ts");
      const { ghExec } = await import("../merge/safe-merge.ts");
      const { exec } = await import("../fixup/git.ts");
      const refused = await checkCiApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const repo = String(ctx.params.repo);
      const r = await approveRuns(ctx.db, repo, { gh: ghExec, exec, limit: Number(ctx.params.limit), log: ctx.log, by: byOfJob(ctx.job.requestedBy) });
      ctx.handled(r.approved.length + r.failed.length);
      if (r.failed.length) throw new Error(`${repo}: runs not approved on ${r.failed.join(", ")}`);
      return `${repo}: runs approved on ${r.approved.length} PRs, ${r.skipped.length} skipped`;
    },
  },
  {
    name: "cifix",
    priority: 1,
    title: "Fix failing CI on wanted pull requests",
    description: "For a take or take-fix pull request whose gate check fails at its reviewed head, reads the failed jobs' logs and sorts the failure. A formatter-only failure is fixed by running the formatter in a build environment. A code failure gets a Sonnet patch, checked by Opus, pushed to the contributor's branch or posted as a comment where the branch is closed to us. An infrastructure failure is left to the cifix-rerun step. At most two tries per head.",
    stage: runStage("cifix"),
    requires: "operator",
    models: ["sonnet", "opus"],
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 5, help: "pull requests to work on in this job" },
    ],
    check: checkPushApproved,
    run: async (ctx) => {
      const { runCifix } = await import("../cifix/index.ts");
      const refused = await checkPushApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const r = await runCifix(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), dryRun: false, onHandled: ctx.handled, stopping: ctx.stopping, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      ctx.acted(r.pushed.length + r.asked.length + r.queued.length + r.failed.length + r.held.length + r.infra.length);
      return `${r.repo}: pushed ${r.pushed.length}, ${r.asked.length} commented, ${r.queued.length} formatter runs queued, ${r.infra.length} infrastructure failures, ${r.failed.length} failed or refused, ${r.held.length} held`;
    },
  },
  {
    name: "cifix-rerun",
    title: "Rerun CI jobs that failed on infrastructure",
    description: "Reruns the failed jobs of a wanted pull request whose failure the cifix step read as a network or runner error, once per head. Calls no model.",
    stage: runStage("cifix-rerun"),
    requires: "operator",
    params: [
      { name: "repo", label: "Repo", kind: "repo", required: true },
      { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 30, help: "pull requests to rerun in this job" },
    ],
    check: checkCiApproved,
    run: async (ctx) => {
      const { runRerun } = await import("../cifix/index.ts");
      const refused = await checkCiApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const r = await runRerun(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), dryRun: false, onHandled: ctx.handled, stopping: ctx.stopping, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      return `${r.repo}: reran ${r.reran.length} PRs, ${r.skipped.length} skipped`;
    },
  },
  {
    name: "main-fix",
    priority: 1,
    title: "Handle a red default branch",
    description: "For a repo approved for it whose default branch is red, reads the failed gate checks' logs and has Haiku sort each: a flaky failure gets its failed jobs rerun once, an infrastructure failure becomes an operator decision about opening an upstream issue, and a code failure is recorded as needing a fix and gets a fix PR (the CI fix patch path against the default branch head: Sonnet patch, Opus check, pushed to the pipeline account's fork) unless main is green again or an open PR already covers it. Opens the issue only on an operator's answer.",
    stage: runStage("main-fix"),
    requires: "operator",
    models: ["haiku", "sonnet", "opus"],
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }],
    check: checkMainFixApproved,
    run: async (ctx) => {
      const { runMainFix } = await import("../mainfix/index.ts");
      const refused = await checkMainFixApproved(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const r = await runMainFix(ctx.db, { repo: String(ctx.params.repo), onHandled: ctx.handled, stopping: ctx.stopping, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      ctx.acted(r.reran + r.asked + r.needsFix + r.issues + r.prs);
      return `${r.repo}: classified ${r.classified} heads, reran ${r.reran}, asked ${r.asked}, ${r.needsFix} need a fix, ${r.issues} issues opened, ${r.prs} fix PRs opened`;
    },
  },
  {
    name: "nightly",
    title: "Nightly checks",
    description: "For a repo with the Nightly checks build feature on, queues its selected checks (dependency audit, cross builds, Miri, benchmarks) once a day as low-priority sandbox tasks at the default branch head, and collects the results of finished ones. A check that fails two nights in a row becomes an operator decision about opening an issue. Calls no model.",
    stage: runStage("nightly"),
    requires: "operator",
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }],
    check: (db, p) => checkNightlyOn(db, p),
    run: async (ctx) => {
      const { runNightly } = await import("../nightly/index.ts");
      const refused = checkNightlyOn(ctx.db, ctx.params);
      if (refused) throw new Error(refused);
      const r = await runNightly(ctx.db, { repo: String(ctx.params.repo), onHandled: ctx.handled, by: byOfJob(ctx.job.requestedBy) }, ctx.log);
      ctx.acted(r.queued + r.issues);
      return `${r.repo}: queued ${r.queued}, skipped ${r.skipped}, collected ${r.collected}, asked ${r.asked}, ${r.issues} issues opened`;
    },
  },
];

let loaded: Promise<Map<string, StepDef>> | null = null;
let loadedMap: Map<string, StepDef> | null = null;

/** A step by name without waiting: the loaded list once `loadSteps` has finished, else the built-in steps. */
export const knownStep = (name: string): StepDef | undefined => loadedMap?.get(name) ?? STEPS.find((s) => s.name === name);

/**
 * Every step by name. AUTOCRAFT_EXTRA_STEPS names a module exporting `steps:
 * StepDef[]` that is added too; tests and development smoke runs use it for
 * fake steps. The dashboard, the runner and each job's child read the same
 * variable, so they see the same list.
 */
export function loadSteps(): Promise<Map<string, StepDef>> {
  loaded ??= (async () => {
    const map = new Map(STEPS.map((s) => [s.name, s]));
    const extra = envVar("EXTRA_STEPS");
    if (extra) for (const s of ((await import(pathToFileURL(resolve(extra)).href)) as { steps: StepDef[] }).steps) map.set(s.name, s);
    loadedMap = map;
    return map;
  })();
  return loaded;
}

export class ParamError extends Error {}

/** The request's params checked against the step's schema, with defaults filled in. Unknown keys are refused. */
export function validateParams(step: StepDef, raw: unknown, trackedRepos: string[]): Params {
  if (raw === undefined || raw === null) raw = {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new ParamError("params must be an object");
  const given = raw as Record<string, unknown>;
  const known = new Set(step.params.map((p) => p.name));
  for (const k of Object.keys(given)) if (!known.has(k)) throw new ParamError(`${step.name} has no parameter ${k}`);
  const out: Params = {};
  for (const p of step.params) {
    const v = given[p.name];
    if (v === undefined || v === null || v === "") {
      const d = "default" in p ? p.default : undefined;
      if (d !== undefined) out[p.name] = d;
      else if (p.required) throw new ParamError(`${p.label} is required`);
      continue;
    }
    switch (p.kind) {
      case "enum":
        if (typeof v !== "string" || !p.options.includes(v)) throw new ParamError(`${p.label} must be one of ${p.options.join(", ")}`);
        out[p.name] = v;
        break;
      case "repo":
        if (typeof v !== "string" || !trackedRepos.includes(v)) throw new ParamError(`${p.label} must be a tracked repo`);
        out[p.name] = v;
        break;
      case "int":
        if (typeof v !== "number" || !Number.isInteger(v) || v < p.min || v > p.max) throw new ParamError(`${p.label} must be a whole number from ${p.min} to ${p.max}`);
        out[p.name] = v;
        break;
      case "run-id":
        if (typeof v !== "string" || !RUN_ID.test(v)) throw new ParamError(`${p.label} must be lowercase letters, digits and dashes (at most 48)`);
        out[p.name] = v;
        break;
    }
  }
  return out;
}
