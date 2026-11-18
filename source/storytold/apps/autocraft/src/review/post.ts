// Stage 5, Review, last part: posts the final Opus review of a PR as one pull request
// review (event COMMENT: never an approval or a change request) in repos approved for
// comments. One review per PR: a later Opus review at a new head edits it.
//
//   autocraft review-post --repo R [--limit N] [--apply]
//
// Without --apply it is a dry run: it reads the local tables only and lists what would be posted.
import type { DatabaseSync } from "node:sqlite";
import { commentApprovalOf } from "../act/approval.ts";
import { type Note, editReview, postReview, type Writer } from "../github/write.ts";
import { guard } from "../core/guard.ts";
import { auditIdentity, githubIdentity } from "../github/identity.ts";
import { ownerOf } from "../owners.ts";
import { planned } from "../core/select.ts";
import { isQueueState } from "../core/plan.ts";
import { CLI_BY, type By } from "../core/gates.ts";
import { Client, GithubError, type Querier } from "../mirror.ts";
import { prInfo } from "../merge/index.ts";
import { postSource } from "./post-source.ts";
import { reviewBody, recommendation } from "./post-template.ts";
import { jobItem } from "../runner/job-items.ts";
import { storedNote } from "../github/note.ts";

const ACTOR = "review-post";
const REVIEW_NOTE = (c: { model: string | null; serving_metadata?: string }): Note => storedNote({ by: "model", kind: "review", model: c.model }, c.serving_metadata);

export type PostCandidate = {
  repo: string; number: number; head_oid: string; body: string;
  /** The model of the Opus review the body describes (named in the note line). */
  model: string | null;
  serving_metadata?: string;
  /** The id of our earlier review of this PR (at another head), to edit; null for a first post. */
  editId: string | null;
  /** The `at` of the Opus review the body describes. */
  opusAt: string;
};
export type PostSummary = { repo: string; dryRun: boolean; candidates: number; posted: string[]; edited: string[]; skipped: { ref: string; reason: string }[]; failed: { ref: string; reason: string }[]; note: string | null };
export type PostParams = { repo: string; limit?: number; dryRun?: boolean; onHandled?: (n: number) => void; by?: By };
export type PostDeps = { querier: Querier; now: () => Date };

export const defaultPostDeps = (): PostDeps => ({ querier: new Client(1000), now: () => new Date() });

/**
 * Open PRs of `repo` whose Plan holds a `post-review` action: an Opus review (with public text unless it edits an earlier post) at
 * their current head that no review of ours describes yet. The Plan leaves out PRs by the pipeline's own account, batch PRs,
 * held duplicates and items outside the pilot.
 */
export function postCandidates(db: DatabaseSync, repo: string): PostCandidate[] {
  const posted = db.prepare("SELECT review_id, posted_as FROM review_posts WHERE repo = ? AND number = ?");
  // A review is edited only by the lane that posted it: a NULL `posted_as` is a row from before it was recorded, written by the box account.
  const lane = (as: string | null | undefined): "legacy" | "app" => (as && as !== "legacy" ? "app" : "legacy");
  const nowLane = githubIdentity(db) === "app" ? "app" : "legacy";
  const out: PostCandidate[] = [];
  for (const { facts: f, plan, action } of planned(db, "post-review", { repo })) {
    const head = action.head!;
    const o = postSource(db, repo, f.number, head);
    if (!o) continue;
    // A newer review with no public text still edits an earlier post, so the verdict line stays current.
    const pub = o.public;
    if (!pub) continue;
    const prev = posted.get(repo, f.number) as { review_id: string | null; posted_as: string | null } | undefined;
    const editId = prev && lane(prev.posted_as) === nowLane ? prev.review_id ?? null : null;
    out.push({
      repo, number: f.number, head_oid: head, editId, opusAt: o.at, model: o.model,
      ...(o.serving_metadata !== undefined && { serving_metadata: o.serving_metadata }),
      body: reviewBody({
        verdict: o.sourceVerdict, sure: o.sure, summary: pub.summary, points: pub.points, claims: o.claims, head: o.reviewedAt, owner: ownerOf(repo), fixedIn: o.fixedIn,
        recommendation: recommendation({ verdict: o.verdict, queue: o.verdict === "take" && isQueueState(plan.state) ? { path: plan.path, state: plan.state } : null, mergeApproved: f.repoFacts.mergeApproved, canPush: f.repoFacts.pushApproved && f.pushable }),
      }),
    });
  }
  return out;
}

/** Whether an edit failed because the review no longer exists or the token may not edit it. */
function reviewUneditable(e: unknown): boolean {
  if (e instanceof GithubError && (e.type === "NOT_FOUND" || e.type === "FORBIDDEN")) return true;
  return /Could not resolve to a node|NOT_FOUND|FORBIDDEN/.test(String((e as Error)?.message ?? e));
}

