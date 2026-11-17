// The Pipeline page: the On/Off switch, the daily limits, what ran and what it
// cost. Everyone signed in sees it; only operators flip the switch, change
// limits and cancel jobs. The runner process does the work.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useApi, useQuery } from "../../api/client";
import type { Job, JobItem, JobParams, JobState, PipelineOverview, SyncRun } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { can } from "../../registry/permissions";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { cn } from "../../ui/cn";
import { num, eventTime } from "../../lib/format";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { Block, ConfirmButton, ErrorLine, Page, useWrite, when } from "../admin/parts";
import { JudgementModel, OutsideLimits, PilotPanel, PipelineSwitch, StageLimits } from "./controls";
import { useNow } from "../../lib/useNow";
import { decisionPath } from "../../lib/links";
import { ItemRef } from "../../ui/molecules/ItemRef";

// ---- helpers -------------------------------------------------------------------

const STATE_TONE: Record<JobState, Tone> = { queued: "neutral", running: "accent", done: "ok", failed: "bad", cancelled: "warn" };
const STATE_LABEL: Record<JobState, string> = { queued: "Queued", running: "Running", done: "Done", failed: "Failed", cancelled: "Cancelled" };
export const JobBadge = ({ j }: { j: Job }) => (
  <Badge tone={STATE_TONE[j.state]}>{j.state === "running" && j.cancelRequested ? "Stopping" : STATE_LABEL[j.state]}</Badge>
);

