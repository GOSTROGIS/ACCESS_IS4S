// The image proxy (GET /img), with a fake upstream in place of fetch.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { addLogin } from "../src/access.ts";
import { connect } from "../src/db.ts";
import { loadConfig } from "../src/dash/server/config.ts";
import { ImageProxy, MAX_IMAGE_BYTES, imageTokenSource } from "../src/dash/server/images.ts";
import { SESSION_COOKIE, startServer } from "../src/dash/server/index.ts";
import { FakeProvider } from "../src/dash/server/provider.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "images-test-"));
const permsFile = join(dir, "perms.json");
writeFileSync(permsFile, "{}");

const TOKEN = "gho_testtoken";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const ASSET = "https://github.com/user-attachments/assets/f3f8be53-b594-419f-b49d-a7dfec20b476";
const S3 = "https://github-production-user-asset-6210df.s3.amazonaws.com/1/2-f3f8be53.png?X-Amz-Signature=x";

type Reply = { status?: number; headers?: Record<string, string>; body?: Buffer | string };
const upstream = new Map<string, Reply>();
const calls: { url: string; auth: string | null }[] = [];
const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const headers = new Headers(init?.headers);
  calls.push({ url, auth: headers.get("authorization") });
  assert.equal(init?.redirect, "manual");
  const r = upstream.get(url);
  if (!r) return new Response("missing", { status: 404 });
  return new Response(new Uint8Array(typeof r.body === "string" ? Buffer.from(r.body) : (r.body ?? PNG)), { status: r.status ?? 200, headers: { "content-type": "image/png", ...r.headers } });
}) as typeof fetch;

// The hrefs the proxy treats as present in the mirror; null: every URL is.
let inMirror: Set<string> | null = null;
const repos = (href: string) => (!inMirror || inMirror.has(href) ? ["photocraft"] : []);

const db = connect(join(dir, "dash.db"));
let base = "";
let close: () => Promise<void>;
let cookie = "";

