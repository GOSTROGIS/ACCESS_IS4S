// Nightly checks per repo: the last 14 nights of each check, benchmark trends, and (operators) which checks run.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi, useQuery } from "../../api/client";
import type { NightlyBench, NightlyCell, NightlyCheckRow, NightlyGrid, NightlyRepo, NightlyState } from "../../api/types";
import { Badge } from "../../ui/atoms/Badge";
import { Switch } from "../../ui/atoms/Switch";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { cn } from "../../ui/cn";
import { useUser } from "../../shell/UserContext";
import { Block, ErrorLine, Page, TextInput, useWrite } from "../admin/parts";
import { Sparkline } from "./Sparkline";

const STATE_LABEL: Record<NightlyState, string> = { queued: "Queued", pass: "Passed", fail: "Failed", error: "Error", skipped: "Skipped", warn: "Warning" };
const DOT: Record<NightlyState, string> = {
  pass: "bg-ok", fail: "bg-bad", error: "bg-bad/50 ring-1 ring-bad", warn: "bg-warn", skipped: "border border-line-strong", queued: "border border-accent",
};

function Dot({ cell, night, check }: { cell: NightlyCell | null; night: string; check: string }) {
  const cls = "inline-block size-5 shrink-0 rounded-full";
  if (!cell) return <span className={cn(cls, "border border-dashed border-line")} aria-hidden />;
  const title = `${check}, ${night}: ${STATE_LABEL[cell.state]}${cell.summary ? `. ${cell.summary}` : ""}`;
  const dot = <span className={cn(cls, DOT[cell.state])} />;
  return cell.taskId === null
    ? <span title={title} role="img" aria-label={title} className="inline-flex">{dot}</span>
    : <Link to={`/envs/${cell.taskId}`} title={title} aria-label={title} className="inline-flex rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-ink">{dot}</Link>;
}

const csv = (xs: string[]) => xs.join(", ");
const parse = (s: string) => s.split(/[\s,]+/).filter(Boolean);

/** Operator inputs for the crates (or fuzz targets) of a check. Saved on blur so a toggle keeps them. */
function Names({ repo, check, busy, onSave }: { repo: string; check: NightlyCheckRow; busy: boolean; onSave: (names: string[]) => void }) {
  const stored = csv(check.takes === "targets" ? check.targets : check.crates);
  const [draft, setDraft] = useState<string | null>(null);
  const noun = check.takes === "targets" ? "fuzz targets" : "crates";
  return (
    <TextInput
      aria-label={`${check.label} ${noun} of ${repo}`}
      placeholder={check.takes === "targets" ? "fuzz targets" : check.id === "miri" ? "crates with unsafe code" : "crates (empty: whole workspace)"}
      value={draft ?? stored}
      disabled={busy}
      size="sm"
      className="w-full md:w-72"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== null && draft !== stored) onSave(parse(draft)); setDraft(null); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

function CheckRow({ repo, check, nights, operator, write, onSelect }: {
  repo: NightlyRepo; check: NightlyCheckRow; nights: NightlyRepo["nights"]; operator: boolean;
  write: ReturnType<typeof useWrite>; onSelect: (c: NightlyCheckRow, enabled: boolean, names?: string[]) => void;
}) {
  const busy = write.busy === `${repo.repo}:${check.id}`;
  const names = check.takes === "targets" ? check.targets : check.crates;
  return (
    <li className="py-2">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 md:grid-cols-[1fr_auto_auto]">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("text-sm", !check.enabled && "text-ink/55")}>{check.label}</span>
          {check.experimental && <Badge>Experimental</Badge>}
          {!operator && check.takes && names.length > 0 && <span className="code truncate text-xs text-ink/50">{csv(names)}</span>}
        </div>
        {operator && <Switch on={check.enabled} label={`${check.label} on ${repo.repo}`} busy={busy} onChange={(on) => onSelect(check, on)} className="md:col-start-3 md:row-start-1" />}
        <div className="col-span-2 flex gap-1 md:col-span-1 md:col-start-2 md:row-start-1" role="list" aria-label={`${check.label} on the last nights`}>
          {nights.map((n, i) => (
            <span role="listitem" key={n.runId}><Dot cell={check.cells[i] ?? null} night={new Date(n.startedAt).toISOString().slice(0, 10)} check={check.label} /></span>
          ))}
        </div>
      </div>
      {operator && check.takes && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink/55">
          <Names repo={repo.repo} check={check} busy={busy} onSave={(n) => onSelect(check, check.enabled, n)} />
        </div>
      )}
    </li>
  );
}

