// The user lane: a merge or a close that carries out a person's answer is made as that person, with their GitHub App
// user token (src/github/vault.ts), never as the box account or the app (`actsAsPerson` in identity.ts). Every other
// write of the same answer, the comment before a close included, is the app's and needs no lane. The lane applies while
// the GitHub identity is `app`; under `box` nothing here runs and the box account writes as before.
//
// A decision with a merge or close whose person has no usable token, or no write access on the repo, does not fail: it waits
// (`decisions.exec_state` waiting-token / waiting-permission, with a plain reason) and runs again after that operator
// signs in or authorizes again, or when someone presses Retry.
import { statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { AppError, call, GITHUB_API } from "./app.ts";
import { identityOfDecision, githubIdentity } from "./identity.ts";
import { openVault, type Vault } from "./vault.ts";
import { envVar } from "../env.ts";
import { appChildEnv } from "./install-token.ts";
import { exec as defaultExec, type Exec } from "../fixup/git.ts";
import { Client, GithubError, Transient, type Querier } from "../mirror.ts";
import { slugOf } from "../owners.ts";

export type ExecState = "pending" | "waiting-token" | "waiting-permission" | "done" | "failed";
export const WAITING: readonly ExecState[] = ["waiting-token", "waiting-permission"];

export const SIGN_IN_REASON = "Sign in to let AutoCraft finish this as you";
export const noWriteReason = (repo: string): string => `You have no write access to ${slugOf(repo)}`;

/** Sets the state shown on the decision. Writes nothing when it is already that, so the planner is not woken for nothing. */
export function setExecState(db: DatabaseSync, id: string, state: ExecState, reason: string | null = null): void {
  db.prepare("UPDATE main.decisions SET exec_state = ?, exec_reason = ? WHERE id = ? AND exec_state IS NOT 'disputed' AND (exec_state IS NOT ? OR exec_reason IS NOT ?)").run(state, reason, id, state, reason);
}

/** Decisions the pipeline applied are done. */
export function markExecDone(db: DatabaseSync): void {
  db.prepare("UPDATE main.decisions SET exec_state = 'done', exec_reason = NULL WHERE applied_at IS NOT NULL AND exec_state IS NOT NULL AND exec_state <> 'done'").run();
}

/**
 * Sets a decision answered under an app repo to pending, or to waiting-token when its operator has no stored token set
 * (a database read only: the network checks happen when the write runs).
 */
export function initExecState(db: DatabaseSync, id: string): void {
  const d = db.prepare("SELECT repo, answered_by FROM main.decisions WHERE id = ? AND answer IS NOT NULL AND applied_at IS NULL").get(id) as { repo: string | null; answered_by: string | null } | undefined;
  if (!d?.repo || !d.answered_by || githubIdentity(db) !== "app") return;
  const has = db.prepare("SELECT 1 FROM main.user_tokens WHERE login = ? AND status = 'ok'").get(d.answered_by);
  if (has) setExecState(db, id, "pending");
  else setExecState(db, id, "waiting-token", SIGN_IN_REASON);
}

/** Puts the waiting (and, for one decision, failed) decisions back to pending so the stages take them up again. Returns how many changed. */
export function retryWaiting(db: DatabaseSync, login?: string): number {
  const r = db.prepare(`UPDATE main.decisions SET exec_state = 'pending', exec_reason = NULL
    WHERE exec_state IN ('waiting-token', 'waiting-permission') AND applied_at IS NULL AND answer IS NOT NULL AND (? IS NULL OR answered_by = ? COLLATE NOCASE)`).run(login ?? null, login ?? null);
  return Number(r.changes);
}

/** Act's tries of a decision start again: a target it stopped after repeated failures is planned once more. Used when the answer is undone, given again, kept after a dispute, or retried. */
export function resetActTries(db: DatabaseSync, id: string): void {
  db.prepare("UPDATE main.actions SET state = CASE WHEN state = 'stopped' THEN 'failed' ELSE state END, attempts = 0 WHERE decision_id = ? AND state IN ('stopped', 'failed')").run(id);
}

export function retryDecision(db: DatabaseSync, id: string): boolean {
  const r = db.prepare(`UPDATE main.decisions SET exec_state = 'pending', exec_reason = NULL
    WHERE id = ? AND exec_state IN ('waiting-token', 'waiting-permission', 'failed') AND applied_at IS NULL AND answer IS NOT NULL`).run(id);
  if (Number(r.changes) > 0) resetActTries(db, id);
  return Number(r.changes) > 0;
}

// ---- the lane ----------------------------------------------------------------------

/** What a write made as a user needs: the user's name for the audit row, and the transports that carry the token. */
export type Lane = {
  login: string;
  /** The whole environment of the child: the user's token as GH_TOKEN, and none of the box's own tokens. */
  env: Record<string, string>;
  querier: Querier;
  exec: Exec;
};

export type Permission = "write" | "none" | "rejected";

export type LaneDeps = {
  vault: Pick<Vault, "userToken"> | null;
  /** The user's permission on the repo, read with the user's token. Throws when GitHub cannot answer. */
  permission?: (token: string, repo: string) => Promise<Permission>;
  /** Tests replace the transports. */
  transports?: (env: Record<string, string>) => { querier: Querier; exec: Exec };
};

export type Waiting = { state: "waiting-token" | "waiting-permission"; reason: string };
/** `transient`: GitHub or the token refresh could not answer now; nothing is recorded and the next run tries again. */
export type LaneResult = { lane: Lane } | Waiting | { transient: string };

/** The repo's permission for the token, from GitHub's `permissions` field of the repository. */
export async function githubPermission(token: string, repo: string, apiBase = GITHUB_API): Promise<Permission> {
  try {
    const r = (await call(apiBase, `/repos/${slugOf(repo)}`, token)) as { permissions?: { admin?: boolean; maintain?: boolean; push?: boolean } };
    const p = r.permissions;
    return p?.push || p?.maintain || p?.admin ? "write" : "none";
  } catch (e) {
    if (e instanceof AppError) {
      if (e.status === 401) return "rejected";
      // A rate limit answers 403 or 429 too: GitHub could not answer now, which is not "no access".
      if (!e.rateLimited && (e.status === 403 || e.status === 404)) return "none";
    }
    throw e;
  }
}

const memo = new WeakMap<DatabaseSync, { key: string; deps: LaneDeps }>();
/**
 * The vault of the secrets file (null without a registered app) and GitHub's own permission read. A vault is kept per
 * database connection while the secrets file is the same one (path, mtime, size); when none could be opened nothing is kept.
 */
export function defaultLaneDeps(db: DatabaseSync): LaneDeps {
  const key = secretsKey();
  const m = memo.get(db);
  if (m && m.key === key) return m.deps;
  let vault: Vault | null = null;
  try { vault = openVault(db); } catch { /* no readable secrets: no token can be had */ }
  const deps: LaneDeps = { vault };
  if (vault) memo.set(db, { key, deps }); else memo.delete(db);
  return deps;
}

function secretsKey(): string {
  const f = envVar("SECRETS_FILE");
  if (!f) return "";
  try { const s = statSync(f); return `${f}:${s.mtimeMs}:${s.size}`; } catch { return f; }
}

export function laneOf(deps: LaneDeps, login: string, token: string): Lane {
  const env = appChildEnv(token);
  const t = deps.transports?.(env);
  return {
    login, env,
    querier: t?.querier ?? new Client(1000, env),
    exec: t?.exec ?? ((cmd, args, opts) => defaultExec(cmd, args, { ...opts, env: { ...env, ...opts?.env }, replaceEnv: true })),
  };
}

/** A usable token for the login and write access on every repo, or the reason it waits. */
export async function resolveLane(deps: LaneDeps, login: string, repos: string[]): Promise<LaneResult> {
  if (!deps.vault) return { state: "waiting-token", reason: SIGN_IN_REASON };
  const permission = deps.permission ?? githubPermission;
  let t = await deps.vault.userToken(login);
  for (let attempt = 0; ; attempt++) {
    if (!t.ok) return t.needsSignIn ? { state: "waiting-token", reason: SIGN_IN_REASON } : { transient: "the user token could not be refreshed now" };
    let rejected = false;
    for (const repo of repos) {
      let p: Permission;
      try {
        p = await permission(t.access, repo);
      } catch (e) {
        return { transient: String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 200) };
      }
      if (p === "none") return { state: "waiting-permission", reason: noWriteReason(repo) };
      if (p === "rejected") { rejected = true; break; }
    }
    if (!rejected) return { lane: laneOf(deps, login, t.access) };
    // GitHub refused the access token as expired or revoked: one refresh, then the person has to sign in again.
    if (attempt > 0) return { state: "waiting-token", reason: SIGN_IN_REASON };
    t = await deps.vault.userToken(login, t.access);
  }
}

