// The item page: one GET with everything the two-sided page draws (status, header, Opus reviews, result cards, AutoCraft's history and
// the GitHub side). Built from the item API (`itemCore`), the item trace and the write records. Redaction follows the helpers it reuses:
// viewers get no review text, card details or job errors; a quiet pull request is veiled by the trace context; costs stay visible.
import { isHiddenRepo } from "../../hidden-sql.ts";
import { prBuildView } from "../../prbuild/view.ts";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { CiState, TimelineEntry, DiscordInfo, ItemBar, ItemKind, ItemPrBuild, ItemRef, ItemReleases, ItemState, Preapproval, QueueSlot, RepoName, ScreenshotRun, Tier } from "../../../web/src/api/types.ts";
import { statusFromItem, type ItemStatus } from "../../core/item-status.ts";
import { triggerWhy } from "../../review/trigger.ts";
import { GITHUB_ACTIONS } from "../../github/actions.ts";
import { fingerprint, context, gather, obj, arr, type Ctx, type Ev, hiddenSql, hiddenArgs } from "./trace.ts";
import { timelineOf } from "./item-timeline.ts";
import { barOf } from "./item-bar.ts";
import { discordOf } from "./discord.ts";
import { itemCore } from "./index.ts";
import { pushedByAutoCraft, writesOf, MATCH_WINDOW_MS, type WriteRow } from "./github-writes.ts";
import { actionsOf as releasesOf } from "../../operator-actions.ts";
import { preapprovalOf, preapprovalsOf } from "../../preapproval/index.ts";
import { queueSlots } from "../../rank/position.ts";
import { visibleRepos } from "./visible.ts";
import { itemReader, statusFor } from "./reader.ts";
import type { Req } from "../types.ts";

export type ItemPhase = ItemStatus["phase"];
export type { ItemStatus };

export type ReviewTrigger = "new-head" | "discussion" | "operator" | "base" | "model-change";
export type ReviewVerdict = "take" | "take-fix" | "hold" | "close";
export interface OpusReviewEntry {
  id: string; head: string; current: boolean; at: string; trigger: ReviewTrigger; why: string; verdict: ReviewVerdict; sure: boolean;
  summary: string; fixes: string[]; risks: string[]; claims: { path: string; line: number; text: string }[]; blockedBy: ItemRef[]; costUsd: number;
}
export interface ReviewHistory { latest: OpusReviewEntry | null; earlier: OpusReviewEntry[] }
export interface GithubEvent {
  id: string; type: "opened" | "comment" | "review" | "label" | "push" | "merged" | "closed"; at: string; actor: string; body: string | null;
  autocraft: { as: string; historyId: string } | null;
}
export interface GithubSide {
  description: string; events: GithubEvent[]; checks: { name: string; state: CiState }[];
  commits: { sha: string; message: string; author: string; at: string; byAutoCraft: boolean }[];
  files: { path: string; additions: number; deletions: number }[]; url: string;
  /** When AutoCraft last read the item from GitHub (poll or webhook re-read); null before the first read since this was recorded. */
  syncedAt: string | null;
}
export interface ItemPageHeader {
  labels: string[]; assignees: string[]; autocraftAssigned: boolean; pipelineOn: boolean; discord: DiscordInfo | null; queue: QueueSlot | null;
  fastTracked: boolean; held: boolean; preapproval: Preapproval | null; releases: ItemReleases; tier: Tier; size: "S" | "M" | "L" | "XL" | null;
}
export interface ItemPageData {
  repo: RepoName; number: number; kind: ItemKind; state: ItemState; title: string; author: string; stamp: string; header: ItemPageHeader;
  status: ItemStatus; bar: ItemBar; costUsd: number; reviews: ReviewHistory; timeline: TimelineEntry[]; github: GithubSide;
  /** PRs: our own build of the newest head; null when the pr-builds switch is off or there is none. */
  prBuild: ItemPrBuild | null;
  /** The screenshot run of the PR's latest head, for staff; empty when there is none. */
  screenshots: ScreenshotRun[];
}
export type ItemPageUnchanged = { unchanged: true; stamp: string };

type Json = Record<string, any>;
type Item = Awaited<ReturnType<typeof itemCore>>;

const short = (s: string | null | undefined): string => (s ?? "").slice(0, 7);
const q = <T>(db: DatabaseSync, sql: string, ...args: (string | number)[]): T[] => db.prepare(sql).all(...args) as T[];

/** Comment text from GitHub, cleaned for display: no HTML comments or tags, cut at `max` characters. */
const clean = (s: string, max = 1500): string => {
  const t = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
};

