// The registry of model steps: per prompt id, the parser, retries, lint and (for Jev) the Haiku fallback.
// A caller names a step and passes the input; src/agents/step.ts runs it. The prompts' text stays in src/prompts.
import { refOf, parseHaikuReply, jevVerdict, type Item, type JevAnswers, type Verdict } from "../classify/parse.ts";
import { jevAreaChoice, parseAreaReply, settles, type AreaAnswer } from "../areas/parse.ts";
import type { Area, AreaItem } from "../areas/types.ts";
import { parsePairReply, type DupePair, type PairAnswer } from "../dupes/pair.ts";
import { carryTexts, lintComparison, parseIssueComparison, parsePrComparison, type CompareIssues, type ComparePrs, type IssueComparison, type PrComparison } from "../dupes/group.ts";
import { jevImpact, parseHaikuImpacts, SURE, type Impact, type JevImpactAnswers } from "../priority/score.ts";
import { renderAreaJev, renderReferenceJev } from "../prompts/index.ts";
import type { ReferenceLintInput } from "../replylint.ts";
import type { ClaudeStep, JevStep, TieredStep } from "./step.ts";
import type { DatabaseSync } from "node:sqlite";
import { parseRefereeReply, type Referee } from "../classify/parse.ts";
import { lintOpusReply, parseOpusReply, publicTexts as opusTexts, rawReason, type OpusPr, type OpusReview } from "../review/opus-parse.ts";
import { lintPremerge, parsePremerge, premergeTexts, type PremergeReview } from "../premerge/parse.ts";
import { lintReply, parseFindings, publicTexts as postmergeTexts, type Finding, type PostmergePr } from "../postmerge/parse.ts";
import { commentTexts } from "../conversations/cards.ts";
import { choicesTexts, parseTurn, type TurnReply as ConversationReply } from "../decide/choices-parse.ts";
import type { ConversationInput } from "../conversations/types.ts";
import { parseCompareReply, parsePlanReply, parseScreenshotReply, type CompareParsed, type Parsed as PlanReply, type ScreenshotParsed } from "../verify/plan.ts";
import type { ScreenshotConfigBody } from "../verify/screenshot-config.ts";
import type { Crate } from "../verify/types.ts";
import type { ScreenshotCompareInput, ScreenshotPlanInput, VerifyPlanInput } from "../verify/types.ts";
import { referenceProblems, statementProblems, type SemanticDeps } from "../reference-lint.ts";
import { dropTexts } from "../replylint.ts";
import { wholeReplyJson } from "../core/reply-json.ts";

/** The part of `xs` whose key is in `missing`, or undefined when none is: the `rest` of a batch parse. */
export function leftOf<T>(xs: T[], key: (x: T) => string, missing: string[]): T[] | undefined {
  const r = xs.filter((x) => missing.includes(key(x)));
  return r.length ? r : undefined;
}

const probability = (p: unknown): number | null => (typeof p === "number" && p >= 0 && p <= 1 ? p : null);
const single = <V,>(v: V | null) => (v === null ? null : { value: v });

// Classify: Jev per item, Haiku per batch (the two run as separate passes of the classify pipeline).
export const CLASSIFY_HAIKU: ClaudeStep<Item[], Verdict[]> = {
  provider: "claude", id: "classify.haiku",
  parse: (text, todo) => {
    const { verdicts, missing } = parseHaikuReply(text, todo.map(refOf));
    return { value: verdicts, rest: leftOf(todo, refOf, missing) };
  },
};
export const CLASSIFY_JEV: JevStep<Item, Verdict> = {
  provider: "jev", id: "classify.jev",
  request: (item) => ({ item }),
  parse: (answers, item) => single(answers ? jevVerdict(refOf(item), answers as JevAnswers) : null),
};

