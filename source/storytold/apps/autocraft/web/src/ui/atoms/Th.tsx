import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon, CaretUpDownIcon } from "@phosphor-icons/react";
import { cn } from "../cn";

/** Table header cell. With `k` and `onSort` it is a sort button; `sort` names the column currently sorted. */
export function Th<K extends string>({
  k,
  sort,
  onSort,
  children,
  right,
  className,
}: {
  k?: K;
  sort?: { k: K; desc: boolean };
  onSort?: (k: K) => void;
  children?: ReactNode;
  right?: boolean;
  className?: string;
}) {
  const active = k !== undefined && sort?.k === k;
  return (
    <th className={cn("h-8 whitespace-nowrap px-3 font-medium", right ? "text-right" : "text-left", className)} aria-sort={active ? (sort!.desc ? "descending" : "ascending") : undefined}>
      {k !== undefined && onSort ? (
        <button onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1", active ? "text-ink" : "text-ink/55 hover:text-ink")}>
          {children}
          {active ? sort!.desc ? <ArrowDownIcon className="text-[11px]" /> : <ArrowUpIcon className="text-[11px]" /> : <CaretUpDownIcon className="text-[11px] opacity-50" />}
        </button>
      ) : (
        <span className="text-ink/55">{children}</span>
      )}
    </th>
  );
}
