// GET /api/prompts: the prompt registry (src/prompts) and the commit the server runs.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PromptsReport } from "../../../web/src/api/types.ts";
import type { DatabaseSync } from "node:sqlite";
import { promptsReport, CLAUDE_RESULT, CLAUDE_PROMPTS, type ClaudePromptId } from "../../prompts/index.ts";
import { modelPolicy } from "../../agents/codex/config.ts";
import { CHECK_MAX_WALL_MS } from "../../core/rules.ts";

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

export function prompts(db?: DatabaseSync): PromptsReport {
  const report = promptsReport(COMMIT), policy = db ? modelPolicy(db) : null;
  if (!policy || policy.provider !== "codex") return report;
  return { ...report, prompts: report.prompts.map(p => {
    if (p.runner !== "claude") return p;
    const registered = CLAUDE_PROMPTS[p.id as ClaudePromptId];
    return { ...p, runner: "codex", models: [policy.model], command: "codex app-server (registered prompt over authenticated local RPC)",
      validation: p.validation.replace(CLAUDE_RESULT, "The genuine Codex final-answer text is the reply. Failed, interrupted or capped turns do not count as an answer."),
      settings: [{ label: "Provider", value: "Codex; the original workflow id and reply parser are preserved" },
        { label: "Reasoning", value: policy.reasoningEffort }, { label: "Token budget", value: String(policy.maxTokens) },
        { label: "Max model responses", value: String(Math.min(policy.maxTurns, registered.sandbox?.maxTurns ?? 1)) },
          { label: "Whole call time budget", value: `${Math.min(policy.maxWallMs, p.limits.timeoutSeconds * 1000 + (registered.sandbox?.check ? CHECK_MAX_WALL_MS : 0)) / 1000} seconds including initialization and all follow-ups` },
        { label: "Tools", value: registered.sandbox ? "Native read-only shell/search and image tools; registered workspace/item/check MCP capabilities are retained when the call has its checkout" : "None" },
        { label: "Session", value: "An exclusive job session store preserves genuine threadId resume; external access credentials remain in memory" },
        { label: "Cost", value: "Unknown unless reported by the provider; never substituted with zero" }], };
  }) };
}
