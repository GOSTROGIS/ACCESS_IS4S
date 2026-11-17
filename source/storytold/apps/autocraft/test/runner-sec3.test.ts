import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AppSecrets } from "../src/dash/server/config.ts";
import { InstallTokenMinter, identityGitArgs, withIdentityEnv } from "../src/github/install-token.ts";
import { hasFixedCredential, scrub } from "../src/runner/scrub.ts";

test("the scrubber hides hex keys, URL passwords, dotted tokens and encoded tokens, keeps commit ids and digests, keeps review text readable, and refuses code replies holding a fixed-shape credential", () => {
  const gh = `ghs_${"Ab1".repeat(12)}`;
  const commit = "0123456789abcdef0123456789abcdef01234567";
  const digest = "a".repeat(32) + "b".repeat(32);
  const cases: [string, string][] = [
    [`worker key: ${"9f".repeat(24)}`, "9f9f"],
    [`{"session_key": "${"3c".repeat(32)}"}`, "3c3c"],
    ["fetch https://x-access-token:s3cretValue@github.com/o/r.git", "s3cretValue"],
    [`bot login ${["MTA1OTc3NDk5NzE1NjQxMzQ2Mw", "GhXyZ1", "abcDEF123ghiJKL456mnoPQR789"].join(".")}`, "GhXyZ1.abc"],
    [`AUTHORIZATION: ${Buffer.from(`x-access-token:${gh}`).toString("base64")}`, Buffer.from(`x-access-token:${gh}`).toString("base64").slice(0, 24)],
    [`hex ${Buffer.from(gh).toString("hex")}`, Buffer.from(gh).toString("hex").slice(0, 24)],
  ];
  for (const [text, secret] of cases) assert.ok(!scrub(text).includes(secret), `${text} -> ${scrub(text)}`);
  const plain = `HEAD is now at ${commit}; sha256:${digest}; see https://github.com/o/r/pull/7 and src/runner/scrub.ts`;
  assert.equal(scrub(plain), plain);
  // Review text keeps permalinks, long paths and code with credential-like names.
  const review = [
    `See https://github.com/o/r/blob/${commit}/src/modules/admin/ContributorsViews2/TierTable.tsx#L10 and src/modules/admin/ContributorsViews2/TierTable.tsx.`,
    "Set `max_tokens: 4096` and keep `password: String` as is; `let token = req.header(\"Authorization\")?;` reads the header.",
  ].join("\n");
  assert.equal(scrub(review), review);
  assert.equal(scrub("`SESSION_KEY=aB3dE9fG2hJ5kL8mN4pQ`"), "`SESSION_KEY=[hidden]`");
  // A reply that carries code is refused, not rewritten, when it holds a credential of a fixed shape.
  const code = `+const KEY = "${"9f".repeat(24)}"; const DB = "postgres://app:pw@localhost/db"; <div class="sk-loading-spinner-component">`;
  assert.equal(hasFixedCredential(code), false);
  assert.equal(hasFixedCredential(`+const T = "${gh}";`), true);
});

test("an installation token for a write reaches only its repository, and git hands it only to github.com", async () => {
  const bodies: unknown[] = [];
  let n = 0;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const send = (o: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      const url = req.url ?? "";
      if (url.startsWith("/app/installations?")) return send([{ id: 7, account: { login: "acme" }, repository_selection: "selected" }]);
      if (req.method === "POST" && url === "/app/installations/7/access_tokens") {
        bodies.push(raw ? JSON.parse(raw) : null);
        return send({ token: `ghs_${"T".repeat(30)}${++n}`, expires_at: new Date(Date.now() + 3_600_000).toISOString() }, 201);
      }
      if (url.startsWith("/installation/repositories")) return send({ repositories: [{ full_name: "acme/widgets" }, { full_name: "acme/gears" }] });
      send({}, 404);
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const app: AppSecrets = { id: "1", slug: "t", privateKey, clientId: "Iv1.x", clientSecret: "s", webhookSecret: null, owner: null };
    const m = new InstallTokenMinter(app, { apiBase: `http://127.0.0.1:${(server.address() as { port: number }).port}` });
    const wide = await m.token("acme");
    const one = await m.token("acme", "Widgets");
    const two = await m.token("acme", "widgets", { also: ["gears"] });
    assert.equal(await m.token("acme", "widgets"), one);
    assert.equal(await m.token("acme", "widgets", { wide: true }), wide);
    assert.deepEqual(bodies, [null, { repositories: ["widgets"] }, { repositories: ["gears", "widgets"] }]);
    assert.notEqual(one, two);

    // A github.com helper configured for the box (as `gh auth setup-git` writes it) is dropped; another host gets nothing.
    const env = { ...withIdentityEnv({ kind: "app", token: one }, { PATH: process.env.PATH }), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
    const fill = (host: string) => spawnSync("git", ["-c", "credential.https://github.com.helper=!echo password=box-login; :", ...identityGitArgs({ kind: "app", token: one }), "credential", "fill"], { env, input: `protocol=https\nhost=${host}\n\n`, encoding: "utf8" });
    const hub = fill("github.com");
    assert.match(hub.stdout, new RegExp(`^password=${one}$`, "m"));
    assert.ok(!hub.stdout.includes("box-login"));
    assert.ok(!fill("example.com").stdout.includes(one));
  } finally {
    server.close();
  }
});
