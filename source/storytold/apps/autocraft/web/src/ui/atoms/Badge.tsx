// Adapted from ArtCraft libs/components/badge (MIT OR Apache-2.0).
import type { ReactNode } from "react";
import { cn } from "../cn";

export type Tone = "neutral" | "ok" | "warn" | "bad" | "accent" | "merged";
const tones: Record<Tone, string> = {
  neutral: "border-line-strong text-ink/70",
  ok: "border-ok/40 text-ok bg-ok/10",
  warn: "border-warn/40 text-warn bg-warn/10",
  bad: "border-bad/40 text-bad bg-bad/10",
  accent: "border-accent-ink/40 text-accent-ink bg-accent/10",
  merged: "border-merged/40 text-merged bg-merged/10",
};

export function Badge({ children, tone = "neutral", icon, className }: { children: ReactNode; tone?: Tone; icon?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-2xs font-medium", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
