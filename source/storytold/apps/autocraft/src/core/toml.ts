// A TOML reader for manifests (Cargo.toml): tables, array tables, dotted and quoted keys, every string form, arrays and
// inline tables. Numbers and dates are kept as their text; a document Cargo would refuse (a duplicate key, an unclosed
// string) is an error, so callers can fail closed. Pure, no imports: the dashboard build includes it.

export type TomlTable = { [key: string]: unknown };
export type TomlResult = { ok: true; data: TomlTable } | { ok: false; error: string };

const BARE = /[A-Za-z0-9_-]/;
/** Keys that name object machinery in JavaScript; a manifest that uses one is refused, so callers fail closed. */
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);
const ESCAPES: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", e: "\x1b", '"': '"', "\\": "\\" };

class Fail extends Error {}

export function parseToml(text: string): TomlResult {
  let i = 0;
  const s = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const fail = (m: string): never => { throw new Fail(`${m} at offset ${i}`); };
  // Tables have no prototype, so no key a manifest names (such as `__proto__`) reaches Object.prototype.
  const table = (): TomlTable => Object.create(null) as TomlTable;
  const root = table();
  // Tables a header or a dotted key defined; a header naming one again is a duplicate.
  const defined = new Set<TomlTable>();
  const inlineOrValue = new Set<unknown>();

  const ws = () => { while (s[i] === " " || s[i] === "\t") i++; };
  const comment = () => { if (s[i] === "#") while (i < s.length && s[i] !== "\n") i++; };
  /** Whitespace, comments and newlines (inside arrays and inline tables). */
  const blank = () => { for (;;) { ws(); comment(); if (s[i] === "\n") { i++; continue; } return; } };
  const endOfLine = () => { ws(); comment(); if (i < s.length && s[i] !== "\n") fail("expected end of line"); };

  function basic(multi: boolean): string {
    let out = "";
    for (;;) {
      if (i >= s.length) fail("unclosed string");
      const c = s[i]!;
      if (multi && s.startsWith('"""', i)) {
        // Up to two quotes may end the content right before the closing three.
        let n = 3; while (s[i + n] === '"' && n < 5) n++;
        out += '"'.repeat(n - 3); i += n; return out;
      }
      if (!multi && c === '"') { i++; return out; }
      if (!multi && c === "\n") fail("newline in string");
      if (c === "\\") {
        const e = s[i + 1] ?? "";
        if (multi && /[ \t\n]/.test(e)) {
          // A line-ending backslash trims the newline and the whitespace that follows.
          let j = i + 1; while (s[j] === " " || s[j] === "\t") j++;
          if (s[j] !== "\n") fail("bad escape");
          while (/[ \t\n]/.test(s[j] ?? "")) j++;
          i = j; continue;
        }
        if (e === "u" || e === "U") {
          const n = e === "u" ? 4 : 8, hex = s.slice(i + 2, i + 2 + n);
          if (!new RegExp(`^[0-9A-Fa-f]{${n}}$`).test(hex)) fail("bad unicode escape");
          const cp = parseInt(hex, 16);
          if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) fail("bad unicode escape");
          out += String.fromCodePoint(cp); i += 2 + n; continue;
        }
        if (e === "x") {
          const hex = s.slice(i + 2, i + 4);
          if (!/^[0-9A-Fa-f]{2}$/.test(hex)) fail("bad escape");
          out += String.fromCharCode(parseInt(hex, 16)); i += 4; continue;
        }
        const v = ESCAPES[e];
        if (v === undefined) fail("bad escape");
        out += v; i += 2; continue;
      }
      out += c; i++;
    }
  }

  function literal(multi: boolean): string {
    const close = multi ? "'''" : "'";
    let j = s.indexOf(close, i);
    if (j < 0) fail("unclosed string");
    if (multi) while (s[j + 3] === "'" && j + 3 - i < s.length) j++;
    const out = s.slice(i, j);
    if (!multi && out.includes("\n")) fail("newline in string");
    i = j + close.length;
    return out;
  }

  function str(): string | null {
    if (s.startsWith('"""', i)) { i += 3; if (s[i] === "\n") i++; return basic(true); }
    if (s[i] === '"') { i++; return basic(false); }
    if (s.startsWith("'''", i)) { i += 3; if (s[i] === "\n") i++; return literal(true); }
    if (s[i] === "'") { i++; return literal(false); }
    return null;
  }

  function key(): string[] {
    const parts: string[] = [];
    for (;;) {
      ws();
      let k: string;
      if (s[i] === '"') { i++; k = basic(false); }
      else if (s[i] === "'") { i++; k = literal(false); }
      else {
        const start = i; while (i < s.length && BARE.test(s[i]!)) i++;
        if (i === start) fail("expected a key");
        k = s.slice(start, i);
      }
      if (RESERVED.has(k)) fail(`reserved key ${k}`);
      parts.push(k);
      ws();
      if (s[i] !== ".") return parts;
      i++;
    }
  }

  function value(): unknown {
    const q = str();
    if (q !== null) return q;
    if (s[i] === "[") {
      i++; const arr: unknown[] = [];
      for (;;) {
        blank();
        if (s[i] === "]") { i++; inlineOrValue.add(arr); return arr; }
        arr.push(value());
        blank();
        if (s[i] === ",") { i++; continue; }
        if (s[i] === "]") { i++; inlineOrValue.add(arr); return arr; }
        fail("expected , or ] in array");
      }
    }
    if (s[i] === "{") {
      i++; const t = table();
      blank();
      if (s[i] === "}") { i++; inlineOrValue.add(t); return t; }
      for (;;) {
        blank();
        const k = key();
        if (s[i] !== "=") fail("expected =");
        i++; ws();
        assign(t, k, value(), true);
        blank();
        if (s[i] === ",") { i++; continue; }
        if (s[i] === "}") { i++; inlineOrValue.add(t); return t; }
        fail("expected , or } in inline table");
      }
    }
    const start = i;
    while (i < s.length && !/[\s,\]}#]/.test(s[i]!)) i++;
    // A date-time may hold one space between date and time.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(start, i)) && s[i] === " " && /\d/.test(s[i + 1] ?? "")) { i++; while (i < s.length && !/[\s,\]}#]/.test(s[i]!)) i++; }
    const raw = s.slice(start, i);
    if (!raw) fail("expected a value");
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (!/^[-+0-9.a-zA-Z_:]+$/.test(raw.replace(" ", ""))) fail("bad value");
    return raw;
  }

  function child(t: TomlTable, k: string, at: string[]): TomlTable {
    const v = t[k];
    if (!Object.hasOwn(t, k)) { const n = table(); t[k] = n; return n; }
    if (Array.isArray(v) && !inlineOrValue.has(v)) { const last = v[v.length - 1]; if (last && typeof last === "object") return last as TomlTable; }
    if (v && typeof v === "object" && !Array.isArray(v) && !inlineOrValue.has(v)) return v as TomlTable;
    return fail(`${at.join(".")} is not a table`);
  }

  function assign(t: TomlTable, k: string[], v: unknown, inline: boolean) {
    let cur = t;
    for (let n = 0; n < k.length - 1; n++) {
      cur = child(cur, k[n]!, k.slice(0, n + 1));
      if (!inline) defined.add(cur);
    }
    const last = k[k.length - 1]!;
    if (Object.hasOwn(cur, last)) fail(`duplicate key ${k.join(".")}`);
    cur[last] = v;
  }

  try {
    let current = root;
    for (;;) {
      blank();
      if (i >= s.length) break;
      if (s.startsWith("[[", i)) {
        i += 2; const k = key();
        if (!s.startsWith("]]", i)) fail("expected ]]");
        i += 2; endOfLine();
        let cur = root;
        for (let n = 0; n < k.length - 1; n++) cur = child(cur, k[n]!, k.slice(0, n + 1));
        const last = k[k.length - 1]!;
        const arr = Object.hasOwn(cur, last) ? cur[last] : (cur[last] = []);
        if (!Array.isArray(arr) || inlineOrValue.has(arr)) fail(`${k.join(".")} is not an array of tables`);
        const t = table();
        (arr as unknown[]).push(t);
        defined.add(t);
        current = t;
      } else if (s[i] === "[") {
        i++; const k = key();
        if (s[i] !== "]") fail("expected ]");
        i++; endOfLine();
        let cur = root;
        for (let n = 0; n < k.length; n++) cur = child(cur, k[n]!, k.slice(0, n + 1));
        if (defined.has(cur)) fail(`table ${k.join(".")} defined twice`);
        defined.add(cur);
        current = cur;
      } else {
        const k = key();
        if (s[i] !== "=") fail("expected =");
        i++; ws();
        assign(current, k, value(), false);
        endOfLine();
      }
    }
    return { ok: true, data: root };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.message };
    throw e;
  }
}
