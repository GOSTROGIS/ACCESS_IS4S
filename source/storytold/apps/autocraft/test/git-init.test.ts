// Real Git initialization across independent callers sharing one bare cache.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { exec, Git, type Exec } from "../src/fixup/git.ts";
import { SCRATCH } from "./scratch.ts";

const own = fileURLToPath(import.meta.url);
const root = () => mkdtempSync(join(SCRATCH, "git-init-"));
const template = (dir: string): string => {
  const path = join(dir, "templates");
  mkdirSync(join(path, "hooks"), { recursive: true });
  writeFileSync(join(path, "hooks", "pre-commit.sample"), "Synthetic template; initialization must copy it.\n");
  for (let n = 0; n < 256; n++) writeFileSync(join(path, `fixture-${n}`), `Synthetic template ${n}.\n`);
  return path;
};
const runner = (templates: string): Exec => (command, args, opts) =>
  exec(command, ["-c", "init.templateDir=" + templates, ...args], opts);
const verify = async (git: Git, templates: string): Promise<void> => {
  assert.equal((await git.must(["rev-parse", "--is-bare-repository"])).trim(), "true");
  assert.equal((await git.must(["config", "--get", "core.bare"])).trim(), "true");
  for (let n = 0; n < 256; n++) assert.deepEqual(readFileSync(join(git.dir, `fixture-${n}`)), readFileSync(join(templates, `fixture-${n}`)));
  assert.deepEqual(readFileSync(join(git.dir, "hooks/pre-commit.sample")), readFileSync(join(templates, "hooks/pre-commit.sample")));
};

