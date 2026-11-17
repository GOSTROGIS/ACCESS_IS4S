// The repository files CI workflows run: relative paths named in their `run:` steps (joined with the step's working
// directory), and the directories of local actions they use. Pure: no Node imports.
import { joinPath } from "./cargo-manifest.ts";

/** What the workflows run. `runs`: each run step's text with its working directories (none set: the repository root and the defaults). */
export type WorkflowSteps = { runs: { text: string; dirs: string[] }[]; actions: string[] };

const indentOf = (l: string) => l.length - l.trimStart().length;

/** The value of a `key:` at line `i`: the inline text, or the indented block after `|` or `>`. `end`: the last line read. */
function valueAt(lines: string[], i: number, inline: string): { text: string; end: number } {
  const v = inline.trim();
  if (!/^[|>][-+0-9]*\s*(#.*)?$/.test(v)) return { text: v.replace(/^(["'])(.*)\1$/, "$2"), end: i };
  const key = indentOf(lines[i]!);
  const block: string[] = [];
  let j = i + 1;
  for (; j < lines.length; j++) {
    const l = lines[j]!;
    if (l.trim() && indentOf(l) <= key) break;
    block.push(l);
  }
  return { text: block.join("\n"), end: j - 1 };
}

/** The run steps and local actions of one workflow file. Working directories from `defaults` apply to steps that set none. */
export function workflowSteps(yaml: string): WorkflowSteps {
  const lines = yaml.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  const out: WorkflowSteps = { runs: [], actions: [] };
  const defaults: string[] = [];
  const steps: { text: string; dir: string | null }[] = [];
  const usesOf = (l: string) => { const u = /^\s*(?:-\s+)?uses:\s*["']?\.\/([^\s"'#]+)/.exec(l); if (u) out.actions.push(`${u[1]!.replace(/\/+$/, "")}/`); };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const def = /^(\s*)defaults:\s*(#.*)?$/.exec(l);
    if (def) {
      // `defaults: run: working-directory:` of the workflow or a job.
      const at = def[1]!.length;
      for (let j = i + 1; j < lines.length && (!lines[j]!.trim() || indentOf(lines[j]!) > at); j++) {
        const w = /^\s*working-directory:\s*(.*)$/.exec(lines[j]!);
        if (w) defaults.push(valueAt(lines, j, w[1]!).text);
      }
      continue;
    }
    const dash = /^(\s*)-\s+/.exec(l);
    if (!dash) { usesOf(l); continue; }
    // One list item: its keys sit at the dash's indent plus two, the first one on the dash line. The item is read whole.
    const at = dash[1]!.length;
    let end = i + 1;
    while (end < lines.length && (!lines[end]!.trim() || indentOf(lines[end]!) > at)) end++;
    const item = lines.slice(i, end);
    item.forEach(usesOf);
    item[0] = item[0]!.replace(/^(\s*)-\s+/, (_m, sp: string) => `${sp}  `);
    let run: string | null = null, dir: string | null = null;
    for (let k = 0; k < item.length; k++) {
      if (indentOf(item[k]!) !== at + 2) continue;
      const m = /^\s*(run|working-directory):\s*(.*)$/.exec(item[k]!);
      if (!m) continue;
      const v = valueAt(item, k, m[2]!);
      if (m[1] === "run") { run = v.text; k = v.end; } else dir = v.text;
    }
    if (run !== null) steps.push({ text: run, dir });
    i = end - 1;
  }
  for (const s of steps) out.runs.push({ text: s.text, dirs: s.dir !== null ? [s.dir] : ["", ...defaults] });
  return out;
}

/** The steps of several workflow files as one. */
export const mergeSteps = (all: WorkflowSteps[]): WorkflowSteps => ({ runs: all.flatMap((w) => w.runs), actions: all.flatMap((w) => w.actions) });

const OWN_RULES = /(^|\/)(Cargo\.toml|Cargo\.lock|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|pyproject\.toml|uv\.lock|poetry\.lock|go\.mod|go\.sum)$/;

/**
 * The repo-relative files named in run steps: tokens split at shell punctuation, with a leading `./` removed, joined with
 * each of the step's working directories. A working directory set by an expression (`${{ matrix.dir }}`) is unknown, so
 * its tokens are suffixes: any path ending in `/<token>` matches. Manifests and lockfiles are left out: their own rules
 * read what changes in them.
 */
export function runPaths(steps: WorkflowSteps): { exact: Set<string>; suffix: Set<string> } {
  const exact = new Set<string>(), suffix = new Set<string>();
  for (const r of steps.runs) for (const t of r.text.replace(/\$\{\{\s*github\.workspace\s*\}\}\//g, "").split(/[\s;&|()<>"'`=,]+/)) {
    if (!t || t.startsWith("/") || t.startsWith("-") || t.includes("$")) continue;
    for (const d of r.dirs) {
      const p = joinPath(d.includes("$") ? "" : d, t);
      if (!p || OWN_RULES.test(p)) continue;
      (d.includes("$") ? suffix : exact).add(p);
    }
  }
  return { exact, suffix };
}

/** Whether a run step calls the repository's xtask crate. */
export const callsXtask = (steps: WorkflowSteps): boolean =>
  steps.runs.some((r) => /\bcargo\s+(\+\S+\s+)?xtask\b|\bcargo\s+(\+\S+\s+)?run\b[^\n]*(-p|--package)[\s=]*xtask\b/.test(r.text));

/** Paths that look like code a workflow could run; with the workflows unread, a change to one needs a person. */
export const SCRIPT_LIKE = /\.(sh|bash|ps1)$|(^|\/)(scripts?|ci|xtask)\//i;
const XTASK = /(^|\/)xtask\//;
/** Docs, images, Rust and web sources and data files: a run step does not run one by name. */
const NOT_RUN = /\.(md|markdown|mdx|rst|adoc|txt|png|jpe?g|gif|webp|svg|ico|rs|tsx|jsx|css|scss|html?|json|toml|lock|ya?ml)$/i;
/** Paths a run step could name; a diff without one needs no workflows read. */
export const mayBeRun = (path: string): boolean => SCRIPT_LIKE.test(path) || !NOT_RUN.test(path);

/** Whether a changed file is one the workflows run: named in a run step, inside a local action's directory, or in the xtask crate a step calls. */
export function runByWorkflow(path: string, steps: WorkflowSteps, named: { exact: Set<string>; suffix: Set<string> }): boolean {
  return named.exact.has(path) || [...named.suffix].some((t) => path === t || path.endsWith(`/${t}`)) || steps.actions.some((a) => path.startsWith(a)) || (XTASK.test(path) && callsXtask(steps));
}
