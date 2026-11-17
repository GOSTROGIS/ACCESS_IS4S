// The order the Act step works in: the item's priority level (security raised, as the work rank holds it), then the time of the answer, oldest first.
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_BAND } from "../rank/level.ts";

export type TargetKey = { band: number; at: string };

/** `band` (4 for P0 down to 0 for P4) and answer time of each decision, in one query. */
export function targetKeys(db: DatabaseSync, targets: { decisionId: string; repo: string; number: number }[]): Map<string, TargetKey> {
  const out = new Map<string, TargetKey>();
  if (!targets.length) return out;
  const rows = db.prepare(`SELECT d.id, COALESCE(d.answered_at, '') AS at, COALESCE(r.score / 10000, ${DEFAULT_BAND}) AS band
    FROM main.decisions d LEFT JOIN main.item_rank r ON r.repo = d.repo AND r.number = d.number WHERE d.id IN (SELECT value FROM json_each(?))`).all(JSON.stringify(targets.map((t) => t.decisionId))) as { id: string; at: string; band: number }[];
  for (const r of rows) out.set(r.id, { band: Math.min(4, Math.floor(r.band)), at: r.at });
  return out;
}

const cmp = (a: TargetKey | undefined, b: TargetKey | undefined): number => {
  const x = a ?? { band: DEFAULT_BAND, at: "" }, y = b ?? { band: DEFAULT_BAND, at: "" };
  return y.band - x.band || (x.at < y.at ? -1 : x.at > y.at ? 1 : 0);
};

/** Orders targets by level then answer time; ties by repo and number. */
export function orderTargets<T extends { decisionId: string; repo: string; number: number }>(db: DatabaseSync, targets: T[]): T[] {
  const key = targetKeys(db, targets);
  return [...targets].sort((a, b) => cmp(key.get(a.decisionId), key.get(b.decisionId)) || (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : a.number - b.number));
}

export { cmp as compareKeys };
