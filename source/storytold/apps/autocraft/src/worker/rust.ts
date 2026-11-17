import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TaskStep } from "./types.ts";

export type RustPlanOptions = {
  /** Cargo arguments shared by build and test, e.g. ["--workspace"] or ["-p", "app"]. */
  cargoArgs?: string[];
  test?: boolean;
  fetchTimeoutSec?: number;
  buildTimeoutSec?: number;
  testTimeoutSec?: number;
  /** Globs under /out to return from the test step. */
  testArtifacts?: string[];
};

/**
 * The networked fetch runs with the image's own default toolchain, no repository cargo config and an
 * empty environment except the toolchain paths, so neither a toolchain file, a config wrapper, a
 * credential helper nor a git or cargo variable can start a program with network access (git is never
 * run: cargo fetches with its built-in client). The source overlay is discarded after the step, so
 * deleting the config files is local to it. The toolchain is the image's active one, read outside the
 * checkout (an image may pin it, as the nightly image does with RUSTUP_TOOLCHAIN).
 * `commands` are fixed command lines (never repository input), each run in that environment in turn.
 */
export function fetchScript(commands: string[]): string {
  const env = 'env -i PATH=/usr/local/cargo/bin:/usr/bin:/bin HOME=/tmp CARGO_HOME=/cache/cargo RUSTUP_HOME="${RUSTUP_HOME:-/usr/local/rustup}" RUSTUP_TOOLCHAIN="$tc" ' +
    "RUSTC=/usr/local/cargo/bin/rustc CARGO_REGISTRY_GLOBAL_CREDENTIAL_PROVIDERS=cargo:token CARGO_NET_GIT_FETCH_WITH_CLI=false";
  return [
    "cd /tmp",
    "tc=$(/usr/local/cargo/bin/rustup show active-toolchain 2>/dev/null | cut -d' ' -f1)",
    'if [ -z "$tc" ]; then echo "no active rust toolchain in the image; refusing to run cargo with a toolchain chosen by the repository" >&2; exit 1; fi',
    "cd /src",
    "rm -f .cargo/config .cargo/config.toml",
    ...commands.map((c, i) => (i === commands.length - 1 ? `exec ${env} ${c}` : `${env} ${c} || exit 1`)),
  ].join("\n");
}

export const FETCH_SCRIPT = fetchScript(["/usr/local/cargo/bin/cargo fetch --locked"]);

/** Whether the checkout can use a locked plan (`--locked` needs Cargo.lock). */
export function hasCargoLock(checkoutDir: string): boolean {
  return existsSync(join(checkoutDir, "Cargo.lock"));
}

/**
 * Steps for a Rust repo: `fetch deps` is the only step with network; build and
 * test run offline on the crates it downloaded. The source is mounted
 * read-only, so the lock file must already be right (`--locked`).
 * `cargo fetch` runs no build scripts or proc macros. The crate cache and its
 * poisoning rules are described in cache.ts.
 */
export function rustPlan(o: RustPlanOptions = {}): TaskStep[] {
  const extra = o.cargoArgs ?? [];
  const steps: TaskStep[] = [
    { name: "fetch deps", cmd: ["sh", "-c", FETCH_SCRIPT], network: "fetch", timeoutSec: o.fetchTimeoutSec ?? 900 },
    { name: "build", cmd: ["cargo", "build", "--offline", "--locked", "--all-targets", ...extra], network: "none", timeoutSec: o.buildTimeoutSec ?? 3600 },
  ];
  if (o.test ?? true) {
    steps.push({ name: "test", cmd: ["cargo", "test", "--offline", "--locked", ...extra], network: "none", timeoutSec: o.testTimeoutSec ?? 3600, artifacts: o.testArtifacts });
  }
  return steps;
}
