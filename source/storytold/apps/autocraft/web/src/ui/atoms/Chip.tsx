import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { cn } from "../cn";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Muted number after the label. */
  count?: ReactNode;
  /** Dropdown caret after the label. */
  caret?: boolean;
}

/** Outlined toggle chip (the global `.chip` class); the active state is an accent tint. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip({ active, count, caret, className, children, ...rest }, ref) {
  return (
    <button ref={ref} type="button" aria-pressed={active} data-active={active ? "true" : undefined} className={cn("chip", className)} {...rest}>
      {children}
      {count !== undefined && count !== null && <span className="num opacity-60">{count}</span>}
      {caret && <CaretDownIcon className="text-[10px] opacity-60" />}
    </button>
  );
});
