// The strict reader for a model reply that must be one JSON value. Gates read verdicts from replies that quote
// contributor text, so a reply is accepted only when it holds exactly one JSON value (an optional code fence and
// prose without a second answer around it are fine) and no object repeats a key.

class Bad extends Error {}

function skipWs(s: string, i: number): number {
  while (i < s.length && " \t\n\r".includes(s[i]!)) i++;
  return i;
}

function parseString(s: string, i: number): number {
  let j = i + 1;
  while (j < s.length) {
    const c = s[j]!;
    if (c === "\\") { j += 2; continue; }
    if (c === '"') return j + 1;
    j++;
  }
  throw new Bad();
}

/** Parses the value at `i`; returns [value, end]. Objects with a repeated key are refused unless `dupes`. */
function parseValue(s: string, i: number, depth: number, dupes = false): [unknown, number] {
  if (depth > 40) throw new Bad();
  i = skipWs(s, i);
  const c = s[i];
  if (c === "{") {
    const o: Record<string, unknown> = {};
    const seen = new Set<string>();
    i = skipWs(s, i + 1);
    if (s[i] === "}") return [o, i + 1];
    for (;;) {
      i = skipWs(s, i);
      if (s[i] !== '"') throw new Bad();
      const e = parseString(s, i);
      const key = JSON.parse(s.slice(i, e)) as string;
      if (seen.has(key) && !dupes) throw new Bad();
      seen.add(key);
      i = skipWs(s, e);
      if (s[i] !== ":") throw new Bad();
      const [v, n] = parseValue(s, i + 1, depth + 1, dupes);
      Object.defineProperty(o, key, { value: v, enumerable: true, writable: true, configurable: true });
      i = skipWs(s, n);
      if (s[i] === ",") { i++; continue; }
      if (s[i] === "}") return [o, i + 1];
      throw new Bad();
    }
  }
  if (c === "[") {
    const a: unknown[] = [];
    i = skipWs(s, i + 1);
    if (s[i] === "]") return [a, i + 1];
    for (;;) {
      const [v, n] = parseValue(s, i, depth + 1, dupes);
      a.push(v);
      i = skipWs(s, n);
      if (s[i] === ",") { i++; continue; }
      if (s[i] === "]") return [a, i + 1];
      throw new Bad();
    }
  }
  if (c === '"') { const e = parseString(s, i); return [JSON.parse(s.slice(i, e)), e]; }
  const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(s.slice(i, i + 40));
  if (!m) throw new Bad();
  return [JSON.parse(m[0]), i + m[0].length];
}

/** The text between line-anchored ``` fences, one entry per block; null when a fence is left open. */
function fencedBlocks(text: string): string[] | null {
  const blocks: string[] = [];
  let cur: string[] | null = null;
  for (const l of text.split("\n")) {
    if (/^\s*```/.test(l)) {
      if (cur) { blocks.push(cur.join("\n")); cur = null; } else cur = [];
    } else cur?.push(l);
  }
  return cur ? null : blocks;
}

/** The reply's lines outside its fenced blocks. */
function outsideFence(text: string): string {
  let inside = false;
  return text.split("\n").filter((l) => (/^\s*```/.test(l) ? ((inside = !inside), false) : !inside)).join("\n");
}

/** The top-level keys of an object, or of the objects in an array. */
function keysOf(v: unknown): Set<string> {
  const objs = Array.isArray(v) ? v : [v];
  return new Set(objs.flatMap((o) => (typeof o === "object" && o !== null && !Array.isArray(o) ? Object.keys(o) : [])));
}

/**
 * True when `text` holds, anywhere, a JSON value with one of the `keys`: the shape of a second, quoted answer. Brackets
 * in prose (`v[0]`, `{}`) and example objects with other keys are not.
 */
function holdsAnswer(text: string, keys: Set<string>): boolean {
  if (!keys.size) return false;
  for (const m of [...text.matchAll(/[{[]/g)].slice(0, 500)) {
    try {
      const [v] = parseValue(text, m.index, 0, true);
      if ([...keysOf(v)].some((k) => keys.has(k))) return true;
    } catch { /* not a value here */ }
  }
  return false;
}

/** An object with a key, or an array holding an object: the shape of an answer, as opposed to `v[0]` or `{}` in prose. */
const answerLike = (v: unknown): boolean => (Array.isArray(v) ? v.some((x) => typeof x === "object" && x !== null) : typeof v === "object" && v !== null && Object.keys(v).length > 0);

/**
 * The JSON values of `text` that are not inside another one, in order (repeated keys allowed: this only finds them),
 * and whether some text starts like an object (`{"`, `[{`) but does not parse: a broken answer.
 */
function topValues(text: string): { values: { v: unknown; at: number }[]; broken: boolean } {
  const values: { v: unknown; at: number }[] = [];
  let from = 0, broken = false;
  for (const m of [...text.matchAll(/[{[]/g)].slice(0, 500)) {
    if (m.index < from) continue;
    try {
      const [v, end] = parseValue(text, m.index, 0, true);
      values.push({ v, at: m.index });
      from = end;
    } catch { if (/^(?:\{\s*"|\[\s*\{)/.test(text.slice(m.index, m.index + 20))) broken = true; }
  }
  return { values, broken };
}

/**
 * The one JSON value of a reply, or null. With a fenced code block, the reply must hold exactly one, its whole content
 * must be one JSON value, and the prose outside it may hold brackets and example values but no other value with one of
 * its keys (a second answer). Without a fence, the
 * answer is the first object with a key (or array holding an object), and the text around it may hold brackets and
 * example values but no other value with one of its keys nor a broken object; a reply with no such object must be its
 * value alone (`[]`).
 * No object may repeat a key.
 */
export function wholeReplyJson(text: string): unknown {
  const blocks = fencedBlocks(text);
  if (blocks === null) return null;
  if (blocks.length > 1) return null;
  try {
    if (blocks.length === 1) {
      const [v, end] = parseValue(blocks[0]!, 0, 0);
      return skipWs(blocks[0]!, end) === blocks[0]!.length && !holdsAnswer(outsideFence(text), keysOf(v)) ? v : null;
    }
    // A broken answer-shaped text next to a valid one could be the model's own, with the valid one quoted.
    const { values, broken } = topValues(text);
    if (broken) return null;
    const answer = values.find((x) => answerLike(x.v));
    if (!answer) {
      // No object with keys: the reply's only bracketed text must be the value (`[]`, `{}`).
      const a = text.search(/[{[]/);
      if (a < 0) return null;
      const [v, end] = parseValue(text, a, 0);
      return /[{[]/.test(text.slice(end)) || /[{[]/.test(text.slice(0, a)) ? null : v;
    }
    const [v, end] = parseValue(text, answer.at, 0);
    return holdsAnswer(`${text.slice(0, answer.at)}\n${text.slice(end)}`, keysOf(v)) ? null : v;
  } catch { return null; }
}
