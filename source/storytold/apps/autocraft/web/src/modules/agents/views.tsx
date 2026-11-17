// The Agents page: model calls running now, recent calls with server-side filters and keyset paging,
// and a detail panel with the rendered prompt and the output.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Dialog } from "radix-ui";
import { CaretDownIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { usePagedQuery, useQuery } from "../../api/client";
import type { AgentRun, AgentRunDetail, AgentRunFilter, AgentRunPage, AgentRunState } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { nowMs, num, span } from "../../lib/format";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { useNow } from "../../lib/useNow";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { cn } from "../../ui/cn";
import { Block, ErrorLine, Page, selectCls, useUrlState } from "../admin/parts";

const STATE_TONE: Record<AgentRunState, Tone> = { running: "accent", done: "ok", failed: "bad" };
const STATE_LABEL: Record<AgentRunState, string> = { running: "Running", done: "Done", failed: "Failed" };

const tokensOf = (r: AgentRun) => (r.inputTokens === null && r.outputTokens === null ? null : (r.inputTokens ?? 0) + (r.outputTokens ?? 0));
const elapsed = (r: AgentRun) => span((r.endedAt ? Date.parse(r.endedAt) : nowMs()) - Date.parse(r.startedAt));

/** The items a run works on, with "+N more" past the ones the API lists. */
function Items({ r, max = 3, expandable }: { r: AgentRun; max?: number; expandable?: boolean }) {
  const [all, setAll] = useState(false);
  if (expandable) max = all ? r.items.length : max;
  const shown = r.items.slice(0, max);
  const more = r.itemCount - shown.length;
  return (
    <span className="flex flex-col items-start gap-0.5">
      {shown.map((i) => (
        <ItemRef key={`${i.repo}#${i.number}`} repo={i.repo} number={i.number} kind={i.kind} state={i.state} title={i.title} size="sm" className="relative z-10 w-fit max-w-full" />
      ))}
      {more > 0 &&
        (expandable && !all && r.items.length > shown.length ? (
          <button onClick={() => setAll(true)} className="relative z-10 text-xs text-accent-ink hover:underline max-md:min-h-11">
            +{num(more)} more
          </button>
        ) : (
          <span className="text-xs text-ink/50">+{num(more)} more</span>
        ))}
    </span>
  );
}

const who = (r: AgentRun) => (r.provider === "jev" ? "Jev (no account)" : (r.accountLabel ?? "unknown account"));

// ---- running now ---------------------------------------------------------------

function RunningNow({ selected }: { selected?: number }) {
  const q = useQuery<AgentRunPage>("agents-running", (a) => a.agents.list({ state: "running" }));
  const runs = q.data?.runs ?? [];
  useNow(runs.length ? 1000 : undefined);
  return (
    <Block flush title={<>Running now {q.data && <span className="num ml-1 font-normal text-ink/50">{runs.length}</span>}</>} aside="live">
      <ErrorLine error={q.error?.message} className="p-4" />
      {q.data && runs.length === 0 && <p className="p-4 text-sm text-ink/55">No agent is running.</p>}
      <ul>
        {runs.map((r) => (
          <li key={r.id} className={cn("relative border-t border-line px-4 py-2.5 first:border-t-0 hover:bg-ink/[0.03]", selected === r.id && "bg-accent/10")}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link to={`/agents/${r.id}`} aria-current={selected === r.id} className="code text-sm font-medium after:absolute after:inset-0">
                {r.step}
              </Link>
              <span className="text-xs text-ink/50">stage {r.stage}</span>
              <Badge tone="accent">{r.model}</Badge>
              <span className="text-xs text-ink/70">{who(r)}</span>
              <span className="num ml-auto text-xs text-ink/70">
                {elapsed(r)} · {tokensOf(r) === null ? "–" : `${num(tokensOf(r)!)} tok`}
              </span>
            </div>
            <div className="mt-1">
              <Items r={r} />
            </div>
            {r.progress && <p className="mt-1 text-xs text-ink/45 [overflow-wrap:anywhere]">{r.progress}</p>}
          </li>
        ))}
      </ul>
    </Block>
  );
}

// ---- recent runs ---------------------------------------------------------------

function useRecent(filter: Omit<AgentRunFilter, "cursor">) {
  const q = usePagedQuery(`agents-recent:${JSON.stringify(filter)}`, (api, cursor) => api.agents.list({ ...filter, cursor }), (p) => p.nextCursor);
  return { rows: q.pages?.flatMap((p) => p.runs) ?? [], loading: q.loading || q.loadingMore, error: q.error?.message, more: q.hasMore, loadMore: q.loadMore };
}

function Filters({ f, update }: { f: Record<string, string | undefined>; update: (p: Record<string, string | null>) => void }) {
  const accounts = useQuery("agents-accounts", (a) => a.accounts.list());
  const steps = useQuery("agents-steps", (a) => a.pipeline.overview());
  const repos = useQuery("agents-repos", (a) => a.repos());
  const sel = (label: string, key: string, opts: { value: string; label: string }[]) => (
    <label className="flex items-center gap-1.5 text-xs text-ink/60">
      <span className="max-md:sr-only">{label}</span>
      <select aria-label={label} value={f[key] ?? ""} onChange={(e) => update({ [key]: e.target.value || null })} className={cn(selectCls, "max-md:max-w-[44vw]")}>
        <option value="">{`All ${label.toLowerCase()}s`}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2">
      {sel("Step", "step", (steps.data?.steps ?? []).filter((s) => ["classify-new", "classify-all", "areas-rescan"].includes(s.name)).map((s) => ({ value: s.name, label: s.name })).concat([{ value: "decide", label: "decide" }, { value: "opus-review", label: "opus-review" }]).filter((o, i, a) => a.findIndex((x) => x.value === o.value) === i))}
      {sel("Account", "account", (accounts.data ?? []).map((a) => ({ value: a.id, label: a.label })))}
      {sel("State", "state", [{ value: "done", label: "Done" }, { value: "failed", label: "Failed" }])}
      {sel("Repo", "repo", (repos.data ?? []).map((r) => ({ value: r, label: r })))}
    </div>
  );
}

function RecentRuns({ selected }: { selected?: number }) {
  const { state: f, update } = useUrlState();
  const recent = useRecent({ state: (f.state as AgentRunState | undefined) ?? "recent", step: f.step, account: f.account, repo: f.repo, limit: 50 });
  useNow(recent.rows.some((r) => r.state === "running") ? 1000 : undefined);
  return (
    <Block flush title="Recent runs" aside="newest first">
      <Filters f={f} update={update} />
      <ErrorLine error={recent.error} className="p-4" />
      <div className="overflow-x-auto">
        <table className="num w-full md:min-w-[640px] text-sm">
          <thead className="bg-ink/[0.03] text-xs text-ink/55">
            <tr>
              <th className="h-8 px-3 text-left font-medium">Started</th>
              <th className="h-8 px-3 text-left font-medium">Step</th>
              <th className="h-8 px-3 text-left font-medium max-md:hidden">Model</th>
              <th className="h-8 px-3 text-left font-medium max-md:hidden">Account</th>
              <th className="h-8 px-3 text-left font-medium">Items</th>
              <th className="h-8 px-3 text-right font-medium max-md:hidden">Tokens</th>
              <th className="h-8 px-3 text-left font-medium max-md:hidden">State</th>
            </tr>
          </thead>
          <tbody>
            {recent.rows.map((r) => (
              <tr key={r.id} className={cn("relative border-t border-line hover:bg-ink/[0.03]", selected === r.id && "bg-accent/10")}>
                <td className="relative z-10 whitespace-nowrap px-3 py-1.5 text-ink/70" title={r.startedAt}>
                  <span className={cn("mr-1.5 inline-block size-2 rounded-full md:hidden", r.state === "failed" ? "bg-bad" : r.state === "running" ? "bg-accent" : "bg-ok")} role="img" aria-label={STATE_LABEL[r.state]} />
                  <TimeAgo iso={r.startedAt} /><span className="max-md:hidden"> ago</span>
                </td>
                <td className="whitespace-nowrap px-3 code text-xs">
                  <Link to={`/agents/${r.id}${location.search}`} className="after:absolute after:inset-0">
                    {r.step}
                  </Link>
                </td>
                <td className="px-3 max-md:hidden">{r.model}</td>
                <td className="whitespace-nowrap px-3 text-ink/70 max-md:hidden">{r.provider === "jev" ? "–" : r.accountLabel}</td>
                <td className="px-3">
                  <Items r={r} max={2} />
                </td>
                <td className="px-3 text-right max-md:hidden">{tokensOf(r) === null ? "–" : num(tokensOf(r)!)}</td>
                <td className="px-3 max-md:hidden">
                  <Badge tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!recent.loading && recent.rows.length === 0 && <p className="p-4 text-sm text-ink/55">No runs match.</p>}
      {(recent.more || recent.loading) && (
        <div className="border-t border-line p-3">
          <Button size="sm" loading={recent.loading} disabled={!recent.more} onClick={recent.loadMore} className="max-md:h-11">
            Load more
          </Button>
        </div>
      )}
    </Block>
  );
}

// ---- detail --------------------------------------------------------------------

function Collapsible({ title, text, empty, open: initial = false }: { title: string; text: string | null; empty: string; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  const Icon = open ? CaretDownIcon : CaretRightIcon;
  return (
    <div>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-7 items-center gap-1 text-xs font-semibold text-ink/65 max-md:min-h-11">
        <Icon className="text-[13px]" />
        {title}
        {text !== null && <span className="num font-normal text-ink/45">{num(text.length)} characters</span>}
      </button>
      {open &&
        (text === null ? (
          <p className="mt-1 text-sm text-ink/55">{empty}</p>
        ) : (
          <pre className="code mt-1 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-sunken p-3 text-xs leading-relaxed">{text}</pre>
        ))}
    </div>
  );
}

export function RunDetailBody({ id }: { id: number }) {
  const q = useQuery<AgentRunDetail>(`agent-${id}`, (a) => a.agents.get(id));
  const r = q.data;
  useNow(r && !r.endedAt ? 1000 : undefined);
  if (!r) return <div className="p-4">{q.error ? <ErrorLine error={q.error.message} /> : <span className="text-sm text-ink/50">Loading.</span>}</div>;
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Badge>
        <span className="code text-sm font-medium">{r.step}</span>
        <Badge tone="accent">{r.model}</Badge>
        <span className="text-sm text-ink/70">{who(r)}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink/55">Prompt</dt>
        <dd>
          <Link to={`/prompts#${r.promptId}`} className="code text-accent-ink hover:underline">
            {r.promptId}
          </Link>{" "}
          <span className="code text-xs text-ink/50">{r.promptVersion}</span>
        </dd>
        <dt className="text-ink/55">Started</dt>
        <dd className="num">
          <TimeAgo iso={r.startedAt} /> · {r.endedAt ? `took ${elapsed(r)}` : `running for ${elapsed(r)}`}
        </dd>
        <dt className="text-ink/55">Tokens</dt>
        <dd className="num">
          {r.inputTokens === null ? "–" : `${num(r.inputTokens)} in`} / {r.outputTokens === null ? "–" : `${num(r.outputTokens)} out`}
          {r.cacheReadTokens !== null && ` · cache ${num(r.cacheReadTokens)} read, ${num(r.cacheWriteTokens ?? 0)} written`}
        </dd>
        <dt className="text-ink/55">Job</dt>
        <dd>
          {r.jobId === null ? (
            "–"
          ) : (
            <Link to={`/pipeline/${r.jobId}`} className="num text-accent-ink hover:underline">
              Job {r.jobId}
            </Link>
          )}
        </dd>
        <dt className="text-ink/55">Items</dt>
        <dd>
          <Items r={r} max={8} expandable />
        </dd>
      </dl>
      {r.summary && <p className="rounded border border-line px-3 py-2 text-sm">{r.summary}</p>}
      {r.error && <p className="rounded border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{r.error}</p>}
      {!r.textsHidden && (
        <>
          <Collapsible title="Prompt" text={r.prompt} empty="Prompt text removed after ten years." />
          <Collapsible title="Output" text={r.output} empty={r.state === "running" ? "Still running." : "Output removed after ten years."} open />
        </>
      )}
    </div>
  );
}

export function DetailPanel({ params }: ViewProps) {
  const id = params.id ? Number(params.id) : null;
  const nav = useNavigate();
  if (id === null) return <div className="p-6 text-sm text-ink/50">Pick a run to see its prompt and output.</div>;
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex h-10 items-center gap-2 border-b border-line px-4">
        <h2 className="num text-sm font-semibold">Run {id}</h2>
        <button onClick={() => nav(`/agents${location.search}`)} aria-label="Close" className="ml-auto text-ink/50 hover:text-ink">
          <XIcon />
        </button>
      </div>
      <RunDetailBody id={id} />
    </div>
  );
}

// ---- page ----------------------------------------------------------------------

export function AgentsView({ params }: ViewProps) {
  const id = params.id ? Number(params.id) : undefined;
  return (
    <Page title="Agents" sub="Model calls through the prompt registry">
      <div className="mt-4 space-y-4">
        <RunningNow selected={id} />
        <RecentRuns selected={id} />
      </div>
    </Page>
  );
}

export function PhoneAgents(props: ViewProps) {
  const nav = useNavigate();
  const id = props.params.id ? Number(props.params.id) : null;
  return (
    <>
      <AgentsView {...props} />
      <Dialog.Root open={id !== null} onOpenChange={(o) => !o && nav(`/agents${location.search}`)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-lg border-t border-line bg-panel" aria-describedby={undefined}>
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
              <Dialog.Title className="num text-sm font-semibold">Run {id}</Dialog.Title>
              <Dialog.Close aria-label="Close" className="ml-auto flex size-11 items-center justify-center text-ink/60">
                <XIcon />
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{id !== null && <RunDetailBody id={id} />}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/** The model calls running now in a flowchart stage's steps (slot flow.panel). */
export function FlowRunning({ params }: ViewProps) {
  const steps = (params.steps ?? "").split(",").filter(Boolean);
  const q = useQuery<AgentRunPage>("agents-running", (a) => a.agents.list({ state: "running" }));
  const runs = (q.data?.runs ?? []).filter((r) => steps.includes(r.step));
  useNow(runs.length ? 1000 : undefined);
  if (steps.length === 0) return null;
  return (
    <section className="border-t border-line px-4 py-3">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-xs font-semibold text-ink/60">Running now{q.data && <span className="num ml-1 font-normal text-ink/50">{runs.length}</span>}</h3>
        <span className="ml-auto flex gap-2 text-xs">
          {steps.map((s) => (
            <Link key={s} to={`/agents?step=${encodeURIComponent(s)}`} className="text-accent-ink hover:underline">
              {steps.length > 1 ? `Agents: ${s}` : "Agents page"}
            </Link>
          ))}
        </span>
      </div>
      <ErrorLine error={q.error?.message} />
      {q.data && runs.length === 0 && <p className="text-sm text-ink/55">No model call is running.</p>}
      <ul className="divide-y divide-line">
        {runs.map((r) => (
          <li key={r.id} className="py-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link to={`/agents/${r.id}`} className="code text-sm font-medium hover:underline">{r.step}</Link>
              <Badge tone="accent">{r.model}</Badge>
              <span className="text-xs text-ink/70">{r.provider === "jev" ? "Jev" : (r.accountLabel ?? "unknown account")}</span>
              <span className="num ml-auto text-xs text-ink/70">{elapsed(r)}</span>
            </div>
            <div className="mt-0.5">
              <Items r={r} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

