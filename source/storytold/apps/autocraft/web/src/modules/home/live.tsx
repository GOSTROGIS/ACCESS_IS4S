// The top of a project page: what the pipeline is doing in the project right now, and what merges next.
import { Link } from "react-router-dom";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "../../api/client";
import type { MergeWait } from "../../api/types";
import { useNow } from "../../lib/useNow";
import { num } from "../../lib/format";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { EntryRow } from "../../ui/molecules/EntryRow";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { Section } from "../../ui/molecules/Section";
import { ErrorLine } from "../admin/parts";

const SHOWN = 8;

/** The newest units of work of the page's project (every repo for All projects), running ones marked; it follows the live feed. */
export function ProjectLive({ to }: { to: string }) {
  const { data, error } = useQuery("now", (a) => a.now());
  const entries = data?.entries ?? [];
  const running = entries.filter((e) => e.state === "running").length;
  // Running entries show their elapsed time, so the list ticks while any runs.
  useNow(running ? 1000 : undefined);
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <span className="relative flex size-2" aria-hidden>
            {running > 0 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />}
            <span className={running > 0 ? "relative inline-flex size-2 rounded-full bg-ok" : "relative inline-flex size-2 rounded-full bg-ink/30"} />
          </span>
          Live
          {running > 0 && <span className="text-xs font-normal text-ink/55">{running} running</span>}
        </span>
      }
      to={to}
      linkLabel="Full feed"
    >
      <ErrorLine error={error?.message} />
      {data && entries.length === 0 && <p className="border-t border-line py-3 text-sm text-ink/55">Nothing has happened in this project lately.</p>}
      {entries.length > 0 && (
        <ul className="max-h-[360px] overflow-y-auto rounded-md border border-line">
          {entries.slice(0, SHOWN).map((e) => (
            <EntryRow key={e.key} entry={e} />
          ))}
        </ul>
      )}
    </Section>
  );
}

const WAIT_TONE: Record<MergeWait, Tone> = { ready: "ok", refused: "bad", ci: "neutral", premerge: "neutral", verify: "neutral", "re-review": "neutral", "batch-check": "accent", "batch-ci": "accent", held: "warn" };

/** The PRs that merge next in the page's project, in merge order, with what each waits on. */
export function ProjectMergeQueue({ repo }: { repo: string | undefined }) {
  const { data, error } = useQuery("queue-page:merge:project", (a) => a.queuePage({ tab: "merge", repos: "pipeline", limit: 1 }));
  const next = data?.nextMerges ?? [];
  const to = repo ? `/next?repo=${encodeURIComponent(repo)}` : "/next";
  return (
    <Section title="Merge queue" count={data?.counts.merge} to={to} linkLabel="Whole queue">
      <ErrorLine error={error?.message} />
      {data && next.length === 0 && <p className="border-t border-line py-3 text-sm text-ink/55">{data.counts.merge ? "No PR is lined up to merge next." : "No PR is in the merge queue."}</p>}
      {next.length > 0 && (
        <ol className="rounded-md border border-line">
          {next.map((n, i) => (
            <li key={`${n.repo}#${n.number}`} className="relative flex items-start gap-2.5 border-b border-line px-3 py-2 last:border-0 hover:bg-ink/[0.03] max-md:min-h-11">
              <span className="num mt-0.5 w-4 shrink-0 text-xs text-ink/45">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <ItemRef repo={n.repo} number={n.number} kind="pr" state="open" title={n.title} stretch github={false} size="sm" />
                <div className="mt-1">
                  <Badge tone={WAIT_TONE[n.waitsFor]}>{n.label}</Badge>
                </div>
              </div>
              <CaretRightIcon className="mt-1 shrink-0 text-ink/30" aria-hidden />
            </li>
          ))}
        </ol>
      )}
      {data && data.counts.merge > next.length && (
        <Link to={to} className="mt-2 block text-xs text-ink/55 hover:text-ink">
          {next.length ? `${num(data.counts.merge - next.length)} more in the queue` : `${num(data.counts.merge)} in the queue`}
        </Link>
      )}
    </Section>
  );
}