if (["--git-init-child", "--git-init-hold"].includes(process.argv[2] ?? "")) {
  const [cache, templates] = process.argv.slice(3);
  assert.ok(cache && templates && process.send);
  process.send({ ready: true });
  await new Promise<void>(resolve => process.once("message", () => resolve()));
  try {
    const run: Exec = async (command, args, opts) => {
      if (process.argv[2] === "--git-init-hold" && args.includes("init")) {
        process.send!({ locked: true });
        // Hold the actual transaction before Git starts; killing this exact
        // fixture must release the OS lock without stale-file deletion.
        const alive = setInterval(() => {}, 1000);
        try { await new Promise<never>(() => {}); }
        finally { clearInterval(alive); }
      }
      return runner(templates)(command, args, opts);
    };
    await new Git(run, cache, "app").init();
    process.send({ ok: true });
  } catch (error) {
    process.send({ ok: false, error: String((error as Error).message) });
    process.exitCode = 1;
  } finally { process.disconnect?.(); }
} else {
  test("separate Git instances initialize one cache without dropping any template", { timeout: 30_000 }, async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const dir = root(), templates = template(dir), cache = join(dir, "cache");
    const callers = Array.from({ length: 8 }, () => new Git(runner(templates), cache, "app"));
    await Promise.all(callers.map(git => git.init()));
    await verify(callers[0]!, templates);
  });

  test("separate Node processes initialize one cache and preserve every real Git template", { timeout: 30_000 }, async () => {
    const dir = root(), templates = template(dir), cache = join(dir, "cache");
    const children = Array.from({ length: 4 }, () => fork(own, ["--git-init-child", cache, templates], { execArgv: [], stdio: ["ignore", "pipe", "pipe", "ipc"] }));
    const ready = children.map(child => new Promise<void>((resolve, reject) => {
      child.once("message", message => { assert.deepEqual(message, { ready: true }); resolve(); });
      child.once("error", reject);
      child.once("exit", code => { if (code) reject(new Error("Git initializer exited before its start barrier")); });
    }));
    try {
      await Promise.all(ready);
      const finished = children.map(child => new Promise<void>((resolve, reject) => {
        let reply: unknown;
        child.on("message", message => { reply = message; });
        child.once("error", reject);
        child.once("exit", code => { try { assert.equal(code, 0); assert.deepEqual(reply, { ok: true }); resolve(); } catch (error) { reject(error); } });
      }));
      for (const child of children) child.send({ start: true });
      await Promise.all(finished);
      await verify(new Git(runner(templates), cache, "app"), templates);
    } finally {
      for (const child of children) {
        if (child.exitCode === null) child.kill();
        child.stdout?.destroy(); child.stderr?.destroy();
      }
    }
  });

  test("opening an existing cache retains its objects, refs and unrelated private files", { timeout: 30_000 }, async () => {
    const dir = root(), templates = template(dir), cache = join(dir, "cache");
    const git = new Git(runner(templates), cache, "app");
    await git.init();
    const object = (await git.must(["hash-object", "-w", "--stdin"], { input: "Synthetic existing object.\n" })).trim();
    await git.must(["update-ref", "refs/fixtures/preserved", object]);
    writeFileSync(join(git.dir, "private-fixture.txt"), "Synthetic private cache data.\n");
    await Promise.all(Array.from({ length: 4 }, () => new Git(runner(templates), cache, "app").init()));
    assert.equal((await git.must(["rev-parse", "refs/fixtures/preserved"])).trim(), object);
    assert.equal(await git.must(["cat-file", "blob", object]), "Synthetic existing object.\n");
    assert.equal(readFileSync(join(git.dir, "private-fixture.txt"), "utf8"), "Synthetic private cache data.\n");
  });

  test("an initializer process crash releases its actual SQLite lock without removing the sidecar", { timeout: 30_000 }, async () => {
    const dir = root(), templates = template(dir), cache = join(dir, "cache");
    const holder = fork(own, ["--git-init-hold", cache, templates], { execArgv: [], stdio: ["ignore", "pipe", "pipe", "ipc"] });
    const message = () => new Promise<unknown>((resolve, reject) => { holder.once("message", resolve); holder.once("error", reject); });
    try {
      assert.deepEqual(await message(), { ready: true });
      const acquired = message(); holder.send({ start: true });
      assert.deepEqual(await acquired, { locked: true });
      const sidecar = join(cache, ".app.autocraft-init.sqlite");
      const observer = new DatabaseSync(sidecar, { timeout: 50 });
      try { assert.throws(() => observer.exec("BEGIN IMMEDIATE"), /locked|busy/i); }
      finally { observer.close(); }
      const exited = new Promise<void>(resolve => holder.once("exit", () => resolve()));
      holder.kill(); await exited;
      // The same sidecar remains; SQLite releases the dead owner's lock.
      assert.ok(readFileSync(sidecar).length >= 0);
      const recovered = new Git(runner(templates), cache, "app");
      await recovered.init();
      await verify(recovered, templates);
      assert.ok(readFileSync(sidecar).length > 0);
    } finally {
      if (holder.exitCode === null && holder.signalCode === null) holder.kill();
      holder.stdout?.destroy(); holder.stderr?.destroy();
    }
  });

  test("conflicting or nonregular coordination paths are preserved and refused", { timeout: 30_000 }, async () => {
    for (const kind of ["directory", "directory-link", "hard-link", "unrelated-database"] as const) {
      const dir = root(), templates = template(dir), cache = join(dir, "cache"), repo = join(cache, "app");
      mkdirSync(repo, { recursive: true });
      const sidecar = join(cache, ".app.autocraft-init.sqlite");
      if (kind === "directory") mkdirSync(sidecar);
      else if (kind === "directory-link") {
        const target = join(dir, "unrelated-directory"); mkdirSync(target);
        symlinkSync(target, sidecar, process.platform === "win32" ? "junction" : "dir");
      }
      else if (kind === "hard-link") {
        const target = join(dir, "unrelated-file");
        writeFileSync(target, "Synthetic retained data."); linkSync(target, sidecar);
      }
      else {
        const unrelated = new DatabaseSync(sidecar);
        unrelated.exec("CREATE TABLE private_fixture(value TEXT);INSERT INTO private_fixture VALUES('Synthetic retained data')");
        unrelated.close(); chmodSync(sidecar, 0o600);
      }
      const before = kind === "directory" || kind === "directory-link" ? null : readFileSync(sidecar);
      await assert.rejects(new Git(runner(templates), cache, "app").init(), /initialization lock/);
      if (before) assert.deepEqual(readFileSync(sidecar), before);
    }
  });

  test("an existing non-bare metadata directory is refused without changing its configuration", { timeout: 30_000 }, async () => {
    const dir = root(), templates = template(dir), cache = join(dir, "cache");
    const git = new Git(runner(templates), cache, "app");
    await git.init(); await git.must(["config", "core.bare", "false"]);
    const before = readFileSync(join(git.dir, "config"));
    await assert.rejects(new Git(runner(templates), cache, "app").init(), /must be a bare repository/);
    assert.deepEqual(readFileSync(join(git.dir, "config")), before);
  });

  test("the explicit command deadline terminates an owned stalled subprocess", { timeout: 5_000 }, async () => {
    const start = Date.now();
    const result = await exec(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 50 });
    assert.notEqual(result.code, 0);
    assert.ok(Date.now() - start < 3_000);
  });
}
