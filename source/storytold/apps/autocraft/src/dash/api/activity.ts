// The activity stream: the item trace's event rows for all items together, newest first. Each source reads only its newest
// rows by time through an index (never every event of every item), the sources are merged and cut to the page, and the
// cursor is time + id. The row to event mapping is the item trace's (trace.ts).
import { createHash } from "node:crypto";
import { PRIVATE_STEPS_SQL } from "../../build/tasks.ts";
import type { DatabaseSync } from "node:sqlite";
import type { ActivityEvent, ActivityItem, ActivityPage, TraceKind } from "../../../web/src/api/types.ts";
import { getDecision, reposOf } from "../../decisions.ts";
import { GITHUB_ACTIONS } from "../../github/actions.ts";
import { quietFixPrs } from "../../security/quiet.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import {
  KINDS, actionEvent, activityEvent, writeActions, writeEvent, checkEvent, ciFixEvent, closedEvent, commentEvent, conflictEvent, decisionEvents, feedbackEvent, fixupEvent, hiddenSql, hiddenArgs,
  iso, jobEvent, mergeEvent, mergedEvent, openedEvent, opusEvent, patchCheckEvent, planEvent, planEventFor, postmergeEvent, premergeEvent, pushEvent, RUN_COLUMNS, rows, runEvent, stageEvent,
  taskEvent, turnEvent, verifyEvent, plainSummary, veilEvent, VEILED_KINDS, type DecisionRow, type Ev, type ItemRow, type OpusRow,
} from "./trace.ts";
import { canSeeInternals } from "./staff.ts";
import { hiddenRepos, needVisible, visibleRepos } from "./visible.ts";
import { isHiddenRepo, type HiddenRepos } from "../../hidden-sql.ts";
import { allOwnLogins } from "../../github/identity.ts";

export const ACTIVITY_PAGE_DEFAULT = 50, ACTIVITY_PAGE_MAX = 200;
/** Plan changes and stages come from every planner pass of every item and would bury the rest, so they show only when asked for. */
export const ACTIVITY_DEFAULT_KINDS: TraceKind[] = KINDS.filter((k) => k !== "plan");
/** Sorts after every event id of the same time. */
const LAST = "~";

export type Ctx = { db: DatabaseSync; own: Set<string>; staff: boolean; operator: boolean; hidden: HiddenRepos; visible: string[]; only: boolean; repo: string | null; limit: number; before: { at: string; id: string } | null };
type At = { repo: string; number: number };
type Pulled = { events: (Ev & At)[]; /** Oldest time read when the source had more rows than it returned; null when it returned everything. */ floor: string | null };
export type Source = { kinds: TraceKind[]; table: string; time: string; pull: (c: Ctx) => Pulled };

/** Newest `limit` rows of one table at or before the cursor's second (the stored times mix second and millisecond precision), each mapped to events. */
function newest<R>(c: Ctx, o: { cols: string; from: string; time: string; where?: string; repoCol?: string | null; args?: (string | number)[]; /** With Only AutoCraft: null skips the source (its events are people's), a clause narrows it to AutoCraft's rows, nothing means every row is AutoCraft's. */ only?: (c: Ctx) => { where: string; args: (string | number)[] } | null; of?: (r: R) => At | null; map: (r: R) => (Ev | null)[]; keep?: (r: R) => boolean; one?: (r: R) => string }): Pulled {
  // Only visible (tracked, readable) repos are read. The unary plus keeps the planner on the time index instead of a repo index plus a sort. No `repoCol`: the repo is not a column (audit targets), so `of` filters it.
  const repoCol = o.repoCol === undefined ? "repo" : o.repoCol;
  const own = c.only ? o.only?.(c) : undefined;
  if (own === null) return { events: [], floor: null };
  const where = [`${o.time} IS NOT NULL`, ...(o.where ? [o.where] : []), ...(own ? [own.where] : []), ...(c.before ? [`${o.time} <= ?`] : []), ...(repoCol && c.repo ? [`${repoCol} = ?`] : []), ...(repoCol ? [`+${repoCol} IN (${c.visible.map(() => "?").join(",") || "NULL"})`] : [])];
  const args = [...(o.args ?? []), ...(own?.args ?? []), ...(c.before ? [`${c.before.at.slice(0, 19)}Z`] : []), ...(repoCol && c.repo ? [c.repo] : []), ...(repoCol ? c.visible : [])];
  const raw = rows<R & Record<string, string>>(c.db, `SELECT ${o.cols} FROM ${o.from} WHERE ${where.join(" AND ")} ORDER BY ${o.time} DESC LIMIT ${c.limit}`, ...args);
  const seen = new Set<string>();
  const events: (Ev & At)[] = [];
  for (const r of raw) {
    if (o.keep && !o.keep(r)) continue;
    if (o.one) { const k = o.one(r); if (seen.has(k)) continue; seen.add(k); }
    const at = o.of ? o.of(r) : (r as unknown as At);
    if (at) for (const e of o.map(r)) if (e) events.push({ ...e, repo: at.repo, number: at.number });
  }
  // The time column is always aliased `t` in `cols`.
  const floor = raw.length >= c.limit ? iso(raw[raw.length - 1]!["t"]) : null;
  return { events, floor };
}

