// Texts the Fix stage writes on GitHub. No Node imports: the prompt registry shows them on the Prompts page.
import { dropMarkup, settle } from "../review/public-text.ts";

export const COMMENT_TEMPLATE = "A PR for this is in progress: {{url}}.";
/** The comment posted once on an issue when the pipeline starts a fix for it. */
export const CLAIM_COMMENT_TEMPLATE = "A PR for this is in progress.";
export const claimCommentText = (): string => CLAIM_COMMENT_TEMPLATE;
export const PR_TITLE_TEMPLATE = "Fix {{title}}";
export const PR_BODY_TEMPLATE = "Fixes #{{number}}.\n\n{{change}}\n\n{{test}}\n";

export const commentText = (url: string): string => COMMENT_TEMPLATE.replace("{{url}}", url);

/**
 * The issue title as a line the pipeline may author: no URL, issue reference ("#12", "GH-12", "owner/repo#12") or
 * mention, so a closing keyword in it names nothing and nobody is pinged. A reference reads "issue 12".
 */
export function plainTitle(title: string): string {
  return settle(title.replace(/\s+/g, " "), (t) => dropMarkup(t
    .replace(/<?(?<![A-Za-z0-9])(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>]*>?/gi, "")
    .replace(/(?<![A-Za-z0-9])GH-(\d+)(?![A-Za-z0-9])/gi, "issue $1")
    .replace(/(?<![A-Za-z0-9])(?:[\w.-]+\/[\w.-]+)?#(\d+)(?![A-Za-z0-9])/g, "issue $1"))).replace(/\s+/g, " ").trim();
}

/** The one-sentence line a model gives is not used: the text is built from facts our code knows and the cleaned issue title. */
export function prTitle(title: string): string {
  const t = plainTitle(title).replace(/^fix(es|ed)?:?\s+/i, "").replace(/[.\s]+$/, "");
  const cut = t.length > 70 ? `${t.slice(0, 70).replace(/\s+\S*$/, "")}` : t;
  return PR_TITLE_TEMPLATE.replace("{{title}}", cut.charAt(0).toLowerCase() + cut.slice(1));
}

export function prBody(number: number, files: string[], testPath: string): string {
  const change = `The change is in ${files.map((f) => `\`${f}\``).join(", ")}.`;
  const test = `The regression test \`${testPath}\` fails without the change and passes with it.`;
  return PR_BODY_TEMPLATE.replace("{{number}}", String(number)).replace("{{change}}", change).replace("{{test}}", test);
}

export function commitMessage(number: number, title: string, files: string[]): string {
  return `${prTitle(title)}\n\nFixes #${number}.\n\n${files.map((f) => `- ${f}`).join("\n")}\n`;
}

/** `autocraft/fix-<number>-<slug>`: the slug comes from the issue title only. */
export function branchName(number: number, title: string, login: string): string {
  let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  if (login && slug.includes(login.toLowerCase())) slug = "";
  return `autocraft/fix-${number}${slug ? `-${slug}` : ""}`;
}
