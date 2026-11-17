// The desktop flowchart: nodes on a grid, the main line left to right along the
// top row (Synced to Merge queue), the side stages below it (Duplicates, Priority,
// Act, Fix, Fix-up, Post-merge review), edges drawn over the grid from the measured positions of the
// nodes and their branch rows. The columns shrink with the window down to a floor,
// so the whole flow fits on a laptop screen without scrolling sideways.
import { useLayoutEffect, useRef, useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { AgentRun, Flow, FlowEdge, FlowNode } from "../../api/types";
import { Badge } from "../../ui/atoms/Badge";
import { cn } from "../../ui/cn";
import { num } from "../../lib/format";
import { BranchRow, recentText, RunningMarker, WaitIcon } from "./parts";

/** Grid cell of each node: [column, row, row span]. */
const CELL: Record<FlowNode["id"], [number, number, number]> = {
  synced: [1, 1, 1], dupes: [1, 2, 1], classify: [2, 1, 1], priority: [2, 2, 1], decide: [3, 1, 1], act: [3, 2, 1],
  labels: [4, 1, 1], fix: [4, 2, 1], review: [5, 1, 1], fixup: [5, 2, 1], verify: [6, 1, 1], merge: [6, 2, 2], postmerge: [5, 3, 1],
};

export function NodeCard({ n, selected, onSelect, runs }: { n: FlowNode; selected: boolean; onSelect: () => void; runs: AgentRun[] }) {
  const gate = n.mode === "gate";
  const planned = n.mode === "planned";
  const recent = recentText(n);
  return (
    <section
      data-node={n.id}
      aria-label={n.title}
      className={cn(
        "relative min-w-0 rounded-md border bg-panel",
        gate ? "border-accent/60 shadow-[0_0_0_3px_rgb(var(--st-accent-rgb)/0.14)]" : planned ? "border-dashed border-line-strong" : "border-line-strong",
        selected && "outline outline-2 outline-offset-2 outline-accent-ink",
      )}
    >
      <button onClick={onSelect} aria-expanded={selected} className="block w-full rounded-t-md px-2.5 pb-2 pt-2.5 text-left hover:bg-ink/[0.04]">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="code text-2xs text-ink/40">{n.stage}</span>
          <span className="text-md font-semibold">{n.title}</span>
          {gate && <Badge tone="accent">People decide</Badge>}
          {planned && <Badge>Planned</Badge>}
          <RunningMarker n={n} runs={runs} className="ml-auto" />
          <CaretRightIcon className={cn("shrink-0 text-ink/40", runs.length === 0 && "ml-auto")} />
        </span>
        <span className={cn("mt-0.5 block text-xs", gate && n.summary !== "Nothing waiting" ? "font-medium text-accent-ink" : "text-ink/60")}>{n.summary}</span>
      </button>
      <ul className="px-1 pb-1.5">
        {n.branches.map((b) => (
          <BranchRow key={b.id} node={n} b={b} dense />
        ))}
      </ul>
      {(recent || n.waitsOn.length > 0) && (
        <div className="flex items-center gap-1.5 border-t border-line px-2.5 py-1.5 text-2xs text-ink/55">
          {recent && <span className="min-w-0">24 h: {recent}</span>}
          <span className="ml-auto flex items-center gap-1">
            {n.waitsOn.map((w) => (
              <WaitIcon key={w} w={w} />
            ))}
          </span>
        </div>
      )}
    </section>
  );
}

type Geo = { e: FlowEdge; d: string; x: number; y: number };
type Box = { l: number; t: number; r: number; b: number };
const HEAD = 22;

function geometry(el: HTMLElement, edges: FlowEdge[]): Geo[] {
  const base = el.getBoundingClientRect();
  const box = (sel: string): Box | null => {
    const n = el.querySelector(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top };
  };
  const out: Geo[] = [];
  for (const e of edges) {
    const s = box(`[data-node="${e.from}"]`), t = box(`[data-node="${e.to}"]`);
    if (!s || !t) continue;
    const a = e.branch ? box(`[data-anchor="${e.from}.${e.branch}"]`) : null;
    if (t.l >= s.r - 2) {
      // to the right: out of the branch row (or the node's lower edge when the target is lower down) into the target's header
      const sx = s.r, sy = a ? (a.t + a.b) / 2 : t.t > s.b - 40 ? s.b - 28 : s.t + HEAD;
      const ex = t.l, ey = t.t + HEAD;
      const dx = Math.max(20, (ex - sx) / 2);
      out.push({ e, d: `M${sx},${sy} C${sx + dx},${sy} ${ex - dx},${ey} ${ex - 1},${ey}`, x: (sx + ex) / 2, y: (sy + ey) / 2 });
    } else if (t.r <= s.l + 2) {
      // to the left: out of the branch row into the target's right edge, or up into its lower edge when it ends higher
      const sx = s.l, sy = a ? (a.t + a.b) / 2 : s.t + HEAD;
      if (t.b < sy - 20) {
        const ex = (t.l + t.r) / 2, ey = t.b;
        out.push({ e, d: `M${sx},${sy} C${ex},${sy} ${ex},${sy} ${ex},${ey + 1}`, x: (sx + ex) / 2, y: sy });
      } else {
        const ex = t.r, ey = Math.min(Math.max(sy, t.t + HEAD), t.b - 12);
        const dx = Math.max(20, (sx - ex) / 2);
        out.push({ e, d: `M${sx},${sy} C${sx - dx},${sy} ${ex + dx},${ey} ${ex + 1},${ey}`, x: (sx + ex) / 2, y: (sy + ey) / 2 });
      }
    } else {
      // above or below: from the facing edge's middle to the other's
      const down = t.t >= s.b;
      // Two edges between the same pair (Review and Fix-up) run side by side.
      const off = edges.some((o) => o.from === e.to && o.to === e.from) ? (e.from < e.to ? -32 : 32) : 0;
      const sx = (s.l + s.r) / 2 + off, sy = down ? s.b : s.t;
      const ex = (t.l + t.r) / 2 + off, ey = down ? t.t : t.b;
      const dy = (ey - sy) / 2;
      out.push({ e, d: `M${sx},${sy} C${sx},${sy + dy} ${ex},${ey - dy} ${ex},${ey + (down ? -1 : 1)}`, x: (sx + ex) / 2, y: (sy + ey) / 2 });
    }
  }
  return out;
}

export function Chart({ flow, selected, onSelect, runs }: { flow: Flow; selected: string | null; onSelect: (id: string) => void; runs: AgentRun[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo[]>([]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setGeo(geometry(el, flow.edges));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll("[data-node]").forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, [flow]);

  return (
    <div className="overflow-x-auto pb-2">
      <div
        ref={ref}
        className="relative grid min-w-[1040px] items-start gap-x-12 gap-y-12"
        style={{ gridTemplateColumns: "minmax(0,140fr) minmax(0,205fr) minmax(0,195fr) minmax(0,180fr) minmax(0,200fr) minmax(0,210fr)" }}
      >
        {flow.nodes.map((n) => {
          const [c, r, span] = CELL[n.id];
          return (
            <div key={n.id} style={{ gridColumn: c, gridRow: `${r} / span ${span}` }} className="relative z-[1]">
              <NodeCard n={n} selected={selected === n.id} onSelect={() => onSelect(n.id)} runs={runs} />
            </div>
          );
        })}
        <svg className="pointer-events-none absolute inset-0 z-0 size-full overflow-visible text-ink/35" aria-hidden>
          <defs>
            <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          {geo.map((g) => (
            <path
              key={`${g.e.from}-${g.e.to}`}
              d={g.d}
              fill="none"
              stroke="currentColor"
              strokeWidth={g.e.count ? 1.5 : 1}
              strokeDasharray={g.e.count === null ? "4 4" : undefined}
              markerEnd="url(#flow-arrow)"
              className={cn(g.e.to === "decide" && "text-accent-ink/60")}
            />
          ))}
        </svg>
        {geo.map((g) => (
          <div
            key={`${g.e.from}-${g.e.to}-label`}
            className="pointer-events-none absolute z-[2] flex w-[48px] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
            style={{ left: g.x, top: g.y }}
          >
            {g.e.count !== null && <span className="num rounded-full border border-line-strong bg-panel px-1.5 text-2xs font-semibold leading-[18px]">{num(g.e.count)}</span>}
            <span className="mt-0.5 rounded bg-panel px-0.5 text-2xs leading-tight text-ink/55">{g.e.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
