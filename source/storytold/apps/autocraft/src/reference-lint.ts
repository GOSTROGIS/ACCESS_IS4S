// Checks of public-facing model text against the repo's private reference documentation: an overlap check
// (shingles of five words shared with the reference pages, see quotedTexts) and a semantic one (does the text refer to
// documentation or a vendor of another product: Jev first, Haiku for the unsure and while Jev is unavailable).
// Both only run for a repo that has a reference folder.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { isHalt } from "./agents/call.ts";
import { jevAvailable } from "./agents/jev.ts";
import { runModelStep } from "./agents/step.ts";
import { REFERENCE_HAIKU, REFERENCE_JEV } from "./agents/steps.ts";
import { QUOTE_WORDS, REFERENCE_JEV_ACCEPT, REFERENCE_JEV_REJECT, type LintProblem } from "./replylint.ts";
import { REFERENCE_LEAK } from "./review/opus-parse.ts";

/** Letters of other scripts that read as Latin ones; a quote written with them compares as the Latin text. */
const LOOKALIKE: Record<string, string> = {
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", і: "i", ї: "i", ј: "j", ѕ: "s", ԁ: "d", ԛ: "q", ԝ: "w", ɡ: "g", ı: "i",
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ω: "w",
};

/**
 * Words as the overlap checks compare them: lower case, compatibility forms folded (NFKD), no format characters (a
 * zero-width space), accents or look-alike letters of other scripts, and a word split by a hyphen, dot or underscore
 * joined again. Both the posted text and the source go through it, so a changed character does not hide a quote.
 */
