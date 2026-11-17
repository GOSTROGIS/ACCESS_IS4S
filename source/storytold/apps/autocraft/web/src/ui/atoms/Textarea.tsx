import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Multi-line input on the sunken surface. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      {...rest}
      className={cn(
        "w-full rounded border bg-sunken px-2.5 py-1.5 text-sm outline-none placeholder:text-ink/40 focus:border-accent/60",
        invalid ? "border-bad/60" : "border-line",
        className,
      )}
    />
  );
});
