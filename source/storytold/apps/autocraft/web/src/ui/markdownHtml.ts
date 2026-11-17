// The safety rules for untrusted Markdown (issue, PR and comment bodies), kept
// free of React so the server tests can run them.
//
// Raw HTML never reaches the page. `remarkHtmlToMarkdown` turns the HTML that
// GitHub bodies commonly use into plain Markdown nodes instead: `<img>` becomes
// an image (shown through the proxy or as a link chip, like `![alt](src)`),
// `<video>` a link, `<a href>` a link, `<br>` a line break, `<b>`/`<i>`/`<code>`
// their Markdown forms, and block tags (`<p>`, `<details>`, `<summary>`, `<li>`,
// headings) paragraphs. Only src, alt and href are read from attributes; every
// other tag is dropped and its text kept as text. The contents of script, style
// and similar tags are dropped. URLs still pass `safeUrl` in the renderer.

// Images the server's proxy (GET /img, src/dash/server/images.ts) fetches:
// the same hosts and path shapes. Anything else stays a link.
const PROXIED: [string, RegExp][] = [
  ["github.com", /^\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
  ["private-user-images.githubusercontent.com", /^\/./],
  ["user-images.githubusercontent.com", /^\/./],
  ["raw.githubusercontent.com", /^\/storytold\/./],
  ["avatars.githubusercontent.com", /^\/./],
];

export function proxiedImage(src: string): string | null {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (!PROXIED.some(([host, path]) => u.hostname === host && path.test(u.pathname))) return null;
  return `/img?${new URLSearchParams({ u: u.href })}`;
}

/** The url when it is an http(s) or mailto link, a fragment, or a path on this site; otherwise "". Protocol-relative (`//`) and `/\` forms are refused. */
export function safeUrl(url: string): string {
  if (/[\u0000-\u001f]/.test(url)) return "";
  if (url.startsWith("#")) return url;
  if (url.startsWith("/")) return url[1] === "/" || url[1] === "\\" ? "" : url;
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(url, "https://x.invalid").protocol) && /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : "";
  } catch {
    return "";
  }
}

// Minimal mdast shapes; the plugin builds only these.
export type MdNode = {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  title?: string | null;
  children?: MdNode[];
};

const PHRASING_PARENTS = new Set(["paragraph", "heading", "tableCell", "emphasis", "strong", "delete", "link", "linkReference"]);
const BLOCK_TAGS = new Set([
  "p", "div", "center", "li", "ul", "ol", "details", "summary", "table", "thead", "tbody", "tr", "td", "th",
  "blockquote", "pre", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "dl", "dt", "dd", "figure", "figcaption", "section",
]);
const HEADINGS = new Set(["summary", "h1", "h2", "h3", "h4", "h5", "h6"]);
// Tags whose content is not text the reader should see.
const SKIP_CONTENT = new Set(["script", "style", "template", "iframe", "object", "embed", "svg", "math", "noscript", "textarea", "select", "head", "title"]);

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(s: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of s.matchAll(ATTR)) out.set(m[1]!.toLowerCase(), decode(m[2] ?? m[3] ?? m[4] ?? "").trim());
  return out;
}

const fileName = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
};

// Builds Markdown nodes from a run of HTML strings and ready nodes. In block
// mode the output is paragraphs; in inline mode block tags become line breaks.
class Builder {
  private out: MdNode[] = [];
  private stack: MdNode[] = [];
  private skip: string[] = [];
  private code: MdNode | null = null;
  private pendingVideo: MdNode | null = null;
  private block: boolean;
  constructor(block: boolean) {
    this.block = block;
  }

  private top(): MdNode {
    if (this.stack.length === 0) {
      const p: MdNode = this.block ? { type: "paragraph", children: [] } : { type: "fragment", children: [] };
      this.stack.push(p);
    }
    return this.stack[this.stack.length - 1]!;
  }

  private add(n: MdNode) {
    this.top().children!.push(n);
  }

  private text(s: string) {
    if (this.skip.length) return;
    if (this.code) {
      this.code.value += decode(s);
      return;
    }
    let t = decode(s).replace(/\s+/g, " ");
    const empty = this.stack.length === 0 || (this.stack.length === 1 && this.stack[0]!.children!.length === 0);
    if (empty) t = t.replace(/^ /, "");
    if (!t) return;
    const kids = this.top().children!;
    const last = kids[kids.length - 1];
    if (last?.type === "text") last.value += t;
    else kids.push({ type: "text", value: t });
  }

  // Closes every open container and emits the paragraph (block mode) or its
  // children (inline mode).
  private flush() {
    while (this.stack.length > 1) this.pop();
    const root = this.stack.pop();
    this.code = null;
    if (!root) return;
    const kids = root.children!;
    while (kids.length && kids[kids.length - 1]!.type === "text" && !kids[kids.length - 1]!.value!.trim()) kids.pop();
    if (!kids.length) return;
    if (this.block) this.out.push(root);
    else this.out.push(...kids);
  }

