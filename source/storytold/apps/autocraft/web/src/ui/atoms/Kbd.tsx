// Adapted from ArtCraft libs/components/keybinds/src/lib/components/Kbd.tsx (MIT OR Apache-2.0).
import { cn } from "../cn";

export function Kbd({ keys, className }: { keys: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.split(" ").map((k, i) => (
        <kbd key={i} className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-line-strong bg-ink/[0.04] px-1 font-sans text-[11px] font-medium leading-none text-ink/60">
          {k}
        </kbd>
      ))}
    </span>
  );
}
