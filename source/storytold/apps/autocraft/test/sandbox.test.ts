import { SAMPLE_CIFIX_PRS } from "../src/cifix/types.ts";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { setRunner, askClaude, type Runner } from "../src/classify/run.ts";
import { connect } from "../src/db.ts";
import { claudeArgs, claudeParts } from "../src/prompts/index.ts";
import { SAMPLE_OPUS_PRS } from "../src/prompts/samples.ts";
import { SAMPLE_PATCH, SAMPLE_TRIAGE } from "../src/fixissue/types.ts";
import { SAMPLE_FIXISSUE_CHECK, SAMPLE_FIXUP_CHECK } from "../src/patchcheck/types.ts";
import { SAMPLE_FIXUP_PRS } from "../src/prompts/samples.ts";
import { SAMPLE_VERIFY_PLAN } from "../src/verify/types.ts";
import { buildCheckout, safePath } from "../src/sandbox/checkout.ts";
import { REPO_PATH, sandboxCommand } from "../src/sandbox/command.ts";
import { tokenNearExpiry } from "../src/sandbox/index.ts";
import type { SessionAsk } from "../src/prepush/resume.ts";
import { useTestAccount } from "./accounts-fixture.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "sandbox-test-"));

const fakeCreds = (expiresAt: number | string) => JSON.stringify({ claudeAiOauth: { accessToken: "fake-access", refreshToken: "fake-refresh", expiresAt } });
const spec = { claudeBin: "/h/claude-bin", checkout: "/h/checkout", credentials: "/h/acct/.credentials.json", claudeArgs: ["-p", "--tools", "Read"] };
const pairs = (args: string[], flag: string) => args.flatMap((a, i) => (a === flag ? [args.slice(i + 1, i + 3).join(" ")] : []));

describe("sandbox command", () => {
  const { cmd, args } = sandboxCommand(spec);

  test("binds only claude, the system, the checkout read-only and one credentials file; nothing of the host home", () => {
    assert.equal(cmd, "/usr/bin/bwrap");
    assert.deepEqual(pairs(args, "--ro-bind"), ["/usr /usr", "/etc/ssl /etc/ssl", "/etc/resolv.conf /etc/resolv.conf", "/h/acct/.credentials.json /home/sandbox/.claude/.credentials.json", "/h/claude-bin /opt/claude/claude", `/h/checkout ${REPO_PATH}`]);
    assert.deepEqual(pairs(args, "--bind"), [], "nothing is writable");
    assert.equal(REPO_PATH, "/repo");
    assert.deepEqual(pairs(args, "--tmpfs").map((t) => t.split(" ")[0]), ["/tmp", "/home/sandbox", "/home/sandbox/.claude", "/work"]);
    assert.ok(!args.some((a) => a === "--dev-bind" || a === "--bind-try" || a === homedir() || a.startsWith(`${homedir()}/`)));
  });

  test("the workspace is mounted read-only: /repos/<name>, the agents file and extra mounts", () => {
    const c = sandboxCommand({ ...spec, shared: [{ name: "craft-libs", dir: "/h/libs" }], agentsFile: "/h/agents.json", extraMounts: [{ host: "/h/items", path: "/items" }] });
    const ro = pairs(c.args, "--ro-bind");
    for (const m of ["/h/libs /repos/craft-libs", "/h/agents.json /agents.json", "/h/items /items"]) assert.ok(ro.includes(m), m);
    assert.deepEqual(pairs(c.args, "--bind"), []);
    assert.ok(pairs(c.args, "--dir").some((d) => d.startsWith("/repos")));
    assert.ok(!sandboxCommand(spec).args.includes("/repos"), "no workspace, no /repos");
    assert.throws(() => sandboxCommand({ ...spec, shared: [{ name: "../x", dir: "/h" }] }));
    assert.throws(() => sandboxCommand({ ...spec, extraMounts: [{ host: "/h", path: "/a/../etc" }] }));
  });



  test("new namespaces except the network, dies with the parent, clean environment", () => {
    for (const f of ["--unshare-all", "--share-net", "--die-with-parent", "--new-session"]) assert.ok(args.includes(f), f);
    assert.ok(!args.includes("--setenv") && !args.includes("--clearenv"));
    assert.deepEqual(sandboxCommand(spec).env, { CLAUDE_CONFIG_DIR: "/home/sandbox/.claude", DISABLE_AUTOUPDATER: "1", HOME: "/home/sandbox", LANG: "C.UTF-8", PATH: "/usr/bin" });
    assert.deepEqual(args.slice(args.indexOf("--chdir"), args.indexOf("--chdir") + 2), ["--chdir", "/work"]);
    assert.ok(!args.some((a) => a.startsWith("/work/")), "the checkout is not under the working directory");
  });




});

describe("sandbox adoption", () => {
  const cases = [
    ["fixup.patch", SAMPLE_FIXUP_PRS, 20], ["cifix.patch", SAMPLE_CIFIX_PRS, 20], ["verify.plan", SAMPLE_VERIFY_PLAN, 20], ["fixissue.triage", SAMPLE_TRIAGE, 20],
    ["fixissue.patch", SAMPLE_PATCH, 30], ["fixup.check", SAMPLE_FIXUP_CHECK, 20], ["fixissue.check", SAMPLE_FIXISSUE_CHECK, 20],
  ] as const;
  for (const [id, sample, turns] of cases) {
  }

});

