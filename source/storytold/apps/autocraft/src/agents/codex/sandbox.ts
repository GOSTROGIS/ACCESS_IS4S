import { BWRAP, REPO_PATH, REPOS_ROOT, SHARED_NAME, WORK_PATH, reposPath } from "../../sandbox/command.ts";

export const CODEX_PATH = "/opt/codex/codex";
export const CODEX_NODE_PATH = "/opt/codex/node";
export const CODEX_TOOL_PATH = "/opt/codex:/usr/bin";
export const CODEX_SESSION_PATH = "/home/sandbox/.codex";
export type CodexSandboxSpec = {
  binary: string; node: string; sessionDir: string; checkout?: string;
  shared?: { name: string; dir: string }[];
  mounts?: { host: string; path: string }[];
};
const targetPath = /^\/[A-Za-z0-9._/-]{1,200}$/;

/** The socket, native database, account store and host environment are never mounted. */
export function codexSandbox(spec: CodexSandboxSpec): { cmd: string; args: string[]; env: Record<string, string> } {
  for (const s of spec.shared ?? []) if (!SHARED_NAME.test(s.name)) throw new Error("Unsafe workspace name.");
  for (const m of spec.mounts ?? []) if (!targetPath.test(m.path) || m.path.split("/").includes("..") ||
      ["/proc", "/home", "/usr", "/opt", "/tmp", "/dev"].some(root => m.path === root || m.path.startsWith(root + "/"))) throw new Error("Unsafe provider mount.");
  return {
    cmd: BWRAP,
    // The existing sandbox's empty /home/sandbox is also the OS user's temporary
    // home here. It has no host account files; only this call's thread data lives.
    env: { PATH: CODEX_TOOL_PATH, LANG: "C.UTF-8" },
    args: ["--unshare-all", "--share-net", "--die-with-parent", "--new-session",
      "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64", "--symlink", "usr/bin", "/bin",
      "--ro-bind", "/etc/ssl", "/etc/ssl", "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
      "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--tmpfs", "/home/sandbox",
      "--bind", spec.sessionDir, CODEX_SESSION_PATH,
      // A synthetic account database gives getpwuid the isolated home without
      // assigning HOME/CODEX_HOME or importing the real user's account file.
      "--ro-bind", `${spec.sessionDir}/passwd`, "/etc/passwd",
      "--ro-bind", spec.binary, CODEX_PATH, "--ro-bind", spec.node, CODEX_NODE_PATH,
      "--tmpfs", WORK_PATH, ...(spec.checkout ? ["--ro-bind", spec.checkout, REPO_PATH] : ["--dir", REPO_PATH]),
      "--dir", REPOS_ROOT, ...(spec.shared ?? []).flatMap(s => ["--ro-bind", s.dir, reposPath(s.name)]),
      ...(spec.mounts ?? []).flatMap(m => ["--ro-bind", m.host, m.path]), "--chdir", WORK_PATH,
      CODEX_PATH, "-c", 'cli_auth_credentials_store="ephemeral"', "-c", 'approval_policy="never"',
      "-c", 'sandbox_mode="read-only"', "-c", 'shell_environment_policy.inherit="none"',
      "-c", `shell_environment_policy.set.PATH=${JSON.stringify(CODEX_TOOL_PATH)}`, "-c", 'shell_environment_policy.set.LANG="C.UTF-8"',
      "-c", "features.shell_snapshot=false", "app-server"],
  };
}