// ---- stamp ---------------------------------------------------------------------------------------------------------

/** What the page reads beyond the trace's fingerprint: header parts, comment edits, commits, checks, files and the plan view. */
const EXTRA = [
  "SELECT title, labels, LENGTH(COALESCE(body, '')), ci_state, mergeable, additions, deletions, url, closing_issues FROM items WHERE repo = ?1 AND number = ?2",
  "SELECT synced_at FROM item_reads WHERE repo = ?1 AND number = ?2",
  "SELECT view FROM item_plans WHERE repo = ?1 AND number = ?2",
  "SELECT COUNT(*), SUM(LENGTH(COALESCE(body, ''))), SUM(url IS NOT NULL), group_concat(COALESCE(review_state, '')) FROM comments WHERE repo = ?1 AND number = ?2",
  "SELECT COUNT(*), MAX(first_seen_at), SUM(LENGTH(COALESCE(message, ''))) FROM pr_commits WHERE repo = ?1 AND number = ?2",
  "SELECT head_oid, fetched_at, checks FROM pr_checks WHERE repo = ?1 AND number = ?2",
  "SELECT COUNT(*), SUM(additions + deletions) FROM pr_files WHERE repo = ?1 AND number = ?2",
  "SELECT COUNT(*), MAX(at) FROM item_activity WHERE repo = ?1 AND number = ?2",
  "SELECT COUNT(*), MAX(at) FROM classifications WHERE repo = ?1 AND number = ?2",
  "SELECT group_concat(state) FROM postmerge_followups WHERE repo = ?1 AND number = ?2",
  "SELECT id, state, updated_at FROM preapprovals WHERE repo = ?1 AND number = ?2 ORDER BY id DESC LIMIT 1",
  "SELECT id FROM fast_track WHERE repo = ?1 AND number = ?2",
  "SELECT group_concat(head_sha || state || COALESCE(verdict, '') || held) FROM screenshot_runs WHERE repo = ?1 AND number = ?2",
  "SELECT pipeline FROM tracked_repos WHERE name = ?1 AND ?2 IS NOT NULL",
  "SELECT COUNT(*), MAX(id), group_concat(state) FROM jobs WHERE state IN ('queued', 'running') AND repo = ?1 AND json_extract(params, '$.number') = ?2",
  "SELECT group_concat((SELECT COUNT(*) FROM jobs q WHERE q.state = 'queued' AND q.step = j.step AND q.id < j.id)) FROM jobs j WHERE j.state = 'queued' AND j.repo = ?1 AND json_extract(j.params, '$.number') = ?2",
];

const prBuildOf = (c: Ctx): ItemPrBuild | null => {
  const r = c.db.prepare("SELECT kind, head_oid FROM items WHERE repo = ? AND number = ?").get(c.repo, c.n) as { kind: string; head_oid: string | null } | undefined;
  return r?.kind === "pr" ? prBuildView(c.db, c.repo, c.n, r.head_oid, c.staff) : null;
};

