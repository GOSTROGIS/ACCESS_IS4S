import { useState } from "react";
import { Link } from "react-router-dom";
import { CubeIcon, GearIcon, GitMergeIcon, PencilSimpleIcon, QuestionIcon, SparkleIcon, WarningIcon, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { NowEntry, NowEntryKind } from "../../api/types";
import { nowMs, num, span } from "../../lib/format";
import { batchPath, itemPath } from "../../lib/links";
import { Badge } from "../atoms/Badge";
import { TimeAgo } from "../atoms/TimeAgo";
import { cn } from "../cn";
import { ItemRef } from "./ItemRef";

const ICON: Record<NowEntryKind, PhosphorIcon> = { job: GearIcon, call: SparkleIcon, task: CubeIcon, batch: GitMergeIcon, write: PencilSimpleIcon, merge: GitMergeIcon, decision: QuestionIcon, failure: WarningIcon };

/** Where an entry leads: its merge batch's page, else the item's timeline at the entry's event, else its run, job, task, batch or decision page. */
const hrefOf = (e: Pick<NowEntry, "item" | "event" | "detail" | "batchId">): string | null =>
  e.batchId !== null ? batchPath(e.batchId) : e.item && e.event ? `${itemPath(e.item.repo, e.item.number)}#event=${encodeURIComponent(e.event)}` : (e.detail ?? (e.item ? itemPath(e.item.repo, e.item.number) : null));

const INLINE_ITEMS = 3;

/** Up to three items, one per line; more than that folds behind "+N more", which opens the whole list in place. */
function Items({ items, total }: { items: NowEntry["items"]; total: number }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, INLINE_ITEMS);
  const hidden = Math.max(total, items.length) - INLINE_ITEMS;
  return (
    <div className="mt-1 flex flex-col items-start gap-0.5">
      {shown.map((i) => (
        <ItemRef key={`${i.repo}#${i.number}`} repo={i.repo} number={i.number} kind={i.kind} state={i.state} title={i.title} size="sm" className="relative z-10 w-fit max-w-full" />
      ))}
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="relative z-10 text-xs text-ink/60 hover:text-ink max-md:min-h-11">
          {open ? "Show fewer" : `+${num(hidden)} more`}
        </button>
      )}
    </div>
  );
}

/**
 * One unit of work: what it is, how long it runs or when it ended, the latest progress line or the outcome, the items it covers and the
 * writes made on them. The row is the link; item links sit above it. A running entry and its finished self are the same row.
 */
export function EntryRow({ entry: e }: { entry: NowEntry }) {
  const Icon = ICON[e.kind];
  const href = hrefOf(e);
  const live = e.state === "running" || e.state === "queued";
  const title = <span className="text-sm font-medium [overflow-wrap:anywhere]">{e.title}</span>;
  return (
    <li className="relative flex gap-2.5 border-b border-line px-3 py-2 last:border-0 hover:bg-ink/[0.03] max-md:min-h-11">
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border bg-panel", e.state === "failed" ? "border-bad/40 text-bad" : "border-line-strong text-ink/60")}>
        {e.state === "failed" ? <WarningIcon className="text-[11px]" aria-hidden /> : <Icon className="text-[11px]" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {href ? <Link to={href} className="after:absolute after:inset-0">{title}</Link> : title}
          {e.what && <Badge tone={e.kind === "call" ? "accent" : "neutral"}>{e.what}</Badge>}
          {e.state === "running" && e.kind === "job" && <Badge tone="accent">Running</Badge>}
          {e.state === "queued" && <Badge>Queued</Badge>}
          {e.state === "failed" && e.kind === "job" && <Badge tone="bad">Failed</Badge>}
          <span className="num ml-auto text-xs text-ink/60">{live ? span(nowMs() - Date.parse(e.at)) : <TimeAgo iso={e.endedAt ?? e.at} />}</span>
        </div>
        {e.summary && <p className={cn("mt-0.5 text-sm [overflow-wrap:anywhere]", e.state === "failed" ? "text-bad" : "text-ink/80")}>{e.summary}</p>}
        {e.items.length > 0 ? <Items items={e.items} total={e.itemCount} /> : e.kind !== "write" && e.kind !== "merge" && <p className="mt-1 text-xs text-ink/55">{e.repo ?? "System"}</p>}
        {e.progress && <p className="mt-1 text-xs text-ink/50 [overflow-wrap:anywhere]">{e.progress}</p>}
        {e.writes.map((w) => (
          <div key={w.summary} className="mt-1.5 border-l border-line pl-3">
            <p className="text-xs text-ink/70">{w.summary}</p>
            {e.kind !== "job" && <Items items={w.items} total={w.items.length + w.more} />}
          </div>
        ))}
        {e.children.length > 0 && (
          <ul className="mt-1.5 ml-1 border-l border-line pl-3">
            {e.children.map((c) => (
              <ChildRow key={c.key} entry={c} />
            ))}
          </ul>
        )}
        {e.kind !== "job" && <span className="mt-0.5 block text-xs text-ink/55">{e.actor}</span>}
      </div>
    </li>
  );
}

/** A model call or build task of a running job, under the job's row, with its own elapsed time and link. */
function ChildRow({ entry: c }: { entry: NowEntry }) {
  const Icon = ICON[c.kind];
  const href = hrefOf(c);
  return (
    <li className="relative flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded py-1 hover:bg-ink/[0.04] max-md:min-h-11">
      <Icon className="shrink-0 text-ink/55" aria-hidden />
      {href ? <Link to={href} className="text-xs font-medium after:absolute after:inset-0">{c.kind === "task" ? "Build task" : c.title}</Link> : <span className="text-xs font-medium">{c.title}</span>}
      {c.what && <Badge tone={c.kind === "call" ? "accent" : "neutral"}>{c.what}</Badge>}
      {c.state === "queued" && <Badge>Queued</Badge>}
      <span className="num ml-auto text-xs text-ink/60">{span(nowMs() - Date.parse(c.at))}</span>
      {c.progress && <p className="w-full text-xs text-ink/50 [overflow-wrap:anywhere]">{c.progress}</p>}
    </li>
  );
}
