// Comparison report for a classification run: Jev against Haiku, and both against reference labels.
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { LABELS } from "./rules.ts";
import { slugOf } from "../owners.ts";

export type Row = {
  repo: string; number: number; kind: "pr" | "issue"; title: string;
  classifier: string; type_label: string; flags: string[]; reason: string; top: number | null;
};

export const ref = (r: { repo: string; number: number }) => `${r.repo}#${r.number}`;
export const itemUrl = (r: { repo: string; number: number; kind: string }) =>
  `https://github.com/${slugOf(r.repo)}/${r.kind === "pr" ? "pull" : "issues"}/${r.number}`;

export function loadRows(db: DatabaseSync, runId: string): Row[] {
  const rows = db.prepare(`SELECT c.repo, c.number, i.kind, i.title, c.classifier, c.type_label, c.flags, c.reason, c.probs
    FROM classifications c JOIN items i ON i.repo = c.repo AND i.number = c.number WHERE c.run_id = ?`).all(runId) as
    (Omit<Row, "flags" | "top"> & { flags: string | null; probs: string | null })[];
  return rows.map(({ flags, probs, ...r }) => ({
    ...r, flags: flags ? JSON.parse(flags) : [], top: probs ? (JSON.parse(probs).top ?? null) : null,
  }));
}

/** Reference labels from a `pr,labels added` CSV: the first of the six type labels on each line. */
export function loadReference(file: string, repo: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of readFileSync(file, "utf8").split("\n").slice(1)) {
    const [pr, labels] = line.trim().split(/,(.*)/s);
    const label = (labels ?? "").split("+").map((s) => s.trim()).find((l) => (LABELS as readonly string[]).includes(l));
    if (pr && label) m.set(`${repo}#${pr}`, label);
  }
  return m;
}

const pct = (a: number, n: number) => (n ? `${((100 * a) / n).toFixed(1)}%` : "-");
const frac = (a: number, n: number) => `${pct(a, n)} (${a}/${n})`;
const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

function confusion(title: string, pairs: [string, string][], rowName: string, colName: string): string {
  const cell = new Map<string, number>();
  for (const [a, b] of pairs) cell.set(`${a}|${b}`, (cell.get(`${a}|${b}`) ?? 0) + 1);
  const short = (l: string) => l.replace("missing feature", "missing").replace("plugin candidate", "plugin");
  return `**${title}** (rows: ${rowName}, columns: ${colName})\n\n` + table([" ", ...LABELS.map(short)],
    LABELS.map((a) => [short(a), ...LABELS.map((b) => cell.get(`${a}|${b}`) ?? 0)]));
}

export type Pair = { r: Row; jev: Row; haiku: Row; ref?: string };

export function pairUp(rows: Row[], reference: Map<string, string>): Pair[] {
  const by = new Map<string, Record<string, Row>>();
  for (const r of rows) {
    const e = by.get(ref(r)) ?? {};
    e[r.classifier] = r;
    by.set(ref(r), e);
  }
  const out: Pair[] = [];
  for (const e of by.values()) if (e.jev && e.haiku) out.push({ r: e.jev, jev: e.jev, haiku: e.haiku, ref: reference.get(ref(e.jev)) });
  return out.sort((a, b) => ref(a.r).localeCompare(ref(b.r), "en", { numeric: true }));
}

/** Finer confidence bands of a top-label probability, highest first; `lo` is inclusive, `hi` exclusive. */
export const BANDS = [
  { band: "≥0.99", lo: 0.99, hi: Infinity }, { band: "0.95–0.99", lo: 0.95, hi: 0.99 }, { band: "0.90–0.95", lo: 0.9, hi: 0.95 },
  { band: "0.80–0.90", lo: 0.8, hi: 0.9 }, { band: "0.70–0.80", lo: 0.7, hi: 0.8 }, { band: "0.50–0.70", lo: 0.5, hi: 0.7 },
  { band: "<0.50", lo: -Infinity, hi: 0.5 },
] as const;
export const bandIndex = (p: number): number => BANDS.findIndex((b) => p >= b.lo && p < b.hi);

export const band = (p: number | null) => (p === null ? "<0.7" : p >= 0.9 ? "≥0.9" : p >= 0.7 ? "0.7–0.9" : "<0.7");

export function compareReport(pairs: Pair[]): string {
  const agree = (ps: Pair[]) => ps.filter((p) => p.jev.type_label === p.haiku.type_label).length;
  const out: string[] = [];
  const prs = pairs.filter((p) => p.r.kind === "pr"), issues = pairs.filter((p) => p.r.kind === "issue");
  out.push(`Items classified by both: ${pairs.length} (${prs.length} PRs, ${issues.length} issues).\n`);

  out.push("### Jev vs Haiku, type label\n");
  out.push(table(["Group", "Agreement"], [["all", frac(agree(pairs), pairs.length)], ["PRs", frac(agree(prs), prs.length)], ["issues", frac(agree(issues), issues.length)]]));
  out.push("\nBy Jev's label:\n");
  out.push(table(["Jev label", "Items", "Agreement with Haiku"], LABELS.map((l) => {
    const ps = pairs.filter((p) => p.jev.type_label === l);
    return [l, ps.length, frac(agree(ps), ps.length)];
  })));

  const withRef = pairs.filter((p) => p.ref);
  out.push(`\n### Against the reference labels (${withRef.length} PRs)\n`);
  const ok = (c: "jev" | "haiku", ps: Pair[]) => ps.filter((p) => p[c].type_label === p.ref).length;
  out.push(table(["Classifier", "Agreement with reference"], [["Jev", frac(ok("jev", withRef), withRef.length)], ["Haiku", frac(ok("haiku", withRef), withRef.length)]]));
  out.push("\nPer reference label:\n");
  out.push(table(["Reference label", "Items", "Jev", "Haiku"], LABELS.map((l) => {
    const ps = withRef.filter((p) => p.ref === l);
    return [l, ps.length, frac(ok("jev", ps), ps.length), frac(ok("haiku", ps), ps.length)];
  })));

  out.push("\n### Confusion tables\n");
  out.push(confusion("Jev vs Haiku, all items", pairs.map((p) => [p.jev.type_label, p.haiku.type_label]), "Jev", "Haiku"));
  out.push("\n" + confusion("Reference vs Jev", withRef.map((p) => [p.ref!, p.jev.type_label]), "reference", "Jev"));
  out.push("\n" + confusion("Reference vs Haiku", withRef.map((p) => [p.ref!, p.haiku.type_label]), "reference", "Haiku"));

  out.push("\n### Jev by confidence (probability of its top label)\n");
  out.push(table(["Band", "Share of items", "Agrees with Haiku", "Agrees with reference"], ["≥0.9", "0.7–0.9", "<0.7"].map((b) => {
    const ps = pairs.filter((p) => band(p.jev.top) === b), rs = ps.filter((p) => p.ref);
    return [b, frac(ps.length, pairs.length), frac(agree(ps), ps.length), frac(ok("jev", rs), rs.length)];
  })));

  out.push("\n### Flags, Jev vs Haiku\n");
  out.push(table(["Flag", "Agreement", "Both true", "Only Jev", "Only Haiku"], ["security", "needs decision"].map((f) => {
    const j = (p: Pair) => p.jev.flags.includes(f), h = (p: Pair) => p.haiku.flags.includes(f);
    return [f, frac(pairs.filter((p) => j(p) === h(p)).length, pairs.length), pairs.filter((p) => j(p) && h(p)).length, pairs.filter((p) => j(p) && !h(p)).length, pairs.filter((p) => !j(p) && h(p)).length];
  })));
  return out.join("\n");
}
