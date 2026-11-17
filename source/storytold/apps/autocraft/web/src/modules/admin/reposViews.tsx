import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi, useQuery } from "../../api/client";
import type { TrackedRepo } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { Badge } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { cn } from "../../ui/cn";
import { useIsPhone } from "../../shell/useMedia";
import { useUser } from "../../shell/UserContext";
import { Block } from "../../ui/molecules/Block";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { Input } from "../../ui/atoms/Input";
import { Page } from "../../ui/organisms/Page";
import { Th } from "../../ui/atoms/Th";
import {
  PipelineBadge,
  PipelineSwitch,
  WriteBadges,
  maybe,
  synced,
  useRepoWrite,
} from "./repoParts";
import { useNow } from "../../lib/useNow";

type Show = "all" | "tracked" | "untracked";

export function ReposView(_: ViewProps) {
  const api = useApi();
  const { data, error } = useQuery("repo-admin", (a) => a.repoAdmin.list());
  const [show, setShow] = useState<Show>("tracked");
  const [name, setName] = useState("");
  const write = useRepoWrite();
  const operator = useUser().role === "operator";
  const phone = useIsPhone();
  const tracked = data?.filter((r) => r.tracked).length ?? 0;
  const rows =
    data?.filter((r) => show === "all" || (show === "tracked") === r.tracked) ??
    [];

  const add = () => {
    const n = name.trim();
    if (n)
      void write
        .run(`track:${n}`, () => api.repoAdmin.track(n))
        .then((ok) => ok && setName(""));
  };

  return (
    <Page
      title="Repos"
      sub={data && `${tracked} of ${data.length} repos tracked`}
    >
      <p className="mt-2 max-w-[80ch] text-sm text-ink/65">
        Sync and every page work on tracked repos only; the pipeline stages run
        only where Pipeline is on, and elsewhere a tracked repo is synced only.
        Tracking a repo takes effect at the next sync; rows of an untracked repo
        stay in the mirror but are hidden.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Show"
          className="flex items-center gap-1"
        >
          {(
            [
              ["all", "All", data?.length],
              ["tracked", "Tracked", tracked],
              [
                "untracked",
                "Not tracked",
                data ? data.length - tracked : undefined,
              ],
            ] as [Show, string, number | undefined][]
          ).map(([v, label, n]) => (
            <button
              key={v}
              role="radio"
              aria-checked={show === v}
              data-active={show === v}
              className="chip"
              onClick={() => setShow(v)}
            >
              {label} <span className="num opacity-60">{n ?? ""}</span>
            </button>
          ))}
        </div>
        {operator && <form
          className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Repo name or owner/name"
            aria-label="Repo to track"
            className="flex-1 sm:w-64"
          />
          <Button
            type="submit"
            disabled={!name.trim()}
            loading={write.busy === `track:${name.trim()}`}
            className="max-md:h-11"
          >
            Track
          </Button>
        </form>}
      </div>
      <ErrorLine error={write.error ?? error?.message} className="mt-2" />

      <Block
        className="mt-3"
        flush
        title="Repos"
        aside={phone ? undefined : "Open counts come from the last sync"}
      >
        {!data && !error && <p className="p-4 text-sm text-ink/50">Loading…</p>}
        {data && (phone ? <Cards rows={rows} /> : <Table rows={rows} />)}
      </Block>
    </Page>
  );
}

function Table({ rows }: { rows: TrackedRepo[] }) {
  useNow();
  const nav = useNavigate();
  const write = useRepoWrite();
  return (
    <>
      <ErrorLine error={write.error} className="px-4 pt-2" />
      <table className="w-full border-collapse text-sm">
        <thead className="bg-ink/[0.03] text-xs">
          <tr className="border-b border-line">
            <Th className="w-[220px]">Repo</Th>
            <Th className="w-[120px]">Status</Th>
            <Th className="w-[190px]">Pipeline</Th>
            <Th right className="w-[100px]">
              Open PRs
            </Th>
            <Th right className="w-[110px]">
              Open issues
            </Th>
            <Th className="w-[150px] pl-6">Last synced</Th>
            <Th>GitHub writes</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.name}
              onClick={() => nav(`/repos/${r.name}`)}
              className={cn(
                "h-9 cursor-pointer border-b border-line last:border-0 hover:bg-ink/[0.03]",
                !r.tracked && "text-ink/60",
              )}
            >
              <td className="code px-3">
                <Link
                  to={`/repos/${r.name}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.name}
                </Link>
              </td>
              <td className="px-3">
                {r.tracked ? (
                  <Badge tone="ok">Tracked</Badge>
                ) : (
                  <Badge>Not tracked</Badge>
                )}
              </td>
              <td className="px-3" onClick={(e) => e.stopPropagation()}>
                <PipelineSwitch r={r} write={write} />
              </td>
              <td className="num px-3 text-right">{maybe(r.openPrs)}</td>
              <td className="num px-3 text-right">{maybe(r.openIssues)}</td>
              <td
                className="px-3 pl-6 text-ink/60"
                title={r.syncedAt ?? undefined}
              >
                {synced(r)}
              </td>
              <td className="px-3">
                {r.tracked ? (
                  <WriteBadges r={r} />
                ) : (
                  <span className="text-ink/40">–</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Cards({ rows }: { rows: TrackedRepo[] }) {
  useNow();
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.name} className="border-b border-line last:border-0">
          <Link to={`/repos/${r.name}`} className="block px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="code truncate">{r.name}</span>
              {r.tracked ? (
                <Badge tone="ok">Tracked</Badge>
              ) : (
                <Badge>Not tracked</Badge>
              )}
              {r.tracked && <PipelineBadge r={r} />}
            </div>
            <div className="num mt-0.5 text-xs text-ink/55">
              {maybe(r.openPrs)} PRs · {maybe(r.openIssues)} issues · synced{" "}
              {synced(r)}
            </div>
            {r.tracked && (
              <div className="mt-1">
                <WriteBadges r={r} />
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

