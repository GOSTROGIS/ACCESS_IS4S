// Pre-merge review reply validation. No I/O and no Node imports: the prompt registry (also loaded by the web mockup)
// imports this file.
import { wholeReplyJson } from "../core/reply-json.ts";
import { safePath } from "../fixup/patch.ts";
import type { LintProblem } from "../replylint.ts";
import { evidenceAt, OPUS_MAX_FIXES, REFERENCE_LEAK, parseClaims, type Claim, parseStatementConflicts, type StatementConflict, type OwnerStatement } from "../review/opus-parse.ts";
import type { PremergeFinding } from "./types.ts";

export const PREMERGE_MAX_FINDINGS = 30;
export const PREMERGE_TITLE_CHARS = 160;
export const PREMERGE_SCENARIO_CHARS = 1500;
export const PREMERGE_FILE_CHARS = 300;
export const PREMERGE_FIX_CHARS = 800;
export const PREMERGE_SEARCHED_CHARS = 400;

export type PremergeReview = { findings: PremergeFinding[]; searched: string | null; conflicts: StatementConflict[]; /** A claim is unverified or the claims list is missing: a person decides, no fix-up. */ unsure: boolean; /** The claims of the title and body as stored and posted. */ claims: Claim[] };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function replyObject(text: string): Record<string, unknown> | null {
  const v = wholeReplyJson(text);
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

type Entry = { index: number; severity: "defect" | "minor"; file: string; line: number; title: string; scenario: string; fix?: { file: string; change: string } };

/** The well-formed entries of a valid reply (null when the reply is not valid), with the fixes over the cap already removed. */
function entries(text: string, ref: string): { entries: Entry[]; searched: string | null; conflicts: unknown } | null {
  const o = replyObject(text);
  if (!o || o.ref !== ref || !Array.isArray(o.findings)) return null;
  const out: Entry[] = [];
  let fixes = 0;
  o.findings.slice(0, PREMERGE_MAX_FINDINGS).forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const f = raw as Record<string, unknown>;
    if (f.severity !== "defect" && f.severity !== "minor") return;
    if (typeof f.file !== "string" || typeof f.title !== "string" || typeof f.scenario !== "string") return;
    const file = f.file.trim().slice(0, PREMERGE_FILE_CHARS), title = clean(f.title).slice(0, PREMERGE_TITLE_CHARS), scenario = f.scenario.trim().slice(0, PREMERGE_SCENARIO_CHARS);
    if (!file || !title || !scenario || typeof f.line !== "number" || !Number.isFinite(f.line)) return;
    const e: Entry = { index, severity: f.severity, file, line: Math.max(0, Math.round(f.line)), title, scenario };
    const x = f.fix as { file?: unknown; change?: unknown } | null | undefined;
    if (x && typeof x === "object" && typeof x.file === "string" && typeof x.change === "string" && x.change.trim() && safePath(x.file.trim()) && fixes < OPUS_MAX_FIXES) {
      e.fix = { file: x.file.trim().slice(0, PREMERGE_FILE_CHARS), change: x.change.trim().slice(0, PREMERGE_FIX_CHARS) };
      fixes++;
    }
    out.push(e);
  });
  return { entries: out, searched: typeof o.searched === "string" && o.searched.trim() ? clean(o.searched).slice(0, PREMERGE_SEARCHED_CHARS) : null, conflicts: o.conflicts };
}

/** The defects that claims make: the ones whose code is wrong. */
function claimFindings(claims: Claim[], files: readonly string[]): PremergeFinding[] {
  return claims.filter((c) => c.impact === "code-wrong").map((c) => {
    const at = evidenceAt(c.evidence, files), file = at && safePath(at.path) ? at.path : "(description)";
    return {
      severity: "defect" as const, file, line: at && file !== "(description)" ? at.line : 0,
      title: `Claim shows wrong code: ${c.claim}`.slice(0, PREMERGE_TITLE_CHARS),
      scenario: `The claim "${c.claim}" is ${c.status} and the code is wrong. ${c.evidence}`.slice(0, PREMERGE_SCENARIO_CHARS),
    };
  });
}

const leaks = (...s: string[]) => s.some((x) => REFERENCE_LEAK.test(x));

