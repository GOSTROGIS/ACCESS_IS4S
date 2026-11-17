import { useState } from "react";
import { Dialog } from "radix-ui";
import { SlidersHorizontalIcon, XIcon } from "@phosphor-icons/react";
import type { ViewProps } from "../../registry/types";
import { cn } from "../../ui/cn";
import { AnswerNotice } from "./AnswerNotice";
import { InboxList, summaryLine } from "./InboxList";
import { DecisionsToolbar } from "./Toolbar";
import { useDecisionFilter, useDecisionList, useLocal } from "./state";

/** Phone flow: the list of decisions, filters in a sheet. A row opens the decision's item page. */
export function PhoneInbox(props: ViewProps) {
  const { data, loading } = useDecisionList();
  const { filter } = useDecisionFilter();
  const loc = useLocal();
  const [sheet, setSheet] = useState(false);
  const active = (filter.kind?.length ?? 0) + (filter.repo?.length ?? 0) + (filter.minAge ? 1 : 0) + (filter.all ? 1 : 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="num shrink-0 text-sm font-semibold">{data?.total ?? "–"} decisions</span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink/50">{summaryLine(data) || (loading ? "loading…" : "nothing matches")}</span>
        <button onClick={() => setSheet(true)} className={cn("chip h-8", active > 0 && "border-accent/50 text-accent-ink")} aria-label="Filters">
          <SlidersHorizontalIcon className="text-[11px]" />
          {active > 0 ? active : "Filter"}
        </button>
      </div>
      {loc.justAnswered.map((a) => (
        <AnswerNotice key={a.id} entry={a} className="shrink-0 border-b border-line px-4" />
      ))}
      <div className="flex min-h-0 flex-1 flex-col">
        <InboxList {...props} phone />
      </div>
      <Dialog.Root open={sheet} onOpenChange={setSheet}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 animate-fadeIn" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 rounded-t-lg border-t border-line-strong bg-raised px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 animate-rise">
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="text-md font-semibold">Filter decisions</Dialog.Title>
              <Dialog.Close className="flex size-11 items-center justify-center text-ink/60" aria-label="Close">
                <XIcon />
              </Dialog.Close>
            </div>
            <DecisionsToolbar {...props} phone />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
