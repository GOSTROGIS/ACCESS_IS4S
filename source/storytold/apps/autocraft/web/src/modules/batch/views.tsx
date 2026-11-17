// The detail page of one integration batch: header, CI, member PRs and the batch's own history.
import { Link } from "react-router-dom";
import { DropdownMenu } from "radix-ui";
import {
  ArrowSquareOutIcon, CheckIcon, DotsThreeIcon, GitBranchIcon, GitMergeIcon, GitPullRequestIcon, HammerIcon, MinusIcon, ProhibitIcon, SignOutIcon, SpinnerIcon, SplitHorizontalIcon, UploadSimpleIcon, WarningIcon, XIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useApi, useQuery } from "../../api/client";
import type { BatchCi, BatchDetail, BatchEvent, BatchEventKind, BatchMemberDetail, BatchMemberState } from "../../api/types";
import { batchPath, repoSlug } from "../../lib/links";
import type { ViewProps } from "../../registry/types";
import { useUser } from "../../shell/UserContext";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { Facts } from "../../ui/molecules/Facts";
import { cn } from "../../ui/cn";
import { when } from "../../lib/format";
import { Block, ConfirmButton, ErrorLine, Page, useWrite } from "../admin/parts";
import { BATCH_STATE } from "../queue/mergeParts";
import { safeHref } from "../../ui/safeHref";

const gh = (path: string) => `https://github.com/${path}`;
const ext = "inline-flex items-center gap-1 text-accent-ink hover:underline";
const sha7 = (s: string) => s.slice(0, 7);
const active = (b: BatchDetail) => b.state === "open" || b.state === "checking";

const MEMBER: Record<BatchMemberState, [string, Tone]> = { in: ["In batch", "ok"], removed: ["Removed", "warn"], merged: ["Merged", "merged"], failed: ["Failed", "bad"] };
const CI_TONE: Record<BatchCi["state"], Tone> = { success: "ok", failure: "bad", pending: "warn", none: "neutral" };
const CI_LABEL: Record<BatchCi["state"], string> = { success: "Passing", failure: "Failing", pending: "Running", none: "No checks" };
const CHECK_ICON: Record<BatchCi["checks"][number]["state"], [PhosphorIcon, string]> = {
  success: [CheckIcon, "text-ok"], failure: [XIcon, "text-bad"], pending: [SpinnerIcon, "text-warn"], skipped: [MinusIcon, "text-ink/40"],
};
const EVENT_ICON: Record<BatchEventKind, PhosphorIcon> = {
  opened: GitBranchIcon, task: HammerIcon, push: UploadSimpleIcon, pr: GitPullRequestIcon, ci: CheckIcon, removed: SignOutIcon, stopped: ProhibitIcon, failed: WarningIcon, split: SplitHorizontalIcon, superseded: GitBranchIcon, merged: GitMergeIcon,
};

const BUILD: Record<NonNullable<BatchDetail["buildState"]>, [string, Tone]> = {
  pending: ["Build running", "warn"], passed: ["Build passed", "ok"], failed: ["Build failed", "bad"], skipped: ["Build skipped", "neutral"],
};

