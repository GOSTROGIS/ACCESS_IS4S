// Tracked repos: the admin-chosen subset of the org that sync, the pipeline and
// the dashboard work on. `repos` holds every org repo; `tracked_repos` selects.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "./dash/audit.ts";
import { connect } from "./db.ts";
import { execFile } from "node:child_process";
import { DEFAULT_OWNER, loadOwners, OWNER, splitSlug } from "./owners.ts";
import { appCoverage, githubIdentity, setGithubIdentityChecked } from "./github/identity.ts";
import { readAppSecrets } from "./github/install-token.ts";
import { PilotError, setRepoPipeline } from "./pilot.ts";
import { AppReadError, readEnv } from "./github/read.ts";

export class RepoError extends Error {}

export const trackedNames = (db: DatabaseSync): string[] =>
  (db.prepare("SELECT name FROM main.tracked_repos ORDER BY name").all() as { name: string }[]).map((r) => r.name);

export const isTracked = (db: DatabaseSync, name: string): boolean =>
  db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(name) !== undefined;

const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** Tracks `name` (a storytold repo) or `owner/name`. Repo names are unique across owners. */
export function trackRepo(db: DatabaseSync, by: string, input: string): boolean {
  const { owner, name } = splitSlug(input);
  if (!NAME.test(name)) throw new RepoError("Not a repo name.");
  if (!OWNER.test(owner)) throw new RepoError("Not an owner name.");
  const known = db.prepare("SELECT owner FROM main.repos WHERE name = ?").get(name) as { owner: string } | undefined;
  // A bare name means the repo as already known, whoever owns it.
  if (known && input.includes("/") && known.owner.toLowerCase() !== owner.toLowerCase()) {
    throw new RepoError(`${name} is already known under ${known.owner}; repo names are unique across owners.`);
  }
  if (!known) db.prepare("INSERT INTO main.repos (name, owner) VALUES (?, ?)").run(name, owner);
  loadOwners(db);
  const r = db.prepare("INSERT OR IGNORE INTO main.tracked_repos (name, added_by, added_at) VALUES (?, ?, ?)")
    .run(name, by, new Date().toISOString());
  if (r.changes) {
    // Items updated while the repo was untracked were never read; the next sync reads the repo in full.
    db.prepare("UPDATE main.repos SET high_water = NULL, synced_at = NULL, reconciled_at = NULL WHERE name = ?").run(name);
    audit(db, by, "repo-track", name);
  }
  return r.changes > 0;
}

/** Whether `owner/name` exists and the account can read it. */
export type RepoExists = (owner: string, name: string) => Promise<boolean>;

export const ghRepoExists: RepoExists = async (owner, name) => {
  let env: Awaited<ReturnType<typeof readEnv>>;
  try { env = await readEnv(owner); } catch (e) { if (e instanceof AppReadError && e.notInstalled) return false; throw e; }
  return new Promise((resolve) => execFile("gh", ["api", `repos/${owner}/${name}`, "--jq", ".full_name"], { timeout: 30_000, ...(env ? { env } : {}) }, (err) => resolve(!err)));
};

/**
 * trackRepo for an operator's input: a repo of another owner is tracked only when GitHub confirms it
 * and storytold has no repo of that name (names are unique across owners).
 */
export async function trackRepoChecked(db: DatabaseSync, by: string, input: string, exists: RepoExists = ghRepoExists, mint?: (owner: string, repo: string) => Promise<string>): Promise<boolean> {
  const { owner, name } = splitSlug(input);
  const known = NAME.test(name) && db.prepare("SELECT 1 FROM main.repos WHERE name = ?").get(name) !== undefined;
  if (input.includes("/") && owner.toLowerCase() !== DEFAULT_OWNER && OWNER.test(owner) && NAME.test(name) && !known) {
    if (await exists(DEFAULT_OWNER, name)) throw new RepoError(`${DEFAULT_OWNER}/${name} exists; repo names are unique across owners.`);
    if (!(await exists(owner, name))) throw new RepoError(`${owner}/${name} was not found or is not readable.`);
  }
  // Under the GitHub App identity a repo the installation does not cover could not be written to.
  if (githubIdentity(db) === "app" && NAME.test(name) && OWNER.test(owner)) {
    const known2 = db.prepare("SELECT owner FROM main.repos WHERE name = ?").get(name) as { owner: string } | undefined;
    const c = await appCoverage(input.includes("/") ? owner : known2?.owner ?? owner, name, mint);
    if (c.kind === "uncovered") throw new RepoError(`The GitHub App does not cover ${name}: ${c.why}`);
    if (c.kind === "unconfirmed") throw new RepoError(`GitHub could not confirm the GitHub App's installation for ${name}. Try again.`);
  }
  return trackRepo(db, by, input);
}

