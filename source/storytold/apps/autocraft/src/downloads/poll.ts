// Polls GitHub release assets and star counts of the tracked repos and records the increases between polls.
// GitHub keeps only a running count per asset, so a range other than "All" fills in from the first poll onward.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import { readEnv } from "../github/read.ts";
import { trackedNames } from "../repos.ts";
import { ownerOf } from "../owners.ts";
import { appNameOf, classifyAsset } from "./classify.ts";

const run = promisify(execFile);

export const POLL_EVERY_MS = 15 * 60_000;
export const KEY_POLLED_AT = "releases_polled_at";
/** Hour buckets older than this fold into day buckets. */
export const HOUR_KEEP_MS = 48 * 3600_000;
/** The whole poll stops starting repos after this long, so the sync run is not held; repos left over are read next time. */
export const BUDGET_MS = 90_000;
const CALL_TIMEOUT_MS = 30_000;
const CONCURRENCY = 4;
/** A repo last read longer ago than this (it was untracked, or reads failed) starts a new baseline instead of recording the gap as one spike. */
export const STALE_MS = 6 * 3600_000;
const KEY_OFFSET = "releases_offset";

export interface GhAsset { id: number; name: string; download_count: number }
export interface GhRelease { id: number; tag_name: string; name: string | null; draft: boolean; prerelease: boolean; published_at: string | null; created_at?: string; assets: GhAsset[] }
export interface RepoReleases { stars: number; releases: GhRelease[] }
export type Fetcher = (owner: string, repo: string) => Promise<RepoReleases>;

/** The real fetcher: `gh api` as the identity that reads the owner's repos. */
export const ghFetcher = (db?: DatabaseSync): Fetcher => async (owner, repo) => {
  const env = await readEnv(owner, { db });
  const opts = { encoding: "utf8" as const, timeout: CALL_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024, ...(env ? { env } : {}) };
  const [rel, info] = await Promise.all([
    run("gh", ["api", "--paginate", "--slurp", `repos/${owner}/${repo}/releases?per_page=100`], opts),
    run("gh", ["api", `repos/${owner}/${repo}`, "--jq", ".stargazers_count"], opts),
  ]);
  const releases = (JSON.parse(rel.stdout) as GhRelease[][]).flat();
  return { stars: Number(info.stdout.trim()) || 0, releases };
};

const hourOf = (ms: number): string => new Date(ms - (ms % 3600_000)).toISOString().replace(/\.\d+Z$/, "Z");
const dayOf = (ms: number): string => new Date(ms - (ms % 86400_000)).toISOString().replace(/\.\d+Z$/, "Z");

type AssetRow = { asset_id: number; downloads: number; repo: string };

/**
 * Stores one repo's reading. A repo never read before, or last read more than STALE_MS ago, gets a baseline: counts are kept,
 * no increase is recorded. An asset GitHub stops listing is marked gone (history stays) and picks up where it was if it returns.
 */
