// The expanded body of a trace row. Each kind loads what it shows when the row opens.
import { useFoldedOne } from "../decisions/state";
import { Link } from "react-router-dom";
import { useQuery } from "../../api/client";
import type { Item, TraceEvent } from "../../api/types";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { Facts } from "../../ui/molecules/Facts";
import { Markdown } from "../../ui/molecules/Markdown";
import { TextLink } from "../../ui/atoms/TextLink";
import { ModelCallDetail } from "../../ui/organisms/ModelCallDetail";
import { TaskDetail } from "../../ui/organisms/TaskDetail";
import { DecisionSummary } from "../../ui/organisms/DecisionSummary";
import { ReviewDetail } from "../../ui/organisms/ReviewDetail";
import { batchPath, githubItemUrl } from "../../lib/links";
import { Badge } from "../../ui/atoms/Badge";

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : v === null || v === undefined ? null : String(v));

function Fields({ e, fields }: { e: TraceEvent; fields: Record<string, unknown> }) {
  if (e.kind === "review") return <ReviewDetail fields={fields} />;
  if (e.kind === "plan") {
    const reasons = Array.isArray(fields.reasons) ? (fields.reasons as unknown[]).map(String) : [];
    return (
      <Facts
        rows={[
          ["Change", fields.to ? `${text(fields.from) ?? "started"} → ${text(fields.to)}` : null],
          ["Waiting for", text(fields.wait)],
          ["Reasons", reasons.length > 0 && reasons.join("; ")],
          ["Commit", e.head && <span key="h" className="code text-xs">{e.head}</span>],
        ]}
      />
    );
  }
  if (e.kind === "job") {
    return (
      <Facts
        rows={[
          ["Step", text(fields.step)],
          ["State", text(fields.state)],
          ["Outcome", text(fields.outcome)],
          ["Error", text(fields.error)],
          ["Job", e.ref.jobId !== undefined && <Link key="j" to={`/pipeline/${e.ref.jobId}`} className="num text-accent-ink hover:underline">Job {e.ref.jobId}</Link>],
        ]}
      />
    );
  }
  // Writes and anything else: show each stored field by name.
  const rows = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]): [string, string] => [k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), String(v)]);
  return rows.length > 0 ? <Facts rows={rows} /> : null;
}

/** A GitHub comment shows its text when `comments` is given. */
export type EventItem = Pick<Item, "repo" | "number" | "kind"> & { comments?: Item["comments"] };

export function TraceEventBody({ event: e, item }: { event: TraceEvent; item: EventItem }) {
  const { repo, number } = item;
  const needsDetail = !(e.kind === "model-call" && e.ref.runId !== undefined) && !(e.kind === "decision" && e.ref.decisionId) && !(e.kind === "github" && e.ref.commentId);
  const detail = useQuery(`item-trace-detail:${repo}#${number}:${e.id}`, (a) => a.itemTraceDetail(repo, number, e.id), { enabled: needsDetail });
  const run = useQuery(`item-trace-run:${e.ref.runId}`, (a) => a.agents.get(e.ref.runId!), { enabled: e.kind === "model-call" && e.ref.runId !== undefined, pollMs: (d) => (d && !d.endedAt ? 3000 : false) });
  const task = useQuery(`item-trace-task:${e.ref.taskId}`, (a) => a.tasks.get(e.ref.taskId!), { enabled: e.ref.taskId !== undefined && e.kind !== "model-call" });
  const decisionQ = useQuery(`item-trace-decision:${e.ref.decisionId}`, (a) => a.decisions.get(e.ref.decisionId!), { enabled: e.kind === "decision" && !!e.ref.decisionId });
  const decision = { ...decisionQ, data: useFoldedOne(decisionQ.data) };

  if (e.kind === "model-call" && e.call && e.ref.runId !== undefined)
    return <ModelCallDetail call={e.call} runId={e.ref.runId} run={run.data} error={run.error?.message} />;

  if (e.kind === "decision" && e.ref.decisionId)
    return decision.data ? <DecisionSummary d={decision.data} href={`/needs/decisions/${encodeURIComponent(decision.data.id)}`} /> : <Pending error={decision.error?.message} />;

  if (e.kind === "github") {
    const c = e.ref.commentId ? item.comments?.find((x) => x.id === e.ref.commentId) : undefined;
    const url = githubItemUrl(repo, number, item.kind) + (c && /^\d+$/.test(c.id) ? (c.kind === "review" ? `#pullrequestreview-${c.id}` : `#issuecomment-${c.id}`) : "");
    return (
      <div className="flex flex-col gap-2">
        {c ? c.body.trim() ? <Markdown source={c.body} /> : <p className="text-sm text-ink/55">No text.</p> : null}
        {c?.reviewState && <div><Badge>{c.reviewState.toLowerCase().replace("_", " ")}</Badge></div>}
        <TextLink href={url} className="text-sm">Open on GitHub</TextLink>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {needsDetail && (detail.data ? <Fields e={e} fields={detail.data.fields} /> : detail.error ? <ErrorLine error={detail.error.message} /> : <div className="h-8" aria-hidden />)}
      {e.kind === "review" && e.ref.runIds?.map((id, i, all) => <ReviewCall key={id} runId={id} n={all.length > 1 ? i + 1 : 0} of={all.length} />)}
      {e.ref.taskId !== undefined && (task.data ? <TaskDetail task={task.data} /> : task.error ? <ErrorLine error={task.error.message} /> : <div className="h-16" aria-hidden />)}
      {e.ref.batchId !== undefined && (
        <p className="text-sm"><Link to={batchPath(e.ref.batchId)} className="text-accent-ink hover:underline">Batch #{e.ref.batchId}</Link></p>
      )}
      {e.kind === "check" && e.ref.runId !== undefined && (
        <p className="text-sm"><Link to={`/agents/${e.ref.runId}`} className="text-accent-ink hover:underline">Model call that ran it</Link></p>
      )}
    </div>
  );
}

/** One model call behind a review: its facts, prompt and output, loaded when the review row opens. `n` is 0 for a review made by a single call. */
function ReviewCall({ runId, n, of }: { runId: number; n: number; of: number }) {
  const run = useQuery(`item-trace-run:${runId}`, (a) => a.agents.get(runId), { pollMs: (d) => (d && !d.endedAt ? 3000 : false) });
  const r = run.data;
  const call = r && {
    model: r.model, provider: r.provider, account: r.accountLabel, state: r.state, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
    costUsd: r.costUsd, toolCalls: r.tools.length, endedAt: r.endedAt,
  };
  return (
    <div className="flex min-w-0 flex-col gap-2 border-t border-line pt-3">
      {n > 0 && <div className="text-xs font-semibold text-ink/60">Model call {n} of {of}{n > 1 ? " (fix turn or repeat)" : ""}</div>}
      {call ? <ModelCallDetail call={call} runId={runId} run={r} /> : run.error ? <ErrorLine error={run.error.message} /> : <div className="h-24" aria-hidden />}
    </div>
  );
}

function Pending({ error }: { error?: string }) {
  return error ? <ErrorLine error={error} /> : <div className="h-24" aria-hidden />;
}
