// The workspace of an Opus call: a read-only checkout of the default branch of
// every public tracked repository (except those the `workspace_exclude` setting
// lists), mounted at /repos/<name>. One checkout exists per repository and
// head. The head is looked up when a call needs it (at most every few minutes
// per repository); a checkout of a new head is built then, and a call waits
// for it only briefly: it mounts the previous checkout when the new one is
// not ready.
import { existsSync, rmSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { trackedNames } from "../repos.ts";
import { SHARED_NAME } from "./command.ts";
import { checkoutHeld, touchCheckout } from "./checkout.ts";
import { checkoutForCommit, sandboxAvailable } from "./index.ts";
import { envVar } from "../env.ts";

export const EXCLUDE_KEY = "workspace_exclude";
export const EXCLUDE_MAX = 100;

const clean = (names: unknown[]): string[] => [...new Set(names.map((n) => String(n).trim()))].sort();

/** Repositories left out of the workspace (sorted); none until the setting is saved. */
export function workspaceExcluded(db: DatabaseSync): string[] {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(EXCLUDE_KEY) as { value: string } | undefined;
  if (!row) return [];
  try {
    const v = JSON.parse(row.value) as unknown;
    if (Array.isArray(v) && v.every((x) => typeof x === "string" && SHARED_NAME.test(x))) return clean(v);
  } catch { /* unreadable: nothing is excluded */ }
  return [];
}

export function setWorkspaceExcluded(db: DatabaseSync, names: unknown, by: string): string[] {
  if (!Array.isArray(names) || names.length > EXCLUDE_MAX || !names.every((x) => typeof x === "string" && SHARED_NAME.test(x.trim()))) {
    throw new Error(`the excluded repositories must be a list of at most ${EXCLUDE_MAX} repository names (letters, digits, . _ -)`);
  }
  const list = clean(names);
  const was = workspaceExcluded(db);
  db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(EXCLUDE_KEY, JSON.stringify(list));
  if (JSON.stringify(list) !== JSON.stringify(was)) audit(db, by, "workspace-exclude", "sandbox", { repos: list, was });
  return list;
}

export type WorkspaceDeps = {
  /** Head commit of a repository's default branch, or null. */
  headOf(repo: string, branch: string): Promise<string | null>;
  /** A read-only checkout of the commit, or null (logged by the implementation). */
  checkout(repo: string, branch: string, sha: string): Promise<string | null>;
  now(): number;
  /** How long a call waits for a repository's new checkout before it uses the previous one. */
  boundMs: number;
  /** How long a looked-up head counts as current. */
  headTtlMs: number;
  /** How long a superseded checkout stays on disk, for calls that already mounted it. */
  keepMs: number;
};

export function defaultWorkspaceDeps(): WorkspaceDeps {
  return {
    async headOf(repo, branch) {
      const { defaultDeps } = await import("../fixissue/index.ts");
      return defaultDeps().mainHead(repo, branch);
    },
    checkout: (repo, branch, sha) => checkoutForCommit(repo, branch, sha, console.log),
    now: Date.now, boundMs: 20_000, headTtlMs: 5 * 60_000, keepMs: 3 * 3600_000,
  };
}

type State = { sha?: string; dir?: string; checkedAt?: number; job?: Promise<void> };

const mtimeOf = (dir: string): number => { try { return statSync(dir).mtimeMs; } catch { return 0; } };

/** What is known per repository: the newest ready checkout and its head. */
export class WorkspaceCache {
  private repos = new Map<string, State>();
  private superseded: { dir: string; at: number; mtime: number }[] = [];

  private async refresh(repo: string, branch: string, s: State, d: WorkspaceDeps, log: (l: string) => void): Promise<void> {
    try {
      const head = await d.headOf(repo, branch);
      if (!head) return;
      if (head === s.sha && s.dir && existsSync(s.dir)) { touchCheckout(s.dir); s.checkedAt = d.now(); return; }
      const dir = await d.checkout(repo, branch, head);
      if (!dir) return;
      if (s.dir && s.dir !== dir) this.superseded.push({ dir: s.dir, at: d.now(), mtime: mtimeOf(s.dir) });
      Object.assign(s, { sha: head, dir, checkedAt: d.now() });
    } catch (e) {
      log(`  workspace ${repo}: ${String((e as Error).message).slice(0, 150)}`);
    } finally {
      s.job = undefined;
    }
    this.sweep(d);
  }

  private sweep(d: WorkspaceDeps): void {
    this.superseded = this.superseded.filter((x) => {
      if (d.now() - x.at < d.keepMs) return true;
      // Another stage that asked for the same commit after the swap touched it (checkoutForCommit), and a running call holds it: both keep it for another period.
      const m = mtimeOf(x.dir);
      if (checkoutHeld(x.dir) || m > x.mtime) { x.at = d.now(); x.mtime = m; return true; }
      rmSync(x.dir, { recursive: true, force: true });
      return false;
    });
  }

  /** The checkout to mount for `repo`: current when it is ready within the bound, else the previous one, else null. */
  async dirOf(repo: string, branch: string, d: WorkspaceDeps, log: (l: string) => void): Promise<string | null> {
    const s = this.repos.get(repo) ?? {};
    this.repos.set(repo, s);
    if (s.dir && s.checkedAt !== undefined && d.now() - s.checkedAt < d.headTtlMs && existsSync(s.dir)) { touchCheckout(s.dir); return s.dir; }
    const job = (s.job ??= this.refresh(repo, branch, s, d, log));
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([job, new Promise<void>((r) => { timer = setTimeout(r, d.boundMs); })]);
    clearTimeout(timer);
    return s.dir && existsSync(s.dir) ? s.dir : null;
  }
}

const cache = new WorkspaceCache();

function branchOf(db: DatabaseSync, repo: string): string {
  return (db.prepare("SELECT default_branch FROM main.repos WHERE name = ?").get(repo) as { default_branch: string | null } | undefined)?.default_branch ?? "main";
}

/** Checkouts of every public tracked repository's default branch (sorted by name) that could be had; the others are left out. */
export async function workspaceCheckouts(db: DatabaseSync, log: (line: string) => void = console.log, deps: WorkspaceDeps = defaultWorkspaceDeps(), c: WorkspaceCache = cache): Promise<{ name: string; dir: string }[]> {
  const skip = new Set(workspaceExcluded(db));
  // Opus replies reach everyone who may view the dashboard, so only public repositories are mounted.
  const pub = new Set((db.prepare("SELECT name FROM main.repos WHERE visibility = 'public'").all() as { name: string }[]).map((r) => r.name));
  const names = trackedNames(db).filter((n) => pub.has(n) && !skip.has(n) && SHARED_NAME.test(n));
  const dirs = await Promise.all(names.map((n) => c.dirOf(n, branchOf(db, n), deps, log).catch(() => null)));
  const out: { name: string; dir: string }[] = [];
  names.forEach((name, i) => { if (dirs[i]) out.push({ name, dir: dirs[i]! }); else log(`  workspace ${name}: no checkout yet; left out`); });
  return out;
}

/** The workspace for a call, or none when tool mode is unavailable. */
export async function defaultWorkspace(db: DatabaseSync): Promise<{ name: string; dir: string }[]> {
  if (!sandboxAvailable() || envVar("WORKSPACE") === "off") return [];
  try { return await workspaceCheckouts(db); } catch { return []; }
}

export const commands = {
  "workspace-exclude": {
    summary: "workspace-exclude [NAME...|none]: show or set the tracked repositories left out of the read-only workspace of Opus calls (default none)",
    async run(args: string[]): Promise<void> {
      const { connect } = await import("../db.ts");
      const db = connect();
      if (args.length) setWorkspaceExcluded(db, args[0] === "none" && args.length === 1 ? [] : args, "cli");
      console.log(`left out of the workspace: ${workspaceExcluded(db).join(" ") || "none"}`);
    },
  },
};
