import type { DatabaseSync } from "node:sqlite";

/** An empty day is zero; a recorded call with no USD report makes its total unknown. */
export function dailyReportedUsd(db: DatabaseSync, step: string, now: number, pricedProvidersOnly = false): number | null {
  const day = new Date(now).toISOString().slice(0, 10);
  const row = db.prepare(`SELECT COUNT(*) AS n, COUNT(cost_usd) AS priced, SUM(cost_usd) AS cost FROM agent_runs
    WHERE step = ? AND started_at >= ?${pricedProvidersOnly ? " AND provider <> 'codex'" : ""}`)
    .get(step, day) as { n: number; priced: number; cost: number | null };
  return row.n === 0 ? 0 : row.priced < row.n ? null : row.cost;
}