function Delta({ b }: { b: NightlyBench }) {
  if (b.deltaPct === null) return <span className="text-ink/45">–</span>;
  const slow = b.deltaPct >= 10;
  return <span className={cn("num text-sm", slow ? "text-warn" : "text-ink/70")}>{b.deltaPct > 0 ? "+" : ""}{b.deltaPct}%</span>;
}

function Benches({ benches }: { benches: NightlyBench[] }) {
  return (
    <div className="mt-3 border-t border-line pt-3">
      <h3 className="mb-1 text-xs font-medium text-ink/55">Benchmarks</h3>
      <ul className="divide-y divide-line">
        {benches.map((b) => (
          <li key={b.name} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <span className="code min-w-0 flex-1 basis-40 break-all text-sm">{b.name}</span>
            <Sparkline points={b.points} rising={b.deltaPct !== null && b.deltaPct >= 10} label={`${b.name} over the last nights`} />
            <span className="num w-28 text-right text-sm text-ink/80">{b.latest.toLocaleString("en-US")} {b.unit}</span>
            <span className="w-14 text-right"><Delta b={b} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RepoBlock({ repo, operator, write, onSelect }: { repo: NightlyRepo; operator: boolean; write: ReturnType<typeof useWrite>; onSelect: (repo: string, c: NightlyCheckRow, enabled: boolean, names?: string[]) => void }) {
  const last = repo.nights[0];
  return (
    <Block title={repo.repo} aside={<div className="flex items-center gap-2">{!repo.on && <Badge>Off</Badge>}{last && <span>Last run <TimeAgo iso={last.startedAt} /></span>}</div>}>
      {repo.nights.length === 0 && <p className="mb-1 text-sm text-ink/55">No nights recorded.</p>}
      <ul className="divide-y divide-line">
        {repo.checks.filter((c) => operator || c.enabled || c.cells.some(Boolean)).map((c) => (
          <CheckRow key={c.id} repo={repo} check={c} nights={repo.nights} operator={operator} write={write} onSelect={(ch, on, n) => onSelect(repo.repo, ch, on, n)} />
        ))}
      </ul>
      {repo.benches.length > 0 && <Benches benches={repo.benches} />}
    </Block>
  );
}

export function NightlyView() {
  const api = useApi();
  const q = useQuery<NightlyGrid>("nightly", (a) => a.nightly.grid());
  const operator = useUser().role === "operator";
  const write = useWrite();
  const select = (repo: string, c: NightlyCheckRow, enabled: boolean, names?: string[]) =>
    void write.run(`${repo}:${c.id}`, () => api.nightly.select({ repo, check: c.id, enabled, ...(names ? (c.takes === "targets" ? { targets: names } : { crates: names }) : {}) })).then(() => q.refetch());
  const repos = q.data?.repos ?? [];
  return (
    <Page title="Nightly">
      <ErrorLine error={q.error?.message ?? write.error} />
      <div className="grid gap-4">
        {repos.map((r) => <RepoBlock key={r.repo} repo={r} operator={operator} write={write} onSelect={select} />)}
        {q.data && repos.length === 0 && <p className="text-sm text-ink/55">No repo has nightly checks on.</p>}
      </div>
    </Page>
  );
}
