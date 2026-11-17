// The public status layer: the only source of what anonymous people (the Discord bot, a PR status comment) may learn about an
// item or about the pipeline. It names an item's place on a fixed list of steps and gives counts. It never carries hold
// reasons, prompts, model output, account data or anything about a security fix, and it knows only public tracked repos.
import type { DatabaseSync } from "node:sqlite";
import { scoreLookup } from "../rank/position.ts";
import { fastPositions } from "../fasttrack.ts";
import { quietSqlFor } from "../security/quiet.ts";

export const STEPS = ["New", "Triaged", "In review", "Waiting for CI", "Fix-up in progress", "Needs a maintainer decision", "In the merge queue", "Merged", "Closed"] as const;
export type PublicStep = (typeof STEPS)[number];

export type PublicStatus = {
  ref: string; title: string; url: string; kind: "issue" | "pr";
  state: "open" | "merged" | "closed";
  step: PublicStep;
  /** Only for step "In the merge queue": the place among the repo's PRs that will merge next, and how many there are. */
  queue?: { position: number; of: number };
};

// Mapping from stored data to a step (first match wins; open items only):
//
//   items.state MERGED / CLOSED                                   -> Merged / Closed
//   an open decisions row for the item (any kind)                 -> Needs a maintainer decision
//   issue: no item_stage row                                      -> New
//   issue: any other                                              -> Triaged
//   PR plan state in-batch, batch-checking, ready,
//     decision-answered-merge, and not held (view.queue.held)     -> In the merge queue (#n of m)
//   PR plan state needs-fix-up, or view.fixup = fix,
//     or view.cifix = cifix-queued | cifix-rerun                  -> Fix-up in progress
//   PR plan state waiting-ci, waiting-premerge, waiting-verify,
//     ci-approval, waiting-main-ci                                -> Waiting for CI
//   PR with no item_stage row                                     -> New
//   PR never reviewed (item_stage.reviewed = 0, no queue state)   -> Triaged
//   PR any other (reviewed: held, refused, conflict, changes
//     requested, stale ... all look the same)                     -> In review
//
// Held and refused states are deliberately folded into "In review": the reason is not public.
const QUEUED = ["in-batch", "batch-checking", "ready", "decision-answered-merge"];
const FIXING = ["needs-fix-up"];
const WAITING = ["waiting-ci", "waiting-premerge", "waiting-verify", "ci-approval", "waiting-main-ci"];
const NEVER_REVIEWED = ["not-reviewed", "label-not-reviewed", "out-of-scope", "scope", "draft"];

const sqlList = (xs: string[]): string => xs.map((x) => `'${x}'`).join(",");

/** True for a repo that is tracked and public. */
export const isPublicRepo = (db: DatabaseSync, repo: string): boolean =>
  !!db.prepare("SELECT 1 FROM main.tracked_repos t JOIN main.repos r ON r.name = t.name WHERE t.name = ? AND lower(r.visibility) = 'public'").get(repo);

/** Names of the tracked repos that are public. */
export const publicRepoNames = (db: DatabaseSync): string[] =>
  (db.prepare("SELECT t.name FROM main.tracked_repos t JOIN main.repos r ON r.name = t.name WHERE lower(r.visibility) = 'public' ORDER BY t.name").all() as { name: string }[]).map((r) => r.name);

/** The security cases an anonymous viewer must not see: a quiet fix PR, any finding's fix PR, an item the classifier flagged or a label marks as security. */
export const hiddenSql = (repo: string, number: string, labels: string): string => `(${quietSqlFor(repo, number)}
  OR EXISTS (SELECT 1 FROM main.security_findings sf WHERE sf.repo = ${repo} AND (sf.fix_pr = ${number}))
  OR EXISTS (SELECT 1 FROM main.classifications c, json_each(CASE WHEN json_valid(c.flags) THEN c.flags ELSE '[]' END) f WHERE c.repo = ${repo} AND c.number = ${number} AND f.value = 'security')
  OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(${labels}) THEN ${labels} ELSE '[]' END) l WHERE lower(l.value) LIKE '%security%'))`;