export function untrackRepo(db: DatabaseSync, by: string, input: string): boolean {
  const { name } = splitSlug(input);
  const r = db.prepare("DELETE FROM main.tracked_repos WHERE name = ?").run(name);
  if (r.changes) audit(db, by, "repo-untrack", name);
  return r.changes > 0;
}

// Deletes the mirrored items and comments of one untracked repo.
export function purgeRepo(db: DatabaseSync, input: string): { items: number; comments: number } {
  const { name } = splitSlug(input);
  if (isTracked(db, name)) throw new RepoError(`${name} is tracked; untrack it first.`);
  db.exec("BEGIN IMMEDIATE");
  try {
    const comments = Number(db.prepare("DELETE FROM main.comments WHERE repo = ?").run(name).changes);
    const items = Number(db.prepare("DELETE FROM main.items WHERE repo = ?").run(name).changes);
    db.prepare("UPDATE main.repos SET high_water = NULL, synced_at = NULL, reconciled_at = NULL WHERE name = ?").run(name);
    db.exec("COMMIT");
    return { items, comments };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export type RepoRow = {
  name: string; owner: string; tracked: number; pipeline: number; open_prs: number | null; open_issues: number | null; rows: number; synced_at: string | null;
};

// Every known repo, tracked first.
export function listAll(db: DatabaseSync): RepoRow[] {
  return db.prepare(`
    SELECT r.name, r.owner, EXISTS (SELECT 1 FROM main.tracked_repos t WHERE t.name = r.name) AS tracked,
           COALESCE((SELECT t.pipeline FROM main.tracked_repos t WHERE t.name = r.name), 0) AS pipeline,
           r.open_prs, r.open_issues, r.synced_at,
           (SELECT COUNT(*) FROM main.items i WHERE i.repo = r.name) AS rows
    FROM main.repos r
    UNION ALL
    SELECT t.name, 'storytold', 1, t.pipeline, NULL, NULL, NULL, (SELECT COUNT(*) FROM main.items i WHERE i.repo = t.name)
    FROM main.tracked_repos t WHERE t.name NOT IN (SELECT name FROM main.repos)
    ORDER BY 3 DESC, 1`).all() as RepoRow[];
}

// Temp views that shadow the mirror and work tables on this connection, so every
// dashboard query sees tracked repos only. Writers (sync, CLI) use plain
// connect() and never call this. Rows of untracked repos stay in the database.
// Views carry rowid explicitly because queries order by it. Code that must see
// everything or write through a shadowed name qualifies it with `main.`.
const SCOPED: [string, string][] = [
  ["repos", "name"], ["items", "repo"], ["comments", "repo"], ["stages", "repo"], ["classifications", "repo"],
];
/** Every table name the scoped connection shadows with a view; writes to them go through `main.`. */
export const SHADOWED_TABLES: readonly string[] = [...SCOPED.map(([t]) => t), "decisions", "token_usage"];
export function scopeToTracked(db: DatabaseSync): void {
  const inList = "IN (SELECT name FROM main.tracked_repos)";
  for (const [t, col] of SCOPED) {
    db.exec(`CREATE TEMP VIEW IF NOT EXISTS ${t} AS SELECT rowid AS rowid, * FROM main.${t} WHERE ${col} ${inList}`);
  }
  // A batch (repo NULL) is hidden when any of its items is in an untracked repo.
  db.exec(`CREATE TEMP VIEW IF NOT EXISTS decisions AS SELECT rowid AS rowid, * FROM main.decisions
    WHERE repo ${inList} OR (repo IS NULL AND NOT EXISTS (
      SELECT 1 FROM json_each(CASE WHEN json_valid(items) THEN items ELSE '[]' END) j
      WHERE json_extract(j.value, '$.repo') NOT ${inList}))`);
  db.exec(`CREATE TEMP VIEW IF NOT EXISTS token_usage AS SELECT rowid AS rowid, * FROM main.token_usage
    WHERE repo IS NULL OR repo ${inList}`);
}

function list(): void {
  const db = connect();
  console.log(`${"repo".padEnd(28)} ${"tracked".padEnd(7)} ${"pipeline".padEnd(8)} ${"open PRs".padStart(8)} ${"open iss".padStart(8)} ${"mirrored".padStart(8)}  synced_at`);
  for (const r of listAll(db)) {
    console.log(`${r.name.padEnd(28)} ${(r.tracked ? "yes" : "-").padEnd(7)} ${(r.tracked ? (r.pipeline ? "on" : "off") : "-").padEnd(8)} ${String(r.open_prs ?? "-").padStart(8)} ${String(r.open_issues ?? "-").padStart(8)} ${String(r.rows).padStart(8)}  ${r.synced_at ?? "-"}`);
  }
}

function need(args: string[], usage: string): string {
  if (!args[0]) {
    console.error(`usage: autocraft repos ${usage}`);
    process.exit(1);
  }
  return args[0];
}

const sub: Record<string, (args: string[]) => void | Promise<void>> = {
  list,
  track: (a) => {
    const name = need(a, "track <name | owner/name>");
    return trackRepoChecked(connect(), "cli", name).then((added) => {
      console.log(added ? `tracking ${name}; it syncs at the next sync` : `${name} was already tracked`);
    }, (e) => {
      if (!(e instanceof RepoError)) throw e;
      console.error(e.message);
      process.exit(1);
    });
  },
  untrack: (a) => {
    const name = need(a, "untrack <name>");
    console.log(untrackRepo(connect(), "cli", name) ? `untracked ${name}; its rows stay in the mirror (repos purge ${name} deletes them)` : `${name} was not tracked`);
  },
  pipeline: (a) => {
    const usage = "pipeline <name> on|off";
    const name = need(a, usage);
    if (a[1] !== "on" && a[1] !== "off") { need([], usage); return; }
    try {
      const on = a[1] === "on";
      console.log(setRepoPipeline(connect(), "cli", name, on) ? `${name}: pipeline ${a[1]}` : `${name}: pipeline was already ${a[1]}`);
    } catch (e) {
      if (!(e instanceof PilotError)) throw e;
      console.error(e.message);
      process.exit(1);
    }
  },
  purge: (a) => {
    const name = need(a, "purge <name>");
    try {
      const r = purgeRepo(connect(), name);
      console.log(`deleted ${r.items} items and ${r.comments} comments of ${name}`);
    } catch (e) {
      if (!(e instanceof RepoError)) throw e;
      console.error(e.message);
      process.exit(1);
    }
  },
};

export const commands = {
  identity: {
    summary: "identity [box|app]: show or set whose GitHub account writes and dashboard sign-in use",
    run: async (args: string[]) => {
      const db = connect();
      if (args[0] === undefined) { console.log(githubIdentity(db)); return; }
      try {
        let registered = false;
        try { registered = readAppSecrets() !== null; } catch { /* unreadable file: no app */ }
        const changed = await setGithubIdentityChecked(db, "cli", args[0], { registered: () => registered });
        console.log(changed ? `identity ${args[0]} (dashboard sessions end; everyone signs in again)` : `identity was already ${args[0]}`);
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
    },
  },
  repos: {
    summary: "tracked repos: list | track <name> | untrack <name> | pipeline <name> on|off | purge <name>",
    run: (args: string[]) => {
      const f = args[0] ? sub[args[0]] : undefined;
      if (!f) {
        console.error(`usage: autocraft repos ${Object.keys(sub).join("|")}`);
        process.exit(1);
      }
      return f(args.slice(1));
    },
  },
};
