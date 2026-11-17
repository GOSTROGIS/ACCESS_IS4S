// Stage 6, Verify: a PR in a repo with upstream CI is verified by that CI (the merge queue waits for it to be
// green), so it is recorded `ci-enough` without a model call; only a bugfix whose diff touches a test file
// gets a Sonnet plan (no tools), limited to a regression test. A repo without CI keeps the full planner, and
// our code turns a valid choice into build tasks. Pass or fail comes from the
// tasks' exit codes, never from a model. Reads GitHub; never writes to it.
//
//   autocraft verify --repo R [--limit N] [--dry-run]
//
// Part 2 (results) belongs in ./results.ts: it reads the finished tasks of each `planned` or `running`
// verification, sets the state, summary and finished_at, writes the failure summary and cancels the
// queued tasks of a verification whose PR head moved on (state `stale`).
import { leaseItem } from "../runner/leases.ts";
import { queueRoom } from "../agents/call.ts";
import { POOL_MAX, pool } from "../classify/run.ts";
import type { DatabaseSync } from "node:sqlite";
import { BuildError } from "../build/envs.ts";
import { connect } from "../db.ts";
import { runModelStep } from "../agents/step.ts";
import { VERIFY_PLAN } from "../agents/steps.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { checkoutForPr } from "../sandbox/index.ts";
import { cachedDiff, codeDiff, ghDiff, type DiffFetcher } from "../review/diff.ts";
import { cachedCrates, ghApi, ghCrates, type CratesFetcher } from "./crates.ts";
import { NOT_RUST_REASON, type VerifyCandidate } from "./candidates.ts";
import { selectCandidates, unavailableCandidates } from "./select.ts";
import { type VerifyPlan } from "./plan.ts";
import { repoChecksKnown, repoHasNoCi } from "../merge/no-ci.ts";
import { queueTasks, queueWarmBuild } from "./tasks.ts";
import { maybeScreenshot, type ScreenshotDeps } from "./screenshots.ts";
import { regressionName, type Crate, type VerifyPlanInput } from "./types.ts";
import { jobItem } from "../runner/job-items.ts";
import { slugOf } from "../owners.ts";

export { collectDue, listVerifications, runCollect, verificationOf, type VerificationView } from "./results.ts";

const PROMPT = CLAUDE_PROMPTS["verify.plan"];
/** Characters of code diff the planner is shown; a larger change is not planned automatically. */
export const MAX_DIFF_CHARS = 80_000;
const SHA = /^[0-9a-f]{40}$/;
const CI_REASON = "Upstream CI runs the full gate; the merge waits for it to be green.";

export type VerifyDeps = {
  fetchDiff: DiffFetcher;
  fetchCrates: CratesFetcher;
  /** The PR's base commit, or null when GitHub did not answer. */
  baseOf: (repo: string, number: number) => Promise<string | null>;
  /** The head commit of the repo's default branch, or null. */
  mainHead: (repo: string, branch: string) => Promise<string | null>;
  model: string;
  /** Host directory with a read-only checkout of the PR head for the sandboxed planner call, or null to ask without tools. Absent: no tools. */
  checkout?: (repo: string, number: number, head: string) => Promise<string | null>;
  /** Replaces the screenshot planner's model call (tests). */
  screenshots?: ScreenshotDeps;
};

async function sha(path: string, jq: string): Promise<string | null> {
  try {
    const s = (await ghApi(path, jq)).trim();
    return SHA.test(s) ? s : null;
  } catch { return null; }
}

export function defaultDeps(): VerifyDeps {
  return {
    fetchDiff: ghDiff, fetchCrates: ghCrates, model: PROMPT.models[0]!, checkout: (r, n, h) => checkoutForPr(r, n, h, console.log),
    baseOf: (repo, n) => sha(`repos/${slugOf(repo)}/pulls/${n}`, ".base.sha"),
    mainHead: (repo, branch) => sha(`repos/${slugOf(repo)}/commits/${encodeURIComponent(branch)}`, ".sha"),
  };
}

