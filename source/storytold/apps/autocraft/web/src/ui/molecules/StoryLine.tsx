import { useEffect, useState, type ReactNode } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "../cn";

export type StoryTone = "ok" | "warn" | "bad" | "neutral";
const TONE: Record<StoryTone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", neutral: "text-ink/45" };

/**
 * One line of an item's story: time, icon, text, an optional actor and cost; it opens in place to its details when it has `children`.
 * `turn` lines (people, Opus) read as messages, the others as muted tool-call lines. Props only.
 */
export function StoryLine({ id, time, date, icon: Ico, tone = "neutral", actor, actorTone, text, cost, turn, actions, open: forced, children, className }: {
  id?: string;
  time: string;
  /** Set when the line's day is not today (and differs from the line above). */
  date?: string;
  icon: Icon;
  tone?: StoryTone;
  actor?: string;
  actorTone?: "ours" | "person";
  text: ReactNode;
  cost?: string | null;
  turn?: boolean;
  /** Buttons on the line itself, always visible. */
  actions?: ReactNode;
  /** Opens the line (a jump from the GitHub side). */
  open?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (forced) setOpen(true);
  }, [forced]);
  const expandable = children !== undefined && children !== null && children !== false;
  const head = (
    <>
      <span className="num w-12 shrink-0 pt-px text-xs leading-5 text-ink/45">
        {date && <span className="block text-2xs leading-3">{date}</span>}
        {time}
      </span>
      <Ico weight={turn ? "fill" : "regular"} className={cn("mt-[3px] shrink-0 text-[15px]", turn ? (actorTone === "ours" ? "text-accent-ink" : "text-ink/60") : TONE[tone])} />
      <span className={cn("min-w-0 flex-1 break-words text-left leading-5", turn ? "text-sm text-ink" : "text-[13px] text-ink/60", tone === "bad" && !turn && "text-bad")}>
        {actor && <span className={cn("mr-1.5 font-semibold", actorTone === "ours" ? "text-accent-ink" : "text-ink")}>{actor}</span>}
        {text}
      </span>
      {cost && <span className="num shrink-0 pt-px text-xs leading-5 text-ink/50">{cost}</span>}
      {expandable && <CaretRightIcon className={cn("mt-1 shrink-0 text-[11px] text-ink/40 transition-transform duration-fast", open && "rotate-90")} />}
    </>
  );
  return (
    <li id={id} className={cn("list-none", className)}>
      {expandable ? (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-2 py-1.5 text-left hover:bg-ink/[0.025] max-md:min-h-11">{head}</button>
      ) : (
        <div className="flex w-full items-start gap-2 py-1.5 max-md:min-h-9">{head}</div>
      )}
      {actions && <div className="flex flex-wrap gap-2 pb-1.5 pl-[calc(3rem+1.625rem)]">{actions}</div>}
      {expandable && open && <div className="animate-fadeIn pb-2 pl-[calc(3rem+1.625rem)] text-sm">{children}</div>}
    </li>
  );
}
