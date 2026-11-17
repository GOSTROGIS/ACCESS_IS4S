// Recently merged, on the Merge queue page: the PRs AutoCraft merged lately (its merge step or a merged batch), newest first, as Workable rows.
import { Link } from "react-router-dom";
import { useQuery } from "../../api/client";
import type { ItemListRow } from "../../api/types";
import { Badge } from "../../ui/atoms/Badge";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { WorkableRow, WorkableTable, type WorkableColumn } from "../../ui/organisms/Workable";
import { num } from "../../lib/format";
import { ErrorLine } from "../admin/parts";

const LIMIT = 50;

const HOW: Record<NonNullable<ItemListRow["mergedHow"]>, [string, string]> = {
  rule: ["By rule", "Covered by the merge rule"],
  operator: ["On approval", "An operator answered merge"],
  batch: ["In a batch", "Landed with an integration batch"],
};

const COLUMNS: WorkableColumn[] = [
  { id: "how", label: "How", width: "120px", hint: "How AutoCraft merged it" },
  { id: "author", label: "Author", width: "140px" },
  { id: "merged", label: "Merged", width: "116px" },
];

export function RecentlyMerged({ repo }: { repo: string | null }) {
  const { data, error } = useQuery(`merged-by-us:${repo ?? ""}`, (a) => a.items({ state: "merged-by-us", sort: "merged", repo: repo ? [repo] : undefined, limit: LIMIT }));
  return (
    <>
      <ErrorLine error={error?.message} className="mt-3" />
      {data && (
        <p className="mt-4 text-sm text-ink/60">
          {data.total === 0 ? "AutoCraft has not merged a PR here yet." : <>The PRs AutoCraft merged, newest first{data.total > data.rows.length ? `: the last ${num(data.rows.length)} of ${num(data.total)}` : ""}.</>}
        </p>
      )}
      {data && data.rows.length > 0 && (
        <WorkableTable columns={COLUMNS} label="Recently merged" className="mt-4">
          {data.rows.map((r) => {
            const how = r.mergedHow ? HOW[r.mergedHow] : null;
            return (
              <WorkableRow
                key={`${r.repo}#${r.number}`}
                item={{ repo: r.repo, number: r.number, kind: r.kind, state: r.state, title: r.title }}
                cells={{
                  how: how ? (
                    <span title={how[1]}>
                      <Badge tone="merged">{how[0]}</Badge>
                    </span>
                  ) : undefined,
                  author: <span className="block truncate text-xs text-ink/70">{r.author || "unknown"}</span>,
                  merged: r.mergedAt ? <TimeAgo iso={r.mergedAt} className="num text-xs text-ink/50" /> : undefined,
                }}
              />
            );
          })}
        </WorkableTable>
      )}
      {data && data.total > data.rows.length && (
        <Link to="/items?state=merged-by-us" className="mt-3 inline-flex text-sm text-accent-ink hover:underline max-md:h-11 max-md:items-center">
          All {num(data.total)} in Items
        </Link>
      )}
    </>
  );
}
