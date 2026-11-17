// Counts for the flowchart (docs/dashboard-spec.md, Flow), one node at a time,
// for one repo or every tracked repo. Each count uses the rule of the stage it
// describes: settled labels (src/classify/settled.ts) and the cached Plans
// (item_plans, src/core/plan-read.ts) for every count of what is due or queued.
//
// Counts are flat keys that add up across repos:
//   "<node>.<branch>"         items in a branch
//   "<node>.total"            items in the node
//   "<node>.recent.<label>"   movement in the last 24 hours
//   "edge.<from>.<to>"        items on an edge
//   "x.<name>"                other facts (open decisions, approved repos, ...)
// Keys starting "max." are combined with max, not summed, when repos add up.
// Item-backed branches also return their refs ("repo#n") for the Items
// browser's flow filter.
import type { DatabaseSync } from "node:sqlite";
import { latestRun, settledTable } from "../classify/settled.ts";
import { isScope } from "../decide/select.ts";
import { cachedQueue, dueActions, dueRefs } from "../core/plan-read.ts";
import type { QueueState } from "../core/plan.ts";
import { commentApprovalOf } from "../act/approval.ts";
import { fixIssueApprovalOf } from "../fixissue/approval.ts";
import { approvalOf } from "../labels/approval.ts";
import { mergeApprovalOf } from "../merge/approval.ts";
import { pendingDefects } from "../postmerge/select.ts";
import { trackedNames } from "../repos.ts";
import { scopeAnswers } from "../review/candidates.ts";

export type Counts = Record<string, number>;
export type Refs = Set<string>;
export type NodeCount = { counts: Counts; members: Map<string, Refs> };

const DAY = 24 * 3600_000;
const ref = (r: { repo: string; number: number }) => `${r.repo}#${r.number}`;

/** Scope answers the step that applies them reads (docs/pipeline.md, Decide). */
export const SCOPE_ANSWERS = ["take", "small-extra", "plugin", "close", "need-info", "backlog"] as const;
export const VERDICTS = ["take", "take-fix", "hold", "close"] as const;

type OpenRow = { repo: string; number: number; kind: string; status: string | null; referee_sure: number | null; jev_label: string | null; haiku_label: string | null };

/** What the node counters share for one repo (or all repos) on one connection. */
export class Ctx {
  readonly since: string;
  readonly rp: Record<string, string>;
  private openRows?: OpenRow[];
  private openSet?: Refs;
  private answers?: Map<string, string>;
  readonly db: DatabaseSync;
  readonly repo: string | null;
  /** The classification run every counter uses, resolved once. */
  readonly run: string | null;
  constructor(db: DatabaseSync, repo: string | null, now = Date.now(), run: string | null = latestRun(db)) {
    this.run = run;
    this.db = db;
    this.repo = repo;
    this.since = new Date(now - DAY).toISOString();
    this.rp = repo ? { repo } : {};
  }
  andRepo(col = "repo"): string {
    return this.repo ? `AND ${col} = :repo` : "";
  }
  /** Restricts a query on `col` to the repo, or to the tracked repos. */
  tracked(col = "repo"): string {
    return this.repo ? `AND ${col} = :repo` : `AND ${col} IN (SELECT name FROM main.tracked_repos)`;
  }
  repos(): string[] {
    return this.repo ? [this.repo] : trackedNames(this.db);
  }
  /** Rows of `repo, number` as refs. */
  refs(sql: string, params: Record<string, string> = {}): Refs {
    return new Set((this.db.prepare(sql).all({ ...this.rp, ...params }) as { repo: string; number: number }[]).map(ref));
  }
  inRepo(k: string): boolean {
    return !this.repo || k.startsWith(`${this.repo}#`);
  }
  n(sql: string, params: Record<string, string> = {}): number {
    return (this.db.prepare(sql).get({ ...this.rp, ...params }) as { n: number }).n;
  }
  /** Every open item with its settled status in the current run. */
  open(): OpenRow[] {
    if (!this.openRows) {
      settledTable(this.db, this.run);
      this.openRows = this.db.prepare(`SELECT i.repo, i.number, i.kind, s.status, s.referee_sure, s.jev_label, s.haiku_label FROM items i
        LEFT JOIN temp.item_settled s ON s.repo = i.repo AND s.number = i.number
        WHERE i.state = 'OPEN' ${this.andRepo("i.repo")}`).all(this.rp) as OpenRow[];
    }
    return this.openRows;
  }
  openRefs(): Refs {
    return (this.openSet ??= new Set(this.open().map(ref)));
  }
  scopeAnswers(): Map<string, string> {
    return (this.answers ??= scopeAnswers(this.db));
  }
  /** Items created or closed since `since`. Over every repo the named date index reads only the last day; for one repo its own rows are fewer. */
  recentItems(col: "created_at" | "closed_at"): number {
    const extra = col === "closed_at" ? "AND state <> 'OPEN'" : "";
    if (this.repo) return this.n(`SELECT COUNT(*) AS n FROM main.items WHERE repo = :repo AND ${col} >= :since ${extra}`, { since: this.since });
    const idx = col === "created_at" ? "items_created" : "items_closed";
    return this.n(`SELECT COUNT(*) AS n FROM main.items INDEXED BY ${idx} WHERE ${col} >= :since ${extra}
      AND repo IN (SELECT name FROM main.tracked_repos)`, { since: this.since });
  }
}