const refOf = (c: { repo: string; number: number }) => `${c.repo}#${c.number}`;

export async function runReviewPost(db: DatabaseSync, params: PostParams, log: (line: string) => void = console.log, deps?: PostDeps): Promise<PostSummary> {
  const { repo } = params;
  const dryRun = params.dryRun ?? true;
  if (params.limit !== undefined && !(Number.isInteger(params.limit) && params.limit >= 0)) throw new Error("limit must be a whole number ≥ 0");
  const s: PostSummary = { repo, dryRun, candidates: 0, posted: [], edited: [], skipped: [], failed: [], note: null };
  if (!commentApprovalOf(db, repo)) {
    s.note = `commenting in ${repo} is not approved`;
    log(`review-post ${repo}: ${s.note}; nothing done`);
    return s;
  }
  let todo = postCandidates(db, repo);
  s.candidates = todo.length;
  if (params.limit !== undefined) todo = todo.slice(0, params.limit);
  if (dryRun) {
    for (const c of todo) log(`  would ${c.editId ? "edit the review of" : "review"} ${refOf(c)} at ${c.head_oid.slice(0, 7)}:\n${c.body.replace(/^/gm, "    ")}`);
    log(`review-post ${repo}: dry run, ${todo.length} of ${s.candidates} candidates, nothing called or written`);
    return s;
  }
  const d = deps ?? defaultPostDeps();
  const w: Writer = { db, login: ACTOR };
  let handled = 0;
  for (const c of todo) {
    const skip = (reason: string) => { s.skipped.push({ ref: refOf(c), reason }); jobItem(db, c.repo, c.number, `skipped: ${reason}`, log); };
    try {
      const live = await prInfo(d.querier, repo, c.number);
      if (!live) { skip("not found on GitHub"); continue; }
      if (live.state !== "OPEN") { skip(`now ${live.state}`); continue; }
      if (live.head !== c.head_oid) { skip(`head moved to ${live.head.slice(0, 7)}`); continue; }
      const g = await guard(db, { repo, number: c.number }, { kind: "post-review", head: c.head_oid }, params.by ?? CLI_BY);
      if ("refused" in g) { skip(g.refused); continue; }
      const at = d.now().toISOString();
      const as = auditIdentity(db, g);
      let edited = false;
      if (c.editId) {
        try {
          await editReview(w, d.querier, g, c.editId, REVIEW_NOTE(c), c.body);
          db.prepare("UPDATE review_posts SET head_oid = ?, edited_at = ?, opus_at = ?, posted_as = ? WHERE repo = ? AND number = ?").run(c.head_oid, at, c.opusAt, as, repo, c.number);
          s.edited.push(refOf(c));
          edited = true;
        } catch (e) {
          // The review is gone, or this token may not edit it: post a fresh one and replace the row.
          if (!reviewUneditable(e)) throw e;
        }
      }
      if (!edited) {
        const id = await postReview(w, d.querier, g, live.id, REVIEW_NOTE(c), c.body);
        if (!id) throw new Error("GitHub returned no review");
        db.prepare("INSERT OR REPLACE INTO review_posts (repo, number, review_id, head_oid, posted_at, opus_at, posted_as) VALUES (?, ?, ?, ?, ?, ?, ?)").run(repo, c.number, id, c.head_oid, at, c.opusAt, as);
        s.posted.push(refOf(c));
      }
      jobItem(db, c.repo, c.number, `${edited ? "edited" : "posted"} review at ${c.head_oid.slice(0, 7)}`, log);
      params.onHandled?.(++handled);
    } catch (e) {
      const reason = String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 300);
      s.failed.push({ ref: refOf(c), reason });
      jobItem(db, c.repo, c.number, `failed: ${reason}`, log);
    }
  }
  log(`review-post ${repo}: ${s.posted.length} posted, ${s.edited.length} edited, ${s.skipped.length} skipped, ${s.failed.length} failed`);
  return s;
}

export const commands = {
  "review-post": {
    summary: "review-post --repo R [--limit N] [--apply]: post the final Opus reviews as PR reviews (dry run without --apply)",
    async run(args: string[]): Promise<void> {
      let repo: string | undefined, limit: number | undefined, apply = false;
      for (let i = 0; i < args.length; i++) {
        const a = args[i]!;
        if (a === "--apply") apply = true;
        else if (a === "--dry-run") apply = false;
        else if (a === "--repo") repo = args[++i];
        else if (a === "--limit") limit = Number(args[++i]);
        else throw new Error(`unknown option ${a}; options: --repo R --limit N --apply --dry-run`);
      }
      if (!repo) throw new Error("missing --repo");
      if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) throw new Error("--limit is a positive whole number");
      const { connect } = await import("../db.ts");
      await runReviewPost(connect(), { repo, limit, dryRun: !apply });
    },
  },
};
