import { useEffect, useState } from "react";
import { QueuedPress } from "../../ui/molecules/QueuedPress";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useApi, useQuery } from "../../api/client";
import type { Decision, DecisionChoices } from "../../api/types";
import { useUser } from "../../shell/UserContext";
import { KindTag } from "../decisions/parts";
import { Refs } from "../decisions/Refs";
import { AnswerNotice } from "../decisions/AnswerNotice";
import { ChoiceGroup } from "./ChoiceGroup";
import { canComment } from "../../registry/permissions";
import { useFolded, useLocal } from "../decisions/state";
import { canActOn } from "../decisions/access";
import { DecisionChips, DecisionDetails, DecisionSummary } from "../decisions/DecisionBlocks";
import { DuplicateGroup, RiskList } from "../decisions/Group";
import { RecommendationLine } from "../../ui/molecules/RecommendationLine";
import { ActionTag } from "../../ui/atoms/ActionTag";
import { cn } from "../../ui/cn";
import { servingLabel } from "../../lib/serving";

/** Every decision about one item (its own, or a group that lists it), open first. The key is a live topic prefix. */
export function useItemDecisions(repo: string, number: number) {
  const q = useQuery(`item-decisions:${repo}#${number}`, async (api) => {
    const filter = { repo: [repo], number };
    const [open, snoozed, answered] = await Promise.all([api.decisions.list({ ...filter, status: "open" }), api.decisions.list({ ...filter, status: "snoozed" }), api.decisions.list({ ...filter, status: "answered" })]);
    // A disputed answer is in both the open and the answered list.
    const seen = new Set<string>();
    return [...open.decisions, ...snoozed.decisions, ...answered.decisions].filter((d) => !seen.has(d.id) && !!seen.add(d.id));
  });
  const data = useFolded(q.data);
  return { ...q, data };
}

/**
 * The item's open question under the status bar: one card, folded to the question and Opus's recommended answer; opening it shows the
 * other answers, the extras, the note box and Opus's reasoning behind "Why". Further open questions are one line each and swap in when pressed.
 * A just-answered question shows its answer notice until the story has it.
 */
export function OpenQuestions({ ds, choices, updating }: { ds: Decision[]; choices?: DecisionChoices | null; updating?: string }) {
  const loc = useLocal();
  const [sel, setSel] = useState(0);
  const open = ds.filter((d) => !d.answer);
  const notices = loc.justAnswered.filter((a) => ds.some((d) => d.id === a.id));
  if (!open.length && !notices.length) return null;
  const shown = open[Math.min(sel, open.length - 1)];
  const others = open.filter((d) => d !== shown);
  return (
    <section className="space-y-2" aria-label="Needs you">
      {notices.map((a) => (
        <AnswerNotice key={a.id} entry={a} className="rounded-md border border-line px-3" />
      ))}
      {shown && <HoldCard key={shown.id} d={shown} choices={choices === undefined ? undefined : choices?.decisionId === shown.id ? choices : null} updating={updating === shown.id} />}
      {others.map((d) => (
        <button key={d.id} onClick={() => setSel(open.indexOf(d))} className="flex w-full items-start gap-1.5 text-left text-xs text-ink/60 hover:text-ink max-md:min-h-11">
          <CaretRightIcon className="mt-0.5 shrink-0" />
          <span className="min-w-0"><Refs text={d.question} repo={d.repo} /></span>
        </button>
      ))}
    </section>
  );
}

/** What Opus recommends as the label and the one line of what it does; null without a recommendation. */
function recommended(d: Decision, choices: DecisionChoices | null | undefined): { label: string; effect: string | null; tags: DecisionChoices["cores"][number]["writes"] } | null {
  if (choices) {
    const core = choices.cores.find((c) => c.key === choices.pick?.core);
    return core ? { label: core.label, effect: core.autocraft, tags: core.writes } : null;
  }
  const o = d.options.find((x) => x.key === d.recommended);
  return o ? { label: o.label, effect: o.hint ?? null, tags: [] } : null;
}

