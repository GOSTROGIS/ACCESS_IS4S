import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "../src/db.ts";
import { claim, createTask } from "../src/build/tasks.ts";
import { createEnv, hello } from "../src/build/envs.ts";
import { setFeature } from "../src/build/features.ts";
import { rustPlan } from "../src/worker/rust.ts";
import { resolveI18nRev } from "../src/worker/gate.ts";
import { crateFilesOf } from "../src/worker/cache.ts";
import { buildScripts, editable } from "../src/fixup/patch.ts";

const sha = (c: string) => c.repeat(40);

test("a signing worker takes no PR-code task, a PR build needs a base commit, and the fetch step ignores the PR's toolchain and cargo config", () => {
  const db = connect(":memory:");
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('app', 'public')").run();
  db.prepare("INSERT INTO tracked_repos (name, pipeline) VALUES ('app', 1)").run();
  setFeature(db, "pr-builds", true, "op", "app");
  setFeature(db, "pr-builds", true, "op");
  const caps = { os: "linux", arch: "x86_64", cpus: 8, memGb: 32, diskGb: 200, display: false, gpu: false, toolchains: ["rust-stable"] };
  createEnv(db, { id: "plain", label: "plain", kind: "local-sandbox", slots: 4 }, "op");
  createEnv(db, { id: "signer", label: "signer", kind: "local-sandbox", slots: 4 }, "op");
  hello(db, "plain", { version: "1", capabilities: caps, slots: 4 });
  hello(db, "signer", { version: "1", capabilities: { ...caps, warmSigner: true }, slots: 4 });
  const plan = rustPlan();
  assert.equal(plan[0]!.cmd[0], "sh");
  assert.match(plan[0]!.cmd[2]!, /rm -f \.cargo\/config/);
  const t = { repo: "app", plan, requires: { os: "linux" as const, toolchains: ["rust-stable"] } };
  const noBase = createTask(db, { ...t, step: "pr-build", number: 1, headSha: sha("a") });
  assert.deepEqual(claim(db, "plain", 4).tasks.map((x) => x.id), [], "a PR build without a base is not handed out");
  db.prepare("DELETE FROM build_tasks WHERE id = ?").run(noBase);
  const pr = createTask(db, { ...t, step: "pr-build", number: 1, headSha: sha("a"), baseSha: sha("b") });
  const main = createTask(db, { ...t, step: "verify", headSha: sha("c"), warm: { key: "app", role: "build" } });
  assert.deepEqual(claim(db, "signer", 4).tasks.map((x) => x.id), [main]);
  assert.deepEqual(claim(db, "plain", 4).tasks.map((x) => x.id), [pr]);
});

test("the i18n commit comes from the base commit, symlinked cache directories are not read, and manifests name the build scripts", async () => {
  const urls: string[] = [];
  const fake = (async (u: string) => { urls.push(u); return new Response(`${sha("d")}\n`); }) as unknown as typeof fetch;
  assert.equal(await resolveI18nRev("app", sha("b"), fake), sha("d"));
  assert.ok(urls[0]!.includes(`/${sha("b")}/craft-i18n.rev`));

  const root = mkdtempSync(join(tmpdir(), "trust-"));
  const real = join(root, "real", "cache", "index.crates.io-0123456789abcdef");
  mkdirSync(real, { recursive: true });
  writeFileSync(join(real, "a-1.0.0.crate"), "x");
  mkdirSync(join(root, "home"));
  symlinkSync(join(root, "real"), join(root, "home", "registry"));
  assert.deepEqual(crateFilesOf(join(root, "home")), []);

  const scripts = buildScripts(["Cargo.toml", "c/Cargo.toml"], (f) => f === "Cargo.toml" ? '[package]\nname = "a"\nbuild = "gen.rs"\n' : '[package]\nname = "b"\nbuild = false\n');
  assert.equal(editable("gen.rs", scripts), false);
  assert.equal(editable("c/build.rs", scripts), true);
});