/**
 * The review in a reply for `ref`, or null when the reply is not valid (wrong ref, no `findings` array). An empty list is
 * valid. An entry without a valid severity, file, line, title or scenario is dropped, and so is one whose title or scenario
 * mentions the reference documentation or is in `drop`; a fix with a leak, an unsafe path or past the fix cap is dropped
 * from its finding. `drop`: texts the reply lint still flagged after the fix turn.
 * Claims: a claim of the title or body with impact "code-wrong" is a defect finding of its own. An "unknown" impact, or a missing
 * `claims` list when `body` is not empty, is no finding: it sets `unsure`, which sends the PR to a person. "description-only" is shown only.
 */
export function parsePremerge(text: string, ref: string, drop: ReadonlySet<string> = new Set(), known: readonly OwnerStatement[] = [], body = "", files: readonly string[] = []): PremergeReview | null {
  const r = entries(text, ref);
  if (!r) return null;
  const findings: PremergeFinding[] = [];
  for (const e of r.entries) {
    if (leaks(e.title, e.scenario) || drop.has(e.title) || drop.has(e.scenario)) { console.log("pre-merge finding dropped: its text mentions the reference documentation"); continue; }
    const { index: _, fix, ...rest } = e;
    const fixOk = fix && !leaks(fix.file, fix.change) && !drop.has(fix.file) && !drop.has(fix.change);
    findings.push(fixOk ? { ...rest, fix } : rest);
  }
  // A dropped fix does not free its place under the cap: the cap counts the fixes the model offered.
  // Every valid claim reaches the findings and `unsure`; only the stored and posted texts are cleaned. A list that was not fully read is unsure.
  const parsed = parseClaims((replyObject(text) ?? {}).claims, drop, false, files), claims = parsed?.claims ?? [];
  const unsure = parsed === null ? !!body.trim() : parsed.rejected > 0 || claims.some((c) => c.impact === "unknown");
  return { unsure, claims, findings: [...claimFindings(claims, files), ...findings].slice(0, PREMERGE_MAX_FINDINGS), searched: r.searched, conflicts: parseStatementConflicts(r.conflicts, known) };
}

/** The reference mentions in a valid reply that the model can fix itself; null when the reply is not valid. */
export function lintPremerge(text: string, ref: string, body = ""): LintProblem[] | null {
  const r = entries(text, ref);
  if (!r) return null;
  const out: LintProblem[] = [];
  if (body.trim() && !Array.isArray(replyObject(text)?.claims)) out.push({ field: "claims", message: "is missing; list every behavioural claim of the title and body with its status and file:line evidence" });
  const msg = "mentions the reference folder or one of its pages; state the behaviour in your own words";
  for (const e of r.entries) {
    for (const [k, v] of [["title", e.title], ["scenario", e.scenario]] as const) if (REFERENCE_LEAK.test(v)) out.push({ field: `findings[${e.index}].${k}`, message: msg, text: v });
    if (e.fix) for (const [k, v] of [["file", e.fix.file], ["change", e.fix.change]] as const) if (REFERENCE_LEAK.test(v)) out.push({ field: `findings[${e.index}].fix.${k}`, message: msg, text: v });
  }
  return out;
}

/** The texts of a reply for the reference checks, with the field each is in: title, scenario and fix. They reach Merge? facts, the item page and fix-up commits. */
export function premergeTexts(text: string, ref: string): { field: string; text: string }[] {
  const r = entries(text, ref);
  if (!r) return [];
  const pc = parseClaims(replyObject(text)?.claims, new Set(), true);
  const claims = (pc?.claims ?? []).flatMap((c, k) => { const i = pc!.indexes[k]!; return [{ field: `claims[${i}].claim`, text: c.claim }, ...(c.evidence ? [{ field: `claims[${i}].evidence`, text: c.evidence }] : [])]; });
  return [...claims, ...r.entries.flatMap((e) => [
    { field: `findings[${e.index}].title`, text: e.title }, { field: `findings[${e.index}].scenario`, text: e.scenario },
    ...(e.fix ? [{ field: `findings[${e.index}].fix.file`, text: e.fix.file }, { field: `findings[${e.index}].fix.change`, text: e.fix.change }] : []),
  ])];
}