function HoldCard({ d, choices, updating }: { d: Decision; choices?: DecisionChoices | null; updating: boolean }) {
  const user = useUser();
  const api = useApi();
  const commenter = canComment(user);
  const [openCard, setOpenCard] = useState(false);
  // Opening a decision marks it as being looked at by this person.
  useEffect(() => {
    if (!d.answer && commenter) void api.decisions.claim(d.id);
  }, [api, d.id, d.answer, commenter]);
  // A card from another person is applying an answer: nobody answers meanwhile.
  const queued = d.queued ?? null;
  const applying = !queued && d.settling && d.settling.toLowerCase() !== user.login.toLowerCase() ? d.settling : null;
  const actor = canActOn(user, [d]) && !applying && !queued;
  const preparing = (d.preparing || updating) && !d.answer;
  const loading = choices === undefined && d.number !== null && d.group.length === 0;
  const rec = preparing || loading ? null : recommended(d, choices);
  const why = choices?.pick?.reason ?? d.recommendedReason;
  return (
    <article id={`decision-${d.id}`} className="scroll-mt-3 rounded-lg border border-line-strong bg-raised px-3 py-3">
      <div className="flex items-center gap-2 text-xs text-ink/55">
        <span className="font-semibold text-ink/75">Needs you</span>
        <KindTag kind={d.kind} batch={d.number === null ? d.items.length : undefined} />
        {d.snoozed && <span>Snoozed until new activity</span>}
      </div>
      <p className="mt-1.5 text-pretty text-[15px] font-semibold leading-6"><Refs text={d.question} repo={d.repo} /></p>
      {queued ? (
        <QueuedPress by={queued.by} queued={queued} viewer={{ login: user.login, operator: user.role === "operator" }} canSettle={canActOn(user, [d])}
          onDismiss={() => api.conversations.dismissCard(queued.card)} onDispute={(reason) => api.conversations.disputeCard(queued.card, reason)} onKeep={() => api.conversations.keepCard(queued.card)} />
      ) : applying ? (
        <p className="mt-2 text-sm text-ink/70">{applying} is applying their answer</p>
      ) : preparing ? (
        <p className="mt-2 text-sm text-ink/55">{d.preparing ? "The assistant is preparing the options" : "The assistant is updating the options"}</p>
      ) : loading ? null : (
        <>
          <button
            type="button"
            disabled={!actor}
            aria-expanded={openCard}
            onClick={() => setOpenCard(!openCard)}
            className={cn("mt-2.5 block w-full min-w-0 rounded-md border px-3 py-2.5 text-left max-md:min-h-11", actor ? "border-accent/60 bg-accent/[0.07] hover:bg-accent/[0.11]" : "border-line bg-ink/[0.03]")}
          >
            <span className="flex items-baseline gap-2 text-sm font-semibold">
              <span className="min-w-0 flex-1 break-words">{rec?.label ?? (actor ? "Choose an answer" : "No recommendation yet")}</span>
              {rec && <span className="shrink-0 text-2xs font-normal text-accent-ink">{servingLabel(choices ? choices.serving : d.serving, "Opus")} recommends</span>}
              {actor && (openCard ? <CaretDownIcon className="shrink-0 text-ink/45" /> : <CaretRightIcon className="shrink-0 text-ink/45" />)}
            </span>
            {rec?.effect && <span className="mt-0.5 block text-xs leading-5 text-ink/65">{rec.effect}</span>}
            {rec && rec.tags.length > 0 && !openCard && <span className="mt-1.5 flex flex-wrap gap-1">{rec.tags.map((t) => <ActionTag key={t} tag={t} />)}</span>}
          </button>
          {openCard && (
            <div className="mt-3 space-y-3">
              {d.group.length > 0 && <DuplicateGroup d={d} />}
              {why && <Why text={why} d={d} choices={choices} />}
              <ChoiceGroup d={d} user={user} choices={choices} />
              <div className="flex flex-wrap items-center gap-1.5"><DecisionChips d={d} /></div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

/** Opus's reasoning, the summary, risks and facts, behind one fold. */
function Why({ text, d, choices }: { text: string; d: Decision; choices?: DecisionChoices | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex h-7 items-center gap-1 text-xs font-medium text-ink/65 hover:text-ink max-md:h-11">
        <CaretRightIcon className={cn("text-[10px] transition-transform duration-fast", open && "rotate-90")} /> Why
      </button>
      {open && (
        <div className="animate-fadeIn">
          <p className="mt-1 text-sm leading-[21px] text-ink/85">{text}</p>
          <DecisionSummary d={d} />
          {d.risks.length > 0 && <RiskList risks={d.risks} />}
          {!choices && <div className="mt-2"><RecommendationLine d={d} /></div>}
          <DecisionDetails d={d} />
        </div>
      )}
    </div>
  );
}
