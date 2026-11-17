// Labels, icons and grouping for the item trace.
import {
  ChatsIcon,
  GearIcon,
  GithubLogoIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  QuestionIcon,
  ShieldCheckIcon,
  SparkleIcon,
  WrenchIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import type { TraceEvent, TraceKind } from "../api/types";

export const TRACE_KIND: Record<TraceKind, { label: string; Icon: PhosphorIcon }> = {
  "model-call": { label: "Model calls", Icon: SparkleIcon },
  github: { label: "GitHub", Icon: GithubLogoIcon },
  decision: { label: "Decisions", Icon: QuestionIcon },
  write: { label: "Writes", Icon: PencilSimpleIcon },
  check: { label: "Checks", Icon: ShieldCheckIcon },
  review: { label: "Reviews", Icon: MagnifyingGlassIcon },
  plan: { label: "Plan", Icon: ListChecksIcon },
  job: { label: "Jobs", Icon: GearIcon },
  step: { label: "Fixes and merges", Icon: WrenchIcon },
  conversation: { label: "Conversation", Icon: ChatsIcon },
};

export const TRACE_KINDS = Object.keys(TRACE_KIND) as TraceKind[];

export type TraceGroup = { head: string | null; events: TraceEvent[] };

/** An event without a head belongs to the head current at its time, so heads carry forward from the oldest event. The list is oldest first: a group starts at its oldest event. */
export function groupByHead(events: TraceEvent[]): TraceGroup[] {
  const heads: (string | null)[] = [];
  let current: string | null = null;
  for (let i = 0; i < events.length; i++) {
    current = events[i]!.head ?? current;
    heads[i] = current;
  }
  const out: TraceGroup[] = [];
  events.forEach((e, i) => {
    const last = out[out.length - 1];
    if (last && last.head === heads[i]) last.events.push(e);
    else out.push({ head: heads[i]!, events: [e] });
  });
  return out;
}

export const shortSha = (sha: string) => sha.slice(0, 7);

/** The person who pushed a head, when the trace has a push event for it. */
export function pushedBy(events: TraceEvent[], head: string): string | null {
  const p = events.find((e) => e.kind === "github" && e.head === head && e.ref.head === head && e.actor.type === "person" && /^Pushed /.test(e.summary));
  return p?.actor.name ?? null;
}

export const NEXT_LABEL: Record<string, string> = {
  verify: "Verify",
  premerge: "Pre-merge review",
  review: "Review",
  fixup: "Fix-up",
  merge: "Merge",
};
export const nextLabel = (kind: string) => NEXT_LABEL[kind] ?? kind.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());

export type TraceRow = { event: TraceEvent; calls?: undefined } | { event: TraceEvent; calls: TraceEvent[] };

/** Calls of one prompt close in time: no job id on both sides means "within five minutes". */
const GROUP_GAP_MS = 5 * 60_000;
const family = (promptId: string) => (promptId.startsWith("lint.reference.") ? "lint.reference" : promptId);
const sameRun = (a: TraceEvent, b: TraceEvent) => {
  if (!a.call?.promptId || !b.call?.promptId || a.call.step !== b.call.step || family(a.call.promptId) !== family(b.call.promptId)) return false;
  if (a.ref.jobId !== undefined || b.ref.jobId !== undefined) return a.ref.jobId === b.ref.jobId;
  return Math.abs(Date.parse(a.at) - Date.parse(b.at)) <= GROUP_GAP_MS;
};

/** Consecutive model calls of the same step and prompt (the reference lint runs once per review text) become one row; its `event` is the oldest call and `calls` all of them, oldest first. */
export function groupCalls(events: TraceEvent[]): TraceRow[] {
  const out: TraceRow[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    const prev = last && (last.calls ? last.calls[last.calls.length - 1]! : last.event);
    if (last && prev && e.kind === "model-call" && prev.kind === "model-call" && sameRun(prev, e)) {
      if (last.calls) last.calls.push(e);
      else out[out.length - 1] = { event: last.event, calls: [last.event, e] };
    } else out.push({ event: e });
  }
  return out;
}

const modelName = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

/** "Reference lint: 10 Jev calls, 1 Haiku call". */
export function callGroupSummary(calls: TraceEvent[]): string {
  const counts = new Map<string, number>();
  for (const c of calls) {
    const m = modelName(c.call?.model ?? "model");
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const title = calls[0]!.summary.split(": ")[0]!;
  const parts = [...counts].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${n} ${m} call${n === 1 ? "" : "s"}`);
  return `${title}: ${parts.join(", ")}`;
}

/** "$0.91", or "<$0.01" below a cent; null (not recorded or still running) shows nothing. */
export const formatCost = (usd: number | null | undefined): string | null => (usd === null || usd === undefined ? null : usd >= 0.01 ? `$${usd.toFixed(2)}` : "<$0.01");

/** The cost a timeline row shows: a review's summed cost, a call's own, or the sum over a group of calls. */
export function eventCost(e: TraceEvent): string | null {
  return formatCost(e.costUsd !== undefined ? e.costUsd : e.call?.costUsd);
}
export function groupCost(calls: TraceEvent[]): string | null {
  const costs = calls.map((c) => c.call?.costUsd).filter((v): v is number => typeof v === "number");
  return costs.length ? formatCost(costs.reduce((a, b) => a + b, 0)) : null;
}
