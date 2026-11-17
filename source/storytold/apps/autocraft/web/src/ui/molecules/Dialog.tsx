import { Dialog as D } from "radix-ui";
import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { IconButton } from "../atoms/Button";

/** A centred modal on desktop, a bottom sheet on phones. `size="lg"` is wider and sits higher, for a form with room to type. */
export function Dialog({ open, onClose, title, size = "md", children }: { open: boolean; onClose: () => void; title: string; size?: "md" | "lg"; children: ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50 animate-fadeIn" />
        <D.Content
          aria-describedby={undefined}
          className={`fixed z-50 border border-line-strong bg-raised shadow-[0_12px_32px_rgba(0,0,0,0.28)] animate-rise max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-lg max-md:pb-[env(safe-area-inset-bottom)] md:left-1/2 md:-translate-x-1/2 md:rounded-md ${size === "lg" ? "md:top-[10vh] md:w-[min(760px,calc(100vw-4rem))]" : "md:top-1/3 md:w-[420px]"}`}
        >
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <D.Title className="text-sm font-semibold">{title}</D.Title>
            <D.Close asChild>
              <IconButton label="Close" className="ml-auto max-md:size-11">
                <XIcon />
              </IconButton>
            </D.Close>
          </div>
          <div className="p-4">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
