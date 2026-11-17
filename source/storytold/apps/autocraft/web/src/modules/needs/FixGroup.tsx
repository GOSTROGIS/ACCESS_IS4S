import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useApi, usePagedQuery } from "../../api/client";
import type { NeedsFixRow, NeedsStoppedRow } from "../../api/types";
import { Badge } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { TextLink } from "../../ui/atoms/TextLink";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { ConfirmButton } from "../../ui/molecules/ConfirmButton";
import { itemPath } from "../../lib/links";
import { useWrite } from "../../lib/hooks";
import { useUser } from "../../shell/UserContext";

function FixRow({ row, onDone }: { row: NeedsFixRow; onDone: () => void }) {
  const api = useApi();
  const write = useWrite();
  const operator = useUser().role === "operator";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-3 pl-8 pr-4">
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-2">
          <TextLink to={itemPath(row.repo, row.number)} className="text-sm font-medium">{`#${row.number} ${row.title}`}</TextLink>
          {row.impact && <Badge>{row.impact}</Badge>}
          {row.since && <TimeAgo iso={row.since} className="text-xs text-ink/50" />}
        </div>
        <p className="mt-0.5 break-words text-sm text-ink/70">{row.reason}</p>
      </div>
      {operator && (
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap justify-end gap-2">
            <ConfirmButton idle="secondary" label="Fix again" confirmLabel="Confirm fix again" loading={write.busy === "fix"} onConfirm={() => void write.run("fix", async () => { await api.release(row.repo, row.number, "fix-again"); onDone(); })} />
            <ConfirmButton idle="secondary" label="Backlog" confirmLabel="Confirm backlog" loading={write.busy === "backlog"} onConfirm={() => void write.run("backlog", async () => { await api.stopFix(row.repo, row.number, "backlog"); onDone(); })} />
            <ConfirmButton idle="secondary" label="Close" confirmLabel="Confirm close" loading={write.busy === "close"} onConfirm={() => void write.run("close", async () => { await api.stopFix(row.repo, row.number, "close"); onDone(); })} />
          </div>
          <ErrorLine error={write.error} />
        </div>
      )}
    </li>
  );
}

function FixList({ repo }: { repo: string }) {
  const q = usePagedQuery(`needs:fixes:${repo}`, (api, cursor) => api.needsFixes(repo, cursor), (p) => p.nextCursor);
  const rows = q.pages?.flatMap((p) => p.rows) ?? [];
  return (
    <>
      <ErrorLine error={q.error?.message} className="px-4 py-2" />
      <ul>{rows.map((r) => <FixRow key={r.id} row={r} onDone={q.refetch} />)}</ul>
      {q.hasMore && (
        <div className="flex justify-center py-3">
          <Button size="sm" loading={q.loadingMore} onClick={q.loadMore}>Show more</Button>
        </div>
      )}
    </>
  );
}

/** One repo's issues with a stopped fix: collapsed to a count, expanding to a paged list. */
export function FixGroup({ row }: { row: NeedsStoppedRow }) {
  const [open, setOpen] = useState(false);
  if (row.resume.type !== "fixes") return null;
  const Icon = open ? CaretDownIcon : CaretRightIcon;
  return (
    <li className="border-b border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Icon size={16} className="shrink-0 text-ink/60" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{row.title}</span>
            <Badge tone="warn">Fix stopped</Badge>
          </span>
          <span className="mt-0.5 block text-sm text-ink/70">{row.reason}</span>
        </span>
      </button>
      {open && <FixList repo={row.resume.repo} />}
    </li>
  );
}
