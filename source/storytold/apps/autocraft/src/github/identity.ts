// Who a GitHub write is made as. A grant carries `as`, decided where the guard makes it:
//  - a merge or a close that carries out a person's answer is made as that person, `user:<login>` (their own name, with
//    their own token from the vault); `actsAsPerson` is the one place that rule lives;
//  - everything else gives `app`: comments (the one before a close included), labels, assignments, new issues, review
//    requests, transfers, fix-up pushes, CI approvals, edits, and every rule, review and automatic write.
// The instance-wide setting `github_identity` decides whether that is used at all: under `box` (the default) the box
// account makes every write, and `as` only appears in the audit row as a record of what it would be.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import type { Grant, Guarded } from "../core/guard.ts";
import { ownerOf } from "../owners.ts";
import { knownSlugs, rememberSlug } from "./slugs.ts";
import { AppError, call, GITHUB_API } from "./app.ts";
import { AppNotInstalledError, installationToken, readAppSecrets, RepoNotInInstallationError } from "./install-token.ts";

export type Identity = "app" | `user:${string}`;
export type GithubIdentity = "box" | "app";
export const GITHUB_IDENTITIES: readonly GithubIdentity[] = ["box", "app"];

const KEY = "github_identity";

/** The one instance-wide switch: whose account GitHub writes and dashboard sign-in use. Read at every use, never cached. */
export function githubIdentity(db: DatabaseSync): GithubIdentity {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(KEY) as { value: string } | undefined;
  return row?.value === "app" ? "app" : "box";
}

