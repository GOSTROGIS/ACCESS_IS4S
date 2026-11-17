import type { PriorityInfo, PriorityLevel } from "../../api/types";
import { Badge, type Tone } from "./Badge";

const TONE: Record<PriorityLevel, Tone> = { P0: "bad", P1: "warn", P2: "neutral", P3: "neutral", P4: "neutral" };
export const LEVEL_NAME: Record<PriorityLevel, string> = { P0: "critical", P1: "high", P2: "normal", P3: "low", P4: "backlog" };

/** A level badge, P0 to P4. */
export function LevelBadge({ level, title }: { level: PriorityLevel; title?: string }) {
  return (
    <span className="relative z-10" title={title ?? LEVEL_NAME[level]}>
      <Badge tone={TONE[level]} className={level === "P4" ? "opacity-70" : undefined}>
        {level}
      </Badge>
    </span>
  );
}

/** Priority level of an item; nothing before the item was rated. */
export function PriorityBadge({ p }: { p: PriorityInfo | null | undefined }) {
  if (!p) return null;
  return <LevelBadge level={p.level} title={`${LEVEL_NAME[p.level]}${p.reason ? `: ${p.reason}` : `, rated by ${p.model}`}`} />;
}
