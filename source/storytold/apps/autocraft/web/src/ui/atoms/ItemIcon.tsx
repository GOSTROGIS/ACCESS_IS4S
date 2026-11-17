import { CheckCircleIcon, CircleIcon, GitMergeIcon, GitPullRequestIcon, RadioButtonIcon, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ItemKind, ItemState } from "../../api/types";
import { cn } from "../cn";

/** Phosphor icon and colour for an item, as GitHub shows its state. */
function look(kind: ItemKind | null | undefined, state: ItemState | null | undefined, draft: boolean | undefined): [PhosphorIcon, string, string] {
  if (kind === "pr") {
    if (state === "merged") return [GitMergeIcon, "text-merged", "merged PR"];
    if (state === "closed") return [GitPullRequestIcon, "text-bad", "closed PR"];
    return draft ? [GitPullRequestIcon, "text-ink/60", "draft PR"] : [GitPullRequestIcon, "text-ok", "open PR"];
  }
  if (kind === "issue") return state === "closed" ? [CheckCircleIcon, "text-merged", "closed issue"] : [RadioButtonIcon, "text-ok", "open issue"];
  return [CircleIcon, "text-ink/45", "item"];
}

/** The item's kind and state as a plain icon, as tall as one text line (`1lh`) so it sits with the text, also on wrapped titles. */
export function ItemIcon({ kind, state, draft, className }: { kind?: ItemKind | null; state?: ItemState | null; draft?: boolean; className?: string }) {
  const [Icon, tone, what] = look(kind, state, draft);
  return (
    <span role="img" aria-label={what} className={cn("inline-flex h-[1lh] shrink-0 items-center", tone, className)}>
      <Icon aria-hidden size="1.2em" weight="bold" />
    </span>
  );
}
