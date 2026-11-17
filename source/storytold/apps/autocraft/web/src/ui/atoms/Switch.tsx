import { cn } from "../cn";

/** An on/off switch for a setting that takes effect at once. The padded button keeps a touch target of about 40 px around the track. */
export function Switch({ on, onChange, label, busy, className }: { on: boolean; onChange: (on: boolean) => void; label: string; busy?: boolean; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={cn("group -m-2 inline-flex shrink-0 items-center rounded-full p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-ink disabled:cursor-wait", className)}
    >
      <span className={cn("relative inline-flex h-6 w-11 items-center rounded-full border transition-colors group-disabled:opacity-60", on ? "border-accent bg-accent" : "border-line-strong bg-ink/10")}>
        <span className={cn("inline-block size-5 rounded-full bg-panel shadow-sm transition-transform", on ? "translate-x-5" : "translate-x-0.5")} />
      </span>
    </button>
  );
}