function synced(c: Ctx): NodeCount {
  const open = c.open();
  const prs = open.filter((r) => r.kind === "pr").length;
  return {
    counts: {
      "synced.issues": open.length - prs, "synced.prs": prs, "synced.total": open.length,
      "synced.recent.new": c.recentItems("created_at"), "synced.recent.closed": c.recentItems("closed_at"),
      "edge.synced.dupes": open.length,
    },
    members: new Map(),
  };
}

function classify(c: Ctx): NodeCount {
  const members = new Map<string, Refs>(["settled", "waiting", "referee", "disagree", "unclassified"].map((k) => [`classify.${k}`, new Set()]));
  const by: Counts = { settled: 0, waiting: 0, referee: 0, disagree: 0, unclassified: 0 };
  for (const r of c.open()) {
    // A label disagreement waits on the referee (Sonnet, then Opus when Sonnet is unsure); scope-vs-scope goes to Decide.
    const toReferee = r.status === "disagree" && !(isScope(r.jev_label) && isScope(r.haiku_label));
    const k = toReferee ? "referee" : (r.status ?? "unclassified");
    by[k]!++;
    members.get(`classify.${k}`)!.add(ref(r));
  }
  const run = c.run;
  const recent = run ? c.n(`SELECT COUNT(*) AS n FROM main.classifications INDEXED BY classifications_run WHERE run_id = :run AND (classifier = 'jev' OR (classifier = 'haiku' AND input_hash IS NOT NULL)) AND at >= :since
      AND repo IN (SELECT name FROM main.tracked_repos) ${c.andRepo()}`, { run, since: c.since }) : 0;
  return {
    counts: {
      ...Object.fromEntries(Object.entries(by).map(([k, v]) => [`classify.${k}`, v])),
      "classify.total": c.open().length, "classify.recent.classified": recent, "edge.decide.labels": by.settled!, "edge.classify.priority": c.open().length,
    },
    members,
  };
}

