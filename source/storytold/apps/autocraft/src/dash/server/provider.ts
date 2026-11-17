// OAuth providers: GitHub, and a fake one for tests and local development.
import { readFileSync } from "node:fs";
import type { Config } from "./config.ts";
import { pkceChallenge, randomToken, safeEqual } from "./crypto.ts";
import { ownerOf } from "../../owners.ts";
export type Permission = "admin" | "maintain" | "write" | "triage" | "read" | "none";
export const WRITE_PERMISSIONS: ReadonlySet<string> = new Set(["admin", "maintain", "write"]);

export const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

// The OAuth App issues expiring user tokens: an access token (8 h at GitHub)
// and a single-use refresh token. Times are epoch milliseconds; null means
// the provider didn't say (a non-expiring token).
export type Tokens = {
  access: string;
  expiresAt: number | null;
  refresh: string | null;
  refreshExpiresAt: number | null;
};

// The account behind a token. The numeric id never changes when a login is
// renamed or released, so access is bound to it.
export type GithubUser = { login: string; id: number };

/** GitHub answered a revoke with a refusal; `status` is its HTTP status (404/422: the token is expired or already gone). */
export class RevokeRefused extends Error {
  status: number;
  constructor(status: number) {
    super(`revoke: HTTP ${status}`);
    this.status = status;
  }
}

export interface Provider {
  /** With selectAccount the provider shows its account picker even when someone is already signed in there. */
  authorizeUrl(state: string, challenge: string, redirectUri: string, selectAccount?: boolean, scopes?: string[]): string;
  // Each returns null when the provider rejects the code or refresh token, and
  // throws on a transport failure.
  exchange(code: string, verifier: string, redirectUri: string): Promise<Tokens | null>;
  refresh(refreshToken: string): Promise<Tokens | null>;
  identity(access: string): Promise<GithubUser | null>;
  /** Revokes a token at the provider; throws RevokeRefused when the provider refuses, another error on a transport failure. */
  revoke(access: string): Promise<void>;
  /** Revokes the whole authorization behind a token: every token of that user for this app dies with it. Throws like revoke. */
  revokeGrant(access: string): Promise<void>;
  // "unauthorized": the access token is expired or revoked. Throws on a
  // transport failure, so a GitHub outage isn't cached as "none".
  permission(access: string, repo: string): Promise<Permission | "unauthorized">;
}

const UA = "autocraft-dashboard";

function tokensFrom(body: Record<string, unknown>, now = Date.now()): Tokens | null {
  if (typeof body.access_token !== "string") return null;
  const secs = (v: unknown) => (typeof v === "number" && v > 0 ? now + v * 1000 : null);
  return {
    access: body.access_token,
    expiresAt: secs(body.expires_in),
    refresh: typeof body.refresh_token === "string" ? body.refresh_token : null,
    refreshExpiresAt: secs(body.refresh_token_expires_in),
  };
}

