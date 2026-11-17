// CI on the default branch of every tracked repo, red first.
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { useQuery } from "../../api/client";
import type { MainCiRepo, MainCiState } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { MainCiBadge, MAIN_CI_LABEL } from "../../ui/atoms/MainCiBadge";
import { Chip } from "../../ui/atoms/Chip";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { Block, ErrorLine, Page, useUrlState } from "../admin/parts";
import { FailingChecks } from "./parts";
import { ownerOfRepo } from "../../lib/links";
import { safeHref } from "../../ui/safeHref";

const STATES: MainCiState[] = ["red", "optional", "running", "none", "green"];
const rank = (s: MainCiState) => STATES.indexOf(s);
const sha7 = (s: string) => s.slice(0, 7);
const gh = (repo: string, tail: string) => `https://github.com/${ownerOfRepo(repo)}/${encodeURIComponent(repo)}/${tail}`;

const Out = ({ url, label }: { url: string; label: string }) => (
  <a href={safeHref(url)} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} className="relative z-10 inline-flex size-5 shrink-0 items-center justify-center text-ink/55 hover:text-accent-ink">
    <ArrowSquareOutIcon className="size-4" />
  </a>
);

/** What AutoCraft does about a red main. A single cell so the server data can fill it in. */
export function AutoCraftCell({ text }: { text?: string }) {
  return <span className={text ? "text-ink/80" : "text-ink/40"}>{text ?? "–"}</span>;
}

function Commit({ sha, headline, repo }: { sha: string; headline: string | null; repo: string }) {
  return (
    <span className="flex min-w-0 items-start gap-2">
      <Out url={gh(repo, `commit/${sha}`)} label="Open the commit on GitHub" />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <span className="code text-ink/60">{sha7(sha)}</span> <span className="text-ink/80">{headline ?? ""}</span>
      </span>
    </span>
  );
}

function Culprit({ r }: { r: MainCiRepo }) {
  const c = r.culprit;
  if (!c) return <span className="text-ink/40">–</span>;
  if (c.pr != null) {
    return (
      <span className="relative z-10 block">
        <ItemRef repo={r.repo} number={c.pr} kind="pr" title={c.headline} size="sm" />
      </span>
    );
  }
  return <Commit sha={c.sha} headline={c.headline} repo={r.repo} />;
}

const repoPath = (repo: string) => `/repos/${encodeURIComponent(repo)}`;

function RepoCell({ r }: { r: MainCiRepo }) {
  return (
    <Link to={repoPath(r.repo)} className="code font-medium hover:underline after:absolute after:inset-0">
      {r.repo}
    </Link>
  );
}

function Table({ rows }: { rows: MainCiRepo[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[110px]" />
          <col className="w-[120px]" />
          <col className="w-[14%]" />
          <col className="w-[84px]" />
          <col className="w-[22%]" />
          <col />
          <col className="w-[70px]" />
          <col className="w-[90px]" />
        </colgroup>
        <thead className="bg-ink/[0.03] text-xs text-ink/55">
          <tr className="border-b border-line text-left">
            <th className="h-8 px-3 font-medium">Repo</th>
            <th className="px-3 font-medium">State</th>
            <th className="px-3 font-medium">Failing</th>
            <th className="whitespace-nowrap px-3 font-medium">Red since</th>
            <th className="px-3 font-medium">Culprit</th>
            <th className="px-3 font-medium">Head</th>
            <th className="px-3 font-medium">Updated</th>
            <th className="px-3 font-medium">AutoCraft</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.repo} className="relative border-b border-line align-top last:border-0 hover:bg-ink/[0.03]">
              <td className="px-3 py-2">
                <RepoCell r={r} />
              </td>
              <td className="px-3 py-2">
                <MainCiBadge state={r.state} />
              </td>
              <td className="px-3 py-2 [overflow-wrap:anywhere]">
                <FailingChecks checks={r.failing} className="flex flex-col gap-0.5" />
              </td>
              <td className="num px-3 py-2 text-xs text-ink/60">{r.redSince ? <TimeAgo iso={r.redSince} /> : "–"}</td>
              <td className="px-3 py-2 text-xs">
                <Culprit r={r} />
              </td>
              <td className="px-3 py-2 text-xs">
                <Commit sha={r.headSha} headline={r.headline} repo={r.repo} />
              </td>
              <td className="num px-3 py-2 text-xs text-ink/60">
                <TimeAgo iso={r.updatedAt} />
              </td>
              <td className="px-3 py-2 text-xs">
                <AutoCraftCell text={r.autocraft ?? undefined} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ rows }: { rows: MainCiRepo[] }) {
  return (
    <ul className="md:hidden">
      {rows.map((r) => (
        <li key={r.repo} className="relative space-y-1 border-b border-line px-3 py-2.5 text-sm last:border-0">
          <div className="flex items-center gap-2">
            <RepoCell r={r} />
            <MainCiBadge state={r.state} />
            {r.redSince && (
              <span className="num text-xs text-ink/55">
                red <TimeAgo iso={r.redSince} />
              </span>
            )}
          </div>
          {r.failing.length > 0 && <FailingChecks checks={r.failing} className="flex flex-wrap gap-x-3 text-xs" />}
          {r.culprit && (
            <div className="text-xs">
              <Culprit r={r} />
            </div>
          )}
          <div className="text-xs">
            <Commit sha={r.headSha} headline={r.headline} repo={r.repo} />
          </div>
          {r.autocraft && <div className="text-xs text-ink/70">AutoCraft: {r.autocraft}</div>}
        </li>
      ))}
    </ul>
  );
}

export function MainCiView(_: ViewProps) {
  const { state, update } = useUrlState();
  const { data, error } = useQuery("main-ci", (api) => api.mainCi());
  const all = data?.repos ?? [];
  const repoFilter = state.repo;
  const scoped = repoFilter ? all.filter((r) => r.repo === repoFilter) : all;
  const stateFilter = STATES.find((s) => s === state.state);
  const rows = (stateFilter ? scoped.filter((r) => r.state === stateFilter) : scoped).slice().sort((a, b) => rank(a.state) - rank(b.state) || a.repo.localeCompare(b.repo));
  const count = (s: MainCiState) => scoped.filter((r) => r.state === s).length;

  return (
    <Page title="Main CI">
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Chip active={!stateFilter} count={scoped.length} onClick={() => update({ state: null })}>
          All
        </Chip>
        {STATES.filter((s) => count(s) > 0 || s === stateFilter).map((s) => (
          <Chip key={s} active={stateFilter === s} count={count(s)} onClick={() => update({ state: stateFilter === s ? null : s })}>
            {MAIN_CI_LABEL[s]}
          </Chip>
        ))}
        {repoFilter && (
          <Chip active onClick={() => update({ repo: null })}>
            {repoFilter} ×
          </Chip>
        )}
      </div>
      <Block className="mt-3" flush title="Default branches">
        <ErrorLine error={error?.message} className="p-4" />
        {data && rows.length === 0 && <p className="px-4 py-6 text-sm text-ink/50">No repos match.</p>}
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