function decide(c: Ctx): NodeCount {
  const rows = c.db.prepare(`SELECT repo, number, items, answer, asked_at, answered_at FROM decisions WHERE kind = 'scope'`).all() as
    { repo: string | null; number: number | null; items: string | null; answer: string | null; asked_at: string; answered_at: string | null }[];
  const openRefs = c.openRefs();
  const waiting: Refs = new Set();
  let openDecisions = 0, asked = 0, answered = 0;
  for (const d of rows) {
    let refs: string[] = [];
    if (d.number !== null) refs = [`${d.repo}#${d.number}`];
    else try { refs = (JSON.parse(d.items ?? "[]") as { repo: string; number: number }[]).map(ref); } catch { /* malformed batch */ }
    refs = refs.filter((r) => c.inRepo(r));
    if (!refs.length) continue;
    if (d.asked_at >= c.since) asked++;
    if (d.answered_at && d.answered_at >= c.since) answered++;
    if (d.answer !== null) continue;
    openDecisions++;
    for (const r of refs) if (openRefs.has(r)) waiting.add(r);
  }
  const byAnswer = new Map<string, Refs>(SCOPE_ANSWERS.map((a) => [a, new Set()]));
  for (const [r, a] of c.scopeAnswers()) if (openRefs.has(r) && !waiting.has(r) && c.inRepo(r)) byAnswer.get(a)?.add(r);
  const notAsked = dueRefs(c.db, "decide", { bucket: "new", ...(c.repo ? { repo: c.repo } : {}) });
  const members = new Map<string, Refs>([["decide.not-asked", notAsked], ["decide.open", waiting], ...[...byAnswer].map(([k, v]) => [`decide.${k}`, v] as [string, Refs])]);
  const total = [...members.values()].reduce((a, s) => a + s.size, 0);
  return {
    counts: {
      ...Object.fromEntries([...members].map(([k, v]) => [k, v.size])),
      "decide.total": total, "decide.recent.asked": asked, "decide.recent.answered": answered,
      "x.openDecisions": openDecisions, "edge.classify.decide": total, "edge.priority.decide": c.open().length,
    },
    members,
  };
}

function review(c: Ctx): NodeCount {
  const candidates = dueRefs(c.db, "review", c.repo ? { repo: c.repo } : {});
  const last = c.db.prepare(`WITH last AS (SELECT repo, number, verdict, ROW_NUMBER() OVER (PARTITION BY repo, number ORDER BY at DESC, head_oid DESC) AS k
      FROM final_reviews WHERE 1 ${c.andRepo()})
    SELECT l.repo, l.number, l.verdict FROM last l JOIN items i ON i.repo = l.repo AND i.number = l.number
    WHERE l.k = 1 AND i.state = 'OPEN'`).all(c.rp) as { repo: string; number: number; verdict: string }[];
  // A PR waiting for a review at its new head counts there, not under its old verdict.
  const by = new Map<string, Refs>(VERDICTS.map((v) => [v, new Set()]));
  for (const r of last) if (!candidates.has(ref(r))) by.get(r.verdict)?.add(ref(r));
  const members = new Map<string, Refs>([["review.not-reviewed", candidates], ...[...by].map(([k, v]) => [`review.${k}`, v] as [string, Refs])]);
  const all = [...members.values()].flatMap((s) => [...s]);
  const takeFix = by.get("take-fix")!.size;
  return {
    counts: {
      ...Object.fromEntries([...members].map(([k, v]) => [k, v.size])),
      "review.total": all.length,
      "review.recent.reviewed": c.n(`SELECT COUNT(*) AS n FROM final_reviews WHERE at >= :since ${c.andRepo()}`, { since: c.since }),
      "edge.labels.review": all.length, "edge.review.verify": by.get("take")!.size, "edge.review.fixup": takeFix,
    },
    members,
  };
}

/** Verification states shown as branches of the Verify node; `stale` ones are not counted. */
export const VERIFY_BRANCHES = ["planned", "running", "passed", "ci-enough", "failed", "error"] as const;

