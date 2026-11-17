import { createHash } from "node:crypto";
import { DEFAULT_OWNER, slugOf } from "../owners.ts";
// The CI gate of a repo, read from its default branch so a task's environment matches upstream CI
// on Linux: apt packages, the craft-fonts and craft-i18n checkouts, and the gate's extra env.
// The inputs come from the workflow at the task's BASE commit, never from the PR being tested:
// a PR must not be able to choose packages or env. YAML is read by a small line scanner that
// handles only what the gate call and gate.yml use (nested maps, quoted and plain scalars,
// block scalars); there is no YAML dependency.

const GATE_USES = /^storytold\/craft-common-actions\/\.github\/workflows\/gate\.yml@([A-Za-z0-9._/-]+)$/;
const PACKAGE = /^[a-z0-9][a-z0-9+.-]{0,99}$/;
const SHA = /^[0-9a-f]{40}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;
/**
 * Env names a gate may set besides the repo's own switches (names that start with the repo's name, such as
 * `PDFCRAFT_ORACLES_REQUIRED`): output, retry and cargo profile settings. Nothing that selects a program, a
 * compiler or linker flag, a credential, a registry or a proxy (git, ssh, cargo config, rustc, linker) is allowed.
 */
const SHARED_ENV = /^(CARGO_TERM_COLOR|CARGO_TERM_VERBOSE|CARGO_INCREMENTAL|CARGO_NET_RETRY|RUST_BACKTRACE|RUST_LIB_BACKTRACE|RUST_LOG|RUST_MIN_STACK|RUST_TEST_THREADS|CARGO_PROFILE_(DEV|TEST|RELEASE|BENCH)_(DEBUG|OPT_LEVEL|DEBUG_ASSERTIONS|OVERFLOW_CHECKS|CODEGEN_UNITS|INCREMENTAL|STRIP|SPLIT_DEBUGINFO))$/;
/** Repo names whose prefix would reach a tool's own variables; such a repo gets no prefix rule. */
const TOOL_PREFIX = /^(GIT|SSH|CARGO|RUST|RUSTC|RUSTUP|RUSTDOC|RUSTFLAGS|LD|HTTP|HTTPS|ALL|NO|CC|CXX|AR|PKG|CMAKE|CRAFT|CI|HOME|PATH|TMP|XDG|LC|LANG|SHELL|BASH|ENV|PYTHON|NODE|NPM|PERL)$/;
/** The values cargo accepts for `profile.dev.debug`. */
const DEV_DEBUG = /^(0|1|2|true|false|none|line-directives-only|line-tables-only|limited|full)$/;

/** Whether a gate env line named `name` is kept for `repo`. */
export function gateEnvAllowed(repo: string, name: string): boolean {
  if (SHARED_ENV.test(name)) return true;
  if (/^CRAFT_(FONTS|I18N)_/.test(name)) return false;
  const prefix = repo.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return prefix.length >= 3 && !TOOL_PREFIX.test(prefix) && name.startsWith(`${prefix}_`) && /^[A-Z0-9_]+$/.test(name);
}
export const MAX_PACKAGES = 100;
const MAX_YAML_BYTES = 256 * 1024;

type Entry = { value: string; body: number };

const isSkippable = (l: string) => l.trim() === "" || l.trim().startsWith("#");
const indentOf = (l: string) => l.length - l.trimStart().length;

