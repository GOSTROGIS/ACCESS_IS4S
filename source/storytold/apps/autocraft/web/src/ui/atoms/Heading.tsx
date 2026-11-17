import type { ReactNode } from "react";
import { cn } from "../cn";

/** Small sentence-case section heading. */
export function SectionTitle({ children, className, as: As = "h2" }: { children: ReactNode; className?: string; as?: "span" | "h2" | "h3" | "div" }) {
  return <As className={cn("text-xs font-semibold text-ink/60", className)}>{children}</As>;
}

/** Muted count beside a heading or tab. */
export function Count({ n, className }: { n: number | undefined; className?: string }) {
  if (n === undefined) return null;
  return <span className={cn("num rounded-full bg-ink/[0.08] px-1.5 text-2xs font-medium text-ink/60", className)}>{n}</span>;
}
