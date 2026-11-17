// The model steps of the Discord "new issue" helper: which follow-up questions to ask, and the written draft. Pure; no
// Node imports (the Prompts page imports it). The person's text is data, and so is every model reply: the questions are
// chosen by id from a fixed list, and the draft is checked before it is shown (see issue-draft.ts).
import { wholeReplyJson } from "../core/reply-json.ts";
export const FOLLOW_UPS = [
  { id: "steps", label: "Steps to reproduce", placeholder: "What do you do, in order, to see the problem?" },
  { id: "expected", label: "Expected and actual result", placeholder: "What did you expect, and what happened instead?" },
  { id: "env", label: "Version and platform", placeholder: "App version, operating system, browser or device" },
] as const;
export type FollowUpId = (typeof FOLLOW_UPS)[number]["id"];

export const ISSUE_TITLE_CHARS = 120;
export const ISSUE_BODY_CHARS = 3000;
export const ISSUE_FORM_BODY_CHARS = 1500;
export const ISSUE_ANSWER_CHARS = 500;

/** `ref` is not an item: the call is about a form someone filled in. */
export type IssueQuestionsInput = { ref: string; repo: string; title: string; description: string };
export type IssueDraftInput = { ref: string; repo: string; title: string; description: string; answers: { question: string; answer: string }[] };

export const SAMPLE_ISSUE_QUESTIONS: IssueQuestionsInput[] = [{
  ref: "discord", repo: "photocraft", title: "WebP export ignores quality", description: "When I export to WebP the quality slider has no effect on the file size.",
}];
export const SAMPLE_ISSUE_DRAFT: IssueDraftInput[] = [{
  ...SAMPLE_ISSUE_QUESTIONS[0]!,
  answers: [{ question: "Steps to reproduce", answer: "Open a photo, export as WebP at quality 20 and at 90." }, { question: "Version and platform", answer: "1.4.2 on Windows 11" }],
}];

const first = (text: string): unknown => wholeReplyJson(text);

/** The ids of the chosen follow-up questions, in the list's order, each once; null when the reply holds no object. */
export function parseQuestions(text: string): FollowUpId[] | null {
  const list = (first(text) as { ask?: unknown } | null)?.ask;
  if (!Array.isArray(list)) return null;
  const ids = new Set(list.filter((x): x is string => typeof x === "string"));
  return FOLLOW_UPS.filter((q) => ids.has(q.id)).map((q) => q.id);
}

/** The raw title, body and kind of a draft reply; null when it has no object or title or body is missing. A missing or unknown kind is "bug". Checking is the caller's job. */
export function parseDraft(text: string): { title: string; body: string; kind: "bug" | "feature" } | null {
  const v = first(text) as { title?: unknown; body?: unknown; kind?: unknown } | null;
  return typeof v?.title === "string" && typeof v.body === "string" && v.title.trim() && v.body.trim() ? { title: v.title, body: v.body, kind: v.kind === "feature" ? "feature" : "bug" } : null;
}
