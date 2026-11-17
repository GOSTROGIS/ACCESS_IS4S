// The item's story: people's and Opus's turns and the harness's work as one oldest-first list. Runs of minor harness lines fold into one line.
import { useState } from "react";
import { ArrowSquareOutIcon, ChatCircleIcon, CheckCircleIcon, GitMergeIcon, GithubLogoIcon, ListChecksIcon, PlusCircleIcon, RobotIcon, UploadSimpleIcon, UserIcon, WrenchIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { useApi } from "../../../api/client";
import type { Conversation, ItemPageData, OpusReviewEntry, ReviewVerdict, TimelineEntry } from "../../../api/types";
import { Badge } from "../../../ui/atoms/Badge";
import { Button } from "../../../ui/atoms/Button";
import { ErrorLine } from "../../../ui/atoms/ErrorLine";
import { ConfirmButton } from "../../../ui/molecules/ConfirmButton";
import { ItemRef } from "../../../ui/molecules/ItemRef";
import { Markdown } from "../../../ui/molecules/Markdown";
import { StoryLine } from "../../../ui/molecules/StoryLine";
import { cn } from "../../../ui/cn";
import { clock, nowMs } from "../../../lib/format";
import { formatCost } from "../../../lib/trace";
import { githubBlobUrl, githubCommitUrl } from "../../../lib/links";
import { useUser } from "../../../shell/UserContext";
import { canAct } from "../../../registry/permissions";
import { localActions } from "../../decisions/state";
import { markStarting } from "../starting";
import { useJump } from "./ItemPage";

const ICON: Record<TimelineEntry["icon"], Icon> = { review: ListChecksIcon, fixup: WrenchIcon, merge: GitMergeIcon, push: UploadSimpleIcon, github: GithubLogoIcon, check: CheckCircleIcon, job: RobotIcon, chat: ChatCircleIcon, person: UserIcon };
const TRIGGER: Record<string, string> = { "new-head": "new head", discussion: "discussion", operator: "asked by an operator", base: "base branch changed", "model-change": "model change" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const dateOf = (iso: string) => {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};
const FOLD_CHARS = 500;
const RUN_GAP_MS = 20 * 60_000;

type Row = { t: "line"; e: TimelineEntry } | { t: "run"; es: TimelineEntry[] };

/** Consecutive minor harness lines become one run; a single one stays a line. */
function rowsOf(es: TimelineEntry[]): Row[] {
  const rows: Row[] = [];
  let run: TimelineEntry[] = [];
  const flush = () => {
    if (run.length === 1) rows.push({ t: "line", e: run[0]! });
    else if (run.length) rows.push({ t: "run", es: run });
    run = [];
  };
  for (const e of es) {
    // A long pause ends a run: the summary then spans one working spell.
    if (run.length && Date.parse(e.at) - Date.parse(run[run.length - 1]!.at) > RUN_GAP_MS) flush();
    if (e.kind === "harness" && !e.major) run.push(e);
    else {
      flush();
      rows.push({ t: "line", e });
    }
  }
  flush();
  return rows;
}

export function Story({ d, flash, conv }: { d: ItemPageData; flash: string | null; conv: Conversation | undefined }) {
  const rows = rowsOf(d.timeline);
  const today = dayKey(new Date(nowMs()).toISOString());
  let prevDay = "";
  const staff = useUser().role !== "viewer";
  const dated = (at: string) => {
    const k = dayKey(at);
    const show = k !== today && k !== prevDay;
    prevDay = k;
    return show ? dateOf(at) : undefined;
  };
  return (
    <section aria-label="What happened" className="px-4 pb-2 pt-3 md:px-6">
      {staff && d.costUsd > 0 && <p className="num mb-1 text-right text-xs text-ink/45">{formatCost(d.costUsd)} in all</p>}
      <ol>
        {rows.map((r) =>
          r.t === "line" ? (
            <Line key={r.e.id} e={r.e} d={d} conv={conv} date={dated(r.e.at)} flash={flash} />
          ) : (
            <Run key={r.es[0]!.id} es={r.es} d={d} conv={conv} date={dated(r.es[0]!.at)} flash={flash} />
          ),
        )}
      </ol>
    </section>
  );
}

function Run({ es, d, conv, date, flash }: { es: TimelineEntry[]; d: ItemPageData; conv: Conversation | undefined; date?: string; flash: string | null }) {
  const cost = es.reduce((s, e) => s + (e.costUsd ?? 0), 0);
  const first = es[0]!, last = es[es.length - 1]!;
  const span = clock(first.at) === clock(last.at) ? clock(first.at) : `${clock(first.at)}–${clock(last.at)}`;
  const hit = flash !== null && es.some((e) => flash === `hist-${e.id}`);
  const words = [`${es.length} steps`, span, formatCost(cost)].filter(Boolean).join(" · ");
  return (
    <StoryLine time={clock(first.at)} date={date} icon={RobotIcon} text={words} open={hit}>
      <ol className="border-l border-line pl-2">
        {es.map((e) => <Line key={e.id} e={e} d={d} conv={conv} flash={flash} nested />)}
      </ol>
    </StoryLine>
  );
}

function Line({ e, d, conv, date, flash, nested }: { e: TimelineEntry; d: ItemPageData; conv: Conversation | undefined; date?: string; flash: string | null; nested?: boolean }) {
  const user = useUser();
  const viewer = user.role === "viewer";
  const turn = e.kind !== "harness";
  const review = e.reviewId ? [d.reviews.latest, ...d.reviews.earlier].find((r) => r?.id === e.reviewId) ?? null : null;
  const cost = viewer ? null : formatCost(e.costUsd);
  const operator = user.role === "operator" && canAct(user, [d.repo]);
  const hasDetail = !!(e.body || e.lines.length || e.calls.length || review || e.jobId !== null || e.commit || e.githubId || e.feedback);
  return (
    <StoryLine
      id={`hist-${e.id}`}
      time={clock(e.at)}
      date={nested ? undefined : date}
      icon={ICON[e.icon]}
      tone={e.tone}
      actor={e.kind === "harness" ? undefined : e.actor}
      actorTone={e.kind === "opus" ? "ours" : "person"}
      text={e.text}
      cost={cost}
      turn={turn}
      open={flash === `hist-${e.id}`}
      className={cn(flash === `hist-${e.id}` && "bg-accent/10")}
      actions={e.preapproval && operator ? <PreapprovalActions repo={d.repo} number={d.number} p={e.preapproval} /> : undefined}
    >
      {hasDetail ? <Detail e={e} d={d} review={review} conv={conv} operator={operator} /> : undefined}
    </StoryLine>
  );
}

/** Try again on a failed pre-approved merge, Cancel while it runs. */
function PreapprovalActions({ repo, number, p }: { repo: string; number: number; p: NonNullable<TimelineEntry["preapproval"]> }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = (f: () => Promise<unknown>, started?: string) => async () => {
    setBusy(true);
    setError(undefined);
    try {
      await f();
      if (started) markStarting(repo, number, started);
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };
  if (!p.latest) return null;
  return (
    <>
      {p.state === "failed" && <Button size="sm" variant="secondary" loading={busy} className="max-md:h-11" onClick={() => void run(() => api.conversations.retryPreapproval(repo, number), "the pre-approved merge")()}>Try again</Button>}
      {["fixup", "review", "ci", "queued"].includes(p.state) && <ConfirmButton label="Cancel" confirmLabel="Confirm cancel" idle="secondary" loading={busy} onConfirm={() => void run(() => api.conversations.cancelPreapproval(repo, number))()} />}
      <ErrorLine error={error} className="basis-full text-xs" />
    </>
  );
}

function Folded({ text, markdown }: { text: string; markdown: boolean }) {
  const [all, setAll] = useState(text.length <= FOLD_CHARS);
  const shown = all ? text : `${text.slice(0, FOLD_CHARS).trimEnd()}…`;
  return (
    <div className="max-w-prose leading-6 text-ink/85">
      {markdown ? <Markdown source={shown} /> : <p className="whitespace-pre-wrap break-words">{shown}</p>}
      {!all && <button onClick={() => setAll(true)} className="text-xs font-medium text-accent-ink hover:underline max-md:min-h-11">More</button>}
    </div>
  );
}

const linkCls = "inline-flex h-7 items-center gap-1 text-xs font-medium text-accent-ink hover:underline max-md:h-11";

function Detail({ e, d, review, conv, operator }: { e: TimelineEntry; d: ItemPageData; review: OpusReviewEntry | null; conv: Conversation | undefined; operator: boolean }) {
  const jump = useJump();
  const viewer = useUser().role === "viewer";
  return (
    <div className="space-y-2 pt-0.5">
      {review && <ReviewDetail repo={d.repo} r={review} viewer={viewer} />}
      {e.body && <Folded text={e.body} markdown={e.markdown} />}
      {e.lines.length > 0 && <ul className="space-y-0.5 text-xs leading-5 text-ink/65">{e.lines.map((l, i) => <li key={i} className="break-words">{l}</li>)}</ul>}
      {e.calls.length > 0 && (
        <ul className="space-y-0.5 border-l border-line pl-3 text-xs text-ink/60">
          {e.calls.map((c, i) => <li key={i} className="flex gap-2"><span className="min-w-0 flex-1">{c.label}</span>{formatCost(c.costUsd) && <span className="num">{formatCost(c.costUsd)}</span>}</li>)}
        </ul>
      )}
      {e.feedback && <FeedbackActions e={e} d={d} conv={conv} operator={operator} />}
      <div className="flex flex-wrap items-center gap-x-4">
        {e.jobId !== null && !viewer && <Link to={`/pipeline/${e.jobId}`} className={linkCls}>Job #{e.jobId} ›</Link>}
        {e.commit && <a href={githubCommitUrl(d.repo, d.number, e.commit)} target="_blank" rel="noopener noreferrer" className={linkCls}><span className="code">{e.commit}</span> on GitHub <ArrowSquareOutIcon /></a>}
        {e.githubId && <button onClick={() => jump.to("github", `gh-${e.githubId}`)} className={linkCls}>On GitHub ›</button>}
      </div>
    </div>
  );
}

/** A maintainer's post on a question: the operator includes it for Opus, the author retracts a pick, an operator takes a write-permission pick as theirs. */
function FeedbackActions({ e, d, conv, operator }: { e: TimelineEntry; d: ItemPageData; conv: Conversation | undefined; operator: boolean }) {
  const api = useApi();
  const user = useUser();
  const f = e.feedback!;
  const include = conv?.includes.find((x) => x.source === f.source);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };
  const mine = e.actor === user.login;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {operator && !mine && (
        <button
          onClick={() => void act(() => api.conversations.include(d.repo, d.number, f.source, !include))}
          disabled={busy || include?.sent}
          aria-pressed={!!include}
          className={cn("inline-flex min-h-8 items-center gap-1.5 rounded border px-2 text-xs font-medium disabled:opacity-60 max-md:min-h-11", include ? "border-accent/50 bg-accent/[0.08] text-accent-ink" : "border-line-strong text-ink/70 hover:bg-ink/[0.05]")}
        >
          {include ? <CheckCircleIcon className="text-[14px]" /> : <PlusCircleIcon className="text-[14px]" />}
          {include?.sent ? "Sent to Opus" : include ? "Included" : "Include for Opus"}
        </button>
      )}
      {f.open && f.pick && mine && <button onClick={() => void act(() => api.decisions.retract(f.decisionId))} className={linkCls}>Retract</button>}
      {f.open && f.pick && f.write && operator && <button onClick={() => localActions.setPick(f.decisionId, f.pick!)} className="inline-flex min-h-8 items-center rounded border border-line-strong px-2 text-xs font-medium hover:border-accent/60 hover:text-accent-ink max-md:min-h-11">Use this answer</button>}
      <ErrorLine error={error} className="basis-full text-xs" />
    </div>
  );
}

const VERDICT_LABEL: Record<ReviewVerdict, string> = { take: "Take", "take-fix": "Take with fixes", hold: "Hold", close: "Close" };

function ReviewDetail({ repo, r, viewer }: { repo: string; r: OpusReviewEntry; viewer: boolean }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/55">
        <Badge>{VERDICT_LABEL[r.verdict]}</Badge>
        <span>of <span className="code">{r.head}</span> ({r.current ? "current head" : "head has moved"})</span>
        {r.why && <span>· {r.why} ({TRIGGER[r.trigger]})</span>}
      </p>
      {r.summary && <Folded text={r.summary} markdown={false} />}
      {r.blockedBy.length > 0 && (
        <div>
          <div className="text-xs font-medium text-ink/65">Must land first</div>
          <ul className="mt-1 space-y-1">{r.blockedBy.map((b) => <li key={`${b.repo}#${b.number}`}><ItemRef repo={b.repo} number={b.number} title={null} size="sm" /></li>)}</ul>
        </div>
      )}
      {!viewer && r.fixes.length > 0 && <List title="Fixes" items={r.fixes} />}
      {!viewer && r.risks.length > 0 && <List title="Risks" items={r.risks} />}
      {!viewer && r.claims.length > 0 && (
        <ul className="space-y-1.5">
          {r.claims.map((c) => (
            <li key={`${c.path}:${c.line}`} className="text-xs leading-5">
              <a href={githubBlobUrl(repo, r.head, c.path, c.line)} target="_blank" rel="noopener noreferrer" className="code break-all text-accent-ink hover:underline">{c.path}:{c.line}</a>
              <span className="text-ink/65"> {c.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const List = ({ title, items }: { title: string; items: string[] }) => (
  <div>
    <div className="text-xs font-medium text-ink/65">{title}</div>
    <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-ink/85">{items.map((i) => <li key={i}>{i}</li>)}</ul>
  </div>
);

