// The stage panel: a node's branches with links to their items, its edges, the
// runner steps with their daily limit and recent jobs, and the prompts it sends.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { useQuery } from "../../api/client";
import type { Flow, FlowNode, Job } from "../../api/types";
import { Slot } from "../../registry/Slot";
import { useUser } from "../../shell/UserContext";
import { Badge } from "../../ui/atoms/Badge";
import { cn } from "../../ui/cn";
import { num } from "../../lib/format";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { JobBadge } from "../pipeline/views";
import { StageLimitRow } from "../pipeline/controls";
import { PromptCard } from "../prompts/views";
import { BranchRow, nodeOf, recentText, waitsText } from "./parts";
import { useNow } from "../../lib/useNow";

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-xs font-semibold text-ink/60">{title}</h3>
        {aside && <span className="ml-auto text-xs">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

const spend = (jobs: Job[]): string | null => {
  const hasUnknownPrice = jobs.some(j => j.usage && j.usage.costUsd === null);
  const usd = hasUnknownPrice ? null : jobs.reduce((a, j) => a + (j.usage?.costUsd ?? 0), 0);
  const tokens = jobs.reduce((a, j) => a + (j.usage ? j.usage.input + j.usage.output : 0), 0);
  return usd ? `$${usd.toFixed(2)}` : tokens ? `${num(tokens)} tokens${hasUnknownPrice ? "; USD price unknown" : ""}` : hasUnknownPrice ? "USD price unknown" : null;
};

function StepBlock({ name, title }: { name: string; title: string }) {
  useNow();
  const { data, error } = useQuery(`flow-jobs:${name}`, (api) => api.pipeline.jobs({ step: name, limit: 4 }));
  const total = data ? spend(data.jobs) : null;
  return (
    <div className="mt-2 first:mt-0">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="code text-2xs text-ink/45">{name}</span>
        {total && <span className="ml-auto text-xs text-ink/55">{total} in these jobs</span>}
      </div>
      <div className="mt-1">
        <StageLimitRow step={name} />
      </div>
      {error && <p className="text-sm text-bad">{error.message}</p>}
      {data && !data.jobs.length && <p className="mt-1 text-sm text-ink/50">No jobs yet.</p>}
      <ul className="mt-1">
        {data?.jobs.map((j) => (
          <li key={j.id} className="flex min-w-0 items-start gap-2 py-1 text-sm">
            <JobBadge j={j} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink/80" title={j.summary ?? j.error ?? j.progress ?? undefined}>
                {j.summary ?? j.error ?? j.progress ?? "–"}
              </span>
              <span className="text-xs text-ink/50">
                <TimeAgo iso={j.endedAt ?? j.startedAt ?? j.requestedAt} /> · by {j.requestedBy}
                {j.usage?.costUsd ? ` · $${j.usage.costUsd.toFixed(2)}` : j.usage?.calls ? ` · ${num(j.usage.input + j.usage.output)} tokens` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PromptRow({ id }: { id: string }) {
  const { data } = useQuery("prompts", (api) => api.prompts());
  const [open, setOpen] = useState(false);
  const p = data?.prompts.find((x) => x.id === id);
  return (
    <li className="py-0.5">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-8 w-full items-center gap-2 rounded px-1 text-left text-sm hover:bg-ink/[0.06] max-md:min-h-11">
        <CaretRightIcon className={cn("shrink-0 text-ink/45 transition-transform", open && "rotate-90")} />
        <span className="code text-xs">{id}</span>
        {p && <span className="min-w-0 flex-1 truncate text-ink/60">{p.purpose}</span>}
        {p?.models.map((m) => (
          <Badge key={m} tone="accent">
            {m}
          </Badge>
        ))}
      </button>
      {open && p && (
        <div className="mt-1">
          <PromptCard p={p} />
        </div>
      )}
    </li>
  );
}

/** Nodes whose GitHub writes need a per-repo approval, with the word the Repos page uses. */
const APPROVES: Partial<Record<FlowNode["id"], string>> = { labels: "labelling", merge: "merging", fix: "fixing", fixup: "pushing", act: "commenting" };

export function FlowPanel({ flow, node: n, onClose, onSelect }: { flow: Flow; node: FlowNode; onClose: () => void; onSelect: (id: string) => void }) {
  useNow();
  const user = useUser();
  const { data: overview } = useQuery("pipeline", (api) => api.pipeline.overview());
  const into = flow.edges.filter((e) => e.to === n.id);
  const out = flow.edges.filter((e) => e.from === n.id);
  const recent = recentText(n);
  const stepTitle = (s: string) => overview?.steps.find((x) => x.name === s)?.title ?? s;
  return (
    <div className="min-h-full">
      <div className="flex items-start gap-2 px-4 pb-3 pt-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="code text-xs text-ink/45">Stage {n.stage}</span>
            <h2 className="text-lg font-semibold">{n.title}</h2>
            {n.mode === "gate" && <Badge tone="accent">People decide</Badge>}
            {n.mode === "planned" && <Badge>Planned</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-ink/70">{n.summary}</p>
          <p className="mt-0.5 text-xs text-ink/50">{waitsText(n.waitsOn)}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded text-ink/60 hover:bg-ink/[0.06] max-md:size-11">
          <XIcon />
        </button>
      </div>

      <Section title="Branches" aside={n.total !== null ? <span className="num text-ink/55">{num(n.total)} in this stage</span> : undefined}>
        <ul className="-mx-2">
          {n.branches.map((b) => (
            <BranchRow key={b.id} node={n} b={b} showHint />
          ))}
        </ul>
        {n.mode === "planned" && (
          <p className="mt-2 text-sm text-ink/65">
            Not built yet. Each taken PR will get the checks that suit it: tests, builds or screenshots. Today taken PRs go straight to the merge queue, where GitHub CI must pass.
          </p>
        )}
      </Section>

      {(into.length > 0 || out.length > 0) && (
        <Section title="Flow">
          <ul className="space-y-0.5 text-sm">
            {[...into.map((e) => ({ e, other: e.from, dir: "From" })), ...out.map((e) => ({ e, other: e.to, dir: "To" }))].map(({ e, other, dir }) => (
              <li key={`${e.from}-${e.to}`} className="flex items-center gap-2">
                <span className="w-9 text-ink/50">{dir}</span>
                <button onClick={() => onSelect(other)} className="font-medium text-accent-ink hover:underline">
                  {nodeOf(flow, other)?.title ?? other}
                </button>
                <span className="min-w-0 flex-1 truncate text-ink/60">{e.label}</span>
                <span className="num">{e.count === null ? "–" : num(e.count)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(recent || n.facts.length > 0) && (
        <Section title="Now">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            {recent && (
              <>
                <dt className="text-ink/55">Last 24 h</dt>
                <dd>{recent}</dd>
              </>
            )}
            {n.facts.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-ink/55">{f.label}</dt>
                <dd className="min-w-0 break-words">{/^\d{4}-\d\d-\d\dT/.test(f.value) ? <><TimeAgo iso={f.value} /></> : f.value}</dd>
              </div>
            ))}
          </dl>
          {n.id in APPROVES && user.role === "operator" && (
            <Link to="/repos" className="mt-2 inline-block text-sm text-accent-ink hover:underline">
              Approve {APPROVES[n.id]} per repo on the Repos page
            </Link>
          )}
        </Section>
      )}

      {/* Other modules add stage blocks here, such as the model calls running now. */}
      <Slot name="flow.panel" params={{ node: n.id, steps: n.steps.join(",") }} user={user} />

      {n.steps.length > 0 && (
        <Section title="Steps, limits and recent jobs" aside={<Link to="/pipeline" className="text-accent-ink hover:underline">Pipeline page</Link>}>
          {n.steps.map((s) => (
            <StepBlock key={s} name={s} title={stepTitle(s)} />
          ))}
        </Section>
      )}

      {n.prompts.length > 0 && (
        <Section title="Prompts" aside={<Link to="/prompts" className="text-accent-ink hover:underline">All prompts</Link>}>
          <ul>
            {n.prompts.map((id) => (
              <PromptRow key={id} id={id} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
