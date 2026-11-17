// The comments the act step posts. Fixed templates: the only variable parts
// are a cleaned one-line reason and a duplicate reference. No Node imports:
// the Prompts page lists these through src/prompts.
import type { CommentTemplate } from "../../web/src/api/types.ts";
import { withNote } from "../github/note.ts";
import { recommendation, reviewBody } from "../review/post-template.ts";
import { scrubMarkdown } from "../review/public-text.ts";
import { slugOf } from "../owners.ts";

export const REASON_MAX = 200;

/** One plain line: no mentions, no URLs or Markdown links, cut to `max` (REASON_MAX by default). */
export function cleanReason(s: string | null | undefined, max = REASON_MAX): string | null {
  const t = scrubMarkdown((s ?? "").replace(/\s+/g, " "), (x) => x
    .replace(/(^|\n)[ \t>]*\[[^\]]*\]:[^\n]*/g, "$1")
    .replace(/!?\[([^[\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/!?\[([^[\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[a-z!][^>]*>/gi, "")
    .replace(/<?(?<![A-Za-z0-9])(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>]*>?/gi, "")
    .replace(/(^|\s)\/\/[^\s]*/g, "$1")
    .replace(/(?<![A-Za-z0-9])GH-(\d+)(?![A-Za-z0-9])/gi, "issue $1")
    .replace(/(?<![A-Za-z0-9/&])(?:[\w.-]+\/[\w.-]+)?#(\d+)(?![A-Za-z0-9])/g, "issue $1")
    .replace(/@/g, ""))
    .replace(/\s+/g, " ").trim();
  if (!t) return null;
  const cut = t.length > max ? cutAtBoundary(t, max) : t;
  return /[.!?…]$/.test(cut) ? cut : `${cut}.`;
}

/** Cuts `t` to at most `max` characters: after the last sentence end that fits, else at the last word boundary with "…". Never inside a word. */
function cutAtBoundary(t: string, max: number): string {
  const head = t.slice(0, max);
  const ends = [...head.matchAll(/[.!?](?=\s|$)/g)];
  const last = ends.length ? ends[ends.length - 1]!.index! + 1 : 0;
  if (last >= Math.min(40, max / 2)) return head.slice(0, last);
  const room = t.slice(0, max - 1);
  // A word is whole when the next character is a space.
  const i = t[max - 1] === " " ? room.length : room.lastIndexOf(" ");
  const words = (i > 0 ? room.slice(0, i) : room).trimEnd().replace(/[,;:\-–]+$/, "");
  return `${words}…`;
}

/** `#n` in the same repo, else the full cross-repo reference. */
export function refText(from: string, ref: string): string {
  const m = /^([\w.-]+)#(\d+)$/.exec(ref.trim());
  if (!m) return "";
  return m[1] === from ? `#${m[2]}` : `${slugOf(m[1])}#${m[2]}`;
}

export function scopeCloseComment(reason: string | null): string {
  const r = cleanReason(reason);
  return `Closing this as out of scope for the project.${r ? `\nReason: ${r}` : ""}`;
}

export function prCloseComment(o: { repo: string; reason: string | null; duplicateOf: string | null }): string {
  const dup = o.duplicateOf ? refText(o.repo, o.duplicateOf) : "";
  if (dup) return `Closing this pull request. Duplicate of ${dup}.`;
  const r = cleanReason(o.reason);
  return `Closing this pull request.${r ? `\nReason: ${r}` : ""}`;
}

/** `original` is the canonical item's reference (`repo#n`); `closed` when it is no longer open. */
export function duplicateComment(o: { repo: string; original: string; closed: boolean }): string {
  return `Duplicate of ${refText(o.repo, o.original)}${o.closed ? ", which is closed" : ""}.`;
}


/** The comment on a member closed in a duplicate group: the kept item, and for a PR the parts carried over. Carried points are model-written from untrusted text, so they are cleaned like a reason. */
export function dupeGroupCloseComment(o: { kept: number; carry: string[] }): string {
  const c = cleanReason(o.carry.slice(0, 2).join("; "));
  return `Closing as a duplicate of #${o.kept}.${c ? `\nParts to carry over to #${o.kept}: ${c}` : ""}`;
}

export const DETAILS_MAX_BULLETS = 6;

/** The comment on the kept issue listing what the closed reports add: one bullet per point, each crediting its source, the first point of every report before any second one. Null when no report adds anything. */
export function dupeGroupDetailsComment(adds: { number: number; points: string[] }[]): string | null {
  const bullets: string[] = [];
  for (let round = 0; bullets.length < DETAILS_MAX_BULLETS; round++) {
    let any = false;
    for (const a of adds) {
      const p = a.points[round];
      if (p === undefined) continue;
      any = true;
      const t = cleanReason(p);
      if (t && bullets.length < DETAILS_MAX_BULLETS) bullets.push(`- #${a.number}: ${t}`);
    }
    if (!any) break;
  }
  return bullets.length ? `Details from the closed duplicates:\n${bullets.join("\n")}` : null;
}

export const COMMENT_TEMPLATES: CommentTemplate[] = [
  {
    id: "act.scope-close", stage: "Act",
    purpose: "Posted when an operator answers a scope decision with Out of scope, just before the item is closed.",
    text: scopeCloseComment("{{reason}}"),
    placeholders: [{ name: "reason", meaning: "The reason of the conversation card that answered Out of scope (one sentence), else the decision's public text; cleaned to one line of at most 200 characters, cut at a sentence or word end; the Reason line is left out when there is none" }],
    example: scopeCloseComment("The reference application does not do this."),
  },
  {
    id: "act.pr-close", stage: "Act",
    purpose: "Posted when an operator answers Close on a \"Close this PR?\" decision, just before the pull request is closed.",
    text: prCloseComment({ repo: "app", reason: "{{reason}}", duplicateOf: null }),
    placeholders: [
      { name: "reason", meaning: "The reason of the conversation card that answered Close, else the review's reason; cleaned to one line of at most 200 characters, cut at a sentence or word end" },
      { name: "duplicate", meaning: "When the review names a duplicate, the comment is \"Closing this pull request. Duplicate of #N.\" instead" },
    ],
    example: prCloseComment({ repo: "app", reason: null, duplicateOf: "app#12" }),
  },
  {
    id: "act.duplicate", stage: "Act",
    purpose: "Posted when an operator answers a \"Close as a duplicate?\" decision with Close as duplicate, just before the item is closed.",
    text: duplicateComment({ repo: "app", original: "app#{{original}}", closed: false }),
    placeholders: [
      { name: "original", meaning: "The number of the item that stays, in the same repo; another repo's item is written as org/repo#N" },
      { name: "closed", meaning: "When the original is no longer open on GitHub at the time of the comment, \", which is closed\" follows the number" },
    ],
    example: duplicateComment({ repo: "app", original: "app#12", closed: true }),
  },
  {
    id: "act.duplicate-group-close", stage: "Act",
    purpose: "Posted on each member of a duplicate group closed after an operator accepted (or changed) the group's answer. The exact text is written when the comparison runs and shown in the decision.",
    text: dupeGroupCloseComment({ kept: 0, carry: ["{{carried}}"] }).replaceAll("#0", "#{{kept}}"),
    placeholders: [
      { name: "kept", meaning: "The number of the item that stays" },
      { name: "carried", meaning: "For a pull request with parts carried over: the first two carry-over points of the comparison, cleaned to one line of at most 200 characters; the second line, \"Parts to carry over to #{{kept}}: ...\", is left out when there are none" },
    ],
    example: dupeGroupCloseComment({ kept: 12, carry: ["master-page handling in src/pages.rs"] }),
  },
  {
    id: "act.duplicate-group-details", stage: "Act",
    purpose: "Posted once on the kept issue of a duplicate group, listing what the closed reports add.",
    text: dupeGroupDetailsComment([{ number: 0, points: ["{{point}}"] }])!.replace("#0", "#{{source}}"),
    placeholders: [
      { name: "point", meaning: "A detail the closed report adds (steps, versions, logs), taken from the comparison and cleaned to one line of at most 200 characters; at most 6 bullets" },
      { name: "source", meaning: "The number of the closed report the point comes from" },
    ],
    example: dupeGroupDetailsComment([{ number: 15, points: ["Happens on macOS 14 only."] }, { number: 18, points: ["Started after version 2.3."] }])!,
  },
  {
    id: "review.post", stage: "Review",
    purpose: "Posted as a pull request review (event Comment, never an approval or a change request) on a pull request with a final Opus review at its current head. A later review at a new head edits this review instead of adding another.",
    text: withNote({ by: "model", kind: "review", model: "{{model}}" }, reviewBody({ verdict: "take-fix", sure: true, summary: "{{summary}}", points: ["{{point}}"], head: "{{head}}", recommendation: "{{recommendation}}" })),
    placeholders: [
      { name: "model", meaning: "The model that wrote the review, as a name and version (Opus 5.5)" },
      { name: "verdict", meaning: "By verdict: take \"No blocking problems found.\", take-fix \"Small fixes needed:\", hold \"Changes needed:\", close \"Significant problems found:\"; \" (not certain)\" goes before the final colon or full stop when the model was unsure. After our own checked fix-up of a take-fix review, the take-fix line reads \"Small fixes needed, made in <fix-up commit>:\"" },
      { name: "summary, point", meaning: "The review text Opus wrote for the PR author (its public field: summary and at most 8 points), cleaned to one line each (mentions and HTML tags removed, at most 600 characters); the whole body is cut at 6000 characters. Opus's internal reason, fixes and risks are never posted" },
      { name: "recommendation", meaning: "One closing line on what happens next, chosen when the review is posted: take \"merge after CI and checks pass.\" when the PR may merge without a decision and merging is approved in the repo, otherwise \"merge, after a maintainer's decision.\"; take-fix \"merge after the fixes above.\", with \"; they may be pushed to this branch.\" when the pipeline may push to the branch; hold \"update the pull request; it will be reviewed again.\"; close, or anything unclear, \"wait for maintainer feedback.\" The line is never cut off by the length limit" },
      { name: "head", meaning: "The first 7 characters of the reviewed head commit; after our own checked fix-up of the reviewed commit, the footer adds \"Fixes pushed in <fix-up commit>.\" and the closing line is the one for a take verdict" },
    ],
    example: withNote({ by: "model", kind: "review", model: "claude-opus-5-5" }, reviewBody({ verdict: "take-fix", sure: true, summary: "The change does what the description says; one call can fail without being handled.", points: ["`src/net.rs:42`: send() unwraps the result; return the error instead.", "`src/net.rs:60`: the retry count is read once and handled correctly."], head: "0123456789abcdef", recommendation: recommendation({ verdict: "take-fix", queue: null, mergeApproved: true, canPush: false }) })),
  },
];
