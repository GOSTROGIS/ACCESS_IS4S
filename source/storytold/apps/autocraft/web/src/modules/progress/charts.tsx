// Hand-drawn SVG/HTML charts in the ArtCraft idiom: hairline axes, square
// marks, mono labels. Colours come from the --st-c* slots (validated for
// colour-vision separation on both theme surfaces).
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Done, Funnel } from "../../api/types";
import { cn } from "../../ui/cn";
import { clock, num, pct } from "../../lib/format";

export const OUTCOMES: { key: keyof Funnel; label: string; cls: string }[] = [
  { key: "take", label: "Taken", cls: "bg-c1" },
  { key: "hold", label: "Held", cls: "bg-c2" },
  { key: "close", label: "To close", cls: "bg-c3" },
  { key: "batched", label: "In a batch", cls: "bg-c4" },
  { key: "waiting", label: "Waiting for a decision", cls: "bg-c5" },
];

export const DONE_PARTS: { key: keyof Done; label: string; cls: string }[] = [
  { key: "mergedByPipeline", label: "Merged by pipeline", cls: "bg-c1" },
  { key: "closedByPipeline", label: "Closed by pipeline", cls: "bg-c2" },
  { key: "closedByOthers", label: "Closed by others", cls: "bg-ink/35" },
];

