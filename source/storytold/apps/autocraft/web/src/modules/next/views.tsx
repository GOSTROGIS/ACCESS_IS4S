// Merge queue (the default tab): every PR in the merge queue as one table, by the step it waits on. Steps: what each pipeline step takes next, in the planner's order, and what waits on something outside.
import { UnlessProject } from "../../shell/ScopePicker";
import { useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "../../api/client";
import type { NextPage, NextWaiting } from "../../api/types";
import { num } from "../../lib/format";
import { cn } from "../../ui/cn";
import { EmptyState } from "../../ui/atoms/EmptyState";
import { Block } from "../../ui/molecules/Block";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { NextStepBlock } from "../../ui/organisms/NextStepBlock";
import { ErrorLine, Page } from "../admin/parts";
import { QueueItems } from "../queue/QueueItems";
import { MergeBoard } from "../queue/MergeBoard";
import { RecentlyMerged } from "../queue/RecentlyMerged";
import { RepoSelect } from "../../ui/molecules/RepoSelect";

const TABS = [
  ["merge", "Merge queue"],
  ["merged", "Recently merged"],
  ["steps", "Steps"],
] as const;

function WaitingGroup({ wait, items }: { wait: string; items: NextWaiting[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line last:border-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-sm hover:bg-ink/[0.03] max-md:min-h-11">
        <CaretRightIcon size={12} className={cn("shrink-0 transition-transform", open && "rotate-90")} aria-hidden />
        {wait} <span className="num text-xs text-ink/50">{items.length}</span>
      </button>
      {open && (
        <ul className="border-t border-line">
          {items.map((w) => (
            <li key={`${w.repo}#${w.number}`} className="relative flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line px-4 py-2 pl-9 last:border-0 hover:bg-ink/[0.03]">
              <ItemRef repo={w.repo} number={w.number} kind={w.kind} state={w.state} title={w.title} stretch className="min-w-[12rem] flex-1" />
              {w.why && <span className="text-xs text-ink/60">{w.why}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Waiting({ page }: { page: NextPage }) {
  if (!page.waiting.length) return null;
  const groups = new Map<string, NextWaiting[]>();
  for (const w of page.waiting) groups.set(w.wait, [...(groups.get(w.wait) ?? []), w]);
  return (
    <Block className="mt-3" flush title="Waiting" aside={num(page.waitingTotal)}>
      {[...groups].map(([wait, items]) => (
        <WaitingGroup key={wait} wait={wait} items={items} />
      ))}
    </Block>
  );
}

function Steps() {
  const { data, error } = useQuery("next-page", (api) => api.next());
  if (!data) return <ErrorLine error={error?.message} className="mt-3" />;
  // A step with nothing to take and no problem is left out; with the pipeline off one line says so.
  const off = data.steps.every((s) => s.kind === "off");
  const shown = data.steps.filter((s) => s.items.length > 0 || (!s.canRun && s.kind !== "off" && s.kind !== "running"));
  return (
    <>
      <ErrorLine error={error?.message} className="mt-3" />
      {off && <EmptyState className="px-0">The pipeline is off.</EmptyState>}
      {shown.length === 0 && !off && <EmptyState className="px-0">Nothing is queued.</EmptyState>}
      {shown.map((s) => (
        <NextStepBlock key={s.lane} step={s} className="mt-3" />
      ))}
      <Waiting page={data} />
    </>
  );
}

export function NextView() {
  const { tab: param } = useParams();
  const [params, setParams] = useSearchParams();
  const repo = params.get("repo");
  const setRepo = (r: string | null) => setParams((p) => (r ? p.set("repo", r) : p.delete("repo"), p), { replace: true });
  const tab = param ? TABS.find(([t]) => t === param)?.[0] : "merge";
  if (!tab) return <Navigate to="/next" replace />;
  return (
    <Page title={tab === "steps" ? "Next steps" : "Merge queue"} wide={tab !== "steps"}>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="tablist" aria-label="Next" className="flex flex-wrap items-center gap-1">
          {TABS.map(([t, label]) => (
            <Link key={t} role="tab" aria-selected={tab === t} data-active={tab === t} to={(t === "merge" ? "/next" : `/next/${t}`) + (repo ? `?repo=${encodeURIComponent(repo)}` : "")} replace className="chip max-md:h-11">
              {label}
            </Link>
          ))}
        </div>
        {tab !== "steps" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {tab === "merge" && <QueueItems />}
            <UnlessProject><RepoSelect value={repo} onChange={setRepo} /></UnlessProject>
          </div>
        )}
      </div>
      {tab === "steps" ? (
        <Steps />
      ) : tab === "merged" ? (
        <RecentlyMerged repo={repo} />
      ) : (
        <>
          <MergeBoard repo={repo} />
        </>
      )}
    </Page>
  );
}

