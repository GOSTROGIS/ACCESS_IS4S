import { chmodSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomToken } from "./crypto.ts";
import { dbPath } from "../../db.ts";
import { defaultImageCacheDir } from "./images.ts";
import { envVar } from "../../env.ts";
import { windowsSecretAcl } from "./windows-secret-acl.ts";

// The GitHub App that AutoCraft registered through the manifest flow. The
// private key and client secret leave this object only to sign a JWT or to
// sign a user in; the webhook secret is stored but unused (webhooks are off).
export type AppSecrets = {
  id: string; slug: string; privateKey: string; clientId: string; clientSecret: string; webhookSecret: string | null;
  /** Who owns the app on GitHub (a user or an organization); null when unknown. */
  owner: AppOwner | null;
};
export type AppOwner = { login: string; type: "User" | "Organization" };
export type NativeOwner = { product: "access" | "slipcurve"; login: string; githubId: number };
export const NATIVE_ORIGINS = Object.freeze({ access: "http://127.0.0.2:8993", slipcurve: "http://127.0.0.3:8994" });
export type Secrets = { githubClientId: string | null; githubClientSecret: string | null; sessionKey: string; app: AppSecrets | null; nativeOwner?: NativeOwner | null };

/**
 * Makes `secrets.app` follow the secrets file: it is read again whenever the file changes (another process or a
 * registration may have rewritten it), so registering or removing the app takes effect without a restart. An
 * unreadable file keeps the last good value.
 */
export function followAppSecrets(secrets: Secrets, file: string): void {
  const stampOf = (): string => { try { const st = statSync(file); return `${st.ino}:${st.size}:${st.mtimeMs}`; } catch { return "none"; } };
  let cached = secrets.app;
  let stamp = stampOf();
  Object.defineProperty(secrets, "app", {
    enumerable: true, configurable: true,
    get(): AppSecrets | null {
      const now = stampOf();
      if (now !== stamp) {
        if (now === "none") { cached = null; stamp = now; }
        else {
          try { cached = appSecretsOf(readRawSecrets(file)); stamp = now; } catch { /* mid-write or unreadable: keep the last good value */ }
        }
      }
      return cached;
    },
    set(v: AppSecrets | null) { cached = v; stamp = stampOf(); },
  });
}

export type Config = {
  host: string;
  port: number;
  baseUrl: string | null;          // null only with dev auth, where every URL the server builds is relative
  dbPath: string;
  webDist: string;                 // the frontend's build output (web/dist)
  devAuth: boolean;
  devPermsFile: string | null;
  devTokenTtlMs: number | null;    // fake provider's access-token lifetime
  trustProxy: boolean;
  imageCacheDir: string | null;    // the image proxy's disk cache; null: none
  secrets: Secrets;
  secretsFile: string | null;      // where registration writes the app's secrets
};

export const DEFAULT_WEB_DIST = fileURLToPath(new URL("../../../web/dist", import.meta.url));

export class ConfigError extends Error {}

// Dev auth signs in as any login typed on a form, so it is for this machine
// only. Its default port differs from the real dashboard's, so a dev server
// never answers on the port a reverse proxy forwards to.
export const DEFAULT_LISTEN = "127.0.0.1:8993";
export const DEV_LISTEN = "127.0.0.1:8994";

export function parseListen(value: string): { host: string; port: number } {
  const m = /^(?:\[([0-9a-fA-F:.]+)\]|([^:\[\]]+)):(\d{1,5})$/.exec(value);
  if (!m) throw new ConfigError(`AUTOCRAFT_LISTEN must be host:port, got ${JSON.stringify(value)}`);
  const port = Number(m[3]);
  if (port > 65535) throw new ConfigError("AUTOCRAFT_LISTEN: port out of range");
  return { host: m[1] ?? m[2]!, port };
}

export function isLoopback(host: string): boolean {
  if (host === "localhost") return true;
  if (isIP(host) === 4) return host.split(".")[0] === "127";
  if (isIP(host) === 6) return host === "::1" || /^::ffff:127\./i.test(host);
  return false;
}

/** True when a Host header names this machine (with or without a port). */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const m = /^(?:\[([0-9a-fA-F:.]+)\]|([^:\[\]]+))(?::\d{1,5})?$/.exec(hostHeader.trim());
  return !!m && isLoopback(m[1] ?? m[2]!);
}

