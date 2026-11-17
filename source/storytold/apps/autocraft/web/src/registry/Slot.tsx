import { Suspense } from "react";
import { modules } from "./index";
import type { ViewProps } from "./types";

/** Renders every module contribution to a named slot, in order. */
export function Slot({ name, ...props }: ViewProps & { name: string }) {
  const parts = modules
    .flatMap((m) => m.slots ?? [])
    .filter((s) => s.slot === name)
    .sort((a, b) => a.order - b.order);
  return (
    <>
      {parts.map((s, i) => (
        <Suspense key={i} fallback={null}><s.component {...props} /></Suspense>
      ))}
    </>
  );
}
