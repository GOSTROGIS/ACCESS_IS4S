import { cn } from "../cn";

export interface Bar { key: string; label: string; value: number; /** Tailwind background class; defaults to the accent. */ tone?: string }

/** A "nice" axis maximum at or above `max`, split into four equal steps. */
function niceMax(max: number): number {
  if (max <= 0) return 4;
  const step = max / 4;
  const mag = 10 ** Math.floor(Math.log10(step));
  const m = [1, 2, 2.5, 5, 10].find((x) => x * mag >= step)! * mag;
  return m * 4;
}

export const compact = (n: number): string => {
  const a = Math.abs(n);
  const f = (v: number, s: string) => `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${s}`;
  return a >= 1e9 ? f(n / 1e9, "B") : a >= 1e6 ? f(n / 1e6, "M") : a >= 1e3 ? f(n / 1e3, "K") : String(Math.round(n));
};

const exact = (n: number) => n.toLocaleString("en");
const percent = (v: number, total: number) => (total ? `${((100 * v) / total).toFixed(1)}%` : "0%");

/**
 * Horizontal bars with the label on the left and the exact count and share after each bar.
 * `axis` adds a light scale of five ticks under the bars. Percentages are shares of the listed total.
 */
export function BarList({ bars, axis, labelClass = "w-28 max-md:w-24", valueClass = "w-28", dense, ariaLabel }: { bars: Bar[]; axis?: boolean; labelClass?: string; valueClass?: string; /** Label and value above the bar, for narrow cards. */ dense?: boolean; ariaLabel: string }) {
  const total = bars.reduce((s, b) => s + b.value, 0);
  const top = axis ? niceMax(Math.max(0, ...bars.map((b) => b.value))) : Math.max(1, ...bars.map((b) => b.value));
  const ticks = [0, 1, 2, 3, 4].map((i) => (top * i) / 4);
  return (
    <div role="list" aria-label={ariaLabel} className="num text-sm">
      {bars.map((b) =>
        dense ? (
          <div key={b.key} role="listitem" className="py-1.5">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-ink/80" title={b.label}>{b.label}</span>
              <span className="shrink-0 whitespace-nowrap">{exact(b.value)} <span className="text-ink/50">{percent(b.value, total)}</span></span>
            </div>
            <div className="mt-1 h-2.5">
              <div className={cn("h-full rounded-sm", b.tone ?? "bg-accent")} style={{ width: `${Math.max(b.value ? 0.5 : 0, (b.value / top) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <div key={b.key} role="listitem" className="flex items-center gap-2 py-1">
            <div className={cn("shrink-0 truncate text-ink/80", labelClass)} title={b.label}>{b.label}</div>
            <div className="relative h-5 min-w-0 flex-1">
              <div className={cn("h-full rounded-sm", b.tone ?? "bg-accent")} style={{ width: `${Math.max(b.value ? 0.5 : 0, (b.value / top) * 100)}%` }} />
            </div>
            <div className={cn("shrink-0 whitespace-nowrap text-right text-xs", valueClass)}>
              {exact(b.value)} <span className="text-ink/50">{percent(b.value, total)}</span>
            </div>
          </div>
        ),
      )}
      {axis && (
        <div className="flex gap-2 pt-1 text-xs text-ink/45" aria-hidden>
          {!dense && <div className={cn("shrink-0", labelClass)} />}
          <div className="relative h-4 min-w-0 flex-1">
            {ticks.map((t, i) => (
              <span key={i} className={cn("absolute top-0", dense && i % 2 === 1 && "hidden")} style={{ left: `${i * 25}%`, transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : "translateX(-50%)" }}>{compact(t)}</span>
            ))}
          </div>
          {!dense && <div className={cn("shrink-0", valueClass)} />}
        </div>
      )}
    </div>
  );
}
