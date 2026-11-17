// The GitHub side, drawn like GitHub's own sections. AutoCraft's writes carry a brand-blue edge, the identity they were made as, and a link to the run.
import { useState } from "react";
import { CheckCircleIcon, CircleNotchIcon, GitCommitIcon, GitMergeIcon, GithubLogoIcon, TagIcon, XCircleIcon, ChatCircleIcon, UploadSimpleIcon, EyeIcon, CircleIcon } from "@phosphor-icons/react";
import type { CiState, GithubEvent, GithubTab, ItemPageData } from "../../../api/types";
import { Avatar } from "../../../ui/atoms/Avatar";
import { TimeAgo } from "../../../ui/atoms/TimeAgo";
import { PrBuildLine } from "../../../ui/molecules/PrBuildLine";
import { Markdown } from "../../../ui/molecules/Markdown";
import { cn } from "../../../ui/cn";
import { clock, num } from "../../../lib/format";
import { useJump } from "./ItemPage";

const TABS: [GithubTab, string][] = [["conversation", "Conversation"], ["commits", "Commits"], ["checks", "Checks"], ["files", "Files"]];
const EVENT_ICON: Record<GithubEvent["type"], typeof TagIcon> = { opened: CircleIcon, comment: ChatCircleIcon, review: EyeIcon, label: TagIcon, push: UploadSimpleIcon, merged: GitMergeIcon, closed: XCircleIcon };

export function GithubSide({ d, flash }: { d: ItemPageData; flash: string | null }) {
  const g = d.github;
  const [tab, setTab] = useState<GithubTab>("conversation");
  const isPr = d.kind === "pr";
  const tabs = TABS.filter(([k]) => isPr || k === "conversation");
  const counts: Record<GithubTab, number> = { conversation: g.events.length, commits: g.commits.length, checks: g.checks.length, files: g.files.length };
  return (
    <div className="pb-6">
      <div className="px-4 pt-3 text-xs font-semibold text-ink/55 md:px-6">
        <span className="inline-flex items-center gap-1.5"><GithubLogoIcon className="text-[14px]" /> On GitHub</span>
        {g.syncedAt && <span className="num ml-2 font-normal text-ink/45">updated {clock(g.syncedAt)}</span>}
      </div>
      <div role="tablist" className="mt-2 flex gap-1 overflow-x-auto border-b border-line px-4 scrollbar-none md:px-6">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px inline-flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 text-sm max-md:h-11", tab === k ? "border-accent font-medium text-ink" : "border-transparent text-ink/60 hover:text-ink")}>
            {l}{k !== "conversation" && <span className="num rounded-full bg-ink/[0.08] px-1.5 text-2xs">{counts[k]}</span>}
          </button>
        ))}
      </div>
      <div className="px-4 pt-4 md:px-6">
        {tab === "conversation" && <Conversation d={d} flash={flash} />}
        {tab === "commits" && (
          <ul className="overflow-hidden rounded-md border border-line">
            {g.commits.map((c) => (
              <li key={c.sha} className={cn("flex items-center gap-2.5 border-t border-line px-3 py-2 text-sm first:border-t-0", c.byAutoCraft && "border-l-2 border-l-accent")}>
                <GitCommitIcon className="shrink-0 text-ink/45" />
                <span className="min-w-0 flex-1 break-words">{c.message}<span className="block text-xs text-ink/55">{c.byAutoCraft ? "AutoCraft" : c.author} · <TimeAgo iso={c.at} /></span></span>
                <span className="code text-ink/55">{c.sha}</span>
              </li>
            ))}
          </ul>
        )}
        {tab === "checks" && (
          <ul className="overflow-hidden rounded-md border border-line">
            {g.checks.map((c) => <li key={c.name} className="flex items-center gap-2.5 border-t border-line px-3 py-2 text-sm first:border-t-0"><CiIcon s={c.state} /><span className="flex-1">{c.name}</span><span className="text-xs text-ink/55">{c.state === "passing" ? "Passed" : c.state === "pending" ? "Running" : "Failed"}</span></li>)}
          </ul>
        )}
        {tab === "files" && (
          <ul className="overflow-hidden rounded-md border border-line">
            {g.files.map((f) => <li key={f.path} className="flex items-center gap-3 border-t border-line px-3 py-2 text-sm first:border-t-0"><span className="code min-w-0 flex-1 break-all">{f.path}</span><span className="num text-xs text-ok">+{num(f.additions)}</span><span className="num text-xs text-bad">-{num(f.deletions)}</span></li>)}
          </ul>
        )}
        {tab === "conversation" && isPr && g.checks.length > 0 && (
          <p className="mt-4 text-xs text-ink/60">
            Checks: {g.checks.filter((c) => c.state === "passing").length} passed{g.checks.some((c) => c.state === "pending") && `, ${g.checks.filter((c) => c.state === "pending").length} pending`}{g.checks.some((c) => c.state === "failing") && `, ${g.checks.filter((c) => c.state === "failing").length} failed`}
          </p>
        )}
        {tab === "conversation" && isPr && <PrBuildLine b={d.prBuild} className="mt-2" />}
      </div>
    </div>
  );
}

