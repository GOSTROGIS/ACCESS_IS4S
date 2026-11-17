// Worker-side hardening: warm keys are one-to-one, and an artifact upload cannot land after its task ended.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { createEnv, hello } from "../src/build/envs.ts";
import { claim, createTask, warmKeyOf } from "../src/build/tasks.ts";
import { startWorkerServer } from "../src/build/worker-api.ts";
import { connect } from "../src/db.ts";
import { SCRATCH } from "./scratch.ts";

test("warm keys: distinct repo names never share a key, and every key is valid", () => {
  const names = ["a.b", "a-b", "A.B", "x".repeat(70), "x".repeat(71), "---", "..."];
  const keys = names.map(warmKeyOf);
  assert.equal(warmKeyOf("A.B"), warmKeyOf("a.b"));
  assert.equal(new Set(keys.filter((_, i) => names[i] !== "A.B")).size, names.length - 1);
  for (const k of keys) assert.match(k, /^[a-z0-9][a-z0-9-]{0,63}$/);
});

test("an artifact upload that finishes after its task ended is refused and leaves no file", async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH, "worker-hardening-"));
  process.env.AUTOCRAFT_ARTIFACT_DIR = join(dir, "artifacts");
  const db = connect(join(dir, "build.db"));
  const w = await startWorkerServer({ db, listen: "127.0.0.1:0" });
  try {
    const { key } = createEnv(db, { id: "env-one", label: "env-one", kind: "local-sandbox", slots: 1 }, "op");
    hello(db, "env-one", { version: "1.0", capabilities: { os: "linux", arch: "x86_64", cpus: 8, memGb: 32, diskGb: 200, display: false, gpu: false, toolchains: ["rust-stable"] }, slots: 1 });
    db.exec("INSERT INTO tracked_repos (name, pipeline) VALUES ('open-app', 1)");
    db.exec("INSERT INTO repos (name, visibility) VALUES ('open-app', 'public')");
    const id = createTask(db, { step: "verify", repo: "open-app", headSha: "a".repeat(40), plan: [{ name: "t", cmd: ["true"], network: "none", timeoutSec: 10 }] });
    claim(db, "env-one", 1);
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${w.url}/worker/tasks/${id}/artifacts/r.txt`, { method: "PUT", headers: { authorization: `Bearer ${key}`, "content-length": "10" } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on("error", reject);
      req.write("hello");
      setTimeout(() => { db.prepare("UPDATE build_tasks SET state = 'failed' WHERE id = ?").run(id); req.end("world"); }, 100);
    });
    assert.equal(status, 409);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM build_artifacts").get()!.n, 0);
    assert.deepEqual(readdirSync(join(dir, "artifacts")).filter((f) => f.startsWith(".upload-")), []);
  } finally {
    await w.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
