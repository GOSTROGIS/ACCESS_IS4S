// Types of the worker API (docs/pipeline.md, "Build environments and tasks").
export type Capabilities = {
  os: "linux" | "macos" | "windows";
  arch: "x86_64" | "aarch64";
  cpus: number;
  memGb: number;
  diskGb: number;
  display: boolean;
  gpu: boolean;
  toolchains: string[];
  /** The worker holds the warm-snapshot signing key, so it takes no task that runs PR code. */
  warmSigner?: boolean;
};

export type Requires = Partial<Pick<Capabilities, "os" | "arch" | "display" | "gpu">> & {
  toolchains?: string[];
  minMemGb?: number;
  minDiskGb?: number;
};

export type TaskStep = {
  name: string;
  cmd: string[];
  network: "fetch" | "none";
  timeoutSec: number;
  artifacts?: string[];
  /** Run without the /target and /cache mounts (steps that read neither build output nor the crate cache). */
  bare?: boolean;
};

export type StepResult = { step: string; exitCode: number | null; durationMs: number; timedOut: boolean; peakMemBytes?: number; oomKilled?: boolean };

/** What `claim` returns per task. `sourceUrl` is an anonymous tarball URL for headSha. */
export type ClaimedTask = {
  id: number;
  repo: string;
  headSha: string;
  baseSha: string | null;
  requires: Requires;
  plan: TaskStep[];
  sourceUrl: string;
  /** Unified diff (git format, at most 1 MiB) applied to the source before the first step. */
  patch?: string;
  /** Warm cargo target dir: "use" starts from a copy, "build" stores the target dir when all steps pass. */
  warm?: { key: string; role: "use" | "build" };
};

export type ClaimResponse = { tasks: ClaimedTask[]; cancel?: number[] };

export const LIMITS = {
  logChunkBytes: 64 * 1024,
  logTotalBytes: 20 * 1024 * 1024,
  artifactBytes: 50 * 1024 * 1024,
  artifactsTotalBytes: 200 * 1024 * 1024,
  artifactCount: 100,
} as const;
