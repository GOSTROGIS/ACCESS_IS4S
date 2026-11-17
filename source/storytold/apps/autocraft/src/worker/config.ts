// Worker configuration: one JSON file (`--config` or AUTOCRAFT_WORKER_CONFIG).
import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { existsSync, readFileSync, statfsSync } from "node:fs";
import { arch, availableParallelism, homedir, platform, totalmem } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { Capabilities } from "./types.ts";

/**
 * Default toolchain images, pinned by digest (the tag is kept for reading;
 * the digest decides). To move a pin: `podman pull <name:tag>`, then
 * `podman image inspect --format '{{index .RepoDigests 0}}' <name:tag>`.
 * The config file's "images" overrides these per toolchain.
 */
export const DEFAULT_IMAGES: Record<string, string> = {
  "rust-stable": "docker.io/library/rust:1-bookworm@sha256:0097cc72a939f26665ab11380e995aa9476735ec9516867e14ff5dfa8318b068",
  "node-24": "docker.io/library/node:24-bookworm@sha256:8544b46b91d1a8c8bf8fc0d53ae9f276ed07d0ffa9098dc4a9c2f627363a13a0",
};

export type WorkerConfig = {
  coordinatorUrl: string;
  keyFile: string;
  workDir: string;
  warmDir: string;
  warmMaxGb: number;
  slots: number;
  images: Record<string, string>;
  runtime: string;
  limits: { cpus: number; memoryGb: number; pids: number; minFreeDiskGb: number };
  fetchNetwork: string;
  display: boolean;
  gpu: boolean;
  userns: string;
  maxSourceMb: number;
  maxStepSec: number;
  /** Shared snapshot store for warm target dirs (see docs/operations.md). */
  warmStore?: { url: string; readKey: string; writeKey?: string; signKey?: KeyObject; verifyKeys: KeyObject[]; timeoutSec: number };
};

const SAFE_PATH = /^[^,:\s\0]+$/;
const IMAGE_REF = /^[a-z0-9][A-Za-z0-9._\-/:@]*$/;

function expand(p: string): string {
  return p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

function num(v: unknown, name: string, def: number, min: number, max: number): number {
  if (v === undefined) return def;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`config: ${name} must be a number from ${min} to ${max}`);
  return v;
}

function str(o: Record<string, unknown>, name: string, def?: string): string {
  const v = o[name] ?? def;
  if (typeof v !== "string" || !v) throw new Error(`config: ${name} is required`);
  return v;
}

/** Reads a key file at parse time so a bad path or format stops the worker at start. */
function loadKey(file: string, make: (pem: Buffer) => KeyObject): KeyObject {
  try {
    return make(readFileSync(file));
  } catch (e) {
    throw new Error(`config: cannot load key ${file}: ${(e as Error).message}`);
  }
}

/** Hosts that plain http may reach: loopback, private ranges, and cluster-internal names (never a single-label name: a DNS search domain can resolve it to a public host). Anything else needs https. */
export function plainHttpHostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1") return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(":")) return /^f[cd][0-9a-f]{2}:/.test(h);
  return /\.(svc|cluster\.local|internal)$/.test(h);
}

/** Throws unless `url` (the config key `field`) is https, or http to a host plainHttpHostAllowed accepts: the keys it carries never travel in cleartext over another network. */
export function checkServiceUrl(url: string, field: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`config: ${field} must be an http(s) URL`);
  }
  if (u.protocol === "http:" && !plainHttpHostAllowed(u.hostname)) {
    throw new Error(`config: ${field} uses plain http, which is accepted only for loopback, private-network and cluster-internal hosts (.svc, .cluster.local, .internal); use https`);
  }
}