// Priority: Jev's level, Haiku where Jev is under SURE or gave none.
export type JevImpact = { impact: Impact; p: number };
export type HaikuImpactValue = { impact: Impact; reason: string };
export const PRIORITY: TieredStep<Item, JevImpact, HaikuImpactValue> = {
  jev: {
    provider: "jev", id: "priority.jev",
    request: (item) => ({ item }),
    parse: (answers) => single(jevImpact(answers as JevImpactAnswers | undefined)),
  },
  haiku: {
    provider: "claude", id: "priority.haiku",
    parse: (text, ask) => {
      const { answers, missing } = parseHaikuImpacts(text, ask.map(refOf));
      return { value: answers.map((a): [string, HaikuImpactValue] => [a.ref, { impact: a.impact, reason: a.reason }]), rest: leftOf(ask, refOf, missing) };
    },
  },
  ref: refOf,
  sure: (v) => v.p >= SURE,
  onJevFailure: "haiku",
};

// Areas: Jev's choice settles from AREA_SURE; Haiku decides below it, and alone while Jev is unavailable.
export type AreasCtx = { repo: string; areas: Area[] };
type AreasBatch = { repo: string; areas: Area[]; items: AreaItem[] };
export const AREAS: TieredStep<AreaItem, AreaAnswer, string | null, AreasCtx, AreasBatch> = {
  jev: {
    provider: "jev", id: "areas.jev",
    request: (x, c) => ({ item: x, body: renderAreaJev(x, c.areas) }),
    // An answer from a failed `jev ask` is not used.
    parse: (answers, _x, ctx, c) => single(ctx.code === 0 ? jevAreaChoice(answers, c.areas) : null),
  },
  haiku: {
    provider: "claude", id: "areas.haiku",
    toPrompt: (b) => [b],
    size: (b) => b.items.length,
    parse: (text, b) => {
      const { answers, missing } = parseAreaReply(text, b.items.map(refOf), b.areas);
      const left = leftOf(b.items, refOf, missing);
      return { value: [...answers], rest: left && { ...b, items: left } };
    },
  },
  batch: (items, c) => ({ repo: c.repo, areas: c.areas, items }),
  ref: refOf,
  sure: (a) => settles(a.top),
  onJevFailure: "haiku-when-unavailable",
};

// Duplicate pairs: Jev's probability, Haiku for the unsure pairs (the bands are in src/dupes/pair.ts).
export const DUPES_JEV: JevStep<DupePair, number> = {
  provider: "jev", id: "dupes.jev",
  request: (pair) => ({ item: pair }),
  parse: (answers) => single(probability((answers as { same?: { noul?: unknown } } | undefined)?.same?.noul)),
};
export const DUPES_HAIKU: ClaudeStep<DupePair[], PairAnswer[]> = {
  provider: "claude", id: "dupes.haiku",
  parse: (text, pairs) => {
    const { answers, missing } = parsePairReply(text, pairs.map((p) => p.ref));
    return { value: answers, rest: leftOf(pairs, (p) => p.ref, missing) };
  },
};

// Dupe comparison: one call for a group of PRs (with a lint and fix turn) or of issues.
export type PrCompareInput = { numbers: number[]; input: ComparePrs };
export type IssueCompareInput = { numbers: number[]; input: CompareIssues };
export const COMPARE_PRS: ClaudeStep<PrCompareInput, PrComparison, ReferenceCtx> = {
  provider: "claude", id: "dupes.compare-prs.opus",
  toPrompt: (x) => [x.input],
  size: () => 1,
  // A long summary or why, and a carry point that quotes the reference pages, go back to the model as a fix turn (src/replylint.ts);
  // a reply that is not a valid comparison is asked for again.
  lint: { fields: ["summary", "why", "carry"], make: (x, c) => async (text, stage) => {
    const own = lintComparison(text, x.numbers);
    return own === null ? null : [...own, ...await referenceProblems(carryTexts(text, x.numbers), c?.dir, c?.semantic, { stage, otherProblems: own.length })];
  } },
  // Anything the fix turn did not clear is cut to its first sentence, or left out for a flagged carry point; the call is never repeated for it.
  parse: (text, x, ctx) => single(parsePrComparison(text, x.numbers, true, dropTexts(ctx.problems))),
};
export const COMPARE_ISSUES: ClaudeStep<IssueCompareInput, IssueComparison> = {
  provider: "claude", id: "dupes.compare-issues.sonnet",
  toPrompt: (x) => [x.input],
  size: () => 1,
  // An over-long summary fails the reply until the last attempt, which cuts it; when no attempt is valid, the first lenient reading is used.
  parse: (text, x, ctx) => single(parseIssueComparison(text, x.numbers, ctx.last)),
  fallback: (text, x) => parseIssueComparison(text, x.numbers, true),
};

