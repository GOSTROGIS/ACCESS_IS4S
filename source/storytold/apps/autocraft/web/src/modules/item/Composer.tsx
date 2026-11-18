import { useState } from "react";
import { PaperPlaneRightIcon } from "@phosphor-icons/react";
import { markStarting } from "./starting";
import { useApi } from "../../api/client";
import type { Decision, DecisionChoices, RepoName } from "../../api/types";
import { Button } from "../../ui/atoms/Button";
import { FeedbackBox } from "../decisions/FeedbackBox";
import { localActions } from "../decisions/state";

export const COMPOSER_ID = "opus-composer";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The thread's one input, stuck to the bottom of the page (above the phone tab bar): operators write to Opus,
 * maintainers who cannot act leave feedback on the open question, viewers get nothing.
 */
export function Composer({ repo, number, operator, commenter, exists, pending, feedbackOn, choices, opusTurns, flush }: {
  /** The parent has no side padding to cancel: the bar spans it. */
  flush?: boolean;
  repo: RepoName;
  number: number;
  operator: boolean;
  commenter: boolean;
  exists: boolean;
  pending: boolean;
  /** The open decision the feedback box belongs to. */
  feedbackOn?: Decision;
  /** The item's current choices: a message to Opus folds them at once, since Opus is about to change them. */
  choices?: DecisionChoices | null;
  opusTurns?: number;
}) {
  const api = useApi();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const send = async (ask: boolean) => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(undefined);
    const item = `${repo}#${number}`;
    if (ask && choices) localActions.startUpdating(item, { decisionId: choices.decisionId, choicesId: choices.id, opusTurns: opusTurns ?? 0 });
    try {
      await api.conversations.say(repo, number, text, ask ? undefined : false);
      setDraft("");
      if (ask) markStarting(repo, number, "assistant reply");
    } catch (e) {
      // Nothing was sent: the old choices come back.
      localActions.stopUpdating(item);
      setError(message(e));
    } finally {
      setSending(false);
    }
  };
  const shell = flush ? "sticky bottom-0 z-10 mt-4 border-t border-line bg-panel px-4 py-2.5 md:px-6" : "sticky bottom-0 z-10 -mx-4 mt-4 border-t border-line bg-panel px-4 py-2.5 md:-mx-6 md:px-6";
  if (operator)
    return (
      <div className={shell}>
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <textarea
            id={COMPOSER_ID}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(true);
            }}
            rows={2}
            placeholder={exists ? "Reply to the assistant" : "Ask about this item"}
            aria-label="Message to the assistant"
            className="block min-w-0 flex-1 resize-none rounded border border-line bg-sunken px-2.5 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-accent/60"
          />
          <div className="flex shrink-0 justify-end gap-2 md:flex-col md:gap-1.5">
            <Button variant="primary" className="max-md:h-11" icon={PaperPlaneRightIcon} loading={sending} disabled={!draft.trim() || pending} onClick={() => void send(true)}>
              Send
            </Button>
            <Button variant="secondary" className="max-md:h-11" disabled={!draft.trim() || sending} onClick={() => void send(false)}>
              Post without a reply
            </Button>
          </div>
        </div>
        {error && <p className="mt-1.5 text-xs text-bad">{error}</p>}
      </div>
    );
  if (commenter && feedbackOn)
    return (
      <div className={shell}>
        <FeedbackBox d={feedbackOn} />
      </div>
    );
  return null;
}
