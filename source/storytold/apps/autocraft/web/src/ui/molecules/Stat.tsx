import type { ReactNode } from "react";

/** Label, large value and an optional sub line, in a tinted card. */
export function Stat({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-raised/40 px-4 py-3">
      <div className="text-xs text-ink/55">{label}</div>
      <div className="num mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink/50">{sub}</div>}
    </div>
  );
}
