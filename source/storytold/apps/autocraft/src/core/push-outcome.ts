// What a push of ours did to the PR's required checks, and when a stage stops itself because of it. Pure.

/** The result of the required checks at one commit. Optional checks and skipped ones do not count. */
export type Required = "green" | "red" | "pending" | "none";
export type Outcome = "kept-green" | "fixed" | "broke" | "still-red" | "unknown";

/** The stages that push or merge, as the circuit breaker names them. */
export const TRIP_STAGES = ["fixup", "cifix", "fixissue", "merge"] as const;
export type TripStage = (typeof TRIP_STAGES)[number];

/** Pushes the breaker looks at, and how many of them breaking a required check trips the stage. */
export const BREAKER_WINDOW = 10;
export const BREAKER_BROKE = 2;

export function requiredResult(checks: { name: string; state: string }[], optional: string[]): Required {
  const req = checks.filter((c) => !optional.includes(c.name) && c.state !== "skipped");
  if (req.some((c) => c.state === "failure")) return "red";
  if (req.some((c) => c.state === "pending")) return "pending";
  return req.some((c) => c.state === "success") ? "green" : "none";
}

/** The outcome once the checks after the push are final, or null while they are not (including before any required check exists; the 3-day expiry then gives `unknown`). A side without a known result gives `unknown`. */
export function classifyPush(before: Required | "unknown", after: Required | "unknown"): Outcome | null {
  if (after === "pending" || after === "none") return null;
  if (after === "red") return before === "green" ? "broke" : before === "red" ? "still-red" : "unknown";
  if (after === "green") return before === "red" ? "fixed" : before === "green" ? "kept-green" : "unknown";
  return "unknown";
}

/** True when `broke` is at least BREAKER_BROKE of the newest BREAKER_WINDOW outcomes (newest first; null: not known yet). */
export function breakerTripped(newestFirst: (Outcome | null)[]): boolean {
  return newestFirst.slice(0, BREAKER_WINDOW).filter((o) => o === "broke").length >= BREAKER_BROKE;
}

/** The breaker stage of an audit push action. */
export const PUSH_STAGE: Record<string, TripStage> = { "fixup-push": "fixup", "conflict-push": "fixup", "cifix-push": "cifix", "fixissue-push": "fixissue" };

/** The breaker stage a runner step belongs to. */
export const STEP_STAGE: Record<string, TripStage> = { fixup: "fixup", cifix: "cifix", fixissue: "fixissue", "fixissue-collect": "fixissue", merge: "merge" };

/** The stage an action's push or merge belongs to, or null for an action that writes no commit (asks, comments, reruns). */
export function tripStageOf(a: { kind: string; bucket?: string }): TripStage | null {
  switch (a.kind) {
    case "fixup": return a.bucket === "fix" ? "fixup" : null;
    case "conflict": return a.bucket === "merge" ? "fixup" : null;
    case "cifix": return a.bucket === "work" || a.bucket === "collect" ? "cifix" : null;
    case "lint": return a.bucket === "cifix" ? "cifix" : "fixup";
    case "fixissue": case "fixissue-collect": return "fixissue";
    case "merge": return "merge";
    default: return null;
  }
}
