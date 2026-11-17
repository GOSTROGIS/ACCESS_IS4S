// A task's build environment: the repo's CI gate (gate.ts) turned into a derived image, read-only
// checkouts of craft-fonts and craft-i18n, and env vars for every step. All network use here is
// by the worker itself (trusted code, host network), before any step of the repo runs:
// the image build runs apt only, with a package list taken from the base commit's CI file.
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkerConfig } from "./config.ts";
import { isCommitId, resolveGate, resolveI18nRev } from "./gate.ts";
import { downloadAndExtract } from "./tarball.ts";
import { slugOf } from "../owners.ts";

export type SandboxInfo = {
  /** The image the steps ran in: the derived tag, or the configured image when the gate needs no packages. */
  image: string;
  baseImage: string;
  packages: string[];
  craftFontsRef: string | null;
  craftI18nRev: string | null;
};

export type ExtraMount = { source: string; target: string };
export type PreparedEnv = { image: string; env: Record<string, string>; mounts: ExtraMount[]; info: SandboxInfo };

/** Tag of the image with `packages` on top of `baseImage`: stable for the same base reference and package set. */
export function derivedTag(toolchain: string, baseImage: string, packages: string[]): string {
  const components = componentsFor(toolchain);
  const h = createHash("sha256").update(`${baseImage}\n${[...packages].sort().join(" ")}${components.length ? `\n${components.join(" ")}` : ""}`).digest("hex").slice(0, 16);
  return `craft-sandbox/${toolchain.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "base"}-${h}`;
}

/** Toolchain components the steps need beyond the image: the stock Rust images install the minimal profile, without rustfmt and clippy. */
export function componentsFor(toolchain: string): string[] {
  return toolchain.startsWith("rust") ? ["clippy", "rustfmt"] : [];
}

export function containerfile(baseImage: string, packages: string[], components: string[] = []): string {
  return [
    `FROM ${baseImage}`,
    "ENV DEBIAN_FRONTEND=noninteractive",
    ...(packages.length ? [`RUN apt-get update && apt-get install -y --no-install-recommends ${[...packages].sort().join(" ")} && rm -rf /var/lib/apt/lists/*`] : []),
    ...(components.length ? [`RUN rustup component add ${components.join(" ")}`] : []),
    "",
  ].join("\n");
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve) =>
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout}${stderr}` })),
  );
}

const building = new Map<string, Promise<void>>();

/**
 * The derived image for `packages`, built once per tag with network (cfg.fetchNetwork) and then reused.
 * Concurrent tasks wanting the same tag wait for one build.
 */
export async function ensureImage(cfg: WorkerConfig, toolchain: string, baseImage: string, packages: string[], note: (s: string) => void): Promise<string> {
  const tag = derivedTag(toolchain, baseImage, packages);
  if ((await run(cfg.runtime, ["image", "exists", tag], 30_000)).code === 0) return tag;
  let job = building.get(tag);
  if (!job) {
    job = (async () => {
      // Another worker process or an earlier build may have finished meanwhile.
      if ((await run(cfg.runtime, ["image", "exists", tag], 30_000)).code === 0) return;
      note(`building image ${tag} (${packages.length} packages)`);
      const ctx = join(cfg.workDir, `image-ctx-${randomBytes(4).toString("hex")}`);
      mkdirSync(ctx, { recursive: true });
      try {
        writeFileSync(join(ctx, "Containerfile"), containerfile(baseImage, packages, componentsFor(toolchain)));
        const r = await run(cfg.runtime, ["build", "--network", cfg.fetchNetwork, "--pull=missing", "--tag", tag, "--label", "craft-worker-image=1", "--file", join(ctx, "Containerfile"), ctx], 20 * 60_000);
        if (r.code !== 0) throw new Error(`image build failed (exit ${r.code}): ${r.out.slice(-1500)}`);
      } finally {
        rmSync(ctx, { recursive: true, force: true });
      }
    })().finally(() => building.delete(tag));
    building.set(tag, job);
  }
  await job;
  return tag;
}

/** Directory with the files of `<owner>/<repo>` at `ref`, fetched once per commit and kept in the worker's work dir. */
export async function ensureCheckout(cfg: WorkerConfig, repo: "craft-fonts" | "craft-i18n", ref: string, fetchImpl?: typeof fetch): Promise<string> {
  if (!isCommitId(ref)) throw new Error(`${repo} ref is not a full commit id`);
  const dir = join(cfg.workDir, "ext", repo, ref);
  if (existsSync(join(dir, ".complete"))) return dir;
  const tmp = join(cfg.workDir, "ext", repo, `.tmp-${randomBytes(4).toString("hex")}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    await downloadAndExtract(`https://codeload.github.com/${slugOf(repo)}/tar.gz/${ref}`, tmp, 1024 * 1024 * 1024, undefined, fetchImpl);
    writeFileSync(join(tmp, ".complete"), "");
    rmSync(dir, { recursive: true, force: true });
    try {
      renameSync(tmp, dir);
    } catch (e) {
      if (!existsSync(join(dir, ".complete"))) throw e; // a concurrent task stored the same commit first
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return dir;
}

