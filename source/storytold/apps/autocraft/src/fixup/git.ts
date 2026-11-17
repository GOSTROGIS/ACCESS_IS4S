// Git and gh access for the fix-up step, through one injectable runner. The
// checkout is untrusted: a bare repository only (no working tree, so no
// filters, textconv drivers or hooks run), reached over HTTPS with the gh
// credential helper, with every command given the same locked-down config.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { envVar } from "../env.ts";
import { APP_CREDENTIAL_ARGS } from "../github/install-token.ts";
import { readEnvFor } from "../github/read.ts";

/** `sent: false`: the command failed before any request went out (the app lane could not get its token), so nothing reached GitHub. */
export type ExecResult = { code: number; stdout: string; stderr: string; sent?: false };
/** `replaceEnv`: `env` is the child's whole environment, not an addition to this process's (the app lane, which must not inherit the box account's tokens). */
/** `inherit`: run with this process's own environment and the box account's login, never the app's read token (the security-advisory writes, the pipeline account lookup). */
export type ExecOpts = { cwd?: string; env?: Record<string, string>; input?: string; replaceEnv?: boolean; inherit?: boolean };
/** Runs a command; resolves with its exit code, rejects only when it can't be started. */
export type Exec = (cmd: string, args: string[], opts?: ExecOpts) => Promise<ExecResult>;

export const exec: Exec = async (cmd, args, opts = {}) => {
  // A command that brings its own whole environment (a write lane) or asks to inherit keeps it. Any other gh command and
  // the network reads of git (fetch, ls-remote, clone, pull) read as the current identity: the app's installation token
  // under `app`, the inherited login under `box`. Local git commands and pushes get no token.
  const read = opts.replaceEnv || opts.inherit ? undefined : await readEnvFor(cmd, args);
  const env = opts.replaceEnv ? opts.env : { ...(read ?? process.env), ...opts.env };
  return spawned(cmd, args, opts, env);
};

const spawned = (cmd: string, args: string[], opts: ExecOpts, env: NodeJS.ProcessEnv | undefined): Promise<ExecResult> => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd: opts.cwd, env, stdio: ["pipe", "pipe", "pipe"], timeout: 300_000 });
  let stdout = "", stderr = "";
  p.stdout.on("data", (d) => (stdout += d));
  p.stderr.on("data", (d) => (stderr += d));
  p.on("error", reject);
  p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  p.stdin.on("error", () => {});
  p.stdin.end(opts.input ?? "");
});

/** Largest file read whole into memory for a conflict. */
const MAX_FILE_BYTES = 1024 * 1024;

export function fixupDir(): string {
  return envVar("FIXUP_DIR") ?? join(homedir(), ".cache/autocraft/fixups");
}

/** The empty tree: attributes are read from it, never from a tree in the repository (in a bare repository git may otherwise read HEAD's). */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * Options of every git command on a cached clone. The repository is named by GIT_DIR (`gitDirEnv`), so with
 * `safe.bareRepository=explicit` git never takes a directory it finds by itself for one; the rest pins the programs,
 * attribute sources and transports a repository's config or tree could otherwise choose.
 */
export const HARDENING = [
  "-c", "safe.bareRepository=explicit",
  "-c", "attr.tree=" + EMPTY_TREE,
  "-c", "core.hooksPath=/dev/null",
  "-c", "protocol.file.allow=never",
  "-c", "protocol.ext.allow=never",
  "-c", "core.fsmonitor=false",
  "-c", "core.attributesFile=/dev/null",
  "-c", "core.symlinks=false",
  "-c", "submodule.recurse=false",
  "-c", "fetch.recurseSubmodules=false",
  "-c", "diff.external=",
  "-c", "credential.helper=",
  "-c", "credential.helper=!gh auth git-credential",
];
export const GIT_ENV = { GIT_LFS_SKIP_SMUDGE: "1", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_ATTR_NOSYSTEM: "1" };
/** GIT_DIR for the bare repository `dir`: the repository is given, not discovered. */
export const gitDirEnv = (dir: string): { GIT_DIR: string } => ({ GIT_DIR: resolve(dir) });

export class Git {
  readonly dir: string;
  private run: Exec;
  constructor(run: Exec, root: string, repo: string) {
    this.run = run;
    this.dir = join(root, repo);
  }

