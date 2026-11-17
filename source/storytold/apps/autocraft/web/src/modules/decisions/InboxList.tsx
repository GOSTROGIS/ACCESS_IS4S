import { useEffect, useRef, useState } from "react";
import { QueueBadge } from "../../ui/molecules/QueueBadge";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../api/client";
import { canComment } from "../../registry/permissions";
import { CheckIcon, ArrowUUpLeftIcon, UsersIcon } from "@phosphor-icons/react";
import type { Decision, DecisionList } from "../../api/types";
import type { Command, ViewProps } from "../../registry/types";
import { useHotkeys, useShortcutHelp } from "../../shell/keyboard";
import { Button } from "../../ui/atoms/Button";
import { cn } from "../../ui/cn";
import { ago, ageDays, when } from "../../lib/format";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { ClaimPill, KIND_ICON } from "./parts";
import { canTakeBack } from "./access";
import { AnswerNotice } from "./AnswerNotice";
import { ExecLine } from "./ExecLine";
import { KIND_LABEL, KINDS, localActions, useDecisionFilter, useDecisionList, useLocal, useUndo } from "./state";
import { useNow } from "../../lib/useNow";
import { decisionPath } from "../../lib/links";
import { MultiAnswer } from "./MultiAnswer";

const SHORTCUTS: Command[] = [
  { id: "d-next", keys: "j", label: "Next decision", group: "Decisions" },
  { id: "d-prev", keys: "k", label: "Previous decision", group: "Decisions" },
  { id: "d-answer", keys: "1 – 4", label: "Select an option in Answer directly in a batch answer (it never submits)", group: "Decisions" },
  { id: "d-confirm", keys: "1 – 4 again, Enter", label: "Confirm an option that writes to GitHub (Esc cancels)", group: "Decisions" },
  { id: "d-note", keys: "n", label: "Write the answer note", group: "Decisions" },
  { id: "d-check", keys: "x", label: "Check for a batch answer", group: "Decisions" },
  { id: "d-undo", keys: "u", label: "Undo last answer", group: "Decisions" },
  { id: "d-open", keys: "o", label: "Open the item page of the highlighted decision", group: "Decisions" },
  { id: "d-tab", keys: "g a", label: "Waiting / answered tab", group: "Decisions" },
];

export function summaryLine(data: DecisionList | undefined) {
  if (!data) return "";
  const parts = KINDS.filter((k) => data.byKind[k]).map((k) => `${data.byKind[k]} ${KIND_LABEL[k].toLowerCase()}`);
  return parts.join(" · ");
}

/** j/k move the cursor over the rows; o opens the cursor row's item page. */
export function useInboxKeys(list: Decision[], id: string | undefined, setId: (id: string) => void) {
  const { filter, update } = useDecisionFilter();
  const undo = useUndo();
  const navigate = useNavigate();
  const idx = list.findIndex((d) => d.id === id);
  const cur = list[idx];
  useShortcutHelp(SHORTCUTS);
  useHotkeys({
    j: () => list.length && setId(list[Math.min(idx + 1, list.length - 1)].id),
    k: () => list.length && setId(list[Math.max(idx - 1, 0)].id),
    x: () => cur && localActions.toggle(cur.id),
    u: () => void undo(),
    o: () => cur && navigate(decisionPath(cur)),
    escape: () => localActions.clearChecked(),
    "g a": () => update({ tab: filter.status === "answered" ? null : "answered" }),
  });
}

/** Scroll offset of the phone list, kept while a decision is open on top of it. */
let phoneListScroll = 0;

export function InboxList({ user, phone }: ViewProps & { phone?: boolean }) {
  useNow();
  const { data, loading, hasMore, loadMore, loadingMore } = useDecisionList();
  const navigate = useNavigate();
  const api = useApi();
  const [id, setId] = useState<string>();
  const loc = useLocal();
  // The server orders the list (priority, then unclaimed, then age); it stays in that order.
  const list = data?.decisions ?? [];
  const checked = list.filter((d) => loc.checked.has(d.id));
  useInboxKeys(list, id, setId);
  // Opening a question marks it as being looked at, so the others' lists move it down.
  const open = (d: Decision) => {
    if (!d.answer && canComment(user)) void api.decisions.claim(d.id).catch(() => undefined);
    navigate(decisionPath(d));
  };
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [id]);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phone && scroller.current) scroller.current.scrollTop = phoneListScroll;
  }, [phone]);
  const oldest = data?.oldestAskedAt;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!phone && <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4 text-xs">
        <span className="num shrink-0 whitespace-nowrap font-semibold text-ink">{data?.total ?? "–"} decisions</span>
        <span className="truncate text-ink/50">{summaryLine(data) || (loading ? "loading…" : "nothing matches")}</span>
        {oldest && <span className="ml-auto shrink-0 text-ink/50">oldest {ago(oldest)}</span>}
      </div>}
      {!phone && loc.justAnswered.map((a) => (
        <AnswerNotice key={a.id} entry={a} className="shrink-0 border-b border-line" />
      ))}
      <div ref={scroller} onScroll={phone ? (e) => (phoneListScroll = e.currentTarget.scrollTop) : undefined} className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Decisions">
        {list.map((d) => (
          <Row key={d.id} phone={phone} d={d} canUndo={canTakeBack(user, d)} active={d.id === id} checked={loc.checked.has(d.id)} mine={d.opinions.find((o) => o.login === user.login)?.option ?? undefined} onOpen={() => open(d)} activeRef={d.id === id ? activeRef : undefined} />
        ))}
        {phone && data && !loading && !list.length && <p className="py-16 text-center text-sm text-ink/60">Nothing waiting.</p>}
        {hasMore && data && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-ink/55">
            <span className="num">
              {data.decisions.length} of {data.total}
            </span>
            <button className="chip" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          </div>
        )}
      </div>
      {!phone && checked.length > 1 && (
        <div className="max-h-[60%] shrink-0 overflow-y-auto border-t border-line-strong bg-panel">
          <MultiAnswer ds={checked} user={user} />
        </div>
      )}
    </div>
  );
}

