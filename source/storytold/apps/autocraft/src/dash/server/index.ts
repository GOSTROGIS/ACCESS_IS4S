// HTTP server: sign-in, sessions, CSRF, rate limits, security headers and
// routing for the dashboard. Handlers only ever see authenticated requests.
import { maintainerWritesOn } from "../../settlers.ts";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { DatabaseSync } from "node:sqlite";
import { LOGIN, checkGithubId, getAccess } from "../../access.ts";
import { audit, auditRefusedSignIn } from "../audit.ts";
import type { Req, Res, Route } from "../types.ts";
import { isLoopbackHost, type Config } from "./config.ts";
import { resealLegacyValues } from "./reseal.ts";
import { pkceChallenge, randomToken, safeEqual, TokenBox } from "./crypto.ts";
import { ImageIndex } from "./image-index.ts";
import { visibleTo } from "../api/visible.ts";
import { allowedImage, ImageProxy, imageTokenSource, registerImageRepos } from "./images.ts";
import { TokenBucket } from "./limits.ts";
import { dbReady, serveHealth } from "../../health.ts";
import { serveChecks } from "../../health-checks.ts";
import { discordPrivacyPage, DISCORD_PRIVACY_PATH } from "./discord-privacy.ts";
import { reporterSignIn, REPORTER_CALLBACK_PATH, REPORTER_START_PATH } from "./reporter-signin.ts";
import { FILING_IN_DISCORD } from "../../discord/file-issue.ts";
import { discordTermsPage, DISCORD_TERMS_PATH } from "./discord-terms.ts";
import { contactOf } from "../api/discord.ts";
import { LiveHub, type LiveOptions } from "./live.ts";
import { finishRegistration, githubAppRoutes, startRegistration } from "./github-app.ts";
import { OrgSetup } from "./github-setup.ts";
import { Vault } from "../../github/vault.ts";
import { githubIdentity } from "../../github/identity.ts";
import { saveUserTokens } from "./user-tokens.ts";
import { FakeProvider, GitHubProvider, oauthProviderFor, providerFor, type GithubUser, type Provider, type Tokens } from "./provider.ts";
import { retryWaiting } from "../../github/user-lane.ts";
import { createSession, deleteSession, loadSession, makeUser, pruneExpired, SESSION_TTL, userForLogin, type Session } from "./sessions.ts";
import { consumeNativeHandoff, initializeNativeSignIn, nativeHandoffPage, nativeOwner, nativeSessionCookie, nativeStateCookie } from "./native-signin.ts";
import { answering, handleMcp, writes as mcpWrites, type Msg as McpMsg } from "../mcp/index.ts";
import { loadToken, pruneTokens } from "../mcp/tokens.ts";
import { handleDelivery, WEBHOOK_BODY_LIMIT, WEBHOOK_PATH } from "../../github/webhooks.ts";
import { esc, HttpError, parseCookies, plainPage, previewTags, RateLimiter, safeReturnTo } from "./util.ts";

export const SESSION_COOKIE = "__Host-craft_session";
/** `oauth_states.return_to` of an "act as you" authorization, which the shared sign-in callback tells apart from a sign-in by this prefix. */
const AUTHORIZE_PREFIX = "authorize:";
const STATE_COOKIE = "__Host-craft_oauth";
const BODY_LIMIT = 64 * 1024;
const PUBLIC_FILES = new Set(["/artcraft-mark.svg", "/artcraft-mark.png"]);
const FILE_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", svg: "image/svg+xml",
  png: "image/png", ico: "image/x-icon", woff2: "font/woff2", json: "application/json",
  txt: "text/plain; charset=utf-8", webmanifest: "application/manifest+json",
};

// The one inline style the frontend needs: react-remove-scroll-bar (under
// Radix Dialog and DropdownMenu) injects a <style> while a modal is open. Its
// text depends only on the page scrollbar's width and the body's margins,
// which the app's CSS fixes at 0 (body has no margin and overflow: hidden),
// so the text is always the same. Recompute the hash if that package changes
// the text; Chrome's console names the expected hash on a violation.
const RADIX_SCROLL_LOCK_STYLE = "'sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo='";

// The React app (web/): scripts and styles from this origin only, no nonce.
export const APP_CSP = [
  "default-src 'none'", "script-src 'self'", `style-src 'self' ${RADIX_SCROLL_LOCK_STYLE}`,
  "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "form-action 'self'",
  "base-uri 'none'", "frame-ancestors 'none'",
].join("; ");

export type AppOptions = {
  config: Config;
  db: DatabaseSync;
  provider?: Provider;
  routes?: Route[];          // default: the JSON API
  images?: ImageProxy;       // default: fetches with global fetch and the bot's gh token
  live?: LiveOptions;        // GET /api/live timing; defaults suit production
  // Opinions and comments per login per hour. The dashboard's routes and the MCP server's feedback must share one instance.
  feedbackLimiter?: RateLimiter;
  githubUserId?: (login: string) => Promise<number | null>; // numeric GitHub id of a login for new access entries; default: GitHub's API
  githubApi?: string;        // base URL of the GitHub API for the GitHub App calls; default: api.github.com
};

type Compiled = Route & { parts: string[] };


export async function defaultRoutes(feedbackLimiter?: RateLimiter, githubUserId?: AppOptions["githubUserId"]): Promise<Route[]> {
  const { apiRoutes } = await import("../api/index.ts");
  return apiRoutes({ limiter: feedbackLimiter, ...(githubUserId && { githubUserId }) });
}

function compile(routes: Route[]): Compiled[] {
  return routes.map((r) => ({ ...r, parts: r.pattern.split("/").filter(Boolean) }));
}

