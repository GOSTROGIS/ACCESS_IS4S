import { useState } from "react";
import { Link } from "react-router-dom";
import { Popover } from "radix-ui";
import { WarningCircleIcon, WarningIcon } from "@phosphor-icons/react";
import { useApi, useQuery } from "../../api/client";
import { useUser } from "../../shell/UserContext";
import { useWrite } from "../../lib/hooks";
import { Button } from "../atoms/Button";
import type { NowProblem } from "../../api/types";
import { cn } from "../cn";
import { TimeAgo } from "../atoms/TimeAgo";

const TONE: Record<NowProblem["tone"], { Icon: typeof WarningIcon; text: string }> = {
  bad: { Icon: WarningCircleIcon, text: "text-bad" },
  warn: { Icon: WarningIcon, text: "text-warn" },
};

/** Problems keep one place in the list whatever order they arrive in. */
const AREAS: NowProblem["area"][] = ["pipeline", "runner", "workers", "sync", "breaker", "limit", "account", "jev", "main-ci", "jobs", "deadline", "liveness"];
const place = (p: NowProblem) => AREAS.indexOf(p.area);

/** Header indicator: icon and count of what is wrong, coloured by the worst problem; opens the list with a link to each fix. Renders nothing when healthy. */
export function HealthMenu() {
  const { data } = useQuery("now", (a) => a.now(), { pollMs: 30_000 });
  const [open, setOpen] = useState(false);
  const api = useApi();
  const operator = useUser().role === "operator";
  const write = useWrite();
  const problems = data?.health.problems ?? [];
  if (problems.length === 0) return null;
  const worst = problems.some((p) => p.tone === "bad") ? "bad" : "warn";
  const { Icon } = TONE[worst];
  const sorted = [...problems].sort((a, b) => place(a) - place(b) || (a.id < b.id ? -1 : 1));
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`${problems.length} problem${problems.length === 1 ? "" : "s"}`}
        className={cn("flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-ink/[0.06] max-md:h-11", TONE[worst].text)}
      >
        <Icon weight="fill" className="text-base" aria-hidden />
        <span className="num">{problems.length}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} collisionPadding={8} className="z-50 w-[min(380px,calc(100vw-16px))] rounded-md border border-line-strong bg-raised p-1 shadow-[0_12px_32px_rgba(0,0,0,0.28)] animate-rise">
          <ul role="status">
            {sorted.map((p) => {
              const t = TONE[p.tone];
              return (
                <li key={p.id} className="flex items-start">
                  <Link to={p.to} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-start gap-2 rounded px-2 py-2 text-sm hover:bg-ink/[0.07] max-md:min-h-11">
                    <t.Icon className={cn("mt-0.5 shrink-0", t.text)} aria-hidden />
                    <span className="min-w-0 flex-1 break-words text-ink [overflow-wrap:anywhere]">{p.text}</span>
                    {p.since && <TimeAgo iso={p.since} className="num ml-1 shrink-0 text-xs text-ink/50" />}
                  </Link>
                  {operator && p.ackStep && (
                    <Button loading={write.busy === p.id} onClick={() => void write.run(p.id, () => api.pipeline.ackDeadline(p.ackStep!))} className="m-1 shrink-0 max-md:h-11">
                      Acknowledge
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
