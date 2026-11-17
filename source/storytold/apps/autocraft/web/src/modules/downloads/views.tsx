import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "../../api/client";
import type { DownloadsBar, DownloadsRange, DownloadsReport } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { Badge } from "../../ui/atoms/Badge";
import { Pending } from "../../ui/atoms/Pending";
import { Select } from "../../ui/atoms/Select";
import { Th } from "../../ui/atoms/Th";
import { BarList, compact, type Bar } from "../../ui/molecules/BarList";
import { Block } from "../../ui/molecules/Block";
import { Segmented } from "../../ui/molecules/Segmented";
import { Stat } from "../../ui/molecules/Stat";
import { clock, when } from "../../lib/format";
import { cn } from "../../ui/cn";
import { useIsPhone } from "../../shell/useMedia";

const DAY_RANGES: { value: DownloadsRange; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
];
const HOUR_RANGES: { value: DownloadsRange; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "3h", label: "3h" },
  { value: "6h", label: "6h" },
  { value: "12h", label: "12h" },
];
const RANGE_NAME: Record<DownloadsRange, string> = {
  all: "All time", today: "Today", yesterday: "Yesterday", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "12m": "Last 12 months",
  "1h": "Last hour", "3h": "Last 3 hours", "6h": "Last 6 hours", "12h": "Last 12 hours",
};
const ALL = new Set<string>([...DAY_RANGES, ...HOUR_RANGES].map((r) => r.value));

const PLATFORM_TONE: Record<string, string> = { windows: "bg-c1", linux: "bg-c3", macos: "bg-c2", web: "bg-c4", freebsd: "bg-c5" };

/** Largest first, whatever order the server sent; "Other versions" stays last. */
const bars = (rows: DownloadsBar[], tones?: Record<string, string>): Bar[] =>
  rows
    .map((r) => ({ key: r.key, label: r.label, value: r.count, tone: tones?.[r.key.toLowerCase()] }))
    .sort((a, b) => (a.key === "other" ? 1 : b.key === "other" ? -1 : b.value - a.value));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 23, 07:15" in the viewer's time zone. */
const shortWhen = (iso: string) => `${MONTHS[new Date(iso).getMonth()]} ${new Date(iso).getDate()}, ${clock(iso)}`;

