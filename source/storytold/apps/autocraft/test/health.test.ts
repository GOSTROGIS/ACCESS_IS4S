import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { dbReady, serveHealth } from "../src/health.ts";

test("healthz answers while the process is up; readyz follows the database", async () => {
  const db = new DatabaseSync(":memory:");
  const server = createServer((req, res) => {
    if (!serveHealth(req, res, () => dbReady(db))) res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const p of ["/healthz", "/readyz"]) assert.equal((await fetch(base + p)).status, 200);
    assert.equal((await fetch(base + "/healthz", { method: "POST" })).status, 404);
    assert.equal((await fetch(base + "/other")).status, 404);
    db.close();
    assert.equal((await fetch(base + "/healthz")).status, 200);
    const r = await fetch(base + "/readyz");
    assert.equal(r.status, 503);
    assert.equal(await r.text(), "not ready\n");
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