/** Software Vulkan/GL drivers for tasks that render a UI (requires.display): the derived image adds them, other images keep their tags. */
export const DISPLAY_PACKAGES = ["mesa-vulkan-drivers", "libvulkan1", "libgl1-mesa-dri", "libegl1"];

export type PrepareOptions = { fetchImpl?: typeof fetch; log: (s: string) => void; note?: (s: string) => void };

/**
 * The environment of a task: the task's base commit (a default-branch commit the runner names, never
 * the PR head) decides through its CI file. A task without a base commit, or a repo whose CI does not
 * call the suite's gate, runs in the stock image. Throws on any failure, so
 * a task never runs in a weaker environment than CI without saying so.
 */
export async function prepareEnvironment(cfg: WorkerConfig, task: { repo: string; baseSha: string | null; headSha: string; display?: boolean }, toolchain: string, baseImage: string, srcDir: string, o: PrepareOptions): Promise<PreparedEnv> {
  const toolImage = componentsFor(toolchain).length ? await ensureImage(cfg, toolchain, baseImage, [], (s) => o.log(`${s}\n`)) : baseImage;
  const display = task.display === true;
  const stock: PreparedEnv = { image: toolImage, env: {}, mounts: [], info: { image: toolImage, baseImage, packages: [], craftFontsRef: null, craftI18nRev: null } };
  const base = task.baseSha;
  const gate = base ? await resolveGate(task.repo, base, o.fetchImpl) : null;
  if (!base || !gate) {
    const why = base ? "no CI gate for this repo at the base commit" : "no base commit for this task";
    if (!display) {
      o.log(`${why}; using the stock image\n`);
      return stock;
    }
    o.log(`${why}; using the stock image plus display packages\n`);
    const image = await ensureImage(cfg, toolchain, baseImage, DISPLAY_PACKAGES, (s) => o.log(`${s}\n`));
    return { image, env: { WGPU_BACKEND: "vulkan" }, mounts: [], info: { ...stock.info, image, packages: [...DISPLAY_PACKAGES] } };
  }
  const env: Record<string, string> = { ...gate.env };
  const packages = display ? [...new Set([...gate.packages, ...DISPLAY_PACKAGES])] : gate.packages;
  if (display) env.WGPU_BACKEND = "vulkan";
  const mounts: ExtraMount[] = [];
  let image = toolImage;
  if (packages.length) image = await ensureImage(cfg, toolchain, baseImage, packages, (s) => o.log(`${s}\n`));
  if (gate.craftFontsRef) {
    const dir = await ensureCheckout(cfg, "craft-fonts", gate.craftFontsRef, o.fetchImpl);
    mounts.push({ source: dir, target: "/craft-fonts" });
    env.CRAFT_FONTS_DIR = "/craft-fonts";
    if (gate.requireFonts) env.CRAFT_FONTS_REQUIRED = "1";
  }
  // The commit comes from the base commit, so a PR cannot make the host download a commit of its choosing.
  const rev = await resolveI18nRev(task.repo, base, o.fetchImpl);
  if (rev) {
    mounts.push({ source: await ensureCheckout(cfg, "craft-i18n", rev, o.fetchImpl), target: "/craft-i18n" });
    env.CRAFT_I18N_DIR = "/craft-i18n";
    env.CRAFT_I18N_REQUIRED = "1";
  }
  if (gate.dropped.length) o.log(`gate env left out: ${gate.dropped.join(", ")}\n`);
  o.log(`environment: image ${image}, gate ${gate.gateRef} (gate.yml sha256 ${gate.gateSha256?.slice(0, 16) ?? "unknown"}), craft-fonts ${gate.craftFontsRef?.slice(0, 12) ?? "none"}, craft-i18n ${rev?.slice(0, 12) ?? "none"}, gate env ${Object.keys(gate.env).join(", ") || "none"}\n`);
  return { image, env, mounts, info: { image, baseImage, packages, craftFontsRef: gate.craftFontsRef, craftI18nRev: rev } };
}
