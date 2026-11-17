// Pair input and reply handling for the duplicate checks. Pure: no I/O, no Node
// imports, because the prompt registry (shared with the web mockup) imports it.
import { wholeReplyJson } from "../core/reply-json.ts";

export const PAIR_BODY_LIMIT = 2000;
/** Jev's yes-probability at or above this makes a pair a duplicate; at or below 1 minus this, distinct. */
export const JEV_ACCEPT = 0.9;
export const JEV_REJECT = 0.1;
/** Jev's yes-probability a Haiku "duplicate" still needs, so the models do not contradict each other outright. */
export const JEV_FLOOR = 0.5;


export const VERDICTS = ["duplicate", "distinct", "unsure"] as const;
export type PairVerdict = (typeof VERDICTS)[number];

export type PairItem = { number: number; kind: "pr" | "issue"; state: string; title: string; body: string };
/** `ref` identifies the pair in replies: `repo#a~b` with a < b. */
export type DupePair = { ref: string; repo: string; a: PairItem; b: PairItem };

const itemView = (i: PairItem) => ({ ref: `#${i.number}`, kind: i.kind === "pr" ? "pull request" : "issue", state: i.state.toLowerCase(), title: i.title, body: (i.body ?? "").slice(0, PAIR_BODY_LIMIT) });

/** What the models see of a pair. */
export const pairView = (p: DupePair): Record<string, unknown> => ({ ref: p.ref, first: itemView(p.a), second: itemView(p.b) });

export const pairRef = (repo: string, a: number, b: number): string => `${repo}#${Math.min(a, b)}~${Math.max(a, b)}`;

export type PairAnswer = { ref: string; verdict: PairVerdict; reason: string };

/** Keeps one answer per asked ref with a known verdict. */
export function parsePairReply(text: string, refs: string[]): { answers: PairAnswer[]; missing: string[] } {
  const arr = wholeReplyJson(text);
  const answers: PairAnswer[] = [];
  const seen = new Set<string>();
  if (Array.isArray(arr)) {
    for (const o of arr as Record<string, unknown>[]) {
      if (!o || typeof o !== "object") continue;
      const ref = String(o.ref ?? "");
      if (!refs.includes(ref) || seen.has(ref) || !(VERDICTS as readonly unknown[]).includes(o.verdict)) continue;
      seen.add(ref);
      answers.push({ ref, verdict: o.verdict as PairVerdict, reason: String(o.reason ?? "").slice(0, 200) });
    }
  }
  return { answers, missing: refs.filter((r) => !seen.has(r)) };
}

/** The pair's verdict from Jev's probability and, when Jev is not sure either way, Haiku's answer. With Jev unavailable, Haiku's answer alone. null: Haiku is needed and has not answered. */
export function settlePair(jev: number | null, haiku: PairVerdict | null, jevUnavailable = false): PairVerdict | null {
  if (jevUnavailable) return haiku;
  if (jev !== null && jev >= JEV_ACCEPT) return "duplicate";
  if (jev !== null && jev <= JEV_REJECT) return "distinct";
  if (haiku === null) return null;
  if (haiku === "duplicate") return jev !== null && jev >= JEV_FLOOR ? "duplicate" : "unsure";
  return haiku;
}
