// A read-only copy of a commit's regular files for a sandboxed model call,
// built from the bare cached clone without a working tree. Only regular files
// are written, one by one, under validated paths: no symlinks, submodules,
// devices or `.git` entries exist in the copy, and nothing in it is executed.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { GIT_ENV, HARDENING, gitDirEnv } from "../fixup/git.ts";
import { envVar } from "../env.ts";
import { isInstructionPath } from "./instruction-paths.ts";

export { isInstructionPath };

export type CheckoutCaps = { maxFiles: number; maxBytes: number; maxFileBytes: number };
export const DEFAULT_CAPS: CheckoutCaps = { maxFiles: 20_000, maxBytes: 150 * 1024 * 1024, maxFileBytes: 2 * 1024 * 1024 };

export function checkoutRoot(): string {
  return envVar("CHECKOUT_DIR") ?? join(homedir(), ".cache/autocraft/checkouts-v2");
}

type Out = { code: number; stdout: Buffer };
function git(gitDir: string, args: string[], input?: string): Promise<Out> {
  return new Promise((resolve, reject) => {
    const p = spawn("git", [...HARDENING, ...args], { cwd: gitDir, env: { ...process.env, ...GIT_ENV, ...gitDirEnv(gitDir) }, stdio: ["pipe", "pipe", "ignore"], timeout: 300_000 });
    const chunks: Buffer[] = [];
    p.stdout.on("data", (d: Buffer) => chunks.push(d));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(chunks) }));
    p.stdin.on("error", () => {});
    p.stdin.end(input ?? "");
  });
}

/** Lists the tree of `sha`, killing git as soon as the listing alone shows more than `maxFiles` records or `maxBytes` of file sizes. */
function lsTree(gitDir: string, sha: string, caps: CheckoutCaps): Promise<{ code: number; stdout: string; tooLarge: string | null }> {
  return new Promise((resolve, reject) => {
    const p = spawn("git", [...HARDENING, "ls-tree", "-r", "-z", "-l", "--full-tree", sha], { cwd: gitDir, env: { ...process.env, ...GIT_ENV, ...gitDirEnv(gitDir) }, stdio: ["ignore", "pipe", "ignore"], timeout: 300_000 });
    let text = "";
    let rest = "";
    let files = 0;
    let bytes = 0;
    let tooLarge: string | null = null;
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (d: string) => {
      if (tooLarge) return;
      text += d;
      const recs = (rest + d).split("\0");
      rest = recs.pop() ?? "";
      for (const r of recs) {
        files++;
        bytes += Number(/ +(\d+)\t/.exec(r)?.[1] ?? 0);
      }
      if (files > caps.maxFiles || bytes > caps.maxBytes) {
        tooLarge = `tree too large (over ${files} files, ${bytes} bytes)`;
        text = "";
        p.kill("SIGKILL");
      }
    });
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? 1, stdout: text, tooLarge }));
  });
}

/** True for a path that is safe to create under the checkout root. */
export function safePath(p: string): boolean {
  if (!p || p.length > 500 || p.includes("\0") || p.includes("\\") || p.startsWith("/")) return false;
  return p.split("/").every((c) => c !== "" && c !== "." && c !== ".." && c.toLowerCase() !== ".git");
}

type Entry = { oid: string; size: number; path: string };

/** The regular files (modes 100644 and 100755) of `sha`; symlinks, submodules, unsafe paths and instruction files are left out. */
export function parseTree(listing: string, caps: CheckoutCaps): Entry[] {
  const out: Entry[] = [];
  for (const rec of listing.split("\0")) {
    const m = /^(\d+) (\w+) ([0-9a-f]{40,64}) +(\d+|-)\t(.*)$/s.exec(rec);
    if (!m || m[2] !== "blob" || (m[1] !== "100644" && m[1] !== "100755")) continue;
    const size = Number(m[4]);
    if (size > caps.maxFileBytes || !safePath(m[5]!) || isInstructionPath(m[5]!)) continue;
    out.push({ oid: m[3]!, size, path: m[5]! });
  }
  return out;
}