export class GitHubIdentityProvider {
  async identity(access: string): Promise<GithubUser | null> {
    const r = await this.api(access, "/user");
    if (r.status === 401) return null;
    if (!r.ok) throw new Error(`GET /user: HTTP ${r.status}`);
    const body = (await r.json()) as { login?: unknown; id?: unknown };
    return typeof body.login === "string" && typeof body.id === "number" && Number.isSafeInteger(body.id) ? { login: body.login, id: body.id } : null;
  }
  async permission(access: string, repo: string): Promise<Permission | "unauthorized"> {
    const r = await this.api(access, `/repos/${ownerOf(repo)}/${encodeURIComponent(repo)}`);
    if (r.status === 401) return "unauthorized";
    if (r.status === 404) return "none";
    if (!r.ok) throw new Error(`GET /repos/${ownerOf(repo)}/${repo}: HTTP ${r.status}`);
    const p = ((await r.json()) as { permissions?: Record<string, boolean> }).permissions ?? {};
    if (p.admin) return "admin";
    if (p.maintain) return "maintain";
    if (p.push) return "write";
    if (p.triage) return "triage";
    if (p.pull) return "read";
    return "none";
  }
  private api(access: string, path: string): Promise<Response> {
    return fetch(`https://api.github.com${path}`, {
      redirect: "error",
      headers: { authorization: `Bearer ${access}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": UA },
      signal: AbortSignal.timeout(10_000),
    });
  }
}

/** A credential borrowed from the owner's native credential manager is never an OAuth grant owned by this app. */
export class NativeGitHubProvider extends GitHubIdentityProvider implements Provider {
  authorizeUrl(): string { throw new Error("Use the installed native sign-in launcher."); }
  async exchange(): Promise<null> { return null; }
  async refresh(): Promise<null> { return null; }
  async revoke(): Promise<void> { throw new Error("A native credential is managed by its credential manager; sign out locally instead."); }
  async revokeGrant(): Promise<void> { throw new Error("A native credential's external grant cannot be revoked by this application."); }
}

export class GitHubProvider extends GitHubIdentityProvider implements Provider {
  #id: string;
  #secret: string;
  constructor(clientId: string, clientSecret: string) {
    super();
    this.#id = clientId;
    this.#secret = clientSecret;
  }
  authorizeUrl(state: string, challenge: string, redirectUri: string, selectAccount = false, scopes: string[] = []): string {
    // Dashboard sign-in asks for no scopes: the token reads public data, which is all a permission check on a public repo needs.
    const q = new URLSearchParams({
      client_id: this.#id, redirect_uri: redirectUri, state,
      code_challenge: challenge, code_challenge_method: "S256", allow_signup: "false",
    });
    if (selectAccount) q.set("prompt", "select_account");
    if (scopes.length) q.set("scope", scopes.join(" "));
    return `https://github.com/login/oauth/authorize?${q}`;
  }
  exchange(code: string, verifier: string, redirectUri: string): Promise<Tokens | null> {
    return this.#token({ code, redirect_uri: redirectUri, code_verifier: verifier });
  }
  refresh(refreshToken: string): Promise<Tokens | null> {
    return this.#token({ grant_type: "refresh_token", refresh_token: refreshToken });
  }
  async #token(params: Record<string, string>): Promise<Tokens | null> {
    const r = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
      body: new URLSearchParams({ client_id: this.#id, client_secret: this.#secret, ...params }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`token endpoint: HTTP ${r.status}`);
    // A rejected code or refresh token answers 200 with an `error` field.
    return tokensFrom((await r.json()) as Record<string, unknown>);
  }
  revoke(access: string): Promise<void> {
    return this.#deleteApplication("token", access);
  }
  revokeGrant(access: string): Promise<void> {
    return this.#deleteApplication("grant", access);
  }
  async #deleteApplication(what: "token" | "grant", access: string): Promise<void> {
    const r = await fetch(`https://api.github.com/applications/${encodeURIComponent(this.#id)}/${what}`, {
      method: "DELETE",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.#id}:${this.#secret}`).toString("base64")}`, accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28", "user-agent": UA, "content-type": "application/json",
      },
      body: JSON.stringify({ access_token: access }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new RevokeRefused(r.status);
  }
}

// Signs in as any login typed on /auth/dev/authorize (or given as ?login=),
// and reads permissions from AUTOCRAFT_DEV_PERMS on every check, so tests can
// change them while the server runs. Tokens expire like GitHub's, after
// `tokenTtlMs`, and refresh tokens are single use.
export class FakeProvider implements Provider {
  #codes = new Map<string, { login: string; challenge: string; redirectUri: string; at: number }>();
  #access = new Map<string, { login: string; expiresAt: number }>();
  #refresh = new Map<string, string>();
  #permsFile: string | null;
  tokenTtlMs: number;
  refreshes = 0;
  rejectRefresh = false;
  constructor(permsFile: string | null, tokenTtlMs = 8 * 3_600_000) {
    this.#permsFile = permsFile;
    this.tokenTtlMs = tokenTtlMs;
  }
  authorizeUrl(state: string, challenge: string, redirectUri: string, _selectAccount = false, scopes: string[] = []): string {
    return `/auth/dev/authorize?${new URLSearchParams({ state, code_challenge: challenge, redirect_uri: redirectUri, ...(scopes.length ? { scope: scopes.join(" ") } : {}) })}`;
  }
  issueCode(login: string, challenge: string, redirectUri: string): string {
    const code = randomToken(16);
    this.#codes.set(code, { login, challenge, redirectUri, at: Date.now() });
    return code;
  }
  #issue(login: string): Tokens {
    const now = Date.now();
    const t: Tokens = {
      access: `dev_${randomToken(20)}`, expiresAt: now + this.tokenTtlMs,
      refresh: `devr_${randomToken(20)}`, refreshExpiresAt: now + 180 * 86_400_000,
    };
    this.#access.set(t.access, { login, expiresAt: t.expiresAt! });
    this.#refresh.set(t.refresh!, login);
    return t;
  }
  async exchange(code: string, verifier: string, redirectUri: string): Promise<Tokens | null> {
    const c = this.#codes.get(code);
    this.#codes.delete(code);
    if (!c || Date.now() - c.at > 600_000 || c.redirectUri !== redirectUri) return null;
    if (!safeEqual(pkceChallenge(verifier), c.challenge)) return null;
    return this.#issue(c.login);
  }
  revoked: string[] = [];
  // Like GitHub: an expired or unknown token cannot be revoked (404).
  async revoke(access: string): Promise<void> {
    if (!this.#valid(access)) throw new RevokeRefused(404);
    this.#access.delete(access);
    this.revoked.push(access);
  }
  revokedGrants: string[] = [];
  async revokeGrant(access: string): Promise<void> {
    const t = this.#access.get(access);
    if (!t || !this.#valid(access)) throw new RevokeRefused(404);
    this.revokedGrants.push(access);
    for (const [a, v] of this.#access) if (v.login === t.login) this.#access.delete(a);
    for (const [r, l] of this.#refresh) if (l === t.login) this.#refresh.delete(r);
  }
  async refresh(refreshToken: string): Promise<Tokens | null> {
    const login = this.#refresh.get(refreshToken);
    this.#refresh.delete(refreshToken);
    if (!login || this.rejectRefresh) return null;
    this.refreshes++;
    return this.#issue(login);
  }
  #valid(access: string): string | null {
    const t = this.#access.get(access);
    return t && t.expiresAt > Date.now() ? t.login : null;
  }
  // Ids are stable per lowercase login unless a test sets one in `ids`.
  ids = new Map<string, number>();
  async identity(access: string): Promise<GithubUser | null> {
    const login = this.#valid(access);
    if (!login) return null;
    const key = login.toLowerCase();
    let id = this.ids.get(key);
    if (id === undefined) {
      id = 1000 + [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_003, 7);
      this.ids.set(key, id);
    }
    return { login, id };
  }
  async permission(access: string, repo: string): Promise<Permission | "unauthorized"> {
    const login = this.#valid(access);
    if (!login) return "unauthorized";
    if (!this.#permsFile) return "none";
    const all = JSON.parse(readFileSync(this.#permsFile, "utf8")) as Record<string, Record<string, string>>;
    const key = Object.keys(all).find((k) => k.toLowerCase() === login.toLowerCase());
    const p = key ? all[key]?.[repo] : undefined;
    return (["admin", "maintain", "write", "triage", "read"].includes(p ?? "") ? p : "none") as Permission;
  }
}

/** The OAuth App's provider whatever the dashboard sign-in mode: the org setup link needs scopes, which a GitHub App's authorization ignores. */
export function oauthProviderFor(config: Config): Provider {
  if (config.devAuth) return new FakeProvider(config.devPermsFile, config.devTokenTtlMs ?? undefined);
  const { githubClientId, githubClientSecret } = config.secrets;
  if (githubClientId && githubClientSecret) return new GitHubProvider(githubClientId, githubClientSecret);
  if (config.secrets.nativeOwner) return new NativeGitHubProvider();
  throw new Error("OAuth credentials are not configured");
}

/**
 * The dashboard's sign-in provider. The identity (and the registered app) is read at every call, so a switch or a
 * registration takes effect without a restart. A GitHub App's user authorization uses the same endpoints as the OAuth App's.
 */
export function providerFor(config: Config, identity: () => "box" | "app"): Provider {
  if (config.devAuth) return new FakeProvider(config.devPermsFile, config.devTokenTtlMs ?? undefined);
  const now = (): Provider => {
    const { githubClientId, githubClientSecret, app } = config.secrets;
    if (identity() === "app" && app) return new GitHubProvider(app.clientId, app.clientSecret);
    if (githubClientId && githubClientSecret) return new GitHubProvider(githubClientId, githubClientSecret);
    if (config.secrets.nativeOwner) return new NativeGitHubProvider();
    throw new Error("OAuth credentials are not configured");
  };
  // Sign-in under the app identity never falls back to the OAuth App: without app keys it fails.
  const noFallback = (): Provider => {
    if (identity() === "app" && !config.secrets.app) throw new Error("the GitHub identity is the app but no app keys are available");
    return now();
  };
  return {
    authorizeUrl: (...a) => noFallback().authorizeUrl(...a),
    exchange: (...a) => noFallback().exchange(...a),
    refresh: (...a) => now().refresh(...a),
    identity: (...a) => now().identity(...a),
    revoke: (...a) => now().revoke(...a),
    revokeGrant: (...a) => now().revokeGrant(...a),
    permission: (...a) => now().permission(...a),
  };
}