/** Refuses a secrets file that is missing or open to group or others. Every reader of the file checks it first. */
export function checkSecretsFileMode(path: string): void {
  let mode: number;
  try {
    mode = statSync(path).mode;
  } catch {
    throw new ConfigError("secrets file not found");
  }
  if (process.platform === "win32") {
    try { windowsSecretAcl("CheckFile", path); }
    catch { throw new ConfigError("secrets file failed the Windows ACL check; use the protected AutoCraft data folder"); }
    return;
  }
  if (mode & 0o077) throw new ConfigError("secrets file is readable or writable by group or others; chmod 600 it");
}

export function readSecrets(path: string | undefined): Secrets {
  if (!path) throw new ConfigError("AUTOCRAFT_SECRETS_FILE is not set");
  checkSecretsFileMode(path);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ConfigError("secrets file is not valid JSON");
  }
  const get = (k: string, min = 1): string => {
    const v = raw?.[k];
    if (typeof v !== "string" || v.length < min) throw new ConfigError(`secrets file: ${k} is missing or too short`);
    return v;
  };
  let nativeOwner: NativeOwner | null = null;
  if (raw.native_signin !== undefined) {
    const value = raw.native_signin as Record<string, unknown> | null;
    if (!value || !["access", "slipcurve"].includes(String(value.product)) ||
        typeof value.owner_login !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(value.owner_login) ||
        !Number.isSafeInteger(value.github_id) || Number(value.github_id) <= 0) throw new ConfigError("invalid protected native sign-in owner");
    nativeOwner = { product: value.product as NativeOwner["product"], login: value.owner_login, githubId: Number(value.github_id) };
  }
  const hasOAuth = raw.github_client_id !== undefined || raw.github_client_secret !== undefined;
  if (!hasOAuth && !nativeOwner) throw new ConfigError("real OAuth credentials or protected native sign-in configuration are required");
  return {
    githubClientId: hasOAuth ? get("github_client_id") : null,
    githubClientSecret: hasOAuth ? get("github_client_secret") : null,
    sessionKey: get("session_key", 32),
    app: appSecretsOf(raw),
    nativeOwner,
  };
}

/** The app's keys from a parsed secrets file; null unless all required ones are present. */
export function appSecretsOf(raw: Record<string, unknown>): AppSecrets | null {
  const opt = (k: string): string | null => (typeof raw?.[k] === "string" && (raw[k] as string).length > 0 ? (raw[k] as string) : null);
  const id = opt("github_app_id"), slug = opt("github_app_slug"), privateKey = opt("github_app_private_key");
  const clientId = opt("github_app_client_id"), clientSecret = opt("github_app_client_secret");
  if (!id || !slug || !privateKey || !clientId || !clientSecret) return null;
  const o = raw.github_app_owner as { login?: unknown; type?: unknown } | undefined;
  const owner: AppOwner | null = typeof o?.login === "string" && o.login && (o.type === "User" || o.type === "Organization") ? { login: o.login, type: o.type } : null;
  return { id, slug, privateKey, clientId, clientSecret, webhookSecret: opt("github_app_webhook_secret"), owner };
}

function readRawSecrets(path: string): Record<string, unknown> {
  if (process.platform === "win32") {
    try { statSync(path); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new ConfigError("secrets file cannot be accessed");
    }
    checkSecretsFileMode(path);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new ConfigError("secrets file is not valid JSON");
  }
}

/** A sibling of the target with a random name, created exclusively (`wx`) so it never follows or replaces an existing file. */
function writeTemp(target: string, body: string): string {
  const tmp = `${target}.${randomToken(6)}.tmp`;
  if (process.platform === "win32") windowsSecretAcl("CheckDirectory", dirname(target));
  try {
    writeFileSync(tmp, body, { mode: 0o600, flag: "wx" });
    if (process.platform === "win32") windowsSecretAcl("CheckFile", tmp);
    else chmodSync(tmp, 0o600);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* not created */ }
    throw e;
  }
  return tmp;
}

/** The file a write must replace: the secrets file itself, or the file a symlink there points to. */
function secretsTarget(path: string): string {
  try {
    if (process.platform === "win32") {
      statSync(path);
      checkSecretsFileMode(path);
      return path;
    }
    return realpathSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return path;
    throw e;
  }
}

/** Throws unless a later `writeAppSecrets` can succeed: the file parses and a temporary file can be created beside it. */
export function checkSecretsWritable(path: string): void {
  readRawSecrets(path);
  unlinkSync(writeTemp(secretsTarget(path), ""));
}

/**
 * Adds the app's keys to the secrets file through a temporary file in the same
 * directory and a rename, mode 0600. Other keys stay as they are, and a
 * symlinked secrets file stays a symlink.
 */
