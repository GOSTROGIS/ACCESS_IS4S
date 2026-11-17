// The merge queue, on the Merge queue tab: every PR with a take or take-fix review as one Workable table, grouped by the step it waits on,
// in the order a PR passes them; integration batches are groups of their own, then the stopped PRs.
import { Fragment, useEffect, useMemo, type ReactNode } from "react";
import { CheckCircleIcon, CircleNotchIcon, ClockIcon, MinusCircleIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useApi } from "../../api/client";
import type { FastPosition, NextMerge, QueueBatch, QueueOrigin, QueueRow, QueueState } from "../../api/types";
import { useUser } from "../../shell/UserContext";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { WorkableGroup, WorkableRow, WorkableTable, type WorkableColumn } from "../../ui/organisms/Workable";
import { cn } from "../../ui/cn";
import { num } from "../../lib/format";
import { ConfirmButton, ErrorLine, useWrite } from "../admin/parts";
import { FastMark } from "./fastTrack";
import { useIsLinked } from "./highlight";
import { BatchFacts, CI_TONE, DecisionLink, MERGEABLE, STATE, StateChip, TIER, V_LABEL, V_TONE, Why } from "./mergeParts";
import { RowMenu } from "./RowMenu";
import { usePage } from "./usePage";

type StepId = "verify" | "ci" | "premerge" | "ready" | "batch";

/** The steps before a merge, in the order a PR passes them. */
const STEPS: { id: StepId; label: string; hint: string; dot: string; states: QueueState[] }[] = [
  { id: "verify", label: "Verify", hint: "Build and tests run at the reviewed head", dot: "bg-c1", states: ["waiting-verify"] },
  { id: "ci", label: "CI", hint: "Upstream CI at the head, a red default branch, or CI runs waiting for approval", dot: "bg-c2", states: ["waiting-ci", "waiting-main-ci", "ci-approval"] },
  { id: "premerge", label: "Pre-merge review", hint: "Opus reviews the head commit once more before it merges", dot: "bg-c3", states: ["waiting-premerge"] },
  { id: "ready", label: "Ready", hint: "Covered by the merge rule or approved by an operator; merges on the next run", dot: "bg-ok", states: ["ready", "decision-answered-merge"] },
  { id: "batch", label: "In a batch", hint: "Lands with its integration batch once the batch's checks are green", dot: "bg-accent", states: ["batch-checking", "in-batch"] },
];

/** States that stop a PR until something changes: a person, a fix-up or a new head. */
const BLOCKED: QueueState[] = ["refused", "ci-failed", "conflict", "needs-fix-up", "verify-failed", "verify-error", "needs-decision", "batch-failed", "changes-requested"];

const STEP_OF = new Map<QueueState, StepId>(STEPS.flatMap((s) => s.states.map((st) => [st, s.id] as const)));
const key = (r: { repo: string; number: number }) => `${r.repo}#${r.number}`;

type Row = QueueRow & { held?: boolean; fast?: FastPosition | null; batch?: number; added?: QueueOrigin };
type Next = Map<string, { position: number; merge: NextMerge }>;

const COLUMNS: WorkableColumn[] = [
  { id: "step", label: "Step", width: "190px", hint: "Where the PR stands on its way to merged" },
  { id: "checks", label: "Checks", width: "236px", mdWidth: "120px", hint: "Review verdict, upstream CI, Verify at the reviewed head, mergeability" },
  { id: "size", label: "Size", width: "40px", mdWidth: "32px" },
  { id: "author", label: "Author", width: "130px", wide: true },
  { id: "added", label: "Added", width: "150px", hint: "How the PR came into the queue, who put it there and when", wide: true },
  { id: "actions", label: "", width: "40px", mdWidth: "28px", align: "end" },
];

const CHECK_ICON: Record<Tone, ReactNode> = {
  ok: <CheckCircleIcon weight="fill" className="text-ok" />,
  bad: <XCircleIcon weight="fill" className="text-bad" />,
  warn: <WarningCircleIcon weight="fill" className="text-warn" />,
  accent: <CircleNotchIcon weight="bold" className="text-accent-ink" />,
  neutral: <MinusCircleIcon className="text-ink/35" />,
  merged: <CheckCircleIcon weight="fill" className="text-merged" />,
};

function Check({ label, tone, value }: { label: string; tone: Tone; value: string }) {
  return (
    <span title={`${label}: ${value}`} className="inline-flex items-center gap-1 text-2xs text-ink/65">
      <span className="text-sm leading-none" aria-hidden>
        {tone === "neutral" && value.startsWith("pending") ? <ClockIcon className="text-ink/45" /> : CHECK_ICON[tone]}
      </span>
      <span className="sr-only">{`${label}: `}</span>
      {label}
      <span className="sr-only">{value}</span>
    </span>
  );
}

const BUILD_TONE: Record<NonNullable<QueueRow["prBuild"]>["state"], Tone> = { queued: "neutral", running: "accent", passed: "ok", failed: "bad", error: "warn", stale: "neutral" };
const BUILD_LABEL: Record<NonNullable<QueueRow["prBuild"]>["state"], string> = { queued: "queued", running: "running", passed: "passed", failed: "failed", error: "error", stale: "stale" };

