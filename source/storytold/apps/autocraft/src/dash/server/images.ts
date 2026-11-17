// GET /img?u=<url>: a proxy for the GitHub-hosted images in issue and PR
// bodies, so the app can show them inline under `img-src 'self'`. Only the
// hosts and path shapes in `allowedImage` are fetched, and only URLs that occur
// in mirrored text of tracked repos (the `repos` lookup, see image-index.ts);
// redirects are followed by hand and re-checked; the bot's token goes only to
// github.com. Upstream fetches are limited to a few at a time, 5 MB each.
import { ownerOf } from "../../owners.ts";
import { readEnv } from "../../github/read.ts";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Semaphore } from "./limits.ts";
import { envVar } from "../../env.ts";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_UPSTREAM_FETCHES = 4;
const FETCH_QUEUE_WAIT_MS = 5_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;
const TOKEN_TTL_MS = 60_000;
const CACHE_TTL_MS = 7 * 86_400_000;
const CACHE_MAX_BYTES = 512 * 1024 * 1024;
const REPO_DIR = fileURLToPath(new URL("../../..", import.meta.url));

// The web renderer (web/src/ui/molecules/Markdown.tsx) keeps a copy of these rules to
// decide which images to send through the proxy.
const SOURCES: { host: string; path: RegExp; token?: boolean }[] = [
  { host: "github.com", path: /^\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, token: true },
  { host: "private-user-images.githubusercontent.com", path: /^\/./ },
  { host: "user-images.githubusercontent.com", path: /^\/./ },
  { host: "raw.githubusercontent.com", path: /^\/storytold\/./ },
  { host: "avatars.githubusercontent.com", path: /^\/./ },
];
// GitHub redirects public attachments to this bucket; it is never requested directly.
const REDIRECT_ONLY: { host: string; path: RegExp }[] = [
  { host: "github-production-user-asset-6210df.s3.amazonaws.com", path: /^\/./ },
];

function check(raw: string, list: { host: string; path: RegExp }[]): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  // Never an address, so a redirect cannot reach loopback or the private network by IP.
  if (u.hostname === "localhost" || isIP(u.hostname.replace(/^\[|\]$/g, ""))) return null;
  const rule = list.find((s) => s.host === u.hostname);
  if (!rule || !rule.path.test(u.pathname) || /%2f|%5c|\/\.\.?(\/|$)/i.test(u.pathname)) return null;
  u.hash = "";
  return u;
}

/** The URL to fetch if `raw` is an image the proxy serves, else null. */
export const allowedImage = (raw: string): URL | null => check(raw, SOURCES);
const allowedRedirect = (raw: string): URL | null => check(raw, [...SOURCES, ...REDIRECT_ONLY]);
const needsToken = (u: URL) => SOURCES.some((s) => s.token && s.host === u.hostname);

// Served types, by magic bytes. SVG is never served: it is a document that
// can carry script, and GitHub bodies rarely use it.
function sniff(b: Buffer): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length >= 12 && b.subarray(4, 8).toString("latin1") === "ftyp" && /^avi[fs]$/.test(b.subarray(8, 12).toString("latin1"))) return "image/avif";
  return null;
}
// What the upstream may call it: one of the served types, or a generic binary
// type (S3 and raw.githubusercontent.com sometimes say octet-stream).
const OK_UPSTREAM = /^(image\/(png|jpeg|gif|webp|avif)|application\/octet-stream|binary\/octet-stream)$/;

export type ImageResult = { status: number; type?: string; data?: Buffer; error?: string };

export type ImageProxyOptions = {
  fetch?: typeof fetch;
  token?: (owner: string | undefined) => Promise<string | null>;   // the token for attachment URLs of a repo owner
  cacheDir?: string | null;               // null: no disk cache
  repos?: (href: string) => string[];     // tracked repos whose text contains the URL; default: none
  maxConcurrent?: number;                 // upstream fetches at once
  queueWaitMs?: number;                   // how long a fetch waits for a free slot
};

