// The worker loop against a fake coordinator and a fake container runtime.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { LogSink } from "../src/worker/logsink.ts";
import { WorkerApi } from "../src/worker/client.ts";
import { parseWorkerConfig } from "../src/worker/config.ts";
import { serve, type ServeDeps } from "../src/worker/serve.ts";
import type { ClaimedTask, TaskStep } from "../src/worker/types.ts";
import { startFakeCoordinator, type FakeCoordinator } from "./fake-coordinator.ts";
import { makeTarGz } from "./tar-util.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const root = mkdtempSync(join(SCRATCH, "worker-serve-"));
const rtDir = join(root, "rt");
mkdirSync(rtDir);
process.env.FAKE_RT_DIR = rtDir;
const FAKE = resolve(dirname(fileURLToPath(import.meta.url)), "fake-runtime.mjs");

let coord: FakeCoordinator;
let n = 0;
before(async () => {
  coord = await startFakeCoordinator();
  coord.tarballs.set("/src/a.tgz", makeTarGz([{ name: "r-a/" }, { name: "r-a/f", data: "x" }]));
});
after(async () => {
  await coord.close();
  rmSync(root, { recursive: true, force: true });
});

const task = (id: number, plan: TaskStep[]): ClaimedTask => ({ id, repo: "o/r", headSha: "b".repeat(40), baseSha: null, requires: { toolchains: ["rust-stable"] }, plan, sourceUrl: `${coord.url}/src/a.tgz` });
const step = (name: string, ops: string[]): TaskStep => ({ name, cmd: ["do", ...ops], network: "none", timeoutSec: 30 });

function harness(over: Partial<ServeDeps> = {}, slots = 2) {
  const cfg = parseWorkerConfig({ coordinatorUrl: coord.url, keyFile: "/k", workDir: join(root, `w${++n}`), slots, runtime: FAKE, images: { "rust-stable": "registry.test/rust@sha256:aa" } });
  const lines: string[] = [];
  const delays: number[] = [];
  const ac = new AbortController();
  const deps: ServeDeps = {
    cfg,
    api: new WorkerApi(coord.url, coord.key),
    version: "t",
    capabilities: () => ({ os: "linux", arch: "x86_64", cpus: 2, memGb: 4, diskGb: 100, display: false, gpu: false, toolchains: ["rust-stable"] }),
    freeDiskGb: () => 100,
    log: (l) => lines.push(l),
    sleep: (ms) => {
      delays.push(ms);
      return new Promise((r) => setTimeout(r, 15));
    },
    pollMs: 5000,
    ...over,
  };
  const done = serve(deps, ac.signal);
  return { cfg, lines, delays, ac, done, stop: async () => (ac.abort(), done) };
}
const until = async (f: () => boolean, ms = 8000) => {
  const t = Date.now();
  while (!f()) {
    if (Date.now() - t > ms) throw new Error("timeout waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("worker loop", () => {

  test("hello, claim, run, logs, artifacts, finish; the key is never logged", async () => {
    coord.calls.length = 0;
    const t = task(101, [step("build", ["echo:compiling", "write:out.json:{}", "exit:0"]), step("test", ["exit:0"])]);
    t.plan[0]!.artifacts = ["*.json"];
    coord.queue.push(t);
    const h = harness();
    await until(() => coord.finished.has(101));
    await h.stop();
    const fin = coord.finished.get(101)!;
    assert.equal(fin.summary, "2 steps passed");
    assert.match(coord.logs.get(101)!, /compiling/);
    assert.equal(coord.artifacts.get("101/out.json")!.toString(), "{}");
    const hello = coord.calls.find((c) => c.path === "/worker/hello")!.body as { slots: number; capabilities: { toolchains: string[] } };
    assert.equal(hello.slots, 2);
    assert.deepEqual(hello.capabilities.toolchains, ["rust-stable"]);
    assert.ok(coord.calls.some((c) => c.path === "/worker/tasks/101/start"));
    assert.equal(coord.unauthorized, 0);
    const everything = h.lines.join("\n") + JSON.stringify(coord.calls) + (coord.logs.get(101) ?? "");
    assert.ok(!everything.includes(coord.key));
    const argvs = readFileSync(join(rtDir, "calls.jsonl"), "utf8");
    assert.ok(!argvs.includes(coord.key));
  });

  test("errors are logged without the key, even when the coordinator rejects it", async () => {
    const api = new WorkerApi(coord.url, "wrong-key-xyz");
    const e = await api.claim(1, null).catch((x: Error) => x);
    assert.match((e as Error).message, /HTTP 401/);
    assert.ok(!(e as Error).message.includes("wrong-key-xyz"));
  });




});

test("a 429 on a log chunk is retried after retry-after: each chunk arrives once, in order", async () => {
  const got: string[] = [];
  let limited = true;
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    const { chunk } = JSON.parse(String(init.body)) as { chunk: string };
    if (limited) {
      limited = false;
      return new Response('{"error":"slow down"}', { status: 429, headers: { "retry-after": "0" } });
    }
    got.push(chunk);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const api = new WorkerApi("http://coordinator.invalid", "k".repeat(20), fakeFetch);
  const sink = new LogSink((step, chunk) => api.log(1, step, chunk).then(() => {}), 60_000);
  await sink.write("s", "one");
  await sink.flush();
  await sink.write("s", "two");
  await sink.close();
  assert.deepEqual(got, ["one", "two"]);
});
