// Group comparison input and reply handling for the duplicate groups. Pure: no I/O,
// no Node imports, because the prompt registry (shared with the web mockup) imports it.

import { firstSentence, oneSentence, proseField, SUMMARY_MAX_WORDS, WHY_MAX_WORDS, wordCount } from "../prose.ts";
import type { LintProblem } from "../replylint.ts";
import { wholeReplyJson } from "../core/reply-json.ts";

/** Most members compared in one call; a larger group is compared in rounds. */
export const GROUP_MAX = 10;
export const GROUP_BODY_LIMIT = 3000;
/** Characters of diff shown for all PRs of one call together. */
export const GROUP_DIFF_CHARS = 120_000;
export const GROUP_REASON_WORDS = 60;
export const GROUP_MAX_POINTS = 8;

export type ComparePr = {
  ref: string;
  title: string;
  body: string;
  state: string;
  author_association: string | null;
  /** Issues the PR says it closes. */
  linked_issues: string[];
  /** Background only: not a rule for the choice. */
  ci: string;
  review: string | null;
  files: string[];
  diff: string;
};
export type ComparePrs = {
  ref: string;
  /** Where the call may read the base checkout inside the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  /** Set when the repo's reference folder is mounted at /reference; not part of the quoted JSON. */
  reference?: boolean;
  prs: ComparePr[];
};
export type CompareIssue = { ref: string; title: string; body: string; state: string; author_association: string | null; comments: number };
export type CompareIssues = { ref: string; issues: CompareIssue[] };

export type PrOther = { number: number; duplicate: boolean; better: string[]; carry: string[] };
/** summary: 2 or 3 sentences for the decision; why: one sentence behind the recommendation. Null when the reply had none. */
type Prose = { summary: string | null; why: string | null };
export type PrComparison = { keep: number; reason: string; others: PrOther[] } & Prose;
export type IssueOther = { number: number; adds: string[] };
export type IssueComparison = { keep: number; reason: string; others: IssueOther[] } & Prose;

const words = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(" ");
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, GROUP_MAX_POINTS).map((x) => x.trim().slice(0, 400)) : [];

function object(text: string): Record<string, unknown> | null {
  const o = wholeReplyJson(text);
  return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
}

/** The numbers of a reply's keep and others, checked against the asked numbers; null when keep is unknown or an other is missing. */
function shape(text: string, numbers: number[], last: boolean): ({ keep: number; reason: string; byNumber: Map<number, Record<string, unknown>> } & Prose) | null {
  const o = object(text);
  if (!o || typeof o.keep !== "number" || !numbers.includes(o.keep) || typeof o.reason !== "string" || !Array.isArray(o.others)) return null;
  const byNumber = new Map<number, Record<string, unknown>>();
  for (const x of o.others as Record<string, unknown>[]) {
    if (x && typeof x === "object" && typeof x.number === "number" && numbers.includes(x.number) && x.number !== o.keep && !byNumber.has(x.number)) byNumber.set(x.number, x);
  }
  if (numbers.some((n) => n !== o.keep && !byNumber.has(n))) return null;
  const summary = proseField(o.summary, SUMMARY_MAX_WORDS, last), why = proseField(o.why, WHY_MAX_WORDS, last);
  if (!summary.ok || !why.ok) return null;
  return { keep: o.keep, reason: words(o.reason, GROUP_REASON_WORDS), byNumber, summary: summary.text, why: oneSentence(why.text) };
}

/**
 * A summary or why over its word cap fails the reply unless `last` (the final attempt), which keeps its first sentence.
 * `drop`: carry points the reply lint still flagged after the fix turn (a reference quote); they are left out.
 */
export function parsePrComparison(text: string, numbers: number[], last = true, drop: ReadonlySet<string> = new Set()): PrComparison | null {
  const s = shape(text, numbers, last);
  if (!s) return null;
  const others: PrOther[] = [];
  for (const [number, x] of s.byNumber) {
    if (typeof x.duplicate !== "boolean") return null;
    others.push({ number, duplicate: x.duplicate, better: list(x.better), carry: list(x.carry).filter((t) => !drop.has(t)) });
  }
  return { keep: s.keep, reason: s.reason, summary: s.summary, why: s.why, others: others.sort((p, q) => p.number - q.number) };
}

/** The carry points of a comparison reply, as parsePrComparison keeps them: they reach the close comment and the kept PR's suggestion, so they get the reference checks. */
export function carryTexts(text: string, numbers: number[]): { field: string; text: string }[] {
  const s = shape(text, numbers, true);
  if (!s) return [];
  return [...s.byNumber].flatMap(([number, x]) => list(x.carry).map((t, i) => ({ field: `others[#${number}].carry[${i}]`, text: t })));
}

/** The problems of a valid comparison reply that the model can fix itself: a summary or why over its cap, a why of more than one sentence. Null when the reply is not a valid comparison. */
export function lintComparison(text: string, numbers: number[]): LintProblem[] | null {
  if (!shape(text, numbers, true)) return null;
  const o = object(text)!;
  const out: LintProblem[] = [];
  if (typeof o.summary === "string" && wordCount(o.summary) > SUMMARY_MAX_WORDS) out.push({ field: "summary", message: `has ${wordCount(o.summary)} words; at most ${SUMMARY_MAX_WORDS}, in 2 or 3 sentences` });
  if (typeof o.why === "string" && o.why.trim()) {
    if (wordCount(o.why) > WHY_MAX_WORDS) out.push({ field: "why", message: `has ${wordCount(o.why)} words; at most ${WHY_MAX_WORDS}, in one sentence` });
    else if (firstSentence(o.why) !== o.why.replace(/\s+/g, " ").trim()) out.push({ field: "why", message: "has more than one sentence; write one" });
  }
  return out;
}

export function parseIssueComparison(text: string, numbers: number[], last = true): IssueComparison | null {
  const s = shape(text, numbers, last);
  if (!s) return null;
  const others = [...s.byNumber].map(([number, x]) => ({ number, adds: list(x.adds) })).sort((p, q) => p.number - q.number);
  return { keep: s.keep, reason: s.reason, summary: s.summary, why: s.why, others };
}

export const prsRef = (repo: string, numbers: number[]): string => `${repo}#${numbers.join("+")}`;
