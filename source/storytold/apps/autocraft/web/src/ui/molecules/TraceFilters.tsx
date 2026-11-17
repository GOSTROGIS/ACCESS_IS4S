import { CaretDownIcon } from "@phosphor-icons/react";
import { Popover } from "radix-ui";
import type { TraceKind } from "../../api/types";
import { Chip } from "../atoms/Chip";
import { useIsPhone } from "../../shell/useMedia";
import { TRACE_KIND, TRACE_KINDS } from "../../lib/trace";

/** Kind chips (none active means every kind) and the "Only AutoCraft" chip. On phones the kinds sit behind one "Show" button. */
export function TraceFilters({ kinds, onKinds, autocraftOnly, onAutocraftOnly }: {
  kinds: TraceKind[];
  onKinds: (k: TraceKind[]) => void;
  autocraftOnly: boolean;
  onAutocraftOnly: (v: boolean) => void;
}) {
  const phone = useIsPhone();
  const toggle = (k: TraceKind) => onKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  const chips = TRACE_KINDS.map((k) => (
    <Chip key={k} active={kinds.includes(k)} onClick={() => toggle(k)}>
      {TRACE_KIND[k].label}
    </Chip>
  ));
  const only = (
    <Chip active={autocraftOnly} onClick={() => onAutocraftOnly(!autocraftOnly)} className={phone ? undefined : "ml-auto"}>
      Only AutoCraft
    </Chip>
  );
  if (!phone)
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {chips}
        {only}
      </div>
    );
  const label = kinds.length === 0 ? "All" : kinds.length === 1 ? TRACE_KIND[kinds[0]!].label : `${kinds.length} kinds`;
  return (
    <div className="flex items-center gap-1.5">
      <Popover.Root>
        <Popover.Trigger asChild>
          <Chip active={kinds.length > 0} caret={false}>
            Show: {label}
            <CaretDownIcon className="text-[10px] opacity-60" />
          </Chip>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={4} className="z-50 flex w-[min(320px,calc(100vw-24px))] flex-wrap gap-1.5 rounded-md border border-line-strong bg-raised p-2 shadow-[0_12px_32px_rgba(0,0,0,0.28)] animate-rise">
            {chips}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {only}
    </div>
  );
}
