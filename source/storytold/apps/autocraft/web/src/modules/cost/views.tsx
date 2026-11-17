import { useSearchParams } from "react-router-dom";
import { useQuery } from "../../api/client";
import { Pending } from "../../ui/atoms/Pending";
import type { CostReport, UsageTotals } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { day, num } from "../../lib/format";
import { cn } from "../../ui/cn";
import { Block, Select, Stat, Th } from "../insight/parts";

const tokens = (u: UsageTotals) => u.input + u.output + u.cacheRead + u.cacheWrite;
const usd = (v: number | null, digits = 2) => (v === null ? "–" : `$${v.toLocaleString("en", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`);
const per = (t: number, n: number) => (n ? num(Math.round(t / n)) : "–");
const perUsd = (v: number | null, n: number) => (v === null || !n ? "–" : usd(v / n, 4));
const wall = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);

type Row = { key: string; sub?: string; u: UsageTotals };

function UsageTable({ rows, name, subName }: { rows: Row[]; name: string; subName?: string }) {
  return (
    <table className="num w-full text-sm">
      <thead>
        <tr>
          <Th>{name}</Th>
          {subName && <Th>{subName}</Th>}
          <Th right>Calls</Th>
          <Th right>Items</Th>
          <Th right>Input</Th>
          <Th right>Output</Th>
          <Th right>Cache read</Th>
          <Th right>Cache write</Th>
          <Th right>USD</Th>
          <Th right>Tokens / item</Th>
          <Th right>USD / item</Th>
          <Th right>Wall time</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, sub, u }) => (
          <tr key={`${key}|${sub}`} className="border-t border-line">
            <td className="whitespace-nowrap px-3 py-1.5">{key || "–"}</td>
            {subName && <td className="whitespace-nowrap px-3 py-1.5">{sub || "–"}</td>}
            <td className="px-3 py-1.5 text-right">{num(u.calls)}</td>
            <td className="px-3 py-1.5 text-right">{num(u.items)}</td>
            <td className="px-3 py-1.5 text-right">{num(u.input)}</td>
            <td className="px-3 py-1.5 text-right">{num(u.output)}</td>
            <td className="px-3 py-1.5 text-right">{num(u.cacheRead)}</td>
            <td className="px-3 py-1.5 text-right">{num(u.cacheWrite)}</td>
            <td className={cn("px-3 py-1.5 text-right", u.usd === null && "whitespace-nowrap text-xs text-ink/45")}>{u.usd === null ? "price not reported" : usd(u.usd)}</td>
            <td className="px-3 py-1.5 text-right">{per(tokens(u), u.items)}</td>
            <td className="px-3 py-1.5 text-right">{perUsd(u.usd, u.items)}</td>
            <td className="px-3 py-1.5 text-right">{wall(u.wallSeconds)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Spend per hour or day as bars; USD when any run reported it, tokens otherwise. */
function SpendChart({ r }: { r: CostReport }) {
  const useUsd = r.series.some((s) => s.usd !== null);
  const vals = r.series.map((s) => (useUsd ? (s.usd ?? 0) : s.tokens));
  const max = Math.max(...vals, Number.MIN_VALUE);
  const fmt = (v: number) => (useUsd ? usd(v) : `${num(v)} tokens`);
  const label = (b: string) => (r.bucketSize === "hour" ? `${b.slice(5, 10)} ${b.slice(11)}:00` : b);
  if (!r.series.length) return <p className="text-sm text-ink/55">No timed runs.</p>;
  return (
    <div>
      <div className="flex h-32 items-end gap-[2px]" role="img" aria-label={`${useUsd ? "USD" : "Tokens"} per ${r.bucketSize}`}>
        {r.series.map((s, i) => (
          <div key={s.bucket} className="group relative flex h-full min-w-0 max-w-10 flex-1 items-end">
            <div className="w-full rounded-t-sm bg-c1" style={{ height: `${Math.max(2, (vals[i]! / max) * 100)}%` }} />
            <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded border border-line-strong bg-raised px-2 py-1 text-xs shadow-md group-hover:block">
              {label(s.bucket)} · {fmt(vals[i]!)}
            </div>
          </div>
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-xs text-ink/50">
        <span>{label(r.series[0]!.bucket)}</span>
        <span>
          {useUsd ? "USD" : "Tokens"} per {r.bucketSize}, peak {fmt(max)}
        </span>
        <span>{label(r.series[r.series.length - 1]!.bucket)}</span>
      </div>
    </div>
  );
}

type ModelTotals = { model: string; items: number; usd: number | null };

// Totals per model across stages. USD stays null for a model that never reported a price.
function byModel(r: CostReport): ModelTotals[] {
  const m = new Map<string, ModelTotals>();
  for (const s of r.stages) {
    const cur = m.get(s.model) ?? { model: s.model || "unknown model", items: 0, usd: null };
    cur.items += s.items;
    if (s.usd !== null) cur.usd = (cur.usd ?? 0) + s.usd;
    m.set(s.model, cur);
  }
  return [...m.values()].sort((a, b) => b.items - a.items);
}

// Spend per item counts only the items of models that report a price.
function SpendSub({ models }: { models: ModelTotals[] }) {
  const priced = models.filter((m) => m.usd !== null);
  const unpriced = models.filter((m) => m.usd === null);
  return (
    <>
      {priced.map((m) => (
        <div key={m.model}>
          {m.model}: {perUsd(m.usd, m.items)} per item
        </div>
      ))}
      {unpriced.length > 0 && <div>{unpriced.map((m) => m.model).join(", ")}: price not reported</div>}
    </>
  );
}

export function Cost(_: ViewProps) {
  const [sp, setSp] = useSearchParams();
  const run = sp.get("run") ?? "";
  const { data: r, error } = useQuery(`cost:${run}`, (api) => api.cost(run));
  if (!r) return <Pending error={error} />;
  const t = r.total;
  const models = byModel(r);
  // Each model's calls count the same item again, so the headline uses distinct classified items.
  const items = r.itemsClassified || Math.max(0, ...models.map((m) => m.items));
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-4 pb-12 pt-5 md:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-xl font-semibold">Cost</h1>
          <Select
            label="Run"
            value={r.run}
            onChange={(v) => setSp(v ? { run: v } : {}, { replace: true })}
            options={[{ value: "", label: "All runs" }, ...r.runs.map((x) => ({ value: x.id, label: `${x.id} · ${day(x.from)}` }))]}
          />
        </div>
        <p className="mt-1 text-sm text-ink/55">Token use per agent call. USD appears where the agent reported a cost.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Items" value={num(items)} sub={models.map((m) => `${m.model} ${num(m.items)}`).join(" · ")} />
          <Stat label="Tokens" value={num(tokens(t))} sub={`${num(t.calls)} calls · ${per(tokens(t), t.items)} per item and model`} />
          <Stat label="Spend" value={usd(t.usd)} sub={t.usd === null ? "price not reported" : <SpendSub models={models} />} />
          <Stat label="Wall time" value={wall(t.wallSeconds)} sub="first start to last end" />
        </div>

        {r.series.length >= 3 && (
          <Block title="Spend over time" className="mt-4">
            <SpendChart r={r} />
          </Block>
        )}
        <Block title="By stage and model" className="mt-4" flush>
          <UsageTable name="Stage" subName="Model" rows={r.stages.map((s) => ({ key: s.stage, sub: s.model, u: s }))} />
        </Block>
        <Block title="By repo" className="mt-4" flush>
          {r.repos.length ? <UsageTable name="Repo" rows={r.repos.map((x) => ({ key: x.repo, u: x }))} /> : <p className="p-4 text-sm text-ink/55">No call recorded a repo.</p>}
        </Block>
      </div>
    </div>
  );
}

