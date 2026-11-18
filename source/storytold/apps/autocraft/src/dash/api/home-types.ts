// The Home and Items-status contract. The dashboard declares the same shapes in web/src/api/types.ts.
import type { DecisionKind, ItemKind, ItemState, RepoName } from "../../../web/src/api/types.ts";
import type { ItemPhase, ItemStatus } from "../../core/item-status.ts";

export type { ItemPhase, ItemStatus };
export const ITEM_PHASES: readonly ItemPhase[] = ["Triage", "Waiting for a person", "Review", "Fixing", "Verifying", "In queue", "Merged", "Closed", "Held", "Out of scope", "Pipeline off"];

export type ProblemKind = "stopped" | "health" | "stuck" | "gave-up";
export interface HomeProblem { kind: ProblemKind; title: string; detail: string; to: string }
export type NeedKind = DecisionKind | "security" | "feedback" | "stopped";
export interface HomeNeed { id: string; kind: NeedKind; repo: RepoName; number: number | null; title: string; recommendation: string | null; askedAt: string; itemKind: ItemKind | null; to: string }
export interface HomeDone { at: string; what: "merged" | "closed" | "review posted"; repo: RepoName; number: number; title: string; kind: ItemKind }
export interface Home {
  needs: { total: number; byKind: Partial<Record<NeedKind, number>>; oldest: HomeNeed[] };
  problems: HomeProblem[];
  phases: Record<ItemPhase, number>;
  running: string;
  progress: { openNow: number; openAtStart: number; done24h: number; byAutoCraftPct: number; perHour: number[]; spendTodayUsd: number | null };
  done: HomeDone[];
}

export interface ItemStatusRow { repo: RepoName; number: number; kind: ItemKind; state: ItemState; title: string; status: ItemStatus; updatedAt: string }
export interface ItemStatusList { rows: ItemStatusRow[]; byPhase: Record<ItemPhase, number>; total: number; nextCursor: string | null }

/** The SQL expression of an item's phase: its plan's stored status, else the one an item without a plan gets (core/item-status.ts statusFromItem). Needs `i` (items) and `p` (item_plans, left joined). */
export const PHASE_SQL = `COALESCE(json_extract(p.view, '$.status.phase'), CASE WHEN i.merged_at IS NOT NULL THEN 'Merged' WHEN i.closed_at IS NOT NULL THEN 'Closed' ELSE 'Triage' END)`;
