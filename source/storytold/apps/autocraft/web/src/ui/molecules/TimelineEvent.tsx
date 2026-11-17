import type { ReactNode } from "react";
import { CaretDownIcon, CaretRightIcon, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "../cn";
import { TimeAgo } from "../atoms/TimeAgo";

/**
 * One row of an event timeline: kind icon, summary, actor and time. The row is a disclosure button;
 * `children` are the expanded body and are only rendered while open.
 */
export function TimelineEvent({ id, lead, Icon, iconLabel, iconTone, at, actor, actorTone, cost, summary, open, onToggle, flush, children }: {
  id: string;
  /** A line above the row that is not part of the disclosure button (a link to the item, say). */
  lead?: ReactNode;
  Icon: PhosphorIcon;
  /** Names the kind for screen readers. */
  iconLabel?: string;
  /** "ours" draws the icon in the accent colour: AutoCraft did it. */
  iconTone?: "ours" | "person";
  at: string;
  actor: string;
  /** "ours" tints AutoCraft steps and models; people stay plain. */
  actorTone?: "ours" | "person";
  /** Formatted model cost, shown in the meta line; omitted when unknown. */
  cost?: string | null;
  summary: string;
  open: boolean;
  onToggle: () => void;
  /** The body holds rows of its own and needs no inset on the left. */
  flush?: boolean;
  children?: ReactNode;
}) {
  const Caret = open ? CaretDownIcon : CaretRightIcon;
  return (
    <li id={`event-${id}`} className="border-b border-line last:border-0">
      {lead && <div className="min-w-0 px-3 pb-0 pl-[42px] pt-2 max-md:pl-3">{lead}</div>}
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={cn("flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors duration-fast hover:bg-ink/[0.03] max-md:min-h-11", open && "bg-ink/[0.03]")}
      >
        <span role={iconLabel ? "img" : undefined} aria-label={iconLabel} className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong bg-panel", iconTone === "ours" ? "text-accent-ink" : "text-ink/60")}>
          <Icon className="text-[11px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm leading-5 [overflow-wrap:anywhere]">{summary}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink/55">
            <span className={cn(actorTone === "ours" && "text-accent-ink")}>{actor}</span>
            <TimeAgo iso={at} className="num" />
            {cost && <span className="num" title="Model cost">{cost}</span>}
          </span>
        </span>
        <Caret className="mt-1 shrink-0 text-ink/40" />
      </button>
      {open && <div className={cn("border-t border-line bg-ink/[0.02] px-3 py-3 pl-[42px] max-md:pl-3", flush && "pl-3")}>{children}</div>}
    </li>
  );
}