const T = "t";
const itemCols = "repo, number, kind, author, created_at, closed_at, merged_at, merged_by, head_oid";
const item = (time: string, where: string, map: (r: ItemRow & At) => Ev): Source => ({
  kinds: ["github"], table: "items", time,
  pull: (c) => newest<ItemRow & At>(c, { cols: `${itemCols}, ${time} AS ${T}`, from: "items", time, where, only: () => null, map: (r) => [map(r)] }),
});
/** A source whose rows carry `repo` and `number` and map to one event each. */
const plain = <R extends At>(kind: TraceKind, table: string, time: string, cols: string, map: (r: R, c: Ctx) => Ev, o: { from?: string; repoCol?: string; where?: string; one?: (r: R) => string; only?: (c: Ctx) => { where: string; args: (string | number)[] } | null } = {}): Source => ({
  kinds: [kind], table, time,
  pull: (c) => newest<R>(c, { cols: `${cols}, ${time} AS ${T}`, from: o.from ?? table, time, repoCol: o.repoCol, where: o.where, one: o.one, only: o.only, map: (r) => [map(r, c)] }),
});

/** Decisions that name an item and do not touch a repo hidden from the viewer. */
const decisionVisible = (c: Ctx, id: string): boolean => {
  const d = getDecision(c.db, id);
  return !d || !reposOf(d).some((r) => isHiddenRepo(c.hidden, r));
};
const DECISION_COLS = "d.id, d.repo, d.number, d.kind, d.question, d.asked_at, d.asked_by, d.answer, d.answered_at, d.answered_by, d.answer_note, d.serving_metadata";
type Dec = DecisionRow & At;

