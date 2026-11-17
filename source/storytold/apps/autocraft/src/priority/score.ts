// Priority level of an open item: pure functions, no I/O.
//
// A model picks one of five levels, P0 (most urgent) to P4 (backlog). Reach is a number from 0 to 99 that
// only breaks ties inside a level (src/rank/score.ts); it is not shown to users. A security flag raises the
// level by one, never above P0.
//
// Reach is the weighted sum of these signals, each scaled to 0..1 and capped (the mirror holds no reactions,
// so they are not a signal):
//
//   commenters  0.25  distinct comment authors, capped at 8
//   comments    0.20  comment count, capped at 20
//   linked      0.15  PRs that close the issue, or issues the PR closes, capped at 3
//   duplicates  0.15  confirmed duplicates pointing at the item as the canonical one, capped at 5
//                     (each is another person who hit the same thing, like several reactions)
//   security    0.15  a classifier raised the security flag
//   age         0.10  days open, capped at 365 (older means people have waited longer)
import { wholeReplyJson } from "../core/reply-json.ts";


export const LEVELS = ["P0", "P1", "P2", "P3", "P4"] as const;
export type Level = (typeof LEVELS)[number];
export type Impact = Level;

export const LEVEL_MEANING: Record<Level, string> = {
  P0: "Critical: a crash, data loss, a security hole, a broken build or install, or an app that cannot be used.",
  P1: "High: a core feature is broken, or something that used to work no longer does (a regression).",
  P2: "Normal: an ordinary bug, feature or change that is neither urgent nor trivial.",
  P3: "Low: cosmetic, wording, documentation, or a nice-to-have.",
  P4: "Backlog: kept open but not worked on now: a vague or wishlist request, an idea without a clear ask, or a very large ask with little reach.",
};

/** The level after the security flag: one higher, never above P0. */
export const levelWith = (level: Level, security: boolean): Level => (security ? LEVELS[Math.max(0, LEVELS.indexOf(level) - 1)]! : level);

/** Jev's probability for its impact choice from which the choice stands without Haiku. */
export const SURE = 0.9;

export type Reach = {
  comments: number;
  commenters: number;
  linked: number;
  duplicates: number;
  security: boolean;
  ageDays: number;
};

const frac = (n: number, cap: number): number => Math.min(Math.max(n, 0), cap) / cap;

export function reachOf(r: Reach): number {
  return 0.25 * frac(r.commenters, 8) + 0.20 * frac(r.comments, 20) + 0.15 * frac(r.linked, 3) + 0.15 * frac(r.duplicates, 5)
    + 0.15 * (r.security ? 1 : 0) + 0.10 * frac(r.ageDays, 365);
}

/** Reach as a whole number from 0 to 99, the tie-breaker inside a level. */
export const reachScore = (r: Reach): number => Math.min(99, Math.round(reachOf(r) * 99));

export const isImpact = (v: unknown): v is Level => typeof v === "string" && (LEVELS as readonly string[]).includes(v);

/** The impact that counts: Jev's when it is sure, else Haiku's, else Jev's anyway. */
export function settleImpact(jev: { impact: Impact; p: number } | null, haiku: Impact | null): { impact: Impact; model: "jev" | "haiku" | "jev-unsure" } | null {
  if (jev && jev.p >= SURE) return { impact: jev.impact, model: "jev" };
  if (haiku) return { impact: haiku, model: "haiku" };
  return jev ? { impact: jev.impact, model: "jev-unsure" } : null;
}

export type JevImpactAnswers = { impact?: { choice?: string; confidence?: number; probabilities?: Record<string, number> } };

export function jevImpact(a: JevImpactAnswers | undefined): { impact: Impact; p: number } | null {
  const t = a?.impact;
  if (!t || !isImpact(t.choice)) return null;
  const p = t.probabilities?.[t.choice] ?? t.confidence;
  return typeof p === "number" ? { impact: t.choice, p } : null;
}

export type HaikuImpact = { ref: string; impact: Impact; reason: string };

/** Keeps one answer per asked ref with a known level. */
export function parseHaikuImpacts(text: string, refs: string[]): { answers: HaikuImpact[]; missing: string[] } {
  const arr = wholeReplyJson(text);
  const answers: HaikuImpact[] = [];
  if (Array.isArray(arr)) {
    for (const o of arr as Record<string, unknown>[]) {
      if (o && typeof o === "object" && refs.includes(String(o.ref)) && isImpact(o.impact) && !answers.some((x) => x.ref === o.ref))
        answers.push({ ref: String(o.ref), impact: o.impact, reason: String(o.reason ?? "").slice(0, 300) });
    }
  }
  return { answers, missing: refs.filter((r) => !answers.some((x) => x.ref === r)) };
}