before(async () => {
  addLogin(db, "cli", "viewer1", "viewer", null);
  const config = loadConfig({
    AUTOCRAFT_DEV_AUTH: "1", AUTOCRAFT_LISTEN: "127.0.0.1:0", AUTOCRAFT_DB: join(dir, "dash.db"), AUTOCRAFT_DEV_PERMS: permsFile,
    AUTOCRAFT_IMG_CACHE: "",
  });
  const images = new ImageProxy({ fetch: fakeFetch, token: async () => TOKEN, cacheDir: join(dir, "img"), repos });
  const s = await startServer({ config, db, provider: new FakeProvider(permsFile), routes: [], images });
  base = s.url;
  close = s.close;
  // Dev sign-in: signin -> fake authorize -> callback.
  let jar = new Map<string, string>();
  const get = async (path: string) => {
    const r = await fetch(new URL(path, base), { redirect: "manual", headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
    for (const c of r.headers.getSetCookie()) {
      const kv = c.split(";")[0]!;
      jar.set(kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1));
    }
    return r;
  };
  const start = await get("/auth/signin?return_to=/");
  const auth = await get(`${start.headers.get("location")}&login=viewer1`);
  await get(auth.headers.get("location")!);
  assert.ok(jar.has(SESSION_COOKIE));
  cookie = `${SESSION_COOKIE}=${jar.get(SESSION_COOKIE)}`;
  jar = new Map();
});
after(async () => {
  await close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  inMirror = null;
  upstream.clear();
  calls.length = 0;
});

const img = (u: string, signedIn = true) =>
  fetch(`${base}/img?${new URLSearchParams({ u })}`, { headers: signedIn ? { cookie, accept: "image/*" } : { accept: "image/*" } });

describe("GET /img", () => {
  test("signed out gets 401 and nothing is fetched", async () => {
    upstream.set(ASSET, {});
    assert.equal((await img(ASSET, false)).status, 401);
    assert.equal(calls.length, 0);
  });

  test("an attachment follows the redirect to the bucket; the token goes only to github.com", async () => {
    upstream.set(ASSET, { status: 302, headers: { location: S3 }, body: "" });
    upstream.set(S3, { headers: { "content-type": "application/octet-stream" } });
    const r = await img(ASSET);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal(r.headers.get("cache-control"), "private, max-age=86400");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("content-security-policy"), "default-src 'none'");
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
    assert.deepEqual(calls, [{ url: ASSET, auth: `Bearer ${TOKEN}` }, { url: S3, auth: null }]);

    // The second request is served from the disk cache.
    calls.length = 0;
    assert.equal((await img(ASSET)).status, 200);
    assert.equal(calls.length, 0);
  });

  test("other hosts, path shapes and schemes are 404 without a fetch", async () => {
    const refused = [
      "https://example.com/a.png",
      "http://avatars.githubusercontent.com/u/1",
      "https://github.com/storytold/photocraft/raw/main/a.png",
      "https://github.com/user-attachments/assets/not-a-uuid",
      "https://raw.githubusercontent.com/someone/repo/main/a.png",
      "https://avatars.githubusercontent.com:8443/u/1",
      "https://user@avatars.githubusercontent.com/u/1",
      "https://github-production-user-asset-6210df.s3.amazonaws.com/1/2.png",
      "/img?u=x",
      "",
    ];
    for (const u of refused) assert.equal((await img(u)).status, 404, u);
    assert.equal(calls.length, 0);
  });

  test("a redirect to a host that is not allowed is refused and not followed", async () => {
    const u = "https://avatars.githubusercontent.com/u/1";
    upstream.set(u, { status: 302, headers: { location: "https://example.com/x.png" }, body: "" });
    assert.equal((await img(u)).status, 502);
    assert.deepEqual(calls.map((c) => c.url), [u]);
  });


  test("a non-image content type or body is refused", async () => {
    const html = "https://raw.githubusercontent.com/storytold/photocraft/main/page.png";
    upstream.set(html, { headers: { "content-type": "text/html" }, body: "<script>alert(1)</script>" });
    assert.equal((await img(html)).status, 415);
    const svg = "https://raw.githubusercontent.com/storytold/photocraft/main/logo.svg";
    upstream.set(svg, { headers: { "content-type": "image/svg+xml" }, body: "<svg xmlns='http://www.w3.org/2000/svg'/>" });
    assert.equal((await img(svg)).status, 415);
    const fake = "https://raw.githubusercontent.com/storytold/photocraft/main/fake.png";
    upstream.set(fake, { body: "<html>not a png</html>" });
    assert.equal((await img(fake)).status, 415);
  });

  test("an image over the size cap is refused", async () => {
    const big = "https://user-images.githubusercontent.com/big.png";
    upstream.set(big, { body: Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]) });
    assert.equal((await img(big)).status, 413);
  });
});


describe("which URLs are proxied", () => {


});

describe("upstream limits", () => {
  const png = (n: number) => `https://user-images.githubusercontent.com/limits/${n}.png`;
  const proxyWith = (f: typeof fetch, extra: ConstructorParameters<typeof ImageProxy>[0] = {}) =>
    new ImageProxy({ fetch: f, cacheDir: null, repos, ...extra });




  test("a redirect to a loopback or private address is refused and not followed", async () => {
    for (const target of ["https://127.0.0.1/x.png", "https://10.0.0.5/x.png", "https://[::1]/x.png", "https://localhost/x.png", "http://169.254.169.254/latest"]) {
      const seen: string[] = [];
      const f = (async (input: string | URL | Request) => {
        seen.push(String(input));
        return new Response("", { status: 302, headers: { location: target } });
      }) as typeof fetch;
      const r = await proxyWith(f).get(png(2));
      assert.equal(r.status, 502, target);
      assert.deepEqual(seen, [png(2)]);
    }
  });
});

describe("the token source", () => {
  test("a token file is read at start and again when it changes; the log never has the value", async () => {
    const file = join(dir, "token");
    writeFileSync(file, "ghp_first\n");
    const lines: string[] = [];
    const src = imageTokenSource({ AUTOCRAFT_IMAGE_TOKEN_FILE: file }, (l) => lines.push(l));
    assert.equal(await src(), "ghp_first");
    writeFileSync(file, "ghp_second\n");
    utimesSync(file, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    assert.equal(await src(), "ghp_second");
    assert.equal(lines.length, 1);
    assert.ok(!lines[0]!.includes("ghp_"));
    assert.equal(await imageTokenSource({ AUTOCRAFT_IMAGE_TOKEN_FILE: join(dir, "missing") }, () => {})(), null);
  });

});
