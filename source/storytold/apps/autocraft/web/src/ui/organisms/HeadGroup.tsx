import type { ReactNode } from "react";
import { GitCommitIcon } from "@phosphor-icons/react";
import { shortSha } from "../../lib/trace";

/** A run of timeline events that belong to one head commit: a heading with the short sha and who pushed it, then the events. */
export function HeadGroup({ head, pushedBy, children }: { head: string | null; pushedBy?: string | null; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="flex min-h-8 flex-wrap items-center gap-x-2 border-b border-line bg-ink/[0.03] px-3 py-1 text-xs text-ink/65">
        <GitCommitIcon className="text-[13px]" />
        {head ? (
          <>
            <span className="code font-medium text-ink/85" title={head}>{shortSha(head)}</span>
            {pushedBy && <span>pushed by {pushedBy}</span>}
          </>
        ) : (
          <span>Before any push</span>
        )}
      </h3>
      <ol>{children}</ol>
    </section>
  );
}