function Controls({ r, range, app, set }: { r: DownloadsReport | undefined; range: DownloadsRange; app: string; set: (p: { range?: DownloadsRange; app?: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Select aria-label="App" value={app} onChange={(e) => set({ app: e.target.value })}>
        <option value="all">All apps</option>
        {(r?.apps ?? []).map((a) => (
          <option key={a.repo} value={a.repo}>{a.name}</option>
        ))}
      </Select>
      <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented label="Range" value={range} options={DAY_RANGES} onChange={(v) => set({ range: v })} className="flex-wrap" />
        <Segmented label="Recent hours" value={range} options={HOUR_RANGES} onChange={(v) => set({ range: v })} className="flex-wrap" />
      </div>
    </div>
  );
}

function Tiles({ r }: { r: DownloadsReport }) {
  const t = r.totals;
  // Ranges that start before the first recorded poll only count from that poll.
  const since = r.from && r.historyFrom && Date.parse(r.historyFrom) > Date.parse(r.from);
  const sub = since ? `Since ${shortWhen(r.historyFrom!)}` : RANGE_NAME[r.range];
  const per = t.issuesPer1k === null ? "–" : t.issuesPer1k >= 10 ? t.issuesPer1k.toFixed(1) : t.issuesPer1k.toFixed(2);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat label="Downloads" value={compact(t.downloads)} sub={sub} />
      <Stat label="Issues per 1K downloads" value={per} sub={sub} />
      <Stat label="Issues opened" value={compact(t.issuesOpened)} sub={RANGE_NAME[r.range]} />
      <Stat label="Issues closed" value={compact(t.issuesClosed)} sub={RANGE_NAME[r.range]} />
      <Stat label="PRs merged" value={compact(t.prsMerged)} sub={RANGE_NAME[r.range]} />
      <Stat label="Stars" value={compact(t.stars)} sub={r.range === "all" ? "Total" : RANGE_NAME[r.range]} />
    </div>
  );
}

function ByApp({ r }: { r: DownloadsReport }) {
  const [tab, setTab] = useState<"downloads" | "stars">("downloads");
  const phone = useIsPhone();
  const rows = r.byApp
    .map((a) => ({ key: a.repo, label: a.name, value: tab === "downloads" ? a.downloads : a.stars }))
    .sort((a, b) => b.value - a.value);
  return (
    <Block
      title={tab === "downloads" ? "Downloads by app" : "Stars by app"}
      aside={
        <Segmented
          label="Measure"
          value={tab}
          onChange={setTab}
          options={[{ value: "downloads", label: "Downloads" }, { value: "stars", label: "Stars" }]}
        />
      }
    >
      {rows.length ? <BarList bars={rows} axis dense={phone} ariaLabel={`${tab} by app`} labelClass="w-32 max-md:w-24" valueClass="w-36 max-md:w-28" /> : <p className="text-sm text-ink/55">Nothing recorded yet.</p>}
    </Block>
  );
}

function BarCard({ title, rows, tones }: { title: string; rows: DownloadsBar[]; tones?: Record<string, string> }) {
  return (
    <Block title={title} className="h-full">
      {rows.length ? <BarList bars={bars(rows, tones)} ariaLabel={title} dense /> : <p className="text-sm text-ink/55">Nothing recorded yet.</p>}
    </Block>
  );
}

function Health({ r }: { r: DownloadsReport }) {
  return (
    <Block title="Release health" flush>
      <table className="num w-full min-w-[640px] text-sm">
        <thead>
          <tr>
            <Th>App</Th>
            <Th>Release</Th>
            <Th>Published</Th>
            <Th right>Downloads</Th>
            <Th right>Issues</Th>
            <Th right>Per 1K downloads</Th>
          </tr>
        </thead>
        <tbody>
          {r.releases.map((x) => (
            <tr key={`${x.repo}@${x.tag}`} className="border-t border-line">
              <td className="whitespace-nowrap px-3 py-1.5">{x.app}</td>
              <td className="whitespace-nowrap px-3 py-1.5">
                <span className="font-mono text-xs">{x.tag}</span>
                {x.latest && <Badge tone="ok" className="ml-2">Latest</Badge>}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5">{when(x.publishedAt)}</td>
              <td className="px-3 py-1.5 text-right">{x.downloads.toLocaleString("en")}</td>
              <td className="px-3 py-1.5 text-right">{x.issues.toLocaleString("en")}</td>
              <td className={cn("px-3 py-1.5 text-right", x.per1k === null && "text-ink/45")}>{x.per1k === null ? "–" : x.per1k.toFixed(2)}</td>
            </tr>
          ))}
          {!r.releases.length && (
            <tr className="border-t border-line"><td colSpan={6} className="px-3 py-3 text-ink/55">No releases recorded yet.</td></tr>
          )}
        </tbody>
      </table>
    </Block>
  );
}

export function Downloads(_: ViewProps) {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("range") ?? "all";
  const range = (ALL.has(raw) ? raw : "all") as DownloadsRange;
  const app = sp.get("app") ?? "all";
  const { data: r, error } = useQuery(`downloads:${range}:${app}`, (api) => api.downloads(range, app));
  const set = (p: { range?: DownloadsRange; app?: string }) => {
    const next = { range, app, ...p };
    setSp({ ...(next.range !== "all" && { range: next.range }), ...(next.app !== "all" && { app: next.app }) }, { replace: true });
  };
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] space-y-4 px-4 pb-12 pt-5 md:px-6">
        <div>
          <h1 className="text-xl font-semibold">Downloads</h1>
          <p className="mt-0.5 text-sm text-ink/55">Release downloads, issues, merged pull requests and stars across the tracked apps.</p>
        </div>
        <Controls r={r} range={range} app={app} set={set} />
        {!r ? (
          <Pending error={error} />
        ) : (
          <>
            <Tiles r={r} />
            <ByApp r={r} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <BarCard title="Platforms" rows={r.platforms} tones={PLATFORM_TONE} />
              <BarCard title="Processor" rows={r.processors} />
              <BarCard title="Formats" rows={r.formats} />
              <BarCard title="Versions" rows={r.versions} />
            </div>
            <Health r={r} />
          </>
        )}
      </div>
    </div>
  );
}
