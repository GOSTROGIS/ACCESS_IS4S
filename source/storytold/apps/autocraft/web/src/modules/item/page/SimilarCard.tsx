// Similar items as a folded card: the nearest items by embedding, fetched when the card opens.
import { useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "../../../api/client";
import { Badge } from "../../../ui/atoms/Badge";
import { ItemRef } from "../../../ui/molecules/ItemRef";
import { cn } from "../../../ui/cn";
import { Score } from "../../similar/views";
import type { SimilarHit } from "../../../api/types";

const REASON: Record<NonNullable<SimilarHit["stateReason"]>, string> = { duplicate: "closed as duplicate", "not-planned": "closed, not planned", completed: "closed, completed" };

export function SimilarCard({ repo, number }: { repo: string; number: number }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-b border-line px-4 py-1 md:px-6" aria-label="Similar items">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-9 w-full items-center gap-1.5 text-left text-sm font-medium text-ink/75 hover:text-ink max-md:h-11">
        <CaretRightIcon className={cn("text-ink/45 transition-transform duration-fast", open && "rotate-90")} />
        Similar items
      </button>
      {open && <Hits repo={repo} number={number} />}
    </section>
  );
}

function Hits({ repo, number }: { repo: string; number: number }) {
  const { data, error } = useQuery(`similar:${repo}#${number}`, (api) => api.similar(repo, number, 10));
  return (
    <div className="pb-3 pl-5 animate-fadeIn">
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
              {closed && <div className={cn("pl-6 text-xs", h.stateReason === "duplicate" ? "text-warn" : "text-ink/45")}>{h.state === "merged" ? "merged" : h.stateReason ? REASON[h.stateReason] : "closed"}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
