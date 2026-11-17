import assert from "node:assert/strict";
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { test } from "node:test";
import { TokenBox } from "../src/dash/server/crypto.ts";
import { envVar } from "../src/env.ts";

test("envVar prefers AUTOCRAFT_ and falls back to CRAFT_AUTO_", () => {
  assert.equal(envVar("X", { CRAFT_AUTO_X: "old" }), "old");
  assert.equal(envVar("X", { AUTOCRAFT_X: "new", CRAFT_AUTO_X: "old" }), "new");
  assert.equal(envVar("X", {}), undefined);
});

test("TokenBox refuses a value sealed under the earlier key label", () => {
  const key = hkdfSync("sha256", "session-key", "craft-automation", "github-token", 32);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(key), iv);
  c.setAAD(Buffer.from("row"));
  const body = Buffer.concat([c.update("tok", "utf8"), c.final()]);
  const sealed = Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
  const box = new TokenBox("session-key");
  assert.equal(box.open(sealed, "row"), null);
  assert.equal(box.open(box.resealLegacy(sealed, "row")!, "row"), "tok");
  assert.equal(box.open(box.seal("tok2", "row"), "row"), "tok2");
});