function Header({ b }: { b: BatchDetail }) {
  const [label, tone] = BATCH_STATE[b.state];
  const prState = b.state === "merged" ? "merged" : active(b) ? "open" : "closed";
  const commit = (sha: string, repoPath: string) => (
    <a href={gh(`${repoPath}/commit/${sha}`)} target="_blank" rel="noopener noreferrer" className={cn("code text-xs", ext)}>
      {sha7(sha)}
    </a>
  );
  return (
    <Block className="mt-3" title="Batch">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={tone}>{label}</Badge>
        {b.buildState && <Badge tone={BUILD[b.buildState][1]}>{BUILD[b.buildState][0]}</Badge>}
        {b.fork ? (
          <a href={gh(`${b.fork}/tree/${b.branch}`)} target="_blank" rel="noopener noreferrer" className={cn("font-mono text-sm [overflow-wrap:anywhere]", ext)}>
            {b.branch}
            <ArrowSquareOutIcon size={14} />
          </a>
        ) : (
          <span className="font-mono text-sm [overflow-wrap:anywhere]">{b.branch}</span>
        )}
      </div>
      <Facts
        rows={[
          ["Repo", b.repo],
          ["Opened", when(b.createdAt)],
          ["Merged", b.mergedAt ? when(b.mergedAt) : null],
          ["Batch PR", b.prNumber !== null ? <ItemRef key="p" repo={b.repo} number={b.prNumber} kind="pr" state={prState} title={null} /> : null],
          ["Merge commit", b.mergeSha ? commit(b.mergeSha, `${repoSlug(b.repo)}`) : null],
          ["Base", commit(b.baseSha, `${repoSlug(b.repo)}`)],
          ["Branch head", b.fork ? commit(b.commitSha, b.fork) : <span className="code text-xs">{sha7(b.commitSha)}</span>],
          ["Came from", b.parentId !== null ? <Link to={batchPath(b.parentId)} className="text-accent-ink hover:underline">Batch #{b.parentId}</Link> : null],
          ["Led to", b.childIds.length ? b.childIds.map((c, i) => <span key={c}>{i > 0 && ", "}<Link to={batchPath(c)} className="text-accent-ink hover:underline">Batch #{c}</Link></span>) : null],
          ["Build skipped", b.buildSkipped],
          ["Why it ended", b.summary && !active(b) ? <span className="text-bad">{b.summary}</span> : null],
        ]}
      />
    </Block>
  );
}

function Ci({ b }: { b: BatchDetail }) {
  if (b.prNumber === null) return null;
  const ci = b.ci;
  return (
    <Block className="mt-3" title="Integration CI" aside={ci ? <>read <TimeAgo iso={ci.fetchedAt} /></> : undefined}>
      {!ci ? (
        <p className="text-sm text-ink/55">No CI read yet.</p>
      ) : (
        <>
          <Badge tone={CI_TONE[ci.state]}>{CI_LABEL[ci.state]}</Badge>
          <ul className="mt-3 divide-y divide-line">
            {ci.checks.map((c) => {
              const [Icon, cls] = CHECK_ICON[c.state];
              return (
                <li key={c.name}>
                  <a href={safeHref(c.url)} target="_blank" rel="noopener noreferrer" className="flex min-h-9 items-center gap-2 py-1.5 text-sm hover:underline max-md:min-h-11">
                    <Icon className={cn("shrink-0", cls)} size={16} />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c.name}</span>
                    <ArrowSquareOutIcon size={14} className="shrink-0 text-ink/40" />
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Block>
  );
}

function StopBatch({ b }: { b: BatchDetail }) {
  const api = useApi();
  const write = useWrite();
  if (useUser().role !== "operator" || !active(b)) return null;
  return (
    <span className="mt-3 flex items-center justify-end gap-2">
      <ErrorLine error={write.error} className="text-2xs" />
      <ConfirmButton idle="secondary" label="Stop batch" confirmLabel="Confirm stop batch" loading={write.busy === "stop"} onConfirm={() => void write.run("stop", () => api.queueControl.stopBatch(b.id))} />
    </span>
  );
}

const menuCls = "z-50 min-w-[200px] rounded-md border border-line-strong bg-raised p-1 shadow-[0_12px_32px_rgba(0,0,0,0.28)] animate-rise";
const itemCls = "flex h-8 cursor-default items-center gap-2.5 rounded px-2 text-sm outline-none data-[highlighted]:bg-ink/[0.07] max-md:h-11";

/** The row's overflow menu; operators only, and only while the batch is in flight. */
function RowActions({ b, m }: { b: BatchDetail; m: BatchMemberDetail }) {
  const api = useApi();
  const write = useWrite();
  if (useUser().role !== "operator" || m.state !== "in" || !active(b)) return null;
  const ref = `${m.repo}#${m.number}`;
  return (
    <span className="relative z-10 inline-flex flex-col items-end">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-label={`Actions for ${ref}`} className="inline-flex size-7 items-center justify-center rounded text-ink/60 outline-none hover:bg-ink/[0.07] hover:text-ink data-[state=open]:bg-ink/[0.07] max-md:size-11">
            <DotsThreeIcon size={20} weight="bold" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className={menuCls}>
            <DropdownMenu.Item className={itemCls} onSelect={() => void write.run("remove", () => api.queueControl.batchRemove(ref))}>
              <SignOutIcon size={16} />
              Remove from batch
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ErrorLine error={write.error} className="max-w-[180px] text-2xs" />
    </span>
  );
}

function Members({ b }: { b: BatchDetail }) {
  return (
    <Block className="mt-3" flush title="Pull requests" aside={<span className="num">{b.members.length}</span>}>
      <ul>
        {b.members.map((m) => (
          <li key={m.number} className="relative flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line px-4 py-2 last:border-0 hover:bg-ink/[0.03]">
            <ItemRef repo={m.repo} number={m.number} kind="pr" state={m.itemState} title={m.title} stretch className="basis-full md:min-w-[12rem] md:flex-1 md:basis-0" />
            <span className="relative z-10 flex flex-wrap items-center gap-2 max-md:flex-1 max-md:pl-6">
              <Badge tone={MEMBER[m.state][1]}>{MEMBER[m.state][0]}</Badge>
              <a href={gh(`${repoSlug(m.repo)}/commit/${m.headOid}`)} target="_blank" rel="noopener noreferrer" title="Head merged into the batch" className={cn("code text-xs", ext)}>{sha7(m.headOid)}</a>
            </span>
            <RowActions b={b} m={m} />
            {m.reason && <p className="basis-full pl-6 text-2xs text-ink/60 [overflow-wrap:anywhere]">{m.reason}</p>}
          </li>
        ))}
      </ul>
    </Block>
  );
}

function EventLink({ e }: { e: BatchEvent }) {
  if (e.batchId !== undefined) return <Link to={batchPath(e.batchId)} className="text-accent-ink hover:underline">Batch #{e.batchId}</Link>;
  if (e.taskId !== undefined) return <Link to={`/envs/${e.taskId}`} className="text-accent-ink hover:underline">Task #{e.taskId}</Link>;
  return null;
}

function Timeline({ b }: { b: BatchDetail }) {
  return (
    <Block className="mt-3" flush title="Timeline" aside="oldest first">
      <ol>
        {b.events.map((e) => {
          const Icon = EVENT_ICON[e.kind];
          return (
            <li key={e.id} className="flex items-start gap-2.5 border-b border-line px-4 py-2 last:border-0">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong bg-panel text-ink/60">
                <Icon className="text-[11px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm leading-5 [overflow-wrap:anywhere]">{e.summary}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink/55">
                  {e.by && <span>{e.by}</span>}
                  <TimeAgo iso={e.at} className="num" />
                  <EventLink e={e} />
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </Block>
  );
}

export function BatchView({ params }: ViewProps) {
  const id = Number(params.id);
  const q = useQuery(`batch:${id}`, (api) => api.batch(id), { enabled: Number.isInteger(id) });
  const b = q.data;
  return (
    <Page title={`Batch #${params.id}`} sub={b?.repo}>
      <ErrorLine error={q.error?.message} className="mt-3" />
      {b && (
        <>
          <StopBatch b={b} />
          <Header b={b} />
          <Ci b={b} />
          <Members b={b} />
          <Timeline b={b} />
        </>
      )}
    </Page>
  );
}

