import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AppSecrets } from "../src/dash/server/config.ts";
import { AppNotInstalledError, InstallTokenMinter, RepoNotInInstallationError, identityGitArgs, withIdentityEnv } from "../src/github/install-token.ts";
import { scrub } from "../src/runner/scrub.ts";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const app: AppSecrets = { id: "1", slug: "t", privateKey, clientId: "Iv1.x", clientSecret: "s", webhookSecret: null, owner: null };

let server: Server, base = "", clock = 1_000_000;
let mints = 0, listings = 0, mintDelay = 0;
const calls: string[] = [];
let n = 0;

before(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "";
    calls.push(`${req.method} ${url}`);
    const send = (o: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.startsWith("/app/installations?")) {
      listings++;
      return send([{ id: 7, account: { login: "Acme" }, repository_selection: "selected" }, { id: 8, account: { login: "bob" }, repository_selection: "all" }]);
    }
    if (req.method === "POST" && /^\/app\/installations\/\d+\/access_tokens$/.test(url)) {
      mints++;
      setTimeout(() => send({ token: `ghs_${"A".repeat(30)}${++n}`, expires_at: new Date(clock + 3_600_000).toISOString() }, 201), mintDelay);
      return;
    }
    if (url.startsWith("/installation/repositories")) return send({ repositories: [{ full_name: "Acme/widgets" }] });
    send({}, 404);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

describe("installation token minter", () => {
  const minter = () => new InstallTokenMinter(app, { apiBase: base, now: () => clock });

  test("caches until 10 minutes before expiry, then mints again", async () => {
    mints = 0;
    const m = minter();
    const a = await m.token("acme");
    assert.equal(await m.token("ACME"), a);
    assert.equal(mints, 1);
    clock += 49 * 60_000;
    assert.equal(await m.token("acme"), a);
    clock += 2 * 60_000;
    const b = await m.token("acme");
    assert.notEqual(b, a);
    assert.equal(mints, 2);
  });

  test("concurrent callers share one mint and one installation listing", async () => {
    mints = 0; listings = 0; mintDelay = 50;
    const m = minter();
    const all = await Promise.all([m.token("bob"), m.token("bob"), m.token("acme"), m.token("acme")]);
    mintDelay = 0;
    assert.equal(all[0], all[1]);
    assert.equal(all[2], all[3]);
    assert.equal(mints, 2);
    assert.equal(listings, 1);
  });

  test("typed errors for a missing installation and a repo outside it", async () => {
    const m = minter();
    await assert.rejects(m.token("nobody"), AppNotInstalledError);
    await assert.rejects(m.token("acme", "other"), RepoNotInInstallationError);
    assert.ok((await m.token("acme", "Widgets")).startsWith("ghs_"));
  });
});

describe("identity env and credential helper", () => {
  const token = `ghs_${"Zq9".repeat(12)}`;
  const id = { kind: "app", token } as const;

  test("env carries the token and drops other GitHub tokens; box identity is unchanged", () => {
    const env = withIdentityEnv(id, { PATH: "/usr/bin", GITHUB_TOKEN: "old" });
    assert.equal(env.GH_TOKEN, token);
    assert.equal(env.GITHUB_TOKEN, undefined);
    assert.equal(env.GIT_TERMINAL_PROMPT, "0");
    assert.deepEqual(withIdentityEnv({ kind: "box" }, { PATH: "/x" }), { PATH: "/x" });
    assert.deepEqual(identityGitArgs({ kind: "box" }), []);
  });

  test("git gets the password only from the helper's environment, never argv or config", () => {
    const args = ["-c", "core.fsmonitor=false", ...identityGitArgs(id), "credential", "fill"];
    assert.ok(!args.join(" ").includes(token));
    const env = { ...withIdentityEnv(id, { PATH: process.env.PATH }), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
    const r = spawnSync("git", args, { env, input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^username=x-access-token$/m);
    assert.match(r.stdout, new RegExp(`^password=${token}$`, "m"));
    // Without the token in the environment the helper yields an empty password.
    const bare = spawnSync("git", args, { env: { PATH: process.env.PATH ?? "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
    assert.ok(!bare.stdout.includes(token));
  });

  test("the log scrubber hides installation tokens", () => {
    assert.ok(!scrub(`remote: auth failed for ${token}`).includes(token));
  });
});