let currentIndex: ((href: string) => string[]) | null = null;
/** Sets the lookup that `imageRepo` answers from (the server registers its image index). */
export function registerImageRepos(fn: ((href: string) => string[]) | null): void {
  currentIndex = fn;
}
/** The repo an allowed image URL belongs to (the first, when it occurs in several), else null. */
export function imageRepo(raw: string): string | null {
  const u = allowedImage(raw);
  return (u && currentIndex?.(u.href)[0]) || null;
}

/**
 * Where the image token comes from: the file named by AUTOCRAFT_IMAGE_TOKEN_FILE
 * (re-read when its mtime changes), else `gh auth token`. Logs which one, never the value.
 */
export function imageTokenSource(env: NodeJS.ProcessEnv = process.env, log: (line: string) => void = console.log): (owner?: string) => Promise<string | null> {
  const file = envVar("IMAGE_TOKEN_FILE", env);
  if (!file) {
    log("image proxy token: from `gh auth token`, or under the GitHub App identity an installation token of the image's owner (AUTOCRAFT_IMAGE_TOKEN_FILE is not set)");
    return ghToken;
  }
  log("image proxy token: from the file named by AUTOCRAFT_IMAGE_TOKEN_FILE");
  let seen: { mtime: number; value: string | null } | null = null;
  return async () => {
    try {
      const mtime = (await stat(file)).mtimeMs;
      if (!seen || seen.mtime !== mtime) {
        const t = (await readFile(file, "utf8")).trim();
        seen = { mtime, value: /^[\w-]+$/.test(t) ? t : null };
      }
      return seen.value;
    } catch {
      return null;
    }
  };
}

/** Runs `gh auth token` in the repo's directory (the gh wrapper picks the account by directory). */
export async function ghToken(owner?: string): Promise<string | null> {
  // Under the app identity the proxy fetches with an installation token of the image's owner; the box account's login is not consulted.
  let env: Awaited<ReturnType<typeof readEnv>>;
  try { env = await readEnv(owner); } catch (e) { console.log(`image proxy token: ${String((e as Error).message ?? e)}`); return null; }
  if (env) return env.GH_TOKEN ?? null;
  return new Promise((resolve) => {
    execFile("gh", ["auth", "token"], { cwd: REPO_DIR, timeout: 15_000, encoding: "utf8" }, (err, stdout) => {
      const t = String(stdout ?? "").trim();
      resolve(err || !/^[\w-]+$/.test(t) ? null : t);
    });
  });
}

export function defaultImageCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const given = envVar("IMG_CACHE", env);
  if (given) return given;
  return join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "autocraft", "img");
}

export class ImageProxy {
  #fetch: typeof fetch;
  #tokenSource: (owner: string | undefined) => Promise<string | null>;
  #tokens = new Map<string, { value: string | null; at: number }>();
  #cacheDir: string | null;
  #inflight = new Map<string, Promise<ImageResult>>();
  #writes = 0;
  #repos: (href: string) => string[];
  #slots: Semaphore;

  constructor(opts: ImageProxyOptions = {}) {
    this.#fetch = opts.fetch ?? fetch;
    this.#tokenSource = opts.token ?? ghToken;
    this.#cacheDir = opts.cacheDir === undefined ? defaultImageCacheDir() : opts.cacheDir;
    this.#repos = opts.repos ?? (() => []);
    this.#slots = new Semaphore(opts.maxConcurrent ?? MAX_UPSTREAM_FETCHES, opts.queueWaitMs ?? FETCH_QUEUE_WAIT_MS);
  }

  async #getToken(href: string): Promise<string | null> {
    const repo = this.#repos(href)[0];
    const owner = repo ? ownerOf(repo) : undefined;
    const key = owner ?? "";
    let t = this.#tokens.get(key);
    if (!t || Date.now() - t.at > TOKEN_TTL_MS) {
      t = { value: await this.#tokenSource(owner).catch(() => null), at: Date.now() };
      this.#tokens.set(key, t);
    }
    return t.value;
  }

