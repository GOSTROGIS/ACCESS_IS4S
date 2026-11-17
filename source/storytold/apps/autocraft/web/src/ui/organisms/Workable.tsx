// Workable: the one way to show a PR or an issue in a list. A table whose rows are items: the item's id and the issues it closes (both open
// GitHub), its title (opens the item page) with a line below it, then the page's own columns. Rows sit in groups with a header (title,
// count, hint and a control). On a phone the header hides and a row's cells wrap under the title. Between the phone and 1800px the
// table is compact, so it fits beside an open rail at 1024px: wide columns are left out, the closed issues sit under the id, the gaps
// are smaller and columns may take a narrower `mdWidth`.
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ItemKind, ItemState } from "../../api/types";
import { ItemIcon } from "../atoms/ItemIcon";
import { githubItemUrl, itemPath } from "../../lib/links";
import { num } from "../../lib/format";
import { cn } from "../cn";

export interface WorkableColumn {
  id: string;
  label: ReactNode;
  /** A CSS grid track in px, e.g. `120px`. */
  width: string;
  /** The track in the compact layout (between the phone and 1800px); `width` when absent. */
  mdWidth?: string;
  /** Header tooltip. */
  hint?: string;
  align?: "start" | "end";
  /** Shown only on wide screens (1800px and up) and on a phone, where cells wrap; left out in between so the title keeps its room. */
  wide?: boolean;
}

export interface WorkableItem {
  repo: string;
  number: number;
  kind?: ItemKind | null;
  state?: ItemState | null;
  draft?: boolean;
  title: string | null | undefined;
  /** Issues in the same repo this PR closes when it merges. */
  closes?: number[];
}

interface Shape {
  columns: WorkableColumn[];
  closes: boolean;
}
const Shape = createContext<Shape>({ columns: [], closes: false });

const ID_W = 104;
const CLOSES_W = 96;
const PAD = 32;
/** Full layout (1800px and up): the Closes column, every column at `width`. The title never gets narrower than `title`; below the
 * table's width the table scrolls sideways. */
const FULL = { title: 260, gap: 16 };
/** Compact layout: no Closes column (the issues sit under the id), no wide columns, `mdWidth` tracks. */
const COMPACT = { title: 180, gap: 12 };

const trackOf = (c: WorkableColumn, compact: boolean) => (compact ? c.mdWidth ?? c.width : c.width);
const template = (cols: WorkableColumn[], closes: boolean, compact: boolean) =>
  [`${ID_W}px`, ...(closes ? [`${CLOSES_W}px`] : []), `minmax(${(compact ? COMPACT : FULL).title}px,1fr)`, ...cols.map((c) => trackOf(c, compact))].join(" ");
/** The width the columns need: the lead columns, every page column, the gaps between them and the row padding. */
const minWidth = (cols: WorkableColumn[], closes: boolean, compact: boolean) => {
  const { title, gap } = compact ? COMPACT : FULL;
  return PAD + ID_W + gap + (closes ? CLOSES_W + gap : 0) + title + cols.reduce((s, c) => s + (parseFloat(trackOf(c, compact)) || 0) + gap, 0);
};
const narrow = (cols: WorkableColumn[]) => cols.filter((c) => !c.wide);
const grid = "md:grid md:grid-cols-[var(--wk-cols-md)] min-[1800px]:grid-cols-[var(--wk-cols)] md:gap-x-3 min-[1800px]:gap-x-4";
/** Shown in the compact layout only, or everywhere but there. */
const compactOnly = "hidden md:max-[1799px]:flex";
const notCompact = "md:max-[1799px]:hidden";

