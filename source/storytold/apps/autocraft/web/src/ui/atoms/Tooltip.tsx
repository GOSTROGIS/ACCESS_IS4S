import type { ReactNode } from "react";
import { Tooltip as T } from "radix-ui";

export function Tooltip({ label, children, side = "top" }: { label: ReactNode; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 rounded-md border border-line-strong bg-raised px-2 py-1 text-xs text-ink shadow-[0_8px_24px_rgba(0,0,0,0.25)] animate-fadeIn">
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