type Row = { title: string | null; url: string | null; kind: string; state: string; hidden: number; stage: string | null; reviewed: number | null; plan: string | null; view: string | null; decision: number };

export function publicStatus(db: DatabaseSync, repo: string, number: number): PublicStatus | null {
  if (!isPublicRepo(db, repo)) return null;
  const row = db.prepare(`SELECT i.title, i.url, i.kind, i.state, ${hiddenSql("i.repo", "i.number", "i.labels")} AS hidden,
      s.stage, s.reviewed, p.state AS plan, p.view,
      EXISTS (SELECT 1 FROM main.decisions d WHERE d.repo = i.repo AND d.number = i.number AND d.answer IS NULL) AS decision
    FROM main.items i LEFT JOIN main.item_stage s ON s.repo = i.repo AND s.number = i.number LEFT JOIN main.item_plans p ON p.repo = i.repo AND p.number = i.number
    WHERE i.repo = ? AND i.number = ?`).get(repo, number) as Row | undefined;
  if (!row || row.hidden || !row.url) return null;
  const kind = row.kind === "pr" ? "pr" : "issue";
  const base = { ref: `${repo}#${number}`, title: row.title ?? "", url: row.url, kind } as const;
  if (row.state === "MERGED") return { ...base, state: "merged", step: "Merged" };
  if (row.state === "CLOSED") return { ...base, state: "closed", step: "Closed" };
  const open = { ...base, state: "open" } as const;
  if (row.decision) return { ...open, step: "Needs a maintainer decision" };
  if (kind === "issue") return { ...open, step: row.stage === null ? "New" : "Triaged" };
  let view: { fixup?: string; cifix?: string; queue?: { held?: boolean } } = {};
  try {
    const v: unknown = row.view ? JSON.parse(row.view) : {};
    if (v && typeof v === "object") view = v;
  } catch {
    // An unreadable cached view counts as no view.
  }
  const plan = row.plan ?? "";
  if (QUEUED.includes(plan) && !view.queue?.held) {
    const q = queuePlace(db, repo, number);
    if (q) return { ...open, step: "In the merge queue", queue: q };
  }
  if (FIXING.includes(plan) || view.fixup === "fix" || view.cifix === "cifix-queued" || view.cifix === "cifix-rerun") return { ...open, step: "Fix-up in progress" };
  if (WAITING.includes(plan)) return { ...open, step: "Waiting for CI" };
  if (row.stage === null) return { ...open, step: "New" };
  if (!row.reviewed && (NEVER_REVIEWED.includes(plan) || plan === "")) return { ...open, step: "Triaged" };
  return { ...open, step: "In review" };
}

/** Open PRs of a repo that are queued to merge, in the dashboard queue page's order: fast-tracked first, batch members after ready ones, then by work rank, repo and number. */
function queueOf(db: DatabaseSync, repo: string): number[] {
  const rows = db.prepare(`SELECT p.number, p.state FROM main.item_plans p JOIN main.items i ON i.repo = p.repo AND i.number = p.number
    WHERE p.repo = ? AND p.kind = 'pr' AND p.state IN (${sqlList(QUEUED)}) AND json_extract(p.view, '$.gh') = 'OPEN'
      AND COALESCE(json_extract(p.view, '$.queue.held'), 0) = 0 AND NOT ${hiddenSql("p.repo", "p.number", "i.labels")}`).all(repo) as { number: number; state: string }[];
  const fast = fastPositions(db), score = scoreLookup(db);
  const fp = (n: number): number => fast.get(`${repo}#${n}`)?.position ?? 1e9;
  const cls = (s: string) => (s === "in-batch" || s === "batch-checking" ? 1 : 0);
  return rows.sort((a, b) => fp(a.number) - fp(b.number) || cls(a.state) - cls(b.state)
    || (score(repo, b.number) ?? -1) - (score(repo, a.number) ?? -1) || a.number - b.number).map((r) => r.number);
}