/** `closes` adds the Closes column after the id. */
export function WorkableTable({ columns, label, closes = false, titleLabel = "Title", children, className }: {
  columns: WorkableColumn[];
  label: string;
  closes?: boolean;
  titleLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  const vars = {
    "--wk-cols": template(columns, closes, false),
    "--wk-cols-md": template(narrow(columns), false, true),
    "--wk-min": `${minWidth(columns, closes, false)}px`,
    "--wk-min-md": `${minWidth(narrow(columns), false, true)}px`,
  } as CSSProperties;
  return (
    <Shape.Provider value={{ columns, closes }}>
      <div className={cn("overflow-x-auto rounded-md border border-line", className)}>
        <div role="table" aria-label={label} style={vars} className="text-sm md:min-w-[var(--wk-min-md)] min-[1800px]:min-w-[var(--wk-min)]">
          <div role="row" className={cn(grid, "border-b border-line bg-ink/[0.03] px-4 py-1.5 text-xs font-medium text-ink/55 max-md:hidden")}>
            <span role="columnheader">ID</span>
            {closes && (
              <span role="columnheader" title="Issues it closes when it merges" className={notCompact}>
                Closes
              </span>
            )}
            <span role="columnheader">{titleLabel}</span>
            {columns.map((c) => (
              <span key={c.id} role="columnheader" title={c.hint} className={cn(c.align === "end" && "text-right", c.wide && "max-[1799px]:hidden")}>
                {c.label}
              </span>
            ))}
          </div>
          {children}
        </div>
      </div>
    </Shape.Provider>
  );
}

/** A group of rows under a header bar. */
export function WorkableGroup({ title, count, hint, dot, aside, children, id }: { title: ReactNode; count?: number; hint?: ReactNode; dot?: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div role="rowgroup" id={id} className="border-b border-line last:border-0">
      <div role="row" className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line bg-ink/[0.04] px-4 py-1.5">
        <span role="rowheader" className="inline-flex items-center gap-2 text-sm font-semibold">
          {dot && <span className={cn("size-2 rounded-full", dot)} aria-hidden />}
          {title}
        </span>
        {count !== undefined && <span className="num rounded-full bg-ink/[0.07] px-1.5 text-2xs text-ink/70">{num(count)}</span>}
        {hint && <span className="text-xs text-ink/50">{hint}</span>}
        {aside && <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** `#123` that opens the item on GitHub. */
function GithubId({ repo, number, kind }: { repo: string; number: number; kind: ItemKind | null | undefined }) {
  return (
    <a href={githubItemUrl(repo, number, kind)} target="_blank" rel="noopener noreferrer" title={`Open ${repo}#${number} on GitHub`} className="code relative z-10 text-accent-ink hover:underline">
      #{number}
    </a>
  );
}

/**
 * One item. `mark` sits before the title (a fast-track marker); `sub` is a line under the title; `cells` fill the table's columns by id.
 * The title link covers the row, so controls in cells need `relative z-10`.
 */
export function WorkableRow({ item, mark, sub, cells, highlight, dataItem }: {
  item: WorkableItem;
  mark?: ReactNode;
  sub?: ReactNode;
  cells: Record<string, ReactNode>;
  highlight?: boolean;
  dataItem?: string;
}) {
  const { columns, closes } = useContext(Shape);
  return (
    <div role="row" data-item={dataItem} className={cn("relative border-b border-line px-4 py-2 last:border-0 hover:bg-ink/[0.03]", highlight && "bg-accent/10")}>
      <div className={cn(grid, "items-start max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-2.5 max-md:gap-y-1.5")}>
        <div role="cell" className="flex min-w-0 items-start gap-1.5">
          <ItemIcon kind={item.kind} state={item.state} draft={item.draft} />
          <span className="min-w-0">
            <GithubId repo={item.repo} number={item.number} kind={item.kind} />
            <span className="block truncate text-2xs text-ink/45 max-md:hidden" title={item.repo}>
              {item.repo}
            </span>
            {closes && !!item.closes?.length && (
              <span className={cn(compactOnly, "flex-wrap items-baseline gap-x-1.5")}>
                <span className="text-2xs text-ink/45">closes</span>
                {item.closes.map((n) => (
                  <GithubId key={n} repo={item.repo} number={n} kind="issue" />
                ))}
              </span>
            )}
          </span>
        </div>
        {closes && (
          <div role="cell" className={cn("flex min-w-0 flex-wrap items-start gap-x-1.5", notCompact, !item.closes?.length && "max-md:hidden")}>
            {item.closes?.length ? (
              <>
                <span className="text-2xs text-ink/45 md:hidden">closes</span>
                {item.closes.map((n) => (
                  <GithubId key={n} repo={item.repo} number={n} kind="issue" />
                ))}
              </>
            ) : (
              <span className="text-ink/30">–</span>
            )}
          </div>
        )}
        <div role="cell" className="min-w-0 max-md:order-first max-md:basis-full">
          <div className="flex items-start gap-1.5">
            {mark}
            <Link to={itemPath(item.repo, item.number)} className="min-w-0 break-words after:absolute after:inset-0 hover:underline [overflow-wrap:anywhere]">
              {item.title || `${item.repo}#${item.number}`}
            </Link>
          </div>
          {sub && <div className="mt-0.5 text-2xs text-ink/55">{sub}</div>}
        </div>
        {columns.map((c) => {
          const v = cells[c.id];
          return (
            <div key={c.id} role="cell" className={cn("min-w-0 md:pt-0.5", c.align === "end" && "md:flex md:justify-end", c.wide && "md:max-[1799px]:hidden", v == null && "max-md:hidden", c.align === "end" && "max-md:ml-auto")}>
              {v ?? <span className="text-ink/30">–</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
