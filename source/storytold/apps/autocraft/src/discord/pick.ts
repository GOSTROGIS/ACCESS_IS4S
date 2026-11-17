// The model step of Discord issue search: from the candidates the embedding search found, pick up to ten that answer
// the question, each with a one-line reason. Pure; no Node imports (the Prompts page imports it).
import { wholeReplyJson } from "../core/reply-json.ts";
export const PICK_MAX = 10;
export const PICK_CANDIDATES = 20;
export const PICK_BODY_CHARS = 300;
export const PICK_REASON_CHARS = 140;

export type PickCandidate = { ref: string; title: string; body: string; closed: boolean };
/** `ref` is not an item: the call is about a question, not a tracked item. */
export type PickInput = { ref: string; question: string; candidates: PickCandidate[] };
export type Pick = { ref: string; reason: string };

export const SAMPLE_PICK: PickInput[] = [{
  ref: "discord",
  question: "Is there a way to export a page as WebP? The quality slider seems to do nothing.",
  candidates: [
    { ref: "photocraft#7", title: "Export to WebP ignores the quality setting", body: "Exporting with quality 20 and quality 90 gives files of the same size.", closed: false },
    { ref: "photocraft#12", title: "Dark mode for the layers panel", body: "The layers panel stays light when the system theme is dark.", closed: false },
    { ref: "photocraft#3", title: "Add WebP export", body: "Export to WebP in addition to PNG and JPEG.", closed: true },
  ],
}];

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

/** The picks of a reply: each ref must be one of the candidates, each ref once, at most PICK_MAX; reasons are one line, cut to PICK_REASON_CHARS. Null when the reply is not one JSON object. */
export function parsePicks(text: string, candidates: { ref: string }[]): Pick[] | null {
  const v = wholeReplyJson(text) as { picks?: unknown } | null;
  const list = v?.picks;
  if (!Array.isArray(list)) return null;
  const allowed = new Set(candidates.map((c) => c.ref));
  const out: Pick[] = [];
  for (const p of list as { ref?: unknown; reason?: unknown }[]) {
    if (typeof p?.ref !== "string" || !allowed.has(p.ref) || out.some((o) => o.ref === p.ref)) continue;
    const reason = typeof p.reason === "string" ? clean(p.reason) : "";
    out.push({ ref: p.ref, reason: reason.length > PICK_REASON_CHARS ? `${reason.slice(0, PICK_REASON_CHARS - 1)}…` : reason });
    if (out.length >= PICK_MAX) break;
  }
  return out;
}
