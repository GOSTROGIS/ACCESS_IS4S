// Shared queries for the Progress, Repo and Run and cost pages.
import type { DatabaseSync } from "node:sqlite";
import { latestRun, settledTable } from "../../classify/settled.ts";

// Latest stage per item, from the item_stage table the stages trigger maintains.
export const LATEST_SQL = `latest AS (SELECT repo, number, stage, reviewed FROM main.item_stage %W)`;

export const latestCte = (repo?: string): string => LATEST_SQL.replace("%W", repo ? "WHERE repo = :repo" : "");

// When tracking began: set by connect() (src/db.ts) on first use.
export function trackingStart(db: DatabaseSync): string {
  const r = db.prepare("SELECT value FROM main.settings WHERE key = 'tracking_started_at'").get() as { value: string } | undefined;
  return r?.value ?? new Date().toISOString();
}

// Closed items by date: main.items with its index named, because through the
// scoping view the planner walks the repo index instead of the closed_at range.
export const CLOSED_ITEMS = "main.items AS i INDEXED BY items_closed";
export const CREATED_ITEMS = "main.items AS i INDEXED BY items_created";
export const TRACKED = "repo IN (SELECT name FROM main.tracked_repos)";

const p = (repo?: string, extra: Record<string, string | number> = {}): Record<string, string | number> => (repo ? { repo, ...extra } : extra);

export type FunnelRow = {
  repo: string; open: number; classified: number; second_opinion: number; disagreement: number; reviewed: number;
  take: number; hold: number; close: number; needs_decision: number; batched: number;
};

// "classified" counts settled type labels (src/classify/settled.ts) in the latest run.
export function funnelByRepo(db: DatabaseSync, repo?: string): FunnelRow[] {
  settledTable(db, latestRun(db));
  return db.prepare(`WITH ${latestCte(repo)}
    SELECT i.repo, COUNT(*) AS open,
      SUM(st.status = 'settled') AS classified, SUM(st.status = 'waiting') AS second_opinion, SUM(st.status = 'disagree') AS disagreement,
      SUM(COALESCE(l.reviewed, 0)
       OR EXISTS (SELECT 1 FROM main.classifications c WHERE c.repo = i.repo AND c.number = i.number AND c.classifier = 'sonnet')) AS reviewed,
      SUM(l.stage IN ('take', 'verified') OR (l.stage LIKE 'verify-%' AND l.stage <> 'verify-failed')) AS take, SUM(l.stage = 'hold') AS hold, SUM(l.stage = 'close') AS close,
      SUM(l.stage = 'needs-decision') AS needs_decision, SUM(l.stage = 'batched') AS batched
    FROM items i LEFT JOIN latest l ON l.repo = i.repo AND l.number = i.number
    LEFT JOIN temp.item_settled st ON st.repo = i.repo AND st.number = i.number
    WHERE i.state = 'OPEN' ${repo ? "AND i.repo = :repo" : ""}
    GROUP BY i.repo`).all(p(repo)).map((r) => ({
      ...r, classified: r.classified ?? 0, second_opinion: r.second_opinion ?? 0, disagreement: r.disagreement ?? 0,
      take: r.take ?? 0, hold: r.hold ?? 0, close: r.close ?? 0, needs_decision: r.needs_decision ?? 0, batched: r.batched ?? 0,
    })) as FunnelRow[];
}

export type DoneRow = { repo: string; merged_pipeline: number; closed_pipeline: number; closed_others: number; total: number };

// Done since tracking began. Merged PRs carry closed_at too, so one range covers both.
export function doneByRepo(db: DatabaseSync, start: string, repo?: string): DoneRow[] {
  return db.prepare(`WITH ${latestCte(repo)}, d AS (
      SELECT i.repo, i.state, l.stage FROM ${CLOSED_ITEMS} LEFT JOIN latest l ON l.repo = i.repo AND l.number = i.number
      WHERE i.closed_at >= :start AND i.state <> 'OPEN' AND i.${TRACKED} ${repo ? "AND i.repo = :repo" : ""})
    SELECT repo,
      SUM(state = 'MERGED' AND stage = 'merged') AS merged_pipeline,
      SUM(state = 'CLOSED' AND stage IN ('closed', 'fixed-by-us')) AS closed_pipeline,
      COUNT(*) AS total
    FROM d GROUP BY repo`).all(p(repo, { start })).map((r) => {
      const x = r as Omit<DoneRow, "closed_others">;
      return { ...x, closed_others: x.total - x.merged_pipeline - x.closed_pipeline };
    });
}

// Open items per repo per day since tracking began, rebuilt backwards from the
// current open count and the created/closed dates.
export function trend(db: DatabaseSync, start: string, openNow: Map<string, number>, repo?: string): { days: string[]; series: Map<string, number[]> } {
  const today = new Date().toISOString().slice(0, 10);
  const days: string[] = [];
  for (let t = Date.parse(start.slice(0, 10)); ; t += 86400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    days.push(d);
    if (d >= today || days.length > 365) break;
  }
  const r = repo ? "AND repo = :repo" : "";
  const created = db.prepare(`SELECT repo, substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM ${CREATED_ITEMS} WHERE created_at >= :start AND ${TRACKED} ${r} GROUP BY repo, d`).all(p(repo, { start })) as { repo: string; d: string; n: number }[];
  const closed = db.prepare(`SELECT repo, substr(closed_at, 1, 10) AS d, COUNT(*) AS n FROM ${CLOSED_ITEMS} WHERE closed_at >= :start AND state <> 'OPEN' AND ${TRACKED} ${r} GROUP BY repo, d`).all(p(repo, { start })) as { repo: string; d: string; n: number }[];
  const delta = new Map<string, Map<string, number>>();
  const add = (repo: string, d: string, n: number) => {
    if (!delta.has(repo)) delta.set(repo, new Map());
    const m = delta.get(repo)!;
    m.set(d, (m.get(d) ?? 0) + n);
  };
  for (const x of created) add(x.repo, x.d, x.n);
  for (const x of closed) add(x.repo, x.d, -x.n);
  const series = new Map<string, number[]>();
  // every repo in openNow gets a series, a repo with nothing open one of zeros
  for (const name of new Set([...openNow.keys(), ...delta.keys()])) {
    const m = delta.get(name) ?? new Map<string, number>();
    // value at the end of each day; walk back from today's open count
    const out = new Array<number>(days.length);
    let v = openNow.get(name) ?? 0;
    for (let k = days.length - 1; k >= 0; k--) {
      out[k] = v;
      v -= m.get(days[k]) ?? 0;
    }
    series.set(name, out);
  }
  return { days, series };
}
