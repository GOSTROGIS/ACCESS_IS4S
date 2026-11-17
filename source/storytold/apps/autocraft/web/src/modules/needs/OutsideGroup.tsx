import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useApi, useQuery } from "../../api/client";
import type { NeedsOutsideRow, NeedsStoppedRow } from "../../api/types";
import { Badge } from "../../ui/atoms/Badge";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { TextLink } from "../../ui/atoms/TextLink";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { ConfirmButton } from "../../ui/molecules/ConfirmButton";
import { itemPath } from "../../lib/links";
import { useWrite } from "../../lib/hooks";
import { useUser } from "../../shell/UserContext";

function HeldRow({ row, onDone }: { row: NeedsOutsideRow; onDone: () => void }) {
  const api = useApi();
  const write = useWrite();
  const operator = useUser().role === "operator";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-3 pl-8 pr-4">
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-2">
          <TextLink to={itemPath(row.repo, row.number)} className="text-sm font-medium">{`${row.repo}#${row.number} ${row.title}`}</TextLink>
          {row.reason === "surge" && <Badge tone="warn">Surge</Badge>}
          {row.createdAt && <TimeAgo iso={row.createdAt} className="text-xs text-ink/50" />}
        </div>
      </div>
      {operator && (
        <div className="flex flex-col items-end gap-1">
          <ConfirmButton idle="secondary" label="Release" confirmLabel="Confirm release" loading={write.busy === "release"} onConfirm={() => void write.run("release", async () => { await api.releaseOutside(row.repo, row.number); onDone(); })} />
          <ErrorLine error={write.error} />
        </div>
      )}
    </li>
  );
}

/** The items held for one outside author, with Release for one item and Release all for the author. */
export function OutsideGroup({ row, onDone }: { row: NeedsStoppedRow; onDone: () => void }) {
  const api = useApi();
  const write = useWrite();
  const operator = useUser().role === "operator";
  const [open, setOpen] = useState(false);
  const author = row.resume.type === "outside" ? row.resume.author : "";
  const list = useQuery(`needs:outside:${author}`, (a) => a.needsOutside(author), { enabled: open });
  if (row.resume.type !== "outside") return null;
  const Icon = open ? CaretDownIcon : CaretRightIcon;
  return (
    <li className="border-b border-line">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-4">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 basis-60 items-center gap-3 px-4 py-3 text-left">
          <Icon size={16} className="shrink-0 text-ink/60" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{row.title}</span>
              <Badge tone="warn">Held</Badge>
              {row.since && <TimeAgo iso={row.since} className="text-xs text-ink/50" />}
            </span>
            <span className="mt-0.5 block text-sm text-ink/70">{row.reason}</span>
          </span>
        </button>
        {operator && (
          <div className="flex flex-col items-end gap-1 max-md:pb-3 max-md:pl-11">
            <ConfirmButton idle="secondary" label="Release all" confirmLabel="Confirm release all" loading={write.busy === "release-all"} onConfirm={() => void write.run("release-all", async () => { await api.pipeline.releaseOutsideAuthor(author); onDone(); })} />
            <ErrorLine error={write.error} />
          </div>
        )}
      </div>
      {open && (
        <>
          <ErrorLine error={list.error?.message} className="px-4 py-2" />
          <ul>{(list.data?.rows ?? []).map((r) => <HeldRow key={r.id} row={r} onDone={() => { list.refetch(); onDone(); }} />)}</ul>
        </>
      )}
    </li>
  );
}