/** Splits `git cat-file --batch` output into blobs in request order. */
export function parseBatch(buf: Buffer, n: number): Buffer[] | null {
  const blobs: Buffer[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const nl = buf.indexOf(10, at);
    if (nl < 0) return null;
    const m = /^[0-9a-f]+ blob (\d+)$/.exec(buf.toString("latin1", at, nl));
    if (!m) return null;
    const size = Number(m[1]);
    if (nl + 1 + size > buf.length) return null;
    blobs.push(buf.subarray(nl + 1, nl + 1 + size));
    at = nl + 1 + size + 1;
  }
  return blobs;
}

export type CheckoutResult = { ok: true; dir: string; files: number; bytes: number } | { ok: false; reason: string };

/**
 * Writes the regular files of commit `sha` from the bare repository `gitDir`
 * into `dest`, or reports why not (too large, unreadable). An existing `dest`
 * is a finished checkout of the same commit and is reused.
 */
export async function buildCheckout(gitDir: string, sha: string, dest: string, caps: CheckoutCaps = DEFAULT_CAPS): Promise<CheckoutResult> {
  if (!/^[0-9a-f]{40,64}$/.test(sha)) return { ok: false, reason: "not a commit id" };
  if (existsSync(dest)) {
    touch(dest);
    return { ok: true, dir: dest, files: 0, bytes: 0 };
  }
  const ls = await lsTree(gitDir, sha, caps);
  if (ls.tooLarge) return { ok: false, reason: ls.tooLarge };
  if (ls.code !== 0) return { ok: false, reason: "could not list the commit's files" };
  const entries = parseTree(ls.stdout, caps);
  const bytes = entries.reduce((a, e) => a + e.size, 0);
  if (entries.length > caps.maxFiles || bytes > caps.maxBytes) return { ok: false, reason: `tree too large (${entries.length} files, ${bytes} bytes)` };
  const cat = await git(gitDir, ["cat-file", "--batch"], entries.map((e) => `${e.oid}\n`).join(""));
  const blobs = cat.code === 0 ? parseBatch(cat.stdout, entries.length) : null;
  if (!blobs) return { ok: false, reason: "could not read the commit's files" };
  const tmp = `${dest}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true, mode: 0o700 });
  try {
    entries.forEach((e, i) => {
      const f = join(tmp, e.path);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, blobs[i]!, { mode: 0o644, flag: "wx" });
    });
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(tmp, dest);
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    if (existsSync(dest)) return { ok: true, dir: dest, files: entries.length, bytes };
    return { ok: false, reason: `could not write the checkout: ${(e as Error).message}`.slice(0, 200) };
  }
  return { ok: true, dir: dest, files: entries.length, bytes };
}

const held = new Map<string, number>();

/** Marks checkouts as in use by a running call, so pruning and sweeping skip them; the returned function releases them. */
export function holdCheckouts(dirs: string[]): () => void {
  const list = dirs.map((d) => resolve(d));
  for (const d of list) { held.set(d, (held.get(d) ?? 0) + 1); touchCheckout(d); }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    for (const d of list) {
      const n = (held.get(d) ?? 1) - 1;
      if (n > 0) held.set(d, n); else held.delete(d);
      touchCheckout(d);
    }
  };
}

export const checkoutHeld = (dir: string): boolean => held.has(resolve(dir));

export function touchCheckout(dir: string): void { touch(dir); }

function touch(dir: string): void {
  try { const t = new Date(); utimesSync(dir, t, t); } catch { /* pruning then sees an older time */ }
}

/** Removes checkouts under `root/<repo>/<sha>` not used for `maxAgeMs`, and unfinished ones. */
export function pruneCheckouts(root: string, maxAgeMs: number, now = Date.now()): number {
  let n = 0;
  if (!existsSync(root)) return 0;
  for (const repo of readdirSync(root)) {
    const rd = join(root, repo);
    for (const d of readdirSync(rd)) {
      const p = join(rd, d);
      if (checkoutHeld(p)) continue;
      const old = now - statSync(p).mtimeMs > (d.includes(".tmp-") ? 3600_000 : maxAgeMs);
      if (old) { rmSync(p, { recursive: true, force: true }); n++; }
    }
  }
  return n;
}