function CiIcon({ s }: { s: CiState }) {
  return s === "passing" ? <CheckCircleIcon weight="fill" className="text-ok" /> : s === "failing" ? <XCircleIcon weight="fill" className="text-bad" /> : <CircleNotchIcon className="text-warn" />;
}

function Conversation({ d, flash }: { d: ItemPageData; flash: string | null }) {
  const jump = useJump();
  const g = d.github;
  const [first, ...rest] = g.events;
  return (
    <ol className="space-y-3">
      {first && (
        <li>
          <Box actor={first.actor} at={first.at} verb="opened this">
            <Markdown source={g.description} />
          </Box>
        </li>
      )}
      {rest.map((e) => {
        const Ico = EVENT_ICON[e.type];
        if (e.autocraft)
          return (
            <li key={e.id} id={`gh-${e.autocraft.historyId}`} className={cn("rounded-md border border-line border-l-[3px] border-l-accent bg-accent/[0.04] transition-colors duration-slow", flash === `gh-${e.autocraft.historyId}` && "bg-accent/15")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-xs">
                <Ico className="text-accent-ink" />
                <span className="font-medium text-accent-ink">AutoCraft</span>
                <span className="text-ink/55">as {e.autocraft.as}</span>
                <TimeAgo iso={e.at} className="num text-ink/50" />
                <button onClick={() => jump.to("autocraft", `hist-${e.autocraft!.historyId}`)} className="ml-auto inline-flex h-6 items-center text-accent-ink hover:underline max-md:h-9">Run ›</button>
              </div>
              {e.body && <div className="px-3 pb-2.5 text-sm"><Markdown source={e.body} /></div>}
            </li>
          );
        if (e.type === "push" || e.type === "label" || e.type === "merged" || e.type === "closed")
          return <li key={e.id} className="flex items-center gap-2 px-1 text-xs text-ink/60"><Ico className="shrink-0" /> <span><span className="font-medium text-ink/80">{e.actor}</span> {e.body} <TimeAgo iso={e.at} className="text-ink/45" /></span></li>;
        return <li key={e.id}><Box actor={e.actor} at={e.at}><Markdown source={e.body ?? ""} /></Box></li>;
      })}
    </ol>
  );
}

function Box({ actor, at, verb, children }: { actor: string; at: string; verb?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line bg-ink/[0.03] px-3 py-2 text-xs">
        <Avatar login={actor} size={18} />
        <span className="font-medium text-ink">{actor}</span>
        <span className="text-ink/55">{verb}</span>
        <TimeAgo iso={at} className="num text-ink/50" />
      </div>
      <div className="px-3 py-2.5 text-sm">{children}</div>
    </div>
  );
}
