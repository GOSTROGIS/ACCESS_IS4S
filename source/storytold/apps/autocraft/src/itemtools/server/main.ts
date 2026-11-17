// Entry point of the item-tools MCP server: node main.ts
import { serve } from "./mcp.ts";

const db = process.env.ITEM_TOOLS_DB;
if (!db) {
  console.error("ITEM_TOOLS_DB is not set");
  process.exit(2);
}
serve({ db, diffs: process.env.ITEM_TOOLS_DIFFS ?? null });
