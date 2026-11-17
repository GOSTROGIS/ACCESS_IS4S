import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../cn";

/** A page section: heading with an optional count and link, then the body. No border: rows carry their own hairlines. */
export function Section({ title, count, to, linkLabel, children, className, id }: { title: ReactNode; count?: number; to?: string; linkLabel?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("min-w-0", className)}>
      <div className="mb-1 flex min-h-8 items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && <span className="num text-xs text-ink/50">{count}</span>}
        {to && (
          <Link to={to} className="ml-auto inline-flex items-center gap-1 text-xs text-accent-ink hover:underline max-md:h-11">
            {linkLabel ?? "All"} <ArrowRightIcon className="text-[11px]" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