// Reference lint: does a public text refer to outside documentation? Jev's probability, Haiku for the rest.
export const REFERENCE_JEV: JevStep<ReferenceLintInput, number> = {
  provider: "jev", id: "lint.reference.jev",
  request: (x) => ({ item: { ref: x.ref }, body: renderReferenceJev(x.text) }),
  parse: (answers) => single(probability((answers as { refers?: { noul?: unknown } } | undefined)?.refers?.noul)),
};
export const REFERENCE_HAIKU: ClaudeStep<ReferenceLintInput[], boolean> = {
  provider: "claude", id: "lint.reference.haiku",
  parse: (text, input) => {
    // An unreadable reply is asked for again.
    const arr = wholeReplyJson(text);
    const o = Array.isArray(arr) ? arr[0] as { ref?: unknown; refers?: unknown } | undefined : undefined;
    return o && o.ref === input[0]!.ref && typeof o.refers === "boolean" ? { value: o.refers } : null;
  },
};


// ---- Opus and workspace steps ------------------------------------------------------------------
// A sandboxed call's checkout, reference folder, progress callback and shared workspace come in through StepOpts
// (they are AskOptions); the lint and parse of public texts get the reference folder and semantic check in `ctx`.

/** What the reference lint of a public-text reply needs: the repo's reference folder (absent: no check) and the semantic check. */
export type ReferenceCtx = { dir: string | undefined; semantic: SemanticDeps | undefined };

// A reply that is not valid is lint-free: it keeps the whole-call retry. Problems of a valid one go back to the model as one fix turn.
// Whatever the lint still finds after it is left out (reference text) or cut to its first sentence (long summary or why); the call is never repeated for it.
export type OpusValue = { review: OpusReview; text: string };
export const REVIEW_OPUS: ClaudeStep<OpusPr, OpusValue, ReferenceCtx> = {
  provider: "claude", id: "review.opus",
  toPrompt: (x) => [x], size: () => 1,
  lint: { fields: ["summary", "why", "public texts", "claims", "fixes"], make: (x, c) => async (text, stage) => {
    const own = lintOpusReply(text, x.ref, x.unapplied_fixes, x.body);
    if (own === null) return null;
    // The review's public text and fixes reach GitHub without a person reading them: they may not carry the owner statements it was shown.
    const texts = opusTexts(text), stated = statementProblems(texts, x.statements);
    return [...own, ...stated, ...await referenceProblems(texts, c.dir, c.semantic, { stage, otherProblems: own.length + stated.length })];
  } },
  parse: (text, x, ctx) => {
    const review = parseOpusReply(text, x.ref, true, dropTexts(ctx.problems), false, x.statements, x.body, x.files);
    return review === null ? null : { value: { review, text } };
  },
};
export { rawReason };

export const PREMERGE_OPUS: ClaudeStep<OpusPr & { ref: string }, PremergeReview, ReferenceCtx> = {
  provider: "claude", id: "premerge.opus",
  toPrompt: (x) => [x], size: () => 1,
  lint: { fields: ["findings", "claims"], make: (x, c) => async (text, stage) => {
    const own = lintPremerge(text, x.ref, x.body);
    if (own === null) return null;
    // Findings and their fixes become fix-up fixes and claims, which reach GitHub: no owner statement it was shown may be in them.
    const texts = premergeTexts(text, x.ref), stated = statementProblems(texts, x.statements);
    return [...own, ...stated, ...await referenceProblems(texts, c.dir, c.semantic, { stage, otherProblems: own.length + stated.length })];
  } },
  parse: (text, x, ctx) => { const r = parsePremerge(text, x.ref, dropTexts(ctx.problems), x.statements, x.body, x.files); return r === null ? null : { value: r }; },
};

export const POSTMERGE_OPUS: ClaudeStep<PostmergePr, Finding[], ReferenceCtx> = {
  provider: "claude", id: "postmerge.opus",
  toPrompt: (x) => [x], size: () => 1,
  lint: { fields: ["findings", "claims"], make: (_x, c) => async (text, stage) => {
    const own = lintReply(text);
    return own === null ? null : [...own, ...await referenceProblems(postmergeTexts(text), c.dir, c.semantic, { stage, otherProblems: own.length })];
  } },
  parse: (text, _x, ctx) => { const r = parseFindings(text, dropTexts(ctx.problems)); return r === null ? null : { value: r }; },
};