function Legend({ items }: { items: { label: string; cls: string; value?: number }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-xs text-ink/70">
          <span className={cn("size-2 rounded-sm", i.cls)} />
          {i.label}
          {i.value !== undefined && <span className="num font-medium text-ink">{num(i.value)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Stacked bar with 2px surface gaps between segments and a hover readout. */
export function StackBar({ parts, height = 10, total }: { parts: { label: string; cls: string; value: number }[]; height?: number; total?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="relative">
      <div className="flex gap-[2px] overflow-hidden rounded-sm" style={{ height }} onMouseLeave={() => setHover(null)}>
        {parts.map((p, i) => (
          <div
            key={p.label}
            className={cn("h-full transition-opacity duration-fast", p.cls, hover !== null && hover !== i && "opacity-40")}
            style={{ width: `${sum ? (p.value / sum) * 100 : 0}%` }}
            onMouseEnter={() => setHover(i)}
            role="img"
            aria-label={`${p.label}: ${num(p.value)}`}
          />
        ))}
      </div>
      {hover !== null && (
        <div className="pointer-events-none absolute -top-8 left-0 z-10 whitespace-nowrap rounded border border-line-strong bg-raised px-2 py-1 text-xs shadow-md">
          {parts[hover].label} · {num(parts[hover].value)} · {pct(parts[hover].value, sum)}
        </div>
      )}
    </div>
  );
}

export function DoneSplit({ done }: { done: Done }) {
  const parts = DONE_PARTS.map((p) => ({ ...p, value: done[p.key] }));
  return (
    <div>
      <StackBar parts={parts} height={12} />
    </div>
  );
}

/** Funnel for open items: the three filter steps as bars, then how the reviewed ones split. */
export function FunnelChart({ f }: { f: Funnel }) {
  const share = (n: number) => `${f.open ? (n / f.open) * 100 : 0}%`;
  const steps = [
    { label: "Open", value: f.open, note: "" },
    { label: "Classified", value: f.classified, note: pct(f.classified, f.open) },
    { label: "Reviewed", value: f.reviewed, note: pct(f.reviewed, f.open) },
  ];
  const outcome = OUTCOMES.map((o) => ({ ...o, value: f[o.key] }));
  const routed = outcome.reduce((a, o) => a + o.value, 0);
  const row = "grid grid-cols-[76px_1fr_64px] md:grid-cols-[96px_1fr_88px] items-center gap-3";
  const notStarted = <span className="text-xs text-ink/45">not started yet</span>;
  return (
    <div>
      <div className="space-y-2">
        {steps.map((s) => (
          <div key={s.label} className={row}>
            <span className="text-xs text-ink/60">{s.label}</span>
            {s.value || s.label === "Open" ? (
              <div className="h-5 overflow-hidden rounded-sm bg-ink/[0.05]">
                <div className="h-full rounded-sm bg-ink/55" style={{ width: share(s.value) }} />
              </div>
            ) : (
              notStarted
            )}
            <span className="num text-right text-sm">
              {num(s.value)}
              {s.note && <span className="ml-1.5 hidden text-xs text-ink/45 md:inline">{s.note}</span>}
            </span>
          </div>
        ))}
        <div className={row}>
          <span className="text-xs text-ink/60">Routed</span>
          {routed ? (
            <div className="h-5" style={{ width: `${Math.max(f.open ? (f.reviewed / f.open) * 100 : 0, 45)}%` }}>
              <StackBar parts={outcome} height={20} total={Math.max(routed, f.reviewed)} />
            </div>
          ) : (
            notStarted
          )}
          <span className="num text-right text-sm">{num(routed)}</span>
        </div>
      </div>
      {(f.secondOpinion > 0 || f.disagreement > 0) && (
        <p className="mt-3 text-xs text-ink/60">
          Not yet classified: <span className="num font-medium text-ink">{num(f.secondOpinion)}</span> waiting for a second opinion,{" "}
          <span className="num font-medium text-ink">{num(f.disagreement)}</span> where the two classifiers disagree.{" "}
          <Link to="/items?status=unsettled" className="text-accent-ink hover:underline">
            See them
          </Link>
        </p>
      )}
      {routed > 0 && (
        <div className="mt-4 md:pl-[108px]">
          <Legend items={outcome} />
        </div>
      )}
    </div>
  );
}

/** Items done per hour, last 24 h: single-hue columns with an average line and hover readout. */
export function Throughput({ perHour, nowIso }: { perHour: number[]; nowIso: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the container's real pixel width so axis text stays at its type size.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const Hh = 150;
  const pad = { l: 28, r: 48, t: 8, b: 20 };
  const max = Math.ceil(Math.max(...perHour) / 20) * 20;
  const avg = perHour.reduce((a, b) => a + b, 0) / perHour.length;
  const bw = (W - pad.l - pad.r) / perHour.length;
  const y = (v: number) => pad.t + (Hh - pad.t - pad.b) * (1 - v / max);
  // Buckets are UTC hours; label each by its start in the viewer's time zone (not always :00).
  const lastStart = Math.floor(Date.parse(nowIso) / 3600_000) * 3600_000;
  const startLabel = (i: number) => clock(lastStart - (perHour.length - 1 - i) * 3600_000);
  return (
    <div className="relative w-full overflow-hidden" ref={box}>
      <svg width={W} height={Hh} viewBox={`0 0 ${W} ${Hh}`} className="block" role="img" aria-label={`Items done per hour, last 24 hours, average ${Math.round(avg)}`} onMouseLeave={() => setHover(null)}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--st-line)" strokeDasharray={t === 0 ? undefined : "2 3"} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-current text-[11px] text-ink/45">
              {t}
            </text>
          </g>
        ))}
        {perHour.map((v, i) => {
          const x = pad.l + i * bw;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={pad.t} width={bw} height={Hh - pad.t - pad.b} fill="transparent" />
              <rect x={x + bw * 0.18} y={y(v)} width={bw * 0.64} rx={2} height={y(0) - y(v)} fill="var(--st-c1)" opacity={hover === null || hover === i ? 1 : 0.45} />
              {i % (W < 500 ? 8 : 4) === 0 && (
                <text x={x + bw / 2} y={Hh - 6} textAnchor="middle" className="fill-current text-[11px] text-ink/45">
                  {startLabel(i)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(avg)} y2={y(avg)} stroke="rgb(var(--st-fg-rgb))" strokeOpacity={0.7} strokeDasharray="4 3" />
        <text x={W - pad.r + 6} y={y(avg) + 4} textAnchor="start" className="fill-current text-[11px] text-ink/75">
          avg {Math.round(avg)}
        </text>
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 whitespace-nowrap rounded border border-line-strong bg-raised px-2 py-1 text-xs shadow-md" style={{ left: `calc(${((pad.l + hover * bw) / W) * 100}% - 20px)` }}>
          {startLabel(hover)} · {perHour[hover]} done
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const W = 72;
  const H = 18;
  // one day of tracking has no trend yet
  if (values.length < 2) return <span className={cn("text-2xs text-ink/35", className)}>from today</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 2 - ((v - min) / (max - min || 1)) * (H - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={className} aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
