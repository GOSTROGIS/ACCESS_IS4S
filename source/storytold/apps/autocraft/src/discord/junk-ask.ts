// The junk check before an issue is filed from Discord: is the drafted title and body a real report or request, or spam,
// abuse, empty or a test? Pure; no Node imports (the Prompts page imports it).
import { flagBand, type FlagBand } from "../classify/parse.ts";
import { wholeReplyJson } from "../core/reply-json.ts";

/** Jev's yes-probability from which a draft counts as junk; below JEV_FLAG_NO (0.3) it is real, and Haiku decides in between. */
export const JUNK_JEV_YES = 0.8;
export const JUNK_TEXT_CHARS = 3000;
export const JUNK_TITLE_CHARS = 200;

export type JunkAsk = { title: string; body: string };

export const JUNK_QUESTION = "Is this drafted GitHub issue junk: spam, advertising, abuse, gibberish, empty, or a test post, rather than a real bug report or feature request about the software?";

export const SAMPLE_JUNK: JunkAsk[] = [{ title: "Export to WebP ignores the quality setting", body: "Exporting with quality 40 gives the same file size as quality 100.\n\nSteps: open any photo, choose File > Export > WebP, set the quality slider to 40." }];

const clean = (a: JunkAsk): JunkAsk => ({ title: a.title.slice(0, JUNK_TITLE_CHARS), body: a.body.slice(0, JUNK_TEXT_CHARS) });

/** The data of one call, as one JSON string: Jev's request state and the Haiku prompt's data block. */
export const junkState = (a: JunkAsk): string => JSON.stringify(clean(a), null, 1).replace(/</g, "\\u003c");

export const junkBand = (p: number): FlagBand => flagBand(p, JUNK_JEV_YES);

/** Jev's answer: the yes-probability, or null when the answer has no number from 0 to 1. */
export function jevJunk(answers: unknown): number | null {
  const p = (answers as { junk?: { noul?: unknown } } | undefined)?.junk?.noul;
  return typeof p === "number" && p >= 0 && p <= 1 ? p : null;
}

/** Haiku's reply: `{"junk": true|false}` as its one JSON value; null otherwise. */
export function parseJunk(text: string): boolean | null {
  const v = (wholeReplyJson(text) as { junk?: unknown } | null)?.junk;
  return typeof v === "boolean" ? v : null;
}