export const SOURCES: Source[] = [
  item("created_at", "kind IS NOT NULL", openedEvent),
  item("merged_at", "merged_at IS NOT NULL", mergedEvent),
  item("closed_at", "closed_at IS NOT NULL AND merged_at IS NULL", closedEvent),
  plain<Parameters<typeof commentEvent>[0] & At>("github", "comments", "created_at", "repo, number, id, kind, author, created_at, review_state, commit_oid, LENGTH(COALESCE(body, '')) AS len", (r, c) => commentEvent(r, c.own), { only: (c) => (c.own.size ? { where: `author IN (${[...c.own].map(() => "?").join(",")})`, args: [...c.own] } : null) }),
  plain<Parameters<typeof activityEvent>[0] & At>("github", "item_activity", "at", "repo, number, id, kind, at, actor, label, after_oid, before_oid", (r, c) => activityEvent(r, c.own), { only: (c) => (c.own.size ? { where: `actor IN (${[...c.own].map(() => "?").join(",")})`, args: [...c.own] } : null) }),
  plain<Parameters<typeof stageEvent>[0] & At>("plan", "stages", "at", "repo, number, rowid, stage, at, actor, note", stageEvent),
  plain<Parameters<typeof planEvent>[0] & At>("plan", "plan_history", "at", "repo, number, id, head, old_state, new_state, wait, reasons, at", (r, c) => planEventFor(c, r)),
  // A job over many items is one row of the stream, at its newest item.
  plain<Parameters<typeof jobEvent>[0] & At>("job", "job_items", "ji.at", "ji.repo AS repo, ji.number AS number, ji.id, ji.job_id, ji.outcome, ji.at, j.step, j.state, j.error", jobEvent, { repoCol: "ji.repo", from: "job_items ji LEFT JOIN jobs j ON j.id = ji.job_id", one: (r) => String(r.job_id) }),
  // A run over many items is one row too: its first item. Runs that touched a hidden repo are left out whole.
  {
    kinds: ["model-call"], table: "agent_runs", time: "started_at",
    pull: (c) => newest<Parameters<typeof runEvent>[0] & At>(c, {
      cols: `${RUN_COLUMNS}, i.repo AS repo, i.number AS number, r.started_at AS ${T}`,
      from: "agent_runs r JOIN agent_run_items i ON i.run_id = r.id AND (i.repo, i.number) = (SELECT x.repo, x.number FROM agent_run_items x WHERE x.run_id = r.id ORDER BY x.repo, x.number LIMIT 1) LEFT JOIN claude_accounts a ON a.id = r.account_id",
      time: "r.started_at", repoCol: "i.repo", where: hiddenSql(c.hidden).replace(/^ AND /, "") || undefined, args: hiddenArgs(c.hidden), map: (r) => [runEvent(r)],
    }),
  },
  plain<Parameters<typeof checkEvent>[0] & At>("check", "model_checks", "started_at", "repo, number, id, run_id, step, head, command, crate, test_name, task_id, outcome, started_at", checkEvent),
  plain<Parameters<typeof taskEvent>[0] & At>("check", "build_tasks", "queued_at", "repo, number, id, job_id, step, head_sha, state, summary, queued_at", taskEvent, { where: `step NOT IN (${PRIVATE_STEPS_SQL})` }),
  plain<Parameters<typeof pushEvent>[0] & At>("check", "push_outcomes", "at", "repo, number, id, at, stage, action, to_oid, before_res, after_res, outcome", pushEvent),
  plain<Parameters<typeof patchCheckEvent>[0] & At>("check", "patch_checks", "created_at", "repo, number, id, kind, subject, round, verdict, model, reasons, created_at, serving_metadata", patchCheckEvent),
  plain<OpusRow & At & { rowid: number }>("review", "opus_review_history", "at", "repo, number, rowid, head_oid, at, model, mode, verdict, sure, reason, risks, fixes, claims, serving_metadata", (r) => opusEvent(r, `opus:${r.rowid}`)),
  plain<Parameters<typeof premergeEvent>[0] & At>("review", "premerge_reviews", "at", "repo, number, head_oid, at, model, findings, error, searched, serving_metadata", premergeEvent),
  plain<Parameters<typeof postmergeEvent>[0] & At>("review", "postmerge_reviews", "at", "repo, number, merge_sha, at, model, findings, error, serving_metadata", (r, c) => postmergeEvent(r, c.staff)),
  plain<Parameters<typeof verifyEvent>[0] & At>("review", "verifications", "created_at", "repo, number, head_sha, kind, state, reason, summary, note, created_at, head_task_id, serving_metadata", verifyEvent),
  {
    kinds: ["decision"], table: "decisions", time: "asked_at",
    pull: (c) => newest<Dec>(c, { cols: `${DECISION_COLS}, d.asked_at AS ${T}`, from: "decisions d", time: "d.asked_at", repoCol: "d.repo", where: "d.number IS NOT NULL", keep: (r) => decisionVisible(c, r.id), map: (r) => [decisionEvents(r)[0]!] }),
  },
  {
    kinds: ["decision"], table: "decisions", time: "answered_at",
    pull: (c) => newest<Dec>(c, { cols: `${DECISION_COLS}, d.answered_at AS ${T}`, from: "decisions d", time: "d.answered_at", repoCol: "d.repo", where: "d.number IS NOT NULL", only: () => null, keep: (r) => decisionVisible(c, r.id), map: (r) => [decisionEvents(r)[1] ?? null] }),
  },
  {
    kinds: ["decision"], table: "decision_comments", time: "at",
    pull: (c) => newest<{ decision_id: string; cid: string; login: string; at: string; len: number } & At>(c, {
      cols: `d.repo AS repo, d.number AS number, x.decision_id, x.id AS cid, x.login, x.at, LENGTH(x.body) AS len, x.at AS ${T}`, from: "decision_comments x JOIN decisions d ON d.id = x.decision_id", time: "x.at", repoCol: "d.repo", where: "d.number IS NOT NULL",
      only: () => null, keep: (r) => decisionVisible(c, r.decision_id), map: (r) => [feedbackEvent(r.decision_id, { id: r.cid, login: r.login, at: r.at, len: r.len })],
    }),
  },
  plain<Parameters<typeof fixupEvent>[0] & At>("step", "fixups", "created_at", "repo, number, rowid, from_head AS head, to_head, state, reason, files, attempt, created_at, serving_metadata", fixupEvent),
  plain<Parameters<typeof ciFixEvent>[0] & At>("step", "ci_fixes", "created_at", "repo, number, rowid, head, to_head, kind, state, reason, files, attempt, task_id, created_at, serving_metadata", ciFixEvent),
  plain<Parameters<typeof conflictEvent>[0] & At>("step", "conflict_merges", "created_at", "repo, number, rowid, from_head AS head, to_head, state, reason, files, attempt, created_at, serving_metadata", conflictEvent),
  plain<Parameters<typeof mergeEvent>[0] & At>("step", "merges", "at", "repo, number, rowid, head_oid, at, path, method, outcome, reason", mergeEvent),
  plain<Parameters<typeof actionEvent>[0] & At>("step", "actions", "created_at", "repo, number, id, decision_id, kind, state, reason, created_at", actionEvent),
  plain<Parameters<typeof turnEvent>[0] & At>("conversation", "conversation_turns", "at", "repo, number, id, kind, login, at, LENGTH(body) AS len, status, serving_metadata", turnEvent, { only: () => ({ where: "kind IN ('opus', 'system')", args: [] }) }),
  // Audit rows name their item in `target` (`repo#number`); other targets are not items.
  {
    kinds: ["write"], table: "audit", time: "at",
    pull(c) {
      const allowed = writeActions(c.staff, c.operator);
      return newest<Parameters<typeof writeEvent>[0] & { target: string }>(c, {
        cols: `rowid, at, login, action, details, target, at AS ${T}`, from: "audit", time: "at", repoCol: null,
        where: `instr(target, '#') > 0${allowed ? ` AND action IN (${allowed.map(() => "?").join(",")})` : ""}${c.repo ? " AND substr(target, 1, ?) = ?" : ""}`,
        args: [...(allowed ?? []), ...(c.repo ? [c.repo.length + 1, `${c.repo}#`] : [])],
        // A write is AutoCraft's when the viewer is not staff (the actor is hidden) or the pipeline recorded a state with it (writeEvent).
        only: () => (c.staff ? { where: `CASE WHEN json_valid(details) THEN typeof(json_extract(details, '$.state')) ELSE NULL END = 'text' AND action IN (${Object.keys(GITHUB_ACTIONS).map(() => "?").join(",")})`, args: Object.keys(GITHUB_ACTIONS) } : { where: "1", args: [] }),
        of: (r) => {
          const i = r.target.lastIndexOf("#"), n = Number(r.target.slice(i + 1)), repo = r.target.slice(0, i);
          return Number.isInteger(n) && repo && c.visible.includes(repo) ? { repo, number: n } : null;
        },
        map: (r) => [writeEvent(r, c.staff)],
      });
    },
  },
];

