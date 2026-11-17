// Which tracked repos a viewer may see. Public repos are visible to everyone
// signed in; a repo that is not public (private, internal, or unknown) is
// visible to operators and to users whose own GitHub token has some
// permission on it (stored in repo_permissions, refreshed by the server).
// Every query that spans repos must go through this.
import type { HiddenRepos } from "../../hidden-sql.ts";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { trackedNames } from "../../repos.ts";
import { DEFAULT_OWNER, ownerOf } from "../../owners.ts";
import { HttpError } from "../server/util.ts";
import type { Req, User } from "../types.ts";
import { securityRepo } from "../../security/rules.ts";
import { canSeeInternals } from "./staff.ts";

const memo = new WeakMap<Req, Promise<string[]>>();

/** The tracked repos `user` may see; also used by the server for image requests. */
export async function visibleTo(db: DatabaseSync, user: Pick<User, "role" | "canRead">): Promise<string[]> {
  const tracked = trackedNames(db);
  if (user.role === "operator") return tracked;
  const pub = new Set((db.prepare("SELECT name FROM main.repos WHERE lower(visibility) = 'public'").all() as { name: string }[]).map((r) => r.name));
  const rest = tracked.filter((r) => !pub.has(r));
  const ok = await Promise.all(rest.map((r) => user.canRead(r).catch(() => false)));
  const allowed = new Set(rest.filter((_, i) => ok[i]));
  return tracked.filter((r) => pub.has(r) || allowed.has(r));
}

/**
 * Tracked repos the requester may see, sorted by name; with a project scope (`req.scope`, set only on `scoped` list routes)
 * that is one of them, only that repo. A scope the requester cannot see is ignored, so a stale picker never empties the app.
 */
export async function visibleRepos(db: DatabaseSync, req: Req): Promise<string[]> {
  const all = await allVisibleRepos(db, req);
  return req.scope && all.includes(req.scope) ? [req.scope] : all;
}

/** Tracked repos the requester may see, ignoring the project scope: for the picker itself, write rights and repo checks. */
export function allVisibleRepos(db: DatabaseSync, req: Req): Promise<string[]> {
  let p = memo.get(req);
  if (!p) memo.set(req, (p = visibleTo(db, req.user)));
  return p;
}

/** Owner of each visible repo that is not storytold's; the web app builds GitHub links from it. */
export async function repoOwners(db: DatabaseSync, req: Req): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const r of await allVisibleRepos(db, req)) if (ownerOf(r) !== DEFAULT_OWNER) out[r] = ownerOf(r);
  return out;
}

/** Every repo name the database knows, tracked or not: the mirror's repos and every repo that was ever tracked (its work rows stay after untracking). */
function knownRepos(db: DatabaseSync): string[] {
  return (db.prepare("SELECT name FROM main.repos UNION SELECT name FROM main.tracked_repos UNION SELECT name FROM main.ever_tracked_repos ORDER BY 1").all() as { name: string }[]).map((r) => r.name);
}

/**
 * Every known repo the requester may not see: all repos in the mirror and in the pipeline tables, tracked or not (rows
 * of an untracked repo stay in jobs, tasks and runs, and are for operators only). Empty for operators. The pseudo repo
 * of a repo's security scans (`(security):<repo>`, where its jobs and agent runs are recorded) is hidden from viewers
 * and from maintainers who cannot see the repo, so every listing that leaves out hidden repos leaves the scans out too.
 */
export async function hiddenRepos(db: DatabaseSync, req: Req): Promise<HiddenRepos> {
  if (req.scope && (await allVisibleRepos(db, req)).includes(req.scope)) return scopedHiddenRepos(db, req, req.scope);
  if (req.user.role === "operator") return [];
  const visibleList = await visibleRepos(db, req);
  const visible = new Set(visibleList);
  const known = knownRepos(db);
  const staff = canSeeInternals(req);
  const hidden = known.filter((r) => !visible.has(r));
  // The list stays the denylist for text matching; SQL filters use the allow-list attached to it (see excludeHidden).
  // Staff who can see a repo also see its security pseudo repo, so it belongs in the allow-list.
  return Object.assign([...hidden, ...known.filter((r) => !staff || !visible.has(r)).map(securityRepo)], { visible: staff ? [...visibleList, ...visibleList.map(securityRepo)] : visibleList });
}

/**
 * Hidden repos for a view scoped to one repo: every other known repo is hidden, as if the requester could see only `repo`
 * (and, for staff, its security pseudo repo). 404 unless `repo` is visible.
 */
async function scopedHiddenRepos(db: DatabaseSync, req: Req, repo: string): Promise<HiddenRepos> {
  await needVisible(db, req, repo);
  const staff = canSeeInternals(req);
  const others = knownRepos(db).filter((r) => r !== repo);
  return Object.assign([...others, ...others.map(securityRepo), ...(staff ? [] : [securityRepo(repo)])], { visible: staff ? [repo, securityRepo(repo)] : [repo] });
}

/** 404 unless the repo is tracked and visible to the requester; the message is the same for both. */
export async function needVisible(db: DatabaseSync, req: Req, repo: string): Promise<void> {
  if (!(await allVisibleRepos(db, req)).includes(repo)) throw new HttpError(404, `${repo} is not a tracked repo`);
}

/**
 * SQL that leaves out the hidden repos: `<col> NOT IN (...)`, binding the names
 * into `params` under `<prefix>0`, `<prefix>1`, ... Null when nothing is hidden.
 */
export function excludeHidden(col: string, hidden: string[] & { visible?: string[] }, params: Record<string, SQLInputValue>, prefix = "hid"): string | null {
  // A list from hiddenRepos carries the repos the requester may see: rows of any other repo, known or not, are left out.
  if (hidden.visible) return hidden.visible.length ? `${col} IN (${hidden.visible.map((h, k) => ((params[`${prefix}${k}`] = h), `:${prefix}${k}`)).join(",")})` : "0";
  if (!hidden.length) return null;
  return `${col} NOT IN (${hidden.map((h, k) => ((params[`${prefix}${k}`] = h), `:${prefix}${k}`)).join(",")})`;
}

const namePatterns = new WeakMap<string[], RegExp | null>();

/** Matches a hidden repo name only as a whole name: "craft" is not found in "designcraft" or "craft-launcher". */
function hiddenPattern(hidden: string[]): RegExp | null {
  let re = namePatterns.get(hidden);
  if (re === undefined) {
    re = hidden.length ? new RegExp(`(?<![\\w.-])(?:${hidden.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-]|\\.[\\w-])`) : null;
    namePatterns.set(hidden, re);
  }
  return re;
}

/** Free text from the pipeline (breaker, pause and status reasons) can quote an item of a repo the caller may not see: it is left out whole then. */
export function blankIfHidden<T extends string | null | undefined>(text: T, hidden: string[]): T | "" {
  const re = text ? hiddenPattern(hidden) : null;
  return text && re?.test(text) ? "" : text;
}
