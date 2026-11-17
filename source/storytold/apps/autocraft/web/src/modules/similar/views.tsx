// "Similar items" on the Item page: the nearest items by embedding across the
// tracked repos, open and closed, for spotting duplicates.
import { useQuery } from "../../api/client";
import type { SimilarHit } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { Badge } from "../../ui/atoms/Badge";
import { Count } from "../../ui/atoms/Heading";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { cn } from "../../ui/cn";

const REASON: Record<NonNullable<SimilarHit["stateReason"]>, string> = { duplicate: "closed as duplicate", "not-planned": "closed, not planned", completed: "closed, completed" };

/** Cosine similarity as shown: two decimals, strong matches highlighted. */
export function Score({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn("num relative z-10 text-xs", score >= 0.9 ? "font-semibold text-warn" : score >= 0.8 ? "text-ink/75" : "text-ink/45", className)} title="Similarity (cosine, 1 = same text)">
      {score.toFixed(2)}
    </span>
  );
}

export function SimilarItems({ params }: ViewProps) {
  const repo = params.repo!;
  const n = Number(params.number);
  const { data, error } = useQuery(`similar:${repo}#${n}`, (api) => api.similar(repo, n, 10));
  return (
    <section className="border-b border-line px-4 py-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink/60">
        Similar items <Count n={data?.length} />
      </h2>
      {error && <p className="text-sm text-ink/50">{error.message}</p>}
      {!data && !error && <p className="text-sm text-ink/50">Loading…</p>}
      {data?.length === 0 && <p className="text-sm text-ink/50">None found.</p>}
      <ul className="space-y-2">
        {data?.map((h) => {
          const closed = h.state !== "open";
          return (
            <li key={`${h.repo}#${h.number}`} className="relative text-sm">
              <div className="flex items-start gap-1.5">
                <ItemRef repo={h.repo} number={h.number} kind={h.kind} state={h.state} title={h.title} stretch className={cn("flex-1", closed && "opacity-70")} />
                <Score score={h.score} className="mt-0.5 shrink-0" />
              </div>
              {h.label && <Badge className="mt-0.5">{h.label}</Badge>}
              {closed && (
                <div className={cn("pl-6 text-xs", h.stateReason === "duplicate" ? "text-warn" : "text-ink/45")}>
                  {h.state === "merged" ? "merged" : h.stateReason ? REASON[h.stateReason] : "closed"}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

