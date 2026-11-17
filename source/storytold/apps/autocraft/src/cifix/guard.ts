// Deterministic limits on what a CI fix may change, applied before the Opus check: a patch that makes a failing check
// pass by changing the check (tests, lints, CI config) is never pushed.
export const TEST_PATH = /(^|\/)(tests?|benches)\/|(^|\/)tests?\.rs$|_tests?\.rs$|(^|\/)test_[^/]*\.rs$/;
const DISABLES = /#\s*!?\s*\[\s*(?:(?:allow|ignore|warn|expect|cfg_attr|should_panic)\b|cfg\s*\()/;
const DROPS_CHECK = /#\s*\[\s*test\b|\bassert(_eq|_ne)?\s*!|\bdebug_assert/;
const EARLY_RETURN = /^\s*return\s*;/;
/** Attribute names that switch off a lint or a test, or choose code by configuration. */
const DISABLING = new Set(["allow", "ignore", "warn", "expect", "cfg_attr", "should_panic", "cfg"]);

type Range = { from: number; to: number };
type Code = { t: string; line: number }[];
type Attr = { inner: boolean; name: string; last: string; idents: Set<string>; span: Range; item: Range | null };

/** The tokens of `src` other than comments (see rustTokenSpans), each with its 1-based line; null when not tokenizable. */
function codeTokens(src: string): Code | null {
  const spans = rustTokenSpans(src);
  if (!spans) return null;
  const starts = [0];
  for (let i = src.indexOf("\n"); i >= 0; i = src.indexOf("\n", i + 1)) starts.push(i + 1);
  const lineAt = (at: number): number => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid]! <= at) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  return spans.filter((x) => !x.t.startsWith("c:") && !x.t.startsWith("C:")).map((x) => ({ t: x.t, line: lineAt(x.at) }));
}

const OPEN = new Set(["p:(", "p:[", "p:{"]), CLOSE = new Set(["p:)", "p:]", "p:}"]);

/** The index of the token that closes the bracket opened at `i`, or -1. */
function closing(code: Code, i: number): number {
  let depth = 0;
  for (let j = i; j < code.length; j++) {
    if (OPEN.has(code[j]!.t)) depth++;
    else if (CLOSE.has(code[j]!.t) && --depth === 0) return j;
  }
  return -1;
}

/** Where the item after an outer attribute ends: its closing brace, or the `;` of a body-less item; -1 when it does not. */
function itemEnd(code: Code, i: number): number {
  let depth = 0, started = false;
  for (let j = i; j < code.length; j++) {
    const t = code[j]!.t;
    if (t === "p:{" && depth === 0) started = true;
    if (OPEN.has(t)) depth++;
    else if (CLOSE.has(t)) { if (--depth < 0) return -1; if (depth === 0 && started && t === "p:}") return j; }
    else if (t === "p:;" && depth === 0 && !started) return j;
  }
  return -1;
}

const ident = (t: string | undefined): string | null => (t?.startsWith("i:") ? t.slice(2).replace(/^r#/, "") : null);

/**
 * The attributes of a Rust file, read from its tokens wherever line breaks and comments fall: the name, the last path
 * segment (`tokio::test` is `test`), the identifiers inside, the attribute's own lines and, for an outer test attribute
 * (`cfg` with `test`, or a path ending in `test`), the lines of the item it guards. null when such an attribute or its
 * item does not close: the file is then not understood.
 */
function attributes(code: Code): Attr[] | null {
  const out: Attr[] = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i]!.t !== "p:#") continue;
    const inner = code[i + 1]?.t === "p:!";
    const open = inner ? i + 2 : i + 1;
    if (code[open]?.t !== "p:[") continue;
    const close = closing(code, open);
    if (close < 0) return null;
    const body = code.slice(open + 1, close);
    const name = ident(body[0]?.t) ?? "";
    let last = name;
    for (let k = 1; body[k]?.t === "p::" && body[k + 1]?.t === "~:"; k += 3) last = ident(body[k + 2]?.t) ?? last;
    const idents = new Set(body.flatMap((x) => ident(x.t) ?? []));
    // Only test attributes need the item they guard; others may sit where no item follows (a macro pattern).
    let item: Range | null = null;
    if (!inner && ((name === "cfg" && idents.has("test")) || last === "test")) {
      const end = itemEnd(code, close + 1);
      if (end < 0) return null;
      item = { from: code[i]!.line, to: code[end]!.line };
    }
    out.push({ inner, name, last, idents, span: { from: code[i]!.line, to: code[close]!.line }, item });
  }
  return out;
}

/** The lines of each `cfg!` macro call. */
function cfgMacros(code: Code): Range[] | null {
  const out: Range[] = [];
  for (let i = 0; i + 2 < code.length; i++) {
    if (ident(code[i]!.t) !== "cfg" || code[i + 1]!.t !== "p:!" || !OPEN.has(code[i + 2]!.t)) continue;
    const close = closing(code, i + 2);
    if (close < 0) return null;
    out.push({ from: code[i]!.line, to: code[close]!.line });
  }
  return out;
}