export function writeAppSecrets(path: string, app: AppSecrets): void {
  const target = secretsTarget(path);
  const next = {
    ...readRawSecrets(target),
    github_app_id: app.id, github_app_slug: app.slug, github_app_private_key: app.privateKey,
    github_app_client_id: app.clientId, github_app_client_secret: app.clientSecret, github_app_webhook_secret: app.webhookSecret ?? "",
    github_app_owner: app.owner,
  };
  const tmp = writeTemp(target, `${JSON.stringify(next, null, 2)}\n`);
  try {
    renameSync(tmp, target);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw e;
  }
}

/** Removes every `github_app_*` key from the file the same way: temporary file, rename, mode 0600. */
export function removeAppSecrets(path: string): void {
  const target = secretsTarget(path);
  const next = Object.fromEntries(Object.entries(readRawSecrets(target)).filter(([k]) => !k.startsWith("github_app_")));
  const tmp = writeTemp(target, `${JSON.stringify(next, null, 2)}\n`);
  try {
    renameSync(tmp, target);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw e;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const { host, port } = parseListen(envVar("LISTEN", env) ?? (envVar("DEV_AUTH", env) === "1" ? DEV_LISTEN : DEFAULT_LISTEN));
  const devAuth = envVar("DEV_AUTH", env) === "1";
  let secrets: Secrets;
  let baseUrl: string | null = null;
  if (devAuth) {
    if (!isLoopback(host)) throw new ConfigError("AUTOCRAFT_DEV_AUTH=1 is allowed only on a loopback listen address");
    // Dev sessions don't survive a restart: the key lives only in this process.
    secrets = { githubClientId: "dev", githubClientSecret: "dev", sessionKey: randomToken(), app: null };
  } else {
    secrets = readSecrets(envVar("SECRETS_FILE", env));
  }
  const secretsFile = envVar("SECRETS_FILE", env) ?? null;
  // A dev server reads the app's keys from a secrets file when one is given, so registration can be tried locally.
  if (devAuth && secretsFile) {
    let exists = false;
    try { statSync(secretsFile); exists = true; }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    if (exists) {
      checkSecretsFileMode(secretsFile);
      try { secrets.app = appSecretsOf(readRawSecrets(secretsFile)); }
      catch { /* allow registration to replace an invalid config */ }
    }
  }
  if (secretsFile) followAppSecrets(secrets, secretsFile);
  const rawBaseUrl = envVar("BASE_URL", env);
  if (rawBaseUrl) {
    let u: URL;
    try {
      u = new URL(rawBaseUrl);
    } catch {
      throw new ConfigError("AUTOCRAFT_BASE_URL is not a URL");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new ConfigError("AUTOCRAFT_BASE_URL must be http(s)");
    if (devAuth && (u.protocol !== "http:" || (u.hostname !== "localhost" && u.hostname !== "127.0.0.1"))) {
      throw new ConfigError("AUTOCRAFT_DEV_AUTH=1 allows AUTOCRAFT_BASE_URL only as an http://localhost or http://127.0.0.1 URL");
    }
    baseUrl = u.origin + u.pathname.replace(/\/+$/, "");
    if (baseUrl !== u.origin) throw new ConfigError("AUTOCRAFT_BASE_URL must not have a path");
  } else if (!devAuth) {
    throw new ConfigError("AUTOCRAFT_BASE_URL is not set");
  }
  if (secrets.nativeOwner) {
    const nativePort = secrets.nativeOwner.product === "access" ? 8993 : 8994;
    if (devAuth || host !== "127.0.0.1" || port !== nativePort || baseUrl !== NATIVE_ORIGINS[secrets.nativeOwner.product] || envVar("TRUST_PROXY", env) === "1") {
      throw new ConfigError("native sign-in requires its fixed product loopback origin without development authentication or proxy trust");
    }
  }
  const webDistEnv = envVar("WEB_DIST", env);
  return {
    host, port, baseUrl, devAuth, secrets, secretsFile,
    dbPath: envVar("DB", env) ?? dbPath(),
    webDist: webDistEnv ? resolve(webDistEnv) : DEFAULT_WEB_DIST,
    devPermsFile: devAuth ? (envVar("DEV_PERMS", env) ?? null) : null,
    devTokenTtlMs: devAuth && envVar("DEV_TOKEN_TTL", env) ? Number(envVar("DEV_TOKEN_TTL", env)) * 1000 || null : null,
    trustProxy: envVar("TRUST_PROXY", env) === "1",
    imageCacheDir: envVar("IMG_CACHE", env) === "" ? null : defaultImageCacheDir(env),
  };
}
