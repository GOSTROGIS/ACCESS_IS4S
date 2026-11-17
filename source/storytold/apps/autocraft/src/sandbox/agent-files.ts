// Writes the generated files of a workspace call (the explorer definition and the MCP config) on the host.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentsDefinition } from "./agents.ts";
import { checkoutRoot } from "./checkout.ts";

/** Writes the agents file on the host (once per distinct definition) and returns its path. */
export function agentsFile(mcpServers: string[] = [], root = dirname(checkoutRoot())): string {
  const text = JSON.stringify(agentsDefinition(mcpServers));
  const f = join(root, `agents-${createHash("sha256").update(text).digest("hex").slice(0, 12)}.json`);
  if (!existsSync(f)) {
    mkdirSync(root, { recursive: true });
    const tmp = `${f}.tmp-${process.pid}`;
    writeFileSync(tmp, text, { mode: 0o644 });
    renameSync(tmp, f);
  }
  return f;
}

/** Writes the MCP config (`{mcpServers}`, owner-only: server entries may carry environment values) and returns its host path. */
export function mcpFile(mcpServers: Record<string, unknown>, root = dirname(checkoutRoot())): string {
  const text = JSON.stringify({ mcpServers });
  const f = join(root, `mcp-${createHash("sha256").update(text).digest("hex").slice(0, 12)}.json`);
  if (!existsSync(f)) {
    mkdirSync(root, { recursive: true });
    const tmp = `${f}.tmp-${process.pid}`;
    writeFileSync(tmp, text, { mode: 0o600 });
    renameSync(tmp, f);
  }
  return f;
}
