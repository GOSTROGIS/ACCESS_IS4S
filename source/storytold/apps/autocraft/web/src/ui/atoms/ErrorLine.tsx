import { WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "../cn";

export function ErrorLine({ error, className }: { error: string | null | undefined; className?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className={cn("flex items-center gap-1.5 text-sm text-bad", className)}>
      <WarningCircleIcon className="shrink-0" />
      {error}
    </p>
  );
}
