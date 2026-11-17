import { useState } from "react";
import { Link } from "react-router-dom";
import { ListMagnifyingGlassIcon, PlayIcon, ShieldWarningIcon, StopIcon } from "@phosphor-icons/react";
import { useApi, useQuery } from "../../api/client";
import type { FindingSummary, ScanView } from "../../api/types";
import { useWrite } from "../../lib/hooks";
import { findingPath, scanPath } from "../../lib/links";
import { SCAN_STATE, SEVERITY, FINDING_STATE, scanActive, sortFindings } from "../../lib/security";
import { formatCost } from "../../lib/trace";
import { useUser } from "../../shell/UserContext";
import { Badge } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { EmptyState } from "../../ui/atoms/EmptyState";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { Input } from "../../ui/atoms/Input";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { Block } from "../../ui/molecules/Block";
import { Dialog } from "../../ui/molecules/Dialog";
import { RateBar } from "../../ui/molecules/RateBar";
import { Segmented } from "../../ui/molecules/Segmented";

const usd = (v: number) => formatCost(v) ?? "$0.00";

/** The spend-cap form of starting and continuing a scan. */
function CapDialog({ title, submit, initial, above, open, onClose, send }: { title: string; submit: string; initial: number; above: number; open: boolean; onClose: () => void; send: (cap: number | null) => Promise<unknown> }) {
  const write = useWrite();
  const [mode, setMode] = useState<"amount" | "none">("amount");
  const [amount, setAmount] = useState(String(initial));
  const cap = mode === "none" ? null : Number(amount);
  const valid = cap === null || (Number.isFinite(cap) && cap > above);
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void write.run("start", () => send(cap)).then((ok) => ok && onClose());
        }}
      >
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" id="cap-label">Spend cap</span>
          <Segmented label="Spend cap" value={mode} onChange={setMode} options={[{ value: "amount", label: "Amount" }, { value: "none", label: "No cap" }]} />
          {mode === "amount" && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink/60">$</span>
              <Input aria-labelledby="cap-label" type="number" inputMode="decimal" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!valid} className="w-28" />
            </label>
          )}
        </div>
        <ErrorLine error={write.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose} className="max-md:h-11">Cancel</Button>
          <Button type="submit" variant="primary" loading={write.busy === "start"} disabled={!valid} className="max-md:h-11">{submit}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function StartDialog({ repo, open, onClose }: { repo: string; open: boolean; onClose: () => void }) {
  const api = useApi();
  return <CapDialog title="Deep scan" submit="Start scan" initial={20} above={0} open={open} onClose={onClose} send={(cap) => api.security.startScan(repo, cap)} />;
}

/** Continue a scan that stopped at its cap: prefilled with the estimate of the whole scan, rounded up. */
function ContinueDialog({ s, open, onClose }: { s: ScanView; open: boolean; onClose: () => void }) {
  const api = useApi();
  const initial = Math.ceil(Math.max(s.estimateUsd ?? 0, s.costUsd + 1));
  return <CapDialog title="Continue scan" submit="Continue scan" initial={initial} above={s.costUsd} open={open} onClose={onClose} send={(cap) => api.security.continueScan(s.id, cap)} />;
}

export function ScanRow({ s, link }: { s: ScanView; link?: boolean }) {
  const api = useApi();
  const write = useWrite();
  const operator = useUser().role === "operator";
  const [resume, setResume] = useState(false);
  const active = scanActive(s.state);
  const st = SCAN_STATE[s.state];
  const frac = s.areasTotal ? s.areasDone / s.areasTotal : 0;
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        {link && <Link to={scanPath(s.id)} className="num text-sm text-accent-ink hover:underline max-md:flex max-md:min-h-11 max-md:items-center">Scan {s.id}</Link>}
        <span className="num text-sm">{s.areasTotal ? `${s.areasDone} of ${s.areasTotal} areas` : "No areas yet"}</span>
        {s.areasTotal > 0 && <RateBar frac={frac} className="w-24 max-md:flex-1" />}
        {active && (
          <Button size="md" icon={StopIcon} loading={write.busy === "stop"} onClick={() => void write.run("stop", () => api.security.stopScan(s.id))} className="ml-auto max-md:h-11">
            Stop
          </Button>
        )}
        {operator && s.state === "capped" && (
          <>
            <Button size="md" icon={PlayIcon} onClick={() => setResume(true)} className="ml-auto max-md:h-11">Continue</Button>
            <ContinueDialog key={s.costUsd} s={s} open={resume} onClose={() => setResume(false)} />
          </>
        )}
      </div>
      <div className="num mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink/60">
        <span>{usd(s.costUsd)} spent</span>
        {s.findingCount > 0 && <span>{s.findingCount} {s.findingCount === 1 ? "finding" : "findings"}</span>}
        {s.estimateUsd !== null && <span>Estimate {usd(s.estimateUsd)}</span>}
        <span>{s.capUsd === null ? "No cap" : `Cap ${usd(s.capUsd)}`}</span>
        <span>
          {s.startedBy} · <TimeAgo iso={s.startedAt} />
        </span>
      </div>
      <ErrorLine error={write.error ?? s.error} className="mt-1" />
    </div>
  );
}

function FindingRow({ f }: { f: FindingSummary }) {
  const sev = SEVERITY[f.severity];
  const st = FINDING_STATE[f.state];
  return (
    <li className="border-b border-line last:border-0">
      <Link to={findingPath(f.repo, f.number)} className="flex min-h-11 items-start gap-3 px-4 py-2.5 hover:bg-ink/[0.03]">
        <Badge tone={sev.tone} className="mt-0.5 w-16 justify-center">{sev.label}</Badge>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm [overflow-wrap:anywhere]">{f.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/55">
            <span className="num">{f.area}</span>
            <Badge tone={st.tone}>{st.label}</Badge>
            {f.urgent && <Badge tone="bad">Urgent</Badge>}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Deep scan: the start button, the latest scan and the findings. Rendered for operators and maintainers only. */
export function SecuritySection({ repo }: { repo: string }) {
  const operator = useUser().role === "operator";
  const [open, setOpen] = useState(false);
  const { data, error } = useQuery(`security:${repo}`, (a) => a.security.overview(repo));
  const scan = data?.scans[0];
  const running = !!scan && scanActive(scan.state);
  return (
    <Block
      className="mt-4"
      flush
      title="Security"
      aside={(
        <div className="flex items-center gap-2">
          <Link to={`${scanPath()}?repo=${encodeURIComponent(repo)}`} className="inline-flex min-h-8 items-center gap-1 rounded text-sm text-accent-ink hover:underline max-md:min-h-11">
            <ListMagnifyingGlassIcon /> All scans
          </Link>
          {operator && (
            <Button icon={ShieldWarningIcon} disabled={running} onClick={() => setOpen(true)} className="max-md:h-11">
              Deep scan
            </Button>
          )}
        </div>
      )}
    >
      {operator && <StartDialog repo={repo} open={open} onClose={() => setOpen(false)} />}
      <ErrorLine error={error?.message} className="px-4 py-3" />
      {scan && <ScanRow s={scan} link />}
      {data && data.findings.length > 0 ? (
        <ul>{sortFindings(data.findings).map((f) => <FindingRow key={f.number} f={f} />)}</ul>
      ) : (
        data && <EmptyState icon={ShieldWarningIcon}>No findings</EmptyState>
      )}
    </Block>
  );
}
