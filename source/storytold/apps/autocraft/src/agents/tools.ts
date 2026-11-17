// Tool uses of a model call, read from the `claude -p` event stream and stored per agent run (agent_run_tools).
// Arguments are scrubbed and capped; results are never stored, only their size.
import type { DatabaseSync } from "node:sqlite";
import { scrub } from "../runner/scrub.ts";

export const TOOL_ARGS_MAX = 4000;
/** The check tool's name as the model sees it (MCP server `build`, tool `check`). */
export const CHECK_TOOL_NAME = "mcp__build__check";

type Block = { type?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; is_error?: boolean };
type Event = { type?: string; message?: { content?: unknown } };
export type ToolUse = { id: string; name: string; args: string; resultBytes: number | null; isError: boolean; command: string | null; noRow: boolean };
/** Arrival time of a stream line, by tool_use id, for streamed output. */
export type ToolClock = { start: Map<string, string>; end: Map<string, string> };

const sizeOf = (c: unknown): number => {
  if (typeof c === "string") return Buffer.byteLength(c);
  if (Array.isArray(c)) return c.reduce((n: number, b: { text?: unknown }) => n + (typeof b?.text === "string" ? Buffer.byteLength(b.text) : Buffer.byteLength(JSON.stringify(b ?? null))), 0);
  return c === undefined || c === null ? 0 : Buffer.byteLength(JSON.stringify(c));
};

const textOf = (c: unknown): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((b: { text?: unknown }) => (typeof b?.text === "string" ? b.text : "")).join("") : "");
/** Replies of the check tool that come back before it writes its model_checks row (src/checktool/index.ts). */
const NO_ROW = /^(?:refused: |the model call is over|the patch does not apply|(?:rustfmt|clippy): the patch changes no \.rs file)/;

/** Tool uses in order, paired with their results by id. Accepts the event list of `--output-format json` or the lines of stream-json. */
export function toolUses(events: unknown): ToolUse[] {
  const list = Array.isArray(events) ? events as Event[] : [];
  const byId = new Map<string, ToolUse>();
  for (const e of list) {
    if (!Array.isArray(e?.message?.content)) continue;
    for (const b of e.message!.content as Block[]) {
      if (e.type === "assistant" && b?.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") {
        const command = b.name === CHECK_TOOL_NAME && typeof (b.input as { command?: unknown } | null)?.command === "string" ? (b.input as { command: string }).command : null;
        byId.set(b.id, { id: b.id, name: b.name, args: scrub(JSON.stringify(b.input ?? null)).slice(0, TOOL_ARGS_MAX), resultBytes: null, isError: false, command, noRow: false });
      } else if (e.type === "user" && b?.type === "tool_result" && typeof b.tool_use_id === "string") {
        const u = byId.get(b.tool_use_id);
        if (u) { u.resultBytes = sizeOf(b.content); u.isError = b.is_error === true; u.noRow = u.command !== null && NO_ROW.test(textOf(b.content)); }
      }
    }
  }
  return [...byId.values()];
}

/** Records the arrival time of tool_use and tool_result blocks in one raw stream-json line. */
export function clockLine(clock: ToolClock, raw: string, at: string = new Date().toISOString()): void {
  if (!raw.startsWith("{") || !raw.includes("tool_")) return;
  try {
    const e = JSON.parse(raw) as Event;
    if (!Array.isArray(e.message?.content)) return;
    for (const b of e.message!.content as Block[]) {
      if (b?.type === "tool_use" && typeof b.id === "string") clock.start.set(b.id, at);
      else if (b?.type === "tool_result" && typeof b.tool_use_id === "string") clock.end.set(b.tool_use_id, at);
    }
  } catch { /* a partial or foreign line */ }
}

/**
 * Stores the tool uses of a finished call. A check-tool use is linked to the next unlinked model_checks row of the
 * run with the same command, skipping uses whose reply shows the tool wrote no row (refusals, nothing to check).
 */
export function saveTools(db: DatabaseSync, runId: number, events: unknown, clock?: ToolClock): void {
  const uses = toolUses(events);
  if (!uses.length) return;
  const checks = db.prepare("SELECT id, command FROM model_checks WHERE run_id = ? ORDER BY id").all(runId) as { id: number; command: string }[];
  const ins = db.prepare("INSERT OR REPLACE INTO agent_run_tools (run_id, seq, tool, args, result_bytes, is_error, started_at, ended_at, check_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  uses.forEach((u, i) => {
    const k = u.command === null || u.noRow ? -1 : checks.findIndex((c) => c.command === u.command);
    const link = k >= 0 ? checks.splice(k, 1)[0]!.id : null;
    ins.run(runId, i + 1, u.name, u.args, u.resultBytes, u.isError ? 1 : 0, clock?.start.get(u.id) ?? null, clock?.end.get(u.id) ?? null, link);
  });
}