/**
 * Review, CI, Verify, mergeability and our own build in one run of icons, two to a line in the table's compact layout; each names its
 * state, and the failure, on hover.
 */
function Checks({ r }: { r: QueueRow }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 md:max-[1799px]:grid md:max-[1799px]:grid-cols-[auto_auto] md:max-[1799px]:justify-start">
      <Check label="Review" tone={r.verdict === "take" ? "ok" : "warn"} value={r.verdict} />
      <Check label="CI" tone={CI_TONE[r.ci]} value={r.ci} />
      <Check label="Verify" tone={r.verify ? V_TONE[r.verify.state] ?? "neutral" : "neutral"} value={r.verify ? [V_LABEL[r.verify.state] ?? r.verify.state, r.verify.summary, r.verify.note].filter(Boolean).join(" · ") : "none"} />
      <Check label="Merge" tone={MERGEABLE[r.mergeable][1]} value={MERGEABLE[r.mergeable][0]} />
      {r.prBuild && <Check label="Build" tone={BUILD_TONE[r.prBuild.state]} value={[BUILD_LABEL[r.prBuild.state], r.prBuild.current ? null : "older head", r.prBuild.summary].filter(Boolean).join(" · ")} />}
    </span>
  );
}

const HOW: Record<QueueOrigin["how"], [string, string]> = {
  review: ["Take review", "Came in with a take review; the merge rule or a Merge? answer lets it merge"],
  answer: ["Merge answer", "An operator answered Merge?"],
  queued: ["Queued", "An operator added it with Queue items"],
  preapproved: ["Pre-approved", "An operator pre-approved the merge with a fix-up"],
};

/** How the PR came into the queue, by whom and when. */
function Added({ r }: { r: Row }) {
  const o = r.added ?? { how: "review", by: null, at: r.reviewedAt };
  const [label, hint] = HOW[o.how];
  return (
    <span className="block text-xs leading-snug" title={hint}>
      <span className="text-ink/75">
        {label}
        {o.by && <span className="text-ink/55"> by {o.by}</span>}
      </span>
      {o.at && <TimeAgo iso={o.at} className="num block text-2xs text-ink/45" />}
    </span>
  );
}

function PrRow({ r, next }: { r: Row; next: Next }) {
  const n = next.get(key(r));
  const fast = r.fast ?? n?.merge.fast ?? null;
  const linked = useIsLinked(r.repo, r.number);
  const wait = n?.merge.label;
  const sub = (
    <span className="flex flex-wrap items-center gap-x-3">
      <Why row={r} />
      {r.decisionId && <DecisionLink row={r} />}
    </span>
  );
  return (
    <WorkableRow
      item={{ repo: r.repo, number: r.number, kind: "pr", state: "open", title: r.title, closes: r.closes }}
      dataItem={`${r.repo}:${r.number}`}
      highlight={linked}
      mark={<FastMark fast={fast} />}
      sub={r.decisionId || r.refusedReason || r.note || r.outsideRule.length ? sub : undefined}
      cells={{
        step: (
          <span className="flex flex-col items-start gap-0.5">
            <span className="flex flex-wrap items-center gap-1">
              <StateChip row={r} />
              {r.held && <Badge tone="warn">Held</Badge>}
            </span>
            {wait && wait !== STATE[r.state][0] && <span className="text-2xs text-ink/50">{wait}</span>}
            {r.path === "operator" && <span className="text-2xs text-ink/50">approved by operator</span>}
          </span>
        ),
        checks: <Checks r={r} />,
        size: <span className="num text-xs text-ink/70">{r.size}</span>,
        author: (
          <span className="block truncate text-xs text-ink/70" title={`${r.author || "unknown"}, ${TIER[r.tier]}`}>
            {r.author || "unknown"}
            {r.tier === "whitelisted" && <span className="ml-1 text-2xs text-ok">●</span>}
          </span>
        ),
        added: <Added r={r} />,
        actions: <RowMenu repo={r.repo} number={r.number} fast={fast} held={!!r.held} pr inBatch={r.batch !== undefined} />,
      }}
    />
  );
}

function StopBatch({ b }: { b: QueueBatch }) {
  const api = useApi();
  const write = useWrite();
  if (useUser().role !== "operator") return null;
  return (
    <>
      <ErrorLine error={write.error} className="text-2xs" />
      <ConfirmButton idle="secondary" label="Stop batch" confirmLabel="Confirm stop batch" loading={write.busy === "stop"} onConfirm={() => void write.run("stop", () => api.queueControl.stopBatch(b.id))} />
    </>
  );
}

