// The question of Discord attention signals: does a message that names a tracked item ask for attention on it? Pure; no
// Node imports (the Prompts page imports it).
import { flagBand, type FlagBand } from "../classify/parse.ts";
import { wholeReplyJson } from "../core/reply-json.ts";

/** Jev's yes-probability from which a message counts as asking; below JEV_FLAG_NO (0.3) it does not, and Haiku decides in between. */
export const SIGNAL_JEV_YES = 0.8;
export const SIGNAL_TEXT_CHARS = 1000;
export const SIGNAL_TITLE_CHARS = 200;

/** `text` is the message as written; it is used for the one call and dropped. */
export type SignalAsk = { ref: string; title: string; text: string };

export const SIGNAL_QUESTION = "Does this chat message ask for attention on the GitHub item named in the state: a review, a merge, an answer, a decision, or whether anyone is looking at it? A message that only mentions, links or describes the item does not.";

export const SAMPLE_SIGNAL: SignalAsk[] = [{ ref: "photocraft#7", title: "Export to WebP ignores the quality setting", text: "Can someone take a look at photocraft#7? It has been open for two weeks." }];

const clean = (a: SignalAsk): SignalAsk => ({ ref: a.ref, title: a.title.slice(0, SIGNAL_TITLE_CHARS), text: a.text.slice(0, SIGNAL_TEXT_CHARS) });

/** The data of one call, as one JSON string: Jev's request state and the Haiku prompt's data block. */
export const signalState = (a: SignalAsk): string => JSON.stringify(clean(a), null, 1).replace(/</g, "\\u003c");

export const signalBand = (p: number): FlagBand => flagBand(p, SIGNAL_JEV_YES);

/** Jev's answer: the yes-probability, or null when the answer has no number from 0 to 1. */
export function jevSignal(answers: unknown): number | null {
  const p = (answers as { asks?: { noul?: unknown } } | undefined)?.asks?.noul;
  return typeof p === "number" && p >= 0 && p <= 1 ? p : null;
}

/** Haiku's reply: `{"asks": true|false}` as its one JSON value; null otherwise. */
export function parseSignal(text: string): boolean | null {
  const v = (wholeReplyJson(text) as { asks?: unknown } | null)?.asks;
  return typeof v === "boolean" ? v : null;
}