export type VerifyParams = { repo: string; limit?: number; dryRun?: boolean; onHandled?: (n: number) => void; /** True when no new item should start (cancel, deadline, pipeline off). */ stopping?: () => boolean };
export type VerifySummary = {
  runId: string; repo: string; candidates: number; handled: number;
  kinds: Record<string, number>; errors: number; tasks: number[]; warm: number | null; skipped: string[];
};

const now = () => new Date().toISOString();
const refOf = (c: { repo: string; number: number }) => `${c.repo}#${c.number}`;

type Saved = { kind: string; reason: string; plan: unknown; model: string | null; headTask: number | null; baseTask: number | null; baseSha: string | null; state: string; summary: string | null };

/** Stores the verification of a PR head and its stages row. */
export function saveVerification(db: DatabaseSync, c: { repo: string; number: number; head_oid: string }, v: Saved): void {
  const at = now();
  db.prepare(`INSERT OR REPLACE INTO verifications (repo, number, head_sha, base_sha, kind, reason, plan, model, head_task_id, base_task_id, state, summary, created_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(c.repo, c.number, c.head_oid, v.baseSha, v.kind, v.reason, v.plan === null ? null : JSON.stringify(v.plan), v.model, v.headTask, v.baseTask, v.state, v.summary, at,
      v.state === "ci-enough" || v.state === "error" || v.state === "unavailable" ? at : null);
  const stage = v.state === "planned" ? "verify-planned" : v.state === "ci-enough" ? "verify-ci-enough" : v.state === "unavailable" ? "verify-unavailable" : "verify-error";
  db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, ?, ?, ?, ?)")
    .run(c.repo, c.number, stage, at, "verify", `${v.kind} at ${c.head_oid.slice(0, 7)}: ${v.summary ?? v.reason}`.slice(0, 300));
  jobItem(db, c.repo, c.number, `${stage}: ${v.kind} at ${c.head_oid.slice(0, 7)}`, () => {});   // the caller logs the outcome itself
}

/** The plan as stored: the patch is in the task row, so the plan column keeps its size. */
const storedPlan = (p: VerifyPlan): unknown => (p.kind === "regression" ? { kind: p.kind, crate: p.crate, dir: p.dir, test_lines: p.patch.split("\n").length - 6 } : p);

/** Verify cannot build this PR's repo: the Merge? decision says "not verified" and an operator decides. */
const unavailableRow = (reason: string): Saved => ({ kind: "unavailable", reason, plan: null, model: null, headTask: null, baseTask: null, baseSha: null, state: "unavailable", summary: reason });

const errorRow = (reason: string): Saved => ({ kind: "error", reason, plan: null, model: null, headTask: null, baseTask: null, baseSha: null, state: "error", summary: reason });

export async function runVerify(db: DatabaseSync, params: VerifyParams, log: (line: string) => void = console.log, deps: VerifyDeps = defaultDeps()): Promise<VerifySummary> {
  const { repo } = params;
  const runId = `verify-${repo}-${now().replace(/[-:]/g, "").slice(0, 15)}`;
  let cands = selectCandidates(db, repo);
  const summary: VerifySummary = { runId, repo, candidates: cands.length, handled: 0, kinds: {}, errors: 0, tasks: [], warm: null, skipped: [] };
  if (params.dryRun) {
    log(`verify ${repo}: ${cands.length} candidates; dry run, nothing fetched or asked`);
    return summary;
  }
  // Whether the repo has CI is unknown until its checks were read: nothing is recorded before.
  if (!repoChecksKnown(db, repo)) {
    log(`verify ${repo}: no checks read yet; nothing recorded`);
    return summary;
  }
  if (params.limit !== undefined) cands = cands.slice(0, params.limit);
  // Nothing to build for these: recorded at once so the PR goes on to the Merge? decision.
  for (const u of unavailableCandidates(db, repo)) {
    saveVerification(db, u.c, unavailableRow(u.reason));
    log(`  ${refOf(u.c)}: verification unavailable: ${u.reason}`);
    summary.handled++;
    params.onHandled?.(summary.handled);
  }
  const branch = (db.prepare("SELECT default_branch FROM repos WHERE name = ?").get(repo) as { default_branch: string | null } | undefined)?.default_branch ?? "main";
  let queued = false;
  const ci = !repoHasNoCi(db, repo);

  let stoppedLogged = false;
  await pool(cands.map((c) => async (): Promise<void> => {
    if (params.stopping?.()) {
      if (!stoppedLogged) log(`verify ${repo}: stopping, no new PRs started`);
      stoppedLogged = true;
      return;
    }
    const release = leaseItem(db, `pr:${repo}#${c.number}`, log);
    if (!release) return;
    try {
      const ref = refOf(c);
      const handle = (): void => { summary.handled++; params.onHandled?.(summary.handled); };
      const byCi = (): void => {
        saveVerification(db, c, { kind: "ci-enough", reason: CI_REASON, plan: null, model: null, headTask: null, baseTask: null, baseSha: null, state: "ci-enough", summary: CI_REASON });
        summary.kinds["ci-enough"] = (summary.kinds["ci-enough"] ?? 0) + 1;
        handle();
      };
      // Screenshots of a UI change: its own table and tasks; the verification rows below are saved exactly as without it.
      await maybeScreenshot(db, c, deps, log, runId).catch((e: unknown) => log(`  ${refOf(c)}: screenshots: ${(e as Error).message}`));
      if (ci) {
        // Only a bugfix that adds or changes a test file may get a regression test; everything else is covered by CI.
        if (c.label !== "bugfix") { byCi(); return; }
        const pre = await cachedDiff(repo, c.number, c.head_oid, deps.fetchDiff);
        // Without a readable diff there is no test file to find, so CI is the verification.
        if (!pre.ok || !codeDiff(pre.text).testsOmitted.length) { byCi(); return; }
      }
      const cr = await cachedCrates(repo, c.head_oid, deps.fetchCrates);
      if (!cr.ok) { log(`  ${ref}: no crate list: ${cr.error}`); summary.skipped.push(ref); return; }
      if (!cr.rust) {
        saveVerification(db, c, unavailableRow(NOT_RUST_REASON));
        log(`  ${ref}: verification unavailable: ${NOT_RUST_REASON}`);
        handle();
        return;
      }
      const d = await cachedDiff(repo, c.number, c.head_oid, deps.fetchDiff);
      if (!d.ok) {
        if (d.tooLarge) { saveVerification(db, c, errorRow("GitHub refuses the diff: too large to plan")); summary.errors++; handle(); }
        else { log(`  ${ref}: no diff: ${d.error}`); summary.skipped.push(ref); }
        return;
      }
      let cd = codeDiff(d.text);
      if (!cd.files.length && cd.testsOmitted.length) cd = codeDiff(d.text, true);
      if (cd.text.length > MAX_DIFF_CHARS) { saveVerification(db, c, errorRow(`code diff of ${cd.text.length} characters is too large to plan`)); summary.errors++; handle(); return; }
      const base = await deps.baseOf(repo, c.number);
      if (!base) { log(`  ${ref}: no base commit`); summary.skipped.push(ref); return; }

      const input = planInput(c, cr.crates, cd, ci);
      const checkout = (await deps.checkout?.(repo, c.number, c.head_oid)) ?? undefined;
      if (checkout) input.repo_dir = REPO_PATH;
      const start = now();
      const planned = await runModelStep(db, VERIFY_PLAN, input, {
        model: deps.model, checkout, ctx: { ref, crates: cr.crates, label: c.label, ci },
        usage: { run: runId, agent: `verify-${c.number}`, stage: "verify", items: (ok) => (ok ? 1 : 0) },
      });
      const result = planned.ok ? planned.value : null;
      if (!result) { log(`  ${ref}: no answer from the planner`); summary.skipped.push(ref); handle(); return; }
      handle();
      if (!result.ok) {
        log(`  ${ref}: invalid plan: ${result.error}`);
        saveVerification(db, c, { ...errorRow(result.error), model: deps.model });
        summary.errors++;
        return;
      }
      const plan = result.plan;
      summary.kinds[plan.kind] = (summary.kinds[plan.kind] ?? 0) + 1;
      if (plan.kind === "ci-enough") {
        saveVerification(db, c, { kind: plan.kind, reason: plan.reason, plan: null, model: deps.model, headTask: null, baseTask: null, baseSha: base, state: "ci-enough", summary: plan.reason });
        return;
      }
      try {
        const ids = queueTasks(db, plan, { repo, number: c.number, head: c.head_oid, base });
        summary.tasks.push(...ids);
        queued = true;
        saveVerification(db, c, { kind: plan.kind, reason: plan.reason, plan: storedPlan(plan), model: deps.model, headTask: ids[0] ?? null, baseTask: ids[1] ?? null, baseSha: base, state: "planned", summary: plan.reason });
      } catch (e) {
        if (!(e instanceof BuildError)) throw e;
        log(`  ${ref}: tasks not queued: ${e.message}`);
        saveVerification(db, c, { ...errorRow(`tasks not queued: ${e.message}`), model: deps.model });
        summary.errors++;
      }
    } finally { release(); }
  }), () => queueRoom(db), { max: POOL_MAX.verify });

  if (queued) {
    const main = await deps.mainHead(repo, branch);
    if (main) summary.warm = queueWarmBuild(db, repo, main);
    else log(`verify ${repo}: no head for ${branch}; no warm build queued`);
  }
  log(`verify ${repo}: ${summary.handled} planned (${Object.entries(summary.kinds).map(([k, n]) => `${n} ${k}`).join(", ") || "none"}); ${summary.errors} errors, ${summary.skipped.length} skipped; ${summary.tasks.length} tasks${summary.warm ? ", 1 warm build" : ""}`);
  return summary;
}

