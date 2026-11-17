import type { AgentRunTool } from "../../api/types";
import { Badge } from "../atoms/Badge";
import { span } from "../../lib/format";

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} kB` : `${(n / 1048576).toFixed(1)} MB`);

/** The tool calls of a model call, one compact row each: tool, arguments when present, result size, duration, error, check outcome. */
export function ToolCallList({ tools }: { tools: AgentRunTool[] }) {
  return (
    <ol className="divide-y divide-line overflow-hidden rounded border border-line text-xs">
      {tools.map((t) => {
        const ms = t.startedAt && t.endedAt ? Date.parse(t.endedAt) - Date.parse(t.startedAt) : null;
        return (
          <li key={t.seq} className="px-2.5 py-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="code font-medium">{t.tool}</span>
              {t.isError && <Badge tone="bad">error</Badge>}
              {t.check && <Badge tone={t.check.outcome && /pass|ok|success/i.test(t.check.outcome) ? "ok" : t.check.outcome ? "bad" : "neutral"}>{t.check.outcome ?? "running"}</Badge>}
              <span className="num ml-auto text-ink/50">
                {[t.resultBytes === null ? null : `${bytes(t.resultBytes)} result`, ms === null ? null : span(ms)].filter(Boolean).join(" · ")}
              </span>
            </div>
            {t.check && (
              <div className="code mt-0.5 break-words text-ink/70">
                {[t.check.command, t.check.crate, t.check.testName].filter(Boolean).join(" ")}
              </div>
            )}
            {t.args && <div className="code mt-0.5 break-words text-ink/55 [overflow-wrap:anywhere]">{t.args}</div>}
          </li>
        );
      })}
    </ol>
  );
}
