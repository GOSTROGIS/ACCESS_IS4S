// Texts the fix-up step writes on GitHub. No Node imports: the prompt registry
// (also loaded by the web mockup) shows the comment templates on the Prompts page.
import { cleanReason } from "../act/templates.ts";

/** The one comment posted on the PR after a push; `{{files}}` is the comma-separated list of changed paths. */
export const COMMENT_TEMPLATE = "Pushed the small fixes from review: {{files}}.";
/** The same after a later attempt, so a second push doesn't read as a repeat of the first. */
export const LATER_COMMENT_TEMPLATE = "Pushed further fixes from a later review: {{files}}.";

export function commentText(files: string[], attempt = 1): string {
  return (attempt > 1 ? LATER_COMMENT_TEMPLATE : COMMENT_TEMPLATE).replace("{{files}}", files.map((f) => `\`${f}\``).join(", "));
}

/**
 * The paragraphs of a body (after its note line) when every one is a review-fix comment of ours (first or later round),
 * else null. Carry, operator and other texts never match.
 */
export function fixupCommentLines(body: string): string[] | null {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = (t: string) => new RegExp(`^${esc(t).replace(esc("{{files}}"), "`[^`\\n]+`(?:, `[^`\\n]+`)*")}$`);
  const [first, later] = [re(COMMENT_TEMPLATE), re(LATER_COMMENT_TEMPLATE)];
  const lines = body.replace(/^_[^\n]*_\n\n/, "").split("\n\n");
  return lines.every((l, i) => (i === 0 ? first.test(l) || later.test(l) : later.test(l))) ? lines : null;
}

/** The comment after a further push when our review-fix comment (`lines`, from fixupCommentLines) is still the newest. */
export function fixupCommentEdited(lines: string[], files: string[]): string {
  return [...lines, commentText(files, 2)].join("\n\n");
}

/** The one comment posted on the PR after a push made from a maintainer's instructions: the fix-up model's own list of what it changed (the files when it gave none); the instructions themselves are never posted. */
export const OPERATOR_COMMENT_TEMPLATE = "Fixes included:\n{{changes}}";
export function operatorCommentText(files: string[], changes: string[] = []): string {
  const items = changes.length ? changes : files.map((f) => `\`${f}\``);
  return OPERATOR_COMMENT_TEMPLATE.replace("{{changes}}", items.map((x, i) => `${i + 1}. ${x}`).join("\n"));
}

/** The commit message: a subject and one line per changed file. */
export function commitMessage(files: string[], operator = false): string {
  return `${operator ? "Apply requested fixes" : "Apply review fixes"}\n\n${files.map((f) => `- ${f}`).join("\n")}\n`;
}

export const HOLD_CANNOT_PUSH = "can't push to the contributor's branch";

/** The one comment posted on a PR we can't push to; `{{fixes}}` is one "- file: change" line per fix. */
export const ASK_TEMPLATE = "Before this can be merged, it needs these changes:\n{{fixes}}";
export const ASK_MAX_ITEMS = 6;
export const ASK_ITEM_MAX = 600;

/** The review's fix list is model-written from untrusted text: no links or mentions, capped in count and length. */
export function askText(fixes: { file: string; change: string }[]): string {
  const items = fixes.slice(0, ASK_MAX_ITEMS).flatMap((f) => {
    const change = cleanReason(f.change, ASK_ITEM_MAX);
    if (!change) return [];
    const line = `\`${f.file.replace(/[`\s]/g, "")}\`: ${change}`;
    return [`- ${line.length > ASK_ITEM_MAX - 2 ? `${line.slice(0, ASK_ITEM_MAX - 3).trimEnd()}…` : line}`];
  });
  return ASK_TEMPLATE.replace("{{fixes}}", items.join("\n"));
}

/** The comment after a carry-over push; `{{sources}}` are the closed PRs the parts came from. */
export const CARRY_COMMENT_TEMPLATE = "Carried over from {{sources}}: {{files}}.";
export function carryCommentText(sources: number[], files: string[]): string {
  return CARRY_COMMENT_TEMPLATE.replace("{{sources}}", sources.map((n) => `#${n}`).join(", ")).replace("{{files}}", files.map((f) => `\`${f}\``).join(", "));
}

/** The comment on a kept PR we can't push to; one "- #n: part" line per carried point. Points are model-written from untrusted text. */
export const CARRY_ASK_TEMPLATE = "Parts of the closed duplicates that fit here:\n{{points}}";
export function carryAskText(sources: { number: number; points: string[] }[]): string {
  const lines = sources.flatMap((s) => s.points.flatMap((p) => {
    const t = cleanReason(p, ASK_ITEM_MAX);
    if (!t) return [];
    const line = `#${s.number}: ${t}`;
    return [`- ${line.length > ASK_ITEM_MAX - 2 ? `${line.slice(0, ASK_ITEM_MAX - 3).trimEnd()}…` : line}`];
  })).slice(0, ASK_MAX_ITEMS);
  return CARRY_ASK_TEMPLATE.replace("{{points}}", lines.join("\n"));
}

/** The comment posted on the PR after the default branch was merged into it; `{{base}}` is the branch name. */
export const CONFLICT_COMMENT_TEMPLATE = "Merged {{base}} into this branch to resolve the conflict.";
/** The same comment edited after further merges; `{{count}}` is the number of merges, `{{time}}` the time of the last one (HH:MM). */
export const CONFLICT_COMMENT_REPEAT_TEMPLATE = "Merged {{base}} into this branch to resolve conflicts ({{count}} times, last at {{time}} UTC).";
/** `count` merges so far, the last at ISO time `at`. One merge gives the plain text. */
export function conflictCommentText(base: string, count = 1, at = ""): string {
  if (count < 2) return CONFLICT_COMMENT_TEMPLATE.replace("{{base}}", base);
  return CONFLICT_COMMENT_REPEAT_TEMPLATE.replace("{{base}}", base).replace("{{count}}", String(count)).replace("{{time}}", at.slice(11, 16));
}

/**
 * The number of merges a comment body reports, or null when the body (after its note line) is not our conflict comment for `base`.
 * A repeat text whose count can't be read counts as 2.
 */
export function conflictCommentCount(body: string, base: string): number | null {
  const text = body.replace(/^_[^\n]*_\n\n/, "");
  if (text === conflictCommentText(base)) return 1;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${esc(CONFLICT_COMMENT_REPEAT_TEMPLATE).replace(esc("{{base}}"), esc(base)).replace(esc("{{count}}"), "(\\d+)").replace(esc("{{time}}"), ".*")}$`).exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 2 ? n : 2;
}

/** The one comment per head on a conflicted PR we can't resolve ourselves. */
export const CONFLICT_ASK_TEMPLATE = "This branch conflicts with {{base}}. Could you merge or rebase {{base}} into it? The conflict needs a person to resolve.";
export function conflictAskText(base: string): string {
  return CONFLICT_ASK_TEMPLATE.replaceAll("{{base}}", base);
}

/** The merge commit's message. */
export function mergeMessage(base: string, branch: string): string {
  return `Merge ${base} into ${branch}\n`;
}