  /** `allow` is asked only when the image has to be fetched (the per-session rate limit). */
  get(raw: string, allow: () => boolean = () => true): Promise<ImageResult> {
    const url = allowedImage(raw);
    if (!url) return Promise.resolve({ status: 404, error: "not an allowed image" });
    const key = url.href;
    // Checked before the cache and the fetch: a cached image is served only while its URL is still in the mirror.
    if (!this.#repos(key).length) return Promise.resolve({ status: 404, error: "not an image of a tracked repo" });
    const running = this.#inflight.get(key);
    if (running) return running;
    const p = this.#load(url, allow).finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, p);
    return p;
  }

  async #load(url: URL, allow: () => boolean): Promise<ImageResult> {
    const file = this.#cacheDir ? join(this.#cacheDir, createHash("sha256").update(url.href).digest("hex")) : null;
    if (file) {
      const hit = await this.#readCache(file);
      if (hit) return hit;
    }
    if (!allow()) return { status: 429, error: "too many image requests; wait a minute" };
    const release = await this.#slots.acquire();
    if (!release) return { status: 429, error: "image proxy is busy; try again shortly" };
    let r: ImageResult;
    try {
      r = await this.#fetchImage(url);
    } finally {
      release();
    }
    if (file && r.status === 200) await this.#writeCache(file, r.data!).catch(() => {});
    return r;
  }

  async #fetchImage(start: URL): Promise<ImageResult> {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    let url = start;
    try {
      for (let hop = 0; ; hop++) {
        const headers: Record<string, string> = { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" };
        if (needsToken(url)) {
          const t = await this.#getToken(start.href);
          if (t) headers.authorization = `Bearer ${t}`;
        }
        const res = await this.#fetch(url.href, { headers, redirect: "manual", signal });
        if (res.status >= 300 && res.status < 400) {
          await res.body?.cancel();
          const loc = res.headers.get("location");
          const next = loc ? allowedRedirect(new URL(loc, url).href) : null;
          if (!next || hop >= MAX_REDIRECTS) return { status: 502, error: "redirect refused" };
          url = next;
          continue;
        }
        if (!res.ok) {
          await res.body?.cancel();
          return { status: res.status === 404 ? 404 : 502, error: `upstream returned ${res.status}` };
        }
        const ctype = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
        if (!OK_UPSTREAM.test(ctype)) {
          await res.body?.cancel();
          return { status: 415, error: "not an image" };
        }
        if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) {
          await res.body?.cancel();
          return { status: 413, error: "image too large" };
        }
        const chunks: Buffer[] = [];
        let size = 0;
        if (res.body) {
          // Leaving the loop early cancels the stream.
          for await (const chunk of res.body) {
            size += chunk.length;
            if (size > MAX_IMAGE_BYTES) return { status: 413, error: "image too large" };
            chunks.push(Buffer.from(chunk));
          }
        }
        const data = Buffer.concat(chunks);
        const type = sniff(data);
        if (!type) return { status: 415, error: "not an image" };
        return { status: 200, type, data };
      }
    } catch (e) {
      if ((e as Error).name === "TimeoutError" || signal.aborted) return { status: 504, error: "upstream timed out" };
      return { status: 502, error: "upstream fetch failed" };
    }
  }

  async #readCache(file: string): Promise<ImageResult | null> {
    try {
      const s = await stat(file);
      if (Date.now() - s.mtimeMs > CACHE_TTL_MS) return null;
      const data = await readFile(file);
      const type = sniff(data);
      return type ? { status: 200, type, data } : null;
    } catch {
      return null;
    }
  }

  async #writeCache(file: string, data: Buffer): Promise<void> {
    await mkdir(this.#cacheDir!, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, data, { mode: 0o600 });
    await rename(tmp, file);
    if (++this.#writes % 50 === 1) await this.#prune();
  }

  // Drops expired entries, then the oldest until the cache fits its cap.
  async #prune(): Promise<void> {
    const dir = this.#cacheDir!;
    const entries: { f: string; at: number; size: number }[] = [];
    for (const name of await readdir(dir)) {
      const f = join(dir, name);
      const s = await stat(f).catch(() => null);
      if (s?.isFile()) entries.push({ f, at: s.mtimeMs, size: s.size });
    }
    entries.sort((a, b) => b.at - a.at);
    let total = 0;
    for (const e of entries) {
      total += e.size;
      if (total > CACHE_MAX_BYTES || Date.now() - e.at > CACHE_TTL_MS) await unlink(e.f).catch(() => {});
    }
  }
}
