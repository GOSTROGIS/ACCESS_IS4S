// The environment of a child process that reads from GitHub (gh api, gh pr, git fetch over HTTPS).
// Under the `box` identity nothing is added: the child inherits this process's environment and the box account's
// login. Under `app` the child's whole environment is the inherited basics plus an installation token (never the
// box account's credentials), and a failure to mint one is an error, not a fallback to the box account.
// The setting is read at every call, so a switch takes effect in the runner and the dashboard without a restart.
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dbPath } from "../db.ts";
import { DEFAULT_OWNER, OWNER } from "../owners.ts";
import { AppNotInstalledError, TOKEN_ENV, appChildEnv, installationToken } from "./install-token.ts";

export type ReadEnv = Record<string, string>;
export type ReadDeps = { db?: DatabaseSync; mint?: (owner: string) => Promise<string>; defaultOwner?: () => string };

let shared: { path: string; db: DatabaseSync } | null = null;
/**
 * A read-only handle on the instance database, opened on first use. Null only when there is no database file (nothing
 * configured the identity); a file that cannot be opened is an error, never a silent read as the box account.
 */
function sharedDb(): DatabaseSync | null {
  const path = dbPath();
  if (shared?.path === path) return shared.db;
  if (!existsSync(path)) return null;
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const db = new DatabaseSync(path, { readOnly: true, timeout: 5_000 });
      shared = { path, db };
      return db;
    } catch (e) { last = e; }
  }
  throw new Error(`cannot read the GitHub identity setting: ${String((last as Error)?.message ?? last).slice(0, 120)}`);
}

function settingOf(db: DatabaseSync): string | undefined {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return (db.prepare("SELECT value FROM main.settings WHERE key = 'github_identity'").get() as { value: string } | undefined)?.value;
    } catch (e) { last = e; }
  }
  throw new Error(`cannot read the GitHub identity setting: ${String((last as Error)?.message ?? last).slice(0, 120)}`);
}

/** Whether reads go through the GitHub App right now. Throws when the setting exists to be read but cannot be. */
export function readsUseApp(db?: DatabaseSync): boolean {
  const d = db ?? sharedDb();
  return d !== null && settingOf(d) === "app";
}

/** The owner of the tracked repos: the default owner when it has any, else the first tracked one. */
export function trackedOwner(db?: DatabaseSync): string {
  const d = db ?? sharedDb();
  try {
    const rows = d?.prepare("SELECT r.owner FROM main.tracked_repos t JOIN main.repos r ON r.name = t.name WHERE r.owner IS NOT NULL ORDER BY t.added_at").all() as { owner: string }[] | undefined;
    const owners = (rows ?? []).map((r) => r.owner).filter((o) => OWNER.test(o));
    if (owners.some((o) => o.toLowerCase() === DEFAULT_OWNER)) return DEFAULT_OWNER;
    if (owners[0]) return owners[0];
  } catch { /* fall through to the default owner */ }
  return DEFAULT_OWNER;
}

/** The owner whose installation serves a read: `owner` when valid, else the tracked owner's. */
export const resolveOwner = (owner?: string, db?: DatabaseSync): string => (owner && OWNER.test(owner) ? owner : trackedOwner(db));

const slugOwner = (v: string | undefined): string | undefined => {
  const o = v?.includes("/") ? v.split("/")[0] : undefined;
  return o && OWNER.test(o) ? o : undefined;
};

/** The owner a gh or git command is about, when its arguments name one (`repos/O/…`, `--repo O/…`, `-R O/…`, `owner=O`, `github.com/O/…`). */
export function ownerOfArgs(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const m = /^(?:repos|orgs)\/([^/]+)/.exec(a) ?? /github\.com\/([^/]+)\//.exec(a) ?? /^owner=(.+)$/.exec(a);
    if (m && OWNER.test(m[1]!)) return m[1]!;
    const eq = /^(?:--repo|-R)=(.+)$/.exec(a);
    if (eq) { const o = slugOwner(eq[1]); if (o) return o; }
    if (a === "--repo" || a === "-R") { const o = slugOwner(args[i + 1]); if (o) return o; }
  }
  return undefined;
}

/** The owner a GraphQL call is about: its `owner` or `login` variable, else an `org:`/`user:`/`repo:` term of a search query. */
export function ownerOfVariables(v: object): string | undefined {
  const x = v as { owner?: unknown; login?: unknown; q?: unknown };
  for (const c of [x.owner, x.login]) if (typeof c === "string" && OWNER.test(c)) return c;
  if (typeof x.q === "string") {
    const m = /(?:^|\s)(?:org|user):([A-Za-z0-9-]+)/.exec(x.q) ?? /(?:^|\s)repo:([A-Za-z0-9-]+)\//.exec(x.q);
    if (m && OWNER.test(m[1]!)) return m[1]!;
  }
  return undefined;
}

/** A read as the app that cannot be made; `notInstalled` when the app is not installed on the owner. */
export class AppReadError extends Error {
  readonly notInstalled: boolean;
  constructor(message: string, notInstalled: boolean) { super(message); this.name = "AppReadError"; this.notInstalled = notInstalled; }
}

/**
 * The whole child environment for a read as the app, or undefined under `box` (the child inherits). `owner` picks the
 * installation; without one the tracked owner's is used. Throws when no installation token can be minted.
 */
export async function readEnv(owner?: string, deps: ReadDeps = {}): Promise<ReadEnv | undefined> {
  // A process that was started with an identity of its own (a merge child that acts as a person) keeps it.
  if (process.env[TOKEN_ENV]) return undefined;
  if (!readsUseApp(deps.db)) return undefined;
  const o = owner && OWNER.test(owner) ? owner : (deps.defaultOwner ?? (() => trackedOwner(deps.db)))();
  try {
    return appChildEnv(await (deps.mint ?? installationToken)(o));
  } catch (e) {
    const missing = e instanceof AppNotInstalledError;
    const why = missing ? `the GitHub App is not installed on ${o}` : `no installation token for ${o}: ${String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 200)}`;
    throw new AppReadError(`app identity: ${why}`, missing);
  }
}

const NETWORK_GIT = new Set(["fetch", "ls-remote", "clone", "pull"]);
/** The subcommand of a git argument list, past leading `-c key=value` pairs. */
function gitSubcommand(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c" || args[i] === "-C" || args[i] === "--git-dir") { i++; continue; }
    if (args[i]!.startsWith("-")) continue;
    return args[i];
  }
  return undefined;
}

/** The environment for spawning `cmd args`: the app's for every gh command and the network reads of git under `app`, else undefined (inherit). Local git gets no token. */
export async function readEnvFor(cmd: string, args: readonly string[]): Promise<ReadEnv | undefined> {
  if (cmd === "git") { const sub = gitSubcommand(args); if (!sub || !NETWORK_GIT.has(sub)) return undefined; }
  else if (cmd !== "gh") return undefined;
  return readEnv(ownerOfArgs(args));
}
