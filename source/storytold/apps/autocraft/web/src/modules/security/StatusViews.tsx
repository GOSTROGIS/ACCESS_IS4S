// Security as a destination: findings grouped by what they need, and the finding page on the item layout.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, GithubLogoIcon, RobotIcon, ShieldWarningIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "../../api/client";
import type { FindingPageData, FindingRow } from "../../api/types";
import { Badge } from "../../ui/atoms/Badge";
import { Pending } from "../../ui/atoms/Pending";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { CodeBlock } from "../../ui/molecules/CodeBlock";
import { ChoiceGroup } from "../item/ChoiceGroup";
import { Section } from "../../ui/molecules/Section";
import { StatusLine } from "../../ui/molecules/StatusLine";
import { SecurityPage } from "./SecurityPage";
import { cn } from "../../ui/cn";
import { FINDING_STATE, SCAN_TEST, SEVERITY } from "../../lib/security";
import { formatCost } from "../../lib/trace";
import { findingPath, githubBlobUrl } from "../../lib/links";
import { useUser } from "../../shell/UserContext";
import { useIsPhone } from "../../shell/useMedia";
import type { ViewProps } from "../../registry/types";
import { safeHref } from "../../ui/safeHref";

/** The fix ran out of rounds and the finding waits for a person again. */
const gaveUp = (attempts: number, state: string) => attempts > 0 && state === "new";
const failedText = (n: number) => `Fix failed after ${n} ${n === 1 ? "round" : "rounds"}`;

function Row({ r }: { r: FindingRow }) {
  const sev = SEVERITY[r.severity];
  return (
    <li className="relative border-t border-line py-2.5 hover:bg-ink/[0.025] max-md:py-3">
      <div className="flex items-start gap-2 text-sm">
        <Badge tone={sev.tone} className="mt-px">{sev.label}</Badge>
        <Link to={findingPath(r.repo, r.number)} className="min-w-0 flex-1 break-words after:absolute after:inset-0 hover:underline">
          <span className="code text-ink/60">{r.repo}</span> {r.title}
        </Link>
        <TimeAgo iso={r.updatedAt} className="num shrink-0 pt-px text-xs text-ink/45" />
      </div>
      <div className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-ink/65">
        {gaveUp(r.attempts, r.state) && <WarningCircleIcon weight="fill" className="mt-[3px] shrink-0 text-warn" />}
        <p className="min-w-0 flex-1">
          {gaveUp(r.attempts, r.state) && <span className="font-medium text-warn">{failedText(r.attempts)} · </span>}
          <StatusLine status={r.status} compact className="inline text-xs" />
        </p>
      </div>
    </li>
  );
}

export function SecurityListView(_: ViewProps) {
  const { data, error } = useQuery("security-list", (a) => a.securityList());
  return (
    <SecurityPage tab="findings">
      {!data ? <Pending error={error} /> : (
        <div className="mt-5 space-y-7">
          {data.groups.map((g) => (
            <Section key={g.group} title={g.group} count={g.rows.length}>
              <ul>{g.rows.map((r) => <Row key={r.number} r={r} />)}</ul>
            </Section>
          ))}
        </div>
      )}
    </SecurityPage>
  );
}

function Question({ d }: { d: FindingPageData }) {
  const user = useUser();
  if (!d.decision || !d.choices) return null;
  return (
    <section className="border-b border-line px-4 pb-4 md:px-6" aria-label="Open question">
      <article className="rounded-md border border-line-strong px-3 py-3 md:px-4">
        <p className="text-pretty text-[15px] font-semibold leading-6">{d.decision.question}</p>
        <ChoiceGroup d={d.decision} user={user} choices={d.choices} />
      </article>
    </section>
  );
}

export function FindingPageView({ params }: ViewProps) {
  const repo = params.repo!;
  const n = Number(params.number);
  const role = useUser().role;
  const phone = useIsPhone();
  const [side, setSide] = useState<"autocraft" | "github">("autocraft");
  const { data: d, error } = useQuery(`security-finding-page:${repo}#${n}`, (a) => a.findingPage(repo, n), { enabled: role !== "viewer" });
  if (role === "viewer") return null;
  if (!d) return <Pending error={error} />;
  const f = d.finding;
  const sev = SEVERITY[f.severity];
  const st = FINDING_STATE[f.state];
  const left = <FindingAutoCraft d={d} />;
  const right = (
    <div className="px-4 py-3 md:px-6">
      <div className="text-xs font-semibold text-ink/55"><span className="inline-flex items-center gap-1.5"><GithubLogoIcon className="text-[14px]" /> On GitHub</span></div>
      {f.fixPr && f.fixPrUrl ? (
        <a href={safeHref(f.fixPrUrl)} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-md border border-line border-l-[3px] border-l-accent px-3 py-2.5 text-sm hover:bg-ink/[0.03]">
          <span className="code text-ink/60">#{f.fixPr}</span> Fix pull request
        </a>
      ) : (
        <p className="mt-3 text-sm text-ink/60">Not on GitHub. The finding stays private until a fix lands.</p>
      )}
    </div>
  );
  return (
    <div className={cn("flex min-h-0 flex-col", "h-full", phone && "overflow-y-auto")}>
      <header className="shrink-0 border-b border-line px-4 pb-3 pt-3 md:px-6">
        <Link to="/security" className="inline-flex h-7 items-center gap-1 text-xs text-ink/60 hover:text-ink max-md:h-11"><ArrowLeftIcon /> Security</Link>
        <h1 className="mt-1 text-lg font-semibold leading-6 md:text-xl md:leading-7">
          <ShieldWarningIcon className="mr-2 inline-block align-[-2px] text-bad" />
          <span className="code mr-2 text-ink/60">{f.repo} finding {f.number}</span>
          {f.title}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink/55">
          <Badge tone={sev.tone}>{sev.label}</Badge>
          <Badge tone={st.tone}>{st.label}</Badge>
          {f.urgent && <Badge tone="bad">Urgent</Badge>}
          <span className="code">{f.area}</span>
        </div>
        <div className="mt-2.5 rounded bg-ink/[0.04] px-3 py-2">
          {gaveUp(d.attempts, f.state) && <p className="flex items-center gap-1.5 text-sm font-medium text-warn"><WarningCircleIcon weight="fill" />{failedText(d.attempts)}</p>}
          <StatusLine status={d.status} />
        </div>
      </header>
      {phone ? (
        <>
          <div className="sticky top-0 z-20 flex gap-1 border-b border-line bg-panel px-4 py-2">
            {(["autocraft", "github"] as const).map((s) => <button key={s} role="radio" aria-checked={side === s} data-active={side === s} onClick={() => setSide(s)} className="chip h-9 flex-1 justify-center">{s === "autocraft" ? "AutoCraft" : "GitHub"}</button>)}
          </div>
          {side === "autocraft" ? left : right}
        </>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
          <div className="min-h-0 overflow-y-auto border-r border-line">{left}</div>
          <div className="min-h-0 overflow-y-auto bg-bg/40">{right}</div>
        </div>
      )}
    </div>
  );
}

