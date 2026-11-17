// The first line of every text AutoCraft posts to GitHub. src/github/write.ts adds it, so no post can skip it.
// No Node imports: the Prompts page lists templates that show the line.
import { modelLabel } from "../review/post-template.ts";

/**
 * Who stands behind the post.
 * - `model`: a model wrote the text on its own; `kind` names the post ("review", "comment", "issue", "pull request").
 * - `operator`: a model wrote or proposed the text and an operator chose to post it.
 * - `fixed`: template text, no model, posted on the pipeline's own initiative.
 * - `fixed-operator`: template text posted on an operator's choice.
 */
export type Note =
  | { by: "model"; kind: string; model: string | null | undefined }
  | { by: "operator"; model: string | null | undefined }
  | { by: "fixed" }
  | { by: "fixed-operator" };

// A post never says "unknown model": without a recorded model the name is left out.
const named = (model: string | null | undefined): string => (model?.trim() ? ` (${modelLabel(model)})` : "");

export function noteLine(n: Note): string {
  switch (n.by) {
    case "model": return `_AI-generated ${n.kind}${named(n.model)}. Not a maintainer decision._`;
    case "operator": return `_AI-generated reply${named(n.model)}_`;
    case "fixed": return "_Automated message. Not a maintainer decision._";
    case "fixed-operator": return "_Automated reply_";
  }
}

/** The text as posted: the note line, a blank line, then `text`. */
export const withNote = (n: Note, text: string): string => `${noteLine(n)}\n\n${text}`;
