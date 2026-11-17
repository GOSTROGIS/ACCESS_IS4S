import { useEffect, useState } from "react";
import { Popover } from "radix-ui";
import { SealCheckIcon, PencilSimpleIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useApi, useQuery } from "../../api/client";
import type { Contributor, ContributorFilter, ContributorList, ContributorSort, RulePreview, Tier, WhitelistRule } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { Avatar } from "../../ui/atoms/Avatar";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { cn } from "../../ui/cn";
import { Count } from "../../ui/atoms/Heading";
import { day, num } from "../../lib/format";
import { useIsPhone } from "../../shell/useMedia";
import { Block } from "../../ui/molecules/Block";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { Input } from "../../ui/atoms/Input";
import { Page } from "../../ui/organisms/Page";
import { Pager } from "../../ui/molecules/Pager";
import { Select } from "../../ui/atoms/Select";
import { Th } from "../../ui/atoms/Th";
import { useUrlState, useWrite } from "../../lib/hooks";

const PAGE = 50;

export const TIER: Record<Tier, [string, Tone]> = {
  whitelisted: ["Whitelisted", "ok"],
  not: ["Not whitelisted", "neutral"],
  "override-allow": ["Override: allow", "accent"],
  "override-deny": ["Override: deny", "bad"],
};
const TIERS = Object.keys(TIER) as Tier[];
const SORT_KEYS: ContributorSort[] = ["login", "tier", "merged", "closed", "open", "rate", "last", "repos"];

const rateText = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);
const ruleText = (r: WhitelistRule) => `at least ${r.minMerged} merged PRs and a merge rate of at least ${Math.round(r.minRate * 100)}%`;

function useFilter() {
  const { state, update } = useUrlState();
  const sort = SORT_KEYS.includes(state.sort as ContributorSort) ? (state.sort as ContributorSort) : "merged";
  const filter: ContributorFilter = {
    q: state.q || undefined,
    tier: TIERS.includes(state.tier as Tier) ? (state.tier as Tier) : undefined,
    repo: state.repo || undefined,
    sort,
    desc: state.desc === undefined ? sort !== "login" : state.desc === "1",
    limit: PAGE,
    offset: Math.max(0, Number(state.offset) || 0),
  };
  return { filter, update };
}

export function ContributorsView({ user }: ViewProps) {
  const { filter, update } = useFilter();
  const key = JSON.stringify(filter);
  const { data, error } = useQuery(`contributors:${key}`, (api) => api.contributors.list(filter));
  const phone = useIsPhone();
  const operator = user.role === "operator";
  const all = data ? Object.values(data.byTier).reduce((a, b) => a + b, 0) : undefined;
  const allowed = data ? data.byTier.whitelisted + data.byTier["override-allow"] : 0;

  const onSort = (k: ContributorSort) => {
    const desc = filter.sort === k ? !filter.desc : k !== "login";
    update({ sort: k === "merged" ? null : k, desc: desc === (k !== "login") ? null : desc ? "1" : "0", offset: null });
  };

  return (
    <Page
      title="Contributors"
      sub={data && `${num(all!)} authors${filter.q || filter.repo ? " matching" : ""} · ${num(allowed)} may merge on green CI without a decision`}
    >
      {data && <RuleBlock rule={data.rule} operator={operator} />}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchField value={filter.q ?? ""} onChange={(q) => update({ q: q || null, offset: null })} />
        <div role="radiogroup" aria-label="Status" className="flex flex-wrap items-center gap-1">
          <button role="radio" aria-checked={!filter.tier} data-active={!filter.tier} className="chip" onClick={() => update({ tier: null, offset: null })}>
            All <span className="num opacity-60">{all ?? ""}</span>
          </button>
          {TIERS.map((t) => (
            <button key={t} role="radio" aria-checked={filter.tier === t} data-active={filter.tier === t} className="chip" onClick={() => update({ tier: filter.tier === t ? null : t, offset: null })}>
              {TIER[t][0]} <span className="num opacity-60">{data?.byTier[t] ?? ""}</span>
            </button>
          ))}
        </div>
        <RepoSelect value={filter.repo} onChange={(repo) => update({ repo: repo || null, offset: null })} />
      </div>

      <Block
        className="mt-3"
        flush
        title={
          <span className="flex items-center gap-2">
            {filter.tier ? TIER[filter.tier][0] : "Every author"} <Count n={data?.total} />
          </span>
        }
        aside={phone ? undefined : "Merge counts cover every tracked repo. Click a column header to sort."}
      >
        <ErrorLine error={error?.message} className="p-4" />
        {data && data.contributors.length === 0 && <p className="px-4 py-6 text-sm text-ink/50">No author matches these filters.</p>}
        {data && data.contributors.length > 0 && (phone ? <Cards list={data} operator={operator} /> : <Table list={data} operator={operator} filter={filter} onSort={onSort} />)}
        {data && <Pager offset={filter.offset ?? 0} limit={PAGE} total={data.total} onOffset={(o) => update({ offset: o ? String(o) : null })} />}
      </Block>
    </Page>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => onChange(v.trim()), 250);
    return () => clearTimeout(t);
  }, [v, value, onChange]);
  return (
    <label className="flex h-8 w-full items-center gap-2 rounded border border-line bg-sunken px-2.5 focus-within:border-accent/60 max-md:h-11 sm:w-56">
      <MagnifyingGlassIcon className="text-ink/40" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Find a login" aria-label="Find a login" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink/40" />
    </label>
  );
}

