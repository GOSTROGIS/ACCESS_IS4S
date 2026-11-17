import type { ReactNode } from "react";
import { SpinnerIcon } from "@phosphor-icons/react";
import { Avatar } from "../atoms/Avatar";

/** Opus at work: its avatar, a spinner and a line of text; `children` holds the progress lines. */
export function OpusWorking({ text, children, className }: { text: string; children?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-sm text-ink/55">
        <Avatar login="opus" size={20} />
        <SpinnerIcon className="animate-spin text-ink/45" />
        {text}
      </div>
      {children}
    </div>
  );
}
