import type { DownloadsBar, DownloadsRange, DownloadsReport } from "../types";
import { NOW } from "./fixtures";

const H = 3600_000;
const D = 24 * H;

// repo, name, all-time downloads, stars, issues per 1K (all time), latest version, releases (newest first)
const APPS: { repo: string; name: string; dl: number; stars: number; per1k: number; latest: string }[] = [
  { repo: "craft-launcher", name: "App Launcher", dl: 35_812_340, stars: 4120, per1k: 0.21, latest: "0.17.0" },
  { repo: "photocraft", name: "PhotoCraft", dl: 12_406_118, stars: 9870, per1k: 0.64, latest: "0.21.0" },
  { repo: "pdfcraft", name: "PdfCraft", dl: 6_218_902, stars: 3310, per1k: 0.48, latest: "0.9.2" },
  { repo: "filmcraft", name: "FilmCraft", dl: 3_904_551, stars: 2640, per1k: 0.9, latest: "0.5.1" },
  { repo: "wordcraft", name: "WordCraft", dl: 2_512_077, stars: 1980, per1k: 0.77, latest: "0.12.4" },
  { repo: "vectorcraft", name: "VectorCraft", dl: 1_641_330, stars: 2210, per1k: 1.12, latest: "0.8.0" },
  { repo: "lightcraft", name: "LightCraft", dl: 988_204, stars: 1405, per1k: 0.93, latest: "0.6.3" },
  { repo: "gridcraft", name: "GridCraft", dl: 540_880, stars: 760, per1k: 1.4, latest: "0.3.0" },
  { repo: "effectcraft", name: "EffectCraft", dl: 214_395, stars: 530, per1k: 2.05, latest: "0.2.2" },
  { repo: "designcraft", name: "DesignCraft", dl: 96_120, stars: 4480, per1k: 3.1, latest: "0.1.8" },
];

const SPLIT = (rows: [string, string, number][]): DownloadsBar[] => rows.map(([key, label, w]) => ({ key, label, count: w }));
const PLATFORMS: [string, string, number][] = [["windows", "Windows", 0.62], ["linux", "Linux", 0.17], ["macos", "macOS", 0.15], ["web", "Web", 0.05], ["freebsd", "FreeBSD", 0.01]];
const PROCESSORS: [string, string, number][] = [["x64", "x64 (Intel, AMD)", 0.69], ["universal", "Universal (Mac)", 0.1], ["arm64", "ARM64", 0.1], ["any", "Any (web builds)", 0.05], ["x86", "x86 (32-bit)", 0.05], ["riscv64", "RISC-V", 0.01]];
const FORMATS: [string, string, number][] = [["exe", "Setup (exe)", 0.38], ["msi", "MSI", 0.14], ["portable", "Portable zip", 0.1], ["dmg", "DMG", 0.12], ["appimage", "AppImage", 0.1], ["deb", "deb", 0.06], ["web", "Web (zip)", 0.05], ["flatpak", "Flatpak", 0.03], ["cli", "Command line (zip)", 0.02]];

/** Roughly how much of the all-time count falls in a range (all-time counts accrued over about 14 months). */
const SHARE: Record<DownloadsRange, number> = { all: 1, today: 0.0006, yesterday: 0.0017, "7d": 0.012, "30d": 0.05, "90d": 0.14, "12m": 0.78, "1h": 0.00003, "3h": 0.00008, "6h": 0.00017, "12h": 0.00032 };
const SPAN: Record<DownloadsRange, number | null> = { all: null, today: NOW % D, yesterday: (NOW % D) + D, "7d": 7 * D, "30d": 30 * D, "90d": 90 * D, "12m": 365 * D, "1h": H, "3h": 3 * H, "6h": 6 * H, "12h": 12 * H };

export function downloadsReport(range: DownloadsRange, app: string): DownloadsReport {
  const share = SHARE[range];
  const span = SPAN[range];
  const from = span === null ? null : new Date(NOW - span).toISOString();
  const apps = app === "all" ? APPS : APPS.filter((a) => a.repo === app);
  const byApp = apps.map((a) => ({ repo: a.repo, name: a.name, downloads: Math.round(a.dl * share), stars: range === "all" ? a.stars : Math.round(a.stars * share * 2.2) }));
  const downloads = byApp.reduce((s, a) => s + a.downloads, 0);
  const scale = (rows: [string, string, number][]) => SPLIT(rows.map(([k, l, w]) => [k, l, Math.round(downloads * w)])).filter((b) => b.count > 0);
  const stars = byApp.reduce((s, a) => s + a.stars, 0);
  const issues = Math.round(apps.reduce((s, a) => s + (a.dl * a.per1k) / 1000, 0) * share * 3.2);
  const verApps = apps.slice(0, 7);
  const versions: DownloadsBar[] = verApps.map((a, i) => ({ key: `${a.repo}@v${a.latest}`, label: `${a.name} v${a.latest}`, count: Math.round(byApp[i]!.downloads * 0.55) }));
  const other = downloads - versions.reduce((s, v) => s + v.count, 0);
  if (other > 0) versions.push({ key: "other", label: "Other versions", count: other });
  versions.sort((a, b) => (a.key === "other" ? 1 : b.key === "other" ? -1 : b.count - a.count));
  const releases = apps.flatMap((a, i) => [0, 1, 2].map((n) => {
    const [maj, min, patch] = a.latest.split(".").map(Number) as [number, number, number];
    const tag = n === 0 ? `v${a.latest}` : patch >= n ? `v${maj}.${min}.${patch - n}` : `v${maj}.${Math.max(0, min - n)}.0`;
    const dl = Math.round(a.dl * [0.35, 0.22, 0.12][n]!);
    const iss = Math.round((dl * a.per1k * (1 + n * 0.15)) / 1000);
    return { repo: a.repo, app: a.name, tag, publishedAt: new Date(NOW - (6 + i * 3 + n * 38) * D - i * 1.3 * H).toISOString(), latest: n === 0, downloads: dl, issues: iss, per1k: dl ? (iss * 1000) / dl : null };
  })).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 50);
  return {
    range, from, to: new Date(NOW).toISOString(),
    historyFrom: new Date(NOW - 10 * D - 3 * H).toISOString(),
    apps: APPS.map((a) => ({ repo: a.repo, name: a.name })),
    totals: { downloads, issuesOpened: issues, issuesClosed: Math.round(issues * 0.82), prsMerged: Math.round(issues * 0.3), stars, issuesPer1k: downloads ? (issues * 1000) / downloads : null },
    byApp, platforms: scale(PLATFORMS), processors: scale(PROCESSORS), formats: scale(FORMATS), versions, releases,
  };
}
