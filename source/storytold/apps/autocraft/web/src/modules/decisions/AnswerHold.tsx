import { useState } from "react";
import { ArrowUUpLeftIcon, CheckIcon, FlagIcon } from "@phosphor-icons/react";
import { useApi } from "../../api/client";
import type { Decision } from "../../api/types";
import { Button } from "../../ui/atoms/Button";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { Textarea } from "../../ui/atoms/Textarea";
import { clock } from "../../lib/format";
import { useWrite } from "../../lib/hooks";
import { useUser } from "../../shell/UserContext";
import { canActOn } from "./access";

/** Answered and not yet applied by the pipeline, and something for the viewer to see or do about it. */
export const isHeldAnswer = (d: Decision): boolean => !!d.answer && !d.appliedAt && d.answer !== "backlog" && (d.undoable || !!d.dispute || !!d.orphaned);

const labelOf = (d: Decision): string => d.options.find((o) => o.key === d.answer)?.label ?? d.answer ?? "";

/**
 * An answered question the pipeline has not applied yet. Whoever did not answer reads who chose what and when; people who settle can
 * dispute it with a reason. A disputed answer waits for its answerer or an operator to keep it or take it back.
 */
export function AnswerHold({ d }: { d: Decision }) {
  const user = useUser();
  const api = useApi();
  const write = useWrite();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const operator = user.role === "operator";
  const mine = d.answeredBy?.toLowerCase() === user.login.toLowerCase();
  const settler = canActOn(user, [d]);
  const answer = labelOf(d);
  const chose = `${d.answeredBy} chose ${answer}${d.answeredAt ? ` at ${clock(d.answeredAt)}` : ""}`;

  if (d.dispute) {
    const resolver = (mine || operator) && settler;
    return (
      <div className="space-y-2 text-sm">
        <p className="flex items-start gap-1.5 font-medium text-warn"><FlagIcon className="mt-1 shrink-0" weight="fill" /><span className="min-w-0">{d.dispute.by} disputed this answer at {clock(d.dispute.at)}</span></p>
        <p className="text-ink/80">{chose}.</p>
        {d.dispute.reason && <p className="break-words text-ink/80">&ldquo;{d.dispute.reason}&rdquo;</p>}
        <p className="text-xs text-ink/55">Nothing is written to GitHub until it is kept or taken back.</p>
        {resolver && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="md" variant="primary" icon={CheckIcon} loading={write.busy === "keep"} onClick={() => void write.run("keep", () => api.decisions.keepAnswer(d.id))} className="max-md:h-11">Keep answer</Button>
            <Button size="md" icon={ArrowUUpLeftIcon} loading={write.busy === "undo"} onClick={() => void write.run("undo", () => api.decisions.undo(d.id))} className="max-md:h-11">Undo</Button>
          </div>
        )}
        <ErrorLine error={write.error} className="text-xs" />
      </div>
    );
  }

  if (d.orphaned) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-ink/85">{chose}.</p>
        <p className="text-xs text-ink/55">{d.answeredBy} can no longer settle this, so the answer is not applied.</p>
        {operator && settler && (
          <Button size="md" icon={ArrowUUpLeftIcon} loading={write.busy === "undo"} onClick={() => void write.run("undo", () => api.decisions.undo(d.id))} className="max-md:h-11">Reassign</Button>
        )}
        <ErrorLine error={write.error} className="text-xs" />
      </div>
    );
  }

  const send = async () => {
    if (await write.run("dispute", () => api.decisions.dispute(d.id, reason.trim()))) { setAsking(false); setReason(""); }
  };
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-ink/85">{chose}.</p>
        {settler && !mine && !asking && (
          <Button size="sm" icon={FlagIcon} onClick={() => setAsking(true)} className="-mt-1 max-md:h-9">Dispute</Button>
        )}
      </div>
      {asking && (
        <div className="space-y-2">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this answer wrong?" aria-label="Reason for the dispute" maxLength={2000} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="md" variant="primary" disabled={!reason.trim()} loading={write.busy === "dispute"} onClick={() => void send()} className="max-md:h-11">Send dispute</Button>
            <Button size="md" variant="ghost" onClick={() => { setAsking(false); write.setError(null); }} className="max-md:h-11">Cancel</Button>
          </div>
        </div>
      )}
      <ErrorLine error={write.error} className="text-xs" />
    </div>
  );
}

/** The held answers of an item the viewer sees as cards: the answerer sees an undo elsewhere, so only while the answer is disputed or orphaned. */
export const visibleHeld = (ds: Decision[], login: string): Decision[] =>
  ds.filter((d) => isHeldAnswer(d) && (d.dispute || d.orphaned || d.answeredBy?.toLowerCase() !== login.toLowerCase()));

/** The held answers of an item as cards, in the style of the open question's card. */
export function HeldAnswers({ ds }: { ds: Decision[] }) {
  const user = useUser();
  const shown = visibleHeld(ds, user.login);
  if (!shown.length) return null;
  return (
    <section className="space-y-2" aria-label="Answered">
      {shown.map((d) => (
        <article key={d.id} className="rounded-lg border border-line-strong bg-raised px-3 py-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs text-ink/55">
            <span className="font-semibold text-ink/75">{(d.dispute || d.orphaned) && (user.role === "operator" || d.answeredBy?.toLowerCase() === user.login.toLowerCase()) ? "Needs you" : "Answered"}</span>
          </div>
          <p className="mb-2 text-pretty text-[15px] font-semibold leading-6">{d.question}</p>
          <AnswerHold d={d} />
        </article>
      ))}
    </section>
  );
}
