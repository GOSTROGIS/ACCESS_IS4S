import { UnlessProject } from "../../shell/ScopePicker";
import { DropdownMenu } from "radix-ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useQuery } from "../../api/client";
import type { DecisionKind } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { cn } from "../../ui/cn";
import { Count } from "../../ui/atoms/Heading";
import { KIND_LABEL, KINDS, useDecisionFilter } from "./state";

const AGES = [
  { v: "", label: "Any age" },
  { v: "1", label: "Older than 1 day" },
  { v: "2", label: "Older than 2 days" },
  { v: "3", label: "Older than 3 days" },
];

export function DecisionsToolbar(props: ViewProps & { phone?: boolean }) {
  const { phone } = props;
  const { filter, update } = useDecisionFilter();
  const { data: open } = useQuery(`count:open:${filter.all ? "all" : "mine"}`, (api) => api.decisions.list({ status: "open", limit: 0, all: filter.all }));
  const { data: answered } = useQuery("count:answered", (api) => api.decisions.list({ status: "answered", limit: 0 }));
  const { data: backlog } = useQuery("count:backlog", (api) => api.decisions.list({ status: "backlog", limit: 0 }));
  const { data: snoozed } = useQuery("count:snoozed", (api) => api.decisions.list({ status: "snoozed", limit: 0 }));
  const { data: withOpinions } = useQuery("count:opinions", (api) => api.decisions.list({ status: "opinions", limit: 0 }));
  const tabs = [
    { t: "open" as const, label: "Waiting", n: open?.total },
    { t: "opinions" as const, label: "Feedback", n: withOpinions?.total },
    { t: "answered" as const, label: "Answered", n: answered?.total },
    { t: "backlog" as const, label: "Backlog", n: backlog?.total },
    { t: "snoozed" as const, label: "Snoozed", n: snoozed?.total },
  ];
  const kinds = filter.kind ?? [];
  const toggleKind = (k: DecisionKind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    update({ kind: next.length ? next.join(",") : null });
  };

  return (
    <div className={cn("flex items-center gap-x-4 gap-y-2", phone ? "flex-wrap" : "flex-nowrap")}>
      <div role="tablist" aria-label="Status" className="flex shrink-0 items-center gap-1">
        {tabs.map(({ t, label, n }) => (
          <button
            key={t}
            role="tab"
            aria-selected={filter.status === t}
            onClick={() => update({ tab: t === "open" ? null : t })}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded px-2.5 text-sm transition-colors duration-fast",
              filter.status === t ? "bg-ink/[0.08] font-medium text-ink" : "text-ink/60 hover:bg-ink/[0.05] hover:text-ink",
            )}
          >
            {label}
            <Count n={n} />
          </button>
        ))}
      </div>
      <div className={cn("flex items-center gap-1", phone ? "flex-wrap" : "min-w-0 overflow-x-auto scrollbar-none")}>
        {KINDS.map((k) => (
          <button key={k} className="chip" data-active={kinds.includes(k)} aria-pressed={kinds.includes(k)} onClick={() => toggleKind(k)}>
            {KIND_LABEL[k]}
            {open?.byKind[k] ? <span className="num text-ink/45">{open.byKind[k]}</span> : null}
          </button>
        ))}
      </div>
      <div className={cn("flex items-center gap-2", !phone && "ml-auto")}>
        <UnlessProject><RepoPicker selected={filter.repo ?? []} onChange={(r) => update({ repo: r.length ? r.join(",") : null })} /></UnlessProject>
        <Picker label={AGES.find((a) => a.v === String(filter.minAge ?? ""))?.label ?? "Any age"} items={AGES} onPick={(v) => update({ age: v || null })} />
        <button className="chip" data-active={!!filter.all} aria-pressed={!!filter.all} onClick={() => update({ all: filter.all ? null : "1" })} title="Also the questions only others can settle">
          Everything
        </button>
      </div>
    </div>
  );
}

const menuCls = "z-50 max-h-[60vh] min-w-[200px] overflow-y-auto rounded-md border border-line-strong bg-raised p-1 shadow-[0_12px_32px_rgba(0,0,0,0.28)] animate-rise";
const itemCls = "flex h-8 cursor-default items-center gap-2.5 rounded px-2 text-sm outline-none data-[highlighted]:bg-ink/[0.07]";

function Picker({ label, items, onPick }: { label: string; items: { v: string; label: string }[]; onPick: (v: string) => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="chip">
        {label} <CaretDownIcon className="text-[10px]" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={menuCls}>
          {items.map((i) => (
            <DropdownMenu.Item key={i.v} onSelect={() => onPick(i.v)} className={itemCls}>
              {i.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RepoPicker({ selected, onChange }: { selected: string[]; onChange: (r: string[]) => void }) {
  const { data: repos } = useQuery("repos", (api) => api.repos());
  const label = selected.length === 0 ? "All repos" : selected.length === 1 ? selected[0] : `${selected.length} repos`;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="chip" data-active={selected.length > 0}>
        {label} <CaretDownIcon className="text-[10px]" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={menuCls}>
          {selected.length > 0 && (
            <DropdownMenu.Item onSelect={() => onChange([])} className={cn(itemCls, "text-ink/60")}>
              Clear
            </DropdownMenu.Item>
          )}
          {repos?.map((r) => (
            <DropdownMenu.CheckboxItem
              key={r}
              checked={selected.includes(r)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(c) => onChange(c ? [...selected, r] : selected.filter((x) => x !== r))}
              className={cn(itemCls, "code")}
            >
              <span className="flex size-3.5 items-center justify-center rounded-sm border border-line-strong">
                <DropdownMenu.ItemIndicator>
                  <span className="block size-2 rounded-[1px] bg-accent" />
                </DropdownMenu.ItemIndicator>
              </span>
              {r}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