const after = (a: Ev, b: { at: string; id: string }): boolean => a.at < b.at || (a.at === b.at && a.id < b.id);

/** One round: every wanted source's newest rows before the cursor, merged. Events older than the oldest row of a source that hit its limit may be missing others of that source, so they wait for the next round. */
function round(c: Ctx, sources: Source[]): { events: (Ev & At)[]; bound: string | null } {
  const events: (Ev & At)[] = [];
  let bound: string | null = null;
  for (const s of sources) {
    const p = s.pull(c);
    if (p.floor && (!bound || p.floor > bound)) bound = p.floor;
    for (const e of p.events) {
      const at = iso(e.at);
      if (at) events.push({ ...e, at });
    }
  }
  const kept = events.filter((e) => (!bound || e.at >= bound) && (!c.before || after(e, c.before)));
  return { events: kept.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1)), bound };
}

type Query = { kinds: Set<TraceKind>; only: boolean; repo: string | null; limit: number; cursor: { at: string; id: string } | null };

function page(base: Omit<Ctx, "before" | "limit" | "only">, sources: Source[], q: Query): { events: (Ev & At)[]; next: { at: string; id: string } | null } {
  const out: (Ev & At)[] = [];
  const ids = new Set<string>();
  let before = q.cursor;
  let exhausted = false;
  // The autocraft filter drops rows after the read, so a round can come back short: read on, a few rounds at most.
  for (let i = 0; i < 6 && !exhausted && out.length <= q.limit; i++) {
    const { events, bound } = round({ ...base, limit: q.limit, only: q.only, before }, sources);
    for (const e of events) {
      const key = `${e.repo}#${e.number}|${e.id}`;
      if (ids.has(key) || (q.only && e.actor.type === "person")) continue;
      ids.add(key);
      out.push(e);
    }
    if (!bound) exhausted = true;
    // The next round starts at the oldest time that was fully read; when a whole round sat in one second, step past it.
    else before = { at: before && bound >= before.at ? new Date(Date.parse(before.at) - 1).toISOString() : bound, id: LAST };
  }
  const events = out.slice(0, q.limit);
  return { events, next: out.length > q.limit ? tail(events, q.limit) : exhausted ? null : before };
}
const tail = (events: Ev[], limit: number): { at: string; id: string } | null => {
  const last = events[limit - 1];
  return last ? { at: last.at, id: last.id } : null;
};

