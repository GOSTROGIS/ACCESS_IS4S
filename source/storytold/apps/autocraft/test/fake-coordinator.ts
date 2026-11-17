// Fake implementation of the worker API, for tests.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { ClaimedTask } from "../src/worker/types.ts";

export type FakeCoordinator = {
  url: string;
  key: string;
  queue: ClaimedTask[];
  cancel: number[];
  failClaims: number;
  tarballs: Map<string, Buffer>;
  calls: { method: string; path: string; body: unknown }[];
  logs: Map<number, string>;
  artifacts: Map<string, Buffer>;
  finished: Map<number, { results: unknown[]; summary: string }>;
  unauthorized: number;
  close(): Promise<void>;
};

async function body(req: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const c of req) parts.push(c as Buffer);
  return Buffer.concat(parts);
}

export async function startFakeCoordinator(key = "test-key-0123456789"): Promise<FakeCoordinator> {
  const f: FakeCoordinator = { url: "", key, queue: [], cancel: [], failClaims: 0, tarballs: new Map(), calls: [], logs: new Map(), artifacts: new Map(), finished: new Map(), unauthorized: 0, close: async () => {} };
  const server: Server = createServer(async (req, res) => {
    const path = req.url ?? "";
    const send = (code: number, obj: unknown = {}) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.method === "GET" && path.startsWith("/src/")) {
      const t = f.tarballs.get(path);
      if (!t) return send(404);
      res.writeHead(200, { "content-length": t.length });
      return void res.end(t);
    }
    const raw = await body(req);
    if (req.headers.authorization !== `Bearer ${key}`) {
      f.unauthorized++;
      return send(401, { error: "bad key" });
    }
    const isJson = !path.includes("/artifacts/");
    const parsed = isJson && raw.length ? JSON.parse(raw.toString()) : undefined;
    f.calls.push({ method: req.method ?? "", path, body: parsed });
    let m: RegExpMatchArray | null;
    if (path === "/worker/hello") return send(200, { envId: "sandbox", label: "Sandbox" });
    if (path === "/worker/claim") {
      if (f.failClaims > 0) {
        f.failClaims--;
        return send(500, { error: "boom" });
      }
      const free = (parsed as { free: number }).free;
      const tasks = f.queue.splice(0, free);
      const cancel = f.cancel.splice(0);
      return send(200, { tasks, cancel });
    }
    if ((m = path.match(/^\/worker\/tasks\/(\d+)\/log$/))) {
      const id = Number(m[1]);
      const { chunk } = parsed as { chunk: string };
      if (Buffer.byteLength(chunk) > 64 * 1024) return send(413);
      f.logs.set(id, (f.logs.get(id) ?? "") + chunk);
      return send(200);
    }
    if ((m = path.match(/^\/worker\/tasks\/(\d+)\/artifacts\/(.+)$/))) {
      f.artifacts.set(`${m[1]}/${decodeURIComponent(m[2]!)}`, raw);
      return send(200);
    }
    if ((m = path.match(/^\/worker\/tasks\/(\d+)\/finish$/))) {
      f.finished.set(Number(m[1]), parsed as never);
      return send(200);
    }
    if (/^\/worker\/tasks\/\d+\/(start|heartbeat)$/.test(path)) return send(200, { cancel: [] });
    send(404);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  f.url = `http://127.0.0.1:${port}`;
  f.close = () => new Promise((r) => (server.closeAllConnections(), server.close(() => r())));
  return f;
}