  /**
   * git in the bare repository; `env` adds to the locked-down environment. With `app` the credentials are
   * the installation token's (`app.env` is the child's whole environment) instead of the box account's.
   */
  async git(args: string[], opts: { input?: string; env?: Record<string, string>; app?: { env: Record<string, string> } } = {}): Promise<ExecResult> {
    const app = opts.app;
    const go = () => app
      ? this.run("git", [...HARDENING, ...APP_CREDENTIAL_ARGS, ...args], { cwd: this.dir, input: opts.input, env: { ...app.env, ...GIT_ENV, ...gitDirEnv(this.dir), ...opts.env }, replaceEnv: true })
      : this.run("git", [...HARDENING, ...args], { cwd: this.dir, input: opts.input, env: { ...GIT_ENV, ...gitDirEnv(this.dir), ...opts.env } });
    if (args[0] !== "fetch") return go();
    // Sessions fetch into the same bare cache at once; a ref lock held by another fetch clears within moments.
    let r = await go();
    for (let i = 1; i <= 4 && r.code !== 0 && /cannot lock ref|Unable to create '.*\.lock'/.test(r.stderr); i++) {
      await new Promise((ok) => setTimeout(ok, 250 * i));
      r = await go();
    }
    return r;
  }

  /** Like git(), failing on a non-zero exit. */
  async must(args: string[], opts: { input?: string; env?: Record<string, string> } = {}): Promise<string> {
    const r = await this.git(args, opts);
    if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.trim().split("\n").pop() ?? r.code}`);
    return r.stdout;
  }

  async init(): Promise<void> {
    mkdirSync(this.dir, { recursive: true });
    // GIT_DIR names the directory, so rev-parse succeeds only when it holds a repository.
    const r = await this.git(["rev-parse", "--git-dir"]);
    if (r.code !== 0) await this.must(["init", "--bare", "--quiet", "."]);
  }

  /** Fetches the PR's head (`refs/pull/N/head` of the base repo) and returns the commit it points at. */
  async fetchPr(org: string, repo: string, number: number): Promise<string> {
    await this.init();
    await this.must(["fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", `https://github.com/${org}/${repo}.git`, `+refs/pull/${number}/head:refs/fixup/pr-${number}`]);
    return (await this.must(["rev-parse", `refs/fixup/pr-${number}`])).trim();
  }

  /** Fetches `branch` of `org/repo` and reports whether the commit `sha` is now available (it may be older than the branch head). */
  async fetchBranch(org: string, repo: string, branch: string, sha: string): Promise<boolean> {
    await this.init();
    await this.must(["fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", `https://github.com/${org}/${repo}.git`, `+refs/heads/${branch}:refs/fixissue/main`]);
    const have = (await this.git(["cat-file", "-e", `${sha}^{commit}`])).code === 0;
    return have;
  }

  /** The blob at `sha:path` as text with its mode, or why it can't be used. */
  async file(sha: string, path: string): Promise<{ ok: true; mode: string; content: string } | { ok: false; reason: string; tooLarge?: true }> {
    const t = await this.git(["ls-tree", sha, "--", path]);
    const m = t.stdout.match(/^(\d+) (\w+) [0-9a-f]+\t/);
    if (t.code !== 0 || !m) return { ok: false, reason: `${path} does not exist at the head commit` };
    if (m[2] !== "blob" || (m[1] !== "100644" && m[1] !== "100755")) return { ok: false, reason: `${path} is not a regular file` };
    const size = await this.git(["cat-file", "-s", `${sha}:${path}`]);
    if (size.code !== 0) return { ok: false, reason: `could not read ${path}` };
    if (Number(size.stdout.trim()) > MAX_FILE_BYTES) return { ok: false, reason: `${path} is over the size limit`, tooLarge: true };
    const r = await this.git(["cat-file", "blob", `${sha}:${path}`]);
    if (r.code !== 0) return { ok: false, reason: `could not read ${path}` };
    if (r.stdout.includes("\0")) return { ok: false, reason: `${path} is binary` };
    return { ok: true, mode: m[1]!, content: r.stdout };
  }

  /**
   * Applies `patch` to the tree of `head` in a private index file (no working
   * tree) and returns the new tree id, or why it doesn't apply. A hunk applied at an offset is refused in the paths of `exact`.
   */
  async applyToTree(head: string, patch: string, indexFile: string, exact: string[] = []): Promise<{ ok: true; tree: string } | { ok: false; reason: string }> {
    const env = { GIT_INDEX_FILE: indexFile };
    await this.must(["read-tree", head], { env });
    const chk = await this.git(["apply", "--cached", "--check", "--verbose", "--whitespace=nowarn", "-"], { input: patch, env });
    if (chk.code !== 0) {
      // --verbose puts "Checking patch <path>..." lines first; the cause is on the "error:" lines.
      const lines = chk.stderr.split("\n").map((l) => l.trim()).filter(Boolean);
      const errors = lines.filter((l) => l.startsWith("error:")).map((l) => l.slice(6).trim());
      const why = errors.length ? errors.join("; ") : lines.at(-1) ?? "failed";
      return { ok: false, reason: `git apply --check: ${why}`.slice(0, 500) };
    }
    // In the files in `exact` (shown in part), a hunk found elsewhere than its header says may sit on a block the model never saw.
    let current = "";
    let offset = false;
    for (const l of chk.stderr.split("\n")) {
      const f = /^Checking patch (.*?)\.\.\.$/.exec(l);
      if (f) current = f[1]!;
      else if (/\(offset -?\d+ lines?\)/.test(l) && exact.includes(current)) offset = true;
    }
    if (offset) return { ok: false, reason: "a hunk of the patch applies at a different line than its header states" };
    await this.must(["apply", "--cached", "--whitespace=nowarn", "-"], { input: patch, env });
    return { ok: true, tree: (await this.must(["write-tree"], { env })).trim() };
  }

  /** Changes between two commits as `git diff-tree --raw` rows: [old mode, new mode, status, path]. */
  async rawChanges(from: string, to: string): Promise<string[][]> {
    const out = await this.must(["diff-tree", "-r", "--raw", "--no-renames", "-z", from, to]);
    const parts = out.split("\0").filter(Boolean);
    const rows: string[][] = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const [a, b, , , status] = parts[i]!.slice(1).split(" ");
      rows.push([a!, b!, status!, parts[i + 1]!]);
    }
    return rows;
  }

  async commit(tree: string, parent: string, message: string, who: { name: string; email: string }): Promise<string> {
    const env = { GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email };
    return (await this.must(["commit-tree", tree, "-p", parent, "-F", "-"], { input: message, env })).trim();
  }

  /** Fetches the base branch of the base repository and returns its commit. */
  async fetchBase(org: string, repo: string, branch: string): Promise<string> {
    await this.init();
    const ref = `refs/fixup/base/${branch}`;
    await this.must(["fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", `https://github.com/${org}/${repo}.git`, `+refs/heads/${branch}:${ref}`]);
    return (await this.must(["rev-parse", ref])).trim();
  }

  /**
   * The merge of `base` into `head` in memory (`git merge-tree --write-tree`, no working tree): the result tree, and the
   * conflicted paths when it has conflicts. The tree then holds conflict markers in those files.
   */
  async mergeInto(head: string, base: string): Promise<{ clean: boolean; tree: string; conflicted: string[] }> {
    const r = await this.git(["-c", "merge.conflictStyle=merge", "merge-tree", "--write-tree", "--name-only", "-z", head, base]);
    if (r.code !== 0 && r.code !== 1) throw new Error(`git merge-tree failed: ${r.stderr.trim().split("\n").pop() ?? r.code}`);
    const parts = r.stdout.split("\0");
    const tree = parts[0]!.trim();
    const conflicted: string[] = [];
    for (const f of parts.slice(1)) {
      if (f === "") break;
      conflicted.push(f);
    }
    if (!/^[0-9a-f]{40,64}$/.test(tree)) throw new Error("git merge-tree gave no tree");
    return { clean: r.code === 0, tree, conflicted };
  }

  /** The tree `tree` with the given files replaced by new content (same mode), built in a private index file. */
  async withFiles(tree: string, files: { path: string; mode: string; content: string }[], indexFile: string): Promise<string> {
    const env = { GIT_INDEX_FILE: indexFile };
    await this.must(["read-tree", tree], { env });
    for (const f of files) {
      const oid = (await this.must(["hash-object", "-w", "--no-filters", "--stdin"], { input: f.content })).trim();
      await this.must(["update-index", "--add", "--cacheinfo", `${f.mode},${oid},${f.path}`], { env });
    }
    return (await this.must(["write-tree"], { env })).trim();
  }

  /** The unified diff from commit `from` to commit `to`, without external diff drivers or text conversion. */
  async diffText(from: string, to: string): Promise<string> {
    return this.must(["diff-tree", "-p", "-r", "--no-renames", "--no-ext-diff", "--no-textconv", from, to]);
  }

  /** A commit of `tree` with the given parents, first parent first. */
  async commitMerge(tree: string, parents: string[], message: string, who: { name: string; email: string }): Promise<string> {
    const env = { GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email };
    return (await this.must(["commit-tree", tree, ...parents.flatMap((p) => ["-p", p]), "-F", "-"], { input: message, env })).trim();
  }
}
