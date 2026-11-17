// The org setup link: an operator creates a one-time link for an organization;
// the org's owner opens it without a dashboard account, signs in with GitHub,
// creates the GitHub App in the org, optionally makes the operator an app
// manager, and installs the app. The owner's token lives in memory for this
// flow only: never written to the database, a log line or an audit row.
import type { IncomingMessage } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { GithubSetupLink } from "../../../web/src/api/types.ts";
import { audit } from "../audit.ts";
import { AppError, appManifest, installationAccount, installUrl, registrationUrl, settingsUrl, type AppDeps } from "../../github/app.ts";
import { appManagerRole, orgOwnership } from "../../github/org-setup.ts";
import { grantOrgRole } from "../../github/write.ts";
import { envVar } from "../../env.ts";
import type { Res } from "../types.ts";
import type { Config } from "./config.ts";
import { randomToken, safeEqual, sha256hex } from "./crypto.ts";
import { convertAndStore, DEFAULT_APP_NAME, publicBase } from "./github-app.ts";
import type { GithubUser, Provider, Tokens } from "./provider.ts";
import { esc, plainPage } from "./util.ts";

export const SETUP_COOKIE = "__Host-craft_setup";
const LINK_TTL_MS = 7 * 86_400_000;
const FLOW_TTL_MS = 3_600_000;      // the owner's token is dropped after an hour at the latest, and the manifest code lives an hour
const ORG = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const OAUTH_PREFIX = "setup:";

type LinkRow = { id: string; org: string; created_by: string; created_at: string; expires_at: string; revoked_at: string | null; used_at: string | null };

// ---- Links (operator side) --------------------------------------------------

