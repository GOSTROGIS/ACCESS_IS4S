// The crates of a repo at one commit, from the GitHub tree API, cached by sha next to the diff cache.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { diffCacheDir } from "../review/diff.ts";
import type { Crate } from "./types.ts";
import { slugOf } from "../owners.ts";
import { readEnvFor } from "../github/read.ts";

const REPO_DIR = fileURLToPath(new URL("../..", import.meta.url));
const MAX_MANIFESTS = 80;
const CRATE_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export type CrateInfo = { rust: boolean; crates: Crate[] };
export type CratesResult = ({ ok: true } & CrateInfo) | { ok: false; error: string };
export type CratesFetcher = (repo: string, sha: string) => Promise<CratesResult>;

/** `gh api <path>` stdout; rejects with the error text. */
export async function ghApi(path: string, jq?: string): Promise<string> {
  const args = ["api", path, ...(jq ? ["--jq", jq] : [])];
  const env = await readEnvFor("gh", args);
  return new Promise((resolve, reject) => {
    const p = spawn("gh", args, { cwd: REPO_DIR, timeout: 60_000, ...(env ? { env } : {}) });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => reject(e));
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out).toString("utf8")) : reject(new Error(err.trim().slice(0, 300) || `gh exited ${code}`))));
  });
}

/** The package name in a Cargo.toml, or null for a virtual workspace manifest. */
export function packageName(toml: string): string | null {
  let inPackage = false;
  for (const line of toml.split("\n")) {
    const t = line.trim();
    if (t.startsWith("[")) inPackage = t === "[package]";
    else if (inPackage) {
      const m = /^name\s*=\s*"([^"]+)"/.exec(t);
      if (m && CRATE_NAME.test(m[1]!)) return m[1]!;
    }
  }
  return null;
}

/** Crates from a recursive tree listing and a reader for blobs. `rust` means a Cargo.toml at the root. */
export async function cratesFromTree(tree: { path: string; type: string; sha: string }[], readBlob: (sha: string) => Promise<string>): Promise<CrateInfo> {
  const manifests = tree.filter((e) => e.type === "blob" && (e.path === "Cargo.toml" || e.path.endsWith("/Cargo.toml")));
  const crates: Crate[] = [];
  for (const m of manifests.slice(0, MAX_MANIFESTS)) {
    const name = packageName(await readBlob(m.sha));
    if (name) crates.push({ name, dir: m.path === "Cargo.toml" ? "." : m.path.slice(0, -"/Cargo.toml".length) });
  }
  return { rust: manifests.some((m) => m.path === "Cargo.toml"), crates };
}

export const ghCrates: CratesFetcher = async (repo, sha) => {
  try {
    const raw = await ghApi(`repos/${slugOf(repo)}/git/trees/${sha}?recursive=1`, "[.tree[] | {path, type, sha}]");
    const tree = JSON.parse(raw) as { path: string; type: string; sha: string }[];
    const info = await cratesFromTree(tree, async (blob) => Buffer.from((await ghApi(`repos/${slugOf(repo)}/git/blobs/${blob}`, ".content")).trim().replace(/\\n/g, ""), "base64").toString("utf8"));
    return { ok: true, ...info };
  } catch (e) {
    return { ok: false, error: String((e as Error).message ?? e) };
  }
};

const cachePath = (repo: string, sha: string): string => join(diffCacheDir(), repo, `crates-${sha}.json`);

/** The cached answer for a commit, or null when none was fetched yet. */
export function cachedCratesOf(repo: string, sha: string): CrateInfo | null {
  const f = cachePath(repo, sha);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as CrateInfo;
  } catch {
    return null;
  }
}

export async function cachedCrates(repo: string, sha: string, fetch: CratesFetcher): Promise<CratesResult> {
  const hit = cachedCratesOf(repo, sha);
  if (hit) return { ok: true, ...hit };
  const r = await fetch(repo, sha);
  if (r.ok) {
    const f = cachePath(repo, sha);
    mkdirSync(join(diffCacheDir(), repo), { recursive: true });
    writeFileSync(`${f}.tmp`, JSON.stringify({ rust: r.rust, crates: r.crates }));
    renameSync(`${f}.tmp`, f);
  }
  return r;
}
