import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "../../api/client";
import { Pending } from "../../ui/atoms/Pending";
import type { Agreement, ClassifierReport } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { cn } from "../../ui/cn";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { day, num } from "../../lib/format";
import { Block, RateBar, Select, Stat, Th, rate } from "../insight/parts";

const PAGE = 50;
const prob = (p: number | null) => (p === null ? "" : p.toFixed(2));

function AgreementRows({ rows, name, onPick, picked }: { rows: ({ key: string } & Agreement)[]; name: string; onPick?: (k: string) => void; picked?: string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <Th>{name}</Th>
          <Th right>Items</Th>
          <Th right>Agree</Th>
          <Th className="w-28" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={cn("border-t border-line", onPick && "cursor-pointer hover:bg-ink/[0.03]", picked === r.key && "bg-accent/10")} onClick={onPick && (() => onPick(r.key))}>
            <td className="px-3 py-1.5">{r.key}</td>
            <td className="num px-3 py-1.5 text-right">{num(r.n)}</td>
            <td className="num px-3 py-1.5 text-right">{rate(r.agree, r.n)}</td>
            <td className="px-3 py-1.5">{r.n > 0 && <RateBar frac={r.agree / r.n} />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Confusion({ r }: { r: ClassifierReport }) {
  const max = Math.max(1, ...r.confusion.flatMap((row, i) => row.filter((_, j) => j !== i)));
  return (
    <table className="num w-full text-sm">
      <thead>
        <tr>
          <Th>
            {r.a} ↓ / {r.b} →
          </Th>
          {r.labels.map((l) => (
            <Th key={l} right>
              {l}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {r.labels.map((l, i) => (
          <tr key={l} className="border-t border-line">
            <th className="whitespace-nowrap px-3 py-1.5 text-left font-medium">{l}</th>
            {r.confusion[i]!.map((n, j) => (
              <td
                key={j}
                className={cn("px-3 py-1.5 text-right", i === j && "font-semibold", n === 0 && "text-ink/30")}
                style={i !== j && n > 0 ? { backgroundColor: `color-mix(in srgb, var(--st-c2) ${Math.round(10 + 50 * (n / max))}%, transparent)` } : undefined}
              >
                {n === 0 ? "·" : num(n)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Disagreements({ r, label, band, setFilter }: { r: ClassifierReport; label: string; band: string; setFilter: (k: "label" | "band", v: string) => void }) {
  const [offset, setOffset] = useState(0);
  const key = `dis:${r.run}:${r.a}:${r.b}:${label}:${band}:${offset}`;
  const { data } = useQuery(key, (api) => api.classifiers.disagreements({ run: r.run, a: r.a, b: r.b, label: label || undefined, band: band || undefined, limit: PAGE, offset }));
  const total = data?.total ?? 0;
  return (
    <Block
      title="Disagreements"
      aside={data ? `${num(total)} item${total === 1 ? "" : "s"}` : undefined}
      flush
    >
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-line px-4 py-2">
        <Select label="Label" value={label} onChange={(v) => { setOffset(0); setFilter("label", v); }} options={[{ value: "", label: "any" }, ...r.labels.map((l) => ({ value: l, label: l }))]} />
        <Select label={`${r.a} confidence`} value={band} onChange={(v) => { setOffset(0); setFilter("band", v); }} options={[{ value: "", label: "any" }, ...r.bands.map((b) => ({ value: b.band, label: b.band }))]} />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <Th>Item</Th>
            <Th className="hidden sm:table-cell">{r.a}</Th>
            <Th className="hidden sm:table-cell">{r.b}</Th>
          </tr>
        </thead>
        <tbody>
          {data?.rows.map((d) => (
            <tr key={`${d.repo}#${d.number}`} className="relative border-t border-line align-top">
              <td className="px-3 py-1.5 sm:min-w-[16rem]">
                <ItemRef repo={d.repo} number={d.number} kind={d.kind} state={d.state} title={d.title} stretch />
                {/* Phones: the two answers under the title instead of in their own columns. */}
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 pl-6 text-xs sm:hidden">
                  <dt className="text-ink/50">{r.a}</dt>
                  <dd>
                    {d.a.label} <span className="num text-ink/50">{prob(d.a.prob)}</span>
                  </dd>
                  <dt className="text-ink/50">{r.b}</dt>
                  <dd>
                    {d.b.label} <span className="num text-ink/50">{prob(d.b.prob)}</span>
                  </dd>
                </dl>
              </td>
              <td className="hidden whitespace-nowrap px-3 py-1.5 sm:table-cell">
                {d.a.label} <span className="num text-xs text-ink/50">{prob(d.a.prob)}</span>
              </td>
              <td className="hidden whitespace-nowrap px-3 py-1.5 sm:table-cell">
                {d.b.label} <span className="num text-xs text-ink/50">{prob(d.b.prob)}</span>
              </td>
            </tr>
          ))}
          {data && data.rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-ink/55">
                No disagreements match.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {total > PAGE && (
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-xs text-ink/60">
          <button className="chip" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Previous
          </button>
          <span className="num">
            {offset + 1}–{Math.min(total, offset + PAGE)} of {num(total)}
          </span>
          <button className="chip" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
            Next
          </button>
        </div>
      )}
    </Block>
  );
}

export function Classifiers(_: ViewProps) {
  const [sp, setSp] = useSearchParams();
  const run = sp.get("run") ?? "", a = sp.get("a") ?? "", b = sp.get("b") ?? "";
  const label = sp.get("label") ?? "", band = sp.get("band") ?? "";
  const { data: r, error } = useQuery(`cls:${run}:${a}:${b}`, (api) => api.classifiers.report({ run, a, b }));
  const set = (patch: Record<string, string>) =>
    setSp((cur) => {
      const n = new URLSearchParams(cur);
      for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
      return n;
    }, { replace: true });
  if (!r) return <Pending error={error} />;
  if (!r.runs.length)
    return <div className="p-6 text-ink/60">No item has been judged by two classifiers in the same run yet.</div>;

  const cur = r.runs.find((x) => x.id === r.run)!;
  const hasBands = r.bands.length > 0;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-4 pb-12 pt-5 md:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-xl font-semibold">Classifiers</h1>
          <Select label="Run" value={r.run} onChange={(v) => set({ run: v, a: "", b: "", label: "", band: "" })} options={r.runs.map((x) => ({ value: x.id, label: `${x.id} · ${day(x.at)}` }))} />
          <Select
            label="Pair"
            value={`${r.a}|${r.b}`}
            onChange={(v) => { const [x, y] = v.split("|"); set({ run: r.run, a: x!, b: y!, label: "", band: "" }); }}
            options={cur.pairs.map((p) => ({ value: `${p.a}|${p.b}`, label: `${p.a} vs ${p.b} (${num(p.items)})` }))}
          />
        </div>
        {run && run !== r.run && (
          <p role="status" className="mt-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
            There is no run <span className="code">{run}</span>. Showing the latest run, <span className="code">{r.run}</span>.
          </p>
        )}
        <p className="mt-1 text-sm text-ink/55">Agreement on the type label, per run. Rows are grouped by {r.a}&apos;s answer.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Items judged by both" value={num(r.items)} />
          <Stat label="Agree on type label" value={rate(r.overall.agree, r.overall.n)} sub={`${num(r.overall.agree)} of ${num(r.overall.n)}`} />
          <Stat label="PRs" value={rate(r.byKind.pr.agree, r.byKind.pr.n)} sub={`${num(r.byKind.pr.n)} items`} />
          <Stat label="Issues" value={rate(r.byKind.issue.agree, r.byKind.issue.n)} sub={`${num(r.byKind.issue.n)} items`} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Block title={`By ${r.a}'s label`} aside="Click to filter disagreements" flush>
            <AgreementRows name="Label" rows={r.byLabel.map((x) => ({ key: x.label, n: x.n, agree: x.agree }))} picked={label} onPick={(k) => set({ label: label === k ? "" : k })} />
          </Block>
          <Block title="By repo" aside={`${num(r.byRepo.length)} repos with items judged by both`} flush>
            <div className="max-h-[22rem] overflow-y-auto">
              <AgreementRows name="Repo" rows={r.byRepo.map((x) => ({ key: x.repo, n: x.n, agree: x.agree }))} />
            </div>
          </Block>
        </div>

        {hasBands && (
          <Block title={`${r.a}'s confidence`} aside="Probability of its top label" className="mt-4" flush>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Band</Th>
                  <Th right>Items</Th>
                  <Th right>Agree with {r.b}</Th>
                  <Th className="w-28" />
                  <Th right>At or above: items</Th>
                  <Th right>At or above: agree</Th>
                </tr>
              </thead>
              <tbody>
                {r.bands.map((x) => (
                  <tr key={x.band} className={cn("cursor-pointer border-t border-line hover:bg-ink/[0.03]", band === x.band && "bg-accent/10")} onClick={() => set({ band: band === x.band ? "" : x.band })}>
                    <td className="px-3 py-1.5">{x.band}</td>
                    <td className="num px-3 py-1.5 text-right">{num(x.n)}</td>
                    <td className="num px-3 py-1.5 text-right">{rate(x.agree, x.n)}</td>
                    <td className="px-3 py-1.5">{x.n > 0 && <RateBar frac={x.agree / x.n} />}</td>
                    <td className="num px-3 py-1.5 text-right text-ink/70">{num(x.cumN)}</td>
                    <td className="num px-3 py-1.5 text-right text-ink/70">{rate(x.cumAgree, x.cumN)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>
        )}

        <Block title="Confusion" aside={`rows: ${r.a}, columns: ${r.b}`} className="mt-4" flush>
          <Confusion r={r} />
        </Block>

        <Block title="Flags" aside="Agreement on each flag being set or not" className="mt-4" flush>
          <table className="num w-full text-sm">
            <thead>
              <tr>
                <Th>Flag</Th>
                <Th right>Agree</Th>
                <Th right>Both set</Th>
                <Th right>Only {r.a}</Th>
                <Th right>Only {r.b}</Th>
              </tr>
            </thead>
            <tbody>
              {r.flags.map((f) => (
                <tr key={f.flag} className="border-t border-line">
                  <td className="px-3 py-1.5">{f.flag}</td>
                  <td className="px-3 py-1.5 text-right">{rate(f.agree, f.n)}</td>
                  <td className="px-3 py-1.5 text-right">{num(f.both)}</td>
                  <td className="px-3 py-1.5 text-right">{num(f.onlyA)}</td>
                  <td className="px-3 py-1.5 text-right">{num(f.onlyB)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>

        <div className="mt-4">
          <Disagreements r={r} label={label} band={band} setFilter={(k, v) => set({ [k]: v })} />
        </div>
      </div>
    </div>
  );
}

