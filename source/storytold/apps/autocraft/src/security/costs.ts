import type { DatabaseSync } from "node:sqlite";

export const SECURITY_BUDGET_PAUSE = "Model budget pause: ";

/** No calls is zero; one unpriced call makes the total unknown, even beside priced calls. */
export function sumReportedCosts(costs: (number | null)[]): number | null {
  return costs.some((cost) => cost === null) ? null : (costs as number[]).reduce((sum, cost) => sum + cost, 0);
}

/** Includes failed and retry calls; SQL SUM alone would silently omit unpriced work. */
export function reportedRunCost(db: DatabaseSync, repo: string, number: number, after: number, fallback: number | null): number | null {
  const row = db.prepare(`SELECT COUNT(*) AS n, COUNT(r.cost_usd) AS priced, SUM(r.cost_usd) AS cost
    FROM agent_runs r JOIN agent_run_items i ON i.run_id = r.id WHERE i.repo = ? AND i.number = ? AND r.id > ?`)
    .get(repo, number, after) as { n: number; priced: number; cost: number | null };
  return row.n === 0 ? fallback : row.priced < row.n ? null : row.cost;
}
