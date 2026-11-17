// One repo or every repo, picked from a searchable list: built for a few hundred repos.
import { useMemo, useState } from "react";
import { Popover } from "radix-ui";
import { CheckIcon, CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useQuery } from "../../api/client";
import { cn } from "../cn";

const SHOWN = 80;

/** `counts`: a number shown beside each repo that has one, and `total` beside the every-repo option. */
export function RepoSelect({
  value, onChange, className, allLabel = "Every repo", align = "end", counts,
}: { value: string | null; onChange: (repo: string | null) => void; className?: string; allLabel?: string; align?: "start" | "end"; counts?: { total: number; byRepo: Record<string, number> } }) {
  const { data: repos } = useQuery("repos", (api) => api.repos());
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = repos ?? [];
    if (!s) return all;
    // Names that start with the query first, then the ones that contain it.
    return [...all.filter((r) => r.toLowerCase().startsWith(s)), ...all.filter((r) => !r.toLowerCase().startsWith(s) && r.toLowerCase().includes(s))];
  }, [repos, q]);
  const pick = (r: string | null) => {
    onChange(r);
    setOpen(false);
    setQ("");
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          aria-label="Repo"
          className={cn("inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded border border-line bg-sunken px-2.5 text-sm max-md:h-11", value ? "text-accent-ink" : "text-ink/70", className)}
        >
          <span className="truncate">{value ?? allLabel}</span>
          <CaretDownIcon className="shrink-0 text-[11px] opacity-60" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={4}
          className="z-50 flex max-h-[min(60vh,420px)] w-[min(280px,calc(100vw-24px))] flex-col rounded-md border border-line-strong bg-raised shadow-[0_12px_32px_rgba(0,0,0,0.28)] animate-rise"
        >
          <div className="flex items-center gap-2 border-b border-line px-2.5">
            <MagnifyingGlassIcon className="shrink-0 text-ink/45" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hits[0]) pick(hits[0]);
              }}
              placeholder={repos ? `Search ${repos.length} repos` : "Search repos"}
              aria-label="Search repos"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink/40 max-md:h-11"
            />
          </div>
          <div role="listbox" aria-label="Repos" className="min-h-0 flex-1 overflow-y-auto p-1">
            {!q && <Option label={allLabel} on={value === null} onPick={() => pick(null)} count={counts?.total} />}
            {hits.slice(0, SHOWN).map((r) => (
              <Option key={r} label={r} on={value === r} onPick={() => pick(r)} mono count={counts?.byRepo[r]} />
            ))}
            {hits.length > SHOWN && <div className="px-2 py-1.5 text-xs text-ink/50">{hits.length - SHOWN} more: type to narrow</div>}
            {repos && !hits.length && <div className="px-2 py-1.5 text-sm text-ink/50">No repo matches</div>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Option({ label, on, onPick, mono, count }: { label: string; on: boolean; onPick: () => void; mono?: boolean; count?: number }) {
  return (
    <button role="option" aria-selected={on} onClick={onPick} className={cn("flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-ink/[0.06] max-md:h-11", on && "text-accent-ink")}>
      <CheckIcon className={cn("shrink-0", !on && "invisible")} />
      <span className={cn("min-w-0 flex-1 truncate", mono && "code")}>{label}</span>
      {!!count && <span className="num shrink-0 text-xs text-warn">{count}</span>}
    </button>
  );
}
