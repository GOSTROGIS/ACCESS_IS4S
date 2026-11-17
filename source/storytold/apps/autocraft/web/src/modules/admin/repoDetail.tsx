import { Link } from "react-router-dom";
import { useApi, useQuery } from "../../api/client";
import type { TrackedRepo } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { Badge } from "../../ui/atoms/Badge";
import { num } from "../../lib/format";
import { useUser } from "../../shell/UserContext";
import { Block } from "../../ui/molecules/Block";
import { Switch } from "../../ui/atoms/Switch";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { Page } from "../../ui/organisms/Page";
import { OptionalChecks, PipelineSwitch, Toggle, WRITES, approvalPatch, useRepoWrite, maybe, synced, type Write, type WriteKind } from "./repoParts";
import { MainCiBadge } from "../../ui/atoms/MainCiBadge";
import { FailingChecks } from "../mainci/parts";
import { useNow } from "../../lib/useNow";
import { ownerOfRepo } from "../../lib/links";
import { SecuritySection } from "./securityParts";

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div title={title}>
      <div className="text-xs text-ink/55">{label}</div>
      <div className="num text-lg font-semibold">{value}</div>
    </div>
  );
}

function WriteRow({ r, w, write }: { r: TrackedRepo; w: WriteKind; write: Write }) {
  const api = useApi();
  const user = useUser();
  const me = user.login;
  const operator = user.role === "operator";
  const m = r[w.field];
  const key = `${w.field}:${r.name}`;
  return (
    <li className="flex items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{w.name}</div>
        <div className="text-sm text-ink/60">{w.line}</div>
        {m?.approved && (
          <div className="num text-xs text-ink/50">
            {m.approvedBy} {m.approvedAt ?? ""}
          </div>
        )}
      </div>
      {operator ? (
        <Switch on={!!m?.approved} label={w.name} onChange={(on) => void write.run(key, () => w.run(api, r.name, on), { repo: r.name, patch: approvalPatch(w, on, me) })} />
      ) : m?.approved ? (
        <Badge tone="ok">Approved</Badge>
      ) : (
        <Badge>Not approved</Badge>
      )}
    </li>
  );
}

/** On when every GitHub write of the repo is approved. Switching it on approves the rest in pipeline order; off stops them all. */
function AllWrites({ r, write }: { r: TrackedRepo; write: Write }) {
  const api = useApi();
  const user = useUser();
  const operator = user.role === "operator";
  const key = `all:${r.name}`;
  if (!operator) return null;
  const all = WRITES.every((w) => r[w.field]?.approved);
  return (
    <span className="inline-flex items-center gap-3 text-sm text-ink/60">
      All
      <Switch on={all} label="All GitHub writes" onChange={(on) => {
        const todo = WRITES.filter((w) => !!r[w.field]?.approved !== on);
        const confirmed = new Set<string>();
        void write.run(key, async () => {
          const out: Partial<TrackedRepo> = { name: r.name };
          for (const w of todo) {
            Object.assign(out, { [w.field]: ((await w.run(api, r.name, on)) as TrackedRepo)[w.field] });
            confirmed.add(w.field);
          }
          return out;
        }, { repo: r.name, confirmed, patch: (cur) => Object.assign({}, ...todo.map((w) => approvalPatch(w, on, user.login)(cur))) });
      }} />
    </span>
  );
}

function MainCiLine({ name }: { name: string }) {
  const { data } = useQuery("main-ci", (a) => a.mainCi());
  const r = data?.repos.find((x) => x.repo === name);
  if (!r) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-ink/60">Main CI</span>
      <Link to={`/main-ci?repo=${encodeURIComponent(name)}`} className="hover:opacity-80">
        <MainCiBadge state={r.state} />
      </Link>
      {r.failing.length > 0 && <FailingChecks checks={r.failing} />}
    </div>
  );
}

export function RepoDetailView({ params }: ViewProps) {
  useNow();
  const name = params.name ?? "";
  const { data, error } = useQuery("repo-admin", (a) => a.repoAdmin.list());
  const write = useRepoWrite();
  const r = data?.find((x) => x.name === name);
  const l = r?.labels;
  const staff = useUser().role !== "viewer";

  return (
    <Page title={name}>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
        <Link to="/repos" className="text-ink/60 hover:text-accent-ink hover:underline">
          Repos
        </Link>
        <a href={`https://github.com/${ownerOfRepo(name)}/${encodeURIComponent(name)}`} target="_blank" rel="noopener noreferrer" className="text-ink/60 hover:text-accent-ink hover:underline">
          GitHub
        </a>
        {r && (r.tracked ? <Badge tone="ok">Tracked</Badge> : <Badge>Not tracked</Badge>)}
        {r && <Toggle r={r} write={write} />}
        {r?.tracked && (
          <span className="inline-flex items-center gap-3">
            <span className="text-ink/60">Pipeline</span>
            <PipelineSwitch r={r} write={write} />
          </span>
        )}
      </div>
      <MainCiLine name={name} />
      <ErrorLine error={write.error ?? error?.message} className="mt-2" />
      {!data && !error && <p className="mt-4 text-sm text-ink/50">Loading…</p>}
      {data && !r && <p className="mt-4 text-sm text-ink/50">No such repo.</p>}
      {r && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Open PRs" value={maybe(r.openPrs)} />
            <Stat label="Open issues" value={maybe(r.openIssues)} />
            <Stat label="Rows in mirror" value={num(r.mirrored)} />
            <Stat label="Last synced" value={synced(r)} title={r.syncedAt ?? undefined} />
          </div>
          {r.tracked && (
            <>
              {staff && <SecuritySection repo={r.name} />}
              <Block className="mt-4" flush title="GitHub writes" aside={<AllWrites r={r} write={write} />}>
                <ul>
                  {WRITES.map((w) => (
                    <WriteRow key={w.field} r={r} w={w} write={write} />
                  ))}
                </ul>
              </Block>
              <OptionalChecks r={r} write={write} />
              {l && (
                <Block className="mt-4" title="Labels plan">
                  <div className="num flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span>{num(l.toAdd)} to add</span>
                    <span>{num(l.skipped)} skipped</span>
                    <span>{num(l.conflicts)} conflicts</span>
                  </div>
                </Block>
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}