function verify(c: Ctx): NodeCount {
  const by = new Map<string, Refs>([["verify.waiting", new Set()], ...VERIFY_BRANCHES.map((s) => [`verify.${s}`, new Set()] as [string, Refs])]);
  const tracked = new Set(c.repos());
  for (const p of dueActions(c.db, "verify", { ...(c.repo ? { repo: c.repo } : {}), bucket: "plan" }))
    if (tracked.has(p.repo)) by.get("verify.waiting")!.add(ref(p));
  // Verifications at the open PR's current head (same head rule as the queue); primary-key joins, no scan of closed PRs' rows.
  const rows = c.db.prepare(`SELECT v.repo, v.number, v.state FROM main.verifications v
    JOIN main.items i ON i.repo = v.repo AND i.number = v.number AND i.state = 'OPEN'
    LEFT JOIN main.pr_checks c ON c.repo = v.repo AND c.number = v.number
    WHERE v.state <> 'stale' AND v.repo IN (SELECT name FROM main.tracked_repos) ${c.andRepo("v.repo")}
      AND v.head_sha = COALESCE(CASE WHEN c.fetched_at IS NOT NULL AND (i.updated_at IS NULL OR c.fetched_at > i.updated_at) THEN c.head_oid END, i.head_oid, c.head_oid)`)
    .all(c.rp) as { repo: string; number: number; state: string }[];
  for (const r of rows) by.get(`verify.${r.state}`)?.add(ref(r));
  const total = [...by.values()].reduce((a, s) => a + s.size, 0);
  const passing = by.get("verify.passed")!.size + by.get("verify.ci-enough")!.size;
  return {
    counts: {
      ...Object.fromEntries([...by].map(([k, v]) => [k, v.size])),
      "verify.total": total,
      "verify.recent.finished": c.n(`SELECT COUNT(*) AS n FROM main.verifications INDEXED BY verifications_finished WHERE finished_at >= :since
        AND state IN ('passed', 'ci-enough', 'failed', 'error') AND repo IN (SELECT name FROM main.tracked_repos) ${c.andRepo()}`, { since: c.since }),
      "edge.verify.merge": passing,
    },
    members: by,
  };
}

function merge(c: Ctx): NodeCount {
  const tracked = new Set(trackedNames(c.db));
  const queue = cachedQueue(c.db, c.repo ? { repo: c.repo } : {}).filter((e) => tracked.has(e.repo));
  const approvedRepos = new Set([...new Set(queue.map((e) => e.repo))].filter((r) => mergeApprovalOf(c.db, r)));
  const ready = queue.filter((e) => e.eligible);
  const since = { since: c.since };
  const of = (...states: QueueState[]): Refs => new Set(queue.filter((e) => states.includes(e.state)).map(ref));
  const members = new Map<string, Refs>([
    ["merge.eligible", new Set(ready.filter((e) => approvedRepos.has(e.repo)).map(ref))],
    ["merge.unapproved", new Set(ready.filter((e) => !approvedRepos.has(e.repo)).map(ref))],
    ["merge.in-batch", of("batch-checking", "in-batch")],
    ["merge.batch-failed", of("batch-failed")],
    ["merge.needs-decision", of("needs-decision", "held-duplicate", "held-backlog")],
    ["merge.waiting-ci", of("waiting-ci")],
    ["merge.waiting-main-ci", of("waiting-main-ci")],
    ["merge.ci-approval", new Set(queue.filter((e) => e.state === "ci-approval" && !e.runsBlocked).map(ref))],
    ["merge.ci-approval-person", new Set(queue.filter((e) => e.state === "ci-approval" && e.runsBlocked).map(ref))],
    ...(["ci-failed", "conflict", "needs-fix-up", "waiting-premerge", "waiting-verify", "verify-failed", "verify-error", "declined"] as const).map((s) => [`merge.${s}`, of(s)] as [string, Refs]),
    ["merge.merged", c.refs(`SELECT DISTINCT repo, number FROM merges WHERE outcome = 'merged' AND at >= :since ${c.andRepo()}`, since)],
  ]);
  return {
    counts: {
      ...Object.fromEntries([...members].map(([k, v]) => [k, v.size])),
      "merge.total": queue.length - of("merged").size,
      "merge.recent.merged": c.n(`SELECT COUNT(DISTINCT repo || '#' || number) AS n FROM merges WHERE outcome = 'merged' AND at >= :since ${c.andRepo()}`, since),
      "merge.recent.tries": c.n(`SELECT COUNT(*) AS n FROM merges WHERE at >= :since ${c.andRepo()}`, since),
      "x.mergedAll": of("merged").size,
    },
    members,
  };
}