export function parseWorkerConfig(raw: unknown): WorkerConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("config: expected a JSON object");
  const o = raw as Record<string, unknown>;
  const coordinatorUrl = str(o, "coordinatorUrl").replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/.test(coordinatorUrl)) throw new Error("config: coordinatorUrl must be an http(s) URL");
  checkServiceUrl(coordinatorUrl, "coordinatorUrl");
  const keyFile = expand(str(o, "keyFile"));
  const workDir = expand(str(o, "workDir"));
  const warmDir = expand(typeof o.warmDir === "string" && o.warmDir ? o.warmDir : join(dirname(workDir), "warm"));
  for (const [n, p] of [["keyFile", keyFile], ["workDir", workDir], ["warmDir", warmDir]] as const) {
    if (!isAbsolute(p)) throw new Error(`config: ${n} must be an absolute path`);
  }
  // Paths go into --mount specs, where commas and colons would split fields.
  if (!SAFE_PATH.test(workDir)) throw new Error("config: workDir must not contain commas, colons or whitespace");
  if (!SAFE_PATH.test(warmDir)) throw new Error("config: warmDir must not contain commas, colons or whitespace");
  if (warmDir === workDir) throw new Error("config: warmDir must differ from workDir");
  const images = { ...DEFAULT_IMAGES, ...((o.images as Record<string, string> | undefined) ?? {}) };
  for (const [k, v] of Object.entries(images)) {
    if (typeof v !== "string" || !IMAGE_REF.test(v)) throw new Error(`config: image for ${k} is not a valid reference`);
  }
  const l = (o.limits ?? {}) as Record<string, unknown>;
  const runtime = str(o, "runtime", "podman");
  const fetchNetwork = str(o, "fetchNetwork", "pasta");
  const userns = str(o, "userns", "keep-id");
  for (const v of [fetchNetwork, userns, runtime]) if (v.startsWith("-") || /\s/.test(v)) throw new Error("config: runtime, fetchNetwork and userns must not start with '-' or contain spaces");
  let warmStore: WorkerConfig["warmStore"];
  if (o.warmStore !== undefined) {
    const w = o.warmStore as Record<string, unknown> | null;
    if (typeof w !== "object" || w === null || Array.isArray(w)) throw new Error("config: warmStore must be an object");
    const url = str(w, "url").replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s]+$/.test(url)) throw new Error("config: warmStore.url must be an http(s) URL");
    checkServiceUrl(url, "warmStore.url");
    if (w.writeKey !== undefined && (typeof w.writeKey !== "string" || !w.writeKey)) throw new Error("config: warmStore.writeKey must be a non-empty string");
    const verify = w.verifyKeyFiles;
    if (!Array.isArray(verify) || !verify.length || verify.some((f) => typeof f !== "string" || !isAbsolute(expand(f)))) throw new Error("config: warmStore.verifyKeyFiles must list absolute public key paths");
    if (w.signKeyFile !== undefined && (typeof w.signKeyFile !== "string" || !isAbsolute(expand(w.signKeyFile)))) throw new Error("config: warmStore.signKeyFile must be an absolute path");
    if (w.writeKey !== undefined && w.signKeyFile === undefined) throw new Error("config: warmStore.writeKey needs warmStore.signKeyFile");
    warmStore = { url, readKey: str(w, "readKey"), writeKey: w.writeKey as string | undefined, signKey: w.signKeyFile ? loadKey(expand(w.signKeyFile as string), createPrivateKey) : undefined, verifyKeys: (verify as string[]).map((f) => loadKey(expand(f), createPublicKey)), timeoutSec: num(w.timeoutSec, "warmStore.timeoutSec", 600, 5, 86_400) };
  }
  return {
    warmStore,
    coordinatorUrl,
    keyFile,
    workDir,
    warmDir,
    warmMaxGb: num(o.warmMaxGb, "warmMaxGb", 60, 0, 100_000),
    slots: num(o.slots, "slots", 1, 1, 64),
    images,
    runtime,
    limits: {
      cpus: num(l.cpus, "limits.cpus", 4, 0.5, 256),
      memoryGb: num(l.memoryGb, "limits.memoryGb", 8, 0.25, 1024),
      pids: num(l.pids, "limits.pids", 1024, 16, 1_000_000),
      minFreeDiskGb: num(l.minFreeDiskGb, "limits.minFreeDiskGb", 20, 0, 100_000),
    },
    fetchNetwork,
    display: o.display === true,
    gpu: o.gpu === true,
    userns,
    maxSourceMb: num(o.maxSourceMb, "maxSourceMb", 300, 1, 5000),
    maxStepSec: num(o.maxStepSec, "maxStepSec", 4 * 3600, 10, 48 * 3600),
  };
}

export function loadWorkerConfig(path: string): WorkerConfig {
  if (!existsSync(path)) throw new Error(`config file not found: ${path}`);
  return parseWorkerConfig(JSON.parse(readFileSync(path, "utf8")));
}

/** Reads the worker key. Never log the return value. */
export function readKey(cfg: WorkerConfig): string {
  const key = readFileSync(cfg.keyFile, "utf8").trim();
  if (!key) throw new Error(`key file is empty: ${cfg.keyFile}`);
  return key;
}

export function freeDiskGb(path: string): number {
  const s = statfsSync(path);
  return (s.bavail * s.bsize) / 1024 ** 3;
}

export function detectCapabilities(cfg: WorkerConfig): Capabilities {
  const os = platform() === "darwin" ? "macos" : platform() === "win32" ? "windows" : "linux";
  return {
    os,
    arch: arch() === "arm64" ? "aarch64" : "x86_64",
    // What one task gets: each container runs under the configured limits.
    cpus: Math.min(availableParallelism(), cfg.limits.cpus),
    memGb: Math.min(Math.round(totalmem() / 1024 ** 3), cfg.limits.memoryGb),
    diskGb: Math.floor(freeDiskGb(cfg.workDir)),
    display: cfg.display,
    gpu: cfg.gpu,
    toolchains: Object.keys(cfg.images).sort(),
    ...(cfg.warmStore?.signKey ? { warmSigner: true } : {}),
  };
}
