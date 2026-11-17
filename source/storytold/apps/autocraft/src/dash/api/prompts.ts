// GET /api/prompts: the prompt registry (src/prompts) and the commit the server runs.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PromptsReport } from "../../../web/src/api/types.ts";
import { promptsReport } from "../../prompts/index.ts";

// Read when the server loads its code, so a later checkout without a restart
// does not change what the page claims.
const COMMIT = ((): string | null => {
  try {
    const cwd = fileURLToPath(new URL("../../..", import.meta.url));
    // A deployed release has no .git; the deploy hook writes the commit here.
    try {
      const stamped = readFileSync(`${cwd}/.source-commit`, "utf8").trim();
      if (/^[0-9a-f]{40}$/.test(stamped)) return stamped;
    } catch {}
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim() || null;
  } catch {
    return null;
  }
})();

export function prompts(): PromptsReport {
  return promptsReport(COMMIT);
}