function planInput(c: VerifyCandidate, crates: Crate[], cd: ReturnType<typeof codeDiff>, ci: boolean): VerifyPlanInput {
  return {
    ref: refOf(c), title: c.title, body: c.body, test_file_name: `${regressionName(c.number)}.rs`, label: c.label, ci, review: c.review, crates,
    files: cd.files, tests_omitted: cd.testsOmitted, diff: cd.text,
  };
}

function parseArgs(args: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const n = args[i]!.replace(/^--/, "");
    if (!["repo", "limit", "dry-run"].includes(n)) throw new Error(`unknown option ${args[i]}; options: --repo --limit --dry-run`);
    if (n === "dry-run") out[n] = true;
    else {
      const v = args[++i];
      if (v === undefined) throw new Error(`--${n} needs a value`);
      out[n] = v;
    }
  }
  return out;
}

export const commands = {
  "verify-collect": {
    summary: "verify-collect [--dry-run]: set passed, failed or error on pending verifications from their finished tasks",
    async run(args: string[]): Promise<void> {
      if (args.some((a) => a !== "--dry-run")) throw new Error("options: --dry-run");
      const { runCollect } = await import("./results.ts");
      await runCollect(connect(), { dryRun: args.length > 0 });
    },
  },
  verify: {
    summary: "verify --repo R [--limit N] [--dry-run]: plan the verification of taken PRs and queue build tasks",
    async run(args: string[]): Promise<void> {
      const f = parseArgs(args);
      if (typeof f.repo !== "string") throw new Error("missing --repo");
      const limit = typeof f.limit === "string" ? Number(f.limit) : undefined;
      if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) throw new Error("--limit is a positive whole number");
      await runVerify(connect(), { repo: f.repo, limit, dryRun: f["dry-run"] === true });
    },
  },
};