function labels(c: Ctx): NodeCount {
  const repos = c.repo ? [c.repo] : trackedNames(c.db);
  const approved = new Set(repos.filter((r) => approvalOf(c.db, r)));
  const openRefs = c.openRefs();
  const labelled = new Set((c.db.prepare(`SELECT DISTINCT repo, number FROM stages WHERE stage = 'labeled' ${c.andRepo()}`).all(c.rp) as { repo: string; number: number }[])
    .map(ref).filter((r) => openRefs.has(r)));
  const pending: Refs = new Set(), unapproved: Refs = new Set();
  for (const r of c.open()) {
    if (r.status !== "settled" || labelled.has(ref(r))) continue;
    (approved.has(r.repo) ? pending : unapproved).add(ref(r));
  }
  const members = new Map<string, Refs>([["labels.labelled", labelled], ["labels.pending", pending], ["labels.unapproved", unapproved]]);
  return {
    counts: {
      ...Object.fromEntries([...members].map(([k, v]) => [k, v.size])),
      "labels.total": labelled.size + pending.size + unapproved.size,
      "labels.recent.labelled": c.n(`SELECT COUNT(*) AS n FROM stages WHERE stage = 'labeled' AND at >= :since ${c.andRepo()}`, { since: c.since }),
      "x.repos": repos.length, "x.approved": approved.size,
    },
    members,
  };
}

const sizeOf = (m: Map<string, Refs>, key: string) => m.get(key)?.size ?? 0;

/** Duplicate pairs and the decisions about them (src/dupes). Pairs count by their open items. */
function dupes(c: Ctx): NodeCount {
  const members = new Map<string, Refs>(["checking", "waiting", "held", "closed"].map((k) => [`dupes.${k}`, new Set()]));
  // Unjudged pairs whose items still have the hashed text; duplicate_pairs_open reads only the rows without a verdict.
  // CROSS JOIN fixes the order: with a single repo the planner otherwise scans both items tables for the repo and probes the pairs
  // last, which took minutes on a large repo.
  const pairs = c.db.prepare(`SELECT p.repo, p.a, p.b, ia.state AS sa, ib.state AS sb FROM main.duplicate_pairs p
    CROSS JOIN main.items ia ON ia.repo = p.repo AND ia.number = p.a AND ia.embed_hash = p.a_hash
    CROSS JOIN main.items ib ON ib.repo = p.repo AND ib.number = p.b AND ib.embed_hash = p.b_hash
    WHERE p.verdict IS NULL AND (ia.state = 'OPEN' OR ib.state = 'OPEN') ${c.tracked("p.repo")}`).all(c.rp) as { repo: string; a: number; b: number; sa: string; sb: string }[];
  for (const p of pairs) {
    if (p.sa === "OPEN") members.get("dupes.checking")!.add(`${p.repo}#${p.a}`);
    if (p.sb === "OPEN") members.get("dupes.checking")!.add(`${p.repo}#${p.b}`);
  }
  // Open decisions and answered close (the held-out items, see src/dupes/held.ts); decisions_open covers both.
  const rows = c.db.prepare(`SELECT d.repo, d.number, d.answer, i.state FROM main.decisions d
    JOIN main.items i ON i.repo = d.repo AND i.number = d.number
    WHERE d.kind = 'duplicate' AND d.id NOT LIKE '%:dupegroup:%' AND (d.answer IS NULL OR d.answer = 'close') ${c.tracked("d.repo")}`).all(c.rp) as { repo: string; number: number; answer: string | null; state: string }[];
  for (const r of rows) members.get(r.answer === null ? (r.state === "OPEN" ? "dupes.waiting" : "") : r.state === "OPEN" ? "dupes.held" : "dupes.closed")?.add(ref(r));
  // Group decisions hold the members they close.
  const groupRows = c.db.prepare(`SELECT gi.repo, gi.number, d.answer, i.state FROM main.dupe_group_items gi
    JOIN main.decisions d ON d.id = gi.decision_id JOIN main.items i ON i.repo = gi.repo AND i.number = gi.number
    WHERE gi.role = 'close' AND d.kind = 'duplicate' AND (d.answer IS NULL OR d.answer = 'accept' OR d.answer LIKE 'keep:%') ${c.tracked("gi.repo")}`).all(c.rp) as { repo: string; number: number; answer: string | null; state: string }[];
  for (const r of groupRows) members.get(r.answer === null ? (r.state === "OPEN" ? "dupes.waiting" : "") : r.state === "OPEN" ? "dupes.held" : "dupes.closed")?.add(ref(r));
  const open = c.open().length;
  return {
    counts: {
      ...Object.fromEntries([...members].map(([k, v]) => [k, v.size])),
      "dupes.total": open, "x.pairsUnchecked": pairs.length,
      "edge.dupes.classify": Math.max(0, open - sizeOf(members, "dupes.waiting") - sizeOf(members, "dupes.held")),
    },
    members,
  };
}

