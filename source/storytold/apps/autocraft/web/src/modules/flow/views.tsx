// The pipeline as a flowchart. Every stage with its branches and
// counts, the gates where people decide, and a panel per stage with its items,
// steps, limits, recent jobs and prompts. Stage and repo live in the URL.
import { Link } from "react-router-dom";
import { Dialog } from "radix-ui";
import { useQuery } from "../../api/client";
import type { Flow } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { useMedia } from "../../shell/useMedia";
import { RepoSelect } from "../../ui/molecules/RepoSelect";
import { num } from "../../lib/format";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { ErrorLine, useUrlState } from "../admin/parts";
import { PipelineSwitch } from "../pipeline/controls";
import { Chart } from "./Chart";
import { FlowPanel } from "./Panel";
import { PhoneFlow } from "./PhoneFlow";
import { hrefOf, nodeOf, peopleWork, WAIT } from "./parts";
import { useNow } from "../../lib/useNow";

const usePhoneFlow = () => useMedia("(max-width: 699px)");

function PeopleLine({ flow }: { flow: Flow }) {
  const work = peopleWork(flow);
  if (!work.length) return <p className="text-sm text-ink/60">Nothing is waiting for a person.</p>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-sm font-medium">Waiting for people</span>
      {work.map(({ node, b }) => {
        const chip = (
          <>
            <span className="num font-semibold">{num(b.count!)}</span> {b.label} <span className="text-ink/45">· {node.title}</span>
          </>
        );
        return b.link ? (
          <Link key={`${node.id}.${b.id}`} to={hrefOf(b.link)} data-active={b.gate} className="chip max-md:h-11">
            {chip}
          </Link>
        ) : (
          <span key={`${node.id}.${b.id}`} className="chip">
            {chip}
          </span>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/55">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-sm border border-accent/60 bg-accent/10" aria-hidden /> People decide
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-sm border border-dashed border-line-strong" aria-hidden /> Planned
      </span>
      {Object.entries(WAIT).map(([k, [Icon, label]]) => (
        <span key={k} className="flex items-center gap-1">
          <Icon className="text-ink/45" aria-hidden /> waits on {label}
        </span>
      ))}
      <span>Counts link to the items in each branch.</span>
    </div>
  );
}

export function FlowView(_: ViewProps) {
  useNow();
  const { state, update } = useUrlState();
  const repo = state.repo || null;
  const { data: flow, error } = useQuery(`flow:${repo ?? ""}`, (api) => api.flow(repo ?? undefined));
  const running = useQuery("flow-running", (api) => api.agents.list({ state: "running" }));
  const runs = running.data?.runs ?? [];
  const phone = usePhoneFlow();
  const selected = flow && state.node ? nodeOf(flow, state.node) : undefined;
  const select = (id: string | null) => update({ node: id });

  const panel = selected && flow && <FlowPanel flow={flow} node={selected} onClose={() => select(null)} onSelect={select} />;
  const open = flow?.nodes.find((n) => n.id === "synced")?.total ?? 0;

  return (
    <div className="relative flex h-full min-h-0">
      <div className="h-full min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-5 md:px-6">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold">Pipeline flow</h1>
              {flow && (
                <p className="mt-0.5 text-sm text-ink/55">
                  {num(open)} open items{repo ? ` in ${repo}` : ""} · last sync {flow.lastSync ? <><TimeAgo iso={flow.lastSync} /></> : "never"}
                  {flow.countedAt && <> · counted <TimeAgo iso={flow.countedAt} /></>}
                  {flow.uncounted > 0 && ` · ${num(flow.uncounted)} repos not counted yet`}
                </p>
              )}
            </div>
            <RepoSelect value={repo} onChange={(r) => update({ repo: r })} />
          </div>
          <PipelineSwitch className="mt-3" />
          <ErrorLine error={error && !flow ? error.message : null} className="mt-3" />
          {!flow && !error && <p className="mt-6 text-sm text-ink/50">Loading…</p>}
          {flow && (
            <>
              <div className="mt-4">
                <PeopleLine flow={flow} />
              </div>
              <div className="mt-5">{phone ? <PhoneFlow flow={flow} onSelect={select} runs={runs} /> : <Chart flow={flow} selected={selected?.id ?? null} onSelect={(id) => select(selected?.id === id ? null : id)} runs={runs} />}</div>
              <Legend />
              <p className="mt-2 text-xs text-ink/50">
                Full lists: <Link to="/pipeline" className="text-accent-ink hover:underline">Pipeline</Link> (switch, limits, jobs) ·{" "}
                <Link to="/prompts" className="text-accent-ink hover:underline">Prompts</Link> · <Link to="/next/merge" className="text-accent-ink hover:underline">Merge queue</Link>
              </p>
            </>
          )}
        </div>
      </div>
      {!phone && panel && (
        <aside aria-label={`${selected!.title} stage`} className="absolute inset-y-0 right-0 z-10 w-[min(440px,100%)] overflow-y-auto border-l border-line-strong bg-panel shadow-[-12px_0_32px_rgba(0,0,0,0.25)] animate-fadeIn">
          {panel}
        </aside>
      )}
      {phone && (
        <Dialog.Root open={!!panel} onOpenChange={(o) => !o && select(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 animate-fadeIn" />
            <Dialog.Content
              aria-describedby={undefined}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-lg border-t border-line-strong bg-raised pb-[env(safe-area-inset-bottom)] animate-rise"
            >
              <Dialog.Title className="sr-only">{selected?.title ?? "Stage"}</Dialog.Title>
              {panel}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}