async function stampOf(c: Ctx, req: Req): Promise<string> {
  const { db, repo, n, ref } = c;
  const parts: unknown[] = [fingerprint(c, "page"), c.veiled];
  for (const sql of EXTRA) parts.push(Object.values((db.prepare(sql).get(repo, n) ?? {}) as object));
  parts.push(queueSlots(db, await visibleRepos(db, req)).get(ref) ?? null, discordOf(db, repo, n), releasesOf(db, repo, n), prBuildOf(c));
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

// ---- header and status -----------------------------------------------------------------------------------------------

function headerOf(c: Ctx, it: Item, queue: QueueSlot | null): ItemPageHeader {
  const { db, repo, n } = c;
  const lines = it.additions + it.deletions;
  const assignees = arr<string>((db.prepare("SELECT assignees FROM items WHERE repo = ? AND number = ?").get(repo, n) as { assignees: string | null }).assignees).filter((x) => typeof x === "string");
  const pre = it.kind === "pr" ? (it as { preapproval?: Preapproval | null }).preapproval ?? null : null;
  return {
    labels: it.labels, assignees,
    autocraftAssigned: c.box !== "" && assignees.includes(c.box), pipelineOn: it.pipelineOn === true, discord: it.discord ?? null, queue,
    fastTracked: db.prepare("SELECT 1 FROM main.fast_track WHERE repo = ? AND number = ?").get(repo, n) !== undefined,
    held: db.prepare("SELECT 1 FROM main.merge_holds WHERE repo = ? AND number = ?").get(repo, n) !== undefined,
    preapproval: pre, releases: it.releases, tier: it.tier,
    size: it.kind !== "pr" ? null : lines < 50 ? "S" : lines < 300 ? "M" : lines < 1000 ? "L" : "XL",
  };
}

function statusOf(c: Ctx, it: Item): ItemStatus {
  const row = c.db.prepare("SELECT view FROM item_plans WHERE repo = ? AND number = ?").get(c.repo, c.n) as { view: string } | undefined;
  const stored = obj(row?.view).status as Partial<ItemStatus> | undefined;
  const since = it.mergedAt ?? it.closedAt ?? it.updatedAt ?? it.createdAt;
  const s = stored && typeof stored.phase === "string" ? ({ waiting: null, next: null, since, ...stored } as ItemStatus) : statusFromItem({ merged_at: it.mergedAt, closed_at: it.closedAt }, since);
  // A quiet pull request shows its viewers the phase only: the wait and next step quote the planner's reasons. A wait naming a hidden repo's item does not name it.
  return statusFor(itemReader(c), c.repo, c.n, s);
}

// ---- Opus reviews ------------------------------------------------------------------------------------------------------

const VERDICTS = new Set<string>(["take", "take-fix", "hold", "close"]);
type ReviewRow = { key: string; head_oid: string; at: string; model: string | null; verdict: string | null; sure: number | null; reason: string | null; summary: string | null; risks: string | null; fixes: string | null; claims: string | null; blocked_by: string | null; trigger: string | null };

function reviewsOf(c: Ctx, headNow: string | null, events: Ev[]): ReviewHistory {
  const { db, repo, n } = c;
  const rows = q<ReviewRow & { rowid: number }>(db, `SELECT rowid, 'opus:' || rowid AS key, head_oid, at, model, verdict, sure, reason, summary, risks, fixes, claims, blocked_by, trigger
    FROM opus_review_history WHERE repo = ? AND number = ? AND verdict IS NOT NULL`, repo, n);
  // Reviews stored before the history table existed.
  const seen = new Set(rows.map((r) => `${r.head_oid}|${r.at}`));
  for (const r of q<ReviewRow>(db, `SELECT 'opus-latest:' || head_oid AS key, head_oid, at, model, verdict, sure, reason, NULL AS summary, risks, fixes, claims, NULL AS blocked_by, NULL AS trigger
    FROM opus_reviews WHERE repo = ? AND number = ? AND verdict IS NOT NULL`, repo, n)) if (!seen.has(`${r.head_oid}|${r.at}`)) rows.push({ ...r, rowid: 0 });
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.rowid - a.rowid));
  const costs = new Map(events.filter((e) => e.kind === "review").map((e) => [e.id, e.costUsd ?? 0]));
  const staff = c.staff;
  const all = rows.map((r, i): OpusReviewEntry => {
    const older = rows[i + 1];
    // Rows from before the trigger was stored: the same head as the review before means the discussion moved.
    const trigger = (r.trigger && ["new-head", "discussion", "operator", "base"].includes(r.trigger) ? r.trigger : older && older.head_oid === r.head_oid ? "discussion" : "new-head") as ReviewTrigger;
    const fixes = arr<unknown>(r.fixes).map((f) => (typeof f === "string" ? f : `${(f as Json).file}: ${(f as Json).change}`));
    const claims = arr<Json>(r.claims).map((cl) => {
      // Claims are { claim, status, evidence }; the file and line sit in the evidence text.
      const m = /([\w./-]+\.\w+):(\d+)/.exec(String(cl.evidence ?? cl.claim ?? ""));
      return { path: m?.[1] ?? "", line: m ? Number(m[2]) : 0, text: String(cl.claim ?? cl.text ?? "") };
    }).filter((cl) => cl.text);
    return {
      id: r.key, head: short(r.head_oid), current: r.head_oid === headNow, at: r.at, trigger, why: staff ? triggerWhy(r.trigger, !older) ?? (older ? (trigger === "discussion" ? "New discussion since the last review" : "New commits since the last review") : "First review") : "",
      verdict: (VERDICTS.has(r.verdict ?? "") ? r.verdict : "hold") as ReviewVerdict, sure: r.sure === 1,
      summary: staff ? r.summary || r.reason || "" : "", fixes: staff ? fixes : [], risks: staff ? arr<string>(r.risks) : [], claims: staff ? claims : [],
      // Stored as "repo#n" strings.
      blockedBy: arr<unknown>(r.blocked_by).flatMap((b): ItemRef[] => {
        const m = typeof b === "string" ? /^([\w.-]+)#(\d+)$/.exec(b) : null;
        return m && !isHiddenRepo(c.hidden, m[1]!) ? [{ repo: m[1]!, number: Number(m[2]) }] : [];
      }),
      costUsd: costs.get(`review:${r.key}`) ?? 0,
    };
  });
  return { latest: all[0] ?? null, earlier: all.slice(1) };
}