describe("instruction files", () => {
});

describe("token expiry", () => {
  const f = (name: string, body: string) => { const p = join(dir, name); writeFileSync(p, body); return p; };
  const now = Date.UTC(2026, 10, 3);
  test("under 30 minutes left, expired, unreadable or without an expiry counts as near", () => {
    assert.equal(tokenNearExpiry(f("c1.json", fakeCreds(now + 29 * 60_000)), now), true);
    assert.equal(tokenNearExpiry(f("c2.json", fakeCreds(now - 1)), now), true);
    assert.equal(tokenNearExpiry(f("c3.json", "not json"), now), true);
    assert.equal(tokenNearExpiry(f("c4.json", "{}"), now), true);
    assert.equal(tokenNearExpiry(f("c5.json", fakeCreds("soon")), now), true);
    assert.equal(tokenNearExpiry(join(dir, "missing.json"), now), true);
  });
});

describe("checkout", () => {
  const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" };
  const g = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, env: gitEnv, encoding: "utf8" }).trim();
  const work = join(dir, "work");
  mkdirSync(join(work, "src"), { recursive: true });
  g(work, "init", "-q");
  writeFileSync(join(work, "src/lib.rs"), "fn main() {}\n");
  writeFileSync(join(work, "run.sh"), "#!/bin/sh\n");
  execFileSync("chmod", ["+x", join(work, "run.sh")]);
  writeFileSync(join(work, "big.bin"), Buffer.alloc(3 * 1024 * 1024));
  symlinkSync("/etc/passwd", join(work, "link"));
  g(work, "add", "-A");
  g(work, "update-index", "--add", "--cacheinfo", "160000,1111111111111111111111111111111111111111,sub");
  g(work, "commit", "-qm", "c");
  const sha = g(work, "rev-parse", "HEAD");
  const bare = join(dir, "bare.git");
  g(dir, "clone", "-q", "--bare", work, bare);

  test("only regular small files are copied: no symlink, submodule or oversized file; modes drop to plain files", async () => {
    const dest = join(dir, "out", "app", sha);
    const r = await buildCheckout(bare, sha, dest);
    assert.ok(r.ok);
    assert.equal(readFileSync(join(dest, "src/lib.rs"), "utf8"), "fn main() {}\n");
    assert.ok(existsSync(join(dest, "run.sh")));
    assert.equal(lstatSync(join(dest, "run.sh")).mode & 0o111, 0);
    for (const gone of ["link", "big.bin", "sub"]) assert.equal(existsSync(join(dest, gone)), false, gone);
    assert.equal((await buildCheckout(bare, sha, dest)).ok, true, "reused");
  });



  test("unsafe paths are rejected", () => {
    for (const p of ["../x", "a/../b", "/abs", ".git/config", "a/.GIT/x", "a//b", ""]) assert.equal(safePath(p), false, p);
    assert.equal(safePath("src/.github/ci.yml"), true);
  });


});

const bwrapOk = existsSync("/usr/bin/bwrap") && spawnSync("/usr/bin/bwrap", ["--unshare-all", "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64", "/usr/bin/true"]).status === 0;

describe("bubblewrap (no model)", { skip: !bwrapOk && "bwrap unavailable" }, () => {
  const checkout = join(dir, "co");
  mkdirSync(checkout, { recursive: true });
  writeFileSync(join(checkout, "a.txt"), "in repo\n");
  const secret = join(dir, "secret.txt");
  writeFileSync(secret, "host secret\n");
  const creds = join(dir, "credentials.json");
  writeFileSync(creds, "{}");
  const sh = (script: string) => {
    const c = sandboxCommand({ claudeBin: "/usr/bin/sh", checkout, credentials: creds, claudeArgs: ["-c", script] });
    return spawnSync(c.cmd, c.args, { encoding: "utf8", env: c.env });
  };

  test("sees the checkout read-only and nothing else of the host", () => {
    assert.equal(sh(`cat ${REPO_PATH}/a.txt`).stdout, "in repo\n");
    assert.notEqual(sh(`echo x > ${REPO_PATH}/b.txt`).status, 0);
    assert.notEqual(sh(`cat ${secret}`).status, 0);
    assert.notEqual(sh(`ls ${homedir()}`).status, 0);
    assert.equal(sh("ls /home").stdout.trim(), "sandbox");
    assert.equal(sh("ls -A /home/sandbox/.claude").stdout.trim(), ".credentials.json");
    assert.equal(sh("env | grep -c HOME").stdout.trim(), "1");
  });
});

