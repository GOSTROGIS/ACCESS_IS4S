import type { ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "../cn";

/** One muted line, with an optional muted icon. */
export function EmptyState({ icon: Icon, children, className }: { icon?: PhosphorIcon; children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 px-4 py-6 text-sm text-ink/50", className)}>
      {Icon && <Icon className="shrink-0 text-base" aria-hidden />}
      {children}
    </p>
  );
}
