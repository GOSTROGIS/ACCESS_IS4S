import { FastForwardIcon } from "@phosphor-icons/react";
import type { NextItem } from "../../api/types";
import { cn } from "../cn";
import { Badge } from "../atoms/Badge";
import { ItemRef } from "./ItemRef";

/** One item a step will take: its place, fast-track mark, the item, why it is due, and what holds it back. The whole row opens the item. */
export function NextItemRow({ item, place }: { item: NextItem; place?: number }) {
  return (
    <li className={cn("relative flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line px-4 py-2 last:border-0 hover:bg-ink/[0.03]", !item.next && "opacity-70")}>
      <span className="mt-0.5 flex w-9 shrink-0 items-center gap-1 text-xs text-ink/45">
        <span className="num w-4">{place ?? ""}</span>
        {item.fast && <FastForwardIcon size={14} className="text-accent-ink" aria-label="Fast track" />}
      </span>
      <ItemRef repo={item.repo} number={item.number} kind={item.kind} state={item.state} title={item.title} stretch className="min-w-[12rem] flex-1 max-md:min-w-[calc(100%-4.5rem)]" />
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/60 md:max-w-[45%] md:justify-end">
        {item.inFlight && <Badge tone="accent">In flight</Badge>}
        {item.blocked && <Badge tone="warn">{item.blocked}</Badge>}
        <span>{item.why}</span>
        {item.rank !== null && <span className="num text-ink/40">rank {Math.round(item.rank)}</span>}
      </span>
    </li>
  );
}
