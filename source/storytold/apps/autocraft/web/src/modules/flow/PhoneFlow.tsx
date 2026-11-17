// The flowchart on a phone: the stages top to bottom, each with its branches
// indented and the stages it feeds; a tap on a stage opens its panel.
import { ArrowDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { AgentRun, Flow, FlowNode } from "../../api/types";
import { Badge } from "../../ui/atoms/Badge";
import { cn } from "../../ui/cn";
import { num } from "../../lib/format";
import { BranchRow, nodeOf, recentText, RunningMarker } from "./parts";

const ORDER: FlowNode["id"][] = ["synced", "dupes", "classify", "priority", "decide", "labels", "review", "fix", "fixup", "verify", "merge", "act"];

export function PhoneFlow({ flow, onSelect, runs }: { flow: Flow; onSelect: (id: string) => void; runs: AgentRun[] }) {
  const nodes = ORDER.map((id) => nodeOf(flow, id)).filter((n): n is FlowNode => !!n);
  return (
    <ol className="space-y-0">
      {nodes.map((n, i) => {
        const out = flow.edges.filter((e) => e.from === n.id);
        const recent = recentText(n);
        return (
          <li key={n.id}>
            {i > 0 && (
              <div className="flex h-5 items-center pl-5 text-ink/30" aria-hidden>
                <ArrowDownIcon className="text-[13px]" />
              </div>
            )}
            <section
              aria-label={n.title}
              className={cn("rounded-md border bg-panel", n.mode === "gate" ? "border-accent/60" : n.mode === "planned" ? "border-dashed border-line-strong" : "border-line-strong")}
            >
              <button onClick={() => onSelect(n.id)} className="flex min-h-12 w-full items-start gap-2 px-3 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="code text-2xs text-ink/40">{n.stage}</span>
                    <span className="text-md font-semibold">{n.title}</span>
                    {n.mode === "gate" && <Badge tone="accent">People decide</Badge>}
                    {n.mode === "planned" && <Badge>Planned</Badge>}
                    <RunningMarker n={n} runs={runs} />
                  </span>
                  <span className={cn("mt-0.5 block text-xs", n.mode === "gate" && n.summary !== "Nothing waiting" ? "font-medium text-accent-ink" : "text-ink/60")}>{n.summary}</span>
                </span>
                <CaretRightIcon className="mt-1 shrink-0 text-ink/40" />
              </button>
              <ul className="ml-4 border-l-2 border-line pb-1.5 pl-1 pr-1">
                {n.branches.map((b) => (
                  <BranchRow key={b.id} node={n} b={b} />
                ))}
              </ul>
              {(recent || out.length > 0) && (
                <div className="space-y-0.5 border-t border-line px-3 py-2 text-xs text-ink/60">
                  {out.map((e) => (
                    <div key={e.to} className="flex gap-1.5">
                      <span className="text-ink/40">→</span>
                      <button onClick={() => onSelect(e.to)} className="font-medium text-accent-ink">
                        {nodeOf(flow, e.to)?.title}
                      </button>
                      <span className="min-w-0 flex-1 truncate">{e.label}</span>
                      <span className="num">{e.count === null ? "" : num(e.count)}</span>
                    </div>
                  ))}
                  {recent && <div>Last 24 h: {recent}</div>}
                </div>
              )}
            </section>
          </li>
        );
      })}
    </ol>
  );
}