export function recordRepo(db: DatabaseSync, repo: string, data: RepoReleases, now: number): void {
  const at = new Date(now).toISOString();
  const bucket = hourOf(now);
  const known = new Map((db.prepare("SELECT asset_id, downloads, repo FROM release_assets").all() as AssetRow[]).map((r) => [r.asset_id, r]));
  const mine = [...known.values()].filter((r) => r.repo === repo);
  const lastRead = (db.prepare("SELECT MAX(updated_at) AS t FROM release_assets WHERE repo = ?").get(repo) as { t: string | null }).t;
  const baseline = mine.length === 0 || (lastRead !== null && now - Date.parse(lastRead) > STALE_MS);
  const live = data.releases.filter((r) => !r.draft);
  const upsert = db.prepare(`INSERT INTO release_assets (asset_id, repo, release_id, tag, release_name, published_at, prerelease, name, platform, processor, format, downloads, first_seen, updated_at, gone_at)
    VALUES (:id, :repo, :release, :tag, :rname, :published, :pre, :name, :platform, :processor, :format, :downloads, :at, :at, NULL)
    ON CONFLICT (asset_id) DO UPDATE SET repo = excluded.repo, release_id = excluded.release_id, tag = excluded.tag, release_name = excluded.release_name, published_at = excluded.published_at, prerelease = excluded.prerelease,
      name = excluded.name, platform = excluded.platform, processor = excluded.processor, format = excluded.format, downloads = excluded.downloads, updated_at = excluded.updated_at, gone_at = NULL`);
  const addDelta = db.prepare("INSERT INTO download_deltas (asset_id, t, span, delta) VALUES (?, ?, 'h', ?) ON CONFLICT (asset_id, t, span) DO UPDATE SET delta = delta + excluded.delta");
  const seen = new Set<number>();
  db.exec("BEGIN");
  try {
    for (const rel of live) {
      for (const a of rel.assets) {
        seen.add(a.id);
        const c = classifyAsset(a.name);
        const prev = known.get(a.id)?.downloads;
        const count = a.download_count ?? 0;
        upsert.run({
          id: a.id, repo, release: rel.id, tag: rel.tag_name, rname: rel.name, published: rel.published_at ?? rel.created_at ?? null, pre: rel.prerelease ? 1 : 0,
          name: a.name, platform: c?.platform ?? null, processor: c?.processor ?? null, format: c?.format ?? null, downloads: count, at,
        });
        const delta = baseline ? 0 : prev === undefined ? count : count - prev;
        if (delta > 0 && c) addDelta.run(a.id, bucket, delta);
      }
    }
    const gone = db.prepare("UPDATE release_assets SET gone_at = ? WHERE asset_id = ? AND gone_at IS NULL");
    for (const r of mine) if (!seen.has(r.asset_id)) gone.run(at, r.asset_id);
    const counted = live.filter((r) => r.assets.some((a) => classifyAsset(a.name)));
    if (counted.length) {
      const latest = [...counted].sort((a, b) => Date.parse(b.published_at ?? b.created_at ?? "") - Date.parse(a.published_at ?? a.created_at ?? ""))[0]!;
      db.prepare(`INSERT INTO release_apps (repo, name, stars, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (repo) DO UPDATE SET name = excluded.name, stars = excluded.stars, updated_at = excluded.updated_at`).run(repo, appNameOf(latest.name, repo), data.stars, at);
      const last = db.prepare("SELECT stars FROM star_samples WHERE repo = ? ORDER BY t DESC LIMIT 1").get(repo) as { stars: number } | undefined;
      if (!last || last.stars !== data.stars) db.prepare("INSERT OR REPLACE INTO star_samples (repo, t, stars) VALUES (?, ?, ?)").run(repo, bucket, data.stars);
    } else {
      // Releases that vanished keep their history, so the app stays while any counted file is stored.
      db.prepare("DELETE FROM release_apps WHERE repo = ? AND NOT EXISTS (SELECT 1 FROM release_assets WHERE repo = ? AND format IS NOT NULL)").run(repo, repo);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Folds hour buckets older than 48 hours into day buckets. */
export function foldDeltas(db: DatabaseSync, now: number): void {
  const cutoff = hourOf(now - HOUR_KEEP_MS);
  const old = db.prepare("SELECT asset_id, t, delta FROM download_deltas WHERE span = 'h' AND t < ?").all(cutoff) as { asset_id: number; t: string; delta: number }[];
  if (!old.length) return;
  db.exec("BEGIN");
  try {
    const add = db.prepare("INSERT INTO download_deltas (asset_id, t, span, delta) VALUES (?, ?, 'd', ?) ON CONFLICT (asset_id, t, span) DO UPDATE SET delta = delta + excluded.delta");
    for (const r of old) add.run(r.asset_id, dayOf(Date.parse(r.t)), r.delta);
    db.prepare("DELETE FROM download_deltas WHERE span = 'h' AND t < ?").run(cutoff);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/**
 * Reads the tracked repos, up to CONCURRENCY at a time, for at most BUDGET_MS, starting at a position that moves on each poll so every repo
 * is read across polls. A repo that fails is logged and skipped. Returns the number of repos read.
 */
export async function pollReleases(db: DatabaseSync, fetcher: Fetcher = ghFetcher(db), now = Date.now(), log: (line: string) => void = () => {}, budgetMs = BUDGET_MS): Promise<number> {
  const repos = trackedNames(db);
  const offset = repos.length ? Number((db.prepare("SELECT value FROM settings WHERE key = ?").get(KEY_OFFSET) as { value: string } | undefined)?.value ?? 0) % repos.length : 0;
  const order = [...repos.slice(offset), ...repos.slice(0, offset)];
  const deadline = Date.now() + budgetMs;
  let next = 0;
  let read = 0;
  const worker = async (): Promise<void> => {
    while (next < order.length && Date.now() < deadline) {
      const repo = order[next++]!;
      try {
        recordRepo(db, repo, await fetcher(ownerOf(repo), repo), now);
        read++;
      } catch (e) {
        log(`releases: ${repo}: ${String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 200)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, order.length) }, worker));
  const put = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  put.run(KEY_OFFSET, String(repos.length ? (offset + next) % repos.length : 0));
  put.run(KEY_POLLED_AT, new Date(now).toISOString());
  try {
    foldDeltas(db, now);
  } catch (e) {
    log(`releases: fold: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  }
  log(`releases: ${read} of ${repos.length} repos read`);
  return read;
}

/** Polls when the last poll is older than POLL_EVERY_MS; the sync run calls it. */
export async function pollReleasesIfDue(db: DatabaseSync, fetcher: Fetcher = ghFetcher(db), now = Date.now(), log: (line: string) => void = () => {}): Promise<boolean> {
  const at = (db.prepare("SELECT value FROM settings WHERE key = ?").get(KEY_POLLED_AT) as { value: string } | undefined)?.value;
  if (at && now - Date.parse(at) < POLL_EVERY_MS - 5_000) return false;
  await pollReleases(db, fetcher, now, log);
  return true;
}
