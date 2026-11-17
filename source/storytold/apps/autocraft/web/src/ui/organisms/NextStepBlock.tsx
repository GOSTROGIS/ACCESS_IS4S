import { useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { NextStep } from "../../api/types";
import { Badge, type Tone } from "../atoms/Badge";
import { cn } from "../cn";
import { Block } from "../molecules/Block";
import { NextItemRow } from "../molecules/NextItemRow";

const TONE: Record<NextStep["kind"], Tone> = { ok: "ok", running: "accent", off: "neutral", breaker: "bad", limit: "warn", account: "warn", backoff: "warn", approval: "warn" };
const LABEL: Record<NextStep["kind"], string> = { ok: "Can run", running: "Running", off: "Pipeline off", breaker: "Breaker tripped", limit: "Limit reached", account: "Paused", backoff: "Backing off", approval: "Not approved" };

/** A pipeline step: whether it can run now, the items its next job takes in order, and the items its guard holds back, collapsed. */
export function NextStepBlock({ step, className }: { step: NextStep; className?: string }) {
  const [open, setOpen] = useState(false);
  const ready = step.items.filter((i) => !i.blocked);
  const held = step.items.filter((i) => i.blocked);
  return (
    <Block
      className={className}
      flush
      title={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {step.title}
          <Badge tone={TONE[step.kind]}>{LABEL[step.kind]}</Badge>
        </span>
      }
      aside={step.stage}
    >
      {step.why && <p className={cn("border-b border-line px-4 py-2 text-xs", step.kind === "breaker" ? "text-bad" : "text-ink/60")}>{step.why}</p>}
      {step.note && !step.why && <p className="border-b border-line px-4 py-2 text-xs text-ink/60">{step.note}</p>}
      {ready.length === 0 && held.length === 0 && <p className="px-4 py-3 text-sm text-ink/50">Nothing queued.</p>}
      {ready.length > 0 && (
        <ul>
          {ready.map((i, k) => (
            <NextItemRow key={`${i.repo}#${i.number}`} item={i} place={k + 1} />
          ))}
        </ul>
      )}
      {step.total > step.items.length && <p className="border-t border-line px-4 py-2 text-xs text-ink/50">{step.total - step.items.length} more</p>}
      {held.length > 0 && (
        <div className={cn(ready.length > 0 && "border-t border-line")}>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-xs text-ink/60 hover:bg-ink/[0.03] max-md:min-h-11">
            <CaretRightIcon size={12} className={cn("transition-transform", open && "rotate-90")} aria-hidden />
            Held back <span className="num opacity-70">{held.length}</span>
          </button>
          {open && (
            <ul className="border-t border-line">
              {held.map((i) => (
                <NextItemRow key={`${i.repo}#${i.number}`} item={i} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Block>
  );
}