export function words(s: string): string[] {
  const t = s.normalize("NFKD").replace(/[\p{Cf}\p{M}]/gu, "").toLowerCase()
    .replace(/[^\x00-\x7f]/g, (c) => LOOKALIKE[c] ?? c)
    .replace(/(?<=[\p{L}\p{N}])[-\u2010-\u2015_.'\u2019\u00b7]+(?=[\p{L}\p{N}])/gu, "");
  return t.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Words per shingle: the unit the overlap checks compare. */
export const SHINGLE_WORDS = 5;
/** A text of at least this many shingles counts as a quote when this share of them is in the source. */
const QUOTE_MIN_SHINGLES = 4;
const QUOTE_SHARE = 0.5;
/** Shingles of a whole reply found in the source from which it counts as quoting, whatever their share. */
const QUOTE_TOTAL = 16;
/** Consecutive matching shingles that make a run of QUOTE_WORDS words. */
const QUOTE_RUN = QUOTE_WORDS - SHINGLE_WORDS + 1;

/** A 52-bit hash of a shingle: a false match needs a collision among a few million entries, about 1 in 10^9 per shingle. */
function windowHash(w: string[], at: number): number {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = at; i < at + SHINGLE_WORDS; i++) {
    const x = w[i]!;
    for (let k = 0; k < x.length; k++) {
      const c = x.charCodeAt(k);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
      h2 ^= h2 >>> 13;
    }
    h1 = Math.imul(h1 ^ 32, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ 32, 0x85ebca6b) >>> 0;
  }
  return (h1 & 0xfffff) * 4294967296 + h2;
}

/** Sorted shingle hashes of source texts. */
export function shingleSet(texts: readonly string[]): Float64Array {
  let all = new Float64Array(1024), n = 0;
  for (const t of texts) {
    const w = words(t);
    for (let i = 0; i + SHINGLE_WORDS <= w.length; i++) {
      if (n === all.length) { const g = new Float64Array(all.length * 2); g.set(all); all = g; }
      all[n++] = windowHash(w, i);
    }
  }
  return all.slice(0, n).sort();
}

/**
 * The indexes of `texts` that quote the source: read as one stream in the given order (a post joins its fields, so a
 * quote split over several fields counts), a text quotes when half or more of its own shingles are in the source, or
 * when it takes part in a run of QUOTE_WORDS matching words or in a reply with QUOTE_TOTAL matching shingles or a
 * matching half of all.
 */
export function quotedTexts(texts: readonly string[], source: Float64Array): Set<number> {
  const out = new Set<number>();
  if (!source.length) return out;
  const w: string[] = [], owner: number[] = [];
  texts.forEach((t, k) => { for (const x of words(t)) { w.push(x); owner.push(k); } });
  const shingles = Math.max(0, w.length - SHINGLE_WORDS + 1);
  const hit: boolean[] = [];
  for (let i = 0; i < shingles; i++) hit.push(has(source, windowHash(w, i)));
  const own = texts.map(() => ({ all: 0, hit: 0 }));
  let total = 0, run = 0, longest = 0;
  for (let i = 0; i < shingles; i++) {
    if (hit[i]) { total++; run++; longest = Math.max(longest, run); } else run = 0;
    if (owner[i] === owner[i + SHINGLE_WORDS - 1]) { const o = own[owner[i]!]!; o.all++; if (hit[i]) o.hit++; }
  }
  own.forEach((o, k) => { if (o.all >= QUOTE_MIN_SHINGLES && o.hit >= o.all * QUOTE_SHARE) out.add(k); });
  const whole = longest >= QUOTE_RUN || total >= QUOTE_TOTAL || (shingles >= QUOTE_MIN_SHINGLES && total >= shingles * QUOTE_SHARE);
  if (whole) for (let i = 0; i < shingles; i++) if (hit[i]) for (let j = i; j < i + SHINGLE_WORDS; j++) out.add(owner[j]!);
  return out;
}

function textFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...textFiles(p));
    else if (e.isFile() && /\.(txt|md)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Changes whenever a page is added, removed, replaced or edited in place: folder mtime, file count, total size and newest file mtime. */
function stampOf(dir: string): string {
  const st = statSync(dir);
  let count = 0, size = 0, newest = 0;
  for (const f of textFiles(dir)) {
    const s = statSync(f);
    count++; size += s.size; newest = Math.max(newest, s.mtimeMs);
  }
  return `${st.mtimeMs}:${st.ino}:${count}:${size}:${newest}`;
}

const cache = new Map<string, { stamp: string; hashes: Float64Array }>();

/** Sorted shingle hashes of every page text of a reference folder, built once per process and rebuilt when the folder changes. */
function windows(dir: string): Float64Array {
  const stamp = stampOf(dir);
  const hit = cache.get(dir);
  if (hit?.stamp === stamp) return hit.hashes;
  const hashes = shingleSet(textFiles(dir).map((f) => readFileSync(f, "utf8")));
  cache.set(dir, { stamp, hashes });
  return hashes;
}

function has(sorted: Float64Array, x: number): boolean {
  let lo = 0, hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1, v = sorted[mid]!;
    if (v === x) return true;
    if (v < x) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

/** True when `text` quotes the reference pages of `dir` (see quotedTexts). */
export function quotesReference(text: string, dir: string): boolean {
  return quotedTexts([text], windows(dir)).size > 0;
}

export type SemanticDeps = {
  /** Jev's yes-probability that the text refers to outside documentation or a vendor; null when it gave no valid answer. */
  jev(text: string): Promise<number | null>;
  /** Haiku's verdict (true: it refers); null when it gave no valid answer. */
  haiku(text: string): Promise<boolean | null>;
  /** False while Jev is unavailable: Haiku then decides alone. Absent means available. */
  jevUsable?(): boolean;
};

/** The longest wait for a free account slot before the Haiku check gives up (counts as no): the fix turn must follow while the prompt cache is warm. */
export const HAIKU_WAIT_MS = 30_000;

export function defaultSemanticDeps(db: DatabaseSync, ref: string): SemanticDeps {
  return {
    async jev(text) {
      const r = await runModelStep(db, REFERENCE_JEV, { ref, text });
      return r.ok ? r.value : null;
    },
    async haiku(text) {
      const r = await runModelStep(db, REFERENCE_HAIKU, [{ ref, text }], { maxWaitMs: HAIKU_WAIT_MS });
      return r.ok ? r.value : null;
    },
    jevUsable: () => jevAvailable(db),
  };
}

/** Whether the text refers to outside documentation or a vendor: Jev at 0.9 or more says yes and below 0.3 no; Haiku decides the rest and everything while Jev is unavailable. An unanswered check counts as no. */
export async function refersToDocumentation(text: string, deps: SemanticDeps): Promise<boolean> {
  // A failed call (no account, a wait that ran out) counts as no for this text; a cancel stops the whole lint.
  const guard = async <T>(f: () => Promise<T>): Promise<T | null> => {
    try { return await f(); } catch (e) { if (isHalt(e)) throw e; console.log(`reference check failed: ${(e as Error).message}`); return null; }
  };
  const p = (deps.jevUsable?.() ?? true) ? await guard(() => deps.jev(text)) : null;
  if (p !== null && p >= REFERENCE_JEV_ACCEPT) return true;
  if (p !== null && p < REFERENCE_JEV_REJECT) return false;
  return (await guard(() => deps.haiku(text))) === true;
}

export type PublicText = { field: string; text: string };

/**
 * Public texts that repeat the owner statements the prompt showed: those are operators' words for the model's judgement
 * (answer notes and dashboard messages among them) and never go out in a post.
 */
export function statementProblems(texts: PublicText[], statements: readonly { text: string }[] | undefined): LintProblem[] {
  if (!statements?.length) return [];
  const quoted = quotedTexts(texts.map((t) => t.text), shingleSet(statements.map((x) => x.text)));
  return texts.filter((_t, k) => quoted.has(k)).map((t) => ({ field: t.field, message: "repeats an owner statement; the public text is about the code only, in your own words", text: t.text }));
}

/**
 * Problems of public-facing texts: a mention of the reference folder or a page file, a verbatim quote of the reference
 * pages, and (when `semantic` is given) a reference to outside documentation. Only for a repo with a reference folder `dir`.
 */
export async function referenceProblems(texts: PublicText[], dir: string | undefined, semantic?: SemanticDeps, opts: { stage?: "first" | "fix"; otherProblems?: number } = {}): Promise<LintProblem[]> {
  const out: LintProblem[] = [];
  const clean: PublicText[] = [];
  const quoted = dir ? quotedTexts(texts.map((t) => t.text), windows(dir)) : new Set<number>();
  texts.forEach((t, k) => {
    if (REFERENCE_LEAK.test(t.text)) out.push({ field: t.field, message: "mentions the reference folder or one of its pages; state the behaviour in your own words", text: t.text });
    else if (quoted.has(k)) out.push({ field: t.field, message: "quotes the reference documentation; state the behaviour in your own words", text: t.text });
    else clean.push(t);
  });
  // The model checks are the slow part: when other problems already force a fix turn, they wait for the fix reply.
  if (!dir || !semantic || (opts.stage === "first" && out.length + (opts.otherProblems ?? 0) > 0)) return out;
  for (const t of clean) if (await refersToDocumentation(t.text, semantic)) out.push({ field: t.field, message: "refers to outside documentation; state the behaviour in your own words", text: t.text });
  return out;
}
