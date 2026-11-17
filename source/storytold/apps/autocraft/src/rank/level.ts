// The urgency band of an item for queue ordering: the priority level after the security raise, from the stored work rank
// (src/rank/score.ts keeps the level in the ten-thousands digit). Higher is more urgent; an unrated item counts as P2.
import type { DatabaseSync } from "node:sqlite";
import { LEVELS } from "../priority/score.ts";

export const DEFAULT_BAND = LEVELS.length - 1 - LEVELS.indexOf("P2");

/** 4 for P0 down to 0 for P4. */
export function levelBand(db: DatabaseSync, repo: string | null | undefined, number: number | null | undefined): number {
  if (!repo || number === null || number === undefined) return DEFAULT_BAND;
  const r = db.prepare("SELECT score FROM main.item_rank WHERE repo = ? AND number = ?").get(repo, number) as { score: number } | undefined;
  return r ? Math.floor(r.score / 10000) : DEFAULT_BAND;
}
