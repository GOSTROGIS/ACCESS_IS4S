// A minimal stdio MCP server (newline-delimited JSON-RPC 2.0) for the item
// tools: initialize, ping, tools/list and tools/call. Configured by
// ITEM_TOOLS_DB (the snapshot) and ITEM_TOOLS_DIFFS (the diff cache, optional).
import { createInterface } from "node:readline";
import { callTool, openDb, TOOLS, type Config } from "./tools.ts";
import type { DatabaseSync } from "node:sqlite";

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** The reply to one message, or null for a notification. */
export function handle(msg: Msg, db: () => DatabaseSync, cfg: Config): Reply | null {
  if (msg.id === undefined || msg.id === null) return null;
  const id = msg.id;
  const fail = (code: number, message: string): Reply => ({ jsonrpc: "2.0", id, error: { code, message } });
  switch (msg.method) {
    case "initialize": {
      const want = msg.params?.protocolVersion;
      return { jsonrpc: "2.0", id, result: {
        protocolVersion: typeof want === "string" && SUPPORTED.includes(want) ? want : SUPPORTED[0],
        capabilities: { tools: {} },
        serverInfo: { name: "item-tools", version: "1.0.0" },
      } };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    case "tools/call": {
      const name = msg.params?.name;
      if (typeof name !== "string") return fail(-32602, "missing tool name");
      const r = callTool(db(), cfg, name, msg.params?.arguments);
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: r.text }], ...(r.isError ? { isError: true } : {}) } };
    }
    default:
      return fail(-32601, `method not found: ${msg.method}`);
  }
}

export function serve(cfg: Config): void {
  let db: DatabaseSync | null = null;
  const open = () => (db ??= openDb(cfg.db));
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let reply: Reply | null;
    try {
      reply = handle(JSON.parse(line) as Msg, open, cfg);
    } catch (e) {
      reply = { jsonrpc: "2.0", id: null, error: { code: -32700, message: `bad request: ${String((e as Error).message).slice(0, 100)}` } };
    }
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
  });
}
