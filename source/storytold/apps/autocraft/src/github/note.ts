// The first line of every text AutoCraft posts to GitHub. src/github/write.ts adds it, so no post can skip it.
// No Node imports: the Prompts page lists templates that show the line.
import { modelLabel } from "../review/post-template.ts";
import { parseServingMetadata, type ServingMetadata } from "../agents/provenance.ts";
import { servingLabel } from "../../web/src/lib/serving.ts";

/**
 * Who stands behind the post.
 * - `model`: a model wrote the text on its own; `kind` names the post ("review", "comment", "issue", "pull request").
 * - `operator`: a model wrote or proposed the text and an operator chose to post it.
 * - `fixed`: template text, no model, posted on the pipeline's own initiative.
 * - `fixed-operator`: template text posted on an operator's choice.
 */
export type Note =
  | { by: "model"; kind: string; model: string | null | undefined; serving?: ServingMetadata }
  | { by: "operator"; model: string | null | undefined; serving?: ServingMetadata }
  | { by: "fixed" }
  | { by: "fixed-operator" };

/** Stored unknown attribution is explicit; legacy absence retains the original note format. */
const named = (note: Extract<Note, { by: "model" | "operator" }>): string => note.serving !== undefined
  ? ` (${servingLabel(note.serving, "Model unknown")})` : (note.model?.trim() ? ` (${modelLabel(note.model)})` : "");

/** Pure result-reader adapter: no current provider policy, model inference or run-ID disclosure. */
export function storedNote<T extends Note>(note: T, raw: unknown): T {
  if (note.by !== "model" && note.by !== "operator") return note;
  const serving = parseServingMetadata(raw);
  return serving === undefined ? note : { ...note, serving };
}

export function noteLine(n: Note): string {
  switch (n.by) {
    case "model": return `_AI-generated ${n.kind}${named(n)}. Not a maintainer decision._`;
    case "operator": return `_AI-generated reply${named(n)}_`;
    case "fixed": return "_Automated message. Not a maintainer decision._";
    case "fixed-operator": return "_Automated reply_";
  }
}

/** The text as posted: the note line, a blank line, then `text`. */
export const withNote = (n: Note, text: string): string => `${noteLine(n)}\n\n${text}`;