function RepoSelect({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const { data: repos } = useQuery("repos", (api) => api.repos());
  return (
    <Select aria-label="Repo" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={cn("sm:ml-auto", value ? "text-accent-ink" : "text-ink/70")}>
      <option value="">Every repo</option>
      {repos?.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </Select>
  );
}

function StatusCell({ c }: { c: Contributor }) {
  const [label, tone] = TIER[c.tier];
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <Badge tone={tone}>{label}</Badge>
        {c.override && !c.overrideInEffect && <span className="whitespace-nowrap text-2xs text-ink/45">{c.override} not in effect</span>}
        {c.override && c.overrideInEffect && <span className="text-2xs text-ink/45">rule: {c.autoTier === "whitelisted" ? "whitelisted" : "not"}</span>}
      </span>
      {c.overrideNote !== undefined && c.override && (
        <span className="truncate text-2xs text-ink/50" title={c.overrideNote ?? undefined}>
          {c.overrideNote ? `“${c.overrideNote}”` : "No note"} · {c.overrideBy ?? "?"}, {day(c.overrideAt)}
        </span>
      )}
    </div>
  );
}

function Table({ list, operator, filter, onSort }: { list: ContributorList; operator: boolean; filter: ContributorFilter; onSort: (k: ContributorSort) => void }) {
  const sort = { k: filter.sort ?? "merged", desc: !!filter.desc };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead className="bg-ink/[0.03] text-xs">
          <tr className="border-b border-line">
            <Th k="login" sort={sort} onSort={onSort}>Login</Th>
            <Th k="tier" sort={sort} onSort={onSort} className="w-[220px]">Status</Th>
            <Th k="merged" sort={sort} onSort={onSort} right className="w-[80px]">Merged</Th>
            <Th k="closed" sort={sort} onSort={onSort} right className="w-[80px] whitespace-normal leading-tight">Closed unmerged</Th>
            <Th k="open" sort={sort} onSort={onSort} right className="w-[64px]">Open</Th>
            <Th k="rate" sort={sort} onSort={onSort} right className="w-[90px]">Merge rate</Th>
            <Th k="last" sort={sort} onSort={onSort} className="w-[100px]">Last merge</Th>
            <Th k="repos" sort={sort} onSort={onSort} className="w-[130px]">Repos</Th>
            {operator && <th className="w-[100px]" aria-label="Override" />}
          </tr>
        </thead>
        <tbody>
          {list.contributors.map((c) => (
            <tr key={c.login} className="border-b border-line last:border-0 hover:bg-ink/[0.03]">
              <td className="px-3 py-1.5">
                <a href={`https://github.com/${encodeURIComponent(c.login)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-medium hover:text-accent-ink hover:underline">
                  <Avatar login={c.login} size={18} />
                  <span className="truncate">{c.login}</span>
                </a>
              </td>
              <td className="max-w-[220px] px-3 py-1.5">
                <StatusCell c={c} />
              </td>
              <td className="num px-3 text-right">{num(c.merged)}</td>
              <td className="num px-3 text-right">{num(c.closedUnmerged)}</td>
              <td className="num px-3 text-right">{num(c.open)}</td>
              <td className={cn("num px-3 text-right", c.mergeRate !== null && c.mergeRate < list.rule.minRate && "text-ink/50")}>{rateText(c.mergeRate)}</td>
              <td className="num whitespace-nowrap px-3 text-ink/70">{day(c.lastMerge)}</td>
              <td className="max-w-[130px] truncate px-3 text-xs text-ink/60" title={c.repos.join(", ")}>
                {c.repos.join(", ") || "–"}
              </td>
              {operator && (
                <td className="whitespace-nowrap px-3 text-right">
                  <OverrideEditor c={c} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ list, operator }: { list: ContributorList; operator: boolean }) {
  return (
    <ul>
      {list.contributors.map((c) => (
        <li key={c.login} className="border-b border-line px-4 py-2.5 last:border-0">
          <div className="flex items-center gap-2">
            <Avatar login={c.login} size={20} />
            <span className="min-w-0 flex-1 truncate font-medium">{c.login}</span>
            {operator && <OverrideEditor c={c} />}
          </div>
          <div className="mt-1.5">
            <StatusCell c={c} />
          </div>
          <div className="num mt-1 flex flex-wrap gap-x-3 text-xs text-ink/55">
            <span>{num(c.merged)} merged</span>
            <span>{num(c.closedUnmerged)} closed unmerged</span>
            <span>{num(c.open)} open</span>
            <span>rate {rateText(c.mergeRate)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function OverrideEditor({ c }: { c: Contributor }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(c.overrideNote ?? "");
  const { busy, error, setError, run } = useWrite();
  useEffect(() => {
    if (open) {
      setNote(c.overrideNote ?? "");
      setError(null);
    }
  }, [open, c.overrideNote, setError]);
  const save = (status: "allow" | "deny" | null) =>
    void run(status ?? "clear", () => api.contributors.override(c.login, status ? { status, note } : { status: null })).then((ok) => ok && setOpen(false));
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button size="sm" variant="ghost" icon={PencilSimpleIcon} className="max-md:h-11" aria-label={`Override for ${c.login}`}>
          Override
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={4} className="z-50 w-[300px] rounded-md border border-line-strong bg-raised p-3 shadow-[0_12px_32px_rgba(0,0,0,0.28)] animate-rise">
          <p className="text-sm font-semibold">{c.login}</p>
          <p className="mt-0.5 text-xs text-ink/55">
            By the rule: {c.autoTier === "whitelisted" ? "whitelisted" : "not whitelisted"}. An override always wins.
          </p>
          <label className="mt-3 block text-xs text-ink/60">
            Note
            <textarea
              value={note}
              maxLength={300}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block w-full resize-none rounded border border-line bg-sunken px-2 py-1.5 text-sm text-ink outline-none focus:border-accent/60"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant={c.override === "allow" ? "primary" : "secondary"} loading={busy === "allow"} onClick={() => save("allow")}>
              Allow
            </Button>
            <Button size="sm" variant={c.override === "deny" ? "primary" : "secondary"} loading={busy === "deny"} onClick={() => save("deny")}>
              Deny
            </Button>
            {c.override && (
              <Button size="sm" variant="ghost" loading={busy === "clear"} onClick={() => save(null)} className="ml-auto">
                Clear override
              </Button>
            )}
          </div>
          <ErrorLine error={error} className="mt-2" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function RuleBlock({ rule, operator }: { rule: WhitelistRule; operator: boolean }) {
  const api = useApi();
  const [merged, setMerged] = useState(String(rule.minMerged));
  const [ratePct, setRatePct] = useState(String(Math.round(rule.minRate * 100)));
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const { busy, error, setError, run } = useWrite();
  useEffect(() => {
    setMerged(String(rule.minMerged));
    setRatePct(String(Math.round(rule.minRate * 100)));
  }, [rule.minMerged, rule.minRate]);

  const m = Number(merged);
  const r = Number(ratePct);
  const valid = merged.trim() !== "" && ratePct.trim() !== "" && Number.isInteger(m) && m >= 0 && r >= 0 && r <= 100;
  const next: WhitelistRule = { minMerged: m, minRate: Math.round(r * 100) / 10000 };
  const changed = valid && (next.minMerged !== rule.minMerged || Math.abs(next.minRate - rule.minRate) > 1e-9);

  useEffect(() => {
    if (!operator || !changed) {
      setPreview(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      api.contributors.previewRule(next).then((p) => live && setPreview(p), (e: Error) => live && setError(e.message));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [operator, changed, next.minMerged, next.minRate, api]);

  const text = `Whitelisted: ${ruleText(rule)}. Their PRs may merge on green CI without a decision. An override always wins.`;
  if (!operator)
    return (
      <p className="mt-3 flex items-start gap-2 text-sm text-ink/75">
        <SealCheckIcon className="mt-0.5 text-ok" />
        {text}
      </p>
    );

  return (
    <Block className="mt-4" title="Whitelist rule" aside={text}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink/60">
          Minimum merged PRs
          <Input type="number" min={0} step={1} value={merged} onChange={(e) => setMerged(e.target.value)} className="mt-1 block w-28" />
        </label>
        <label className="text-xs text-ink/60">
          Minimum merge rate (%)
          <Input type="number" min={0} max={100} step={1} value={ratePct} onChange={(e) => setRatePct(e.target.value)} className="mt-1 block w-28" />
        </label>
        <Button
          variant="primary"
          disabled={!changed}
          loading={busy === "rule"}
          className="max-md:h-11"
          onClick={() => void run("rule", () => api.contributors.setRule(next))}
        >
          Save rule
        </Button>
        {changed && (
          <Button
            variant="ghost"
            className="max-md:h-11"
            onClick={() => {
              setMerged(String(rule.minMerged));
              setRatePct(String(Math.round(rule.minRate * 100)));
            }}
          >
            Reset
          </Button>
        )}
      </div>
      {!valid && <ErrorLine className="mt-2" error="Merged PRs must be a whole number of at least 0, and the rate between 0 and 100." />}
      <ErrorLine className="mt-2" error={error} />
      {changed && <PreviewLine p={preview} />}
    </Block>
  );
}

function PreviewLine({ p }: { p: RulePreview | null }) {
  if (!p) return <p className="mt-3 text-sm text-ink/50">Counting…</p>;
  const delta = p.allowedAfter - p.allowedNow;
  const names = (xs: string[], count: number) => `${xs.slice(0, 8).join(", ")}${count > 8 ? `, and ${num(count - 8)} more` : ""}`;
  return (
    <div className="mt-3 rounded border border-line bg-ink/[0.03] px-3 py-2 text-sm">
      <p>
        Under this rule <strong className="num">{num(p.allowedAfter)}</strong> of {num(p.authors)} authors are whitelisted, against {num(p.allowedNow)} now
        {delta ? (
          <span className={cn("num ml-1", delta > 0 ? "text-ok" : "text-warn")}>
            ({delta > 0 ? "+" : "−"}
            {num(Math.abs(delta))})
          </span>
        ) : null}
        . Overrides stay as they are.
      </p>
      {p.gained.count > 0 && <p className="mt-1 text-xs text-ink/65">Become whitelisted: {names(p.gained.logins, p.gained.count)}</p>}
      {p.lost.count > 0 && <p className="mt-1 text-xs text-ink/65">Stop being whitelisted: {names(p.lost.logins, p.lost.count)}</p>}
      {!p.gained.count && !p.lost.count && <p className="mt-1 text-xs text-ink/55">Nobody's status changes.</p>}
    </div>
  );
}

