import type { MainCiState } from "../../api/types";
import { Badge, type Tone } from "./Badge";

export const MAIN_CI_TONE: Record<MainCiState, Tone> = { green: "ok", red: "bad", optional: "warn", running: "accent", none: "neutral" };
export const MAIN_CI_LABEL: Record<MainCiState, string> = { green: "Green", red: "Red", optional: "Optional failing", running: "Running", none: "No CI" };
/** Dot colour classes per state, shared by the top bar indicator. */
export const MAIN_CI_DOT: Record<MainCiState, string> = { green: "bg-ok", red: "bg-bad", optional: "bg-warn", running: "bg-accent-ink", none: "bg-ink/30" };

/** The CI state of a repo's default branch. */
export function MainCiBadge({ state, className }: { state: MainCiState; className?: string }) {
  return (
    <Badge tone={MAIN_CI_TONE[state]} className={className}>
      {MAIN_CI_LABEL[state]}
    </Badge>
  );
}