const NOT_APP_REASON = "This answer was given by a maintainer and can only be carried out as that person: the repo does not use the app identity";
const answeredByMaintainer = (db: DatabaseSync, decisionId: string): boolean =>
  !!db.prepare("SELECT 1 FROM main.decisions d JOIN main.access a ON a.login = d.answered_by WHERE d.id = ? AND a.role = 'maintainer'").get(decisionId);

/**
 * The lane for the operator who answered `decisionId`, or null when every repo is on the box account (`legacy`): the
 * caller then uses its own transports and nothing changes. Only the repos on `app` are checked.
 */
export async function laneForDecision(db: DatabaseSync, deps: LaneDeps | undefined, decisionId: string, repos: string[]): Promise<LaneResult | null> {
  const app = (githubIdentity(db) === "app" ? repos : []);
  // A maintainer's answer is never carried out by the box account: a repo off the app identity refuses the write.
  if (app.length < repos.length && answeredByMaintainer(db, decisionId)) return { state: "waiting-permission", reason: NOT_APP_REASON };
  if (!app.length) return null;
  // A decision that waits stays put until its operator signs in or someone retries it: no network call per run.
  const row = db.prepare("SELECT exec_state, exec_reason FROM main.decisions WHERE id = ?").get(decisionId) as { exec_state: string | null; exec_reason: string | null } | undefined;
  if (row && (row.exec_state === "waiting-token" || row.exec_state === "waiting-permission")) return { state: row.exec_state, reason: row.exec_reason ?? SIGN_IN_REASON };
  const who = identityOfDecision(db, decisionId);
  if (who === "app") return { state: "waiting-token", reason: SIGN_IN_REASON };
  return resolveLane(deps ?? defaultLaneDeps(db), who.slice("user:".length), app);
}

