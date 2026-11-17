// "Our build": AutoCraft's own workspace build of the PR head, shown beside CI. A second opinion, never a gate.
import type { ItemPrBuild } from "../../api/types";
import { Badge, type Tone } from "../atoms/Badge";
import { cn } from "../cn";

const STATE: Record<ItemPrBuild["state"], [string, Tone]> = {
  queued: ["Queued", "neutral"], running: ["Running", "accent"], passed: ["Passed", "ok"], failed: ["Failed", "bad"], error: ["Error", "warn"], stale: ["Stale", "neutral"],
};

export function PrBuildLine({ b, className }: { b: ItemPrBuild | null | undefined; className?: string }) {
  if (!b || b.state === "stale") return null;
  const [label, tone] = STATE[b.state];
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/65", className)}>
      <span className="font-medium text-ink/80">Our build</span>
      <Badge tone={tone}>{label}</Badge>
      {b.disagree && <Badge tone="warn">Failed here, CI passed</Badge>}
      {b.summary && b.state !== "passed" && <span className="min-w-0 break-words text-ink/60">{b.summary}</span>}
      {!b.current && <span className="text-ink/45">older commit</span>}
    </p>
  );
}