/** Priority scores (src/priority) and the work rank (src/rank) of the open, embedded items. */
function priority(c: Ctx): NodeCount {
  const members = new Map<string, Refs>(["scored", "todo", "unsure"].map((k) => [`priority.${k}`, new Set()]));
  const rows = c.db.prepare(`SELECT i.repo, i.number, CASE WHEN p.repo IS NULL OR p.text_hash <> i.embed_hash THEN 'todo' WHEN p.model = 'jev-unsure' THEN 'unsure' ELSE 'scored' END AS s
    FROM main.items i LEFT JOIN main.item_priority p ON p.repo = i.repo AND p.number = i.number
    WHERE i.state = 'OPEN' AND i.embed_hash IS NOT NULL ${c.tracked("i.repo")}`).all(c.rp) as { repo: string; number: number; s: string }[];
  for (const r of rows) members.get(`priority.${r.s}`)!.add(ref(r));
  const rank = c.db.prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(score), 0) AS top FROM main.item_rank WHERE 1 ${c.tracked()}`).get(c.rp) as { n: number; top: number };
  return {
    counts: {
      ...Object.fromEntries([...members].map(([k, v]) => [k, v.size])),
      "priority.total": rows.length, "x.ranked": rank.n, "max.topRank": rank.top,
    },
    members,
  };
}

const FIX_STATES = ["retry", "testing", "passed", "pr-opened", "skipped", "failed"] as const;

/** The Fix stage: open issues by where their attempt stands (src/fixissue). */
function fix(c: Ctx): NodeCount {
  const members = new Map<string, Refs>(["candidates", "unapproved", ...FIX_STATES].map((k) => [`fix.${k}`, new Set()]));
  for (const repo of c.repos()) {
    const bucket = members.get(fixIssueApprovalOf(c.db, repo) ? "fix.candidates" : "fix.unapproved")!;
    for (const r of dueRefs(c.db, "fixissue", { repo, bucket: "new" })) bucket.add(r);
  }
  const rows = c.db.prepare(`SELECT a.repo, a.number, a.state FROM main.fix_attempts a
    JOIN main.items i ON i.repo = a.repo AND i.number = a.number AND i.state = 'OPEN' WHERE 1 ${c.tracked("a.repo")}`).all(c.rp) as { repo: string; number: number; state: string }[];
  for (const r of rows) members.get(`fix.${r.state}`)?.add(ref(r));
  // A skipped issue whose text changed is a candidate again.
  for (const r of members.get("fix.candidates")!) members.get("fix.skipped")!.delete(r);
  const total = [...members.values()].reduce((a, s) => a + s.size, 0);
  return {
    counts: { ...Object.fromEntries([...members].map(([k, v]) => [k, v.size])), "fix.total": total, "edge.labels.fix": total, "edge.fix.review": sizeOf(members, "fix.pr-opened") },
    members,
  };
}

/** Fix-up: take-fix PRs by whether the step may push (src/fixup). */
function fixup(c: Ctx): NodeCount {
  const members = new Map<string, Refs>(["fix", "pushed", "hold", "unapproved", "asked", "cifix-queued", "cifix-rerun", "cifix-pushed", "cifix-failed"].map((k) => [`fixup.${k}`, new Set()]));
  const hold = members.get("fixup.hold")!;
  const tracked = new Set(c.repos());
  // The buckets are part of each PR's cached view.
  const cached = c.db.prepare(`SELECT repo, number, json_extract(view, '$.fixup') AS fixup, json_extract(view, '$.cifix') AS cifix FROM main.item_plans
    WHERE kind = 'pr' AND (json_extract(view, '$.fixup') IS NOT NULL OR json_extract(view, '$.cifix') IS NOT NULL) ${c.andRepo()}`).all(c.rp) as { repo: string; number: number; fixup: string | null; cifix: string | null }[];
  const facts = cached.filter((f) => tracked.has(f.repo));
  for (const f of facts) {
    if (!f.fixup) continue;
    if (f.fixup === "fix" || f.fixup === "unapproved" || f.fixup === "asked") members.get(`fixup.${f.fixup}`)!.add(ref(f));
    else hold.add(ref(f));
  }
  const waiting = hold.size + sizeOf(members, "fixup.fix") + sizeOf(members, "fixup.unapproved") + sizeOf(members, "fixup.asked");
  const pushed = members.get("fixup.pushed")!;
  for (const r of c.refs(`SELECT DISTINCT f.repo, f.number FROM main.fixups f JOIN main.items i ON i.repo = f.repo AND i.number = f.number AND i.state = 'OPEN'
      WHERE f.state = 'pushed' ${c.tracked("f.repo")}`)) if (![...members.values()].some((s) => s !== pushed && s.has(r))) pushed.add(r);
  // CI fix: PRs whose gate check fails, by what the step does next; a pushed CI fix counts like a pushed fix-up.
  for (const f of facts) if (f.cifix) members.get(`fixup.${f.cifix}`)!.add(ref(f));
  for (const r of c.refs(`SELECT DISTINCT f.repo, f.number FROM main.ci_fixes f JOIN main.items i ON i.repo = f.repo AND i.number = f.number AND i.state = 'OPEN'
      WHERE f.state = 'pushed' ${c.tracked("f.repo")}`)) members.get("fixup.cifix-pushed")!.add(r);
  return {
    counts: {
      ...Object.fromEntries([...members].map(([k, v]) => [k, v.size])),
      "fixup.total": waiting + pushed.size, "edge.fixup.review": pushed.size,
      "fixup.recent.pushed": c.n(`SELECT COUNT(*) AS n FROM main.fixups WHERE state = 'pushed' AND created_at >= :since ${c.tracked()}`, { since: c.since }),
    },
    members,
  };
}

/** Act: comments and closes that follow an operator's answer (src/act). */
function act(c: Ctx): NodeCount {
  const members = new Map<string, Refs>(["todo", "failed", "unapproved", "done"].map((k) => [`act.${k}`, new Set()]));
  for (const repo of c.repos()) {
    const failed = new Set((c.db.prepare("SELECT decision_id, number FROM main.actions WHERE repo = ? AND state = 'failed'").all(repo) as { decision_id: string; number: number }[]).map((r) => `${r.decision_id}\0${r.number}`));
    const approved = commentApprovalOf(c.db, repo) !== null;
    for (const p of dueActions(c.db, "act", { repo }).filter((x) => !x.action.params?.ask))
      members.get(!approved ? "act.unapproved" : failed.has(`${p.action.params!.decisionId}\0${p.number}`) ? "act.failed" : "act.todo")!.add(`${repo}#${p.number}`);
  }
  const done = c.n(`SELECT COUNT(*) AS n FROM main.actions WHERE state = 'done' AND created_at >= :since ${c.tracked()}`, { since: c.since });
  const waiting = sizeOf(members, "act.todo") + sizeOf(members, "act.failed") + sizeOf(members, "act.unapproved");
  return {
    counts: {
      ...Object.fromEntries([...members].map(([k, v]) => [k, v.size])),
      "act.done": done, "act.total": waiting, "edge.decide.act": waiting,
    },
    members,
  };
}

