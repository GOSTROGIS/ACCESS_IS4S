// Git side of an integration batch, in the same locked-down bare cache repository as the fix-up step: merges
// are computed in memory with `git merge-tree`, so no working tree exists and no hook, filter or repo code runs.
import { Git } from "../fixup/git.ts";

export class BatchGit extends Git {
  /** Fetches the default branch and returns its head commit. */
  async fetchMain(org: string, repo: string, branch: string): Promise<string> {
    await this.init();
    await this.must(["fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", `https://github.com/${org}/${repo}.git`, `+refs/heads/${branch}:refs/batch/main`]);
    return (await this.must(["rev-parse", "refs/batch/main"])).trim();
  }

  /** The tree of merging commit `b` into `a`, or null when they conflict. */
  async mergeTree(a: string, b: string): Promise<string | null> {
    const r = await this.git(["merge-tree", "--write-tree", "--no-messages", a, b]);
    if (r.code === 1) return null;
    if (r.code !== 0) throw new Error(`git merge-tree failed: ${r.stderr.trim().split("\n").pop() ?? r.code}`);
    return r.stdout.split("\n")[0]!.trim();
  }

  /** A merge commit with the given parents. */
  async mergeCommit(tree: string, parents: string[], message: string, who: { name: string; email: string }): Promise<string> {
    const env = { GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email };
    return (await this.must(["commit-tree", tree, ...parents.flatMap((p) => ["-p", p]), "-F", "-"], { input: message, env })).trim();
  }
}
