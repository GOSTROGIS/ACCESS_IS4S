// The Plans of every PR and item at one moment: facts loaded once, decided once. The planner builds one per pass; lanes and
// executors read it through planned() / plannedItems() instead of loading facts again.
import type { DatabaseSync } from "node:sqlite";
import { latestRun } from "../classify/settled.ts";
import { decideItem } from "./decide-item.ts";
import { decidePr } from "./decide.ts";
import { loadPrFacts } from "./facts.ts";
import { loadItemFacts } from "./issue-facts.ts";
import type { ItemFacts, ItemPlan, Plan, PrFacts } from "./plan.ts";

export type PrPlan = { facts: PrFacts; plan: Plan };
export type ItemPlanned = { facts: ItemFacts; plan: ItemPlan };

export type PlanSet = {
  /** The classification run both loads used. */
  run: string | null;
  /** Time of the decisions, ms. */
  now: number;
  prs: PrPlan[];
  items: ItemPlanned[];
};

export type PlanSetOptions = { run?: string | null; now?: number; model?: string };

/** Loads PR and item facts once and decides them. */
export function loadPlanSet(db: DatabaseSync, opts: PlanSetOptions = {}): PlanSet {
  const now = opts.now ?? Date.now();
  const run = opts.run !== undefined ? opts.run : latestRun(db);
  const load = { now, run };
  const prs = loadPrFacts(db, load).map((facts): PrPlan => ({ facts, plan: decidePr(facts) }));
  const items = loadItemFacts(db, { ...load, ...(opts.model ? { model: opts.model } : {}) }).map((facts): ItemPlanned => ({ facts, plan: decideItem(facts) }));
  return { run, now, prs, items };
}