describe("askClaude in tool mode", () => {
  const db = connect(join(dir, "t.db"));
  const box = useTestAccount(db);

  test("runs claude inside bwrap with the sandbox arguments, records turns, removes token-like text", async () => {
    const cfg = box.configDir + "t";
    mkdirSync(cfg, { recursive: true });
    writeFileSync(join(cfg, ".credentials.json"), fakeCreds(Date.now() + 6 * 3600_000));
    process.env.AUTOCRAFT_CLAUDE_BIN = "/usr/bin/true";
    const calls: { cmd: string; args: string[] }[] = [];
    const leak = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4";
    const fake: Runner = async (cmd, args) => {
      calls.push({ cmd, args });
      return { code: 0, stdout: JSON.stringify({ type: "result", result: `{"ref":"x","reason":"${leak}"}`, num_turns: 4, usage: {} }), stderr: "" };
    };
    const restore = setRunner(fake);
    try {
      const r = await askClaude("review.opus", "opus", SAMPLE_OPUS_PRS, db, { checkout: join(dir, "co") });
      assert.equal(calls[0]!.cmd, "/usr/bin/bwrap");
      assert.ok(calls[0]!.args.join(" ").includes(`${join(dir, "co")} ${REPO_PATH}`));
      assert.deepEqual(calls[0]!.args.slice(-claudeArgs("review.opus", "opus", true).length), claudeArgs("review.opus", "opus", true));
      assert.equal(r!.turns, 4);
      assert.ok(!r!.text.includes(leak));
      const run = db.prepare("SELECT summary FROM agent_runs ORDER BY rowid DESC LIMIT 1").get() as { summary: string } | undefined;
      assert.match(run?.summary ?? "", /4 turns/);
      // Without a checkout the same prompt runs tool-free through plain claude.
      await askClaude("review.opus", "opus", SAMPLE_OPUS_PRS, db);
      assert.equal(calls[1]!.cmd, "claude");
      assert.deepEqual(calls[1]!.args, claudeArgs("review.opus", "opus", false, undefined, claudeParts("review.opus", SAMPLE_OPUS_PRS, false).system));
    } finally {
      restore();
      delete process.env.AUTOCRAFT_CLAUDE_BIN;
    }
  });

  test("the reply is parsed before scrubbing, so token-like review text keeps the JSON valid", async () => {
    const cfg = box.configDir + "t";
    process.env.AUTOCRAFT_CLAUDE_BIN = "/usr/bin/true";
    const reply = '{"ref":"x","reason":"token: aB3dE9fG2hJ5kL8mN4pQ and password=Zx9Yw8Vu7Ts6Rq5Po4 in the text"}';
    const restore = setRunner(async () => ({ code: 0, stdout: JSON.stringify({ type: "result", result: reply, num_turns: 2, usage: {} }), stderr: "password=hunter2" }));
    try {
      const r = await askClaude("review.opus", "opus", SAMPLE_OPUS_PRS, db, { checkout: join(dir, "co") });
      assert.ok(r, "parsed");
      assert.ok(!r!.text.includes("aB3dE9") && !r!.text.includes("Zx9Yw8"), r!.text);
      assert.doesNotThrow(() => JSON.parse(r!.text));
      assert.ok(cfg);
    } finally {
      restore();
      delete process.env.AUTOCRAFT_CLAUDE_BIN;
    }
  });


  test("a resume continues the kept session; a failed resume falls back to a fresh call and removes the kept store", async () => {
    mkdirSync(box.configDir + "t", { recursive: true });
    writeFileSync(join(box.configDir + "t", ".credentials.json"), fakeCreds(Date.now() + 6 * 3600_000));
    process.env.AUTOCRAFT_CLAUDE_BIN = "/usr/bin/true";
    const checkout = join(dir, "co");
    const kept = () => {
      const d = mkdtempSync(join(dir, "kept-"));
      return { id: "s1", dir: d, account: "t", checkout };
    };
    const ok = JSON.stringify({ type: "result", result: "reply", session_id: "s2", num_turns: 1, usage: {} });
    const calls: string[][] = [];
    const run = async (fail: boolean) => {
      calls.length = 0;
      const session: SessionAsk = { resume: { session: kept(), message: "fix it" } };
      const first = session.resume!.session;
      const restore = setRunner(async (_cmd, args) => {
        calls.push(args);
        return args.includes("--resume") && fail ? { code: 1, stdout: "", stderr: "boom" } : { code: 0, stdout: ok, stderr: "" };
      });
      try {
        const r = await askClaude("fixup.patch", "sonnet", SAMPLE_FIXUP_PRS, db, { checkout, session });
        return { r, session, first };
      } finally { restore(); }
    };
    const good = await run(false);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.includes("--resume"));
    assert.equal(good.r!.text, "reply");
    assert.ok(existsSync(good.first.dir), "the kept store survives a resume that worked");
    assert.equal(good.session.kept?.dir, good.first.dir);

    const bad = await run(true);
    assert.equal(calls.length, 2);
    assert.ok(calls[0]!.includes("--resume") && !calls[1]!.includes("--resume"));
    assert.equal(bad.r!.text, "reply");
    assert.ok(!existsSync(bad.first.dir), "the store of a failed resume is removed");
    assert.equal(bad.session.resume, undefined);
    delete process.env.AUTOCRAFT_CLAUDE_BIN;
  });

});