/** Comment cards are public text: a reference mention or quote goes back to the model as one fix turn. A reply without text is not linted and keeps the whole-call retry. */
export type ConversationCtx = ReferenceCtx & { db: DatabaseSync; repo: string; n: number };
export const CONVERSATION: ClaudeStep<ConversationInput, ConversationReply, ConversationCtx> = {
  provider: "claude", id: "conversation.turn",
  toPrompt: (x) => [x], size: () => 1,
  lint: { fields: ["cards[].text", "cards[].steps[].body", "cards[].steps[].title", "cores[].reason", "cores[].extras[].text", "cores[].extras[].title", "cores[].extras[].body", "add[].extras[].text", "add[].extras[].title", "add[].extras[].body", "ask.text"], make: (_x, c) => async (text, stage) => (parseTurn(c.db, c.repo, c.n, text) ? referenceProblems([...commentTexts(text), ...choicesTexts(text)], c.dir, c.semantic, { stage }) : null) },
  parse: (text, _x, ctx, c) => { const r = parseTurn(c.db, c.repo, c.n, text, dropTexts(ctx.problems)); return r === null ? null : { value: r }; },
};

/** The plan reply as parsed, valid or not: an invalid plan is asked for again (the last reading stands after the last attempt). */
export type PlanCtx = { ref: string; crates: Crate[]; label: string | null; ci: boolean };
export const VERIFY_PLAN: ClaudeStep<VerifyPlanInput, PlanReply, PlanCtx> = {
  provider: "claude", id: "verify.plan",
  toPrompt: (x) => [x], size: () => 1,
  parse: (text, x, _ctx, c) => {
    const value = parsePlanReply(text, c.ref, c.crates, c.label, c.ci);
    return { value, ...(!value.ok && { rest: x }) };
  },
};

/** The screenshot plan as parsed, valid or not: an invalid script is asked for again. `config` is the repo's screenshot config, the only source of commands. */
export type ScreenshotCtx = { ref: string; config: Pick<ScreenshotConfigBody, "commands"> };
export const VERIFY_SCREENSHOT: ClaudeStep<ScreenshotPlanInput, ScreenshotParsed, ScreenshotCtx> = {
  provider: "claude", id: "verify.screenshot", attempts: 2,
  toPrompt: (x) => [x], size: () => 1,
  parse: (text, x, _ctx, c) => {
    const value = parseScreenshotReply(text, c.ref, c.config);
    return { value, ...(!value.ok && { rest: x }) };
  },
};

/** The before/after comparison as parsed, valid or not: an invalid reply is asked for again. The images are read from the call's checkout. */
export type CompareCtx = { ref: string };
export const VERIFY_COMPARE: ClaudeStep<ScreenshotCompareInput, CompareParsed, CompareCtx> = {
  provider: "claude", id: "verify.compare", attempts: 2,
  toPrompt: (x) => [x], size: () => 1,
  parse: (text, x, _ctx, c) => {
    const value = parseCompareReply(text, c.ref);
    return { value, ...(!value.ok && { rest: x }) };
  },
};

/** The Sonnet referee between Jev and Haiku: a batch per call; items without a verdict are asked again. */
export const REFEREE_SONNET: ClaudeStep<Item[], Referee[]> = {
  provider: "claude", id: "referee.sonnet",
  parse: (text, todo) => {
    const verdicts = parseRefereeReply(text, todo.map(refOf));
    const got = verdicts.map((v) => v.ref);
    return { value: verdicts, rest: leftOf(todo, refOf, todo.map(refOf).filter((r) => !got.includes(r))) };
  },
};

/** A call whose reply the caller reads itself: one attempt, the text as the value (the fix-issue prompts). */
export const textStep = <I,>(id: ClaudeStep<I, string>["id"]): ClaudeStep<I, string> => ({ provider: "claude", id, attempts: 1, toPrompt: (x) => [x], size: () => 1, parse: (text) => ({ value: text }) });
