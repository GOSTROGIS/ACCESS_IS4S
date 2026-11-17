import type { ReactNode } from "react";

/** The state of a page whose first load has not produced data: an error line once the query failed, else Loading. */
export function Pending({ error }: { error?: Error | null }): ReactNode {
  if (error) return <div role="alert" className="p-6 text-sm text-bad">Could not load this page: {error.message}</div>;
  return <div className="p-6 text-ink/50">Loading…</div>;
}
