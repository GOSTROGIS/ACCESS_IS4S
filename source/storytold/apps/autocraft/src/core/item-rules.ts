// Constants and pure helpers of the triage rules for issues and PRs, shared by decide-item.ts and the loader. No imports.
// Each constant mirrors the old module named in its comment; test/decide-item.test.ts checks they stay equal.

/** Labels that make a disagreement a scope call . */
export const SCOPE_LABELS = ["missing feature", "small extra", "plugin candidate"];
export const isScope = (l: string | null): boolean => l !== null && SCOPE_LABELS.includes(l);

/** Type labels, exclusive on an item (labels/set.ts TYPE_LABELS). */
export const TYPE_LABEL_NAMES = ["bugfix", "performance", "missing feature", "small extra", "plugin candidate", "infra"];
export const isTypeLabel = (name: string): boolean => TYPE_LABEL_NAMES.includes(name.toLowerCase());
export const sameLabel = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
/** The type label an operator's `plugin` scope answer asks for (labels/plan.ts). */
export const PLUGIN_LABEL = "plugin candidate";

/** Opus recommendation for a scope decision: tries and the wait after a failure (decide/prepare.ts). */
export const RECOMMEND_MAX_FAILURES = 3;
export const RECOMMEND_RETRY_MS = 60 * 60_000;

/** Opus answers the label referee may fail to give for an item before the item goes to an operator as a scope decision; a failed item is asked again after RECOMMEND_RETRY_MS. */
export const REFEREE_MAX_FAILURES = 3;

/** The labels a pass would add to the item: its settled type (or the plugin answer's), the security and needs-decision flags. Null when nothing is settled or a type label conflicts. */
export function labelsToAdd(settled: { type: string; security: boolean; needsDecision: boolean } | null, plugin: boolean, existing: string[]): string[] | null {
  const s = plugin ? { type: PLUGIN_LABEL, security: settled?.security ?? false, needsDecision: false } : settled;
  if (!s) return null;
  if (existing.some((l) => isTypeLabel(l) && !sameLabel(l, s.type))) return null;
  const want = [s.type, ...(s.security ? ["security"] : []), ...(s.needsDecision ? ["needs decision"] : [])];
  return want.filter((w) => !existing.some((e) => sameLabel(e, w)));
}

/** The previous label pass (its "labeled" stage note, "added: a, b") already added every label in `add`. */
export function alreadyLabeled(note: string | null, add: string[]): boolean {
  if (!note) return false;
  const done = note.replace(/^added: /, "").split(", ");
  return add.every((a) => done.some((d) => d.toLowerCase() === a.toLowerCase()));
}
