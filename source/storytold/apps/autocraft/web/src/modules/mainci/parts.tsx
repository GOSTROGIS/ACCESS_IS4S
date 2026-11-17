import type { MainCiRepo } from "../../api/types";
import { safeHref } from "../../ui/safeHref";

/** The failing checks of a repo, each linked to its run. */
export function FailingChecks({ checks, className }: { checks: MainCiRepo["failing"]; className?: string }) {
  if (!checks.length) return <span className={className ?? "text-ink/40"}>–</span>;
  return (
    <span className={className ?? "flex flex-wrap gap-x-3 gap-y-0.5"}>
      {checks.map((c) => (
        c.url ? (
          <a key={c.name} href={safeHref(c.url)} target="_blank" rel="noopener noreferrer" className="relative z-10 text-bad hover:underline">
            {c.name}
          </a>
        ) : (
          <span key={c.name} className="text-bad">
            {c.name}
          </span>
        )
      ))}
    </span>
  );
}
