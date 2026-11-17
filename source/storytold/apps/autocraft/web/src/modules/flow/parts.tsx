// Shared pieces of the flowchart: links, tones, what a branch waits on, branch rows.
import { Link } from "react-router-dom";
import { RobotIcon, CubeIcon, CircleDashedIcon, GearIcon, UserIcon, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { AgentRun, Flow, FlowBranch, FlowLink, FlowNode, FlowWait } from "../../api/types";
import { cn } from "../../ui/cn";
import { num } from "../../lib/format";

const PAGE: Record<FlowLink["page"], string> = { items: "/items", decisions: "/needs", queue: "/next/merge", work: "/next/steps" };
export function hrefOf(l: FlowLink): string {
  const q = new URLSearchParams(l.params).toString();
  return q ? `${PAGE[l.page]}?${q}` : PAGE[l.page];
}

/** The number of running agent runs in the steps of a node. */
export const runningIn = (n: FlowNode, runs: AgentRun[]): number => runs.filter((r) => n.steps.includes(r.step)).length;

export function RunningMarker({ n, runs, className }: { n: FlowNode; runs: AgentRun[]; className?: string }) {
  const k = runningIn(n, runs);
  if (k === 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-2xs font-medium text-accent-ink", className)} title="Model calls running now">
      <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
      {num(k)} running
    </span>
  );
}

export const DOT: Record<FlowBranch["tone"], string> = {
  ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", neutral: "bg-ink/30", merged: "bg-merged", accent: "bg-accent",
};

export const WAIT: Record<Exclude<FlowWait, "nothing">, [PhosphorIcon, string]> = {
  person: [UserIcon, "a person"],
  model: [RobotIcon, "a model step"],
  ci: [CircleDashedIcon, "CI"],
  runner: [GearIcon, "the runner"],
  sandbox: [CubeIcon, "a build environment"],
};

export function WaitIcon({ w, className }: { w: FlowWait; className?: string }) {
  if (w === "nothing") return null;
  const [Icon, label] = WAIT[w];
  return <Icon role="img" aria-label={`Waits on ${label}`} className={cn("shrink-0 text-ink/45", w === "person" && "text-accent-ink", className)} />;
}

export function waitsText(ws: FlowWait[]): string {
  const names = ws.filter((w): w is Exclude<FlowWait, "nothing"> => w !== "nothing").map((w) => WAIT[w][1]);
  return names.length ? `Waits on ${names.join(", ")}` : "Nothing waiting";
}

/** One branch: tone dot, label, what it waits on and its count, linked to the list of its items. */
export function BranchRow({ node, b, dense, showHint }: { node: FlowNode; b: FlowBranch; dense?: boolean; showHint?: boolean }) {
  const zero = b.count === 0;
  const inner = (
    <>
      <span className={cn("size-2 shrink-0 rounded-full", DOT[b.tone], (zero || b.count === null) && "opacity-40")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("block", dense ? "py-0.5 leading-snug" : "", zero && "text-ink/45", b.gate && !zero && "font-medium")}>{b.label}</span>
        {showHint && b.hint && <span className="block text-xs text-ink/50">{b.hint}</span>}
      </span>
      <WaitIcon w={b.count ? b.waitsOn : "nothing"} className="text-[13px]" />
      <span className={cn("num shrink-0 text-right tabular-nums", zero ? "text-ink/40" : b.gate ? "font-semibold text-accent-ink" : "text-ink/85")}>
        {b.count === null ? "–" : num(b.count)}
      </span>
    </>
  );
  const cls = cn(
    "flex items-center rounded",
    dense ? "min-h-7 gap-1.5 px-1.5 text-xs" : "min-h-9 gap-2 px-2 text-sm max-md:min-h-11",
    b.gate && !zero && "bg-accent/10",
    b.link && "hover:bg-ink/[0.06]",
  );
  return (
    <li data-anchor={`${node.id}.${b.id}`}>
      {b.link ? (
        <Link to={hrefOf(b.link)} className={cls} title={b.hint || undefined} aria-label={`${b.label}: ${b.count === null ? "not counted" : num(b.count)}`} onClick={(e) => e.stopPropagation()}>
          {inner}
        </Link>
      ) : (
        <div className={cls} title={b.hint || undefined}>
          {inner}
        </div>
      )}
    </li>
  );
}

export const recentText = (n: FlowNode): string | null =>
  n.recent.length ? n.recent.map((r) => `${num(r.count)} ${r.label}`).join(" · ") : null;

export const nodeOf = (f: Flow, id: string): FlowNode | undefined => f.nodes.find((n) => n.id === id);

/** Branches that wait for a person and hold items, gates first, for the "waiting for people" line. */
export function peopleWork(f: Flow): { node: FlowNode; b: FlowBranch }[] {
  return f.nodes
    .flatMap((node) => node.branches.filter((b) => b.waitsOn === "person" && b.count).map((b) => ({ node, b })))
    .sort((x, y) => Number(y.b.gate) - Number(x.b.gate));
}
