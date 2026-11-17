// The maintainers' documents of a repository for a sandboxed call: AGENTS.md
// (stored as AGENTS.txt, so claude never loads it as project memory) and
// ROADMAP.md from the DEFAULT BRANCH, never from the pull request's head.
// One directory per repository and default-branch commit, outside the call's
// working directory, mounted read-only at /repo-docs.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { exec, fixupDir, Git } from "../fixup/git.ts";
import { checkoutRoot, pruneCheckouts, touchCheckout } from "./checkout.ts";
import { SHARED_NAME } from "./command.ts";
import { ownerOf } from "../owners.ts";

/** Repository file name -> name in the docs directory. */
export const DOC_FILES: Record<string, string> = { "AGENTS.md": "AGENTS.txt", "ROADMAP.md": "ROADMAP.md" };
export const DOC_MAX_CHARS = 100_000;
const HEAD_TTL_MS = 5 * 60_000;
const MAX_AGE_MS = 24 * 3600_000;

export const docsRoot = (): string => join(dirname(checkoutRoot()), "repo-docs");

export type DocsDeps = {
  /** Head commit of the repository's default branch, or null. */
  headOf(repo: string, branch: string): Promise<string | null>;
  /** The docs at that commit, by repository file name; missing files are absent. */
  read(repo: string, branch: string, sha: string): Promise<Record<string, string>>;
};

/** Reads the docs of commit `sha` from the bare clone behind `g`. */
export async function docsAt(g: Git, sha: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of Object.keys(DOC_FILES)) {
    const f = await g.file(sha, name);
    if (f.ok) out[name] = f.content.slice(0, DOC_MAX_CHARS);
  }
  return out;
}

export function defaultDocsDeps(): DocsDeps {
  return {
    async headOf(repo, branch) {
      const { defaultDeps } = await import("../fixissue/index.ts");
      return defaultDeps().mainHead(repo, branch);
    },
    async read(repo, branch, sha) {
      const g = new Git(exec, fixupDir(), repo);
      return (await g.fetchBranch(ownerOf(repo), repo, branch, sha)) ? docsAt(g, sha) : {};
    },
  };
}

const heads = new Map<string, { sha: string; at: number }>();

/**
 * The directory to mount at /repo-docs for `repo`, or null when its default branch has neither file
 * (or anything fails: the call then runs without the docs).
 */
export async function repoDocsFor(repo: string, branch: string, d: DocsDeps = defaultDocsDeps(), root = docsRoot(), now = Date.now()): Promise<string | null> {
  if (!SHARED_NAME.test(repo)) return null;
  try {
    const key = `${repo}@${branch}`;
    let h = heads.get(key);
    if (!h || now - h.at > HEAD_TTL_MS) {
      const sha = await d.headOf(repo, branch);
      if (!sha || !/^[0-9a-f]{40,64}$/.test(sha)) return null;
      h = { sha, at: now };
      heads.set(key, h);
    }
    const dest = join(root, repo, h.sha);
    if (!existsSync(dest)) {
      const docs = await d.read(repo, branch, h.sha);
      const tmp = `${dest}.tmp-${process.pid}`;
      rmSync(tmp, { recursive: true, force: true });
      mkdirSync(tmp, { recursive: true, mode: 0o700 });
      for (const [name, text] of Object.entries(docs)) if (DOC_FILES[name]) writeFileSync(join(tmp, DOC_FILES[name]!), text, { mode: 0o644 });
      mkdirSync(dirname(dest), { recursive: true });
      try { renameSync(tmp, dest); } catch (e) { rmSync(tmp, { recursive: true, force: true }); if (!existsSync(dest)) throw e; }
    } else touchCheckout(dest);
    pruneCheckouts(root, MAX_AGE_MS);
    return readdirSync(dest).length ? dest : null;
  } catch (e) {
    console.log(`  repo docs ${repo}: ${String((e as Error).message).slice(0, 150)}; asking without them`);
    return null;
  }
}

/** The repository a checkout under the checkout root belongs to (`<root>/<repo>/<sha>`), or undefined for any other directory. */
export function repoOfCheckout(dir: string): string | undefined {
  const repo = basename(dirname(dir));
  return dirname(dirname(dir)) === checkoutRoot() && SHARED_NAME.test(repo) ? repo : undefined;
}
