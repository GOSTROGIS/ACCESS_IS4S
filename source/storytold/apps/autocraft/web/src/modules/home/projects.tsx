// Projects: the start page. One tile per tracked repo, plus "All projects"; a tile picks that project and opens its home.
import { ALL, isFirstPage, leftFirstPage, setScope, useScope } from "../../api/scope";
import { projectPath } from "../../shell/ScopePicker";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MagnifyingGlassIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { useQuery } from "../../api/client";
import type { Funnel, Done, RepoProgress } from "../../api/types";
import { Pending } from "../../ui/atoms/Pending";
import { cn } from "../../ui/cn";
import { num } from "../../lib/format";
import type { ViewProps } from "../../registry/types";

type Tile = { to: string; name: string; pick: string | null; funnel: Funnel | null; done: Done | null; decisions: number | null; trend: number[] };

/** Open items at the end of each day since tracking began, as a small line. */
function Trend({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-8" />;
  const max = Math.max(...values, 1);
  const w = 100, h = 28;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full text-c1" role="img" aria-label="Open items per day since tracking began">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Fact({ label, value, tone }: { label: string; value: number | null; tone?: string }) {
  return (
    <div className="min-w-0">
      <dd className={cn("num text-lg font-semibold leading-6", tone)}>{value === null ? "–" : num(value)}</dd>
      <dt className="text-2xs leading-tight text-ink/55">{label}</dt>
    </div>
  );
}

function ProjectTile({ t, all }: { t: Tile; all?: boolean }) {
  return (
    <li className={cn("relative flex flex-col rounded-md border bg-panel p-4 hover:bg-ink/[0.03]", all ? "border-accent-ink/40" : "border-line")}>
      <div className="flex items-center gap-2">
        {all && <SquaresFourIcon className="shrink-0 text-accent-ink" />}
        <Link to={t.to} onClick={() => setScope(t.pick)} className={cn("min-w-0 truncate font-semibold after:absolute after:inset-0", !all && "code")}>
          {t.name}
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Fact label="Open" value={t.funnel?.open ?? null} />
        <Fact label="Decisions" value={t.decisions} tone={t.decisions ? "text-warn" : undefined} />
        <Fact label="Merged by AutoCraft" value={t.done?.mergedByPipeline ?? null} tone="text-merged" />
      </dl>
      <div className="mt-3">
        <Trend values={t.trend} />
      </div>
    </li>
  );
}

export function ProjectsView(_: ViewProps) {
  const progress = useQuery("progress", (api) => api.progress());
  const repos = useQuery("repos", (api) => api.repos());
  const counts = useQuery("count:by-repo", (api) => api.decisions.openCounts());
  const [q, setQ] = useState("");
  const scope = useScope();
  // Only the page the app loads with opens the picked project; the logo and the Projects link come back to the tiles.
  const [opening] = useState(() => (isFirstPage() ? scope : null));
  useEffect(leftFirstPage, []);
  const tiles = useMemo(() => {
    const by = new Map<string, RepoProgress>((progress.data?.repos ?? []).map((r) => [r.repo, r]));
    const names = [...new Set([...(repos.data ?? []), ...by.keys()])].sort((a, b) => a.localeCompare(b));
    return names.map((name): Tile => {
      const r = by.get(name);
      return { to: projectPath(name), name, pick: name, funnel: r?.funnel ?? null, done: r?.done ?? null, decisions: counts.data ? (counts.data.byRepo[name] ?? 0) : null, trend: r?.openTrend ?? [] };
    });
  }, [progress.data, repos.data, counts.data]);
  if (opening) return <Navigate to={projectPath(opening)} replace />;
  if (!progress.data || !repos.data) return <Pending error={progress.error ?? repos.error} />;
  const p = progress.data;
  // Sum the repos' trends day by day for the "All projects" tile.
  const days = Math.max(0, ...p.repos.map((r) => r.openTrend.length));
  const allTrend = Array.from({ length: days }, (_, i) => p.repos.reduce((s, r) => s + (r.openTrend[r.openTrend.length - days + i] ?? 0), 0));
  const all: Tile = { to: projectPath(ALL), name: "All projects", pick: null, funnel: p.funnel, done: p.done, decisions: counts.data?.total ?? null, trend: allTrend };
  const s = q.trim().toLowerCase();
  const shown = s ? tiles.filter((t) => t.name.toLowerCase().includes(s)) : tiles;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-4 pb-12 pt-5 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <h1 className="text-xl font-semibold">Projects</h1>
            <p className="text-sm text-ink/55">Pick the repo to work on, or all of them.</p>
          </div>
          {tiles.length > 8 && (
            <label className="flex h-8 items-center gap-2 rounded border border-line bg-sunken px-2.5 text-sm max-md:h-11">
              <MagnifyingGlassIcon className="shrink-0 text-ink/45" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter repos" aria-label="Filter repos" className="w-40 bg-transparent outline-none placeholder:text-ink/40" />
            </label>
          )}
        </div>
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {!s && <ProjectTile t={all} all />}
          {shown.map((t) => (
            <ProjectTile key={t.name} t={t} />
          ))}
        </ul>
        {s && shown.length === 0 && <p className="mt-4 text-sm text-ink/55">No repo matches “{q}”.</p>}
      </div>
    </div>
  );
}