/** A new link for `org`. The URL path carries the secret and is returned only here; the database keeps its hash. */
export function createLink(db: DatabaseSync, operator: string, org: string): { link: GithubSetupLink; path: string } | null {
  if (!ORG.test(org)) return null;
  const id = randomToken(6), secret = randomToken(24), now = Date.now();
  const expires = new Date(now + LINK_TTL_MS).toISOString();
  db.prepare("INSERT INTO github_setup_links (id, org, created_by, hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, org, operator, sha256hex(secret), new Date(now).toISOString(), expires);
  audit(db, operator, "github-app-link-create", org, { id, expires });
  return { link: { id, org, createdBy: operator, createdAt: new Date(now).toISOString(), expiresAt: expires }, path: `/auth/setup/${secret}` };
}

export function revokeLink(db: DatabaseSync, operator: string, id: string): boolean {
  const r = db.prepare("UPDATE github_setup_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL AND used_at IS NULL").run(new Date().toISOString(), id);
  if (r.changes !== 1) return false;
  const l = db.prepare("SELECT org FROM github_setup_links WHERE id = ?").get(id) as { org: string };
  audit(db, operator, "github-app-link-revoke", l.org, { id });
  return true;
}

/** Links that can still be used, newest first. */
export function openLinks(db: DatabaseSync): GithubSetupLink[] {
  const rows = db.prepare(`SELECT id, org, created_by, created_at, expires_at FROM github_setup_links WHERE revoked_at IS NULL AND used_at IS NULL AND expires_at > ? AND ${BY_OPERATOR} ORDER BY created_at DESC`)
    .all(new Date().toISOString()) as LinkRow[];
  return rows.map((l) => ({ id: l.id, org: l.org, createdBy: l.created_by, createdAt: l.created_at, expiresAt: l.expires_at }));
}

/** A link works only while its creator is an operator on the access list. */
const BY_OPERATOR = "EXISTS (SELECT 1 FROM access a WHERE a.login = github_setup_links.created_by COLLATE NOCASE AND a.role = 'operator')";

const openLink = (db: DatabaseSync, where: "id" | "hash", value: string): LinkRow | null =>
  (db.prepare(`SELECT * FROM github_setup_links WHERE ${where} = ? AND revoked_at IS NULL AND used_at IS NULL AND expires_at > ? AND ${BY_OPERATOR}`).get(value, new Date().toISOString()) as LinkRow | undefined) ?? null;

// ---- The visitor's flow -----------------------------------------------------

type Flow = {
  id: string;                         // the cookie's value
  key: string;                        // what the OAuth state row carries instead of the cookie value
  linkId: string; org: string; operator: string; manager: boolean;
  login: string | null;               // set once GitHub confirmed the visitor owns the org
  token: string | null;               // memory only; kept just until the app-manager step ran
  manage: "done" | "fallback" | null;
};

type Reply = { r: Res; cookies?: string[] };

export type SetupDeps = {
  db: DatabaseSync; config: Config; deps: AppDeps;
  /** The OAuth App's provider: it issues the visitor's token and revokes it again. */
  provider: Provider;
  /** Starts the OAuth sign-in; the callback returns here with `returnTo`. */
  startOAuth: (returnTo: string, scopes: string[]) => Reply;
  sameOrigin: (req: IncomingMessage) => boolean;
  readForm: (req: IncomingMessage) => Promise<URLSearchParams>;
};

/** Statuses of the role calls that mean "do it on GitHub's settings page instead". */
const FALLBACK_STATUS = [401, 403, 404, 422];

export class OrgSetup {
  #d: SetupDeps;
  #flows = new Map<string, Flow>();
  #byKey = new Map<string, Flow>();
  constructor(d: SetupDeps) {
    this.#d = d;
  }

  /** True when `state` belongs to a setup link, so the GitHub callback is routed here instead of to a dashboard session. */
  ownsState(state: string): boolean {
    const row = this.#d.db.prepare("SELECT session_hash FROM github_app_states WHERE state = ?").get(state) as { session_hash: string } | undefined;
    return !!row && /^(link|install):/.test(row.session_hash);
  }

  #revoke(token: string): void {
    void this.#d.provider.revoke(token).catch(() => {});
  }

  /** Forgets a flow and revokes its token if it still holds one. */
  #drop(flow: Flow): void {
    this.#flows.delete(flow.id);
    this.#byKey.delete(flow.key);
    if (flow.token) this.#revoke(flow.token);
    flow.token = null;
  }

  async handle(req: IncomingMessage, url: URL, nonce: string, cookies: Map<string, string>, operatorSession: boolean): Promise<Reply | null> {
    const path = url.pathname, method = req.method;
    const seg = path.split("/");     // "", "auth", "setup", ...
    if (method === "GET" && path === "/auth/setup") return { r: this.#page(req, nonce, cookies) };
    if (method === "POST" && path === "/auth/setup/manager") return await this.#manager(req, nonce, cookies);
    if (method === "GET" && seg.length === 4 && seg[2] === "setup") return { r: this.#landing(seg[3]!, nonce) };
    if (method === "POST" && seg.length === 5 && seg[2] === "setup" && seg[4] === "signin") return await this.#signin(req, seg[3]!, nonce);
    if (method === "GET" && path === "/auth/github-app/callback") return { r: await this.#registered(url, nonce, cookies) };
    if (method === "GET" && path === "/auth/github-app/setup") return await this.#installed(url, nonce, operatorSession);
    return null;
  }

  // -- pages --

  #landing(secret: string, nonce: string): Res {
    const link = openLink(this.#d.db, "hash", sha256hex(secret));
    if (!link) return gone(nonce);
    const body = `<form method="post" action="/auth/setup/${esc(secret)}/signin">
<label class="check"><input type="checkbox" name="manager" value="1" checked> Make ${esc(link.created_by)} an app manager</label>
<button class="wide">Sign in with GitHub</button></form>`;
    return page(nonce, link.org, body);
  }

  async #signin(req: IncomingMessage, secret: string, nonce: string): Promise<Reply> {
    if (!this.#d.sameOrigin(req)) return { r: message(nonce, 403, "This form was sent from another site.") };
    const form = await this.#d.readForm(req);
    const link = openLink(this.#d.db, "hash", sha256hex(secret));
    if (!link) return { r: gone(nonce) };
    const flow: Flow = { id: randomToken(24), key: randomToken(16), linkId: link.id, org: link.org, operator: link.created_by, manager: form.get("manager") === "1", login: null, token: null, manage: null };
    this.#flows.set(flow.id, flow);
    this.#byKey.set(flow.key, flow);
    setTimeout(() => this.#drop(flow), FLOW_TTL_MS).unref();
    const out = this.#d.startOAuth(OAUTH_PREFIX + flow.key, flow.manager ? ["read:org", "admin:org"] : ["read:org"]);
    return { r: out.r, cookies: [...(out.cookies ?? []), `${SETUP_COOKIE}=${flow.id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${FLOW_TTL_MS / 1000}`] };
  }

  /** The OAuth callback for a setup flow: the visitor must own the org. The token is not kept unless the manager step needs it. */
  async signedIn(returnTo: string, tokens: Tokens, who: GithubUser, nonce: string, cookies: Map<string, string>): Promise<Reply> {
    const flow = this.#byKey.get(returnTo.slice(OAUTH_PREFIX.length));
    if (!flow || !safeEqual(cookies.get(SETUP_COOKIE) ?? "", flow.id) || !openLink(this.#d.db, "id", flow.linkId)) {
      this.#revoke(tokens.access);
      return { r: gone(nonce) };
    }
    let ownership: Awaited<ReturnType<typeof orgOwnership>>;
    try {
      ownership = await orgOwnership(tokens.access, flow.org, this.#d.deps);
    } catch (e) {
      console.error(`org setup: ${e instanceof AppError ? e.message : "membership check failed"}`);
      this.#revoke(tokens.access);
      return { r: message(nonce, 502, "GitHub did not answer. Open the link again in a minute.") };
    }
    if (ownership !== "owner") {
      this.#revoke(tokens.access);
      this.#drop(flow);
      return { r: ownership === "restricted"
        ? message(nonce, 403, `Grant the app access to ${flow.org} on GitHub's sign-in screen, then open the link again.`)
        : message(nonce, 403, `${who.login} is not an owner of ${flow.org} on GitHub.`) };
    }
    // Only a verified owner replaces the link's earlier flows, so a stranger with the link cannot cut an owner's flow short.
    for (const f of [...this.#flows.values()]) if (f.linkId === flow.linkId && f !== flow) this.#drop(f);
    flow.login = who.login;
    if (flow.manager) flow.token = tokens.access;
    else this.#revoke(tokens.access);
    return { r: { redirect: "/auth/setup" } };
  }

  #flowOf(cookies: Map<string, string>): Flow | null {
    const id = cookies.get(SETUP_COOKIE) ?? "";
    const flow = this.#flows.get(id);
    if (!flow || !flow.login || !safeEqual(id, flow.id)) return null;
    if (!openLink(this.#d.db, "id", flow.linkId)) {
      this.#drop(flow);
      return null;
    }
    return flow;
  }

  /** Why the app in the secrets file cannot serve this flow's org, or null when it can. */
  #foreignApp(flow: Flow): string | null {
    const app = this.#d.config.secrets.app;
    if (!app || app.owner?.login.toLowerCase() === flow.org.toLowerCase()) return null;
    return `AutoCraft's app belongs to ${app.owner?.login ?? "another account"}; transfer it or ask the operator.`;
  }

  #newState(kind: "link" | "install", flow: Flow): string {
    const { db } = this.#d, state = randomToken(24), tag = `${kind}:${flow.linkId}`;
    db.prepare("DELETE FROM github_app_states WHERE created_at <= ? OR session_hash = ?").run(new Date(Date.now() - FLOW_TTL_MS).toISOString(), tag);
    db.prepare("INSERT INTO github_app_states (state, login, session_hash, created_at) VALUES (?, ?, ?, ?)").run(state, flow.login!, tag, new Date().toISOString());
    return state;
  }

  #page(req: IncomingMessage, nonce: string, cookies: Map<string, string>): Res {
    const flow = this.#flowOf(cookies);
    if (!flow) return reopen(nonce);
    const { config } = this.#d, app = config.secrets.app;
    const foreign = this.#foreignApp(flow);
    if (foreign) return message(nonce, 409, foreign);
    const steps: string[] = [];
    const done = (label: string) => steps.push(`<li class="done">&#10003; ${esc(label)}</li>`);
    const later = (label: string) => steps.push(`<li class="later">${esc(label)}</li>`);
    const managerLabel = `Make ${flow.operator} an app manager`;
    if (app) done("Create GitHub App");
    else if (!config.secretsFile) return message(nonce, 409, "AUTOCRAFT_SECRETS_FILE is not set, so there is nowhere to keep the app's keys.");
    else {
      const name = envVar("GITHUB_APP_NAME") ?? DEFAULT_APP_NAME;
      const manifest = JSON.stringify(appManifest(name, publicBase(config, req)));
      steps.push(`<li><form method="post" action="${esc(registrationUrl(this.#newState("link", flow), flow.org))}"><input type="hidden" name="manifest" value="${esc(manifest)}"><button class="wide">Create GitHub App</button></form></li>`);
    }
    if (flow.manager) {
      if (flow.manage === "done") done(managerLabel);
      else if (flow.manage === "fallback" && app) steps.push(`<li><a class="button wide" href="${esc(settingsUrl(app.slug, app.owner))}">App managers &rarr; Grant ${esc(flow.operator)}</a></li>`);
      else if (app) steps.push(`<li><form method="post" action="/auth/setup/manager"><button class="wide">${esc(managerLabel)}</button></form></li>`);
      else later(managerLabel);
    }
    const managerOpen = flow.manager && flow.manage === null;
    if (app && !managerOpen) steps.push(`<li><a class="button wide" href="${esc(installUrl(app.slug))}?state=${encodeURIComponent(this.#newState("install", flow))}">Install</a></li>`);
    else later("Install");
    return page(nonce, flow.org, `<ol class="steps">${steps.join("")}</ol>`);
  }

  async #manager(req: IncomingMessage, nonce: string, cookies: Map<string, string>): Promise<Reply> {
    if (!this.#d.sameOrigin(req)) return { r: message(nonce, 403, "This form was sent from another site.") };
    const flow = this.#flowOf(cookies);
    if (!flow) return { r: reopen(nonce) };
    const foreign = this.#foreignApp(flow);
    if (foreign) return { r: message(nonce, 409, foreign) };
    if (!flow.manager || !flow.token) return { r: { redirect: "/auth/setup" } };
    const token = flow.token;
    try {
      const role = await appManagerRole(token, flow.org, this.#d.deps);
      if (!role) flow.manage = "fallback";
      else {
        await grantOrgRole({ db: this.#d.db, login: flow.login! }, { org: flow.org, user: flow.operator, role, token, apiBase: this.#d.deps.apiBase });
        flow.manage = "done";
      }
    } catch (e) {
      // 401, 403, 404 and 422 mean the org's plan, roles or the token's scope do not allow it: the settings page is the way. Anything else may pass on retry.
      if (!(e instanceof AppError) || !FALLBACK_STATUS.includes(e.status)) {
        console.error(`org setup: ${e instanceof AppError ? e.message : "app manager step failed"}`);
        return { r: message(nonce, 502, "GitHub did not answer. Go back and try again.", "/auth/setup") };
      }
      flow.manage = "fallback";
    }
    flow.token = null;
    this.#revoke(token);
    return { r: { redirect: "/auth/setup" } };
  }

  // -- GitHub's returns --

  /** The manifest flow's redirect: converts the code and stores the keys, as the dashboard's own registration does. */
  async #registered(url: URL, nonce: string, cookies: Map<string, string>): Promise<Res> {
    const state = url.searchParams.get("state") ?? "", code = url.searchParams.get("code") ?? "";
    const stale = "This registration is unknown, used or expired. Open the setup link again.";
    const flow = this.#flowOf(cookies);
    const row = this.#d.db.prepare("SELECT login, session_hash, created_at FROM github_app_states WHERE state = ?").get(state) as { login: string; session_hash: string; created_at: string } | undefined;
    if (!flow || !row || !code || row.session_hash !== `link:${flow.linkId}` || row.login !== flow.login || Date.now() - Date.parse(row.created_at) > FLOW_TTL_MS) return message(nonce, 400, stale);
    return await convertAndStore(this.#d.db, this.#d.config, this.#d.deps, code, state, nonce,
      { login: flow.login!, back: "/auth/setup", backLabel: "Back", redirect: "/auth/setup", org: flow.org, details: { org: flow.org, via: "setup-link" } }, stale);
  }

  /** The app's setup URL: GitHub returns here with the installation id, from a setup link or from an install started elsewhere. */
  async #installed(url: URL, nonce: string, operatorSession: boolean): Promise<Reply> {
    const { db, config } = this.#d;
    const state = url.searchParams.get("state") ?? "", id = Number(url.searchParams.get("installation_id"));
    const row = state ? db.prepare("SELECT login, session_hash, created_at FROM github_app_states WHERE state = ?").get(state) as { login: string; session_hash: string; created_at: string } | undefined : undefined;
    if (!row || !row.session_hash.startsWith("install:")) {
      // An install started from the admin page or on GitHub: the setup URL is in every manifest.
      return { r: operatorSession ? { redirect: "/admin/github-app" } : page(nonce, "AutoCraft", `<p class="done-text">Installed</p>`) };
    }
    db.prepare("DELETE FROM github_app_states WHERE state = ?").run(state);
    const link = Date.now() - Date.parse(row.created_at) > FLOW_TTL_MS ? null : openLink(db, "id", row.session_hash.slice("install:".length));
    if (!link) return { r: gone(nonce) };
    const retry = (status: number, text: string): Reply => ({ r: message(nonce, status, text, "/auth/setup") });
    const app = config.secrets.app;
    if (!app || !Number.isSafeInteger(id) || id <= 0) return retry(400, "GitHub did not install the app.");
    let account: string | null;
    try {
      account = await installationAccount(app, id, this.#d.deps);
    } catch (e) {
      console.error(`org setup: ${e instanceof AppError ? e.message : "installation check failed"}`);
      return retry(502, "GitHub did not answer. Go back and try again.");
    }
    if (account?.toLowerCase() !== link.org.toLowerCase()) return retry(409, `The app was installed on ${account ?? "another account"}, not ${link.org}. Install it on ${link.org}.`);
    db.prepare("UPDATE github_setup_links SET used_at = ?, used_by = ?, installation_id = ? WHERE id = ?").run(new Date().toISOString(), row.login, id, link.id);
    audit(db, row.login, "github-app-link-use", link.org, { id: link.id, installationId: id });
    for (const f of [...this.#flows.values()]) if (f.linkId === link.id) this.#drop(f);
    return { r: page(nonce, link.org, `<p class="done-text">Done</p>`) };
  }
}

// ---- Pages ------------------------------------------------------------------

const CSS = `ol.steps{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:10px}
.steps li{display:flex;align-items:center;min-height:44px;color:var(--muted)}.steps li.done{color:var(--fg)}
.steps li>form{width:100%}
form{margin:0}button.wide,a.button.wide{width:100%;min-height:48px;justify-content:center;font-size:16px}
label.check{display:flex;gap:12px;align-items:center;min-height:48px;margin:0 0 12px}
label.check input{width:22px;height:22px;min-height:0;margin:0;accent-color:var(--accent)}
.done-text{font-size:18px;font-weight:600;margin:16px 0 0}`;

// Forms post to this site and to GitHub (the manifest, and the sign-in redirect); no scripts beyond the theme snippet.
function page(nonce: string, title: string, body: string): Res {
  return {
    html: plainPage(nonce, title, `<style nonce="${nonce}">${CSS}</style>${body}`),
    headers: {
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action 'self' https://github.com; base-uri 'none'; frame-ancestors 'none'`,
    },
  };
}

const message = (nonce: string, status: number, text: string, back?: string): Res =>
  ({ ...page(nonce, "GitHub App", `<p>${esc(text)}</p>${back ? `<p><a href="${esc(back)}">Back</a></p>` : ""}`), status });

const reopen = (nonce: string): Res => message(nonce, 400, "Open the link again.");

const gone = (nonce: string): Res => message(nonce, 410, "This link has expired, was used or was revoked.");