function Row({ phone, d, canUndo, active, checked, mine, onOpen, activeRef }: { phone?: boolean; d: Decision; canUndo: boolean; active: boolean; checked: boolean; mine?: string; onOpen: () => void; activeRef?: React.Ref<HTMLDivElement> }) {
  useNow();
  const old = ageDays(d.askedAt) >= 2;
  const opinions = d.opinions.length;
  const item = d.shown;
  const KindIcon = KIND_ICON[d.kind];
  return (
    <div className={cn("group relative flex border-b border-line", active ? "bg-accent/[0.08]" : "hover:bg-ink/[0.03]")}>
      {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      {phone ? <span className="w-4 shrink-0" /> : <label className="flex w-9 shrink-0 cursor-pointer items-start justify-center pt-[11px]" title="Select for a batch answer (x)">
        <input type="checkbox" checked={checked} onChange={() => localActions.toggle(d.id)} className="peer sr-only" aria-label={`Select ${d.title}`} />
        <span className={cn("flex size-3.5 items-center justify-center rounded-sm border peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent-ink", checked ? "border-accent bg-accent text-white" : "border-line-strong opacity-50 group-hover:opacity-100")}>
          {checked && <CheckIcon className="text-[10px]" weight="bold" />}
        </span>
      </label>}
      <div ref={activeRef} role="option" tabIndex={0} aria-selected={active} onClick={onOpen} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }} className="min-w-0 flex-1 cursor-pointer rounded-none py-2 pr-3 text-left">
        <div className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 break-words text-sm", active ? "font-medium text-ink" : "text-ink/90")}>{d.title}</span>
          <span className={cn("num shrink-0 text-xs", old ? "text-warn" : "text-ink/45")} title={`asked ${when(d.askedAt)}`}>
            <TimeAgo iso={d.askedAt} />
          </span>
        </div>
        <div className="mt-0.5 flex items-start gap-1.5 text-xs text-ink/50">
          <span className="inline-flex shrink-0 items-center gap-1 pt-0.5" title={KIND_LABEL[d.kind]}>
            <KindIcon className="text-[12px] text-ink/45" />
            <span className="hidden sm:inline">{KIND_LABEL[d.kind]}</span>
          </span>
          {d.number === null ? (
            <>
              <span className="code shrink-0 text-[11.5px]">{d.repo}</span>
              <span className="shrink-0">· {d.items.length} items</span>
            </>
          ) : (
            // The row selects the decision; clicks on the item's links must not also select it.
            <span className="min-w-0 flex-1" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) e.stopPropagation(); }}>
              <ItemRef repo={d.repo} number={d.number} kind={item?.kind} state={item?.state} title={null} size="sm" />
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 pt-0.5">
            {opinions > 0 && (
              <span className={cn("inline-flex items-center gap-0.5", mine && "text-accent-ink")} title={`picked by ${opinions}${mine ? ", including you" : ""}`}>
                <UsersIcon className="text-[11px]" />
                <span className="num">{opinions}</span>
              </span>
            )}
            {d.number !== null && <QueueBadge slot={d.queue} />}
            {d.answer && d.undoable && canUndo && <RowUndo id={d.id} />}
          </span>
        </div>
        {d.claim && <p className="mt-1"><ClaimPill claim={d.claim} /></p>}
        {d.dispute && <p className="mt-1 break-words text-xs text-warn">{d.dispute.by} disputed {d.answeredBy}&rsquo;s answer: {d.dispute.reason}</p>}
        <ExecLine d={d} canRetry={canUndo} compact />
      </div>
    </div>
  );
}

function RowUndo({ id }: { id: string }) {
  const undo = useUndo();
  const error = useLocal().undoError;
  return (
    <>
      {error?.id === id && <span className="text-bad">{error.message}</span>}
      <Button size="sm" variant="ghost" icon={ArrowUUpLeftIcon} onClick={(e) => { e.stopPropagation(); void undo(id); }}>
        Undo
      </Button>
    </>
  );
}
