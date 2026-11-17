// Definition of the pipeline swimlane diagram (docs/pipeline.md, "The flow").
// Lanes are columns, rows run in pipeline order. Swimlane.tsx draws it.

import { STAGES } from "../../../../src/stages/registry.ts";

export type LaneId = "contributor" | "auto" | "models" | "sandbox" | "operator" | "writes";

export interface Lane {
  id: LaneId;
  title: string;
}

export interface Step {
  id: string;
  lane: LaneId;
  row: number;
  /** First line is the step name, the rest is detail (28 characters each at most). */
  lines: string[];
  /** Per-repo approval the step needs. */
  approval?: string;
}

export interface Edge {
  from: string;
  to: string;
  label?: string;
  /** Steps that run without a person: the main line, drawn heavy and straight where it can be. */
  main?: boolean;
  /** Branches that wait for a person or are rare. */
  dashed?: boolean;
}

export const LANES: Lane[] = [
  { id: "contributor", title: "Contributor" },
  { id: "auto", title: "AutoCraft" },
  { id: "models", title: "Models" },
  { id: "sandbox", title: "Sandbox" },
  { id: "operator", title: "Operator" },
  { id: "writes", title: "GitHub writes" },
];

/** The cards come from the stage registry, drawn by row and then by lane column. */
export const STEPS: Step[] = STAGES.flatMap((s) => s.swimlane).sort((a, b) => a.row - b.row || LANES.findIndex((l) => l.id === a.lane) - LANES.findIndex((l) => l.id === b.lane));

export const EDGES: Edge[] = [
  { from: "open", to: "sync", main: true },
  { from: "sync", to: "embed", main: true },
  { from: "embed", to: "dups", main: true },
  { from: "dups", to: "dupcheck", label: "pair", main: true },
  { from: "dupcheck", to: "classify", label: "distinct", main: true },
  { from: "dupcheck", to: "dupdec", label: "duplicate", dashed: true },
  { from: "dupdec", to: "act1", label: "close", dashed: true },
  { from: "dupdec", to: "classify", label: "not a duplicate", dashed: true },
  { from: "classify", to: "priority", main: true },
  { from: "classify", to: "label", label: "settled type" },
  { from: "classify", to: "referee", label: "types disagree", dashed: true },
  { from: "classify", to: "decide", label: "scope call", dashed: true },
  { from: "referee", to: "label", label: "settled" },
  { from: "referee", to: "decide", label: "unsure", dashed: true },
  { from: "priority", to: "review", label: "PR", main: true },
  { from: "priority", to: "fix", label: "issue", main: true },
  { from: "decide", to: "review", label: "take", dashed: true },
  { from: "decide", to: "fix", label: "take", dashed: true },
  { from: "decide", to: "act2", label: "out of scope", dashed: true },
  { from: "fix", to: "prfork", label: "patch" },
  { from: "prfork", to: "review", label: "our PR" },
  { from: "fix", to: "hold1", label: "no clear fix", dashed: true },
  { from: "review", to: "verify", label: "take", main: true },
  { from: "verify", to: "queue", label: "passed", main: true },
  { from: "queue", to: "premerge", label: "rule met", main: true },
  { from: "premerge", to: "batch", label: "clean", main: true },
  { from: "premerge", to: "mergeq", label: "defect", dashed: true },
  { from: "queue", to: "ciapprove", label: "runs held", dashed: true },
  { from: "batch", to: "merge", main: true },
  { from: "batch", to: "queue", label: "split on failure", dashed: true },
  { from: "queue", to: "mergeq", label: "otherwise", dashed: true },
  { from: "merge", to: "pmreview", label: "merged" },
  { from: "pmreview", to: "pmfile", label: "defect" },
  { from: "pmfile", to: "fix", label: "follow-up issue", dashed: true },
  { from: "mergeq", to: "batch", label: "merge", dashed: true },
  { from: "verify", to: "vfail", label: "failed" },
  { from: "vfail", to: "hold2" },
  { from: "review", to: "fixup", label: "take-fix" },
  { from: "review", to: "postrev", label: "final review" },
  { from: "decide", to: "fixup", label: "fix up, then merge", dashed: true },
  { from: "fixup", to: "review", label: "new head" },
  { from: "fixup", to: "ask", label: "cannot push" },
  { from: "ask", to: "push" },
  { from: "push", to: "review", label: "new head" },
  { from: "review", to: "hold2", label: "hold", dashed: true },
  { from: "review", to: "closeq", label: "close", dashed: true },
  { from: "closeq", to: "act3", label: "yes", dashed: true },
];
