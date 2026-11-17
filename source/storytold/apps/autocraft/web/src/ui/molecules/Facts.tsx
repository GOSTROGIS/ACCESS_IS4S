import type { ReactNode } from "react";
import { cn } from "../cn";

/** Label and value pairs in two columns; rows whose value is null or false are left out. */
export function Facts({ rows, className }: { rows: [string, ReactNode][]; className?: string }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== false && v !== "");
  if (!shown.length) return null;
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm", className)}>
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink/55">{k}</dt>
          <dd className="min-w-0 break-words [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
