// Deep scan pages: the list of scans, and one scan with its threat model, every model call (prompt, output) and findings.
import { useState } from "react";
import { Link } from "react-router-dom";
import { CaretDownIcon, CaretRightIcon, ShieldWarningIcon } from "@phosphor-icons/react";
import { useQuery } from "../../api/client";
import type { ScanArea, ScanCall, ScanDetail, ScanView } from "../../api/types";
import { nowMs, span } from "../../lib/format";
import { findingPath, scanPath } from "../../lib/links";
import { FINDING_STATE, SEVERITY, SCAN_STATE, SCAN_TEST, scanActive, sortFindings } from "../../lib/security";
import { formatCost } from "../../lib/trace";
import { useNow } from "../../lib/useNow";
import type { ViewProps } from "../../registry/types";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { EmptyState } from "../../ui/atoms/EmptyState";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { cn } from "../../ui/cn";
import { Block } from "../../ui/molecules/Block";
import { RateBar } from "../../ui/molecules/RateBar";
import { ScanRow } from "../admin/securityParts";
import { selectCls, useUrlState } from "../admin/parts";
import { SecurityPage } from "./SecurityPage";

const Page = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <SecurityPage tab="scans" heading={title === "Deep scans" ? undefined : title} sub={sub}>{children}</SecurityPage>
);
import { RunDetailBody } from "../agents/views";

const usd = (v: number | null) => formatCost(v) ?? "–";

// ---- list ----------------------------------------------------------------------

function ScanListRow({ s }: { s: ScanView }) {
  const st = SCAN_STATE[s.state];
  return (
    <li className="border-b border-line last:border-0">
      <Link to={scanPath(s.id)} className="block px-4 py-3 hover:bg-ink/[0.03] max-md:min-h-11">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="text-sm font-medium">{s.repo}</span>
          <span className="num text-xs text-ink/55">Scan {s.id}</span>
          {s.areasTotal > 0 && <RateBar frac={s.areasDone / s.areasTotal} className="w-20" />}
        </span>
        <span className="num mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink/60">
          <span>{s.areasTotal ? `${s.areasDone} of ${s.areasTotal} areas` : "No areas yet"}</span>
          <span>{usd(s.costUsd)} of {s.capUsd === null ? "no cap" : usd(s.capUsd)}</span>
          <span>{s.findingCount} {s.findingCount === 1 ? "finding" : "findings"}</span>
          <span>{s.startedBy} · <TimeAgo iso={s.startedAt} /></span>
        </span>
      </Link>
    </li>
  );
}

