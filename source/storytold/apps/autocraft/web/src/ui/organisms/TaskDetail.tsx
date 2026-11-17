import { Link } from "react-router-dom";
import type { BuildTaskDetail } from "../../api/types";
import { Badge, type Tone } from "../atoms/Badge";
import { Facts } from "../molecules/Facts";
import { CodeBlock } from "../molecules/CodeBlock";
import { memSize, span } from "../../lib/format";

const TONE: Record<string, Tone> = { queued: "neutral", claimed: "accent", running: "accent", done: "ok", failed: "bad", cancelled: "neutral", lost: "bad" };

/** A build task: its steps with outcomes, the log tail, and a link to the task page for the full log and artifacts. */
export function TaskDetail({ task }: { task: BuildTaskDetail }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Facts
        rows={[
          ["State", <Badge key="s" tone={TONE[task.state] ?? "neutral"}>{task.state}</Badge>],
          ["Environment", task.envLabel],
          ["Summary", task.summary],
          ["Commands", task.plan.length > 0 && <span key="c" className="flex flex-col gap-0.5">{task.plan.map((s) => <span key={s.name} className="code break-words text-xs"><span className="text-ink/55">{s.name}: </span>{s.cmd.join(" ")}</span>)}</span>],
          [
            "Steps",
            task.results.length > 0 && (
              <span key="r" className="flex flex-col gap-0.5">
                {task.results.map((r) => (
                  <span key={r.step} className="text-xs">
                    <span className="code">{r.step}</span> <span className={r.timedOut || (r.exitCode ?? 0) !== 0 ? "text-bad" : "text-ok"}>{r.timedOut ? "timed out" : `exit ${r.exitCode ?? "none"}`}</span>{" "}
                    <span className="num text-ink/50">{span(r.durationMs)}</span>
                    {r.peakMemBytes !== undefined && <span className="num text-ink/50"> · peak {memSize(r.peakMemBytes)}</span>}
                    {r.oomKilled && <span className="text-bad"> · out of memory</span>}
                  </span>
                ))}
              </span>
            ),
          ],
          ["Artifacts", task.artifacts.length > 0 && task.artifacts.map((a) => a.name).join(", ")],
          ["Task", <Link key="t" to={`/envs/${task.id}`} className="num text-accent-ink hover:underline">Task {task.id}: full log and artifacts</Link>],
        ]}
      />
      {task.logTail === null ? null : task.logTail ? <CodeBlock title={task.logTruncated ? "Log (end)" : "Log"} text={task.logTail} lines={14} /> : <p className="text-sm text-ink/55">No log yet.</p>}
    </div>
  );
}