function match(routes: Compiled[], method: string, path: string): { route?: Compiled; params?: Record<string, string>; other: boolean } {
  const segs = path.split("/").filter(Boolean);
  let other = false;
  for (const r of routes) {
    if (r.parts.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < segs.length && ok; i++) {
      const p = r.parts[i]!;
      if (p.startsWith(":")) {
        try {
          params[p.slice(1)] = decodeURIComponent(segs[i]!);
        } catch {
          ok = false;
        }
      } else ok = p === segs[i];
    }
    if (!ok) continue;
    if (r.method === method) return { route: r, params, other };
    other = true;
  }
  return { other };
}

async function readRaw(req: IncomingMessage, limit: number = BODY_LIMIT): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) throw new HttpError(413, "Request too large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    size += c.length;
    if (size > limit) throw new HttpError(413, "Request too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

const contentType = (req: IncomingMessage): string => (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const raw = await readRaw(req);
  if (raw.length === 0) return new URLSearchParams();
  if (contentType(req) !== "application/x-www-form-urlencoded") throw new HttpError(415, "Forms must be sent as application/x-www-form-urlencoded");
  return new URLSearchParams(raw.toString("utf8"));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readRaw(req);
  if (raw.length === 0) return undefined;
  if (contentType(req) !== "application/json") throw new HttpError(415, "Send the body as application/json");
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new HttpError(400, "The body is not valid JSON");
  }
}

// API clients send the session's CSRF token in this header; every /api/
// response carries it, so the client reads it from GET /api/me.
export const CSRF_HEADER = "x-csrf-token";
/** The web app's project: one repo name a `scoped` route narrows its list to, or absent for every repo. */
export const SCOPE_HEADER = "x-autocraft-scope";
const scopeOf = (req: IncomingMessage): string | null => {
  const v = req.headers[SCOPE_HEADER];
  return typeof v === "string" && v ? v : null;
};

function cookie(name: string, value: string, maxAgeSec: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function createApp(opts: AppOptions & { routes: Route[] }) {
  const { config, db } = opts;
  const localOwner = nativeOwner(config);
  const sessionCookie = nativeSessionCookie(config) ?? SESSION_COOKIE;
  const stateCookie = nativeStateCookie(config) ?? STATE_COOKIE;
  if (localOwner) initializeNativeSignIn(db);
  const provider = opts.provider ?? providerFor(config, () => githubIdentity(db));
  // The org setup link signs in with the OAuth App even when dashboard sign-in uses the GitHub App.
  const setupProvider = opts.provider ?? (config.devAuth ? provider : oauthProviderFor(config));
  const box = new TokenBox(config.secrets.sessionKey);
  const resealed = resealLegacyValues(db, box);
  const resealedTotal = Object.values(resealed).reduce((a, b) => a + b, 0);
  if (resealedTotal) console.log(`re-sealed ${resealedTotal} stored token values under the current key (${Object.entries(resealed).map(([t, n]) => `${t} ${n}`).join(", ")})`);
  // The GitHub App's own provider: it signs users in under login=github-app, and always makes and refreshes their user tokens (the "act as you" authorization).
  // Read at each use: registering or removing the app takes effect without a restart.
  const appProviderNow = (): Provider | null => {
    const appKeys = config.secrets.app;
    return opts.provider ?? (config.devAuth ? provider : appKeys ? new GitHubProvider(appKeys.clientId, appKeys.clientSecret) : null);
  };
  const vault = new Vault(db, box, () => appProviderNow() ?? provider);
  const appDeps = { apiBase: opts.githubApi };
  const routes = compile([...opts.routes, ...githubAppRoutes(config, appDeps)]);
  const signinLimit = new RateLimiter(60, 10 * 60_000);
  const writeLimitSession = new RateLimiter(60, 60_000);
  const writeLimitIp = new RateLimiter(300, 60_000);
  const imageIndex = new ImageIndex(db);
  registerImageRepos((href) => imageIndex.reposOf(href));
  const images = opts.images ?? new ImageProxy({
    cacheDir: config.imageCacheDir, repos: (href) => imageIndex.reposOf(href),
    token: imageTokenSource(process.env),
  });
  const imageLimit = new RateLimiter(120, 60_000);    // upstream fetches per session; cache hits are free
  const imageLimitIp = new RateLimiter(240, 60_000);  // and per client address
  // GET endpoints that aggregate the mirror or run the embedder: a burst, then 30 a minute, per session.
  const expensiveGets = new TokenBucket(20, 0.5);
  const live = new LiveHub(db, opts.live);
  // The Inbox MCP server (POST /mcp): calls per login and failed authentications per client address, and feedback posts per login as on the dashboard.
  const mcpLimitToken = new RateLimiter(120, 60_000);
  const mcpLimitIp = new RateLimiter(300, 60_000);
  const webhookLimitIp = new RateLimiter(5000, 60_000);  // flood guard only; the periodic sync still runs. Before the body is read or the signature checked
  // Feedback shares the dashboard's limiter, so the two doors together stay within one budget per login.
  const mcpFeedback = opts.feedbackLimiter ?? new RateLimiter(60, 3600_000);
  // list_repos and list_fixups aggregate the mirror like the dashboard's expensive GETs: a burst, then 30 a minute, per login.
  const mcpExpensive = new TokenBucket(20, 0.5);
  const callbackUrl = `${config.baseUrl ?? ""}/auth/callback`;
  let lastPrune = 0;

  function clientIp(req: IncomingMessage): string {
    if (config.trustProxy) {
      const xff = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (xff.length) return xff[xff.length - 1]!;
    }
    return req.socket.remoteAddress ?? "?";
  }

  function secure(headers: Record<string, string | string[]>, csp: string): Record<string, string | string[]> {
    headers["content-security-policy"] = csp;
    headers["x-frame-options"] = "DENY";
    headers["referrer-policy"] ??= "same-origin";
    headers["x-content-type-options"] = "nosniff";
    headers["cross-origin-opener-policy"] = "same-origin";
    headers["cross-origin-resource-policy"] = "same-origin";
    headers["permissions-policy"] = "camera=(), microphone=(), geolocation=()";
    if (config.baseUrl?.startsWith("https:")) headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
    return headers;
  }

  function send(res: ServerResponse, nonce: string, r: Res, extraCookies: string[] = []): void {
    const status = r.status ?? (r.redirect ? 303 : 200);
    const headers: Record<string, string | string[]> = { ...r.headers };
    headers["cache-control"] ??= "no-store";
    // A handler may set its own policy (artifact downloads use `sandbox`).
    const csp = headers["content-security-policy"] as string | undefined;
    delete headers["content-security-policy"];
    secure(headers, csp ?? [
      "default-src 'none'", `script-src 'self' 'nonce-${nonce}'`, `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "form-action 'self'",
      "base-uri 'none'", "frame-ancestors 'none'",
    ].join("; "));
    if (extraCookies.length) headers["set-cookie"] = extraCookies;
    let body: string | Buffer = "";
    if (r.redirect) headers.location = r.redirect;
    if (r.html !== undefined) {
      headers["content-type"] ??= "text/html; charset=utf-8";
      body = r.html;
    } else if (r.body !== undefined) {
      body = r.body;
    } else if (r.json !== undefined) {
      headers["content-type"] ??= "application/json; charset=utf-8";
      body = JSON.stringify(r.json);
    }
    res.writeHead(status, headers);
    res.end(body);
  }

  const errorPage = (nonce: string, status: number, title: string, text: string): Res =>
    ({ status, html: plainPage(nonce, title, `<p>${esc(text)}</p><p><a href="/">Dashboard</a></p>`) });
  const apiError = (status: number, error: string): Res => ({ status, json: { error } });

  // A browser sends Origin on every POST it makes with fetch, and
  // Sec-Fetch-Site on current engines; either one from another site is refused.
  // Clients that send neither still need the CSRF header.
  function sameOrigin(req: IncomingMessage): boolean {
    const site = req.headers["sec-fetch-site"];
    if (site !== undefined && site !== "same-origin") return false;
    const origin = req.headers.origin;
    if (origin === undefined) return true;
    const expected = config.baseUrl ?? `http://${req.headers.host ?? ""}`;
    try {
      return origin === new URL(expected).origin;
    } catch {
      return false;
    }
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL, nonce: string, session: Session): Promise<void> {
    const method = req.method;
    const out = (r: Res, cookies?: string[]) =>
      send(res, nonce, { ...r, headers: { ...r.headers, [CSRF_HEADER]: session.csrf } }, cookies);
    if (method !== "GET" && method !== "POST" && method !== "PUT" && method !== "DELETE") return out(apiError(405, "method not allowed"));
    const writes = method !== "GET";
    let json: unknown;
    if (writes) {
      if (!sameOrigin(req)) return out(apiError(403, "cross-origin request refused"));
      if (!writeLimitSession.allow(session.idHash) || !writeLimitIp.allow(clientIp(req))) return out(apiError(429, "too many requests; wait a minute"));
      json = await readJson(req);
      if (!safeEqual(String(req.headers[CSRF_HEADER] ?? ""), session.csrf)) return out(apiError(403, "missing or wrong CSRF token"));
      if (url.pathname === "/api/signout") {
        deleteSession(db, parseCookies(req.headers.cookie).get(sessionCookie)!);
        if (localOwner) db.prepare("DELETE FROM native_signin_handoffs WHERE product = ? AND login = ?").run(localOwner.product, session.login);
        return send(res, nonce, { status: 204 }, [cookie(sessionCookie, "", 0)]);
      }
    }
    const { route, params, other } = match(routes, method, url.pathname);
    if (!route) return out(other ? apiError(405, "method not allowed") : apiError(404, "not found"));
    // Decided on the matched route, so every spelling of its path spends the same budget.
    if (!writes && route.expensive && (route.expensive === true || route.expensive(url.searchParams))) {
      const wait = expensiveGets.take(session.idHash);
      if (wait) return out({ status: 429, json: { error: "too many requests; wait a moment" }, headers: { "retry-after": String(wait) } });
    }
    if (route.operator && session.role !== "operator") return out(apiError(403, "operators only"));
    const r: Req = {
      method, path: url.pathname, params: params!, query: url.searchParams, form: new URLSearchParams(), json,
      user: makeUser(db, box, provider, session, writes, githubIdentity(db) === "app"),
      scope: route.scoped && !writes ? scopeOf(req) : null,
      csrf: session.csrf, nonce,
    };
    const res2 = await route.handler(db, r);
    // The writer sees its own change at once; other processes' writes arrive on the watcher's next read.
    if (writes) live.poke();
    return out(res2);
  }

  // GET /api/live: same session as /api, but no rate limit and no request timeout.
  function handleLive(req: IncomingMessage, res: ServerResponse, nonce: string, session: Session): void {
    if (live.full) return send(res, nonce, apiError(503, "too many live connections"));
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    const cookieId = parseCookies(req.headers.cookie).get(sessionCookie);
    const headers = secure({
      "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no",
      [CSRF_HEADER]: session.csrf,
    }, "default-src 'none'");
    res.writeHead(200, headers);
    live.add(res, () => loadSession(db, cookieId) !== null, session.idHash);
  }

  /** Under the app identity with no app keys, sign-in has nothing to go through: it is refused, never sent to the OAuth App. */
  const signInBlocked = (): boolean => githubIdentity(db) === "app" && !opts.provider && !config.devAuth && !config.secrets.app;
  const noAppPage = (nonce: string): Res => errorPage(nonce, 503, "Sign-in unavailable", "GitHub sign-in is set to the GitHub App, but no app keys are available. An operator must restore the app's keys or switch the GitHub identity back to the box account.");

  function startOAuth(returnTo: string, selectAccount: boolean, scopes?: string[], p: Provider = provider): { r: Res; cookies: string[] } {
    const state = randomToken(24), verifier = randomToken(48);
    db.prepare("INSERT INTO oauth_states (state, verifier, return_to, identity, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(state, verifier, returnTo, githubIdentity(db), new Date().toISOString());
    return {
      r: { redirect: p.authorizeUrl(state, pkceChallenge(verifier), callbackUrl, selectAccount, scopes) },
      cookies: [cookie(stateCookie, state, 600)],
    };
  }

  const setup = new OrgSetup({
    db, config, deps: appDeps, provider: setupProvider,
    startOAuth: (returnTo, scopes) => startOAuth(returnTo, true, scopes, setupProvider),
    sameOrigin: (req) => sameOrigin(req),
    readForm: readBody,
  });

  async function auth(req: IncomingMessage, url: URL, nonce: string, cookies: Map<string, string>): Promise<{ r: Res; cookies?: string[] }> {
    if (url.pathname === "/auth/native" || url.pathname === "/auth/native/finish") {
      if (!localOwner) return { r: errorPage(nonce, 404, "Not found", "No such sign-in method.") };
      if (!signinLimit.allow(clientIp(req))) return { r: errorPage(nonce, 429, "Too many attempts", "Wait a few minutes and try again.") };
      if (req.method === "GET" && url.pathname === "/auth/native") {
        return { r: { html: nativeHandoffPage(nonce, localOwner.product), headers: {
          "referrer-policy": "no-referrer",
          "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
        } } };
      }
      if (req.method !== "POST" || url.pathname !== "/auth/native/finish") return { r: apiError(405, "method not allowed") };
      if (req.headers.origin !== config.baseUrl || !sameOrigin(req)) return { r: apiError(403, "cross-origin request refused") };
      if (contentType(req) !== "application/x-www-form-urlencoded") return { r: apiError(415, "invalid sign-in form") };
      const form = new URLSearchParams((await readRaw(req, 512)).toString("utf8"));
      if ([...form.keys()].join(",") !== "code") return { r: apiError(400, "invalid sign-in form") };
      const id = consumeNativeHandoff(config, db, form.get("code") ?? "", req.headers["user-agent"]);
      if (!id) return { r: errorPage(nonce, 400, "Sign-in expired", "Use the installed native sign-in launcher again.") };
      if (String(req.headers.accept ?? "").split(",").some(type => type.trim().split(";", 1)[0] === "application/json")) return { r: { json: { ok: true }, headers: { "referrer-policy": "no-referrer" } }, cookies: [cookie(sessionCookie, id, SESSION_TTL / 1000)] };
      return { r: { redirect: "/", headers: { "referrer-policy": "no-referrer" } }, cookies: [cookie(sessionCookie, id, SESSION_TTL / 1000)] };
    }
    const ip = clientIp(req);
    const path = url.pathname;
    if (path.startsWith("/auth/setup") || path === "/auth/github-app/setup" || (path === "/auth/github-app/callback" && setup.ownsState(url.searchParams.get("state") ?? ""))) {
      if (!signinLimit.allow(ip)) return { r: errorPage(nonce, 429, "Too many attempts", "Wait a few minutes and try again.") };
      const out = await setup.handle(req, url, nonce, cookies, loadSession(db, cookies.get(sessionCookie))?.role === "operator");
      if (out) return out;
    }
    if (req.method === "GET" && path === "/auth/signin") {
      if (!signinLimit.allow(ip)) return { r: errorPage(nonce, 429, "Too many attempts", "Wait a few minutes and try again.") };
      const returnTo = safeReturnTo(url.searchParams.get("return_to"));
      if (loadSession(db, cookies.get(sessionCookie))) return { r: { redirect: returnTo } };
      if (signInBlocked()) return { r: noAppPage(nonce) };
      if (localOwner && (!config.secrets.githubClientId || !config.secrets.githubClientSecret)) {
        return { r: { html: plainPage(nonce, `${localOwner.product === "access" ? "ACCESS" : "Slipcurve"} Automation sign-in`, `<p>Use the installed ${localOwner.product === "access" ? "ACCESS" : "Slipcurve"} Automation launcher to verify your existing GitHub sign-in.</p><p><a href="slipcurve-app://open/${localOwner.product}-autocraft">Sign in to ${localOwner.product === "access" ? "ACCESS" : "Slipcurve"} Automation</a></p>`) } };
      }
      return startOAuth(returnTo, url.searchParams.get("select") === "1");
    }
    if (req.method === "GET" && path === "/auth/authorize-app") {
      if (!signinLimit.allow(ip)) return { r: errorPage(nonce, 429, "Too many attempts", "Wait a few minutes and try again.") };
      const returnTo = safeReturnTo(url.searchParams.get("return_to"));
      const s = loadSession(db, cookies.get(sessionCookie));
      if (!s) return { r: { redirect: `/auth/signin?${new URLSearchParams({ return_to: `/auth/authorize-app?${new URLSearchParams({ return_to: returnTo })}` })}` } };
      if (s.role !== "operator") return { r: errorPage(nonce, 403, "Not authorised", "Only operators authorize AutoCraft to act as them.") };
      const appProvider = appProviderNow();
      if (!appProvider) return { r: errorPage(nonce, 409, "No GitHub App", "No GitHub App is registered, so there is nothing to authorize.") };
      return startOAuth(`${AUTHORIZE_PREFIX}${returnTo}`, false, undefined, appProvider);
    }
    if (req.method === "GET" && path === "/auth/callback") {
      if (!signinLimit.allow(ip)) return { r: errorPage(nonce, 429, "Too many attempts", "Wait a few minutes and try again.") };
      const clear = [cookie(stateCookie, "", 0)];
      if (url.searchParams.get("error")) {
        return { r: errorPage(nonce, 400, "Sign-in cancelled", "GitHub sign-in did not complete."), cookies: clear };
      }
      const state = url.searchParams.get("state") ?? "";
      const code = url.searchParams.get("code") ?? "";
      const row = db.prepare("SELECT verifier, return_to, identity, created_at FROM oauth_states WHERE state = ?").get(state) as
        { verifier: string; return_to: string | null; identity: string | null; created_at: string } | undefined;
      const cookieState = cookies.get(stateCookie) ?? "";
      const stateOk = !!row && safeEqual(cookieState, state);
      if (stateOk) db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
      if (!row || !code || !stateOk || Date.now() - Date.parse(row.created_at) > 600_000) {
        return { r: errorPage(nonce, 400, "Sign-in expired", "Start again from the sign-in link."), cookies: clear };
      }
      const plainSignIn = !row.return_to?.startsWith("setup:") && !row.return_to?.startsWith(AUTHORIZE_PREFIX);
      // A sign-in finishes under the identity it started with; if that is no longer the current one, it starts again.
      const startedAs: "box" | "app" = row.identity === "app" ? "app" : row.identity === "box" ? "box" : githubIdentity(db);
      const changed = (): boolean => plainSignIn && startedAs !== githubIdentity(db);
      if (plainSignIn && signInBlocked()) return { r: noAppPage(nonce), cookies: clear };
      if (changed()) return { r: errorPage(nonce, 400, "Sign-in failed", "The GitHub identity changed during sign-in. Start again."), cookies: clear };
      let tokens: Tokens | null, who: GithubUser | null;
      try {
        const p = row.return_to?.startsWith("setup:") ? setupProvider : row.return_to?.startsWith(AUTHORIZE_PREFIX) ? (appProviderNow() ?? provider) : opts.provider || config.devAuth ? provider : providerFor(config, () => startedAs);
        tokens = await p.exchange(code, row.verifier, callbackUrl);
        who = tokens ? await p.identity(tokens.access) : null;
      } catch (e) {
        console.error(`sign-in: ${(e as Error).message}`);
        return { r: errorPage(nonce, 502, "Sign-in failed", "GitHub did not answer. Try again in a minute."), cookies: clear };
      }
      if (!tokens || !who) {
        return { r: errorPage(nonce, 400, "Sign-in failed", "GitHub did not accept the sign-in. Start again."), cookies: clear };
      }
      if (row.return_to?.startsWith("setup:")) {
        const out = await setup.signedIn(row.return_to, tokens, who, nonce, cookies);
        return { r: out.r, cookies: [...clear, ...(out.cookies ?? [])] };
      }
      if (row.return_to?.startsWith(AUTHORIZE_PREFIX)) {
        // "Act as you": only the user token is stored. The session and the sign-in are untouched.
        const s = loadSession(db, cookies.get(sessionCookie));
        if (!s || s.role !== "operator" || s.login.toLowerCase() !== who.login.toLowerCase() || checkGithubId(db, s.login, who.id) === "mismatch") {
          // The token belongs to an account that may not act here: end it before answering.
          void (appProviderNow() ?? provider).revoke(tokens.access).catch(() => {});
          return { r: errorPage(nonce, 403, "Not authorised", "Sign in to the dashboard as the GitHub account you authorize, then try again."), cookies: clear };
        }
        saveUserTokens(db, box, s.login, who.id, tokens);
        retryWaiting(db, s.login);
        audit(db, s.login, "github-app-authorize", s.login, { ip });
        return { r: { redirect: safeReturnTo(row.return_to.slice(AUTHORIZE_PREFIX.length)) }, cookies: clear };
      }
      const login = who.login;
      const access = getAccess(db, login);
      if (!access) {
        auditRefusedSignIn(db, login, { ip });
        return { r: errorPage(nonce, 403, "Not authorised", `The GitHub account ${login} is not on this dashboard's access list.`), cookies: clear };
      }
      if (checkGithubId(db, access.login, who.id) === "mismatch") {
        auditRefusedSignIn(db, login, { ip, reason: "github-id-mismatch" });
        return { r: errorPage(nonce, 403, "Not authorised", `The GitHub account ${login} is not the account that was added to this dashboard's access list.`), cookies: clear };
      }
      if (changed()) return { r: errorPage(nonce, 400, "Sign-in failed", "The GitHub identity changed during sign-in. Start again."), cookies: clear };
      const id = createSession(db, box, access.login, tokens, req.headers["user-agent"]);
      if (startedAs === "app") { saveUserTokens(db, box, access.login, who.id, tokens); retryWaiting(db, access.login); }
      audit(db, access.login, "sign-in", access.login, { ip });
      return {
        r: { redirect: safeReturnTo(row.return_to) },
        cookies: [...clear, cookie(sessionCookie, id, SESSION_TTL / 1000)],
      };
    }
    if (req.method === "POST" && path === "/auth/github-app/start") {
      if (!signinLimit.allow(ip)) return { r: errorPage(nonce, 429, "Too many attempts", "Wait a few minutes and try again.") };
      if (!sameOrigin(req)) return { r: errorPage(nonce, 403, "Refused", "This form was sent from another site.") };
      const form = await readBody(req);
      const s = loadSession(db, cookies.get(sessionCookie));
      if (!s) return { r: { redirect: `/auth/signin?${new URLSearchParams({ return_to: "/admin/github-app" })}` } };
      if (!safeEqual(form.get("csrf") ?? "", s.csrf)) return { r: errorPage(nonce, 403, "Refused", "The form expired. Reload the page and try again.") };
      return { r: startRegistration(db, config, req, form, nonce, s) };
    }
    if (req.method === "GET" && path === "/auth/github-app/callback") {
      if (!signinLimit.allow(ip)) return { r: errorPage(nonce, 429, "Too many attempts", "Wait a few minutes and try again.") };
      const s = loadSession(db, cookies.get(sessionCookie));
      if (!s) return { r: { redirect: `/auth/signin?${new URLSearchParams({ return_to: "/admin/github-app" })}` } };
      return { r: await finishRegistration(db, config, appDeps, url, nonce, s) };
    }
    if (req.method === "POST" && path === "/auth/signout") {
      if (!sameOrigin(req)) return { r: errorPage(nonce, 403, "Refused", "This form was sent from another site.") };
      const form = await readBody(req);
      const id = cookies.get(sessionCookie);
      const s = loadSession(db, id);
      if (s) {
        if (!safeEqual(form.get("csrf") ?? "", s.csrf)) return { r: errorPage(nonce, 403, "Refused", "The form expired. Reload the page and try again.") };
        deleteSession(db, id!);
        if (localOwner) db.prepare("DELETE FROM native_signin_handoffs WHERE product = ? AND login = ?").run(localOwner.product, s.login);
      }
      return { r: { redirect: "/auth/signed-out" }, cookies: [cookie(sessionCookie, "", 0)] };
    }
    if (req.method === "GET" && path === "/auth/signed-out") {
      return { r: { html: plainPage(nonce, "Signed out", `<p class="muted">You are signed out of the dashboard on this device.</p><p><a class="button" href="/auth/signin?select=1">Sign in again</a></p>`) } };
    }
    if (req.method === "GET" && path === "/auth/dev/authorize" && provider instanceof FakeProvider) {
      const q = url.searchParams;
      if (q.get("redirect_uri") !== callbackUrl) return { r: errorPage(nonce, 400, "Bad request", "Unknown redirect_uri.") };
      const login = q.get("login");
      if (login !== null) {
        if (!LOGIN.test(login)) return { r: errorPage(nonce, 400, "Bad request", "Not a GitHub login.") };
        const code = provider.issueCode(login, q.get("code_challenge") ?? "", callbackUrl);
        return { r: { redirect: `${callbackUrl}?${new URLSearchParams({ code, state: q.get("state") ?? "" })}` } };
      }
      const hidden = ["state", "code_challenge", "redirect_uri"]
        .map((k) => `<input type="hidden" name="${k}" value="${esc(q.get(k))}">`).join("");
      return {
        r: {
          html: plainPage(nonce, "Development sign-in", `<p class="muted">Fake GitHub sign-in. Development only.</p>
<form method="get" action="/auth/dev/authorize">${hidden}<label>GitHub login <input name="login" required autofocus></label> <button>Sign in</button></form>`),
        },
      };
    }
    return { r: errorPage(nonce, 404, "Not found", "No such page.") };
  }

  /** A request with an operator's or maintainer's session: /healthz/checks gives them its times and counts. */
  const staffCaller = (req: IncomingMessage): boolean => {
    const role = loadSession(db, parseCookies(req.headers.cookie).get(sessionCookie))?.role;
    return role === "operator" || role === "maintainer";
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const folderHost = localOwner ? new URL(config.baseUrl!).host : `127.0.0.1:${config.port}`;
    if ((localOwner || process.platform === "win32" && config.host === "127.0.0.1" && config.baseUrl === `http://${folderHost}`) &&
        (req.headers.host !== folderHost || req.headers["x-forwarded-for"] !== undefined)) {
      const nonce = randomToken(16);
      return send(res, nonce, errorPage(nonce, 403, "Refused", "Open the AutoCraft folder URL on this computer."));
    }
    if (serveHealth(req, res, () => dbReady(db)) || serveChecks(req, res, db, Date.now(), 5_000, staffCaller)) return;
    const nonce = randomToken(16);
    try {
      if (Date.now() - lastPrune > 3_600_000) {
        lastPrune = Date.now();
        pruneExpired(db);
        if (localOwner) db.prepare("DELETE FROM native_signin_handoffs WHERE expires_at <= ?").run(Date.now());
        pruneTokens(db);
        void vault.sweepRevocations().catch(() => {});
      }
      // A revoked session's token is revoked at once, not at the next hourly sweep; failures are retried by that sweep.
      if (db.prepare("SELECT 1 FROM user_token_revocations WHERE attempts = 0 LIMIT 1").get()) void vault.sweepRevocations(true).catch(() => {});
      // Dev auth lets anyone who reaches the port sign in as any login, so
      // a request that came through a proxy or under a public name is refused.
      if (config.devAuth && (req.headers["x-forwarded-for"] !== undefined || !isLoopbackHost(req.headers.host))) {
        return send(res, nonce, errorPage(nonce, 403, "Refused", "Development sign-in answers only on localhost."));
      }
      const url = new URL(req.url ?? "/", "http://dashboard.invalid");
      const cookies = parseCookies(req.headers.cookie);
      if (url.pathname.startsWith("/auth/")) {
        const { r, cookies: set } = await auth(req, url, nonce, cookies);
        return send(res, nonce, r, set);
      }
      if (url.pathname === "/mcp") return await handleMcpHttp(req, res);
      if (url.pathname === WEBHOOK_PATH) return await handleWebhook(req, res);
      const method = req.method;
      // Public: the Discord bot's privacy notice must be readable by people who are not dashboard users.
      if (method === "GET" && url.pathname === DISCORD_PRIVACY_PATH) return send(res, nonce, { html: discordPrivacyPage(nonce, contactOf(db)) });
      // Public: a Discord reporter's GitHub sign-in for filing issues (no dashboard session).
      if (FILING_IN_DISCORD && method === "GET" && (url.pathname === REPORTER_START_PATH || url.pathname === REPORTER_CALLBACK_PATH)) {
        if (!signinLimit.allow(clientIp(req))) return send(res, nonce, errorPage(nonce, 429, "Too many attempts", "Wait a few minutes and try again."));
        const out = await reporterSignIn({ db, box, provider: appProviderNow(), baseUrl: config.baseUrl }, url, cookies, nonce);
        if (out) return send(res, nonce, out.r, out.cookies);
      }
      if (method === "GET" && url.pathname === DISCORD_TERMS_PATH) return send(res, nonce, { html: discordTermsPage(nonce, contactOf(db)) });
      // Public: the favicon and the preview image, which sign-in pages and link-preview crawlers load without a session.
      if (method === "GET" && PUBLIC_FILES.has(url.pathname)) return await sendWeb(res, nonce, url.pathname);
      const session = loadSession(db, cookies.get(sessionCookie));
      if (!session) {
        const wantsPage = method === "GET" && /text\/html/.test(String(req.headers.accept ?? ""));
        if (wantsPage) {
          // A page with preview tags that moves on to sign-in at once: link-preview crawlers read the tags and stop here,
          // where a redirect would take them to the identity provider's page and its preview.
          const to = `/auth/signin?${new URLSearchParams({ return_to: url.pathname + url.search })}`;
          return send(res, nonce, { html: plainPage(nonce, "Sign in", `<p><a class="button" href="${esc(to)}">Sign in with GitHub</a></p>`,
            `<meta http-equiv="refresh" content="0;url=${esc(to)}">${previewTags(config.baseUrl, url.pathname)}`) });
        }
        return send(res, nonce, { status: 401, json: { error: "sign-in required" } });
      }
      if (method === "GET" && url.pathname === "/api/live") return handleLive(req, res, nonce, session);
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url, nonce, session);
      if (url.pathname === "/img") return await sendImage(req, res, url, session);
      // Every other address belongs to the React app, which routes on the client.
      if (method === "GET") return await sendWeb(res, nonce, url.pathname);
      return send(res, nonce, errorPage(nonce, 405, "Not allowed", "This address does not accept that request."));
    } catch (e) {
      const api = (req.url ?? "").startsWith("/api/");
      if (e instanceof HttpError) return send(res, nonce, api ? apiError(e.status, e.message) : errorPage(nonce, e.status, "Request refused", e.message));
      console.error(`${req.method} ${(req.url ?? "").split("?")[0]}: ${(e as Error).stack ?? e}`);
      if (!res.headersSent) send(res, nonce, api ? apiError(500, "server error; it is logged") : errorPage(nonce, 500, "Something went wrong", "The error is logged on the server."));
      else res.destroy();
    }
  }

  // POST /mcp: one JSON-RPC message, authenticated by an agent token (Authorization: Bearer), never by the session
  // cookie, so a browser page cannot make a signed-in user's browser call it. A request from a browser
  // context on another site (Origin or Sec-Fetch-Site) is refused, which also covers DNS rebinding.
  // GitHub App deliveries: no session and no CSRF check; the HMAC signature over the raw body is the authentication.
  async function handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const reply = (status: number, allow?: string): void => {
      res.writeHead(status, secure({ "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", ...(allow ? { allow } : {}) }, "default-src 'none'"));
      res.end("");
    };
    if (req.method !== "POST") return reply(405, "POST");
    if (!webhookLimitIp.allow(clientIp(req))) return reply(429);
    let raw: Buffer;
    try {
      raw = await readRaw(req, WEBHOOK_BODY_LIMIT);
    } catch (e) {
      if (e instanceof HttpError) return reply(e.status);
      throw e;
    }
    const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
    const v = handleDelivery(db, config.secrets.app?.webhookSecret ?? null, { signature: one(req.headers["x-hub-signature-256"]), event: one(req.headers["x-github-event"]) }, raw, safeEqual);
    return reply(v.status);
  }

  async function handleMcpHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const reply = (status: number, body: unknown, headers: Record<string, string> = {}): void => {
      res.writeHead(status, secure({ "cache-control": "no-store", ...(body === null ? {} : { "content-type": "application/json; charset=utf-8" }), ...headers }, "default-src 'none'"));
      res.end(body === null ? "" : JSON.stringify(body));
    };
    const rpcError = (code: number, message: string) => ({ jsonrpc: "2.0", id: null, error: { code, message } });
    if (req.method !== "POST") return reply(405, rpcError(-32000, "POST one JSON-RPC message; this server has no event stream"), { allow: "POST" });
    if (!sameOrigin(req)) return reply(403, rpcError(-32000, "cross-origin request refused"));
    const auth = String(req.headers.authorization ?? "");
    const caller = loadToken(db, /^Bearer\s+(\S+)$/i.exec(auth)?.[1]);
    // The per-address limit counts failed authentications only: behind a proxy every client shares one address.
    if (!caller && !mcpLimitIp.allow(clientIp(req))) return reply(429, rpcError(-32000, "too many requests; wait a minute"), { "retry-after": "60" });
    if (!caller) return reply(401, rpcError(-32001, "a valid AutoCraft agent token is required (Authorization: Bearer <token>); make one on the dashboard's Connect page"), { "www-authenticate": 'Bearer realm="autocraft"' });
    if (!mcpLimitToken.allow(caller.login.toLowerCase())) return reply(429, rpcError(-32000, "too many requests for this login; wait a minute"), { "retry-after": "60" });
    let msg: unknown;
    try {
      msg = await readJson(req);
    } catch (e) {
      if (e instanceof HttpError) return reply(e.status, rpcError(e.status === 400 ? -32700 : -32600, e.message));
      throw e;
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return reply(400, rpcError(-32600, "send one JSON-RPC message as an object; batches are not supported"));
    const m = msg as McpMsg;
    const out = await handleMcp({
      db, baseUrl: config.baseUrl, limiter: mcpFeedback, expensive: () => mcpExpensive.take(caller.login.toLowerCase()), canAnswer: answering.enabled && caller.canAnswer && (caller.role === "operator" || (caller.role === "maintainer" && maintainerWritesOn(db))),
      user: (forWrite) => userForLogin(db, box, provider, caller.login, caller.role, forWrite),
    }, m);
    if (mcpWrites(m)) live.poke();
    // A notification or a response from the client: accepted, nothing to say.
    if (!out) return reply(202, null);
    return reply(200, out);
  }

  async function sendImage(req: IncomingMessage, res: ServerResponse, url: URL, session: Session): Promise<void> {
    if (req.method !== "GET") {
      res.writeHead(405, secure({ "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }, "default-src 'none'"));
      return void res.end("method not allowed");
    }
    const ip = clientIp(req);
    // An image is served only when one of the repos whose text contains it is visible to this user.
    const raw = url.searchParams.get("u") ?? "";
    const href = allowedImage(raw)?.href;
    const owners = href ? imageIndex.reposOf(href) : [];
    if (owners.length) {
      const visible = new Set(await visibleTo(db, makeUser(db, box, provider, session, false, githubIdentity(db) === "app")));
      if (!owners.some((o) => visible.has(o))) {
        res.writeHead(404, secure({ "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }, "default-src 'none'"));
        return void res.end("not an image of a tracked repo");
      }
    }
    const r = await images.get(raw, () => imageLimit.allow(session.idHash) && imageLimitIp.allow(ip));
    if (r.status !== 200) {
      const retry: Record<string, string> = r.status === 429 ? { "retry-after": "10" } : {};
      res.writeHead(r.status, secure({ "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...retry }, "default-src 'none'"));
      return void res.end(r.error ?? "");
    }
    return sendFile(res, r.type!, "private, max-age=86400", "default-src 'none'", r.data!);
  }

  function sendFile(res: ServerResponse, type: string, cache: string, csp: string, data: Buffer): void {
    res.writeHead(200, secure({ "content-type": type, "cache-control": cache }, csp));
    res.end(data);
  }

  async function readDist(rel: string[]): Promise<Buffer | null> {
    const full = resolve(config.webDist, ...rel);
    const r = relative(config.webDist, full);
    if (!r || r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r)) return null;
    try {
      const real = await realpath(full);
      const root = await realpath(config.webDist);
      const rr = relative(root, real);
      if (!rr || rr === ".." || rr.startsWith(`..${sep}`) || isAbsolute(rr)) return null;
      return await readFile(real);
    } catch {
      return null;    // missing, or a directory
    }
  }

  // The frontend's build output: hashed files under /assets/ are cached for a
  // year; any other path gets index.html, never cached, so a new build is
  // picked up on the next load.
  async function sendWeb(res: ServerResponse, nonce: string, pathname: string): Promise<void> {
    const notFound = () => send(res, nonce, errorPage(nonce, 404, "Not found", "No such file."));
    const rel: string[] = [];
    for (const raw of pathname.split("/")) {
      let seg: string;
      try {
        seg = decodeURIComponent(raw);
      } catch {
        return notFound();
      }
      if (seg === "") continue;
      if (seg === "." || seg === ".." || /[\\/\0]/.test(seg)) return notFound();
      rel.push(seg);
    }
    const ext = rel.length ? /\.([a-z0-9]+)$/.exec(rel[rel.length - 1]!)?.[1] : undefined;
    if (rel[0] === "assets") {
      const data = ext && FILE_TYPES[ext] ? await readDist(rel) : null;
      if (!data) return notFound();
      return sendFile(res, FILE_TYPES[ext!]!, "private, max-age=31536000, immutable", "default-src 'none'", data);
    }
    if (rel.length === 1 && ext && FILE_TYPES[ext]) {
      const data = await readDist(rel);
      if (data) return sendFile(res, FILE_TYPES[ext]!, "private, max-age=3600", "default-src 'none'", data);
    }
    const index = await readDist(["index.html"]);
    if (!index) {
      return send(res, nonce, {
        status: 503,
        html: plainPage(nonce, "Frontend not built", `<p>The dashboard's frontend is not built: there is no <code>index.html</code> in the directory <code>AUTOCRAFT_WEB_DIST</code> names (default <code>web/dist</code> in the repo).</p>
<p>Build it with <code>pnpm -C web install</code> and <code>pnpm -C web build</code>, then reload.</p>`),
      });
    }
    return sendFile(res, "text/html; charset=utf-8", "no-store", APP_CSP, index);
  }

  return { handle, routes: opts.routes, provider, live, close: () => live.close() };
}

export async function startServer(opts: AppOptions): Promise<{ server: Server; url: string; app: ReturnType<typeof createApp>; close(): Promise<void> }> {
  const feedbackLimiter = opts.feedbackLimiter ?? new RateLimiter(60, 3600_000);
  const app = createApp({ ...opts, feedbackLimiter, routes: opts.routes ?? (await defaultRoutes(feedbackLimiter, opts.githubUserId)) });
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 15_000 }, (req, res) => void app.handle(req, res));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.config.port, opts.config.host, resolve);
  });
  const addr = server.address() as AddressInfo;
  const host = addr.family === "IPv6" ? `[${addr.address}]` : addr.address;
  return {
    server, app,
    url: `http://${host}:${addr.port}`,
    close: () => new Promise<void>((resolve) => {
      app.close();
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
