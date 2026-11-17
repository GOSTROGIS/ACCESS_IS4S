// The label set from the proposal to label community PRs instead of closing them.
// Type labels are exclusive (one per item); flags sit next to the type.

export type LabelDef = { name: string; color: string; description: string };

export const TYPE_LABELS: LabelDef[] = [
  { name: "bugfix", color: "d73a4a", description: "Fixes something that is broken: wrong result, crash, data loss" },
  { name: "performance", color: "fbca04", description: "Same behaviour, faster or uses less memory" },
  { name: "missing feature", color: "0e8a16", description: "The reference application has it and we do not, or only part of it" },
  { name: "small extra", color: "c5def5", description: "Goes beyond the reference application, but is tiny and changes no default" },
  { name: "plugin candidate", color: "7057ff", description: "A good idea that is too specific or too big for the core" },
  { name: "infra", color: "bfd4f2", description: "Tests, CI, docs, build, packaging, tooling" },
];

export const FLAG_LABELS: LabelDef[] = [
  { name: "security", color: "b60205", description: "A real security hole is fixed, or security hardening" },
  { name: "needs decision", color: "e99695", description: "Needs a product or scope decision by a maintainer" },
];

export const ALL_LABELS: LabelDef[] = [...TYPE_LABELS, ...FLAG_LABELS];

const lower = (s: string) => s.toLowerCase();
const TYPE_SET = new Set(TYPE_LABELS.map((l) => lower(l.name)));

export const isTypeLabel = (name: string): boolean => TYPE_SET.has(lower(name));
export const sameLabel = (a: string, b: string): boolean => lower(a) === lower(b);
