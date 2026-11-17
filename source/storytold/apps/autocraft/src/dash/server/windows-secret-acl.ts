import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Action = "CheckFile" | "CheckDirectory" | "ProtectDirectory";

export function windowsSecretAcl(action: Action, input: string): void {
  const path = resolve(input);
  if (!/^[a-z]:\\[^:]+$/i.test(path) || realpathSync.native(path).toLowerCase() !== path.toLowerCase()) {
    throw new Error("AutoCraft private data needs a regular local path without reparse points or alternate streams.");
  }
  const powershellHome = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0");
  const powershell = join(powershellHome, "powershell.exe");
  const script = fileURLToPath(new URL("./windows-secret-acl.ps1", import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== "psmodulepath"));
  env.PSModulePath = join(powershellHome, "Modules");
  const result = spawnSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", script, "-Action", action, "-LiteralPath", path], {
    env, stdio: "ignore", windowsHide: true, timeout: 60_000,
  });
  if (result.status !== 0) throw new Error("AutoCraft private data failed the Windows ACL check.");
}
