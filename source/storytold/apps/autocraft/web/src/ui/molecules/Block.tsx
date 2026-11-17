import type { ReactNode } from "react";
import { cn } from "../cn";

/** Titled, bordered section with an optional aside on the right of the title. `flush` drops the body padding; `scroll` lets the body scroll sideways. */
export function Block({ title, aside, children, className, flush, scroll }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; flush?: boolean; scroll?: boolean }) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-md border border-line", className)}>
      <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside && <div className="ml-auto text-xs text-ink/50">{aside}</div>}
      </div>
      <div className={cn(!flush && "p-4", scroll && "overflow-x-auto")}>{children}</div>
    </section>
  );
}
