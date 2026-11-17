import { useState } from "react";
import { CheckIcon, HourglassIcon, SpinnerIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { CardEdit, ConversationCard } from "../../api/types";
import { Button } from "../atoms/Button";
import { TimeAgo } from "../atoms/TimeAgo";
import { StepDraft } from "../molecules/StepDraft";
import { QueuedPress } from "../molecules/QueuedPress";
import { cn } from "../cn";
import { safeHref } from "../safeHref";

const area = "block w-full [field-sizing:content] max-h-[60vh] min-h-24 resize-none rounded border border-line bg-sunken px-2.5 py-2 text-sm leading-5 outline-none focus:border-accent/60";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * An action Opus proposed. A card with `settles` is a resolution (title, steps, what it settles, then the buttons);
 * a card without it is a smaller, quieter single action. Props only: the caller runs the calls.
 */
export function OpusCard({ card: a, operator, viewer, editInstructions = true, onRun, onDismiss, onDispute, onKeep, className }: {
  card: ConversationCard;
  operator: boolean;
  /** False: the fix-up instructions show without an Edit button (they go to the fix-up model, so only operators write them). */
  editInstructions?: boolean;
  /** Runs the card; `edit` holds the drafts (comment text, issue, fix-up instructions) that differ from the proposed ones. */
  onRun: (edit?: CardEdit) => Promise<unknown>;
  onDismiss: () => Promise<unknown>;
  /** The signed-in person, for a queued press: its presser and operators dismiss it, others who settle dispute it. */
  viewer?: { login: string };
  onDispute?: (reason: string) => Promise<unknown>;
  onKeep?: () => Promise<unknown>;
  className?: string;
}) {
  // The drafts being edited, and their edited values; a draft left out of `vals` shows the card's own.
  const [editing, setEditing] = useState<Set<"text" | "issue" | "fixup">>(new Set());
  const [vals, setVals] = useState<{ text?: string; issue?: { title: string; body: string }; instructions?: string }>({});
  const text = vals.text ?? a.text ?? "";
  const issue = vals.issue ?? (a.issue ? { title: a.issue.title, body: a.issue.body } : undefined);
  const instructions = vals.instructions ?? a.fixup?.instructions ?? "";
  const isEditing = (k: "text" | "issue" | "fixup") => editing.has(k);
  const toggle = (k: "text" | "issue" | "fixup") => {
    const was = editing.has(k);
    setEditing((e) => {
      const n = new Set(e);
      if (!n.delete(k)) n.add(k);
      return n;
    });
    if (was) setVals((v) => ({ ...v, ...(k === "text" ? { text: undefined } : k === "issue" ? { issue: undefined } : { instructions: undefined }) }));
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // A card that writes to GitHub needs a second press, like the decision page.
  const [armed, setArmed] = useState(false);
  const locked = busy || a.state === "running" || a.state === "queued";
  const proposed = a.state === "proposed";
  const resolution = a.settles !== undefined;

  const act = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await f();
      setEditing(new Set());
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const run = () => {
    if (a.writes && !armed) return setArmed(true);
    setArmed(false);
    const edit: CardEdit = {};
    if (a.text !== undefined && text !== a.text) edit.text = text;
    if (a.issue && issue && (issue.title !== a.issue.title || issue.body !== a.issue.body)) edit.issue = issue;
    if (a.fixup && instructions !== a.fixup.instructions) edit.instructions = instructions;
    return act(() => onRun(Object.keys(edit).length ? edit : undefined));
  };
  const btn = "max-md:h-11";

  return (
    <div
      className={cn(
        "rounded-md border",
        resolution ? "border-line-strong bg-raised px-3 py-3" : "border-line px-2.5 py-2",
        a.state === "dismissed" && "border-line bg-transparent",
        className,
      )}
    >
      <div className={cn("flex items-start gap-1.5 font-medium", resolution ? "text-sm" : "text-xs")}>
        {a.state === "done" && <CheckIcon className="mt-0.5 shrink-0 text-ok" />}
        {a.state === "failed" && <WarningCircleIcon className="mt-0.5 shrink-0 text-bad" />}
        {a.state === "queued" && <HourglassIcon className="mt-0.5 shrink-0 text-ink/50" />}
        {a.state === "running" && <SpinnerIcon className="mt-0.5 shrink-0 animate-spin text-ink/50" />}
        <span className={cn("min-w-0 flex-1 break-words", a.state === "dismissed" && "font-normal text-ink/45", a.state === "dismissed" && "line-through")}>{resolution ? a.headline : a.title}</span>
        {a.state === "done" && <span className="shrink-0 text-xs font-normal text-ok">Done</span>}
        {a.state === "failed" && <span className="shrink-0 text-xs font-normal text-bad">Failed</span>}
        {a.state === "queued" && <span className="shrink-0 text-xs font-normal text-ink/55">Queued</span>}
        {a.state === "running" && <span className="shrink-0 text-xs font-normal text-ink/55">Running…</span>}
        {a.state === "dismissed" && <span className="shrink-0 text-xs font-normal text-ink/45">Dismissed</span>}
      </div>
      {proposed && a.steps.length > 0 && (resolution || a.issue || a.fixup) && (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm leading-5 text-ink/80 marker:text-ink/40">
          {a.steps.map((st, i) => (
            <li key={i}>
              {st}
              {a.issue && issue && i === a.issue.step && (
                <StepDraft
                  editing={isEditing("issue")}
                  onToggle={() => toggle("issue")}
                  disabled={locked}
                  preview={
                    <div className="border-l-2 border-line-strong pl-3 text-ink/75">
                      <p className="font-medium text-ink/90">{issue.title}</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{issue.body}</p>
                    </div>
                  }
                  editor={
                    <div className="space-y-1.5">
                      <input value={issue.title} maxLength={120} disabled={locked} onChange={(e) => setVals((v) => ({ ...v, issue: { ...issue, title: e.target.value } }))} aria-label="Issue title" className="block h-8 w-full rounded border border-line bg-sunken px-2.5 text-sm outline-none focus:border-accent/60 max-md:h-11" />
                      <textarea value={issue.body} disabled={locked} onChange={(e) => setVals((v) => ({ ...v, issue: { ...issue, body: e.target.value } }))} rows={6} aria-label="Issue body" className={area} />
                    </div>
                  }
                />
              )}
              {a.fixup && i === a.fixup.step && (
                <StepDraft
                  editing={isEditing("fixup")}
                  onToggle={() => toggle("fixup")}
                  disabled={locked}
                  readOnly={!editInstructions}
                  preview={<blockquote className="whitespace-pre-wrap border-l-2 border-line-strong pl-3 text-ink/75">{instructions}</blockquote>}
                  editor={<textarea value={instructions} maxLength={1500} disabled={locked} onChange={(e) => setVals((v) => ({ ...v, instructions: e.target.value }))} rows={5} aria-label="Fix-up instructions" className={area} />}
                />
              )}
            </li>
          ))}
        </ol>
      )}
      {resolution && proposed && <p className="mt-2 text-xs text-ink/60">{a.settles}</p>}
      {a.text !== undefined && a.state !== "dismissed" &&
        (isEditing("text") ? (
          <textarea
            value={text}
            disabled={locked}
            onChange={(e) => setVals((v) => ({ ...v, text: e.target.value }))}
            rows={5}
            aria-label="Comment text"
            className={cn(area, "mt-2")}
          />
        ) : (
          <blockquote className={cn("mt-2 whitespace-pre-wrap border-l-2 border-line-strong pl-3 leading-5 text-ink/75", resolution ? "text-sm" : "text-xs")}>{text}</blockquote>
        ))}
      {a.editedBy && a.state !== "dismissed" && <p className="mt-1 text-xs text-ink/55">Edited by {a.editedBy}</p>}
      {a.state === "failed" && a.error && <p className="mt-2 text-xs text-bad">{a.error}</p>}
      {a.state === "done" && a.done && (
        <p className="mt-2 text-xs text-ink/55">
          {a.done.link ? (
            <a href={safeHref(a.done.link)} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
              {a.done.label}
            </a>
          ) : (
            a.done.label
          )}{" "}
          · <TimeAgo iso={a.done.at} />
          {a.by ? ` · ${a.by}` : ""}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      {a.state === "queued" && a.queued && viewer && onDispute && onKeep && (
        <QueuedPress by={a.by ?? ""} queued={a.queued} viewer={{ login: viewer.login, operator }} canSettle={a.canSettle} onDismiss={onDismiss} onDispute={onDispute} onKeep={onKeep} />
      )}
      {proposed && operator && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={resolution ? "primary" : "secondary"}
            className={cn(btn, armed && "border-bad bg-bad text-white hover:bg-bad/90")}
            disabled={locked || (!!a.issue && !issue?.title.trim())}
            onClick={() => void run()}
          >
            {armed ? `Confirm: ${a.writes}` : a.label}
          </Button>
          {armed && (
            <Button size="sm" variant="ghost" className={btn} disabled={busy} onClick={() => setArmed(false)}>
              Cancel
            </Button>
          )}
          {a.text !== undefined &&
            (isEditing("text") ? (
              <Button size="sm" variant="ghost" className={btn} disabled={locked} onClick={() => toggle("text")}>
                Cancel
              </Button>
            ) : (
              <Button size="sm" variant="secondary" className={btn} disabled={locked} onClick={() => toggle("text")}>
                Edit
              </Button>
            ))}
          <Button size="sm" variant="ghost" className={btn} disabled={busy} onClick={() => void act(onDismiss)}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
