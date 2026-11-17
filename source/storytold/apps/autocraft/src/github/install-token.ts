// Installation tokens for AutoCraft's GitHub App: the minter, and the child
// environment/credential-helper wiring that hands a token to git and gh.
//
// The private key is read here, in the process that mints, and goes no further:
// children get only the 1 h installation token, through their environment.
import { readFileSync } from "node:fs";
import type { AppSecrets } from "../dash/server/config.ts";
import { appSecretsOf, checkSecretsFileMode } from "../dash/server/config.ts";
import { envVar } from "../env.ts";
import { AppError, appJwt, call, GITHUB_API, type AppDeps } from "./app.ts";

export class AppNotInstalledError extends Error {
  owner: string;
  constructor(owner: string) { super(`the GitHub App is not installed on ${owner}`); this.owner = owner; }
}
export class RepoNotInInstallationError extends Error {
  owner: string;
  repo: string;
  constructor(owner: string, repo: string) { super(`${owner}/${repo} is not in the GitHub App's installation`); this.owner = owner; this.repo = repo; }
}

/** Mint a token this long before GitHub's expiry (tokens last 1 h, so about 50 min of use). */
export const REFRESH_MARGIN_MS = 10 * 60_000;
/** Owner -> installation lookups are cached this long; a miss refetches at most this often. */
const INSTALLATIONS_TTL_MS = 5 * 60_000;
const INSTALLATIONS_MISS_REFETCH_MS = 30_000;

export type MinterDeps = AppDeps & { now?: () => number };
type Cached = { token: string; expiresAt: number };
/**
 * Which repositories a token reaches. With a repo named, the token is minted for that repo plus `also` (the same
 * owner's other repos the call needs, such as an issue transfer's target); `wide` keeps it installation-wide (a push to
 * a contributor's fork, which is outside the installation).
 */
export type TokenScope = { also?: string[]; wide?: boolean };

export class InstallTokenMinter {
  private app: () => AppSecrets;
  private base: string;
  private now: () => number;
  private installs: { at: number; byOwner: Map<string, { id: number; selection: "all" | "selected" }> } | null = null;
  private installsInFlight: Promise<void> | null = null;
  /** Keyed by installation id, and for a repo-scoped token by the id and its repository names. */
  private tokens = new Map<string, Cached>();
  private minting = new Map<string, Promise<Cached>>();
  private repos = new Map<number, { token: string; names: Set<string> }>();

  constructor(app: AppSecrets | (() => AppSecrets), deps: MinterDeps = {}) {
    this.app = typeof app === "function" ? app : () => app;
    this.base = deps.apiBase ?? GITHUB_API;
    this.now = deps.now ?? Date.now;
  }

  /**
   * A token for the app's installation on `owner`. With `repo`, the installation must cover it (and `scope.also`), and
   * the token reaches only those repositories unless `scope.wide`. Without a repo (reads across repos) it is installation-wide.
   */
  async token(owner: string, repo?: string, scope: TokenScope = {}): Promise<string> {
    const inst = await this.installation(owner);
    if (repo === undefined) return (await this.mint(inst.id)).token;
    const names = [...new Set([repo, ...(scope.also ?? [])].map((r) => r.toLowerCase()))].sort();
    if (inst.selection === "selected") {
      const wide = await this.mint(inst.id);
      for (const r of names) if (!(await this.covers(inst.id, wide.token, `${owner}/${r}`))) throw new RepoNotInInstallationError(owner, r);
      if (scope.wide) return wide.token;
    } else if (scope.wide) return (await this.mint(inst.id)).token;
    try {
      return (await this.mint(inst.id, names)).token;
    } catch (e) {
      // GitHub refuses a repository the installation cannot reach with 422.
      if (e instanceof AppError && e.status === 422) throw new RepoNotInInstallationError(owner, names.join(", "));
      throw e;
    }
  }

  private async refreshInstallations(): Promise<void> {
    this.installsInFlight ??= (async () => {
      try {
        const list = (await call(this.base, "/app/installations?per_page=100", appJwt(this.app()))) as Array<Record<string, unknown>>;
        const byOwner = new Map<string, { id: number; selection: "all" | "selected" }>();
        for (const i of list) {
          const login = (i.account as { login?: unknown } | null)?.login;
          if (typeof i.id === "number" && typeof login === "string") byOwner.set(login.toLowerCase(), { id: i.id, selection: i.repository_selection === "all" ? "all" : "selected" });
        }
        this.installs = { at: this.now(), byOwner };
      } finally {
        this.installsInFlight = null;
      }
    })();
    return this.installsInFlight;
  }

  private async installation(owner: string): Promise<{ id: number; selection: "all" | "selected" }> {
    const key = owner.toLowerCase();
    if (!this.installs || this.now() - this.installs.at > INSTALLATIONS_TTL_MS) await this.refreshInstallations();
    let hit = this.installs?.byOwner.get(key);
    if (!hit && this.installs && this.now() - this.installs.at > INSTALLATIONS_MISS_REFETCH_MS) {
      await this.refreshInstallations();
      hit = this.installs?.byOwner.get(key);
    }
    if (!hit) throw new AppNotInstalledError(owner);
    return hit;
  }

