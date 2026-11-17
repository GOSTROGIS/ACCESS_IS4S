// Cleaning of model-written text that AutoCraft posts on GitHub in its own voice. Removal runs until the text stops
// changing (removing one piece can join its neighbours into a new tag, mention or link), and whatever Markdown link
// syntax is left outside code is escaped, so no bracket, entity or `<` of the text can form a link GitHub renders.
// No Node imports: the Prompts page lists the templates that use it.

/**
 * Splits `s` into text and code: code parts (fenced blocks and inline code spans, as CommonMark pairs them) are at odd
 * indices. A backtick run opens a span only when no backslash escapes it, and closes at the next run of the same length
 * within the paragraph; a fence needs a closing fence of the same character, at least as long. A fence that never
 * closes is text, so its content is cleaned like any other.
 */
export function codeParts(s: string): string[] {
  const parts: string[] = [];
  let from = 0, i = 0;
  const cut = (start: number, end: number): void => { parts.push(s.slice(from, start), s.slice(start, end)); from = i = end; };
  while (i < s.length) {
    if (i === 0 || s[i - 1] === "\n") {
      const open = /^ {0,3}(`{3,}|~{3,})([^\n]*)\n/.exec(s.slice(i));
      if (open && !(open[1]![0] === "`" && open[2]!.includes("`"))) {
        const fence = open[1]!;
        const close = new RegExp(`\\n {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*(?=\\n|$)`, "g");
        close.lastIndex = i + open[0].length - 1;
        const c = close.exec(s);
        if (c) { cut(i, c.index + c[0].length); continue; }
      }
    }
    const ch = s[i];
    if (ch === "\\") { i += 2; continue; }
    if (ch !== "`") { i++; continue; }
    let n = 1;
    while (s[i + n] === "`") n++;
    let j = i + n, end = -1;
    while (j < s.length && end < 0) {
      if (s[j] === "`") {
        let m = 1;
        while (s[j + m] === "`") m++;
        if (m === n) end = j + m;
        j += m;
      } else if (s[j] === "\n" && /^\n[ \t]*(?:\n|$)/.test(s.slice(j, j + 80))) break;
      else j++;
    }
    if (end >= 0) cut(i, end);
    else i += n;
  }
  parts.push(s.slice(from));
  return parts;
}

/** `fix` runs on the text outside code only: code keeps its URLs and references. */
export function outsideCode(s: string, fix: (t: string) => string): string {
  return codeParts(s).map((part, i) => (i % 2 ? part : fix(part))).join("");
}

/** How many removal passes a text gets; every real text settles in two or three. A text that does not settle is dropped. */
const MAX_PASSES = 32;

/** `f` applied until the text stops changing; "" when it has not settled after MAX_PASSES. */
export function settle(s: string, f: (t: string) => string): string {
  let t = s;
  for (let i = 0; i < MAX_PASSES; i++) {
    const n = f(t);
    if (n === t) return t;
    t = n;
  }
  return "";
}

const MENTION = /(^|[^A-Za-z0-9])@(?=[A-Za-z0-9_])/g;
const TAG = /<\/?[A-Za-z][^>]*>/g;

/** No `@login` or `@org/team` (nobody gets pinged), also in code: a mention pings once the text is quoted or edited. An e-mail-like `a@b` stays. */
export const dropMentions = (s: string): string => s.replace(MENTION, "$1");

/** No raw HTML tags outside code, and no mentions anywhere, to a fixed point. */
export const dropMarkup = (s: string): string => settle(s, (t) => dropMentions(outsideCode(t, (x) => x.replace(TAG, ""))));

/**
 * What is left of a text's Markdown link syntax, escaped: brackets get one backslash (so neither an inline link, a
 * reference definition nor a shortcut reference forms), `<` becomes `&lt;` (no tag or autolink) and an `&` that starts a
 * character reference becomes `&amp;` (no `&colon;`, `&#58;` or encoded bracket; `&amp;` and `&lt;` stay, so cleaning
 * twice changes nothing). Rendered, the text reads the same.
 */
const escapeLinks = (t: string): string => t
  .replace(/\\*([[\]])/g, "\\$1")
  .replace(/&(?!(?:amp|lt);)(?=#?[A-Za-z0-9]+;)/g, "&amp;")
  .replace(/</g, "&lt;");

/**
 * Model text for a Markdown body that AutoCraft posts. `step` removes the shapes the caller does not want (links,
 * URLs, references) from text outside code; it is applied with tag and mention removal until nothing changes, and gets
 * `keep` for a link the caller wants to stay as it is (its text must hold no Markdown). Then the remaining link syntax
 * outside code is escaped.
 */
export function scrubMarkdown(s: string, step: (t: string, keep: (link: string) => string) => string): string {
  const kept: string[] = [];
  const keep = (link: string): string => `\u0000${kept.push(link) - 1}\u0000`;
  const clean = settle(s.replace(/\u0000/g, ""), (t) => dropMentions(outsideCode(t, (x) => step(x, keep).replace(TAG, ""))));
  return outsideCode(clean, escapeLinks).replace(/\u0000(\d+)\u0000/g, (_m, k: string) => kept[Number(k)] ?? "");
}
