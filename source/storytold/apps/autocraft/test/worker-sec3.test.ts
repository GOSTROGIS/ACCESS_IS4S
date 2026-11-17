import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { NIGHTLY_CHECKS } from "../src/nightly/checks.ts";
import { extractTar } from "../src/worker/tarball.ts";
import { makeTarGz } from "./tar-util.ts";
import { parseWorkerConfig } from "../src/worker/config.ts";
import { runArgs } from "../src/worker/container.ts";
import { prepareEnvironment } from "../src/worker/environment.ts";
import { removeStaleWorkDirs } from "../src/worker/executor.ts";
import { gateEnv } from "../src/worker/gate.ts";
import { FETCH_SCRIPT } from "../src/worker/rust.ts";
import { SCRATCH } from "./scratch.ts";

test("a directory a step made unreadable is removed at worker start, and an archive keeps a dangling link only when no link is on its path", async () => {
  mkdirSync(SCRATCH, { recursive: true });
  const workDir = mkdtempSync(join(SCRATCH, "work-"));
  mkdirSync(join(workDir, "task-1", "target", "x", "y"), { recursive: true });
  chmodSync(join(workDir, "task-1", "target", "x"), 0o000);
  mkdirSync(join(workDir, "task-2", "src"), { recursive: true });
  mkdirSync(join(workDir, "crate-cache"));
  const cfg = parseWorkerConfig({ coordinatorUrl: "https://c.example", keyFile: "/k", workDir, warmDir: join(workDir, "warm") });
  assert.equal(removeStaleWorkDirs(cfg), 2);
  assert.deepEqual(readdirSync(workDir), ["crate-cache"]);

  const dest = mkdtempSync(join(SCRATCH, "tar-"));
  const tar = gunzipSync(makeTarGz([
    { name: "r/src/" },
    { name: "r/gen.rs", type: "2", linkname: "target/out/gen.rs" },
    { name: "r/a", type: "2", linkname: "src" },
    { name: "r/b", type: "2", linkname: "a/x/../../c" },
  ]));
  await extractTar((async function* () { yield tar; })(), dest);
  const has = (p: string) => { try { lstatSync(join(dest, p)); return true; } catch { return false; } };
  assert.deepEqual([has("gen.rs"), has("a"), has("b")], [true, true, false]);
});

test("the networked step gets no gate env, the gate keeps only allowed names, and a task without a base commit reads no CI file", async () => {
  const g = gateEnv({ ref: "main", with: {
    "linux-env": "PDFCRAFT_ORACLES_REQUIRED=1\nGIT_SSH_COMMAND=sh /src/x\nGIT_CONFIG_COUNT=1\nCARGO_NET_GIT_FETCH_WITH_CLI=true\nHTTPS_PROXY=http://p\nRUSTFLAGS=-Cfoo\nCARGO_TERM_COLOR=always\nCRAFT_FONTS_DIR=/x",
    "dev-debug": "line-tables-only; sh",
  } }, {}, "pdfcraft");
  assert.deepEqual(g.env, { PDFCRAFT_ORACLES_REQUIRED: "1", CARGO_TERM_COLOR: "always" });
  assert.ok(g.dropped.includes("GIT_SSH_COMMAND") && g.dropped.includes("CARGO_PROFILE_DEV_DEBUG"));

  const cfg = parseWorkerConfig({ coordinatorUrl: "https://c.example", keyFile: "/k", workDir: join(SCRATCH, "w"), runtime: "true" });
  assert.throws(() => parseWorkerConfig({ coordinatorUrl: "https://c.example", keyFile: "/k", workDir: join(SCRATCH, "w"), warmStore: { url: "http://store.example.com", readKey: "r".repeat(20), verifyKeyFiles: ["/p"] } }), /plain http/);
  const spec = { name: "s", image: "img", mounts: { src: "/s", target: "/t", cache: "/c", out: "/o" }, env: { PDFCRAFT_ORACLES_REQUIRED: "1" }, extraMounts: [{ source: "/f", target: "/craft-fonts" }] };
  const fetchArgs = runArgs(cfg, { ...spec, network: "fetch", cmd: ["sh", "-c", FETCH_SCRIPT] }).join(" ");
  const buildArgs = runArgs(cfg, { ...spec, network: "none", cmd: ["cargo", "build"] }).join(" ");
  assert.ok(!fetchArgs.includes("PDFCRAFT") && !fetchArgs.includes("/craft-fonts"));
  assert.ok(buildArgs.includes("PDFCRAFT_ORACLES_REQUIRED=1") && buildArgs.includes("/craft-fonts"));
  assert.match(FETCH_SCRIPT, /exec env -i .*CARGO_NET_GIT_FETCH_WITH_CLI=false .*cargo fetch --locked/);
  for (const c of NIGHTLY_CHECKS) {
    for (const s of c.steps({ crates: ["app"], targets: ["t"] }) ?? []) {
      if (s.network === "fetch") assert.match(s.cmd.join(" "), /rm -f \.cargo\/config[\s\S]*exec env -i /, `${c.id}: ${s.name}`);
    }
  }

  const urls: string[] = [];
  const fake = (async (u: string) => { urls.push(String(u)); return new Response("", { status: 404 }); }) as unknown as typeof fetch;
  const env = await prepareEnvironment(cfg, { repo: "pdfcraft", baseSha: null, headSha: "a".repeat(40) }, "rust-stable", "img", "/s", { fetchImpl: fake, log: () => {} });
  assert.deepEqual(urls, []);
  assert.deepEqual(env.env, {});
});