export function ScansView(_: ViewProps) {
  const { state, update } = useUrlState();
  const repo = state.repo;
  const all = useQuery("security:scans:all", (a) => a.security.scans());
  const q = useQuery(`security:scans:${repo ?? ""}`, (a) => a.security.scans(repo));
  const repos = [...new Set((all.data ?? []).map((s) => s.repo))].sort();
  return (
    <Page title="Deep scans">
      <Block
        className="mt-4"
        flush
        title={repo ?? "All repos"}
        aside={repos.length > 1 || repo ? (
          <select aria-label="Repo" value={repo ?? ""} onChange={(e) => update({ repo: e.target.value || null })} className={cn(selectCls, "max-md:h-11")}>
            <option value="">All repos</option>
            {repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        ) : undefined}
      >
        <ErrorLine error={q.error?.message} className="px-4 py-3" />
        {q.data && q.data.length > 0 ? <ul>{q.data.map((s) => <ScanListRow key={s.id} s={s} />)}</ul> : q.data && <EmptyState icon={ShieldWarningIcon}>No scans</EmptyState>}
      </Block>
    </Page>
  );
}

// ---- detail --------------------------------------------------------------------

const RISK_TONE = (risk: number): Tone => (risk >= 4 ? "bad" : risk >= 3 ? "warn" : "neutral");
const AREA_STATE: Record<ScanArea["state"], { label: string; tone: Tone }> = {
  pending: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "accent" },
  done: { label: "Done", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
};
const CALL_STATE: Record<ScanCall["state"], { label: string; tone: Tone }> = {
  running: { label: "Running", tone: "accent" },
  done: { label: "Done", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
};
const KIND = { model: "Threat model", area: "Area scan", verify: "Verification", test: "Scan test", fix: "Fix", review: "Fix review", duplicate: "Found again" } as const;

function ThreatModel({ d }: { d: ScanDetail }) {
  if (!d.summary && !d.areas.length) return null;
  return (
    <Block className="mt-4" flush title="Threat model">
      {d.summary && <p className="border-b border-line px-4 py-3 text-sm [overflow-wrap:anywhere]">{d.summary}</p>}
      {d.entryPoints.length > 0 && (
        <div className="border-b border-line px-4 py-3">
          <h3 className="mb-1 text-xs font-semibold text-ink/65">Entry points</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {d.entryPoints.map((e) => (
              <li key={e.name} className="flex flex-wrap items-baseline gap-x-2">
                <span>{e.name}</span>
                <span className="text-xs text-ink/50">{e.kind}</span>
                <span className="code text-xs text-ink/50 [overflow-wrap:anywhere]">{e.where}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul>
        {d.areas.map((a) => {
          const st = AREA_STATE[a.state];
          return (
            <li key={a.idx} className="flex items-start gap-3 border-b border-line px-4 py-2.5 last:border-0">
              <Badge tone={RISK_TONE(a.risk)} className="mt-0.5 w-14 justify-center">Risk {a.risk}</Badge>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{a.name}</span>
                {a.why && <span className="block text-xs text-ink/60 [overflow-wrap:anywhere]">{a.why}</span>}
              </span>
              <span className="flex flex-col items-end gap-1">
                <Badge tone={st.tone}>{st.label}</Badge>
                <span className="num text-xs text-ink/55">{usd(a.costUsd || null)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function CallRow({ c, open: initial }: { c: ScanCall; open?: boolean }) {
  const [open, setOpen] = useState(!!initial);
  useNow(c.state === "running" ? 1000 : undefined);
  const st = CALL_STATE[c.state];
  const Caret = open ? CaretDownIcon : CaretRightIcon;
  const what = c.areaName ?? (c.findingNumber !== null ? `Finding ${c.findingNumber}` : "");
  const took = span((c.endedAt ? Date.parse(c.endedAt) : nowMs()) - Date.parse(c.startedAt));
  return (
    <li className="border-b border-line last:border-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-ink/[0.03] max-md:min-h-11">
        <Caret className="mt-1 shrink-0 text-[13px] text-ink/50" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{KIND[c.kind]}</span>
            {what && <span className="text-sm text-ink/70 [overflow-wrap:anywhere]">{what}</span>}
            <Badge tone={st.tone}>{st.label}</Badge>
          </span>
          <span className="num mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink/55">
            <TimeAgo iso={c.startedAt} />
            <span>{took}</span>
            <span>{usd(c.costUsd)}</span>
          </span>
          {c.progress && <span className="mt-0.5 block text-xs text-ink/70 [overflow-wrap:anywhere]">{c.progress}</span>}
        </span>
      </button>
      {open && (
        <div className="border-t border-line bg-sunken/40">
          {c.runId === null ? <p className="px-4 py-3 text-sm text-ink/55">No model run recorded.</p> : (
            <>
              <RunDetailBody id={c.runId} />
              <Link to={`/agents/${c.runId}`} className="num block px-4 pb-3 text-sm text-accent-ink hover:underline max-md:py-2">Run {c.runId}</Link>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function ScanView({ params }: ViewProps) {
  const id = Number(params.id);
  const q = useQuery<ScanDetail>(`security:scan:${id}`, (a) => a.security.scan(id));
  const d = q.data;
  if (!d) return <Page title={`Scan ${id}`}>{q.error ? <ErrorLine error={q.error.message} className="mt-4" /> : <p className="mt-4 text-sm text-ink/50">Loading.</p>}</Page>;
  const running = scanActive(d.scan.state);
  const last = d.calls[d.calls.length - 1];
  return (
    <Page title={`${d.scan.repo} scan ${d.scan.id}`} sub={d.scan.commit ?? undefined}>
      <Block className="mt-4" flush title="Scan" aside={<Link to={`${scanPath()}?repo=${encodeURIComponent(d.scan.repo)}`} className="text-sm text-accent-ink hover:underline">All scans</Link>}>
        <ScanRow s={d.scan} />
      </Block>
      <ThreatModel d={d} />
      <Block className="mt-4" flush title={`Model calls (${d.calls.length})`}>
        {d.calls.length ? <ul>{d.calls.map((c) => <CallRow key={c.id} c={c} open={running && c.id === last?.id && c.state === "running"} />)}</ul> : <EmptyState>No calls yet</EmptyState>}
      </Block>
      <Block className="mt-4" flush title={`Findings (${d.findings.length})`}>
        {d.findings.length ? (
          <ul>
            {sortFindings(d.findings).map((f) => {
              const sev = SEVERITY[f.severity], st = FINDING_STATE[f.state];
              return (
                <li key={f.number} className="border-b border-line last:border-0">
                  <Link to={findingPath(f.repo, f.number)} className="flex min-h-11 items-start gap-3 px-4 py-2.5 hover:bg-ink/[0.03]">
                    <Badge tone={sev.tone} className="mt-0.5 w-16 justify-center">{sev.label}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm [overflow-wrap:anywhere]">{f.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/55"><span className="num">{f.area}</span><Badge tone={st.tone}>{st.label}</Badge>{f.scanTest && <Badge tone={SCAN_TEST[f.scanTest].tone}>{SCAN_TEST[f.scanTest].label}</Badge>}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState icon={ShieldWarningIcon}>No findings</EmptyState>}
      </Block>
    </Page>
  );
}
