// Open items the liveness check flags: stuck (nothing is due and nobody is asked) and long (unchanged for days).
import { useQuery } from "../../api/client";
import type { StuckItem } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { Chip } from "../../ui/atoms/Chip";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { Block, ErrorLine, Page, useUrlState } from "../admin/parts";

const CAUSE: Record<string, string> = {
  "person-wait-without-question": "A person is awaited, nobody is asked",
  "no-plan": "Nothing due and no wait",
  "internal-wait": "Waits on a step with no work due",
  "duplicate-without-question": "Held as a duplicate, no open question",
  contributor: "Waiting for the contributor",
  external: "Waiting for CI, GitHub or a sync",
  planned: "Work is due",
};
const causeText = (c: string) => CAUSE[c] ?? c;
const VERDICT: Record<StuckItem["verdict"], string> = { stuck: "Stuck", long: "Long" };

const Ref = ({ i }: { i: StuckItem }) => <ItemRef repo={i.repo} number={i.number} kind={i.kind} title={i.title ?? undefined} size="sm" />;
const Verdict = ({ v }: { v: StuckItem["verdict"] }) => <span className={v === "stuck" ? "font-medium text-bad" : "font-medium text-warn"}>{VERDICT[v]}</span>;

function Table({ rows }: { rows: StuckItem[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[84px]" />
          <col />
          <col className="w-[16%]" />
          <col className="w-[20%]" />
          <col className="w-[22%]" />
          <col className="w-[90px]" />
        </colgroup>
        <thead className="bg-ink/[0.03] text-xs text-ink/55">
          <tr className="border-b border-line text-left">
            <th className="h-8 px-3 font-medium">Check</th>
            <th className="px-3 font-medium">Item</th>
            <th className="px-3 font-medium">State</th>
            <th className="px-3 font-medium">Waiting for</th>
            <th className="px-3 font-medium">Cause</th>
            <th className="whitespace-nowrap px-3 font-medium">Since</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={`${i.repo}#${i.number}`} className="border-b border-line align-top last:border-0 hover:bg-ink/[0.03]">
              <td className="px-3 py-2"><Verdict v={i.verdict} /></td>
              <td className="px-3 py-2 [overflow-wrap:anywhere]"><Ref i={i} /></td>
              <td className="px-3 py-2 text-xs text-ink/70">{i.state}</td>
              <td className="px-3 py-2 text-xs text-ink/70 [overflow-wrap:anywhere]">{i.wait ?? "–"}</td>
              <td className="px-3 py-2 text-xs text-ink/70">{causeText(i.cause)}</td>
              <td className="num px-3 py-2 text-xs text-ink/60"><TimeAgo iso={i.since} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ rows }: { rows: StuckItem[] }) {
  return (
    <ul className="md:hidden">
      {rows.map((i) => (
        <li key={`${i.repo}#${i.number}`} className="space-y-1 border-b border-line px-3 py-2.5 text-sm last:border-0">
          <div className="flex items-center gap-2 text-xs">
            <Verdict v={i.verdict} />
            <span className="text-ink/60">{i.state}</span>
            <span className="num ml-auto text-ink/55"><TimeAgo iso={i.since} /></span>
          </div>
          <Ref i={i} />
          <div className="text-xs text-ink/70">{causeText(i.cause)}{i.wait ? `: ${i.wait}` : ""}</div>
        </li>
      ))}
    </ul>
  );
}

export function StuckView(_: ViewProps) {
  const { state, update } = useUrlState();
  const { data, error } = useQuery("stuck", (api) => api.stuckItems());
  const verdict = state.verdict === "stuck" || state.verdict === "long" ? state.verdict : null;
  const all = data?.items ?? [];
  const rows = verdict ? all.filter((i) => i.verdict === verdict) : all;
  return (
    <Page title="Stuck items">
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Chip active={!verdict} count={all.length} onClick={() => update({ verdict: null })}>All</Chip>
        <Chip active={verdict === "stuck"} count={data?.stuck ?? 0} onClick={() => update({ verdict: verdict === "stuck" ? null : "stuck" })}>Stuck</Chip>
        <Chip active={verdict === "long"} count={data?.long ?? 0} onClick={() => update({ verdict: verdict === "long" ? null : "long" })}>Long</Chip>
      </div>
      <Block className="mt-3" flush title="Open items that need a look">
        <ErrorLine error={error?.message} className="p-4" />
        {data && rows.length === 0 && <p className="px-4 py-6 text-sm text-ink/50">Every open item is moving or waiting on someone.</p>}
        {rows.length > 0 && (
          <>
            <Table rows={rows} />
            <Cards rows={rows} />
          </>
        )}
      </Block>
    </Page>
  );
}
