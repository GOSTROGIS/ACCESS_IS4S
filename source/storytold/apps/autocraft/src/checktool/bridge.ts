// The loopback bridge between a model's sandbox and the harness. The sandbox shares the host network, so the `check`
// MCP server inside it (server/main.ts) posts each call to this server, which runs it on the call's CheckTool. The URL
// carries a random port and every request a random token, both valid for one model call.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import type { CheckTool } from "./index.ts";

export const CHECK_SERVER = "build";
export const CHECK_APP_PATH = "/app/check-tool";

export type Bridge = {
  /** MCP server entry and read-only mount for the sandbox. */
  mcpServer: { command: string; args: string[]; env: Record<string, string> };
  mount: { host: string; path: string };
  /** The agent run that the tool's rows are recorded under from now on: each turn on the same bridge is its own run. */
  setRun: (runId: number) => void;
  close: () => void;
};

/** Starts the bridge for one model call; `runId` is the agent run the tool's rows are recorded under. */
export async function startBridge(tool: CheckTool, runId: number): Promise<Bridge> {
  let current = runId;
  const token = randomBytes(24).toString("hex");
  const want = Buffer.from(`Bearer ${token}`);
  const server = createServer((req, res) => {
    const got = Buffer.from(req.headers.authorization ?? "");
    if (req.method !== "POST" || got.length !== want.length || !timingSafeEqual(got, want)) { res.writeHead(403).end(); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => { size += c.length; if (size <= 2_000_000) chunks.push(c); });
    req.on("end", () => {
      const reply = (r: unknown) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(r));
      if (size > 2_000_000) return reply({ text: "refused: the request is too large", isError: true });
      let input: unknown;
      try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply({ text: "refused: the input is not JSON", isError: true }); }
      tool.run(input, current).then(reply, (e) => reply({ text: `the check could not run: ${String((e as Error).message ?? e).slice(0, 200)}`, isError: true }));
    });
  });
  server.requestTimeout = 0;
  server.timeout = 0;
  await new Promise<void>((ok, bad) => { server.once("error", bad); server.listen(0, "127.0.0.1", ok); });
  const port = (server.address() as { port: number }).port;
  return {
    mcpServer: { command: "/usr/bin/node", args: ["--no-warnings", `${CHECK_APP_PATH}/main.ts`], env: { CHECK_TOOL_URL: `http://127.0.0.1:${port}/`, CHECK_TOOL_TOKEN: token } },
    mount: { host: fileURLToPath(new URL("./server", import.meta.url)), path: CHECK_APP_PATH },
    setRun: (id) => { current = id; },
    close: () => { server.close(); server.closeAllConnections(); },
  };
}
