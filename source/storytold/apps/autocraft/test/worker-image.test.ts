import { test } from "node:test";
import assert from "node:assert/strict";
import { componentsFor, containerfile } from "../src/worker/environment.ts";

test("a Rust build image gets rustfmt and clippy, which the stock image's minimal profile leaves out", () => {
  const f = containerfile("rust:1-bookworm", [], componentsFor("rust-stable"));
  assert.match(f, /^RUN rustup component add clippy rustfmt$/m);
  assert.doesNotMatch(f, /apt-get/);
});

test("display packages change the image of display tasks only; every other tag is as before", async () => {
  const { DISPLAY_PACKAGES, derivedTag } = await import("../src/worker/environment.ts");
  assert.equal(derivedTag("rust-stable", "rust:1-bookworm", []), "craft-sandbox/rust-stable-288da4765b1fcbd4");
  assert.equal(derivedTag("rust-stable", "rust:1-bookworm", ["libfoo", "bar"]), "craft-sandbox/rust-stable-2e4c091a39f9d52c");
  assert.notEqual(derivedTag("rust-stable", "rust:1-bookworm", DISPLAY_PACKAGES), derivedTag("rust-stable", "rust:1-bookworm", []));
  assert.match(containerfile("rust:1-bookworm", DISPLAY_PACKAGES), /apt-get install .*mesa-vulkan-drivers/);
});