/** The newest time and the running counts per wanted source: equal stamps mean a poll has nothing new for the top of the stream. */
function stampOf(db: DatabaseSync, sources: Source[], key: unknown[]): string {
  const parts: unknown[] = [key];
  for (const s of sources) parts.push((db.prepare(`SELECT MAX(${s.time.replace(/^\w+\./, "")}) AS m FROM ${s.table}`).get() as { m: unknown }).m);
  parts.push(Object.values(db.prepare("SELECT COUNT(*) FROM agent_runs WHERE state = 'running'").get() as object));
  parts.push(Object.values(db.prepare("SELECT COUNT(*), MAX(id) FROM jobs WHERE state IN ('queued', 'running')").get() as object));
  parts.push(Object.values(db.prepare("SELECT COUNT(*) FROM build_tasks WHERE state IN ('queued', 'claimed', 'running')").get() as object));
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

const itemsOf = (db: DatabaseSync, events: (Ev & At)[]): Map<string, ActivityItem> => {
  const out = new Map<string, ActivityItem>();
  const q = db.prepare("SELECT kind, state, title FROM items WHERE repo = ? AND number = ?");
  for (const e of events) {
    const k = `${e.repo}#${e.number}`;
    if (out.has(k)) continue;
    const r = q.get(e.repo, e.number) as { kind: string | null; state: string | null; title: string | null } | undefined;
    out.set(k, { repo: e.repo, number: e.number, kind: r?.kind === "pr" || r?.kind === "issue" ? r.kind : null, state: r?.state ? (r.state.toLowerCase() as ActivityItem["state"]) : null, title: r?.title ?? null });
  }
  return out;
};

export async function activity(db: DatabaseSync, req: Req): Promise<ActivityPage | { unchanged: true; stamp: string }> {
  const q = (k: string) => req.query.get(k) || undefined;
  const limitRaw = q("limit");
  if (limitRaw !== undefined && !/^\d{1,4}$/.test(limitRaw)) throw new HttpError(400, "limit must be a whole number");
  const limit = Math.min(Math.max(Number(limitRaw ?? ACTIVITY_PAGE_DEFAULT), 1), ACTIVITY_PAGE_MAX);
  const kq = q("kinds");
  let kinds = new Set(ACTIVITY_DEFAULT_KINDS);
  if (kq) {
    const list = kq.split(",");
    if (list.some((k) => !KINDS.includes(k as TraceKind))) throw new HttpError(400, `kinds are ${KINDS.join(", ")}`);
    kinds = new Set(list as TraceKind[]);
  }
  const only = q("autocraftOnly") === "1" || q("autocraftOnly") === "true";
  const repo = q("repo") ?? null;
  if (repo) await needVisible(db, req, repo);
  const cq = q("cursor");
  let cursor: { at: string; id: string } | null = null;
  if (cq) {
    const i = cq.indexOf("|");
    const at = i < 1 ? null : iso(cq.slice(0, i));
    if (!at) throw new HttpError(400, "bad cursor");
    cursor = { at, id: cq.slice(i + 1) };
  }
  const base = {
    db, staff: canSeeInternals(req), operator: req.user.role === "operator", hidden: await hiddenRepos(db, req), visible: await visibleRepos(db, req), repo,
    own: allOwnLogins(db),
  };
  const sources = SOURCES.filter((s) => s.kinds.some((k) => kinds.has(k)));
  const stamp = stampOf(db, sources, [[...kinds].sort(), only, repo, limit, base.staff, base.operator, base.visible]);
  // `since` applies to the first page; a later page is always read.
  if (!cursor && q("since") === stamp) return { unchanged: true, stamp };
  const { events, next } = page(base, sources, { kinds, only, repo, limit, cursor });
  const info = itemsOf(db, events);
  // Viewers get no model or failure text: quiet pull requests lose the model-written kinds, every summary is cut to its plain part.
  const quiet = base.staff ? new Set<string>() : quietFixPrs(db);
  const shown: typeof events = base.staff ? events : events.flatMap((e) => {
    const q = quiet.has(`${e.repo}#${e.number}`);
    if (q && VEILED_KINDS.includes(e.kind)) return [];
    const v = q ? veilEvent(e) : e;
    return [{ ...v, repo: e.repo, number: e.number, summary: plainSummary(v) }];
  });
  const out: ActivityEvent[] = shown.map(({ detail: _d, repo: r, number: n, ...e }) => ({ ...e, item: info.get(`${r}#${n}`)! }));
  return { events: out, nextCursor: next ? `${next.at}|${next.id}` : null, stamp };
}