function took(a: string | null, b: string | null): string {
  if (!a) return "–";
  const s = Math.max(0, Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000));
  return s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`;
}

const usd = (v: number | null) => (v === null ? null : `$${v.toFixed(2)}`);
function cost(j: Job): string {
  if (!j.usage || !j.usage.calls) return "–";
  const tokens = num(j.usage.input + j.usage.output);
  return usd(j.usage.costUsd) ?? `${tokens} tok`;
}

const paramText = (p: JobParams) =>
  Object.entries(p)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");

// ---- stages, sync ----------------------------------------------------------------

function SyncRuns({ runs, last }: { runs: SyncRun[]; last: string | null }) {
  useNow();
  return (
    <Block flush title="Sync" aside={last ? `last finished ${eventTime(last)}; runs on its own timer` : "runs on its own timer"}>
      {runs.length === 0 ? (
        <p className="p-4 text-sm text-ink/50">No sync runs recorded yet.</p>
      ) : (
        <table className="num w-full min-w-[520px] text-sm">
          <thead className="bg-ink/[0.03] text-xs text-ink/55">
            <tr>
              <th className="h-8 px-3 text-left font-medium">Started</th>
              <th className="h-8 px-3 text-right font-medium">Took</th>
              <th className="h-8 px-3 text-left font-medium">Mode</th>
              <th className="h-8 px-3 text-right font-medium">Items</th>
              <th className="h-8 px-3 text-left font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.startedAt} className="h-8 border-t border-line">
                <td className="px-3">{when(r.startedAt)}</td>
                <td className="px-3 text-right">{r.endedAt ? took(r.startedAt, r.endedAt) : "–"}</td>
                <td className="px-3">{r.mode ?? "–"}</td>
                <td className="px-3 text-right">{r.items === null ? "–" : num(r.items)}</td>
                <td className="px-3">{r.error ? <span className="text-bad">{r.error}</span> : r.endedAt ? "OK" : <span className="text-ink/55">running</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Block>
  );
}

// ---- jobs ----------------------------------------------------------------------

const FILTERS: (JobState | "")[] = ["", "queued", "running", "done", "failed", "cancelled"];

function Jobs({ selected }: { selected?: number }) {
  const navigate = useNavigate();
  const [state, setState] = useState<JobState | "">("");
  const [limit, setLimit] = useState(25);
  const q = useQuery(`pipeline-jobs:${state}:${limit}`, (a) => a.pipeline.jobs({ state: state || undefined, limit }));
  useNow(q.data?.jobs.some((j) => j.state === "running") ? 1000 : undefined);
  return (
    <Block
      flush
      title="Jobs"
      aside={
        <div role="radiogroup" aria-label="Show" className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => (
            <button key={f || "all"} role="radio" aria-checked={state === f} data-active={state === f} className="chip" onClick={() => setState(f)}>
              {f ? STATE_LABEL[f] : "All"}
            </button>
          ))}
        </div>
      }
    >
      <ErrorLine error={q.error?.message} className="p-4" />
      {q.data && q.data.jobs.length === 0 && <p className="p-4 text-sm text-ink/50">No jobs.</p>}
      {q.data && q.data.jobs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-ink/[0.03] text-xs text-ink/55">
              <tr>
                <th className="h-8 w-14 px-3 text-left font-medium">Job</th>
                <th className="h-8 px-3 text-left font-medium">Step</th>
                <th className="h-8 w-24 px-3 text-left font-medium">State</th>
                <th className="h-8 px-3 text-left font-medium">Requested</th>
                <th className="h-8 px-3 text-right font-medium">Took</th>
                <th className="h-8 px-3 text-left font-medium">Result</th>
                <th className="h-8 px-3 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {q.data.jobs.map((j) => (
                <tr
                  key={j.id}
                  onClick={() => navigate(`/pipeline/${j.id}`)}
                  aria-selected={selected === j.id}
                  className={cn("h-9 cursor-pointer border-t border-line hover:bg-ink/[0.03]", selected === j.id && "bg-accent/[0.07]")}
                >
                  <td className="num px-3">
                    <Link to={`/pipeline/${j.id}`} onClick={(e) => e.stopPropagation()} className="underline-offset-2 hover:underline">
                      #{j.id}
                    </Link>
                  </td>
                  <td className="px-3">
                    <span className="code">{j.step}</span>
                    {Object.keys(j.params).length > 0 && <span className="ml-1.5 text-xs text-ink/45">{paramText(j.params)}</span>}
                    {(j.models.length > 0 || j.accounts.length > 0) && (
                      <div className="text-xs text-ink/55">
                        {j.models.join(", ")}
                        {j.accounts.length > 0 && <span className="ml-1.5">on {j.accounts.join(", ")}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3">
                    <JobBadge j={j} />
                  </td>
                  <td className="whitespace-nowrap px-3 text-ink/65" title={j.requestedAt}>
                    {j.requestedBy} · <TimeAgo iso={j.requestedAt} />
                  </td>
                  <td className="num whitespace-nowrap px-3 text-right">{took(j.startedAt, j.endedAt)}</td>
                  <td className="max-w-[340px] truncate px-3 text-ink/70" title={j.error ?? j.summary ?? j.progress ?? ""}>
                    {j.state === "failed" ? <span className="text-bad">{j.error}</span> : (j.summary ?? j.progress ?? "")}
                  </td>
                  <td className="num whitespace-nowrap px-3 text-right text-ink/65">{cost(j)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.data.total > q.data.jobs.length && (
            <div className="border-t border-line p-2 text-center">
              <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 25)}>
                Show more ({num(q.data.total - q.data.jobs.length)} older)
              </Button>
            </div>
          )}
        </div>
      )}
    </Block>
  );
}

// ---- views -----------------------------------------------------------------------

function RunnerLine({ o }: { o: PipelineOverview }) {
  useNow();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", o.runner.alive ? "bg-ok" : "bg-bad")} aria-hidden />
      {o.runner.alive ? "Runner running" : o.runner.lastSeen ? `Runner not running since ${eventTime(o.runner.lastSeen)}: jobs wait until it starts` : "Runner not started: jobs wait until it starts"}
      {" · "}
      {o.counts.running} running, {o.counts.queued} queued
    </span>
  );
}

export function PipelineView({ params }: ViewProps) {
  // "Runner alive" is the age of its heartbeat, which is not a change event, so this view also refetches slowly.
  const q = useQuery("pipeline", (a) => a.pipeline.overview(), { pollMs: 30_000 });
  const o = q.data;
  const selected = params.id ? Number(params.id) : undefined;
  return (
    <Page title="Pipeline" sub={o && <RunnerLine o={o} />}>
      <ErrorLine error={q.error?.message} className="mt-3" />
      <PipelineSwitch className="mt-4" />
      <JudgementModel className="mt-4" />
      <PilotPanel className="mt-4" />
      <OutsideLimits className="mt-4" />
      <div className="mt-4">
        <StageLimits />
      </div>
      <div className="mt-5">
        <Jobs selected={selected} />
      </div>
      {o && (
        <div className="mt-6">
          <SyncRuns runs={o.sync.runs} last={o.sync.lastFinishedAt} />
        </div>
      )}
    </Page>
  );
}

const INLINE_JOB_ITEMS = 5;

/** The items a job handled, one per line with what happened to each and the decision it asked; more than five fold behind "+N more". */
function JobItems({ items }: { items: JobItem[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, INLINE_JOB_ITEMS);
  const hidden = items.length - INLINE_JOB_ITEMS;
  return (
    <div>
      <div className="mb-1 text-xs text-ink/55">Items ({num(items.length)})</div>
      <ul className="flex flex-col gap-1.5">
        {shown.map((i, n) => (
          <li key={`${i.repo}#${i.number}:${n}`} className="flex flex-col gap-0.5 rounded border border-line px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
            <ItemRef repo={i.repo} number={i.number} kind={i.kind} state={i.state} title={i.title} size="sm" className="sm:flex-1" />
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink/65 sm:max-w-[45%] sm:justify-end">
              {i.outcome}
              {i.decision && (
                <Link to={decisionPath({ id: i.decision, repo: i.repo, number: i.number })} className="font-medium text-accent-ink hover:underline max-md:py-2">
                  Decision
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-xs text-ink/60 hover:text-ink max-md:min-h-11">
          {open ? "Show fewer" : `+${num(hidden)} more`}
        </button>
      )}
    </div>
  );
}