function unquote(raw: string): string {
  const s = raw.trim();
  const q = s[0];
  if ((q === '"' || q === "'") && s.length >= 2) {
    const end = s.lastIndexOf(q);
    if (end > 0) return s.slice(1, end);
  }
  return s.replace(/\s+#.*$/, "");
}

/** The mapping whose first key is at or after line `start`: key to scalar value and the index of the line after the key. */
function block(ls: string[], start: number): Map<string, Entry> {
  const out = new Map<string, Entry>();
  let i = start;
  while (i < ls.length && isSkippable(ls[i]!)) i++;
  if (i >= ls.length) return out;
  const indent = indentOf(ls[i]!);
  for (; i < ls.length; i++) {
    const l = ls[i]!;
    if (isSkippable(l)) continue;
    const ind = indentOf(l);
    if (ind < indent) break;
    if (ind > indent) continue;
    const m = /^["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?:(?:\s+(.*))?$/.exec(l.trim());
    if (!m) continue;
    const rest = (m[2] ?? "").trim();
    const scalar = /^([>|])[+-]?\d*(\s+#.*)?$/.exec(rest);
    if (scalar) {
      const parts: string[] = [];
      let j = i + 1;
      let bodyIndent = -1;
      for (; j < ls.length; j++) {
        if (ls[j]!.trim() === "") { parts.push(""); continue; }
        if (indentOf(ls[j]!) <= indent) break;
        if (bodyIndent < 0) bodyIndent = indentOf(ls[j]!);
        parts.push(ls[j]!.slice(bodyIndent));
      }
      while (parts.length && parts[parts.length - 1] === "") parts.pop();
      out.set(m[1]!, { value: parts.join(scalar[1] === ">" ? " " : "\n"), body: j });
      i = j - 1;
    } else {
      out.set(m[1]!, { value: unquote(rest), body: i + 1 });
    }
  }
  return out;
}

const linesOf = (yml: string): string[] => yml.replace(/\r/g, "").split("\n");

export type GateCall = { ref: string; with: Record<string, string> };

/** The first job of a workflow that calls the suite's gate, with its `with:` inputs; null when none does. */
export function parseGateCall(ciYml: string): GateCall | null {
  const ls = linesOf(ciYml);
  const jobs = block(ls, 0).get("jobs");
  if (!jobs) return null;
  for (const job of block(ls, jobs.body).values()) {
    const fields = block(ls, job.body);
    const m = GATE_USES.exec(fields.get("uses")?.value ?? "");
    if (!m || m[1]!.split("/").includes("..")) continue;
    const w = fields.get("with");
    const inputs: Record<string, string> = {};
    if (w) for (const [k, e] of block(ls, w.body)) inputs[k] = e.value;
    return { ref: m[1]!, with: inputs };
  }
  return null;
}

/** The `default:` of each input declared under `on.workflow_call.inputs` in gate.yml. */
export function parseGateDefaults(gateYml: string): Record<string, string> {
  const ls = linesOf(gateYml);
  const on = block(ls, 0).get("on");
  const call = on && block(ls, on.body).get("workflow_call");
  const inputs = call && block(ls, call.body).get("inputs");
  const out: Record<string, string> = {};
  if (!inputs) return out;
  for (const [name, e] of block(ls, inputs.body)) {
    const d = block(ls, e.body).get("default");
    if (d) out[name] = d.value;
  }
  return out;
}

export type GateEnv = {
  /** Ref of craft-common-actions the repo's CI calls. */
  gateRef: string;
  /** sha256 of the gate.yml read at that ref, for the task log (the ref may be a branch). */
  gateSha256?: string;
  /** Sorted, de-duplicated Debian package names. */
  packages: string[];
  /** craft-fonts commit; null when the gate builds without it. */
  craftFontsRef: string | null;
  requireFonts: boolean;
  /** The gate's extra env for Linux (`env`, `linux-env`, `dev-debug`), only the names `gateEnvAllowed` keeps. */
  env: Record<string, string>;
  /** Env lines that were left out, for the task log. */
  dropped: string[];
};

/** Combines the call's inputs with gate.yml's defaults for `repo`. Throws on a malformed package name or ref. */
export function gateEnv(call: GateCall, defaults: Record<string, string>, repo: string): GateEnv {
  const input = (k: string): string => call.with[k] ?? defaults[k] ?? "";
  const packages = [...new Set(input("packages").split(/\s+/).filter(Boolean))].sort();
  if (packages.length > MAX_PACKAGES) throw new Error(`gate lists ${packages.length} packages (limit ${MAX_PACKAGES})`);
  for (const p of packages) if (!PACKAGE.test(p)) throw new Error(`gate package name is not valid: ${p.slice(0, 60)}`);
  const fonts = input("craft-fonts-ref").trim();
  if (fonts && !SHA.test(fonts)) throw new Error("gate craft-fonts-ref is not a full commit id");
  const env: Record<string, string> = {};
  const dropped: string[] = [];
  const debug = input("dev-debug").trim();
  if (debug && DEV_DEBUG.test(debug)) env.CARGO_PROFILE_DEV_DEBUG = debug;
  else if (debug) dropped.push("CARGO_PROFILE_DEV_DEBUG");
  for (const line of `${input("env")}\n${input("linux-env")}`.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const eq = t.indexOf("=");
    const name = eq > 0 ? t.slice(0, eq) : "";
    const value = t.slice(eq + 1);
    if (!ENV_NAME.test(name) || !gateEnvAllowed(repo, name) || value.includes("${{") || value.length > 1000 || value.includes("\0")) {
      dropped.push(name.slice(0, 60) || "(malformed line)");
      continue;
    }
    env[name] = value;
  }
  return { gateRef: call.ref, packages, craftFontsRef: fonts || null, requireFonts: input("require-craft-fonts").trim() !== "false", env, dropped };
}

const RAW = "https://raw.githubusercontent.com";

async function getText(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url.replace(RAW, "")}: HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_YAML_BYTES) throw new Error(`${url.replace(RAW, "")}: file is too large`);
  return text;
}

/**
 * The gate environment of `repo` at `sha` (the task's base commit), or null when the repo has no
 * `.github/workflows/ci.yml` or it does not call the suite's gate. A network or HTTP error throws,
 * so a task never runs in a stock environment by accident.
 */
export async function resolveGate(repo: string, sha: string, fetchImpl: typeof fetch = fetch): Promise<GateEnv | null> {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo) || !SHA.test(sha)) return null;
  const ci = await getText(`${RAW}/${slugOf(repo)}/${sha}/.github/workflows/ci.yml`, fetchImpl);
  const call = ci === null ? null : parseGateCall(ci);
  if (!call) return null;
  const gate = await getText(`${RAW}/${DEFAULT_OWNER}/craft-common-actions/${call.ref}/.github/workflows/gate.yml`, fetchImpl);
  if (gate === null) throw new Error(`craft-common-actions gate.yml not found at ${call.ref}`);
  return { ...gateEnv(call, parseGateDefaults(gate), repo), gateSha256: createHash("sha256").update(gate).digest("hex") };
}

/** craft-i18n.rev at `sha` (the task's base commit): the commit of craft-i18n the task gets, or null when the repo has no such file or it is not one commit id. */
export async function resolveI18nRev(repo: string, sha: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo) || !SHA.test(sha)) return null;
  const text = await getText(`${RAW}/${slugOf(repo)}/${sha}/craft-i18n.rev`, fetchImpl);
  const rev = text === null ? "" : text.replace(/\s+/g, "");
  return SHA.test(rev) ? rev : null;
}

export const isCommitId = (s: string): boolean => SHA.test(s);
