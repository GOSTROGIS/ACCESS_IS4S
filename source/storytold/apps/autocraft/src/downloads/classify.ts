// Classifies a release asset's file name into platform, processor and format for the Downloads report.
// Files that are not packages (signatures, checksums, symbols, language packs) are not counted.

export type Platform = "windows" | "macos" | "linux" | "freebsd" | "web";
export type Processor = "x64" | "universal" | "arm64" | "x86" | "riscv64" | "any" | "unknown";
export type Format = "msi" | "exe" | "dmg" | "portable" | "appimage" | "deb" | "flatpak" | "targz" | "rpm" | "archpkg" | "web" | "cli" | "appbundle";

export interface AssetClass { platform: Platform; processor: Processor; format: Format }

export const PLATFORM_LABELS: Record<Platform, string> = { windows: "Windows", macos: "macOS", linux: "Linux", freebsd: "FreeBSD", web: "Web" };
export const PROCESSOR_LABELS: Record<Processor, string> = {
  x64: "x64 (Intel, AMD)", universal: "Universal (Mac)", arm64: "ARM64", x86: "x86 (32-bit)", riscv64: "RISC-V", any: "Any (web builds)", unknown: "Unknown",
};
export const FORMAT_LABELS: Record<Format, string> = {
  msi: "MSI", exe: "Setup (exe)", dmg: "DMG", portable: "Portable zip", appimage: "AppImage", deb: "deb", flatpak: "Flatpak", targz: "tar.gz", rpm: "rpm",
  archpkg: "Arch package", web: "Web (zip)", cli: "Command line (zip)", appbundle: "macOS app (tar.gz)",
};

const NOT_COUNTED = /(\.(asc|sig|zsync|wixpdb|oci-manifest\.json)|-symbols\.zip)$|(?<!\.pkg)\.tar\.zst$|^sha256sums|^index\.json$/;
const PROCESSOR = /(?<![a-z0-9])(x86_64|x64|amd64|aarch64|arm64|riscv64|universal|x86)(?![a-z0-9])/;
const PROCESSORS: Record<string, Processor> = { x86_64: "x64", x64: "x64", amd64: "x64", aarch64: "arm64", arm64: "arm64", riscv64: "riscv64", universal: "universal", x86: "x86" };
const PLATFORM = /(?<![a-z0-9])(windows|macos|darwin|linux|freebsd)(?![a-z0-9])/;

/** The class of a package file, or null for a file that is not counted. */
export function classifyAsset(fileName: string): AssetClass | null {
  const n = fileName.toLowerCase();
  if (NOT_COUNTED.test(n)) return null;
  const processor = PROCESSORS[PROCESSOR.exec(n)?.[1] ?? ""] ?? null;
  const named = PLATFORM.exec(n)?.[1];
  const platformNamed: Platform | null = named === "darwin" ? "macos" : (named as Platform | undefined) ?? null;
  const make = (format: Format, platform: Platform | null, p: Processor | null = processor): AssetClass => ({ format, platform: platform ?? platformNamed ?? "linux", processor: p ?? "unknown" });

  if (n.endsWith(".pkg.tar.zst")) return make("archpkg", "linux");
  if (n.endsWith(".msi")) return make("msi", "windows");
  if (n.endsWith(".exe")) return make("exe", "windows");
  if (n.endsWith(".dmg")) return make("dmg", "macos");
  if (n.endsWith(".app.tar.gz")) return make("appbundle", "macos", processor);
  if (n.endsWith(".appimage")) return make("appimage", "linux");
  if (n.endsWith(".deb")) return make("deb", "linux");
  if (n.endsWith(".rpm")) return make("rpm", "linux");
  if (n.endsWith(".flatpak")) return make("flatpak", "linux");
  const cli = /(?<![a-z0-9])cli(?![a-z0-9])/.test(n);
  const web = /(?<![a-z0-9])web(?![a-z0-9])/.test(n);
  if (n.endsWith(".zip")) {
    if (n.endsWith("-portable.zip")) return make("portable", "windows");
    if (cli) return make("cli", processor === "universal" ? "macos" : null);
    if (web) return { platform: "web", processor: "any", format: "web" };
    return null;
  }
  if (n.endsWith(".tar.gz")) {
    const p = platformNamed ?? (processor === "universal" ? "macos" : null);
    return cli ? make("cli", p) : make("targz", p);
  }
  return null;
}

/** A release name without its trailing version: "ArtCraft Launcher v0.17.0" gives "ArtCraft Launcher". */
export function appNameOf(releaseName: string | null | undefined, repo: string): string {
  const base = (releaseName ?? "").replace(/(^|\s+)v?\d+(\.\d+)*([-+][\w.]+)?\s*$/i, "").trim();
  return base || repo;
}