/** Post-merge review (src/postmerge): merged PRs to review, defects to file, and what the reviews of the last 24 hours led to. */
function postmerge(c: Ctx): NodeCount {
  const members = new Map<string, Refs>(["todo", "to-file", "unapproved", "filed", "nothing"].map((k) => [`postmerge.${k}`, new Set()]));
  const toFile = new Set<string>();
  for (const repo of c.repos()) {
    for (const r of dueRefs(c.db, "postmerge", { repo })) members.get("postmerge.todo")!.add(r);
    const approved = commentApprovalOf(c.db, repo) !== null;
    for (const d of pendingDefects(c.db, repo)) {
      toFile.add(`${repo}#${d.number}`);
      members.get(approved ? "postmerge.to-file" : "postmerge.unapproved")!.add(`${repo}#${d.number}`);
    }
  }
  const recent = c.refs(`SELECT repo, number FROM main.postmerge_reviews WHERE error IS NULL AND at >= :since ${c.andRepo()}`, { since: c.since });
  const filed = c.refs(`SELECT DISTINCT repo, number FROM main.postmerge_followups WHERE state = 'filed' AND at >= :since ${c.andRepo()}`, { since: c.since });
  for (const r of filed) members.get("postmerge.filed")!.add(r);
  for (const r of recent) if (!filed.has(r) && !toFile.has(r)) members.get("postmerge.nothing")!.add(r);
  return {
    counts: {
      ...Object.fromEntries([...members].map(([k, v]) => [k, v.size])),
      "postmerge.total": sizeOf(members, "postmerge.todo") + toFile.size,
      "postmerge.recent.reviewed": recent.size,
      "edge.merge.postmerge": sizeOf(members, "postmerge.todo"),
      "edge.postmerge.fix": sizeOf(members, "postmerge.filed"),
    },
    members,
  };
}

export const COUNTERS = { synced, dupes, classify, priority, decide, labels, review, fix, fixup, verify, merge, postmerge, act } as const;
export type CountedNode = keyof typeof COUNTERS;

/** Every count for one repo, or for every tracked repo when `repo` is null. */
export function countAll(db: DatabaseSync, repo: string | null, now = Date.now(), run: string | null = latestRun(db)): NodeCount {
  const c = new Ctx(db, repo, now, run);
  const out: NodeCount = { counts: {}, members: new Map() };
  for (const f of Object.values(COUNTERS)) {
    const r = f(c);
    Object.assign(out.counts, r.counts);
    for (const [k, v] of r.members) out.members.set(k, v);
  }
  return out;
}

/** The refs of one item-backed branch (`<node>.<branch>`) over every tracked repo, or null when the key names none. */
export function branchMembers(db: DatabaseSync, key: string): Refs | null {
  const node = key.split(".")[0] as CountedNode;
  if (!Object.hasOwn(COUNTERS, node)) return null;
  return COUNTERS[node](new Ctx(db, null)).members.get(key) ?? null;
}
