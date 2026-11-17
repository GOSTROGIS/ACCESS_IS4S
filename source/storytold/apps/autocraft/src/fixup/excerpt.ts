// How a file over the size limit is shown to a patch model: the regions around the lines that matter, with real line
// numbers, instead of the whole file. Pure functions; src/prompts imports only the type.

/**
 * A file shown whole, in part, or by path only (a call with a sandbox checkout: the model reads the file there, so its
 * size does not matter). In part, `regions` hold numbered lines ("N| text") of a file `total_lines` long.
 */
export type ShownFile =
  | { path: string; content?: never; excerpt?: never }
  | { path: string; content: string; excerpt?: never }
  | { path: string; content?: never; excerpt: { total_lines: number; outline: string[]; regions: { from: number; to: number; text: string }[] } };

/** Lines kept on each side of a cited line or a changed hunk, and of a definition a fix names. */
export const REGION_MARGIN = 150;
export const DEFINITION_MARGIN = 60;
/** Characters of the outline, and of one outline entry. */
export const OUTLINE_CAP = 6_000;
const OUTLINE_LINE = 100;

const TOP_LEVEL = /^(?:pub(?:\([^)]*\))?\s+|export\s+|default\s+)?(?:async\s+|unsafe\s+|extern\s+"[^"]*"\s+)*(?:fn|impl|struct|enum|trait|mod|type|const|static|macro_rules!|function|class|def)\b/;
const RANGE = String.raw`(\d+)(?:\s*(?:-|–|to)\s*L?(\d+))?`;
/** The ways a fix cites lines: `line 5`, `lines 5-9`, `L5-9`, and `path:5`. A number after another colon (a column) is not a line. */
const citedRe = (path: string) => new RegExp(String.raw`(?:\blines?\s+|\bL)${RANGE}|${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:${RANGE}`, "gi");
const BACKTICKED = /`([A-Za-z_][A-Za-z0-9_]*)`/g;
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** Line ranges (1-based, inclusive) of the new side of the hunks the diff has for `path`. */
export function changedRanges(diff: string, path: string): [number, number][] {
  const out: [number, number][] = [];
  let inFile = false;
  for (const l of diff.split("\n")) {
    if (l.startsWith("diff --git ")) { inFile = l.endsWith(` b/${path}`); continue; }
    if (!inFile) continue;
    const m = HUNK.exec(l);
    if (m) out.push([Number(m[1]), Number(m[1]) + Math.max(Number(m[2] ?? 1) - 1, 0)]);
  }
  return out;
}

/** The size of a file as shown, in characters; what the caps count. */
export function shownSize(f: ShownFile): number {
  if (f.content !== undefined) return f.content.length;
  if (!f.excerpt) return 0;
  return f.excerpt.outline.reduce((n, o) => n + o.length + 1, 0) + f.excerpt.regions.reduce((n, r) => n + r.text.length + 1, 0);
}

/**
 * The file as the model sees it. A file within `fileCap` is shown whole. A larger one is shown as regions around the
 * lines the `cues` cite (`line 120`, `L40-60`, `path:77`) and around definitions they name in backticks, plus the changed
 * hunks of the diff, merged where they overlap, with an outline of its top-level items. Not ok when the regions alone
 * are over `fileCap`.
 */
export function viewFile(path: string, content: string, cues: string[], diff: string, fileCap: number): { ok: true; file: ShownFile } | { ok: false; reason: string } {
  if (content.length <= fileCap) return { ok: true, file: { path, content } };
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const n = lines.length;
  const cited = citedRe(path);
  const want: [number, number][] = [];
  const add = (from: number, to: number, margin: number) => want.push([Math.max(1, from - margin), Math.min(n, to + margin)]);
  for (const [a, b] of changedRanges(diff, path)) add(a, b, REGION_MARGIN);
  for (const cue of cues) {
    for (const m of cue.matchAll(cited)) {
      const a = Number(m[1] ?? m[3]), b = m[2] ?? m[4] ? Number(m[2] ?? m[4]) : a;
      if (a >= 1 && a <= n && b >= a) add(a, Math.min(b, n), REGION_MARGIN);
    }
    for (const m of cue.matchAll(BACKTICKED)) {
      const def = new RegExp(`\\b(?:fn|struct|enum|trait|type|const|static|mod|function|class|def)\\s+${m[1]}\\b`);
      const at = lines.findIndex((l) => def.test(l));
      if (at >= 0) add(at + 1, at + 1, DEFINITION_MARGIN);
    }
  }
  want.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const r of want) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  if (!merged.length) return { ok: false, reason: `${path} is over the ${fileCap} character limit and no line in it is cited or changed` };
  const regions = merged.map(([from, to]) => ({ from, to, text: lines.slice(from - 1, to).map((l, i) => `${from + i}| ${l}`).join("\n") }));
  const regionsSize = regions.reduce((k, r) => k + r.text.length + 1, 0);
  if (regionsSize > fileCap) return { ok: false, reason: `the parts of ${path} to show are over the ${fileCap} character limit` };
  // The outline takes what the regions leave; it is shortened, or dropped, before the file is refused.
  const room = Math.min(OUTLINE_CAP, fileCap - regionsSize);
  const outline: string[] = [];
  let size = 0;
  for (let i = 0; i < n && room >= 4; i++) {
    if (!TOP_LEVEL.test(lines[i]!)) continue;
    const entry = `${i + 1}| ${lines[i]!.trimEnd().slice(0, OUTLINE_LINE)}`;
    if (size + entry.length + 1 + 4 > room) { outline.push("..."); break; }
    outline.push(entry);
    size += entry.length + 1;
  }
  const file: ShownFile = { path, excerpt: { total_lines: n, outline, regions } };
  if (shownSize(file) > fileCap) return { ok: false, reason: `the parts of ${path} to show are over the ${fileCap} character limit` };
  return { ok: true, file };
}

/**
 * Why a change breaks the rule that edits land inside what the model was shown, or null. `diff` is the diff the patch
 * made (head to commit); every removed line and every insertion point of an excerpted file must lie inside one region.
 */
export function outsideShown(files: ShownFile[], diff: string): string | null {
  for (const f of files) {
    if (!f.excerpt) continue;
    const inside = (from: number, to: number) => f.excerpt.regions.some((r) => r.from <= from && to <= r.to);
    let inFile = false, at = 0;
    for (const l of diff.split("\n")) {
      if (l.startsWith("diff --git ")) { inFile = l === `diff --git a/${f.path} b/${f.path}`; continue; }
      if (!inFile) continue;
      const h = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(l);
      if (h) { at = Number(h[1]) + (h[2] === "0" ? 1 : 0); continue; }
      if (l.startsWith("-") && !l.startsWith("---")) { if (!inside(at, at)) return `the patch changes line ${at} of ${f.path}, outside the parts shown`; at++; }
      else if (l.startsWith("+") && !l.startsWith("+++")) { if (!inside(at - 1, at - 1) && !inside(at, at)) return `the patch inserts at line ${at} of ${f.path}, outside the parts shown`; }
      else if (l.startsWith(" ")) at++;
    }
  }
  return null;
}