/** The lane for an operator acting right now (a conversation card), or null when every repo is on the box account. */
export async function laneForOperator(db: DatabaseSync, deps: LaneDeps | undefined, login: string, repos: string[]): Promise<LaneResult | null> {
  const app = (githubIdentity(db) === "app" ? repos : []);
  return app.length ? resolveLane(deps ?? defaultLaneDeps(db), login, app) : null;
}

/** A decision that waits for its operator's token or access, or whose answer is disputed: the stages leave it out of their work until it is retried or the dispute is settled. */
export function isWaiting(db: DatabaseSync, decisionId: string | null | undefined): boolean {
  if (!decisionId) return false;
  const r = db.prepare("SELECT exec_state FROM main.decisions WHERE id = ?").get(decisionId) as { exec_state: string | null } | undefined;
  return r?.exec_state === "waiting-token" || r?.exec_state === "waiting-permission" || r?.exec_state === "disputed";
}

/**
 * How a failed write as a user is classified, from the HTTP status (a GitHub error's, or gh's own "(HTTP 403)" line in
 * a command's output) and the GraphQL error type, never from other numbers or words in the text. 401 means the token is
 * no good; 403 and 404 (FORBIDDEN, NOT_FOUND) mean no access. A rate limit and a transient failure are "transient":
 * nothing is recorded and the next run tries again. Anything else, a refusal included, is null.
 */
export function authFailure(e: unknown): "waiting-token" | "waiting-permission" | "transient" | null {
  if (e instanceof Transient) return "transient";
  const message = String((e as Error)?.message ?? e);
  if (e instanceof AppError && e.rateLimited) return "transient";
  const status = e instanceof GithubError || e instanceof AppError ? e.status : httpStatusOfLine(message);
  const type = e instanceof GithubError ? e.type : null;
  if (status === 429 || (status === 403 && /rate limit/i.test(message))) return "transient";
  if (status === 401 || type === "UNAUTHENTICATED") return "waiting-token";
  if (status === 403 || status === 404 || type === "FORBIDDEN" || type === "NOT_FOUND") return "waiting-permission";
  return null;
}

const httpStatusOfLine = (text: string): number => Number(/(?:^|[\s(])HTTP (\d{3})\b/.exec(text)?.[1] ?? 0);
