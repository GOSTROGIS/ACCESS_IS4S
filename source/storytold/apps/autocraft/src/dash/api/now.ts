// The Now page: what is wrong, what is running and what just happened, in one read.
// Every query leaves out repos the viewer cannot see, as the pipeline, agents and build endpoints do.
import type { DatabaseSync } from "node:sqlite";
import type { ItemRef, ItemShown, Now, NowEntry, NowFeed, NowHealth, NowProblem } from "../../../web/src/api/types.ts";
import { PRIVATE_STEPS_SQL } from "../../build/tasks.ts";
import { listAccounts } from "../../agents/accounts.ts";
import { jevEnabled, jevOutage } from "../../agents/jev.ts";
import { GITHUB_ACTIONS } from "../../github/actions.ts";
import { mainCiRepos } from "../../mainci/index.ts";
import { pipelineRepos } from "../../pilot.ts";
import { isQuiet } from "../../security/quiet.ts";
import { pipelineState } from "../../runner/autopilot.ts";
import { computeChecks } from "../../health-checks.ts";
import type { Req } from "../types.ts";
import { batchIdOf, clip, stepTitle, writeEvent } from "./trace.ts";
import { shownLookup } from "./shown.ts";
import { canSeeInternals } from "./staff.ts";
import { blankIfHidden, hiddenRepos } from "./visible.ts";
import { filtered, hiddenTest, isHiddenRepo, type HiddenRepos } from "../../hidden-sql.ts";
import { touchesHidden } from "../../agents/runs.ts";

const RECENT = 15;
type Feed = { entries: NowEntry[]; also: string[]; nextCursor: string | null };
const PER_KIND = 5;
const HOUR_MS = 3_600_000;
/** Jobs that never work on items; they show only in the "Also running" line. */
const QUIET_STEPS = new Set(["rank", "embed", "checks", "main-ci", "labels-ensure", "review-carry", "verify-collect", "fixissue-collect"]);
/** Writes that are bookkeeping, not something an operator follows. */
const HOUSEKEEPING = new Set(["assign", "unassign", "labels-apply", "label-create", "ci-run-approve", "ci-rerun", "fork-create", "fixissue-claim", "fixissue-unclaim"]);
/** One group of same-action writes by the same actor; a gap longer than this starts a new run of them. */
const GROUP_GAP_MS = 15 * 60_000;
/** Items listed per entry; the entry's `itemCount` is the true total. */
const ITEM_CAP = 200;
const GROUPED: Record<string, (n: number) => string> = {
  "Posted review": (n) => `Posted ${n} reviews`, "Edited review": (n) => `Edited ${n} reviews`, "Commented": (n) => `Commented on ${n} items`,
  "Edited comment": (n) => `Edited ${n} comments`, "Closed": (n) => `Closed ${n} items`, "Closed PR": (n) => `Closed ${n} PRs`, "Pushed": (n) => `Pushed to ${n} PRs`,
  "Opened PR": (n) => `Opened ${n} PRs`, "Opened issue": (n) => `Opened ${n} issues`,
};

