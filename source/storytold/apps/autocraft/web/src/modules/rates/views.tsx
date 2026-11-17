// The Rates page: items moved per stage per hour or day, and each account's use over time.
// One small chart per stage (a single measure and scale each); account lines share one 0-100 % scale.
import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "../../api/client";
import type { RateBucket, Rates, UsagePause } from "../../api/types";
import { clock, num } from "../../lib/format";
import { Segmented } from "../../ui/molecules/Segmented";
import { cn } from "../../ui/cn";
import { Block, ErrorLine, Page } from "../admin/parts";

function useWidth(min = 200): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w];
}

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag === v ? v : Math.ceil(v / (mag / 2)) * (mag / 2);
};

function tickLabel(t: string, hourly: boolean) {
  return hourly ? clock(t) : new Date(t).toLocaleDateString("en", { weekday: "short" });
}

/** Columns of items moved per bucket; a marker above a column counts runs that failed in it. */
function StageChart({ buckets, hourly, title }: { buckets: RateBucket[]; hourly: boolean; title: string }) {
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 120;
  const pad = { l: 30, r: 6, t: 14, b: 18 };
  const max = niceMax(Math.max(1, ...buckets.map((b) => b.items)));
  const bw = (W - pad.l - pad.r) / buckets.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const every = Math.ceil((W < 400 ? 56 : 44) / bw);
  return (
    <div ref={box} className="relative w-full">
      <svg width={W} height={H} className="block" role="img" aria-label={`${title}: items moved per ${hourly ? "hour" : "day"}`} onMouseLeave={() => setHover(null)}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--st-line)" strokeDasharray={t === 0 ? undefined : "2 3"} />
            <text x={pad.l - 5} y={y(t) + 3} textAnchor="end" className="fill-current text-[11px] text-ink/45">
              {num(t)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = pad.l + i * bw;
          return (
            <g key={b.t} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={x} y={0} width={bw} height={H - pad.b} fill="transparent" />
              {b.items > 0 && <path d={`M${x + bw * 0.15},${y(0)} v${-(y(0) - y(b.items) - 3)} q0,-3 3,-3 h${Math.max(0, bw * 0.7 - 6)} q3,0 3,3 v${y(0) - y(b.items) - 3} z`} fill="var(--st-c1)" opacity={hover === null || hover === i ? 1 : 0.45} />}
              {b.failed > 0 && <circle cx={x + bw / 2} cy={5} r={3} className="fill-bad" />}
              {i % every === 0 && (
                <text x={x + bw / 2} y={H - 5} textAnchor="middle" className="fill-current text-[11px] text-ink/45">
                  {tickLabel(b.t, hourly)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-5 z-10 whitespace-nowrap rounded border border-line-strong bg-raised px-2 py-1 text-xs shadow-md" style={{ left: Math.min(Math.max(pad.l + hover * bw - 40, 0), W - 150) }}>
          {tickLabel(buckets[hover]!.t, hourly)} · {num(buckets[hover]!.items)} items · {buckets[hover]!.runs} runs{buckets[hover]!.failed ? ` · ${buckets[hover]!.failed} failed` : ""}
        </div>
      )}
    </div>
  );
}

const SERIES = ["var(--st-c1)", "var(--st-c2)", "var(--st-c3)", "var(--st-c4)", "var(--st-c5)"];

/** Lines of use (0-100 %) per account over time. Colour follows the account's position in the list, not its value. */
function UseChart({ r, field, title, pause }: { r: Rates; field: "fiveHourPct" | "weeklyPct"; title: string; pause: number | undefined }) {
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 170;
  const pad = { l: 34, r: 8, t: 8, b: 20 };
  const n = r.accounts[0]?.samples.length ?? 0;
  if (!n) return <p className="text-sm text-ink/55">No readings yet.</p>;
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / 100);
  const ts = r.accounts[0]!.samples.map((s) => s.t);
  const every = Math.ceil((W < 400 ? 70 : 56) / ((W - pad.l - pad.r) / Math.max(1, n - 1)));
  const hourly = r.bucket === "hour";
  const label = (t: string) => (hourly ? tickLabel(t, true) : `${new Date(t).toLocaleDateString("en", { weekday: "short" })} ${clock(t)}`);
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {r.accounts.map((a, k) => (
          <li key={a.id} className="flex items-center gap-1.5 text-xs text-ink/70">
            <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES[k] }} />
            {a.label}
          </li>
        ))}
      </ul>
      <div ref={box} className="relative w-full">
        <svg
          width={W}
          height={H}
          className="block touch-pan-y"
          role="img"
          aria-label={title}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setHover(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - rect.left - pad.l) / (W - pad.l - pad.r)) * (n - 1)))));
          }}
        >
          {[0, 50, 100].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--st-line)" strokeDasharray={t === 0 ? undefined : "2 3"} />
              <text x={pad.l - 5} y={y(t) + 3} textAnchor="end" className="fill-current text-[11px] text-ink/45">
                {t}%
              </text>
            </g>
          ))}
          {pause !== undefined && <line x1={pad.l} x2={W - pad.r} y1={y(pause)} y2={y(pause)} className="stroke-bad" strokeOpacity={0.5} strokeDasharray="4 3" />}
          {ts.map((t, i) => i % every === 0 && (
            <text key={t} x={x(i)} y={H - 5} textAnchor={i === 0 ? "start" : "middle"} className="fill-current text-[11px] text-ink/45">
              {tickLabel(t, hourly)}
            </text>
          ))}
          {r.accounts.map((a, k) => {
            const pts = a.samples.map((s, i) => (s[field] === null ? null : `${x(i)},${y(s[field]!)}`)).filter(Boolean);
            return <polyline key={a.id} points={pts.join(" ")} fill="none" stroke={SERIES[k]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={hover === null ? 1 : 0.9} />;
          })}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgb(var(--st-fg-rgb))" strokeOpacity={0.3} />
              {r.accounts.map((a, k) => a.samples[hover]?.[field] != null && <circle key={a.id} cx={x(hover)} cy={y(a.samples[hover]![field]!)} r={4} fill={SERIES[k]} stroke="var(--st-bg)" strokeWidth={2} />)}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded border border-line-strong bg-raised px-2 py-1 text-xs shadow-md" style={{ left: Math.min(Math.max(x(hover) - 70, 0), W - 190) }}>
            <div className="text-ink/60">{label(ts[hover]!)}</div>
            {r.accounts.map((a, k) => (
              <div key={a.id} className="num flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: SERIES[k] }} />
                {a.label}: {a.samples[hover]?.[field] ?? "–"}
                {a.samples[hover]?.[field] != null && " %"}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function RatesView() {
  const [win, setWin] = useState<"24h" | "7d">("24h");
  const q = useQuery<Rates>(`rates-${win}`, (a) => a.rates(win));
  const pause = useQuery<UsagePause>("accounts-pause", (a) => a.accounts.pause()).data;
  const r = q.data;
  const hourly = r?.bucket === "hour";
  const per = hourly ? "hour" : "day";
  return (
    <Page title="Rates" sub="Items moving through the pipeline and account use">
      <div className="mt-3 flex items-center gap-3">
        <Segmented<"24h" | "7d"> label="Window" value={win} onChange={setWin} options={[{ value: "24h", label: "Last 24 hours" }, { value: "7d", label: "Last 7 days" }]} />
      </div>
      <ErrorLine error={q.error?.message} className="mt-3" />
      {r && (
        <div className={cn("mt-4 space-y-4", q.loading && "opacity-70")}>
          <Block title={`Items moved per ${per}`} aside="a red dot marks a bucket with failed runs">
            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
              {r.stages.map((s) => {
                const items = s.buckets.reduce((a, b) => a + b.items, 0);
                const runs = s.buckets.reduce((a, b) => a + b.runs, 0);
                const failed = s.buckets.reduce((a, b) => a + b.failed, 0);
                return (
                  <div key={s.step} className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
                      <h3 className="text-sm font-semibold">{s.title}</h3>
                      <span className="num text-xs text-ink/55">
                        {num(items)} items · {num(runs)} runs{failed > 0 && <span className="text-bad"> · {failed} failed</span>}
                      </span>
                    </div>
                    <StageChart buckets={s.buckets} hourly={hourly} title={s.title} />
                  </div>
                );
              })}
            </div>
            <StageTable r={r} />
          </Block>
          <Block title="Account use over time" aside="dashed line: pause level">
            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
              <div className="min-w-0">
                <h3 className="mb-1 text-sm font-semibold">5-hour use</h3>
                <UseChart r={r} field="fiveHourPct" title="5-hour use per account over time" pause={pause?.fiveHour} />
              </div>
              <div className="min-w-0">
                <h3 className="mb-1 text-sm font-semibold">Weekly use</h3>
                <UseChart r={r} field="weeklyPct" title="Weekly use per account over time" pause={pause?.weekly} />
              </div>
            </div>
          </Block>
        </div>
      )}
    </Page>
  );
}

/** The same numbers as text, for screen readers and for reading exact values. */
function StageTable({ r }: { r: Rates }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-xs text-ink/60">Show as a table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="num w-full min-w-[420px] text-sm">
          <thead className="text-xs text-ink/55">
            <tr>
              <th className="h-7 text-left font-medium">Stage</th>
              <th className="h-7 text-right font-medium">Items</th>
              <th className="h-7 text-right font-medium">Runs</th>
              <th className="h-7 text-right font-medium">Failed</th>
            </tr>
          </thead>
          <tbody>
            {r.stages.map((s) => (
              <tr key={s.step} className="border-t border-line">
                <td className="py-1">{s.title}</td>
                <td className="text-right">{num(s.buckets.reduce((a, b) => a + b.items, 0))}</td>
                <td className="text-right">{num(s.buckets.reduce((a, b) => a + b.runs, 0))}</td>
                <td className="text-right">{s.buckets.reduce((a, b) => a + b.failed, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