  private pop() {
    const n = this.stack.pop()!;
    if (n.type === "link" && n.children!.length === 0) n.children!.push({ type: "text", value: n.url! });
    this.top().children!.push(n);
  }

  private popTo(type: string) {
    const i = this.stack.findLastIndex((n) => n.type === type);
    if (i <= 0) return;
    while (this.stack.length > i) this.pop();
  }

  private open(type: string, extra: Partial<MdNode> = {}) {
    this.top();
    this.stack.push({ type, children: [], ...extra });
  }

  private blockBreak() {
    if (this.block) this.flush();
    else {
      const kids = this.top().children!;
      if (kids.length && kids[kids.length - 1]!.type !== "break") this.add({ type: "break" });
    }
  }

  private tag(close: boolean, name: string, rawAttrs: string) {
    if (this.skip.length) {
      if (name === this.skip[this.skip.length - 1]) {
        if (close) this.skip.pop();
        else this.skip.push(name);
      }
      return;
    }
    if (SKIP_CONTENT.has(name)) {
      if (!close && !/\/\s*$/.test(rawAttrs)) this.skip.push(name);
      return;
    }
    if (name === "code" || name === "tt" || name === "kbd") {
      if (close) this.code = null;
      else if (!this.code) {
        this.code = { type: "inlineCode", value: "" };
        this.add(this.code);
      }
      return;
    }
    if (this.code) return;
    const a = close ? new Map<string, string>() : attrs(rawAttrs);
    switch (name) {
      case "img": {
        const src = a.get("src");
        if (src) this.add({ type: "image", url: src, alt: a.get("alt") ?? "", title: null });
        return;
      }
      case "video": {
        if (close) {
          this.pendingVideo = null;
          return;
        }
        const src = a.get("src");
        const link: MdNode = { type: "link", url: src ?? "", title: null, children: [{ type: "text", value: "Video" }] };
        this.pendingVideo = src ? null : link;
        if (src) this.addVideo(link);
        return;
      }
      case "source": {
        const src = a.get("src");
        if (this.pendingVideo && src) {
          this.pendingVideo.url = src;
          this.addVideo(this.pendingVideo);
          this.pendingVideo = null;
        }
        return;
      }
      case "br":
        if (!close) this.add({ type: "break" });
        return;
      case "a": {
        if (close) return this.popTo("link");
        const href = a.get("href");
        if (href && !this.stack.some((n) => n.type === "link")) this.open("link", { url: href, title: null });
        return;
      }
      case "b":
      case "strong":
        return close ? this.popTo("strong") : this.open("strong");
      case "i":
      case "em":
        return close ? this.popTo("emphasis") : this.open("emphasis");
    }
    if (!BLOCK_TAGS.has(name)) return;
    this.blockBreak();
    if (close) return;
    if (HEADINGS.has(name)) this.open("strong");
    else if (name === "li") this.text("• ");
    else if (name === "td" || name === "th") this.text(" ");
  }

  private addVideo(link: MdNode) {
    const name = fileName(link.url!);
    link.children = [{ type: "text", value: name ? `Video: ${name}` : "Video" }];
    this.add(link);
  }

  html(s: string) {
    let last = 0;
    for (const m of s.matchAll(TOKEN)) {
      if (m.index > last) this.text(s.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[2]) this.tag(m[1] === "/", m[2].toLowerCase(), m[3] ?? "");
    }
    if (last < s.length) this.text(s.slice(last));
  }

  node(n: MdNode) {
    if (this.skip.length) return;
    if (this.code && (n.type === "text" || n.type === "inlineCode")) this.code.value += n.value ?? "";
    else this.add(n);
  }

  done(): MdNode[] {
    this.flush();
    return this.out;
  }
}

/** The nodes one block-level HTML string becomes. */
export function htmlBlock(html: string): MdNode[] {
  const b = new Builder(true);
  b.html(html);
  return b.done();
}

/** Rewrites a phrasing parent's children, where each HTML tag is its own node. */
export function inlineChildren(children: MdNode[]): MdNode[] {
  const b = new Builder(false);
  for (const c of children) {
    if (c.type === "html") b.html(c.value ?? "");
    else b.node(c);
  }
  return b.done();
}

function walk(n: MdNode) {
  const kids = n.children;
  if (!kids) return;
  for (const c of kids) walk(c);
  if (!kids.some((c) => c.type === "html")) return;
  if (PHRASING_PARENTS.has(n.type)) n.children = inlineChildren(kids);
  else n.children = kids.flatMap((c) => (c.type === "html" ? htmlBlock(c.value ?? "") : [c]));
}

/** Remark plugin: replaces raw HTML nodes with the Markdown nodes above. */
export function remarkHtmlToMarkdown() {
  return (tree: MdNode) => walk(tree);
}
