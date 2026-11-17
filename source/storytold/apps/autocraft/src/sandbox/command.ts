// The bubblewrap command that runs `claude` with read-only file tools on a
// checkout. Pure: it builds the argument list and touches nothing. The
// sandbox sees only what claude needs to start, the checkout (read-only), an
// empty home and the account's credentials: its credentials file, or with a
// long-lived token only that token (no credentials file, so no refresh token). Network is
// shared because the API needs it; everything else is a new namespace. The environment is the exact one in the returned `env`.

/** Where the checkout appears inside the sandbox: outside the working directory, so claude never loads its instruction files as project memory. */
export const REPO_PATH = "/repo";
/** Where a repo's private reference documentation is mounted read-only. */
export const REFERENCE_PATH = "/reference";
/** Where the default branch's maintainer documents of the item's repository are mounted read-only (src/sandbox/repo-docs.ts). */
export const REPO_DOCS_PATH = "/repo-docs";
/** Where each tracked repository's default-branch checkout appears: `/repos/<name>`. */
export const REPOS_ROOT = "/repos";
export const reposPath = (name: string): string => `${REPOS_ROOT}/${name}`;
/** Where the generated agents file (src/sandbox/agents.ts) appears. */
export const AGENTS_PATH = "/agents.json";
/** A repository name that is safe as a mount point. */
export const SHARED_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
/** The empty working directory. */
export const WORK_PATH = "/work";
const HOME = "/home/sandbox";
const CONFIG = `${HOME}/.claude`;
/**
 * Reads the model is refused outright: the process environments (the long-lived token is in the CLI's) and the CLI's credential directory.
 * The CLI's rule syntax takes `//path` as absolute (the form the allow rules use) and `/path` as relative to a settings source, so each path is denied in both forms.
 */
export const DENIED_READS = ["/proc", CONFIG].flatMap((p) => [`Read(/${p}/**)`, `Read(${p}/**)`]);
const CLAUDE_PATH = "/opt/claude/claude";

export type SandboxSpec = {
  /** Resolved path of the claude binary on the host. */
  claudeBin: string;
  /** Host directory holding the checkout's files. */
  checkout: string;
  /** The account's credentials file on the host; the rest of its config directory is not visible. Absent when `oauthToken` is given. */
  credentials?: string;
  /** The account's long-lived token; passed as an environment variable instead of mounting credentials. */
  oauthToken?: string;
  /** Arguments for claude (src/prompts `claudeArgs`). */
  claudeArgs: string[];
  /** The workspace: further read-only checkouts, each mounted at `/repos/<name>`. Present (even empty) means `/repos` exists and `claudeArgs` names it with --add-dir. */
  shared?: { name: string; dir: string }[];
  /** Host file with the agents definition, mounted read-only at /agents.json. */
  agentsFile?: string;
  /** Writable host directory for the session store (`projects` under the config directory), so a later `--resume` finds the session; without it nothing of the session outlives the call. */
  sessionDir?: string;
  /** Further read-only mounts (item data, MCP server code and configs); `path` is absolute inside the sandbox. */
  extraMounts?: { host: string; path: string }[];
};

const MOUNT_PATH = /^\/[A-Za-z0-9._\/-]{1,200}$/;

export const BWRAP = "/usr/bin/bwrap";

/**
 * The command and the complete environment of the bwrap process. The caller
 * passes `env` as the process's whole environment (nothing of the host's):
 * bwrap's child inherits it. Nothing secret goes into `args`, which any user
 * can read in /proc/<pid>/cmdline; the long-lived token is only in `env`.
 */
export function sandboxCommand(s: SandboxSpec): { cmd: string; args: string[]; env: Record<string, string> } {
  for (const x of s.shared ?? []) if (!SHARED_NAME.test(x.name)) throw new Error(`unsafe repository name: ${x.name}`);
  for (const m of s.extraMounts ?? []) if (!MOUNT_PATH.test(m.path) || m.path.includes("..")) throw new Error(`unsafe mount path: ${m.path}`);
  const env: [string, string][] = [
    ["HOME", HOME], ["CLAUDE_CONFIG_DIR", CONFIG], ["PATH", "/usr/bin"], ["LANG", "C.UTF-8"], ["DISABLE_AUTOUPDATER", "1"],
  ];
  const args = [
    "--unshare-all", "--share-net", "--die-with-parent", "--new-session",
    "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64", "--symlink", "usr/bin", "/bin",
    "--ro-bind", "/etc/ssl", "/etc/ssl", "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
    "--tmpfs", HOME, "--tmpfs", CONFIG,
    // Read-only: the sandbox never refreshes the token (src/sandbox/index.ts `tokenNearExpiry` keeps a call from starting on an account whose token is about to expire; it waits for a refresh). A long-lived token needs no refresh.
    ...(s.oauthToken || !s.credentials ? [] : ["--ro-bind", s.credentials, `${CONFIG}/.credentials.json`]),
    ...(s.sessionDir ? ["--bind", s.sessionDir, `${CONFIG}/projects`] : []),
    "--ro-bind", s.claudeBin, CLAUDE_PATH,
    // The working directory is empty and the checkout sits beside it (claude gets it with --add-dir), so no project instructions or settings from the checkout are found.
    "--tmpfs", WORK_PATH, "--ro-bind", s.checkout, REPO_PATH,
    ...(s.shared ? ["--dir", REPOS_ROOT] : []),
    ...(s.shared ?? []).flatMap((x) => ["--ro-bind", x.dir, reposPath(x.name)]),
    ...(s.agentsFile ? ["--ro-bind", s.agentsFile, AGENTS_PATH] : []),
    ...(s.extraMounts ?? []).flatMap((m) => ["--ro-bind", m.host, m.path]),
    "--chdir", WORK_PATH,
    CLAUDE_PATH, ...s.claudeArgs,
  ];
  return { cmd: BWRAP, args, env: { ...Object.fromEntries(env), ...(s.oauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: s.oauthToken } : {}) } };
}
