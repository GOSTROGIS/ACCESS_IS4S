// Work rank of an open item: pure functions, no I/O. It decides what the pipeline works on first.
//
// The order is lexicographic: level (P0 first), then type, then size (smaller first), then reach. It is
// stored as one integer so that every candidate list can sort by it:
//
//   key = (4 - level) * 10000 + typeRank * 1000 + sizeRank * 100 + reach      (reach 0 to 99)
//
// The orders are in RANK_ORDER.
import { levelWith, type Level, LEVELS } from "../priority/score.ts";

export const SIZES = ["S", "M", "L", "XL"] as const;
export type Size = (typeof SIZES)[number];

export const RANK_ORDER = {
  /** Settled type labels, best first. An item without a settled label comes after all of them. */
  types: ["bugfix", "performance", "infra", "missing feature", "small extra", "plugin candidate"] as readonly string[],
  /** Smaller first. */
  sizes: SIZES,
  /** Level used when the item has not been rated. */
  defaultLevel: "P2" as Level,
  /** Size used when none is known: an issue before Fix triage, a PR without line counts. */
  defaultSize: "M" as Size,
  /** Changed lines up to which a PR is S, M and L; above the last it is XL. */
  sizeLines: [50, 300, 1000] as const,
};

export type RankInput = {
  /** Stored level, null when the item has not been rated. */
  level: Level | null;
  /** Reach 0 to 99, null when the item has not been rated. */
  reach: number | null;
  /** Settled type label, null when unsettled. */
  label: string | null;
  /** A classifier raised the security flag: the level goes up by one. */
  security: boolean;
  /** Size and where it came from. */
  size: Size | null;
  sizeSource: "lines" | "triage" | "default";
};

export type RankBreakdown = {
  /** The level used for the order, after the security raise. */
  level: Level;
  /** The stored level before the raise, null when the item has not been rated (P2 counts). */
  rated: Level | null;
  security: boolean;
  type: string | null;
  size: Size;
  sizeSource: RankInput["sizeSource"];
  reach: number;
};

export const sizeOfLines = (lines: number): Size => {
  const [s, m, l] = RANK_ORDER.sizeLines;
  return lines <= s ? "S" : lines <= m ? "M" : lines <= l ? "L" : "XL";
};

export const isSize = (v: unknown): v is Size => typeof v === "string" && (SIZES as readonly string[]).includes(v);

export function rankOf(i: RankInput): { score: number; breakdown: RankBreakdown } {
  const o = RANK_ORDER;
  const level = levelWith(i.level ?? o.defaultLevel, i.security);
  const size = i.size ?? o.defaultSize;
  const reach = Math.min(99, Math.max(0, Math.round(i.reach ?? 0)));
  const typeIndex = i.label === null ? -1 : o.types.indexOf(i.label);
  const typeRank = typeIndex < 0 ? 0 : o.types.length - typeIndex;
  const sizeRank = o.sizes.length - 1 - o.sizes.indexOf(size);
  const score = (LEVELS.length - 1 - LEVELS.indexOf(level)) * 10000 + typeRank * 1000 + sizeRank * 100 + reach;
  return {
    score,
    breakdown: { level, rated: i.level, security: i.security, type: i.label, size, sizeSource: i.size === null ? "default" : i.sizeSource, reach },
  };
}
