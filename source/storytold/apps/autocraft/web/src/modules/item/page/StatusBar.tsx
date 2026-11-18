// The live status bar at the top of the item page: one headline for what is happening to the item now, then its path through the pipeline.
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CheckCircleIcon, CheckIcon, CircleNotchIcon, HourglassMediumIcon, PauseCircleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { ItemBar, ItemBarStep, ItemBarTone, ItemPageData } from "../../../api/types";
import { clock } from "../../../lib/format";
import { useNow } from "../../../lib/useNow";
import { formatCost } from "../../../lib/trace";
import { cn } from "../../../ui/cn";
import { clearStarting, useStarting } from "../starting";
import { useApi, useQuery } from "../../../api/client";
import { useWrite } from "../../../lib/hooks";
import { useUser } from "../../../shell/UserContext";
import { ConfirmButton } from "../../../ui/molecules/ConfirmButton";
import { ErrorLine } from "../../../ui/atoms/ErrorLine";
import { Progress } from "../OpusCards";

const TONE: Record<ItemBarTone, { icon: Icon; box: string; spin?: boolean; pulse?: boolean }> = {
  running: { icon: CircleNotchIcon, box: "bg-accent/10 text-accent-ink", spin: true },
  queued: { icon: HourglassMediumIcon, box: "bg-accent/[0.06] text-accent-ink", pulse: true },
  waiting: { icon: PauseCircleIcon, box: "bg-warn/10 text-ink" },
  failed: { icon: WarningCircleIcon, box: "bg-bad/10 text-bad" },
  done: { icon: CheckCircleIcon, box: "bg-ink/[0.04] text-ink/70" },
  idle: { icon: PauseCircleIcon, box: "bg-ink/[0.04] text-ink/70" },
};

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Elapsed time of a running job, counted on the client from the server's start time. */
function Elapsed({ since }: { since: string }) {
  const now = useNow(1000);
  return <span className="num tabular-nums">{mmss(now - Date.parse(since))}</span>;
}

function Headline({ d }: { d: ItemPageData }) {
  const api = useApi();
  const write = useWrite();
  const operator = useUser().role === "operator";
  const starting = useStarting(d.repo, d.number);
  const { data: conv } = useQuery(`conversation:${d.repo}#${d.number}`, (a) => a.conversations.get(d.repo, d.number), { pollMs: (x) => (x?.pending ? 4000 : false) });
  const replying = !!conv?.pending && d.bar.headline.tone !== "running";
  const h = replying ? { ...d.bar.headline, tone: "running" as const, text: "The assistant is replying", model: null, startedAt: null, jobId: null, next: null } : d.bar.headline;
  const real = h.tone === "running" || h.tone === "queued";
  // The optimistic line gives way once the server shows the work.
  useEffect(() => {
    if (real) clearStarting(d.repo, d.number);
  }, [d.repo, d.number, real]);
  const showStarting = starting !== null && !real;
  const tone = TONE[showStarting ? "running" : h.tone];
  const Ico = tone.icon;
  const body = showStarting ? (
    <>Starting {starting}…</>
  ) : (
    <>
      {h.text}
      {h.tone === "running" && h.model && <> · {h.model.charAt(0).toUpperCase() + h.model.slice(1)}</>}
      {h.tone === "running" && h.startedAt && <> · <Elapsed since={h.startedAt} /></>}
    </>
  );
  const text = h.jobId !== null && !showStarting ? <Link to={`/pipeline/${h.jobId}`} className="hover:underline">{body}</Link> : body;
  return (
    <div className={cn("flex items-start gap-2.5 rounded px-3 py-2.5", tone.box)} role="status" aria-live="polite">
      <Ico weight={tone.spin ? "bold" : "fill"} className={cn("mt-0.5 shrink-0 text-lg", tone.spin && "animate-spin motion-reduce:animate-none", tone.pulse && !showStarting && "animate-pulse motion-reduce:animate-none")} />
      <div className="min-w-0 text-sm leading-5">
        <p className="font-medium">{text}</p>
        {h.next && !showStarting && <p className="mt-0.5 text-xs text-ink/60">Next: {h.next}</p>}
        {replying && <Progress lines={conv?.progress} />}
      </div>
      {operator && h.outside && (
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
          <ConfirmButton idle="secondary" label="Release" confirmLabel="Confirm release" loading={write.busy === "release"} onConfirm={() => void write.run("release", () => api.releaseOutside(d.repo, d.number))} />
          <ErrorLine error={write.error} />
        </div>
      )}
    </div>
  );
}

function StepMark({ s }: { s: ItemBarStep }) {
  if (s.state === "done") return <CheckIcon weight="bold" className="text-ok" />;
  if (s.state === "failed") return <XIcon weight="bold" className="text-bad" />;
  if (s.state === "current") return s.running ? <span className="size-2 rounded-full bg-accent" /> : <PauseCircleIcon weight="fill" className="text-warn" />;
  return <span className="size-1.5 rounded-full bg-ink/25" />;
}

function Step({ s }: { s: ItemBarStep }) {
  const cost = formatCost(s.costUsd);
  const body = (
    <>
      <span className="flex size-4 items-center justify-center text-sm"><StepMark s={s} /></span>
      <span className={cn("font-medium", s.state === "next" && "font-normal text-ink/45")}>{s.title}</span>
      {(s.at || cost) && <span className="num text-ink/50">{[s.at && clock(s.at), cost].filter(Boolean).join(" · ")}</span>}
    </>
  );
  const cls = cn("inline-flex min-h-7 items-center gap-1.5 rounded px-1.5 text-xs max-md:min-h-9", s.state === "current" && "bg-accent/10", s.state === "failed" && "bg-bad/10");
  return s.jobId !== null && s.state !== "next"
    ? <Link to={`/pipeline/${s.jobId}`} className={cn(cls, "hover:bg-ink/[0.06]")}>{body}</Link>
    : <span className={cls}>{body}</span>;
}

export function StatusBar({ d }: { d: ItemPageData }) {
  const bar: ItemBar = d.bar;
  return (
    <div className="mt-2.5 space-y-1.5">
      <Headline d={d} />
      {bar.steps.length > 0 && (
        <ol aria-label="Steps" className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
          {bar.steps.map((s, i) => (
            <li key={s.stage} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className="h-px w-3 bg-line-strong max-md:hidden" />}
              <Step s={s} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
