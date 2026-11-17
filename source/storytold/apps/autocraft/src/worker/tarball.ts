// Anonymous source download and a tar.gz extractor that cannot write outside
// its destination. Own parser instead of `tar`: the rules (no absolute paths,
// no `..`, links only inside the tree, no devices, no special mode bits) are
// then the same on every host and testable without a tar binary.
import { chmodSync, closeSync, linkSync, lstatSync, mkdirSync, openSync, realpathSync, symlinkSync, unlinkSync, writeSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

export type ExtractLimits = { maxBytes: number; maxEntries: number };
export const DEFAULT_EXTRACT_LIMITS: ExtractLimits = { maxBytes: 2 * 1024 ** 3, maxEntries: 200_000 };

export class TarError extends Error {}

/** Splits `p` (as written in the archive) into safe components below the root, dropping the first component (the `repo-sha/` prefix of GitHub tarballs). */
export function safeRelative(p: string, strip: number): string[] | null {
  if (p.includes("\0")) throw new TarError("NUL in path");
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) throw new TarError(`absolute path: ${p}`);
  const parts = p.split("/").filter((s) => s !== "" && s !== ".");
  if (parts.includes("..")) throw new TarError(`path escapes the tree: ${p}`);
  const rest = parts.slice(strip);
  return rest.length ? rest : null;
}

function octal(b: Buffer, off: number, len: number): number {
  // GNU base-256 for huge sizes.
  if (b[off]! & 0x80) {
    let v = 0;
    for (let i = off + 1; i < off + len; i++) v = v * 256 + b[i]!;
    return v;
  }
  const s = b.toString("latin1", off, off + len).replace(/\0.*$/s, "").trim();
  // A field that is not octal would parse as NaN and switch off the size limits.
  if (!/^[0-7]*$/.test(s)) throw new TarError("header field is not an octal number");
  return s ? parseInt(s, 8) : 0;
}

function cstr(b: Buffer, off: number, len: number): string {
  const end = b.indexOf(0, off);
  return b.toString("utf8", off, end >= off && end < off + len ? end : off + len);
}

function parsePax(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    if (sp < 0) break;
    const n = parseInt(data.toString("latin1", i, sp), 10);
    if (!(n > 0) || i + n > data.length) throw new TarError("bad pax record");
    const rec = data.toString("utf8", sp + 1, i + n - 1);
    const eq = rec.indexOf("=");
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += n;
  }
  return out;
}

class Reader {
  private bufs: Buffer[] = [];
  private len = 0;
  private it: AsyncIterator<Buffer>;
  constructor(src: AsyncIterable<Buffer>) {
    this.it = src[Symbol.asyncIterator]();
  }
  async read(n: number): Promise<Buffer | null> {
    while (this.len < n) {
      const r = await this.it.next();
      if (r.done) return null;
      this.bufs.push(r.value);
      this.len += r.value.length;
    }
    const all = this.bufs.length === 1 ? this.bufs[0]! : Buffer.concat(this.bufs);
    this.bufs = all.length > n ? [all.subarray(n)] : [];
    this.len -= n;
    return all.subarray(0, n);
  }
}

/** Extracts an uncompressed tar stream into `dest` (which must exist). Returns the number of files written. */
/** Creates the directories `parts` below `dest`, refusing to pass through a symlink (mkdir -p would follow one out of the tree). */
function ensureDir(dest: string, parts: string[]): string {
  let cur = dest;
  for (const part of parts) {
    cur = join(cur, part);
    let st: ReturnType<typeof lstatSync> | null = null;
    try {
      st = lstatSync(cur);
    } catch {
      mkdirSync(cur, { mode: 0o755 });
      continue;
    }
    if (st.isSymbolicLink()) throw new TarError(`path passes through a symlink: ${parts.join("/")}`);
    if (!st.isDirectory()) throw new TarError(`path component is not a directory: ${parts.join("/")}`);
  }
  return cur;
}

/**
 * Whether a dangling link at `path` to `target` stays: walked component by component from the link's directory
 * (before any `..` is folded away), the target never leaves the tree and passes through no existing symlink.
 */
function danglingKept(dest: string, path: string, target: string): boolean {
  if (target.startsWith("/")) return false;
  const at = path.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (!at.length) return false;
      at.pop();
      continue;
    }
    at.push(part);
    try {
      if (lstatSync(join(dest, ...at)).isSymbolicLink()) return false;
    } catch { /* not there yet */ }
  }
  return true;
}

