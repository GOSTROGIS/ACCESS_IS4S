// Pre-merge review: Opus reads, independently of the first review, the head commit of each PR the merge rule would merge
// without a person, and lists defects and minor findings. One call per PR head. Reads GitHub (the diff); writes only to
// the local database. What the findings do to the PR is the merge queue (src/merge/queue.ts) and the fix-up route.
import type { DatabaseSync } from "node:sqlite";
import { queueRoom } from "../agents/call.ts";
import { pool } from "../classify/run.ts";
import { runModelStep } from "../agents/step.ts";
import { PREMERGE_OPUS } from "../agents/steps.ts";
import { buildQueue } from "../merge/queue.ts";
import { planned } from "../core/select.ts";
import type { PlanSet } from "../core/plan-set.ts";
import type { PrFacts } from "../core/plan.ts";
import { PREMERGE_MAX_TRIES, RETRY_AFTER_MS } from "../core/rules.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { referenceDir } from "../reference.ts";
import { defaultSemanticDeps, type SemanticDeps } from "../reference-lint.ts";
import { defaultOpusDeps, prepareOpusInput, type OpusDeps } from "../review/opus.ts";
import { REREADS_PER_HOUR, coreRate, pauseRereads, rereadDiff, takeRereadSlot } from "../review/diff.ts";
import { SYNC_RESERVE } from "../mirror.ts";
import { ownerOf } from "../owners.ts";
import { recordLiveBase } from "../merge/base.ts";
import { opusCandidateOf, type OpusCandidate } from "../review/opus-candidates.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { checkoutForPr } from "../sandbox/index.ts";
import { type PremergeReview } from "./parse.ts";
import { savePremerge } from "./store.ts";
import { jobItem } from "../runner/job-items.ts";

const PROMPT = CLAUDE_PROMPTS["premerge.opus"];
const now = () => new Date().toISOString();
const refOf = (c: { repo: string; number: number }) => `${c.repo}#${c.number}`;

export type PremergeParams = {
  repo: string; limit?: number;
  /** Only this PR (the `--number` option). */
  number?: number;
  dryRun?: boolean;
  onHandled?: (n: number) => void;
};
export type PremergeDeps = Pick<OpusDeps, "fetchDiff" | "model" | "maxChars" | "checkout" | "semantic"> & { now?: () => number };
export type PremergeSummary = { runId: string; repo: string; candidates: string[]; reviewed: number; findings: number; defects: number; failed: string[]; moved: string[] };

export function defaultPremergeDeps(): PremergeDeps {
  const d = defaultOpusDeps();
  return { fetchDiff: d.fetchDiff, model: PROMPT.models[0]!, maxChars: d.maxChars, checkout: (r, n, h) => checkoutForPr(r, n, h, console.log) };
}

/** A PR due its pre-merge review: the head to review and the facts it was planned from. */
export type PremergeItem = { repo: string; number: number; head: string; facts: PrFacts };

/**
 * The PRs whose Plan holds a `premerge` action (the queue holds them in waiting-premerge and the head is due a try), in selection order.
 * `wake` collects when the failed tries are due again (ms): nothing in the data changes then, so the planner must be told.
 */
export function premergeCandidates(db: DatabaseSync, opts: { repo?: string; at?: number; wake?: number[]; run?: string | null; plans?: PlanSet } = {}): PremergeItem[] {
  const { wake, at, ...rest } = opts;
  return planned(db, "premerge", {
    ...rest, ...(at !== undefined ? { now: at } : {}),
    onPlan: wake ? (f, plan) => {
      const pm = f.premerge;
      if ((plan.state === "waiting-premerge" || f.operator?.premerge) && f.repoFacts.mergeApproved && pm && !pm.hasFindings && pm.tries < PREMERGE_MAX_TRIES) wake.push(Date.parse(pm.at) + RETRY_AFTER_MS);
      if (f.diffPending) {
        const t = Math.max(f.diffPending.lastRead != null ? f.diffPending.lastRead + RETRY_AFTER_MS : 0, f.diffPending.paceAt ?? 0);
        if (t > f.now) wake.push(t);
      }
    } : undefined,
  }).map((p) => ({ repo: p.facts.repo, number: p.facts.number, head: p.action.head!, facts: p.facts }));
}

/** The Opus candidate of a due PR: its title, body, size and author association. */
export const candidateOf = (db: DatabaseSync, e: PremergeItem): OpusCandidate => opusCandidateOf(db, e.facts, e.head);

/** True while the queue still lists the PR at this head, open and not yet reviewed. */
const stillHead = (db: DatabaseSync, repo: string, number: number, head: string): boolean =>
  buildQueue(db, { repo, refs: [`${repo}#${number}`], merged: "exclude" }).some((e) => e.head === head);