/** The share of the queue at each step, as one bar; a step's label jumps to its group. */
function FlowBar({ counts, total }: { counts: { id: string; label: string; n: number; tone: string }[]; total: number }) {
  if (total === 0) return null;
  return (
    <div className="mt-4">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.06]" role="img" aria-label={counts.map((c) => `${c.label} ${c.n}`).join(", ")}>
        {counts.filter((c) => c.n > 0).map((c) => (
          <div key={c.id} className={cn("h-full border-r border-bg last:border-0", c.tone)} style={{ width: `${(c.n / total) * 100}%` }} title={`${c.label}: ${c.n}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
        {counts.map((c) => (
          <a key={c.id} href={`#mq-${c.id}`} className={cn("inline-flex items-center gap-1.5 hover:text-ink max-md:h-11", c.n === 0 && "opacity-50")}>
            <span className={cn("size-2 rounded-full", c.tone)} aria-hidden />
            {c.label} <span className="num text-ink/80">{num(c.n)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** The merge queue: a bar of the steps' shares, then one table of every PR in it. */
export function MergeBoard({ repo }: { repo: string | null }) {
  const { pages, error, hasMore, loadingMore, loadMore } = usePage("merge", repo ?? "pipeline", undefined);
  // The table shows the whole queue, so every page is read.
  useEffect(() => {
    if (hasMore && !loadingMore) loadMore();
  }, [hasMore, loadingMore, loadMore]);

  const q = useMemo(() => {
    const first = pages?.[0];
    const rows = new Map<string, Row>();
    for (const r of pages?.flatMap((p) => p.mergeRows) ?? []) rows.set(key(r), r);
    const batches = (first?.batches ?? []).map((b) => ({ b, rows: b.prs.map((r): Row => ({ ...rows.get(key(r)), ...r, batch: b.id })) }));
    for (const { rows: rs } of batches) for (const r of rs) rows.delete(key(r));
    const next: Next = new Map((first?.nextMerges ?? []).map((merge, i) => [key(merge), { position: i + 1, merge }]));
    const steps = new Map<StepId, Row[]>(STEPS.map((s) => [s.id, []]));
    const blocked: Row[] = [];
    for (const r of rows.values()) {
      if (r.held || BLOCKED.includes(r.state)) blocked.push(r);
      else {
        const s = STEP_OF.get(r.state);
        if (s) steps.get(s)!.push(r);
      }
    }
    // PRs in "Next merges" first, in merge order.
    const pos = (r: Row) => next.get(key(r))?.position ?? Infinity;
    for (const l of steps.values()) l.sort((a, b) => pos(a) - pos(b));
    return { steps, batches, blocked, next, loaded: !!first };
  }, [pages]);

  const inBatches = q.batches.reduce((s, b) => s + b.rows.length, 0);
  const counts = [
    ...STEPS.map((s) => ({ id: s.id, label: s.label, n: (q.steps.get(s.id)?.length ?? 0) + (s.id === "batch" ? inBatches : 0), tone: s.dot })),
    { id: "stopped", label: "Stopped", n: q.blocked.length, tone: "bg-bad" },
  ];
  const total = counts.reduce((s, c) => s + c.n, 0);

  return (
    <>
      <ErrorLine error={error?.message} className="mt-3" />
      {q.loaded && (
        <p className="mt-4 text-sm text-ink/60">
          <span className="num font-medium text-ink">{num(total)}</span> PR{total === 1 ? "" : "s"} with a take review, by the step each waits on, in the order a PR passes them.
        </p>
      )}
      <FlowBar counts={counts} total={total} />
      {q.loaded && (
        <WorkableTable columns={COLUMNS} label="Merge queue" closes className="mt-5">
          {total === 0 && <p className="px-4 py-6 text-sm text-ink/50">No PR in the queue.</p>}
          {STEPS.map((s) => {
            const rows = q.steps.get(s.id)!;
            const batchGroups =
              s.id === "batch"
                ? q.batches.map(({ b, rows: rs }, i) => (
                    <WorkableGroup key={`batch-${b.id}`} id={i === 0 && rows.length === 0 ? `mq-${s.id}` : undefined} title={s.label} count={rs.length} dot={s.dot} aside={<StopBatch b={b} />} hint={<span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1"><BatchFacts b={b} /></span>}>
                      {rs.map((r) => (
                        <PrRow key={key(r)} r={r} next={q.next} />
                      ))}
                    </WorkableGroup>
                  ))
                : null;
            return (
              <Fragment key={s.id}>
                {rows.length > 0 && (
                  <WorkableGroup id={`mq-${s.id}`} title={s.label} count={rows.length} hint={s.hint} dot={s.dot}>
                    {rows.map((r) => (
                      <PrRow key={key(r)} r={r} next={q.next} />
                    ))}
                  </WorkableGroup>
                )}
                {batchGroups}
              </Fragment>
            );
          })}
          {q.blocked.length > 0 && (
            <WorkableGroup id="mq-stopped" title="Stopped" count={q.blocked.length} hint="Waits for a person, a fix-up or a new head" dot="bg-bad">
              {q.blocked.map((r) => (
                <PrRow key={key(r)} r={r} next={q.next} />
              ))}
            </WorkableGroup>
          )}
        </WorkableTable>
      )}
    </>
  );
}
