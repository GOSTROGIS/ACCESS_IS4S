import type { AgentRunDetail, TraceEvent } from "../../api/types";
import { Link } from "react-router-dom";
import { Facts } from "../molecules/Facts";
import { CodeBlock } from "../molecules/CodeBlock";
import { ToolCallList } from "../molecules/ToolCallList";
import { ErrorLine } from "../atoms/ErrorLine";
import { num, span } from "../../lib/format";

type Call = NonNullable<TraceEvent["call"]>;

const usd = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;

/** A model call: facts from the trace row at once, then prompt, output and tool calls when the run detail has arrived. Never fetches. */
export function ModelCallDetail({ call, runId, run, error }: { call: Call; runId: number; run?: AgentRunDetail; error?: string }) {
  const tokens = call.inputTokens === null && call.outputTokens === null ? null : `${call.inputTokens === null ? "–" : num(call.inputTokens)} in / ${call.outputTokens === null ? "–" : num(call.outputTokens)} out`;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Facts
        rows={[
          ["Model", call.model],
          ["Account", call.account],
          ["Tokens", tokens],
          ["Cost", call.costUsd === null ? null : usd(call.costUsd)],
          ["Took", call.endedAt && run ? span(Date.parse(call.endedAt) - Date.parse(run.startedAt)) : null],
          ["Run", <Link key="r" to={`/agents/${runId}`} className="num text-accent-ink hover:underline">Run {runId}</Link>],
        ]}
      />
      {error && <ErrorLine error={error} />}
      {run?.error && <p className="rounded border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{run.error}</p>}
      {/* The blocks below hold their height from the first paint so the rows under them do not jump. */}
      {run?.textsHidden ? null : run ? (
        <>
          {run.prompt !== null ? <CodeBlock title="Prompt" text={run.prompt} lines={8} /> : <p className="text-sm text-ink/55">Prompt text removed after its retention period.</p>}
          {run.output !== null ? <CodeBlock title="Output" text={run.output} lines={12} /> : <p className="text-sm text-ink/55">{run.state === "running" ? "Still running." : "Output removed after its retention period."}</p>}
          {run.tools.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-ink/60">Tool calls <span className="num font-normal text-ink/45">{run.tools.length}</span></div>
              <ToolCallList tools={run.tools} />
            </div>
          )}
        </>
      ) : (
        !error && <div className="h-24 rounded border border-line bg-sunken/50" aria-hidden />
      )}
    </div>
  );
}