/** Returns false when nothing changed. A change ends every dashboard session, so everyone signs in again under the new mode. */
export function setGithubIdentity(db: DatabaseSync, by: string, value: unknown): boolean {
  if (value !== "box" && value !== "app") throw new Error("the GitHub identity must be box or app");
  const was = githubIdentity(db);
  if (was === value) return false;
  db.exec("BEGIN IMMEDIATE");
  try {
  if (value === "box") db.prepare("DELETE FROM main.settings WHERE key = ?").run(KEY);
  else db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(KEY, value);
  audit(db, by, "github-identity", value, { identity: value, was });
  // Sessions' own tokens belong to whichever identity created them; the grant revocation below covers app sessions.
  db.prepare("DELETE FROM sessions").run();
  // The stored user tokens belong to the mode being left: queue their revocation at GitHub (the vault's sweep).
  const stored = db.prepare("DELETE FROM user_tokens RETURNING login, token_enc").all() as { login: string; token_enc: string }[];
  const queue = db.prepare("INSERT INTO user_token_revocations (login, token_enc, queued_at, kind) VALUES (?, ?, ?, 'grant')");
  const at = new Date().toISOString();
  for (const t of stored) queue.run(t.login, t.token_enc, at);
  db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return true;
}

/** What a write is, for the one question of whose name it goes under. Merges and closes are the ones a person's answer carries out. */
export type WriteKind = "merge" | "close" | "other";

/** Only a merge or a close that carries out a person's answer is made as that person; every other write is the app's. */
export const actsAsPerson = (kind: WriteKind): boolean => kind === "merge" || kind === "close";

/** The person who answered `decisionId`, or the app (no decision, not answered yet): who a merge or close for it is made as. */
export function identityOfDecision(db: DatabaseSync, decisionId: string | undefined): Identity {
  if (decisionId === undefined) return "app";
  const row = db.prepare("SELECT answered_by FROM decisions WHERE id = ? AND answer IS NOT NULL").get(decisionId) as { answered_by: string | null } | undefined;
  return row?.answered_by ? `user:${row.answered_by}` : "app";
}

/** The identity a write of `kind` under grant `g` is made as. */
export const identityFor = (g: Guarded | Grant, kind: WriteKind = "other"): Identity => (actsAsPerson(kind) ? g.as : "app");

/** What an audit row records: `legacy` while writes use the box account, else the identity the write is made as. */
export function auditIdentity(db: DatabaseSync, g: Guarded | Grant, kind: WriteKind = "other"): "legacy" | Identity {
  return githubIdentity(db) === "box" ? "legacy" : identityFor(g, kind);
}

/** Whether the app can act on `owner/repo`: covered, not covered (with the reason), or not confirmable now (GitHub 5xx, rate limit, network). */
export type Coverage = { kind: "covered" } | { kind: "uncovered"; why: string } | { kind: "unconfirmed"; why: string };

export async function appCoverage(owner: string, repo: string, mint: (owner: string, repo: string) => Promise<string> = installationToken): Promise<Coverage> {
  try {
    await mint(owner, repo);
    return { kind: "covered" };
  } catch (e) {
    if (e instanceof AppNotInstalledError) return { kind: "uncovered", why: `The GitHub App is not installed on ${owner}.` };
    if (e instanceof RepoNotInInstallationError) return { kind: "uncovered", why: `${owner}/${repo} is not in the GitHub App's installation.` };
    if (e instanceof AppError && e.message === "no GitHub App is registered") return { kind: "uncovered", why: "No GitHub App is registered." };
    const transient = !(e instanceof AppError) || e.status === 0 || e.status >= 500 || e.rateLimited;
    const why = `GitHub could not confirm the installation: ${String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 160)}`;
    return transient ? { kind: "unconfirmed", why } : { kind: "uncovered", why };
  }
}

/** Tracked repos by coverage; `unconfirmed` are those GitHub could not answer for. */
export async function trackedCoverage(db: DatabaseSync, mint?: (owner: string, repo: string) => Promise<string>): Promise<{ uncovered: string[]; unconfirmed: string[] }> {
  const names = (db.prepare("SELECT name FROM main.tracked_repos ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
  const uncovered: string[] = [], unconfirmed: string[] = [];
  for (const n of names) {
    const c = await appCoverage(ownerOf(n), n, mint);
    if (c.kind === "uncovered") uncovered.push(n);
    else if (c.kind === "unconfirmed") unconfirmed.push(n);
  }
  return { uncovered, unconfirmed };
}

let coverageMemo: { at: number; running: boolean; uncovered: string[]; unconfirmed: string[] } | null = null;
/** What the health check shows: the last coverage reading of the tracked repos, refreshed in the background at most every 2 minutes (the minter caches installations). With `refresh` false it still answers from the memo at once, and starts a background refresh only when the memo is missing or older than 10 minutes. */
export function coverageSnapshot(db: DatabaseSync, refresh = true): { uncovered: string[]; unconfirmed: string[] } {
  const maxAge = refresh ? 120_000 : 600_000;  // the probe answers from the memo at once, and only starts a refresh when it is missing or old
  if (!coverageMemo || (!coverageMemo.running && Date.now() - coverageMemo.at > maxAge)) {
    const prev = coverageMemo;
    coverageMemo = { at: Date.now(), running: true, uncovered: prev?.uncovered ?? [], unconfirmed: prev?.unconfirmed ?? [] };
    void trackedCoverage(db).then((r) => { coverageMemo = { at: Date.now(), running: false, ...r }; }, () => { coverageMemo = { at: Date.now(), running: false, uncovered: [], unconfirmed: prev?.unconfirmed ?? [] }; });
  }
  return { uncovered: coverageMemo.uncovered, unconfirmed: coverageMemo.unconfirmed };
}

/**
 * Thrown when the instance cannot switch to the app. `repos` are the tracked repos the app does not cover (empty when no app is
 * registered); `transient` means GitHub could not confirm coverage (try again), and then `repos` lists the unconfirmed ones.
 */
export class IdentityRefused extends Error {
  repos: string[];
  transient: boolean;
  constructor(message: string, repos: string[], transient = false) { super(message); this.repos = repos; this.transient = transient; }
}

/** Sets the identity. Switching to `app` needs a registered app and an installation covering every tracked repo. Returns false when nothing changed. */
export async function setGithubIdentityChecked(
  db: DatabaseSync, by: string, value: unknown, deps: { registered: () => boolean; mint?: (owner: string, repo: string) => Promise<string> },
): Promise<boolean> {
  if (value === "app" && githubIdentity(db) !== "app") {
    if (!deps.registered()) throw new IdentityRefused("No GitHub App is registered.", []);
    const { uncovered, unconfirmed } = await trackedCoverage(db, deps.mint);
    if (uncovered.length) throw new IdentityRefused(`The GitHub App does not cover ${uncovered.length === 1 ? "this repo" : "these repos"}: ${uncovered.join(", ")}.`, uncovered);
    if (unconfirmed.length) throw new IdentityRefused(`GitHub could not confirm the installation for ${unconfirmed.join(", ")}. Try again.`, unconfirmed, true);
    // The app may have been removed while GitHub was asked: check again, with no await before the write.
    if (!deps.registered()) throw new IdentityRefused("No GitHub App is registered.", []);
  }
  return setGithubIdentity(db, by, value);
}

/** Who a commit is made as, and the login its comments carry. */
export type CommitIdentity = { name: string; email: string; login: string };

const botIds = new Map<string, Promise<number>>();

/** The numeric id of the bot user `<slug>[bot]`, read with `token` (the anonymous rate limit is too small to share); cached per process (a failure is not cached). */
export function botUserId(slug: string, token: () => Promise<string>, base: string = GITHUB_API): Promise<number> {
  const k = `${base}|${slug}`;
  let p = botIds.get(k);
  if (!p) {
    p = (async () => {
      const j = (await call(base, `/users/${encodeURIComponent(`${slug}[bot]`)}`, await token())) as { id?: unknown };
      if (typeof j.id !== "number") throw new AppError(`GitHub gave no user id for ${slug}[bot]`);
      return j.id;
    })();
    p.catch(() => botIds.delete(k));
    botIds.set(k, p);
  }
  return p;
}

/**
 * The author and committer of commits AutoCraft creates in `repo`. On a repo on the app's identity that is the app's bot
 * user (`<slug>[bot]`), which is also the login its comments carry; otherwise the box account `box` reads.
 */
export async function commitIdentity(
  db: DatabaseSync, repo: string, box: () => Promise<{ login: string; email: string }>,
  deps: { slug?: () => string | null; botId?: (slug: string) => Promise<number> } = {},
): Promise<CommitIdentity> {
  if (githubIdentity(db) === "app") {
    const slug = (deps.slug ?? (() => readAppSecrets()?.slug ?? null))();
    if (slug) {
      const id = await (deps.botId ?? ((s: string) => botUserId(s, () => installationToken(ownerOf(repo), repo))))(slug);
      const login = `${slug}[bot]`;
      return { name: login, login, email: `${id}+${login}@users.noreply.github.com` };
    }
  }
  const w = await box();
  return { name: w.login, login: w.login, email: w.email };
}

/** The bot logins (bare slug and `<slug>[bot]`) of every known slug plus `extra`; the registered app's slug is recorded when `db` is given. */
export function ownBotLogins(db: DatabaseSync, extra: string | null = null): string[] {
  const live = appSlug();
  if (live) { try { rememberSlug(db, live); } catch { /* a read-only connection: the live slug is still used below */ } }
  const slugs = new Set([...knownSlugs(db), ...(live ? [live] : []), ...(extra ? [extra] : [])]);
  return [...slugs].flatMap((s) => [s, `${s}[bot]`]);
}

/** Slug of the registered GitHub App, read from the secrets file at most once a minute; null when none is registered or the file is unreadable. */
let slugMemo: { at: number; slug: string | null } | null = null;
export function appSlug(): string | null {
  if (slugMemo && Date.now() - slugMemo.at < 60_000) return slugMemo.slug;
  let slug: string | null = null;
  try { slug = readAppSecrets()?.slug ?? null; } catch { slug = null; }
  slugMemo = { at: Date.now(), slug };
  return slug;
}

/**
 * Logins whose items and comments are ours: the box account (when recorded) and the bot of every app slug ever seen (a bare slug in the
 * mirror, `<slug>[bot]` in REST), on every repo whatever the identity setting, so items from before a switch stay ours.
 * `slug` is an extra slug injectable for tests; the registered app's is recorded and included by default.
 */
export function ownLogins(db: DatabaseSync, _repo: string, slug: string | null = null): Set<string> {
  const out = new Set<string>();
  const box = (db.prepare("SELECT value FROM main.settings WHERE key = 'pipeline_login'").get() as { value: string } | undefined)?.value;
  if (box) out.add(box);
  for (const l of ownBotLogins(db, slug)) out.add(l);
  return out;
}

/** Every login that is ours on any repo (for views that span repos). */
export function allOwnLogins(db: DatabaseSync, slug: string | null = null): Set<string> {
  return ownLogins(db, "", slug);
}

export { knownSlugs, rememberSlug };
