import { useNavigate } from "react-router-dom";
import type { QueueSlot } from "../../api/types";
import { cn } from "../cn";

/** The Next page's tab for the stage: the merge queue for merges, the step lists for every other stage. */
export const queueItemPath = (slot: QueueSlot): string => (slot.tab === "merge" ? "/next/merge" : "/next/steps");

/** "Review #3": the item's place in line for its next stage. A button, so it also works inside a row that is a link. */
export function QueueBadge({ slot, className }: { slot: QueueSlot | null | undefined; className?: string }) {
  const navigate = useNavigate();
  if (!slot) return null;
  return (
    <button
      type="button"
      title={`Place ${slot.place} in line for ${slot.stage}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(queueItemPath(slot));
      }}
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-accent-ink/40 bg-accent/10 px-2 text-2xs font-medium text-accent-ink hover:bg-accent/20 max-md:h-7", className)}
    >
      {slot.stage} <span className="num">#{slot.place}</span>
    </button>
  );
}
