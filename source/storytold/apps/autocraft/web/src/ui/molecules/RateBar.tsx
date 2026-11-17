import { cn } from "../cn";

/** A thin horizontal bar filled to `frac` (0 to 1). */
export function RateBar({ frac, className }: { frac: number; className?: string }) {
  return (
    <div className={cn("h-2 w-24 overflow-hidden rounded-sm bg-ink/[0.07]", className)} aria-hidden>
      <div className="h-full bg-c1" style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
    </div>
  );
}
