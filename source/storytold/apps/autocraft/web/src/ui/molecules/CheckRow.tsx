import type { ReactNode } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "../cn";

/** One row of a tick list: the checkbox, a title with an optional tag on the right, and `children` (the extra's text and its edit control). Props only. */
export function CheckRow({ checked, onChange, title, tag, disabled, action, children }: { checked: boolean; onChange: (on: boolean) => void; title: ReactNode; tag?: ReactNode; disabled?: boolean; /** A control at the row's right edge, outside the checkbox (an edit button). */ action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-md">
      <div className="flex items-start">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex min-h-9 min-w-0 flex-1 items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-ink/[0.04] max-md:min-h-11"
      >
        <span className={cn("mt-[3px] flex size-4 shrink-0 items-center justify-center rounded border", checked ? "border-accent bg-accent text-white" : "border-line-strong")}>{checked && <CheckIcon weight="bold" className="text-[11px]" />}</span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
          <span className="min-w-0 flex-1 break-words">{title}</span>
          {tag}
        </span>
      </button>
      {action}
      </div>
      {children && <div className="pb-1.5 pl-9 pr-2 text-sm">{children}</div>}
    </div>
  );
}
