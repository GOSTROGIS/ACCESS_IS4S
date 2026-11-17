// One item's path through the pipeline flow, as a compact row on the item page:
// the stages it has passed, the one it is in now, and what comes next.
import { Link } from "react-router-dom";
import { CheckIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "../../api/client";
import type { Decision, Item } from "../../api/types";
import { cn } from "../../ui/cn";

type Step = { node: string; label: string; detail: string; done: boolean };

const ANSWER: Record<string, string> = { take: "wanted in core", "small-extra": "small extra", plugin: "plug-in candidate", close: "out of scope", "need-info": "check the reference app", backlog: "backlog", handled: "handled in the conversation", withdrawn: "withdrawn" };
const STATUS: Record<string, string> = { waiting: "waiting for a second opinion", disagree: "models disagree", unclassified: "not classified yet" };

const FINAL = { take: "take", "take-fix": "take with fixes", hold: "hold", close: "close" } as const;

function stepsOf(it: Item, scope: Decision | null | undefined): Step[] {
  const has = (s: string) => it.stages.some((x) => (x.stage as string) === s);
  const verdict = [...it.stages].reverse().find((x) => x.stage === "take" || x.stage === "hold" || x.stage === "close")?.stage;
  const settled = it.settled.status === "settled";
  const out: Step[] = [
    { node: "synced", label: "Synced", detail: "", done: true },
    { node: "classify", label: "Classify", detail: settled ? it.settled.label ?? "" : STATUS[it.settled.status] ?? "", done: settled },
  ];
  if (scope !== undefined || it.settled.flags.includes("needs decision"))
    out.push({ node: "decide", label: "Decide", detail: scope ? (scope.answer ? ANSWER[scope.answer] ?? scope.answer : "waiting for an answer") : "not asked yet", done: !!scope?.answer });
  if (settled) out.push({ node: "labels", label: "Labels", detail: has("labeled") ? "labelled" : "not labelled yet", done: has("labeled") });
  if (it.kind === "pr") {
    const r = it.reviews;
    const reviewed = r ? r.current && r.final.decided : has("reviewed");
    const detail = r ? (!r.current ? "not reviewed at this head" : FINAL[r.final.verdict]) : has("reviewed") ? (verdict ?? "reviewed") : "not reviewed yet";
    out.push({ node: "review", label: "Review", detail, done: reviewed });
    if ((r ? r.current && r.final.verdict === "take" : verdict === "take") || has("merged") || it.state === "merged")
      out.push({ node: "merge", label: "Merge queue", detail: it.state === "merged" ? "merged" : "in the queue", done: it.state === "merged" });
  }
  return out;
}

function Row({ steps }: { steps: Step[] }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <nav aria-label="Path through the pipeline" className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs">
      {steps.map((s, i) => (
        <span key={s.node} className="flex items-center gap-1">
          {i > 0 && <CaretRightIcon className="text-ink/30" aria-hidden />}
          <Link
            to={`/flow?node=${s.node}`}
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2 hover:bg-ink/[0.06] max-md:h-9",
              s.done ? "border-line text-ink/70" : i === current ? "border-accent-ink/60 bg-accent/10 font-medium text-accent-ink" : "border-dashed border-line-strong text-ink/45",
            )}
          >
            {s.done && <CheckIcon className="text-ok" aria-label="done" />}
            <span>
              {s.label}
              {s.detail && <span className={cn("font-normal", s.done ? "text-ink/50" : "")}>: {s.detail}</span>}
            </span>
          </Link>
        </span>
      ))}
    </nav>
  );
}

function WithScope({ it, id }: { it: Item; id: string }) {
  const { data } = useQuery(`decision:${id}`, (api) => api.decisions.get(id));
  return <Row steps={stepsOf(it, data ?? null)} />;
}

export function ItemPath({ it }: { it: Item }) {
  const scopeId = it.decisionIds.find((d) => d.endsWith(":scope"));
  return scopeId ? <WithScope it={it} id={scopeId} /> : <Row steps={stepsOf(it, undefined)} />;
}