export async function extractTar(src: AsyncIterable<Buffer>, dest: string, limits = DEFAULT_EXTRACT_LIMITS, strip = 1): Promise<number> {
  const r = new Reader(src);
  const files = new Set<string>();
  const hardlinks: { path: string; target: string }[] = [];
  const symlinks: { path: string; target: string }[] = [];
  let total = 0;
  let entries = 0;
  let pax: Record<string, string> = {};
  let longName: string | null = null;
  let longLink: string | null = null;
  for (;;) {
    const h = await r.read(512);
    if (!h || h.every((x) => x === 0)) break;
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i]!;
    if (sum !== octal(h, 148, 8)) throw new TarError("bad header checksum");
    const type = String.fromCharCode(h[156] || 0x30);
    const size = octal(h, 124, 12);
    total += size;
    if (total > limits.maxBytes) throw new TarError("archive too large when unpacked");
    const padded = Math.ceil(size / 512) * 512;
    const isMeta = type === "x" || type === "g" || type === "L" || type === "K";
    if (isMeta && size > 1024 * 1024) throw new TarError("oversized header record");
    let name = cstr(h, 0, 100);
    const prefix = cstr(h, 345, 155);
    if (prefix) name = `${prefix}/${name}`;
    let linkname = cstr(h, 157, 100);
    if (isMeta) {
      const body = padded ? await r.read(padded) : Buffer.alloc(0);
      if (!body) throw new TarError("truncated archive");
      const data = body.subarray(0, size);
      if (type === "x") pax = parsePax(data);
      else if (type === "L") longName = cstr(data, 0, data.length);
      else if (type === "K") longLink = cstr(data, 0, data.length);
      continue;
    }
    if (pax.path) name = pax.path;
    if (longName) name = longName;
    if (pax.linkpath) linkname = pax.linkpath;
    if (longLink) linkname = longLink;
    if (pax.size !== undefined && !/^[0-9]{1,15}$/.test(pax.size)) throw new TarError("pax size is not a number");
    const psize = pax.size ? Number(pax.size) : size;
    pax = {};
    longName = longLink = null;
    if (++entries > limits.maxEntries) throw new TarError("too many entries");
    const rel = safeRelative(name, strip);
    const mode = octal(h, 100, 8) & 0o777; // drops setuid, setgid and sticky
    if (type === "5") {
      if (rel) ensureDir(dest, rel);
    } else if (type === "0" || type === "7") {
      if (psize !== size) {
        total += psize - size;
        if (total > limits.maxBytes) throw new TarError("archive too large when unpacked");
      }
      if (!rel) throw new TarError(`file without a path below the root: ${name}`);
      const full = join(ensureDir(dest, rel.slice(0, -1)), rel[rel.length - 1]!);
      const fd = openSync(full, "w", (mode | 0o600) & 0o777);
      try {
        let left = psize;
        while (left > 0) {
          const c = await r.read(Math.min(left, 1 << 20));
          if (!c) throw new TarError("truncated archive");
          writeSync(fd, c);
          left -= c.length;
        }
      } finally {
        closeSync(fd);
      }
      chmodSync(full, (mode | 0o600) & 0o777);
      const pad = padded - psize;
      if (pad > 0 && !(await r.read(pad))) throw new TarError("truncated archive");
      files.add(rel.join("/"));
      continue;
    } else if (type === "1" || type === "2") {
      if (!rel) throw new TarError(`link without a path below the root: ${name}`);
      if (type === "1") {
        const t = safeRelative(linkname, strip);
        if (!t) throw new TarError(`hardlink target outside the tree: ${linkname}`);
        hardlinks.push({ path: rel.join("/"), target: t.join("/") });
      } else {
        if (linkname.startsWith("/") || linkname.includes("\0")) throw new TarError(`symlink to an absolute path: ${linkname}`);
        const resolved = posix.normalize(posix.join(posix.dirname(rel.join("/")), linkname));
        if (resolved === ".." || resolved.startsWith("../")) throw new TarError(`symlink escapes the tree: ${name} -> ${linkname}`);
        symlinks.push({ path: rel.join("/"), target: linkname });
      }
    } else {
      throw new TarError(`unsupported entry type '${type}': ${name}`);
    }
    if (padded && !(await r.read(padded))) throw new TarError("truncated archive");
  }
  // Links are created last, so no file is ever written through one.
  for (const l of hardlinks) {
    if (!files.has(l.target)) throw new TarError(`hardlink target is not a file in the archive: ${l.target}`);
    const lp = l.path.split("/");
    const full = join(ensureDir(dest, lp.slice(0, -1)), lp[lp.length - 1]!);
    linkSync(join(dest, l.target), full);
    files.add(l.path);
  }
  for (const l of symlinks) {
    const lp = l.path.split("/");
    const full = join(ensureDir(dest, lp.slice(0, -1)), lp[lp.length - 1]!);
    try {
      lstatSync(full);
      throw new TarError(`symlink replaces an extracted entry: ${l.path}`);
    } catch (e) {
      if (e instanceof TarError) throw e;
    }
    symlinkSync(l.target, full);
  }
  // The checks above are lexical; a chain of links can still resolve outside the tree. A dangling link (for example
  // to a file the build generates) is kept only when its target, resolved from the link's directory, stays inside
  // the tree and passes through no link: a chain could come to resolve outside once more is created.
  const root = realpathSync.native(dest);
  for (const l of symlinks) {
    let real: string;
    try {
      real = realpathSync.native(join(dest, l.path)); // native: the JS version resolves ".." lexically
    } catch {
      if (!danglingKept(dest, l.path, l.target)) {
        try {
          unlinkSync(join(dest, l.path));
        } catch { /* the link's directory is gone too: nothing to remove */ }
      }
      continue;
    }
    if (real !== root && !real.startsWith(root + sep)) throw new TarError(`symlink resolves outside the tree: ${l.path}`);
  }
  return files.size;
}

/** Downloads `url` without credentials (cap on the compressed size) and unpacks it into `dest`. */
export async function downloadAndExtract(url: string, dest: string, maxBytes: number, limits = DEFAULT_EXTRACT_LIMITS, fetchImpl: typeof fetch = fetch): Promise<number> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new TarError("source URL must be http(s)");
  const res = await fetchImpl(u, { redirect: "follow", headers: {}, signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw new TarError(`source download failed: HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new TarError("source tarball too large");
  let got = 0;
  const capped = (async function* () {
    for await (const c of Readable.fromWeb(res.body as never) as AsyncIterable<Buffer>) {
      got += c.length;
      if (got > maxBytes) throw new TarError("source tarball too large");
      yield c;
    }
  })();
  const gunzip = createGunzip();
  const piping = pipeline(Readable.from(capped), gunzip);
  piping.catch(() => {}); // errors reach extractTar through the destroyed gunzip stream
  try {
    return await extractTar(gunzip as unknown as AsyncIterable<Buffer>, dest, limits);
  } finally {
    gunzip.destroy();
  }
}