type Item = ItemRef & ItemShown;
type Args = (string | number)[];
const all = <T>(db: DatabaseSync, sql: string, ...args: Args): T[] => db.prepare(sql).all(...args) as T[];
const minutes = (ms: number): string => (ms < 90 * 60_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / HOUR_MS)} h`);
const marks = (xs: unknown[]): string => xs.map(() => "?").join(",");
/** ` AND <col> is not hidden`, or nothing when no repo is filtered; its `?` arguments come from `hideArgs`. */
const notHidden = (col: string, hidden: HiddenRepos, nullOk = false): string =>
  filtered(hidden) ? ` AND (${nullOk ? `${col} IS NULL OR ` : ""}NOT (${hiddenTest(col, hidden).sql}))` : "";
const hideArgs = (hidden: HiddenRepos): string[] => (filtered(hidden) ? hiddenTest("x", hidden).args : []);

// ---- health ------------------------------------------------------------------

/** The health checks that are not ok, as the warnings list shows them; viewers get the short text and no checks of repos they cannot see. */
export function checkProblems(db: DatabaseSync, hidden: HiddenRepos, internals: boolean, nowMs: number): NowProblem[] {
  const area = (id: string): NowProblem["area"] =>
    id === "runner" ? "runner" : id.startsWith("deadline:") ? "deadline" : id === "liveness" ? "liveness" : id.startsWith("worker:") || id === "build-queue" ? "workers" : id === "accounts" ? "account" : "sync";
  return computeChecks(db, nowMs)
    .filter((c) => c.state !== "ok" && !(c.repo !== undefined && isHiddenRepo(hidden, c.repo)))
    .map((c) => ({ id: c.id, area: area(c.id), tone: c.state === "fail" ? "bad" : "warn", text: internals ? c.text : c.brief, to: c.to, since: c.since, ...(c.ackStep ? { ackStep: c.ackStep } : {}) }));
}

export async function healthOf(db: DatabaseSync, hidden: HiddenRepos, internals: boolean, nowMs: number): Promise<NowHealth> {
  const state = await pipelineState(db);
  const out: NowProblem[] = [];
  // Repos with the pipeline off are off by design; their red mains stay on the Main CI page.
  const on = pipelineRepos(db);
  const add = (p: NowProblem) => void out.push(p);

  if (!state.enabled) add({ id: "pipeline", area: "pipeline", tone: "warn", text: `Pipeline is ${state.draining ? "draining" : "off"}${state.changedBy ? `, switched ${state.draining ? "to drain" : "off"} by ${state.changedBy}` : ""}`, to: "/pipeline", since: state.changedAt });
  for (const p of checkProblems(db, hidden, internals, nowMs)) add(p);

  for (const t of all<{ stage: string; reason: string; tripped_at: string }>(db, "SELECT stage, reason, tripped_at FROM stage_trips WHERE active = 1 ORDER BY tripped_at")) {
    const why = blankIfHidden(t.reason, hidden);
    add({ id: `breaker:${t.stage}`, area: "breaker", tone: "bad", text: `${stepTitle(t.stage)} is stopped by its breaker${why ? `: ${clip(why, 120)}` : ""}`, to: "/pipeline", since: t.tripped_at });
  }
  for (const l of state.limits) {
    if (l.perDay === 0 && !l.tripped) add({ id: `limit:${l.step}`, area: "limit", tone: "warn", text: `${l.title} is paused (limit 0 a day)`, to: "/pipeline", since: null });
  }

  for (const a of listAccounts(db).filter((x) => x.enabled)) {
    if (a.auth.loggedIn === false) add({ id: `account:${a.id}`, area: "account", tone: "bad", text: `Account ${a.label} is signed out`, to: "/accounts", since: null });
    else if (a.pausedReason) add({ id: `account:${a.id}`, area: "account", tone: "warn", text: `Account ${a.label} is paused${blankIfHidden(a.pausedReason, hidden) ? `: ${clip(a.pausedReason, 100)}` : ""}`, to: "/accounts", since: null });
  }
  const outage = jevEnabled(db) ? jevOutage(db) : null;
  if (outage) add({ id: "jev", area: "jev", tone: "warn", text: `Jev is unavailable: ${clip(outage.reason, 100)}`, to: "/accounts", since: outage.since });

  for (const r of mainCiRepos(db, hidden).filter((x) => x.state === "red" && on.has(x.repo))) {
    const names = r.failing.map((f) => f.name).slice(0, 2).join(", ");
    add({ id: `main-ci:${r.repo}`, area: "main-ci", tone: "bad", text: `Main is red in ${r.repo}${names ? `: ${names}` : ""}`, to: "/main-ci", since: r.redSince });
  }

  const since = new Date(nowMs - HOUR_MS).toISOString();
  const onList = [...on];
  const failed = all<{ step: string; n: number }>(db, `SELECT step, COUNT(*) AS n FROM jobs WHERE state = 'failed' AND ended_at > ?${notHidden("repo", hidden, true)}${onList.length ? ` AND (repo IS NULL OR repo IN (${marks(onList)}))` : " AND repo IS NULL"} GROUP BY step ORDER BY n DESC`, since, ...hideArgs(hidden), ...onList);
  const nFailed = failed.reduce((a, f) => a + f.n, 0);
  if (nFailed) {
    const steps = failed.slice(0, 3).map((f) => stepTitle(f.step)).join(", ");
    add({ id: "jobs", area: "jobs", tone: "warn", text: `${nFailed} job${nFailed === 1 ? "" : "s"} failed in the last hour: ${steps}${failed.length > 3 ? " and more" : ""}`, to: "/pipeline", since: null });
  }

  return { pipeline: { enabled: state.enabled, by: state.changedBy, at: state.changedAt }, problems: out };
}

// ---- the feed ----------------------------------------------------------------
// One list of units of work, newest started first: a job on its items, a merge, a posted review, a decision, a failure. A job
// is the same entry while it runs and after it ends; the GitHub writes made on its items during its run attach to it.

/** Rows read from each source per page; a source that fills it bounds how far back the merged page is complete. */
const SCAN = 100;
const WRITE_SLACK_MS = 2 * 60_000;

/** Audit actions of a merge batch that are not GitHub writes on an item, with their labels. */
const BATCH_ACTIONS: Record<string, string> = { "batch-stop": "stopped", "batch-hold": "PR held", "batch-remove": "PR removed", "batch-merged-after-end": "merged after it ended" };
const BATCH_LABELS: Record<string, string> = { ...BATCH_ACTIONS, "batch-push": "pushed", "batch-pr": "pull request opened", "batch-pr-close": "PR closed" };

const refOf = (target: string | null): { repo: string; number: number } | null => {
  const m = /^(.+)#(\d+)$/.exec(target ?? "");
  return m ? { repo: m[1]!, number: Number(m[2]) } : null;
};

type Write = { at: string; action: string; label: string; item: Item; key: string; summary: string; login: string };
const lines = (ws: Write[]): { summary: string; items: Item[]; more: number }[] => {
  const by = new Map<string, Write[]>();
  for (const w of ws) (by.get(w.label) ?? by.set(w.label, []).get(w.label)!).push(w);
  return [...by].map(([label, list]) => {
    const distinct = [...new Map(list.map((w) => [`${w.item.repo}#${w.item.number}`, w.item])).values()];
    const verb = GROUPED[label];
    return { summary: list.length > 1 ? (verb ? verb(list.length) : `${label} ${list.length} times`) : list[0]!.summary, items: distinct.slice(0, ITEM_CAP), more: Math.max(0, distinct.length - ITEM_CAP) };
  });
};

