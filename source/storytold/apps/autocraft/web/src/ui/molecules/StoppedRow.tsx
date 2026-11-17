import type { ReactNode } from "react";
import type { NeedsStoppedRow } from "../../api/types";
import { Badge } from "../atoms/Badge";
import { TimeAgo } from "../atoms/TimeAgo";

const KIND: Record<NeedsStoppedRow["kind"], string> = { breaker: "Tripped", limit: "Paused", account: "No headroom", act: "Close failed", "fix-group": "Fix stopped", "outside-group": "Held" };

/** A stage or account that stopped; `action` is the control that resumes it. */
export function StoppedRow({ row, action }: { row: NeedsStoppedRow; action?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{row.title}</span>
          <Badge tone="warn">{KIND[row.kind]}</Badge>
          {row.since && <TimeAgo iso={row.since} className="text-xs text-ink/50" />}
        </div>
        {row.reason && <p className="mt-0.5 break-words text-sm text-ink/70">{row.reason}</p>}
      </div>
      {action}
    </li>
  );
}