export async function runPremerge(db: DatabaseSync, params: PremergeParams, log: (line: string) => void = console.log, deps: PremergeDeps = defaultPremergeDeps()): Promise<PremergeSummary> {
  const { repo } = params;
  const runId = `premerge-${repo}-${now().replace(/[-:]/g, "").slice(0, 15)}`;
  let cands = premergeCandidates(db, { repo, at: deps.now?.() ?? Date.now() });
  if (params.number !== undefined) cands = cands.filter((e) => e.number === params.number);
  const s: PremergeSummary = { runId, repo, candidates: cands.map(refOf), reviewed: 0, findings: 0, defects: 0, failed: [], moved: [] };
  if (params.limit !== undefined) cands = cands.slice(0, params.limit);
  if (params.dryRun || !cands.length) {
    log(`premerge ${repo}: ${s.candidates.length} candidates${params.dryRun ? "; dry run, nothing fetched or asked" : ""}`);
    return s;
  }
  const opusDeps: OpusDeps = { ...deps, fetchDelta: async () => ({ ok: false, tooLarge: false, error: "not used" }) };
  let handled = 0;
  // Read once per pass, before the first re-read.
  let rateLowP: Promise<boolean> | undefined;
  await pool(cands.map((e) => async () => {
    const start = now(), ref = refOf(e), head = e.head;
    const fail = (error: string, final = false) => {
      jobItem(db, repo, e.number, error, log);
      savePremerge(db, { repo, number: e.number, head, at: now(), runId, model: deps.model, error, final });
      s.failed.push(ref);
    };
    // A diff that waits for what the merge rule reads beside it is read again, with no model call, within the hour's re-reads
    // and only while the token keeps the sync's reserve of its core rate.
    if (e.facts.diffPending) {
      rateLowP ??= coreRate(ownerOf(repo)).then((rate) => {
        const low = !!rate && rate.remaining < SYNC_RESERVE;
        if (rate && low) pauseRereads(rate.resetAt);
        return low;
      });
      const rateLow = await rateLowP;
      if (rateLow || !takeRereadSlot(deps.now?.() ?? Date.now())) {
        jobItem(db, repo, e.number, rateLow ? "diff re-read waits for GitHub's rate limit reset" : `diff re-read waits: ${REREADS_PER_HOUR} re-reads this hour`, log);
        params.onHandled?.(++handled);
        return;
      }
      const liveBase = (db.prepare("SELECT base_ref FROM items WHERE repo = ? AND number = ?").get(repo, e.number) as { base_ref: string | null } | undefined)?.base_ref;
      const d = await rereadDiff(repo, e.number, head, deps.fetchDiff, liveBase, deps.now?.() ?? Date.now());
      if (d.ok && d.base && liveBase !== undefined && d.base !== liveBase) recordLiveBase(db, repo, e.number, head, d.base, { by: "premerge", keepDiff: true });
      jobItem(db, repo, e.number, d.ok ? "diff read again for the merge rule" : `diff not read again: ${d.error}`, log);
      params.onHandled?.(++handled);
      return;
    }
    const p = await prepareOpusInput(db, repo, candidateOf(db, e), opusDeps, log, { independent: true });
    if (p.kind === "no-diff") fail(`retry: no diff: ${p.error}`);
    else if (p.kind === "large") fail("too large to review automatically", true);
    else if (p.kind === "no-threads") fail(`retry: ${p.error}`);
    else {
      const { input } = p;
      const checkout = (await deps.checkout?.(repo, e.number, head)) ?? undefined;
      if (checkout) input.repo_dir = REPO_PATH;
      const dir = referenceDir(repo);
      const semantic: SemanticDeps | undefined = dir ? deps.semantic ?? defaultSemanticDeps(db, ref) : undefined;
      const r = await runModelStep(db, PREMERGE_OPUS, input, {
        model: deps.model, checkout, reference: checkout ? dir : undefined, ctx: { dir, semantic },
        usage: { run: runId, agent: `premerge-${ref.replace("#", "-")}`, stage: "premerge", items: (ok) => (ok ? 1 : 0) },
        onReply: (reply) => { if (reply.fixTurn) log(`  ${ref}: reply lint: ${reply.problems?.length ? `${reply.problems.length} problems left after the fix turn` : "fixed by one fix turn"}`); },
      });
      const got: PremergeReview | null = r.ok ? r.value : null;
      // The call takes minutes: a push or a merge meanwhile makes the review one of a head nobody will merge.
      if (!stillHead(db, repo, e.number, head)) {
        jobItem(db, repo, e.number, "the head moved during the review; not stored", log);
        s.moved.push(ref);
      } else if (got) {
        savePremerge(db, { repo, number: e.number, head, at: now(), runId, model: deps.model, findings: got.findings, searched: got.searched, conflicts: got.conflicts, unsure: got.unsure, claims: got.claims, baseRef: p.baseRef });
        jobItem(db, repo, e.number, `pre-merge review: ${got.findings.length} findings`, log);
        s.reviewed++; s.findings += got.findings.length; s.defects += got.findings.filter((f) => f.severity === "defect").length;
      } else fail("retry: no valid reply from the model");
    }
    params.onHandled?.(++handled);
  }), () => queueRoom(db));
  log(`premerge ${repo}: ${s.reviewed} reviewed, ${s.findings} findings (${s.defects} defects), ${s.failed.length} without an answer, ${s.moved.length} moved`);
  return s;
}