// ---- GitHub side ---------------------------------------------------------------------------------------------------------

const IDENTITY: Record<string, string> = { legacy: "box account", app: "GitHub App" };
const asOf = (w: WriteRow | undefined): string => IDENTITY[w?.identity ?? "legacy"] ?? w?.identity ?? "box account";
const writeType = (action: string): GithubEvent["type"] =>
  action === "merge" ? "merged" : /-push$/.test(action) ? "push" : /^(labels-apply|act-unlabel|assign|unassign|label-create)$/.test(action) ? "label" : /^review-/.test(action) ? "review" : /close/.test(action) ? "closed" : "comment";

function githubOf(c: Ctx, it: Item, ev: Ev[], url: string, syncedAt: string | null): GithubSide {
  const { db, repo, n } = c;
  const events: GithubEvent[] = [];
  const writes = writesOf(db, repo, n).filter((w) => w.state !== "failed");
  const summaryOf = new Map(ev.filter((e) => e.kind === "write").map((e) => [e.id, e.summary]));
  const byComment = new Map(writes.filter((w) => w.comment).map((w) => [w.comment!.id, w]));
  const used = new Set<number>();
  const own = c.own;
  const comments = q<{ id: string; kind: string | null; author: string | null; created_at: string; body: string | null; review_state: string | null }>(db,
    "SELECT id, kind, author, created_at, body, review_state FROM comments WHERE repo = ? AND number = ? AND created_at IS NOT NULL AND NOT (kind = 'review' AND COALESCE(TRIM(body), '') = '')", repo, n);
  if (it.createdAt) events.push({ id: "gh:opened", type: "opened", at: it.createdAt, actor: it.author, body: clean(it.body, 1500), autocraft: null });
  for (const m of comments) {
    const w = byComment.get(m.id);
    const ours = !!w || (!!m.author && own.has(m.author));
    if (w) used.add(w.rowid);
    events.push({
      id: `comment:${m.id}`, type: m.kind === "review" ? "review" : "comment", at: m.created_at, actor: ours ? "autocraft" : m.author ?? "unknown",
      body: clean(m.body ?? ""), autocraft: ours ? { as: asOf(w), historyId: w ? `audit:${w.rowid}` : `comment:${m.id}` } : null,
    });
  }
  const acts = q<{ id: string; kind: string; at: string; actor: string | null; label: string | null; before_oid: string | null; after_oid: string | null }>(db,
    "SELECT id, kind, at, actor, label, before_oid, after_oid FROM item_activity WHERE repo = ? AND number = ?", repo, n);
  const labelWrites = writes.filter((w) => w.action === "labels-apply" || w.action === "act-unlabel");
  for (const a of acts) {
    const ours = !!a.actor && own.has(a.actor);
    const w = ours && a.kind !== "force-push" ? labelWrites.find((x) => Math.abs(Date.parse(x.at) - Date.parse(a.at)) <= MATCH_WINDOW_MS) : undefined;
    if (w) used.add(w.rowid);
    events.push({
      id: `activity:${a.id}`, type: a.kind === "force-push" ? "push" : "label", at: a.at, actor: ours ? "autocraft" : a.actor ?? "unknown",
      body: a.kind === "force-push" ? `Force-pushed ${short(a.before_oid)} → ${short(a.after_oid)}` : `${a.kind === "labeled" ? "Added" : "Removed"} label ${a.label ?? ""}`,
      autocraft: ours ? { as: asOf(w), historyId: w ? `audit:${w.rowid}` : `activity:${a.id}` } : null,
    });
  }
  const merged = writes.find((w) => w.action === "merge");
  if (it.mergedAt && !merged) events.push({ id: "gh:merged", type: "merged", at: it.mergedAt, actor: it.mergedBy ?? "unknown", body: null, autocraft: null });
  else if (it.closedAt && !it.mergedAt) events.push({ id: "gh:closed", type: "closed", at: it.closedAt, actor: "unknown", body: null, autocraft: null });
  // Writes without a mirrored comment or activity row: pushes, merges, assignments, closes, labels the sync has not read yet.
  for (const w of writes) {
    if (used.has(w.rowid) || (w.comment && w.action !== "merge")) continue;
    if (/comment|review-/.test(w.action) && !GITHUB_ACTIONS[w.action]) continue;
    events.push({ id: `audit:${w.rowid}`, type: writeType(w.action), at: w.at, actor: "autocraft", body: summaryOf.get(`audit:${w.rowid}`) ?? GITHUB_ACTIONS[w.action] ?? w.action, autocraft: { as: asOf(w), historyId: `audit:${w.rowid}` } });
  }
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
  const commits = q<{ oid: string; message: string | null; author: string | null; at: string }>(db,
    "SELECT oid, message, author, MIN(committed_at, COALESCE(first_seen_at, committed_at)) AS at FROM pr_commits WHERE repo = ? AND number = ? ORDER BY at, oid", repo, n)
    .map((m) => ({ sha: short(m.oid), message: clean(m.message ?? "", 500), author: m.author ?? "unknown", at: m.at, byAutoCraft: (!!m.author && own.has(m.author)) || pushedByAutoCraft(db, repo, n, m.oid) }));
  return {
    description: clean(it.body, 6000), events, checks: it.ciChecks.filter((x) => x.state !== "none").map((x) => ({ name: x.name, state: x.state })), commits,
    files: it.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })), url, syncedAt,
  };
}

