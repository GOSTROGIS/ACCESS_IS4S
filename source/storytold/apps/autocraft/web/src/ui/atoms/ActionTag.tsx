import type { ComponentType } from "react";
import { ArrowCounterClockwiseIcon, ArrowFatUpIcon, ArrowsLeftRightIcon, ChatTextIcon, EyeIcon, GitMergeIcon, PlusCircleIcon, TagIcon, UserPlusIcon, XCircleIcon } from "@phosphor-icons/react";
import type { ActionTag as Tag } from "../../api/types";
import { cn } from "../cn";

const TAGS: Record<Tag, { icon: ComponentType<{ className?: string }>; word: string }> = {
  merge: { icon: GitMergeIcon, word: "merge" },
  close: { icon: XCircleIcon, word: "close" },
  reopen: { icon: ArrowCounterClockwiseIcon, word: "reopen" },
  comment: { icon: ChatTextIcon, word: "comment" },
  open_issue: { icon: PlusCircleIcon, word: "open issue" },
  label: { icon: TagIcon, word: "label" },
  unlabel: { icon: TagIcon, word: "remove label" },
  assign: { icon: UserPlusIcon, word: "assign" },
  request_review: { icon: EyeIcon, word: "request review" },
  push: { icon: ArrowFatUpIcon, word: "push" },
  move: { icon: ArrowsLeftRightIcon, word: "move" },
};

/** The plain words for a set of tags, as in "Do it: comment, close". */
export const tagWords = (tags: Tag[]) => tags.map((t) => TAGS[t].word).join(", ");

const PILL = "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-ink/[0.06] px-2 text-2xs font-normal text-ink/60";

/** One GitHub write as a muted pill: icon and word. Not interactive. */
export function ActionTag({ tag, className }: { tag: Tag; className?: string }) {
  const { icon: Icon, word } = TAGS[tag];
  return (
    <span className={cn(PILL, className)}>
      <Icon className="text-[12px]" />
      {word}
    </span>
  );
}
