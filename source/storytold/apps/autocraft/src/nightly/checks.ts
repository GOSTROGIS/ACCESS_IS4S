// The nightly check catalogue: data, not code paths. Each check names the toolchain image it needs and builds its
// sandbox steps from the repo's selection. Only steps with network "fetch" touch the network; the rest run offline on
// what the fetch step downloaded. Artifacts are written under /out by `sh -c` redirects.
import { fetchScript } from "../worker/rust.ts";
import type { TaskStep } from "../worker/types.ts";

export type CheckKind = "pass-fail" | "audit" | "bench";

/** What an operator selects per repo: crates (wasm, windows, miri) or fuzz targets. */
export type CheckOpts = { crates: string[]; targets: string[] };

export type NightlyCheck = {
  id: string;
  label: string;
  /** The image name a registered build environment must report in its toolchains. */
  toolchain: string;
  /** The steps for a selection, or null when the selection leaves nothing to run (the result is then `skipped`). */
  steps: (o: CheckOpts) => TaskStep[] | null;
  timeoutMin: number;
  kind: CheckKind;
  /** Whether the selection starts with the check on for a repo. */
  defaultOn: boolean;
  /** Unproven in the sandbox: failures are shown but open no issue and ask no decision. */
  experimental?: boolean;
  /** What the repo must have for the check to mean anything; the selection page shows it. */
  needs?: "fuzz-dir" | "benches";
  /** The artifact a finished task is read for (audit: advisory ids; bench: the bencher lines). */
  artifact?: string;
  /** Without crates in the selection the check covers the whole workspace. */
  workspaceDefault: boolean;
};

const CARGO = "/usr/local/cargo/bin/cargo";
/** Networked steps run through fetchScript: the image's toolchain, no repository cargo config, an empty environment. */
const fetchStep = (name: string, commands: string[], timeoutSec: number): TaskStep => ({ name, cmd: ["sh", "-c", fetchScript(commands)], network: "fetch", timeoutSec });
const FETCH_DEPS = (min: number): TaskStep => fetchStep("fetch deps", [`${CARGO} fetch --locked`], min * 60);
const pkgs = (crates: string[]): string[] => (crates.length ? crates.flatMap((c) => ["-p", c]) : ["--workspace"]);
const sh = (name: string, script: string, min: number, artifacts?: string[]): TaskStep =>
  ({ name, cmd: ["sh", "-c", script], network: "none", timeoutSec: min * 60, ...(artifacts ? { artifacts } : {}) });
/** Crate names reach a shell only through argv elements, never through `sh -c` text. */
const SAFE = /^[A-Za-z0-9_-]{1,100}$/;
const safe = (xs: string[]): string[] => xs.filter((x) => SAFE.test(x));

export const NIGHTLY_CHECKS: NightlyCheck[] = [
  {
    id: "audit", label: "Dependency audit", toolchain: "rust-audit", timeoutMin: 15, kind: "audit", defaultOn: true, artifact: "audit.json", workspaceDefault: true,
    steps: () => [
      fetchStep("fetch advisories", [`${CARGO} audit fetch`], 600),
      { name: "audit", cmd: ["sh", "-c", "cargo audit --no-fetch --json > /out/audit.json"], network: "none", timeoutSec: 600, artifacts: ["audit.json"] },
    ],
  },
  {
    id: "wasm", label: "WebAssembly build", toolchain: "rust-cross", timeoutMin: 30, kind: "pass-fail", defaultOn: false, workspaceDefault: true,
    steps: (o) => [FETCH_DEPS(15), { name: "check wasm", cmd: ["cargo", "check", "--offline", "--locked", "--target", "wasm32-unknown-unknown", ...pkgs(safe(o.crates))], network: "none", timeoutSec: 1500 }],
  },
  {
    id: "windows", label: "Windows build", toolchain: "rust-cross", timeoutMin: 30, kind: "pass-fail", defaultOn: false, workspaceDefault: true,
    steps: (o) => [FETCH_DEPS(15), { name: "check windows", cmd: ["cargo", "check", "--offline", "--locked", "--target", "x86_64-pc-windows-gnu", ...pkgs(safe(o.crates))], network: "none", timeoutSec: 1500 }],
  },
  {
    id: "miri", label: "Miri", toolchain: "rust-nightly", timeoutMin: 40, kind: "pass-fail", defaultOn: false, workspaceDefault: false,
    // Only for the crates chosen (those with unsafe code); a whole workspace under Miri does not fit the cap.
    steps: (o) => {
      const crates = safe(o.crates);
      return crates.length ? [FETCH_DEPS(15), { name: "miri test", cmd: ["cargo", "miri", "test", "--offline", "--locked", ...pkgs(crates)], network: "none", timeoutSec: 2400 }] : null;
    },
  },
  {
    id: "bench", label: "Benchmarks", toolchain: "rust-nightly", timeoutMin: 40, kind: "bench", defaultOn: false, needs: "benches", artifact: "bench.txt", workspaceDefault: true,
    steps: (o) => [FETCH_DEPS(15), sh("bench", `cargo bench --offline --locked ${pkgs(safe(o.crates)).join(" ")} -- --output-format bencher > /out/bench.txt`, 40, ["bench.txt"])],
  },
  // Phase 2: unproven in the sandbox.
  {
    id: "fuzz", label: "Fuzzing (5 min per target)", toolchain: "rust-nightly", timeoutMin: 40, kind: "pass-fail", defaultOn: false, experimental: true, needs: "fuzz-dir", workspaceDefault: false,
    steps: (o) => {
      const targets = safe(o.targets);
      return targets.length ? [FETCH_DEPS(15), ...targets.map((t): TaskStep => ({ name: `fuzz ${t}`, cmd: ["cargo", "fuzz", "run", t, "--", "-max_total_time=300"], network: "none", timeoutSec: 480 }))] : null;
    },
  },
  {
    id: "asan", label: "AddressSanitizer tests", toolchain: "rust-nightly", timeoutMin: 60, kind: "pass-fail", defaultOn: false, experimental: true, workspaceDefault: true,
    // build-std compiles the standard library offline, so its dependencies are fetched in the fetch step.
    steps: (o) => [
      fetchStep("fetch deps", [`${CARGO} fetch --locked`, `${CARGO} fetch --locked -Zbuild-std --target x86_64-unknown-linux-gnu`], 1200),
      sh("asan test", `RUSTFLAGS=-Zsanitizer=address cargo test --offline --locked -Zbuild-std --target x86_64-unknown-linux-gnu ${pkgs(safe(o.crates)).join(" ")}`, 60),
    ],
  },
];

export const checkOf = (id: string): NightlyCheck | undefined => NIGHTLY_CHECKS.find((c) => c.id === id);