// ---- screenshots -----------------------------------------------------------------------------------------------------

type ShotRow = { head_sha: string; state: string; reason: string | null; plan: string | null; head_task_id: number | null; base_task_id: number | null; verdict: string | null; clear: number | null; comparison: string | null; model: string | null; held: number; created_at: string; finished_at: string | null };

/** The latest screenshot run of the PR: one entry for staff, none for anyone else or a veiled PR. Images are served by the task artifact route. */
function screenshotsOf(c: Ctx, headNow: string | null): ScreenshotRun[] {
  if (!c.staff || c.veiled) return [];
  const r = c.db.prepare("SELECT * FROM screenshot_runs WHERE repo = ? AND number = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(c.repo, c.n) as ShotRow | undefined;
  if (!r) return [];
  const names = (id: number | null): Set<string> => new Set(id === null ? [] : (c.db.prepare("SELECT name FROM build_artifacts WHERE task_id = ? AND content_type = 'image/png'").all(id) as { name: string }[]).map((x) => x.name));
  const before = names(r.base_task_id), after = names(r.head_task_id);
  const shots = [...after].filter((n) => before.has(n)).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
    .map((name) => ({ name, before: { taskId: r.base_task_id!, name }, after: { taskId: r.head_task_id!, name } }));
  return [{
    head: short(r.head_sha), current: r.head_sha === headNow, state: r.state as ScreenshotRun["state"], verdict: r.verdict as ScreenshotRun["verdict"], clear: r.clear === null ? null : r.clear === 1,
    comparison: r.comparison, held: r.held === 1, reason: r.reason, model: r.model, at: r.finished_at ?? r.created_at, shots,
  }];
}

// ---- the route -------------------------------------------------------------------------------------------------------------

export async function itemPage(db: DatabaseSync, req: Req): Promise<ItemPageData | ItemPageUnchanged> {
  const c = await context(db, req);
  const stamp = await stampOf(c, req);
  if (req.query.get("since") === stamp) return { unchanged: true, stamp };
  const it = await itemCore(db, req);
  const ev = gather(c, null);
  const row = db.prepare("SELECT url, head_oid, (SELECT synced_at FROM item_reads r WHERE r.repo = items.repo AND r.number = items.number) AS synced_at FROM items WHERE repo = ? AND number = ?").get(c.repo, c.n) as { url: string | null; head_oid: string | null; synced_at: string | null };
  const cost = (db.prepare(`SELECT COALESCE(SUM(r.cost_usd), 0) AS cost FROM agent_run_items i JOIN agent_runs r ON r.id = i.run_id WHERE i.repo = ? AND i.number = ?${hiddenSql(c.hidden)}`)
    .get(c.repo, c.n, ...hiddenArgs(c.hidden)) as { cost: number }).cost;
  const status = statusOf(c, it);
  return {
    repo: c.repo, number: c.n, kind: it.kind, state: it.state, title: it.title, author: it.author, stamp,
    header: headerOf(c, it, it.queue ?? null), status, bar: barOf(c, { kind: it.kind, state: it.state, mergedAt: it.mergedAt, pipelineOn: it.pipelineOn === true }, status), costUsd: cost,
    reviews: it.kind === "pr" ? reviewsOf(c, row.head_oid, ev) : { latest: null, earlier: [] },
    timeline: timelineOf(c, ev, it.kind === "pr" ? preapprovalsOf(db, c.repo, c.n) : []).slice(-200),
    github: githubOf(c, it, ev, row.url ?? "", row.synced_at),
    prBuild: prBuildOf(c),
    screenshots: screenshotsOf(c, row.head_oid),
  };
}
