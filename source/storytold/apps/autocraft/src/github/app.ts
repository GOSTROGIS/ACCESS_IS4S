// AutoCraft's GitHub App: the manifest for registering it, the one-time
// conversion of the registration code into the app's keys, an app JWT, and the
// read-only calls the admin page needs (which installations and repos the app
// covers). Minting installation tokens for writes is a later step.
//
// The private key and client secret never appear in a return value, a log line
// or an error message from here: `convertManifest` hands them straight to the
// caller that writes them to the secrets file.
import { createSign } from "node:crypto";
import type { AppOwner, AppSecrets } from "../dash/server/config.ts";

export const GITHUB_API = "https://api.github.com";
export const REPO_URL = "https://github.com/storytold/autocraft";
const UA = "autocraft-dashboard";

/** `status` is the HTTP status of a failed GitHub call, 0 for other failures. */
export class AppError extends Error {
  status = 0;
  /** The failure is a rate limit (a 403 or 429 with no requests left, a Retry-After, or a rate-limit message). */
  rateLimited = false;
}

export type AppDeps = { apiBase?: string };

export type Manifest = {
  name: string; url: string; hook_attributes: { url: string; active: false }; redirect_url: string; setup_url: string; callback_urls: string[];
  public: false; default_permissions: Record<string, "read" | "write">; default_events: string[];
};

/** Names GitHub accepts: at most 34 characters. */
export const APP_NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,33}$/;

export function appManifest(name: string, baseUrl: string): Manifest {
  return {
    name,
    url: REPO_URL,
    // Webhooks start off; an app manager turns them on in the app's settings (docs/operations.md, Webhooks). The URL is the one the server answers.
    hook_attributes: { url: `${baseUrl}/webhooks/github`, active: false },
    redirect_url: `${baseUrl}/auth/github-app/callback`,
    setup_url: `${baseUrl}/auth/github-app/setup`,
    callback_urls: [`${baseUrl}/auth/callback`, `${baseUrl}/discord/github/callback`],
    public: false,
    default_permissions: {
      metadata: "read", contents: "write", pull_requests: "write", issues: "write", actions: "write", repository_advisories: "write",
    },
    default_events: [],
  };
}

/** The form action that creates the app for a user account, or for an org. */
export function registrationUrl(state: string, org: string | null): string {
  const path = org ? `/organizations/${encodeURIComponent(org)}/settings/apps/new` : "/settings/apps/new";
  return `https://github.com${path}?state=${encodeURIComponent(state)}`;
}

export const installUrl = (slug: string): string => `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;

/** The app's settings page on GitHub; organization-owned apps live under the organization. */
export function settingsUrl(slug: string, owner: AppOwner | null): string {
  const base = owner?.type === "Organization" ? `/organizations/${encodeURIComponent(owner.login)}/settings/apps` : "/settings/apps";
  return `https://github.com${base}/${encodeURIComponent(slug)}`;
}
export const transferUrl = (slug: string, owner: AppOwner | null): string => `${settingsUrl(slug, owner)}/advanced`;

const b64 = (s: string): string => Buffer.from(s).toString("base64url");

