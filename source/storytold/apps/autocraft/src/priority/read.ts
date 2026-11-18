import { prep } from "../sql-cache.ts";
import type { DatabaseSync } from "node:sqlite";
import type { PriorityInfo } from "../../web/src/api/types.ts";
import type { Level } from "./score.ts";
import { parseServingMetadata, publicServingMetadata } from "../agents/provenance.ts";

/** The badge data for one item, or null before it was rated. */
export function priorityOf(db: DatabaseSync, repo: string, number: number): PriorityInfo | null {
  const r = prep(db, "SELECT impact, model, reason, serving_metadata FROM item_priority WHERE repo = ? AND number = ?").get(repo, number) as
    { impact: Level; model: string; reason: string | null; serving_metadata: unknown } | undefined;
  if (!r) return null;
  const serving = publicServingMetadata(parseServingMetadata(r.serving_metadata), false);
  return { level: r.impact, model: r.model, reason: r.reason, ...(serving && { serving }) };
}
