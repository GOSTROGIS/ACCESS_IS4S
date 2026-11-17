import type { Tone } from "../ui/atoms/Badge";
import type { FindingAction, FindingState, FindingSummary, FindingSeverity, ScanState, ScanTestState } from "../api/types";

export const SEVERITY: Record<FindingSeverity, { label: string; tone: Tone }> = {
  critical: { label: "Critical", tone: "bad" },
  high: { label: "High", tone: "warn" },
  medium: { label: "Medium", tone: "accent" },
  low: { label: "Low", tone: "neutral" },
};
export const SEVERITY_ORDER: FindingSeverity[] = ["critical", "high", "medium", "low"];

export const FINDING_STATE: Record<FindingState, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "accent" },
  dismissed: { label: "Dismissed", tone: "neutral" },
  backlog: { label: "Backlog", tone: "neutral" },
  fixing: { label: "Fixing", tone: "warn" },
  ready: { label: "Fix ready", tone: "ok" },
  landing: { label: "Landing", tone: "warn" },
  landed: { label: "Landed", tone: "merged" },
  advisory: { label: "Advisory", tone: "merged" },
  "awaiting-admin": { label: "Awaiting admin", tone: "warn" },
  published: { label: "Published", tone: "merged" },
};

/** Badge of a finding's scan test: the written test failing on the pinned commit shows the defect; passing there does not. */
export const SCAN_TEST: Record<ScanTestState, { label: string; tone: Tone }> = {
  building: { label: "Test running", tone: "warn" },
  confirmed: { label: "Test confirmed", tone: "ok" },
  "not-shown": { label: "Test did not show it", tone: "warn" },
  "could-not-build": { label: "Test could not be built", tone: "neutral" },
};

export const SCAN_STATE: Record<ScanState, { label: string; tone: Tone }> = {
  modeling: { label: "Threat model", tone: "warn" },
  scanning: { label: "Scanning", tone: "warn" },
  verifying: { label: "Verifying", tone: "warn" },
  done: { label: "Done", tone: "ok" },
  stopped: { label: "Stopped", tone: "neutral" },
  capped: { label: "Cap reached", tone: "bad" },
  failed: { label: "Failed", tone: "bad" },
};
export const scanActive = (s: ScanState): boolean => s === "modeling" || s === "scanning" || s === "verifying";

/** The actions a finding offers in its state; an urgent finding lists the advisory route first. */
export function findingActions(f: Pick<FindingSummary, "state" | "urgent">): FindingAction[] {
  switch (f.state) {
    case "new": return ["fix", "dismiss", "backlog"];
    case "backlog": return ["fix", "dismiss"];
    case "dismissed": return ["reopen"];
    case "ready": return f.urgent ? ["advisory", "land", "dismiss"] : ["land", "advisory", "dismiss"];
    case "awaiting-admin": return ["advisory", "land", "dismiss"];
    case "landed":
    case "advisory": return ["publish"];
    default: return [];
  }
}

/** Open findings first, by severity, then newest. */
export function sortFindings<T extends FindingSummary>(list: T[]): T[] {
  const closed = (f: T) => (f.state === "dismissed" || f.state === "published" ? 1 : 0);
  return [...list].sort((a, b) => closed(a) - closed(b) || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.number - b.number);
}