function feed(db: DatabaseSync, hidden: HiddenRepos, staff: boolean, before: string | null, nowMs: number): Feed {
  const shown = shownLookup(db);
  const item = (repo: string, number: number): Item => ({ repo, number, ...shown(repo, number) });
  const cut = (col: string): string => (before ? ` AND ${col} < ?` : "");
  const when: string[] = before ? [before] : [];
  let completeFrom = "";
  // A source that returned a full scan may hold older rows than it showed, so the page stops at the newest such bound.
  const bound = (rows: { at: string }[]) => {
    if (rows.length < SCAN) return;
    const oldest = rows.reduce((m, r) => (r.at < m ? r.at : m), rows[0]!.at);
    if (oldest > completeFrom) completeFrom = oldest;
  };
  const oldestOf = new Map<NowEntry, string>();
  const base = (e: Pick<NowEntry, "key" | "kind" | "state" | "at" | "title"> & Partial<NowEntry>): NowEntry => ({
    ids: [e.key], batchId: null, endedAt: null, repo: null, items: [], more: 0, what: null, summary: null, progress: null, actor: "AutoCraft", item: null, itemCount: 0, event: null, detail: null, writes: [], children: [], ...e,
  });
  const out: NowEntry[] = [];
  const also: string[] = [];

  // Writes: audit rows and merges that are not bookkeeping. Each goes to the job that worked on its item at that time, else it stands alone.
  const writes: Write[] = [];
  const actions = [...Object.keys(GITHUB_ACTIONS).filter((a) => a !== "merge" && !HOUSEKEEPING.has(a)), ...(staff ? Object.keys(BATCH_ACTIONS) : [])];
  // Events of a merge batch (details.batch, or a `repo:branch` target) show as one row per batch and action, linking to the batch page.
  const batchEvents = new Map<string, { id: number; repo: string; action: string; at: string; oldest: string; key: string }>();
  const audit = all<{ rowid: number; at: string; login: string; action: string; target: string | null; details: string | null }>(db,
    `SELECT rowid, at, login, action, target, details FROM audit WHERE action IN (${marks(actions)})${cut("at")} ORDER BY at DESC LIMIT ?`, ...actions, ...when, SCAN);
  bound(audit);
  for (const a of audit) {
    let branch: string | null = null;
    try { const b = (JSON.parse(a.details ?? "{}") as { batch?: unknown }).batch; if (typeof b === "string") branch = b; } catch { /* no batch */ }
    const t = /^(.+):([^#:]+)$/.exec(a.target ?? "");
    const ref = refOf(a.target);
    const repo = ref?.repo ?? t?.[1] ?? null;
    if (t && !ref) branch = t[2]!;
    const bid = repo && branch ? batchIdOf(db, repo, branch) : undefined;
    if (repo && isHiddenRepo(hidden, repo)) continue;
    if (bid !== undefined && repo) {
      const k = `${bid}:${a.action}`;
      const cur = batchEvents.get(k);
      if (cur) cur.oldest = a.at < cur.oldest ? a.at : cur.oldest;
      else batchEvents.set(k, { id: bid, repo, action: a.action, at: a.at, oldest: a.at, key: `batch-event:${bid}:${a.action}:${a.rowid}` });
      continue;
    }
    if (!ref || a.action in BATCH_ACTIONS) continue;
    const e = writeEvent(a, staff);
    writes.push({ at: a.at, action: a.action, label: GITHUB_ACTIONS[a.action]!, item: item(ref.repo, ref.number), key: e.id, summary: e.summary, login: a.login });
  }
  const merges = all<{ rowid: number; repo: string; number: number; at: string; path: string; method: string | null }>(db,
    `SELECT rowid, repo, number, at, path, method FROM merges WHERE outcome = 'merged'${notHidden("repo", hidden)}${cut("at")} ORDER BY at DESC LIMIT ?`, ...hideArgs(hidden), ...when, SCAN);
  bound(merges);
  for (const m of merges) {
    writes.push({ at: m.at, action: "merge", label: "Merged", item: item(m.repo, m.number), key: `merge:${m.rowid}`, login: "AutoCraft",
      summary: `Merged${m.method ? ` (${m.method})` : ""}${m.path === "operator" ? " after an answered decision" : " by rule"}` });
  }
  writes.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.key < b.key ? 1 : -1));

  // Jobs. Running ones always show on the first page; finished ones by start time.
  type JobRow = { id: number; step: string; state: string; at: string; ended_at: string | null; progress: string | null; summary: string | null; error: string | null; repo: string | null; items: number | null; acted: number | null };
  const jobCols = "id, step, state, COALESCE(started_at, requested_at) AS at, ended_at, progress, summary, error, repo, items, acted";
  const running = all<JobRow>(db, `SELECT ${jobCols} FROM jobs WHERE state = 'running'${notHidden("repo", hidden, true)}${cut("COALESCE(started_at, requested_at)")} ORDER BY id DESC`, ...hideArgs(hidden), ...when);
  const finished = all<JobRow>(db, `SELECT ${jobCols} FROM jobs WHERE state IN ('done', 'failed') AND started_at IS NOT NULL${notHidden("repo", hidden, true)}${cut("started_at")} ORDER BY started_at DESC LIMIT ?`, ...hideArgs(hidden), ...when, SCAN);
  bound(finished);
  const jobEntries = new Map<number, { entry: NowEntry; its: Set<string>; from: number; to: number }>();
  for (const j of [...running, ...finished]) {
    const live = j.state === "running";
    if (QUIET_STEPS.has(j.step) && j.state !== "failed") {
      if (live && !also.includes(stepTitle(j.step))) also.push(stepTitle(j.step));
      continue;
    }
    const its = all<{ id: number; repo: string; number: number }>(db, `SELECT id, repo, number FROM job_items WHERE job_id = ?${notHidden("repo", hidden)} ORDER BY id`, j.id, ...hideArgs(hidden));
    const idle = !its.length && !j.items && !j.acted;
    const e = base({
      key: `job:${j.id}`, kind: "job", state: live ? "running" : j.state === "failed" ? "failed" : "done", at: j.at, endedAt: j.ended_at, title: stepTitle(j.step),
      // A job without a repo works across repos: its texts name no item of a repo hidden from the reader.
      summary: live ? null : j.state === "failed" ? (staff && j.error ? clip(blankIfHidden(j.error, hidden) || "failed", 100) : null) : blankIfHidden(j.summary, hidden) || null,
      progress: live ? blankIfHidden(j.progress, hidden) || null : null,
      item: its[0] ? item(its[0].repo, its[0].number) : null, items: its.slice(0, ITEM_CAP).map((i) => item(i.repo, i.number)), itemCount: its.length, repo: j.repo,
      event: its[0] ? `job:${its[0].id}` : null, detail: `/pipeline/${j.id}`,
    });
    if (!live && idle && j.state !== "failed") continue;
    jobEntries.set(j.id, { entry: e, its: new Set(its.map((i) => `${i.repo}#${i.number}`)), from: Date.parse(j.at), to: live ? nowMs : Date.parse(j.ended_at ?? j.at) });
    out.push(e);
  }

  const hiddenRuns = filtered(hidden) ? ` AND ${touchesHidden(hidden).sql}` : "";
  const placeChild = (jobId: number | null, e: NowEntry) => {
    const parent = jobId === null ? undefined : jobEntries.get(jobId);
    if (parent && parent.entry.state === "running") parent.entry.children.push(e);
    else if (jobId === null || !parent) out.push(e);
  };
  // Calls and build tasks nest under a running job; those without a job stand alone.
  if (!before) {
    for (const r of all<{ id: number; job_id: number | null; step: string; model: string; provider: string; label: string | null; started_at: string; progress: string | null; item_count: number }>(db,
      `SELECT r.id, r.job_id, r.step, r.model, r.provider, COALESCE(a.label, r.account_id) AS label, r.started_at, r.progress, r.item_count
       FROM agent_runs r LEFT JOIN claude_accounts a ON a.id = r.account_id WHERE r.state = 'running'${hiddenRuns} ORDER BY r.id`, ...hideArgs(hidden))) {
      const its = all<{ repo: string; number: number }>(db, "SELECT repo, number FROM agent_run_items WHERE run_id = ? ORDER BY repo, number LIMIT ?", r.id, PER_KIND);
      placeChild(r.job_id, base({
        key: `run:${r.id}`, kind: "call", state: "running", at: r.started_at, title: stepTitle(r.step), what: r.provider === "jev" ? "Jev" : `${r.model} on ${r.label ?? "an unknown account"}`, progress: r.progress,
        item: its[0] ? item(its[0].repo, its[0].number) : null, items: its.map((i) => item(i.repo, i.number)), itemCount: Math.max(r.item_count, its.length), event: its[0] ? `run:${r.id}` : null, detail: `/agents/${r.id}`,
      }));
    }
    for (const t of all<{ id: number; job_id: number | null; step: string; repo: string; number: number | null; state: string; queued_at: string; started_at: string | null; summary: string | null; label: string | null }>(db,
      `SELECT t.id, t.job_id, t.step, t.repo, t.number, t.state, t.queued_at, t.started_at, t.summary, e.label FROM build_tasks t LEFT JOIN build_envs e ON e.id = t.env_id
       WHERE t.state IN ('queued', 'claimed', 'running')${notHidden("t.repo", hidden)}${staff ? "" : ` AND t.step NOT IN (${PRIVATE_STEPS_SQL})`} ORDER BY t.id`, ...hideArgs(hidden))) {
      const one = t.number === null ? null : item(t.repo, t.number);
      placeChild(t.job_id, base({
        key: `task:${t.id}`, kind: "task", state: t.state === "queued" ? "queued" : "running", at: t.started_at ?? t.queued_at, title: `Build task, ${stepTitle(t.step)}`, what: t.label, progress: t.summary,
        item: one, items: one ? [one] : [], itemCount: one ? 1 : 0, event: one ? `task:${t.id}` : null, detail: `/envs/${t.id}`,
      }));
    }
    for (const b of all<{ id: number; repo: string; branch: string; state: string; created_at: string; summary: string | null }>(db,
      `SELECT id, repo, branch, state, created_at, summary FROM merge_batches WHERE state IN ('checking', 'open')${notHidden("repo", hidden)} ORDER BY id DESC`, ...hideArgs(hidden))) {
      const prs = all<{ number: number }>(db, "SELECT number FROM merge_batch_prs WHERE batch_id = ? ORDER BY position", b.id);
      out.push(base({
        key: `batch:${b.id}`, kind: "batch", state: b.state === "checking" ? "running" : "queued", at: b.created_at, title: "Integration batch", what: b.branch, progress: b.summary,
        item: prs[0] ? item(b.repo, prs[0].number) : null, items: prs.slice(0, ITEM_CAP).map((p) => item(b.repo, p.number)), itemCount: prs.length, repo: b.repo, batchId: b.id, detail: "/queue/merge",
      }));
    }
  }

  // Writes onto jobs, the rest as rows of their own: consecutive writes of one action by one actor become one row.
  const loose: Write[] = [];
  const attached = new Map<NowEntry, Write[]>();
  for (const w of writes) {
    const t = Date.parse(w.at);
    const key = `${w.item.repo}#${w.item.number}`;
    const owner = [...jobEntries.values()].find((j) => j.its.has(key) && t >= j.from - WRITE_SLACK_MS && t <= j.to + WRITE_SLACK_MS);
    if (owner) {
      owner.entry.ids.push(w.key);
      (attached.get(owner.entry) ?? attached.set(owner.entry, []).get(owner.entry)!).push(w);
    } else loose.push(w);
  }
  for (const [e, ws] of attached) e.writes = lines(ws);
  let g: { w: Write; list: Write[]; last: number } | null = null;
  const groups: { w: Write; list: Write[] }[] = [];
  for (const w of loose) {
    const t = Date.parse(w.at);
    if (g && g.w.action === w.action && g.w.login === w.login && g.last - t <= GROUP_GAP_MS) { g.list.push(w); g.last = t; }
    else { g = { w, list: [w], last: t }; groups.push(g); }
  }
  for (const grp of groups) {
    const w = grp.w;
    const e = base({
      key: w.key, ids: grp.list.map((x) => x.key), kind: grp.list.length > 1 || w.action !== "merge" ? "write" : "merge", state: "done", at: w.at, title: lines(grp.list)[0]!.summary,
      actor: w.login === "AutoCraft" || w.action === "merge" ? "AutoCraft" : staff ? w.login : "AutoCraft", item: w.item, items: [w.item], itemCount: 1, event: w.key,
    });
    if (grp.list.length > 1) { const l = lines(grp.list)[0]!; e.items = l.items; e.more = l.more; e.itemCount = l.items.length + l.more; }
    oldestOf.set(e, grp.list[grp.list.length - 1]!.at);
    out.push(e);
  }

  for (const ev of batchEvents.values()) {
    const prs = all<{ number: number }>(db, "SELECT number FROM merge_batch_prs WHERE batch_id = ? ORDER BY position", ev.id);
    const e = base({
      key: ev.key, kind: "batch", state: "done", at: ev.at, repo: ev.repo, batchId: ev.id, actor: "AutoCraft",
      title: `Merge batch #${ev.id}: ${prs.length} PR${prs.length === 1 ? "" : "s"}, ${BATCH_LABELS[ev.action] ?? ev.action}`,
      item: prs[0] ? item(ev.repo, prs[0].number) : null, items: prs.slice(0, ITEM_CAP).map((p) => item(ev.repo, p.number)), itemCount: prs.length,
    });
    oldestOf.set(e, ev.oldest);
    out.push(e);
  }

  const decisions = all<{ id: string; repo: string | null; number: number | null; items: string | null; question: string; answer: string | null; at: string; answered_by: string | null }>(db,
    `SELECT id, repo, number, items, question, answer, answered_at AS at, answered_by FROM decisions WHERE answered_at IS NOT NULL${cut("answered_at")} ORDER BY answered_at DESC LIMIT ?`, ...when, SCAN);
  bound(decisions);
  for (const d of decisions) {
    let ref: { repo: string; number: number } | null = d.repo && d.number !== null ? { repo: d.repo, number: d.number } : null;
    let repos = d.repo ? [d.repo] : [];
    // The question of a quiet pull request's decision is model-written text about an unpublished fix.
    let quiet = !!ref && isQuiet(db, ref.repo, ref.number);
    if (!ref) {
      try {
        const list = (JSON.parse(d.items ?? "[]") as { repo?: unknown; number?: unknown }[]).filter((i): i is { repo: string; number: number } => typeof i.repo === "string" && typeof i.number === "number");
        repos = [...repos, ...list.map((i) => i.repo)];
        ref = list[0] ?? null;
        quiet = list.some((i) => isQuiet(db, i.repo, i.number));
      } catch { /* malformed: no item */ }
    }
    if (repos.some((r) => isHiddenRepo(hidden, r))) continue;
    out.push(base({
      key: `decision:${d.id}`, kind: "decision", state: "done", at: d.at, repo: d.repo ?? ref?.repo ?? null, title: `Answered ${quiet && !staff ? "a question" : `"${clip(d.question, 80)}"`}: ${d.answer ?? ""}`, actor: d.answered_by || "unknown",
      item: ref && item(ref.repo, ref.number), items: ref ? [item(ref.repo, ref.number)] : [], itemCount: ref ? 1 : 0, event: d.number !== null && d.repo ? `decision:${d.id}:answered` : null, detail: `/decisions/${encodeURIComponent(d.id)}`,
    }));
  }

  // Failed calls and tasks of a job show on the job; only those without one stand alone.
  const runs = all<{ id: number; step: string; model: string; at: string; error: string | null }>(db,
    `SELECT r.id, r.step, r.model, COALESCE(r.ended_at, r.started_at) AS at, r.error FROM agent_runs r WHERE r.state = 'failed' AND r.job_id IS NULL${hiddenRuns}${cut("COALESCE(r.ended_at, r.started_at)")} ORDER BY at DESC LIMIT ?`, ...hideArgs(hidden), ...when, SCAN);
  bound(runs);
  for (const r of runs) {
    const i = db.prepare("SELECT repo, number FROM agent_run_items WHERE run_id = ? ORDER BY repo, number LIMIT 1").get(r.id) as { repo: string; number: number } | undefined;
    out.push(base({ key: `failed-run:${r.id}`, kind: "failure", state: "failed", at: r.at, actor: r.model, item: i ? item(i.repo, i.number) : null, event: i ? `run:${r.id}` : null, detail: `/agents/${r.id}`,
      title: `${stepTitle(r.step)}: model call failed${r.error && staff ? `, ${clip(r.error, 100)}` : ""}` }));
  }
  const tasks = all<{ id: number; step: string; repo: string; number: number | null; state: string; at: string; summary: string | null }>(db,
    `SELECT id, step, repo, number, state, COALESCE(ended_at, queued_at) AS at, summary FROM build_tasks WHERE state IN ('failed', 'lost') AND job_id IS NULL${staff ? "" : ` AND step NOT IN (${PRIVATE_STEPS_SQL})`}${notHidden("repo", hidden)}${cut("COALESCE(ended_at, queued_at)")} ORDER BY at DESC LIMIT ?`, ...hideArgs(hidden), ...when, SCAN);
  bound(tasks);
  for (const t of tasks) {
    out.push(base({ key: `failed-task:${t.id}`, kind: "failure", state: "failed", at: t.at, repo: t.repo, item: t.number === null ? null : item(t.repo, t.number), event: t.number === null ? null : `task:${t.id}`, detail: `/envs/${t.id}`,
      title: `Build task (${stepTitle(t.step)}) ${t.state}${t.summary ? `: ${clip(t.summary, 100)}` : ""}` }));
  }

  // A job that has just started has nothing to show yet.
  const bare = (e: NowEntry) => e.kind === "job" && e.state === "running" && !e.itemCount && !e.progress && !e.children.length;
  const live = out.filter((e) => (e.state === "running" || e.state === "queued") && !bare(e));
  const rest = out.filter((e) => e.state !== "running" && e.state !== "queued" && e.at >= completeFrom).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.key < b.key ? 1 : -1)).slice(0, RECENT);
  const page = [...live, ...rest].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.key < b.key ? 1 : -1));
  // The next page starts before the oldest entry shown (all members of a group count), or before the bound when nothing is complete yet.
  const last = rest[rest.length - 1];
  const more = rest.length === RECENT || completeFrom !== "";
  return { entries: page, also, nextCursor: more ? (last ? (oldestOf.get(last) ?? last.at) : completeFrom) : null };
}

/** One page of the feed older than `before`, for infinite scroll. */
export async function nowFeed(db: DatabaseSync, req: Req): Promise<NowFeed> {
  const before = req.query.get("before");
  const { entries, nextCursor } = feed(db, await hiddenRepos(db, req), canSeeInternals(req), before && !Number.isNaN(Date.parse(before)) ? before : null, Date.now());
  return { entries, nextCursor };
}

export async function now(db: DatabaseSync, req: Req): Promise<Now> {
  const hidden = await hiddenRepos(db, req);
  const nowMs = Date.now();
  const f = feed(db, hidden, canSeeInternals(req), null, nowMs);
  return { health: await healthOf(db, hidden, canSeeInternals(req), nowMs), alsoRunning: f.also, entries: f.entries, nextCursor: f.nextCursor };
}