/** The lines git's own diff changes in one file: removed lines by old number, added lines by new number, and the new line after which old lines were removed. */
type Changes = { removed: Map<number, string>; added: Map<number, string>; cuts: Set<number> };

/** Per file, the lines a git diff changes; null when the diff cannot be read. */
function diffChanges(diff: string): Map<string, Changes> | null {
  const out = new Map<string, Changes>();
  let cur: Changes | null = null, hunk = false, old = 0, now = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("diff --git ")) {
      const d = /^diff --git a\/(\S+) b\/(\S+)$/.exec(l);
      if (!d || d[1] !== d[2]) return null;
      cur = { removed: new Map(), added: new Map(), cuts: new Set() };
      out.set(d[1]!, cur);
      hunk = false;
      continue;
    }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h && cur) { hunk = true; old = Number(h[1]); now = Number(h[2]); continue; }
    if (!hunk || !cur) continue;
    if (l.startsWith("-")) { cur.removed.set(old, l.slice(1)); cur.cuts.add(now - 1); old++; }
    else if (l.startsWith("+")) { cur.added.set(now, l.slice(1)); now++; }
    else if (l.startsWith(" ")) { old++; now++; }
  }
  return out;
}

const touches = (c: Changes, r: Range): boolean => {
  for (let k = r.from; k <= r.to; k++) if (c.added.has(k) || (k < r.to && c.cuts.has(k))) return true;
  return false;
};
const isTestCfg = (a: Attr): boolean => a.name === "cfg" && a.idents.has("test");

/**
 * Why the patch may not be pushed, or null. `diff` is git's own diff from the PR head to the tree with the patch
 * applied, and `sides` maps each file it changes to the content at the head and after the patch, so the lines judged
 * are the lines git changed, wherever the patch's hunk headers said they were. A Rust file is judged on its tokens:
 * changed lines inside `#[cfg(test)]` items (before or after the patch) are refused, so is an attribute that switches
 * off a lint or a test (or a `cfg!` call) on a changed line however it is split or commented, and an early `return;`
 * added to a test function. A file whose content is missing or not understood is refused.
 */
export function guardPatch(diff: string, sides: Map<string, { before: string; after: string }>): string | null {
  const changes = diffChanges(diff);
  if (!changes) return "the applied patch could not be read to check it";
  for (const [file, c] of changes) {
    if (TEST_PATH.test(file)) return `the patch edits a test file (${file})`;
    const side = sides.get(file);
    if (!side) return `the content of ${file} could not be read to check it`;
    if ([...c.removed.values()].some((l) => DROPS_CHECK.test(l))) return "the patch removes a test or an assertion";
    if (!file.endsWith(".rs")) {
      if ([...c.added.values()].some((l) => DISABLES.test(l))) return "the patch adds an attribute that disables a lint or a test";
      continue;
    }
    const before = codeTokens(side.before), after = codeTokens(side.after);
    const was = before && attributes(before), is = after && attributes(after), macros = after && cfgMacros(after);
    if (!was || !is || !macros) return `${file} could not be checked for test code`;
    if ([...was, ...is].some((a) => a.inner && isTestCfg(a))) return `${file} is test-only code`;
    if (is.some((a) => DISABLING.has(a.name) && touches(c, a.span)) || macros.some((r) => touches(c, r))) return "the patch adds an attribute that disables a lint or a test";
    if (was.some((a) => a.item && isTestCfg(a) && [...c.removed.keys()].some((k) => k >= a.item!.from && k <= a.item!.to)) || is.some((a) => a.item && isTestCfg(a) && touches(c, a.item))) return `the patch changes test code in ${file}`;
    const tests = is.filter((a) => a.item && a.last === "test");
    if ([...c.added].some(([k, l]) => EARLY_RETURN.test(l) && tests.some((a) => k >= a.item!.from && k <= a.item!.to))) return `the patch adds an early return to a test in ${file}`;
  }
  return null;
}

/** Pairs of punctuation characters that form one operator; written apart (`- >`) they are other tokens. Other neighbours (`=&`, `{ }`) may be respaced freely. */
const COMPOUND = new Set(["->", "=>", "==", "!=", "<=", ">=", "&&", "||", "<<", ">>", "+=", "-=", "*=", "/=", "%=", "^=", "&=", "|=", "..", "::", "..=", "...", "<<=", ">>="]);
const RUST_SPACE = /[ \t\n\r\v\f\u0085\u200e\u200f\u2028\u2029]/;
const IDENT = /[\p{L}\p{N}_]/u;
const CHAR_LIT = /^'(?:\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F_]+\}|[^\n])|[^\\'\n])'/;
const trimLines = (t: string) => t.split("\n").map((l) => l.trimEnd()).join("\n");

/**
 * Rust tokens of `src`: identifiers and numbers, string, char and raw-string literals with their exact text, comments
 * as tokens (trailing spaces ignored), lifetimes, and single punctuation characters (marked when glued into a two-character operator: `->` is not `- >`). Whitespace is the only thing not kept. null when a string or comment is not closed.
 */