  private mint(id: number, repos?: string[]): Promise<Cached> {
    const key = repos ? `${id}:${repos.join(",")}` : String(id);
    const c = this.tokens.get(key);
    if (c && c.expiresAt - REFRESH_MARGIN_MS > this.now()) return Promise.resolve(c);
    let p = this.minting.get(key);
    if (!p) {
      p = (async () => {
        try {
          const j = (await call(this.base, `/app/installations/${id}/access_tokens`, appJwt(this.app()), "POST", repos && { repositories: repos })) as { token?: unknown; expires_at?: unknown };
          const expires = typeof j.expires_at === "string" ? Date.parse(j.expires_at) : NaN;
          if (typeof j.token !== "string" || !j.token || Number.isNaN(expires)) throw new AppError("GitHub gave no usable installation token");
          const fresh = { token: j.token, expiresAt: expires };
          this.tokens.set(key, fresh);
          return fresh;
        } catch (e) {
          // A vanished installation: forget the lookup so the next call re-lists.
          if (e instanceof AppError && e.status === 404) this.installs = null;
          throw e;
        } finally {
          this.minting.delete(key);
        }
      })();
      this.minting.set(key, p);
    }
    return p;
  }

  private async covers(id: number, token: string, fullName: string): Promise<boolean> {
    const want = fullName.toLowerCase();
    let c = this.repos.get(id);
    if (c && c.token === token && c.names.has(want)) return true;
    // Miss or new token: list again (repos may have been added to the installation).
    const names = new Set<string>();
    for (let page = 1; page <= 10; page++) {
      const r = (await call(this.base, `/installation/repositories?per_page=100&page=${page}`, token)) as { repositories?: Array<{ full_name?: unknown }> };
      const got = (r.repositories ?? []).flatMap((x) => (typeof x.full_name === "string" ? [x.full_name.toLowerCase()] : []));
      got.forEach((n) => names.add(n));
      if (got.length < 100) break;
    }
    c = { token, names };
    this.repos.set(id, c);
    return names.has(want);
  }
}

/** The app's keys from the secrets file (the runner reads the same file as the dashboard); null when no app is registered. */
export function readAppSecrets(path = envVar("SECRETS_FILE")): AppSecrets | null {
  if (!path) return null;
  checkSecretsFileMode(path);
  return appSecretsOf(JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>);
}

let shared: { appId: string; minter: InstallTokenMinter } | null = null;
/** The process-wide minter; throws when no app is registered. Its caches belong to one app: another app (or none) starts them afresh. */
export function installationToken(owner: string, repo?: string, scope?: TokenScope): Promise<string> {
  const app = readAppSecrets();
  if (!app) { shared = null; throw new AppError("no GitHub App is registered"); }
  if (shared?.appId !== app.id) shared = { appId: app.id, minter: new InstallTokenMinter(() => readAppSecrets() ?? app) };
  return shared.minter.token(owner, repo, scope);
}

// ---- handing a token to a child process ---------------------------------------

/** Who a child acts as: the box account's own git/gh credentials, or the app's installation. */
export type Identity = { kind: "box" } | { kind: "app"; token: string };

export const TOKEN_ENV = "AUTOCRAFT_GIT_TOKEN";

/**
 * A credential helper for git. It is a shell snippet that prints the token from
 * the environment, so the token is in neither argv nor any config file.
 */
export const APP_CREDENTIAL_HELPER = `!f() { test "$1" = get || exit 0; echo username=x-access-token; echo "password=$${TOKEN_ENV}"; }; f`;

/**
 * git `-c` options that hand the installation token to github.com only: every helper configured before (for any host,
 * the box's own github.com helper among them) is dropped, and the app's helper is set for https://github.com alone.
 */
export const APP_CREDENTIAL_ARGS = ["-c", "credential.helper=", "-c", "credential.https://github.com.helper=", "-c", `credential.https://github.com.helper=${APP_CREDENTIAL_HELPER}`];

/** git `-c` options that select the identity's credentials; empty for the box account (the caller's defaults apply). */
export function identityGitArgs(identity: Identity): string[] {
  return identity.kind === "app" ? APP_CREDENTIAL_ARGS : [];
}

/** The environment for a child running git or gh as `identity`. Never mutates `env`. */
export function withIdentityEnv(identity: Identity, env: Record<string, string | undefined> = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined) out[k] = v;
  if (identity.kind === "box") return out;
  for (const k of ["GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]) delete out[k];
  out.GH_TOKEN = identity.token;
  out[TOKEN_ENV] = identity.token;
  out.GIT_TERMINAL_PROMPT = "0";
  return out;
}

/** Variables an app-lane child may inherit: process basics only, so no account credential of the box leaks into it. */
const INHERITED = /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LANGUAGE|TZ|TMPDIR|TERM|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|LC_.*|XDG_.*|SSL_CERT_.*|AUTOCRAFT_.*|CRAFT_AUTO_.*)$/;
const CREDENTIAL = /TOKEN|SECRET|PASSWORD|KEY/i;

/**
 * The complete environment of a child that acts as the app: the inherited basics and the installation token, never
 * the box account's GITHUB_TOKEN or GH_TOKEN. Pass it as the whole child environment, not as an addition to process.env.
 */
export function appChildEnv(token: string, env: Record<string, string | undefined> = process.env): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && INHERITED.test(k) && !CREDENTIAL.test(k)) base[k] = v;
  return withIdentityEnv({ kind: "app", token }, base);
}