export function JobPanel({ params, user }: ViewProps) {
  const id = params.id ? Number(params.id) : null;
  if (!id) return <div className="grid h-full place-items-center p-6 text-sm text-ink/50">Pick a job to see its progress and log.</div>;
  return <JobDetailView key={id} id={id} operator={can(user, "operator")} />;
}

function JobDetailView({ id, operator, back }: { id: number; operator: boolean; back?: boolean }) {
  const api = useApi();
  // The log tail is read from a file the job writes, which raises no change event: poll while the job runs.
  const q = useQuery(`pipeline-job:${id}`, (a) => a.pipeline.job(id), { pollMs: (d) => (!d || d.state === "queued" || d.state === "running" ? 2000 : false) });
  const j = q.data;
  useNow(j && (j.state === "queued" || j.state === "running") ? 1000 : undefined);
  const write = useWrite();
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [j?.log]);
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-line py-3 pl-4 pr-12">
        {back && (
          <Link to="/pipeline" className="mb-2 inline-flex items-center gap-1 text-xs text-ink/60 max-md:py-2">
            <ArrowLeftIcon className="size-3.5" /> Pipeline
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Job #{id}</h2>
          {j && <span className="code text-sm text-ink/70">{j.step}</span>}
          {j && <JobBadge j={j} />}
          {j && operator && (j.state === "queued" || j.state === "running") && !j.cancelRequested && (
            <ConfirmButton className="ml-auto" label={j.state === "queued" ? "Cancel" : "Stop"} confirmLabel={j.state === "queued" ? "Cancel this job" : "Stop this job"} loading={write.busy === "cancel"} onConfirm={() => void write.run("cancel", () => api.pipeline.cancel(id))} />
          )}
        </div>
        <ErrorLine error={write.error ?? q.error?.message} className="mt-2" />
      </div>
      {j && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink/55">Settings</dt>
            <dd className="code">{paramText(j.params) || "defaults"}</dd>
            <dt className="text-ink/55">Requested</dt>
            <dd>
              {j.requestedBy} · {when(j.requestedAt)}
            </dd>
            <dt className="text-ink/55">Ran</dt>
            <dd>{j.startedAt ? `${when(j.startedAt)}, ${j.endedAt ? `took ${took(j.startedAt, j.endedAt)}` : `running for ${took(j.startedAt, null)}`}` : "not started"}</dd>
            {j.usage && j.usage.calls > 0 && (
              <>
                <dt className="text-ink/55">Model use</dt>
                <dd className="num">
                  {num(j.usage.calls)} calls · {num(j.usage.input)} in / {num(j.usage.output)} out{usd(j.usage.costUsd) ? ` · ${usd(j.usage.costUsd)}` : ""}
                </dd>
              </>
            )}
          </dl>
          {j.cancelRequested && j.state === "running" && <p className="text-sm text-warn">Stop requested; the runner is ending the job.</p>}
          {j.progress && j.state === "running" && <p className="text-sm">{j.progress}</p>}
          {j.summary && <p className="rounded border border-ok/30 bg-ok/5 px-3 py-2 text-sm">{j.summary}</p>}
          {j.items.length > 0 && <JobItems items={j.items} />}
          {j.error && <p className="rounded border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{j.error}</p>}
          {j.log !== null && (
            <div className="flex min-h-[240px] flex-1 flex-col">
              <div className="mb-1 flex items-baseline gap-2 text-xs text-ink/55">
                Log{j.logTruncated && <span>(last part)</span>}
              </div>
              <pre ref={logRef} className="code min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-sunken p-3 text-xs leading-relaxed">
                {j.log || (j.state === "queued" ? "Waiting for the runner." : "No log.")}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PhonePipeline(props: ViewProps) {
  if (props.params.id) return <JobDetailView id={Number(props.params.id)} operator={can(props.user, "operator")} back />;
  return <PipelineView {...props} />;
}

