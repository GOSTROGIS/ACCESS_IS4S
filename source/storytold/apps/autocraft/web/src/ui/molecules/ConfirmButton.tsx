import { useEffect, useState } from "react";
import { Button } from "../atoms/Button";
import { cn } from "../cn";

/** A destructive action that takes a second click within four seconds. */
export function ConfirmButton({ label, confirmLabel, loading, onConfirm, className, idle = "ghost" }: { label: string; confirmLabel: string; loading?: boolean; onConfirm: () => void; className?: string; idle?: "ghost" | "secondary" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      size="sm"
      variant={armed ? "destructive" : idle}
      loading={loading}
      className={cn("max-md:h-11", className)}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}