function queuePlace(db: DatabaseSync, repo: string, number: number): { position: number; of: number } | null {
  const q = queueOf(db, repo);
  const at = q.indexOf(number);
  return at < 0 ? null : { position: at + 1, of: q.length };
}

export type PublicStats = {
  repo: string | null;
  openIssues: number; openPrs: number;
  mergedLast7Days: number; mergedByAutoCraftLast7Days: number;
  reviewsPostedLast7Days: number;
  /** Median hours from opening to merge over PRs merged in the last 30 days; null with none. */
  medianOpenToMergeHours30Days: number | null;
  queueLength: number;
};

const DAY = 86_400_000;

/** Counts for one public tracked repo, or all of them (`repo` omitted). null when `repo` is not public and tracked. */
export function publicStats(db: DatabaseSync, repo?: string, now = Date.now()): PublicStats | null {
  if (repo !== undefined && !isPublicRepo(db, repo)) return null;
  const repos = repo !== undefined ? [repo] : publicRepoNames(db);
  const out: PublicStats = { repo: repo ?? null, openIssues: 0, openPrs: 0, mergedLast7Days: 0, mergedByAutoCraftLast7Days: 0, reviewsPostedLast7Days: 0, medianOpenToMergeHours30Days: null, queueLength: 0 };
  const since7 = new Date(now - 7 * DAY).toISOString(), since30 = new Date(now - 30 * DAY).toISOString();
  const open = db.prepare(`SELECT COUNT(*) AS n FROM main.items i WHERE i.repo = ? AND i.kind = ? AND i.state = 'OPEN' AND NOT ${hiddenSql("i.repo", "i.number", "i.labels")}`);
  const merged = db.prepare(`SELECT i.created_at, i.merged_at, (EXISTS (SELECT 1 FROM main.merges m WHERE m.repo = i.repo AND m.number = i.number AND m.outcome = 'merged')
      OR EXISTS (SELECT 1 FROM main.merge_batch_prs bp JOIN main.merge_batches b ON b.id = bp.batch_id WHERE b.repo = i.repo AND bp.number = i.number AND b.state = 'merged')) AS ours
    FROM main.items i WHERE i.repo = ? AND i.state = 'MERGED' AND i.kind = 'pr' AND i.merged_at >= ? AND NOT ${hiddenSql("i.repo", "i.number", "i.labels")}`);
  const reviews = db.prepare(`SELECT COUNT(*) AS n FROM main.review_posts rp JOIN main.items i ON i.repo = rp.repo AND i.number = rp.number
    WHERE rp.repo = ? AND rp.posted_at >= ? AND NOT ${hiddenSql("i.repo", "i.number", "i.labels")}`);
  const hours: number[] = [];
  for (const r of repos) {
    out.openIssues += (open.get(r, "issue") as { n: number }).n;
    out.openPrs += (open.get(r, "pr") as { n: number }).n;
    for (const m of merged.all(r, since30) as { created_at: string | null; merged_at: string; ours: number }[]) {
      const dur = m.created_at ? Date.parse(m.merged_at) - Date.parse(m.created_at) : NaN;
      if (dur >= 0) hours.push(dur / 3_600_000);
      if (m.merged_at >= since7) {
        out.mergedLast7Days++;
        if (m.ours) out.mergedByAutoCraftLast7Days++;
      }
    }
    out.reviewsPostedLast7Days += (reviews.get(r, since7) as { n: number }).n;
    out.queueLength += queueOf(db, r).length;
  }
  if (hours.length) {
    hours.sort((a, b) => a - b);
    const mid = hours.length >> 1;
    out.medianOpenToMergeHours30Days = Math.round((hours.length % 2 ? hours[mid]! : (hours[mid - 1]! + hours[mid]!) / 2) * 10) / 10;
  }
  return out;
}

