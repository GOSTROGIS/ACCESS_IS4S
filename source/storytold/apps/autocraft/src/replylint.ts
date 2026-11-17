// Reply lint: checks a parsed reply for problems the model can fix itself, and the one follow-up message that
// sends them back. No I/O and no Node imports: the prompt registry imports this file.
import { wholeReplyJson } from "./core/reply-json.ts";

/** One problem of a reply: the field it is in and what is wrong, in one short line. `text` is the offending text where the fallback needs to find it again. */
export type LintProblem = {
  field: string; message: string; text?: string;
  /** Reply fields the fix turn returns for this problem when `field` is not itself a reply field (default: `field`). */
  fix?: string[];
  /** The text is never posted or shown to viewers: the problem is recorded and the model is not asked to fix it. */
  internal?: boolean;
};

/** Problems of a reply, or null when the reply cannot be read at all (the caller's own validation decides what happens then). */
/** `stage`: "first" for the model's first reply, "fix" for the reply to a fix turn (the costly checks may wait for the second). */
export type Lint = (text: string, stage: "first" | "fix") => Promise<LintProblem[] | null> | LintProblem[] | null;

/** The offending texts of problems the fix turn did not clear, for the fallback that leaves them out. */
export const dropTexts = (problems: readonly LintProblem[] | undefined): Set<string> => new Set((problems ?? []).flatMap((p) => (p.text === undefined ? [] : [p.text])));

/** Whether a fix turn is worth its cost: at least one problem is in text that is posted or shown. */
export const needsFixTurn = (problems: readonly LintProblem[]): boolean => problems.some((p) => p.internal !== true);

const fieldsOf = (problems: readonly LintProblem[]): string[] => [...new Set(problems.filter((p) => p.internal !== true).flatMap((p) => p.fix ?? [p.field]))];

/** The follow-up message: fixed text around the list, so the prompt cache covers everything but the problems. The turn runs with no tools and one turn, and returns only the flagged fields. */
export function fixTurnMessage(problems: readonly LintProblem[]): string {
  const list = problems.filter((p) => p.internal !== true);
  return `Your reply has these problems:\n${list.map((p) => `- ${p.field}: ${p.message}`).join("\n")}\nDo not use tools. Send only the corrected fields as one JSON object whose keys are these field names exactly (${fieldsOf(problems).join(", ")}) and whose values are the corrected values, in the same format as in your reply. Send nothing else.`;
}

/** The reply's one JSON value (see wholeReplyJson) when it is an object or a list of one. */
const jsonRoot = (text: string): { root: unknown; array: boolean } | null => {
  const v = wholeReplyJson(text);
  if (Array.isArray(v)) return v.length === 1 ? { root: v, array: true } : null;
  return typeof v === "object" && v !== null ? { root: v, array: false } : null;
};

const isObj = (v: unknown): v is Record<string, unknown> | unknown[] => typeof v === "object" && v !== null;

/** Sets `path` (`public.points[1]`, `claims[0].claim`) in `target`; only where the parent exists, or a new top-level key. */
function setPath(target: Record<string, unknown>, path: string): ((v: unknown) => void) | null {
  const keys = path.match(/[^.[\]]+/g);
  if (!keys?.length) return null;
  let node: unknown = target;
  for (const k of keys.slice(0, -1)) { if (!isObj(node)) return null; node = (node as Record<string, unknown>)[k]; }
  const last = keys[keys.length - 1]!;
  if (!isObj(node)) return null;
  if (Array.isArray(node) ? !/^\d+$/.test(last) || Number(last) >= node.length : !(last in node) && keys.length > 1) return null;
  return (v) => { (node as Record<string, unknown>)[last] = v; };
}

const BLOCK = /```(choices|actions)([ \t]*\r?\n)([\s\S]*?)```/g;

/** Which fenced block a field belongs to: `cards[...]` is the actions array (its root), cores/add/ask the choices object; anything else is the plain JSON reply. */
const blockOfField = (field: string): { lang: "actions" | "choices"; path: string } | null =>
  field.startsWith("cards[") ? { lang: "actions", path: field.slice("cards".length) } : /^(cores|add|ask)\b/.test(field) ? { lang: "choices", path: field } : null;

/**
 * The first reply with the fix turn's corrected fields put in. Only the fields the problems asked for are taken, and only where they exist in the first reply
 * (or are new top-level fields); the rest stays as the first turn wrote it. Fields in a fenced `choices` or `actions` block are patched inside that block, and all prose and
 * other blocks stay; other fields are patched in the reply's one JSON value, fenced or not. Null when the fix reply is not a JSON object or nothing could be put in.
 */
export function mergeFixFields(original: string, fix: string, problems: readonly LintProblem[]): string | null {
  const f = jsonRoot(fix);
  if (!f || f.array || !isObj(f.root) || Array.isArray(f.root)) return null;
  const patch = f.root as Record<string, unknown>;
  const blocks = new Map<string, { root: unknown; text: string }>();
  for (const m of original.matchAll(BLOCK)) {
    if (blocks.has(m[1]!)) continue;
    try { blocks.set(m[1]!, { root: JSON.parse(m[3]!), text: m[0] }); } catch { /* an unreadable block takes no fields */ }
  }
  let plain: { root: unknown; array: boolean } | null = null;
  let put = 0;
  const changed = new Set<string>();
  for (const field of fieldsOf(problems)) {
    if (!(field in patch)) continue;
    const at = blockOfField(field);
    let set: ((v: unknown) => void) | null = null;
    if (at) {
      const b = blocks.get(at.lang);
      if (b && isObj(b.root)) set = setPath(b.root as Record<string, unknown>, at.path);
      if (set) changed.add(at.lang);
    } else {
      plain ??= /```(choices|actions)/.test(original) ? null : jsonRoot(original);
      const target = plain && (plain.array ? (plain.root as unknown[])[0] : plain.root);
      if (isObj(target) && !Array.isArray(target)) set = setPath(target as Record<string, unknown>, field);
    }
    if (!set) continue;
    set(patch[field]);
    put++;
  }
  if (!put) return null;
  if (plain && !changed.size) return JSON.stringify(plain.root);
  return original.replace(BLOCK, (whole, lang: string, nl: string) => (changed.has(lang) && blocks.get(lang)?.text === whole ? `\`\`\`${lang}${nl}${JSON.stringify(blocks.get(lang)!.root)}\n\`\`\`` : whole));
}

/** The semantic reference check accepts a yes from Jev at this probability or more, and a no below the second one; Haiku decides in between. */
export const REFERENCE_JEV_ACCEPT = 0.9;
export const REFERENCE_JEV_REJECT = 0.3;

/** What lint.reference.haiku is asked about: one text with the ref of the item it is written for. */
export type ReferenceLintInput = { ref: string; text: string };

export const SAMPLE_REFERENCE_LINT: ReferenceLintInput[] = [{ ref: "app#1", text: "The 16-bit PNG export keeps its size after a resize, as the user guide describes." }];

/** A run of this many consecutive words of a public text that also appears in the reference pages counts as a quote. */
export const QUOTE_WORDS = 12;