const sec = "border-b border-line px-4 py-4 md:px-6";
const H = ({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) => <div className="mb-2 flex items-baseline gap-2"><h2 className="text-sm font-semibold">{children}</h2>{aside && <span className="ml-auto text-xs text-ink/55">{aside}</span>}</div>;

function FindingAutoCraft({ d }: { d: FindingPageData }) {
  const f = d.finding;
  return (
    <div>
      <div className="px-4 pt-3 text-xs font-semibold text-accent-ink md:px-6"><span className="inline-flex items-center gap-1.5"><RobotIcon /> In AutoCraft</span><span className="num float-right font-normal text-ink/55">{formatCost(d.costUsd)} in all</span></div>
      <div className="pt-3"><Question d={d} /></div>
      {d.rounds.length > 0 && (
        <section className={sec}>
          <H aside={`${d.rounds.length} ${d.rounds.length === 1 ? "round" : "rounds"}`}>Fix rounds</H>
          <ol className="space-y-2.5">
            {d.rounds.map((r) => (
              <li key={r.round} className="flex items-start gap-2.5 text-sm">
                <Badge tone={r.outcome === "passed" ? "ok" : "bad"} className="mt-px shrink-0">Round {r.round} {r.outcome}</Badge>
                <span className="min-w-0 flex-1 text-ink/85">{r.why}<TimeAgo iso={r.at} className="num mt-0.5 block text-xs text-ink/50" /></span>
                <span className="num shrink-0 text-xs text-ink/50">{formatCost(r.costUsd)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className={sec}>
        <H>Code</H>
        <ul className="space-y-1.5">
          {f.refs.map((r) => (
            <li key={`${r.path}:${r.line}`} className="text-sm">
              <a href={githubBlobUrl(f.repo, "main", r.path, r.line)} target="_blank" rel="noopener noreferrer" className="code break-all text-accent-ink hover:underline">{r.path}:{r.line}</a>
              {r.claim && <span className="block text-xs text-ink/60">{r.claim}</span>}
            </li>
          ))}
        </ul>
      </section>
      <section className={sec}>
        <H>Reach</H><p className="text-sm leading-6 text-ink/85">{f.reach}</p>
        <div className="mt-4"><H>Impact</H><p className="text-sm leading-6 text-ink/85">{f.impact}</p></div>
      </section>
      {f.verification && (
        <section className={sec}>
          <H>Verification</H>
          <div className="flex flex-wrap items-center gap-2 text-sm"><Badge tone={f.verification.kind === "test" ? "ok" : "neutral"}>{f.verification.kind === "test" ? "Test" : "Reasoning"}</Badge>{f.verification.score !== null && <Badge tone="ok"><span className="num">{f.verification.score}/10</span></Badge>}<span>{f.verification.result}</span></div>
          {f.verification.proposedTest && <CodeBlock className="mt-2" title="Proposed test" text={f.verification.proposedTest} lines={10} />}
          {f.scanTestResult && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><Badge tone={SCAN_TEST[f.scanTestResult.state].tone}>{SCAN_TEST[f.scanTestResult.state].label}</Badge>{f.scanTestResult.detail && <span className="text-ink/70">{f.scanTestResult.detail}</span>}</div>
              <CodeBlock className="mt-2" title="Scan test" text={f.scanTestResult.source} lines={10} />
            </>
          )}
        </section>
      )}
      <section className="px-4 py-4 md:px-6">
        <H aside={<span className="num">{formatCost(d.costUsd)}</span>}>History</H>
        <ol>
          {d.history.map((h) => (
            <li key={h.id} className="flex items-start gap-2.5 border-t border-line py-2 text-sm">
              <TimeAgo iso={h.at} className="num w-14 shrink-0 pt-px text-xs text-ink/50" />
              <div className="min-w-0 flex-1"><span className="font-medium">{h.step}</span> <span className="text-ink/70">{h.outcome}</span>{h.model && <div className="text-xs text-ink/50">{h.model}</div>}</div>
              {formatCost(h.costUsd) && <span className="num shrink-0 pt-px text-xs text-ink/55">{formatCost(h.costUsd)}</span>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