export function rustTokens(src: string): string[] | null {
  return rustTokenSpans(src)?.map((t) => t.t) ?? null;
}

/** rustTokens with each token's start offset in `src`. */
export function rustTokenSpans(src: string): { t: string; at: number }[] | null {
  const spans: { t: string; at: number }[] = [];
  let i = 0;
  // Every push happens at the token's start, before `i` moves past it.
  const out = { push: (t: string) => { spans.push({ t, at: i }); } };
  let lastPunctEnd = -1, run = "";
  const n = src.length;
  // Rust ignores a first-line shebang (`#!` not followed by `[`); it is one comment token here.
  if (src.startsWith("#!") && !/^#!\s*\[/.test(src)) {
    let e = src.indexOf("\n");
    if (e < 0) e = n;
    out.push(`c:${src.slice(0, e).trimEnd()}`);
    i = e;
  }
  while (i < n) {
    const ch = src[i]!;
    // Rust's whitespace is the Pattern_White_Space set; other spaces (NBSP) are not whitespace to rustc and stay as tokens.
    if (RUST_SPACE.test(ch)) { i++; continue; }
    if (src.startsWith("//", i)) {
      let e = src.indexOf("\n", i);
      if (e < 0) e = n;
      out.push(`c:${src.slice(i, e).trimEnd()}`);
      i = e;
      continue;
    }
    if (src.startsWith("/*", i)) {
      let depth = 0, j = i;
      for (; j < n; j++) {
        if (src.startsWith("/*", j)) { depth++; j++; }
        else if (src.startsWith("*/", j)) { depth--; j++; if (depth === 0) break; }
      }
      if (depth !== 0) return null;
      out.push(`C:${trimLines(src.slice(i, j + 1))}`);
      i = j + 1;
      continue;
    }
    const raw = /^(?:br|cr|r)(#*)"/.exec(src.slice(i, i + 260));
    if (raw) {
      const close = `"${raw[1]}`;
      const e = src.indexOf(close, i + raw[0].length);
      if (e < 0) return null;
      out.push(`s:${src.slice(i, e + close.length)}`);
      i = e + close.length;
      continue;
    }
    const pre = /^(?:b|c)?"/.exec(src.slice(i, i + 2));
    if (pre) {
      let j = i + pre[0].length;
      while (j < n && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      if (j >= n) return null;
      out.push(`s:${src.slice(i, j + 1)}`);
      i = j + 1;
      continue;
    }
    if (ch === "'" || (ch === "b" && src[i + 1] === "'")) {
      const at = ch === "b" ? i + 1 : i;
      const m = CHAR_LIT.exec(src.slice(at, at + 14));
      if (m) { out.push(`h:${src.slice(i, at + m[0].length)}`); i = at + m[0].length; continue; }
      if (ch === "'") {
        let j = i + 1;
        while (j < n && IDENT.test(src[j]!)) j++;
        if (j > i + 1) { out.push(`l:${src.slice(i + 1, j)}`); i = j; continue; }
      }
    }
    // A raw identifier is one token; `r #x` is not it. A number with a fraction is one token; `1. 0` is not.
    const rawId = /^r#[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i, i + 80));
    if (rawId && !/[\p{L}\p{N}_]/u.test(src[i - 1] ?? " ")) { out.push(`i:${rawId[0]}`); i += rawId[0].length; continue; }
    const num = /^\d[\d_]*\.\d[\w]*/.exec(src.slice(i, i + 80));
    if (num && !/[\p{L}\p{N}_]/u.test(src[i - 1] ?? " ")) { out.push(`i:${num[0]}`); i += num[0].length; continue; }
    if (IDENT.test(ch)) {
      let j = i;
      while (j < n && IDENT.test(src[j]!)) j++;
      out.push(`i:${src.slice(i, j)}`);
      i = j;
      continue;
    }
    const glued = lastPunctEnd === i && (COMPOUND.has(run.slice(-1) + ch) || COMPOUND.has(run.slice(-2) + ch));
    out.push(`${glued ? "~" : "p:"}${ch}`);
    run = lastPunctEnd === i ? run + ch : ch;
    lastPunctEnd = i + 1;
    i++;
  }
  return spans;
}

/**
 * Why `after` is not `before` reformatted, or null. The token streams (see rustTokens) must be identical: only
 * whitespace between tokens may differ, so a changed token, a changed string or comment, a reordered or moved item
 * and a `/ *` turned into a comment opener are all refused. The diff is never trusted to be formatting because a
 * formatter produced it: a PR controls the files the formatter reads.
 */
export function formattingOnly(path: string, before: string, after: string): string | null {
  const a = rustTokens(before), b = rustTokens(after);
  if (!a || !b) return `${path} could not be tokenized to check the formatting`;
  if (a.length !== b.length || a.some((t, i) => t !== b[i])) return `the formatter changed more than whitespace in ${path}`;
  return null;
}
