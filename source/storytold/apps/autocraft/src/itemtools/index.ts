// What a sandboxed model call needs to use the item tools: the read-only
// mounts and the MCP server definition. Inside the sandbox:
//   /app/item-tools      the server code (src/itemtools/server), run by /usr/bin/node
//   /data/snapshot       the directory of the item snapshot (src/itemtools/snapshot.ts), mounted as a
//                        directory so a reader sees the journal of an interrupted refresh and fails
//                        instead of reading a half-written page
//   /data/diffs/<repo>   the cached PR diffs of each repository in the snapshot (the public ones), when they exist
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { diffCacheDir } from "../review/diff.ts";
import { snapshotFile, writeSnapshot } from "./snapshot.ts";
import { openDb, TOOLS } from "./server/tools.ts";
import { handle } from "./server/mcp.ts";

export const ITEM_SERVER = "items";
export const APP_PATH = "/app/item-tools";
export const DATA_PATH = "/data";

export type Mount = { host: string; path: string };
export type McpServer = { command: string; args: string[]; env: Record<string, string> };

const REPO_DIR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function snapshotRepos(file: string): string[] {
  try {
    const db = new DatabaseSync(file, { readOnly: true, timeout: 30_000 });
    try {
      return (db.prepare("SELECT DISTINCT repo FROM items").all() as { repo: string }[]).map((r) => r.repo).filter((r) => REPO_DIR.test(r));
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

/** Read-only mounts and the stdio server definition; null when no snapshot has been built yet. */
export function itemTools(): { mounts: Mount[]; mcpServers: Record<string, McpServer> } | null {
  const snapshot = snapshotFile();
  if (!existsSync(snapshot)) return null;
  const mounts: Mount[] = [
    { host: fileURLToPath(new URL("./server", import.meta.url)), path: APP_PATH },
    { host: dirname(snapshot), path: `${DATA_PATH}/snapshot` },
  ];
  const env: Record<string, string> = { ITEM_TOOLS_DB: `${DATA_PATH}/snapshot/items.db` };
  // One mount per repository in the snapshot: the cache also holds the diffs of repositories that are not public.
  const diffs = diffCacheDir();
  const dirs = snapshotRepos(snapshot).filter((r) => existsSync(join(diffs, r)));
  if (dirs.length) {
    for (const r of dirs) mounts.push({ host: join(diffs, r), path: `${DATA_PATH}/diffs/${r}` });
    env.ITEM_TOOLS_DIFFS = `${DATA_PATH}/diffs`;
  }
  return { mounts, mcpServers: { [ITEM_SERVER]: { command: "/usr/bin/node", args: ["--no-warnings", `${APP_PATH}/main.ts`], env } } };
}

function snapshot(): void {
  const r = writeSnapshot();
  console.log(`${snapshotFile()}: ${r.items} items, ${r.comments} comments, ${r.bytes} bytes${r.rebuilt ? " (rebuilt)" : ""}, changed ${JSON.stringify(r.changed)}`);
}

function call(args: string[]): void {
  const [tool, json] = args;
  if (!tool) throw new Error(`usage: item-tools call <tool> [<json arguments>]\ntools: ${TOOLS.map((t) => t.name).join(", ")}`);
  const db = openDb(snapshotFile());
  const cfg = { db: snapshotFile(), diffs: diffCacheDir() };
  const reply = handle({ id: 1, method: "tools/call", params: { name: tool, arguments: json ? JSON.parse(json) : {} } }, () => db, cfg);
  const r = (reply!.result as { content: { text: string }[]; isError?: boolean });
  console.log(r.content[0]!.text);
  if (r.isError) process.exitCode = 1;
}

async function run(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === "snapshot") return snapshot();
  if (sub === "call") return call(rest);
  throw new Error("usage: item-tools snapshot | item-tools call <tool> [<json>]");
}

export const commands = {
  "item-tools": { summary: "item tools for sandboxed calls: `snapshot` builds the read-only snapshot, `call <tool> <json>` runs a tool without a model", run },
};
