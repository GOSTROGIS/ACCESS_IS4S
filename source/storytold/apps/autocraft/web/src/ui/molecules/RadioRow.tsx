import { forwardRef, type ReactNode } from "react";
import { cn } from "../cn";

/**
 * One row of a pick-one list: the radio, a title followed on the same line by `marks` (action tags; they wrap only when the line is full)
 * and an optional tag at the right, and `children` under the title (the selected row's parameters). The row button is the radio; the tint marks the selected row. Props only.
 */
export const RadioRow = forwardRef<HTMLButtonElement, { selected: boolean; onSelect: () => void; title: ReactNode; marks?: ReactNode; tag?: ReactNode; tabIndex?: number; disabled?: boolean; children?: ReactNode }>(function RadioRow({ selected, onSelect, title, marks, tag, tabIndex, disabled, children }, ref) {
  return (
    <div className={cn("rounded-md", selected && "bg-accent/[0.07]")}>
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={tabIndex}
        disabled={disabled}
        onClick={onSelect}
        className="flex min-h-9 w-full min-w-0 items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-ink/[0.04] max-md:min-h-11"
      >
        <span className={cn("mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-accent" : "border-line-strong")}>{selected && <span className="size-2 rounded-full bg-accent" />}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
            <span className="min-w-0 break-words">{title}</span>
            {marks}
            {tag && <span className="ml-auto">{tag}</span>}
          </span>
        </span>
      </button>
      {children && <div className="space-y-2 pb-2.5 pl-9 pr-2 text-sm">{children}</div>}
    </div>
  );
});
