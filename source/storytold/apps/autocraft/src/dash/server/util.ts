// A refusal with a status code; the server renders it as a page, or as JSON
// under /api/.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Minimal page for the server's own responses (sign-in, sign-out, errors), in
// the dashboard's colours. The inline script applies the theme the reader chose
// in the dashboard (stored by web/src/shell/theme.ts); without it the page
// follows the system setting.
export function plainPage(nonce: string, title: string, body: string, head = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<link rel="icon" type="image/svg+xml" href="/artcraft-mark.svg"><link rel="apple-touch-icon" href="/artcraft-mark.png">${head}
<script nonce="${nonce}">try{var t=localStorage.getItem("autocraft:theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}</script>
<style nonce="${nonce}">
:root{color-scheme:dark;--bg:#101014;--card:#141518;--fg:#f2f1ee;--muted:#9a9aa0;--line:rgba(255,255,255,.1);--link:#74aaff;--accent:#2d81ff}
@media (prefers-color-scheme:light){:root:not([data-theme=dark]){color-scheme:light;--bg:#f2f1ee;--card:#fbfaf8;--fg:#101014;--muted:#5f5f66;--line:rgba(16,16,20,.12);--link:#1454dc;--accent:#1b63f5}}
:root[data-theme=light]{color-scheme:light;--bg:#f2f1ee;--card:#fbfaf8;--fg:#101014;--muted:#5f5f66;--line:rgba(16,16,20,.12);--link:#1454dc;--accent:#1b63f5}
body{background:var(--bg);color:var(--fg);font:15px/1.5 Inter,system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:12vh 16px 2rem;box-sizing:border-box}
main{width:100%;max-width:26rem;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:24px}
.brand{font-size:13px;font-weight:600;color:var(--muted);margin:0 0 12px}
h1{font-size:20px;line-height:1.3;margin:0 0 8px}
p{margin:8px 0}a{color:var(--link)}p.muted{color:var(--muted)}code{font-size:13px}
input,button,a.button{font:inherit;min-height:40px;padding:0 14px;border-radius:6px;box-sizing:border-box}
input{border:1px solid var(--line);background:var(--bg);color:var(--fg)}
button,a.button{display:inline-flex;align-items:center;border:0;background:var(--accent);color:#fff;text-decoration:none;font-weight:500;cursor:pointer}
</style></head><body><main><p class="brand">AutoCraft</p><h1>${esc(title)}</h1>${body}</main></body></html>`;
}

/** Link-preview tags. Preview crawlers fetch a link without a session, so these go on the pages anonymous visitors get. */
export function previewTags(baseUrl: string | null | undefined, path: string, title = "AutoCraft"): string {
  const origin = baseUrl ?? "";
  return `<meta name="description" content="${esc(PREVIEW_DESCRIPTION)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="AutoCraft"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(PREVIEW_DESCRIPTION)}"><meta property="og:url" content="${esc(origin + path)}">
<meta property="og:image" content="${esc(origin)}/artcraft-mark.png"><meta property="og:image:width" content="1024"><meta property="og:image:height" content="1024">
<meta property="og:image:alt" content="ArtCraft"><meta name="twitter:card" content="summary">`;
}
const PREVIEW_DESCRIPTION = "Automation for GitHub issues and pull requests: reviews, fix-ups and a merge queue, with people deciding.";

/** Keys a limiter keeps; past it, expired keys go (one walk per window at most) and then the oldest. */
export const LIMITER_KEYS = 10_000;

/** Makes room for a new key in a limiter's map: drops the entries `expired` says are spent, walking the map at most once per `everyMs`, then the oldest entries. */
export function trimKeys<V>(map: Map<string, V>, now: number, last: number, everyMs: number, expired: (v: V) => boolean): number {
  if (now - last >= everyMs) {
    last = now;
    for (const [k, v] of map) if (expired(v)) map.delete(k);
  }
  for (const k of map.keys()) {
    if (map.size < LIMITER_KEYS) break;
    map.delete(k);
  }
  return last;
}

// Fixed-window counters, in memory: limits reset with the process, which is
// enough to slow down a loop or a stuck client.
export class RateLimiter {
  #hits = new Map<string, { start: number; n: number }>();
  #limit: number;
  #window: number;
  #swept = 0;
  constructor(limit: number, windowMs: number) {
    this.#limit = limit;
    this.#window = windowMs;
  }
  allow(key: string): boolean {
    const now = Date.now();
    if (this.#hits.size >= LIMITER_KEYS && !this.#hits.has(key)) this.#swept = trimKeys(this.#hits, now, this.#swept, this.#window, (v) => now - v.start >= this.#window);
    const h = this.#hits.get(key);
    if (!h || now - h.start >= this.#window) {
      // Re-inserted, so the map stays in order of window start and the oldest go first.
      this.#hits.delete(key);
      this.#hits.set(key, { start: now, n: 1 });
      return true;
    }
    return ++h.n <= this.#limit;
  }
  /** Gives back one hit that `allow` counted, for a call that turned out not to count. */
  refund(key: string): void {
    const h = this.#hits.get(key);
    if (h && h.n > 0 && Date.now() - h.start < this.#window) h.n--;
  }
}

export function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

// Same-site targets only. The value is resolved against a fixed origin and
// refused when it lands elsewhere, holds a control character (a browser strips
// tabs and newlines, which turns "/<tab>/host" into "//host") or a backslash,
// or resolves to a protocol-relative path. Returns path, query and fragment.
const RETURN_BASE = "http://dashboard.invalid";
export function safeReturnTo(v: string | null | undefined): string {
  if (!v || v.length >= 2000 || /[\u0000-\u001f\u007f\\]/.test(v) || /%(?:[01][0-9a-f]|7f|5c)/i.test(v)) return "/";
  try {
    const u = new URL(v, RETURN_BASE);
    if (u.origin !== RETURN_BASE) return "/";
    const out = u.pathname + u.search + u.hash;
    return out.startsWith("//") ? "/" : out;
  } catch {
    return "/";
  }
}
