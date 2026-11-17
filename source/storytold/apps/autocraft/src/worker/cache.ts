// Shared crate cache and why it cannot poison later tasks.
//
// The shared cache is never mounted into a container. Each task gets its own
// CARGO_HOME (`/cache/cargo`), seeded by copying `.crate` files from the shared
// cache, and thrown away with the task. Cargo does not re-verify files already
// in `registry/cache`, so nothing a task wrote is trusted. Instead, right after
// each network ("fetch") step, before any build script or test of the task has
// run, the worker process (on the host) admits a file to the shared cache only
// when it is a regular `*.crate` in the official crates.io registry directory
// (`index.crates.io-*`) and its sha256 equals the checksum in the crates.io
// sparse index. Other registries, git sources and anything written by offline
// steps are never admitted. A lookup failure means not admitted.
import { createHash } from "node:crypto";
import { copyFileSync, constants, readFileSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const INDEX_DIR = /^[A-Za-z0-9._-]+$/;
const CRATE_FILE = /^[A-Za-z0-9._+-]+\.crate$/;
const MAX_CRATE_BYTES = 100 * 1024 * 1024;

export function crateFilesOf(root: string): { index: string; file: string; path: string }[] {
  const base = join(root, "registry", "cache");
  // A container can plant symlinks for any component: each one must be a real directory.
  const isDir = (p: string): boolean => { try { return lstatSync(p).isDirectory(); } catch { return false; } };
  if (!isDir(join(root, "registry")) || !isDir(base)) return [];
  const out: { index: string; file: string; path: string }[] = [];
  for (const index of readdirSync(base)) {
    const dir = join(base, index);
    if (!INDEX_DIR.test(index) || !lstatSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      const path = join(dir, file);
      const st = lstatSync(path);
      if (CRATE_FILE.test(file) && st.isFile() && st.size <= MAX_CRATE_BYTES) out.push({ index, file, path });
    }
  }
  return out;
}

function copyInto(from: { index: string; file: string; path: string }, toRoot: string): void {
  const dir = join(toRoot, "registry", "cache", from.index);
  const dest = join(dir, from.file);
  if (existsSync(dest)) return;
  mkdirSync(dir, { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  copyFileSync(from.path, tmp, constants.COPYFILE_FICLONE);
  renameSync(tmp, dest);
}

/** Copies cached crates into a task's CARGO_HOME (`sharedDir` and `taskCargoHome` are host paths). */
export function seedCargoHome(sharedDir: string, taskCargoHome: string): void {
  mkdirSync(taskCargoHome, { recursive: true });
  for (const f of crateFilesOf(sharedDir)) copyInto(f, taskCargoHome);
}

const CRATES_IO_DIR = /^index\.crates\.io-[0-9a-f]+$/;
export const CRATES_IO_INDEX = "https://index.crates.io";

export function indexPath(name: string): string {
  const n = name.toLowerCase();
  return n.length <= 2 ? `${n.length}/${n}` : n.length === 3 ? `3/${n[0]}/${n}` : `${n.slice(0, 2)}/${n.slice(2, 4)}/${n}`;
}

/** Looks up crate checksums in the crates.io sparse index; one request per crate name and verifier. */
export class CrateVerifier {
  #cache = new Map<string, Promise<Map<string, string>>>();
  #base: string;
  #fetch: typeof fetch;
  constructor(base = CRATES_IO_INDEX, fetchImpl: typeof fetch = fetch) {
    this.#base = base;
    this.#fetch = fetchImpl;
  }

  #versions(name: string): Promise<Map<string, string>> {
    let p = this.#cache.get(name);
    if (!p) {
      p = (async () => {
        const res = await this.#fetch(`${this.#base}/${indexPath(name)}`, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`index HTTP ${res.status}`);
        const m = new Map<string, string>();
        for (const line of (await res.text()).split("\n")) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as { name?: string; vers?: string; cksum?: string };
          if (e.name?.toLowerCase() === name.toLowerCase() && e.vers && e.cksum) m.set(e.vers, e.cksum);
        }
        return m;
      })();
      p.catch(() => this.#cache.delete(name)); // retry failed lookups next time
      this.#cache.set(name, p);
    }
    return p;
  }

  /** True when `file` ("name-1.2.3.crate") has content with the index's checksum. */
  async verify(file: string, sha256: string): Promise<boolean> {
    const stem = file.slice(0, -".crate".length);
    // Names contain hyphens and digits, so try each split point before a digit.
    for (let i = stem.indexOf("-"); i > 0; i = stem.indexOf("-", i + 1)) {
      if (!/\d/.test(stem[i + 1] ?? "")) continue;
      const m = await this.#versions(stem.slice(0, i));
      const want = m.get(stem.slice(i + 1));
      if (want) return want === sha256;
    }
    return false;
  }
}

/**
 * Copies verified crates.io crates from a task's CARGO_HOME into the shared
 * cache. Call it right after a fetch step. Returns the number admitted.
 */
export async function admitCrates(taskCargoHome: string, sharedDir: string, v: CrateVerifier, note: (s: string) => void): Promise<number> {
  let n = 0;
  for (const f of crateFilesOf(taskCargoHome)) {
    if (!CRATES_IO_DIR.test(f.index)) continue;
    if (existsSync(join(sharedDir, "registry", "cache", f.index, f.file))) continue;
    try {
      const hash = createHash("sha256").update(readFileSync(f.path)).digest("hex");
      if (!(await v.verify(f.file, hash))) {
        note(`crate ${f.file} not admitted to the cache: checksum does not match the crates.io index`);
        continue;
      }
      copyInto(f, sharedDir);
      n++;
    } catch (e) {
      note(`crate ${f.file} not admitted to the cache: ${(e as Error).message}`);
    }
  }
  return n;
}