/** An RS256 JWT for the app, valid ten minutes (the clock is allowed 60 s of skew). */
export function appJwt(app: Pick<AppSecrets, "clientId" | "privateKey">, nowMs = Date.now()): string {
  const now = Math.floor(nowMs / 1000);
  const body = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify({ iat: now - 60, exp: now + 540, iss: app.clientId }))}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(app.privateKey, "base64url")}`;
}

export async function call(base: string, path: string, token: string | null, method = "GET", body?: unknown): Promise<unknown> {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": UA,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    let rateLimited = false;
    if (r.status === 429 || r.status === 403) {
      const body = await r.text().catch(() => "");
      rateLimited = r.status === 429 || r.headers.get("x-ratelimit-remaining") === "0" || r.headers.has("retry-after") || /rate limit/i.test(body);
    }
    throw Object.assign(new AppError(`${method} ${path.replace(/\/[^/]*\/conversions$/, "/…/conversions")}: HTTP ${r.status}`), { status: r.status, rateLimited });
  }
  return r.status === 204 ? null : r.json();
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Exchanges the manifest flow's one-time code for the app's keys. GitHub needs no authentication for it. */
export async function convertManifest(code: string, deps: AppDeps = {}): Promise<AppSecrets & { name: string | null }> {
  const j = (await call(deps.apiBase ?? GITHUB_API, `/app-manifests/${encodeURIComponent(code)}/conversions`, null, "POST")) as Record<string, unknown>;
  const id = typeof j.id === "number" ? String(j.id) : null;
  const slug = str(j.slug), privateKey = str(j.pem), clientId = str(j.client_id), clientSecret = str(j.client_secret);
  if (!id || !slug || !privateKey || !clientId || !clientSecret) throw new AppError("GitHub's answer to the conversion lacks the app's keys");
  const o = j.owner as { login?: unknown; type?: unknown } | null | undefined;
  const ownerLogin = str(o?.login);
  const owner: AppOwner | null = ownerLogin && (o?.type === "User" || o?.type === "Organization") ? { login: ownerLogin, type: o.type } : null;
  return { id, slug, privateKey, clientId, clientSecret, webhookSecret: str(j.webhook_secret), owner, name: str(j.name) };
}

export type Installation = { id: number; owner: string; selection: "all" | "selected" };

/** The app's name as GitHub shows it. */
export async function appName(app: AppSecrets, deps: AppDeps = {}): Promise<string | null> {
  return str(((await call(deps.apiBase ?? GITHUB_API, "/app", appJwt(app))) as { name?: unknown }).name);
}

export async function installations(app: AppSecrets, deps: AppDeps = {}): Promise<Installation[]> {
  const list = (await call(deps.apiBase ?? GITHUB_API, "/app/installations?per_page=100", appJwt(app))) as Array<Record<string, unknown>>;
  return list.flatMap((i) => {
    const owner = str((i.account as { login?: unknown } | null)?.login);
    return typeof i.id === "number" && owner ? [{ id: i.id, owner, selection: i.repository_selection === "all" ? "all" as const : "selected" as const }] : [];
  });
}

/** The login of the account an installation belongs to, or null when the app has no such installation. */
export async function installationAccount(app: AppSecrets, id: number, deps: AppDeps = {}): Promise<string | null> {
  try {
    const i = (await call(deps.apiBase ?? GITHUB_API, `/app/installations/${id}`, appJwt(app))) as { account?: { login?: unknown } | null };
    return str(i.account?.login);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  }
}

/** The installation of the app on a user or org, or null when it is not installed there. */
export async function installationFor(app: AppSecrets, owner: string, deps: AppDeps = {}): Promise<Installation | null> {
  return (await installations(app, deps)).find((i) => i.owner.toLowerCase() === owner.toLowerCase()) ?? null;
}

/**
 * Names of the repos an installation covers. It mints a short-lived
 * installation token for this one read and drops it; the cached minter used
 * for writes is a later step.
 */
export async function installationRepos(app: AppSecrets, installationId: number, deps: AppDeps = {}): Promise<string[]> {
  const base = deps.apiBase ?? GITHUB_API;
  const t = (await call(base, `/app/installations/${installationId}/access_tokens`, appJwt(app), "POST")) as { token?: unknown };
  const token = str(t.token);
  if (!token) throw new AppError("GitHub gave no installation token");
  const out: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = (await call(base, `/installation/repositories?per_page=100&page=${page}`, token)) as { repositories?: Array<{ full_name?: unknown }> };
    const names = (r.repositories ?? []).flatMap((x) => (typeof x.full_name === "string" ? [x.full_name] : []));
    out.push(...names);
    if (names.length < 100) break;
  }
  return out;
}
