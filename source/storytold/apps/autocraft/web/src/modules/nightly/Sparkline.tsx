// A benchmark's values as an inline SVG line; the last point is marked. Lower is faster, so a rise is drawn in the warning colour.
export function Sparkline({ points, rising, label }: { points: number[]; rising: boolean; label: string }) {
  const W = 120;
  const H = 28;
  if (points.length < 2) return <svg role="img" aria-label={label} width={W} height={H} />;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const xy = points.map((v, i): [number, number] => [(i / (points.length - 1)) * (W - 4) + 2, H - 3 - ((v - lo) / span) * (H - 6)]);
  const last = xy[xy.length - 1]!;
  const color = rising ? "var(--color-warn, #b45309)" : "currentColor";
  return (
    <svg role="img" aria-label={label} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={rising ? "text-warn" : "text-ink/60"}>
      <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}
