import type { ItemPhase, ItemStatus } from "../../api/types";
import { Badge, type Tone } from "../atoms/Badge";
import { TimeAgo } from "../atoms/TimeAgo";
import { cn } from "../cn";

export const PHASE_TONE: Record<ItemPhase, Tone> = {
  Triage: "neutral",
  "Waiting for a person": "warn",
  Review: "accent",
  Fixing: "accent",
  Verifying: "accent",
  "In queue": "accent",
  Merged: "merged",
  Closed: "neutral",
  Held: "neutral",
  "Out of scope": "neutral",
  "Pipeline off": "neutral",
};

export const PhaseBadge = ({ phase }: { phase: ItemPhase }) => <Badge tone={PHASE_TONE[phase]}>{phase}</Badge>;

/** The one status line every page draws: where the item is, what it waits for, what happens next. */
export function StatusLine({ status, className, compact }: { status: ItemStatus; className?: string; compact?: boolean }) {
  const { phase, waiting, next, since } = status;
  return (
    <p className={cn("text-sm leading-5 text-ink/70", className)}>
      <span className="font-medium text-ink">{phase}</span>
      {waiting && (
        <>
          {" · waiting for "}
          {waiting}
          {!compact && (
            <>
              {" since "}
              <TimeAgo iso={since} />
            </>
          )}
        </>
      )}
      {!waiting && !compact && phase !== "Triage" && (
        <>
          {" · "}
          <TimeAgo iso={since} />
        </>
      )}
      {next && <> · next: {next}</>}
    </p>
  );
}
