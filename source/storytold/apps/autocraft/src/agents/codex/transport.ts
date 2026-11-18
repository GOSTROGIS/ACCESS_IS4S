import { createHash, randomBytes } from "node:crypto";
import { createReadStream, lstatSync, readFileSync, realpathSync } from "node:fs";
import { request } from "node:http";
import { dirname, isAbsolute, posix } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { loadConfig, type Config } from "../../dash/server/config.ts";
import { TokenBox } from "../../dash/server/crypto.ts";
import { nativeOwner } from "../../dash/server/native-signin.ts";
import { openTokens, sessionEndsAt } from "../../dash/server/sessions.ts";
import { AppServerFailure } from "./rpc.ts";
import type { AccessLease, LeaseProvider } from "./external-auth.ts";

export type CodexProduct = "access" | "slipcurve";
export type CodexTransport = {
  schema: 1; product: CodexProduct; socket: string; brokerPort: number; accountSha256: string;
  binary: { path: string; version: string; sha256: string };
};
export const CODEX_VERSION = "0.167.0-alpha.4.1";
export const CODEX_BINARY_SHA256 = "c3dea068c8794f1764051c1fd182ff0524352bbddf2f2638e72386b9b7b74368";
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const shape = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const refuse = (): never => { throw new AppServerFailure("PROTOCOL"); };

/** Pure validation; neither the caller nor the first lease can choose the product or enroll an account. */
export function parseTransport(value: unknown, product: CodexProduct): CodexTransport {
  if (!object(value) || !shape(value, ["schema", "product", "socket", "brokerPort", "accountSha256", "binary"]) ||
      value.schema !== 1 || value.product !== product || typeof value.socket !== "string" || !value.socket.startsWith("/") ||
      value.socket.length > 100 || value.socket.includes("\0") || posix.normalize(value.socket) !== value.socket ||
      !Number.isInteger(value.brokerPort) || (value.brokerPort as number) < 1024 || (value.brokerPort as number) > 65535 ||
      typeof value.accountSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.accountSha256) || !object(value.binary) ||
      !shape(value.binary, ["path", "version", "sha256"]) || typeof value.binary.path !== "string" ||
      !value.binary.path.startsWith("/") || value.binary.path.includes("\0") || posix.normalize(value.binary.path) !== value.binary.path ||
      value.binary.version !== CODEX_VERSION || value.binary.sha256 !== CODEX_BINARY_SHA256) refuse();
  return value as CodexTransport;
}

/** Every ancestor must be real and non-writable by other users; private leaf files are owner-only. */
export function protectedPath(path: string, kind: "file" | "socket" | "binary"): string {
  if (process.platform !== "linux" || !process.getuid || !isAbsolute(path) || realpathSync(path) !== path) refuse();
  const uid = process.getuid!();
  for (let current = path;; current = dirname(current)) {
    const s = lstatSync(current);
    if (s.isSymbolicLink() || (s.uid !== uid && s.uid !== 0) || (s.mode & 0o022) !== 0) refuse();
    if (current === path) {
      if (kind === "socket" ? !s.isSocket() : !s.isFile()) refuse();
      if (kind !== "binary" && (s.uid !== uid || (s.mode & 0o077) !== 0)) refuse();
      if (kind === "file" && s.size > 16384) refuse();
      if (kind === "binary" && (s.mode & 0o111) === 0) refuse();
    } else if (!s.isDirectory()) refuse();
    const parent = dirname(current);
    if (parent === current) break;
  }
  return path;
}

export function loadTransport(config: Config, env: NodeJS.ProcessEnv = process.env): CodexTransport {
  try {
    const owner = nativeOwner(config), file = env.AUTOCRAFT_CODEX_TRANSPORT_FILE;
    if (!owner || !file) refuse();
    const transport = parseTransport(JSON.parse(readFileSync(protectedPath(file!, "file"), "utf8")), owner!.product);
    protectedPath(transport.socket, "socket");
    protectedPath(transport.binary.path, "binary");
    return transport;
  } catch { return refuse(); }
}

/** Uses only the currently bound native session, with no fallback to an older login. */
export function currentNativeSession(db: DatabaseSync, config: Config, product: CodexProduct, now = Date.now()): string {
  const owner = nativeOwner(config);
  if (!owner || owner.product !== product) refuse();
  const binding = db.prepare("SELECT value FROM settings WHERE key = ?").get(`native_cli_session.${product}`) as { value: string } | undefined;
  if (!binding || !/^[a-f0-9]{64}$/.test(binding.value)) refuse();
  const row = db.prepare(`SELECT s.login,s.token_enc,s.created_at,s.expires_at,a.role,a.github_id
    FROM sessions s JOIN access a ON a.login=s.login WHERE s.id_hash=?`).get(binding!.value) as
    { login: string; token_enc: string | null; created_at: string; expires_at: string; role: string; github_id: number | null } | undefined;
  if (!row || row.role !== "operator" || row.login.toLowerCase() !== owner!.login.toLowerCase() || row.github_id !== owner!.githubId ||
      !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.expires_at)) ||
      Date.parse(row.created_at) > now || Date.parse(row.expires_at) <= now || sessionEndsAt(row.created_at, "operator") <= now) refuse();
  const tokens = openTokens(new TokenBox(config.secrets.sessionKey), row!.token_enc, binding!.value);
  if (!tokens || typeof tokens.access !== "string" || !/^[\x21-\x7e]{20,4096}$/.test(tokens.access) ||
      (tokens.expiresAt !== null && (!Number.isFinite(tokens.expiresAt) || tokens.expiresAt <= now))) refuse();
  return binding!.value;
}

/** Hash the actual verified release artifact, never a PATH-resolved or provider-selected executable. */
export async function verifyBinary(transport: CodexTransport): Promise<void> {
  try {
    protectedPath(transport.binary.path, "binary");
    const hash = createHash("sha256");
    for await (const part of createReadStream(transport.binary.path)) hash.update(part);
    if (hash.digest("hex") !== transport.binary.sha256) refuse();
  } catch { refuse(); }
}

/** The native socket stays outside every model filesystem; access credentials travel only in bounded memory. */
export function leaseProvider(transport: CodexTransport, session: () => string): LeaseProvider {
  return async (previousAccountId, signal) => {
    if (signal.aborted) refuse();
    const sessionSha256 = session();
    protectedPath(transport.socket, "socket");
    const body = JSON.stringify({ product: transport.product, requestId: randomBytes(32).toString("base64url"),
      expiresAt: Date.now() + 8000, sessionSha256, ...(previousAccountId === null ? {} : { previousChatgptAccountId: previousAccountId }) });
    const value = await new Promise<AccessLease>((done, fail) => {
      const req = request({ socketPath: transport.socket, method: "POST", path: `/v1/lease/${transport.product}`, signal,
        headers: { Host: `127.0.0.1:${transport.brokerPort}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Connection: "close" } }, response => {
        const parts: Buffer[] = []; let bytes = 0;
        response.on("data", (part: Buffer) => { bytes += part.length; if (bytes > 65536) req.destroy(); else parts.push(part); });
        response.on("error", () => fail(new AppServerFailure("PROTOCOL")));
        response.on("end", () => {
          try {
            if (signal.aborted || response.statusCode !== 200 || response.headers["content-type"] !== "application/json" || bytes > 65536) refuse();
            const result: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
            if (!object(result) || !["accessToken", "chatgptAccountId", "expiresAt"].every(key => key in result) ||
                Object.keys(result).some(key => !["accessToken", "chatgptAccountId", "expiresAt", "chatgptPlanType"].includes(key))) refuse();
            done(result as AccessLease);
          } catch { fail(new AppServerFailure("PROTOCOL")); }
        });
      });
      req.setTimeout(7000, () => req.destroy());
      const clock = setTimeout(() => req.destroy(), 7500);
      req.once("close", () => clearTimeout(clock));
      req.on("error", () => fail(new AppServerFailure("PROTOCOL")));
      req.end(body);
    });
    if (signal.aborted || session() !== sessionSha256) refuse();
    return value;
  };
}

export function nativeTransport(db: DatabaseSync, env: NodeJS.ProcessEnv = process.env): { transport: CodexTransport; lease: LeaseProvider } {
  try {
    const config = loadConfig(env), transport = loadTransport(config, env);
    const bound = currentNativeSession(db, config, transport.product);
    return { transport, lease: leaseProvider(transport, () => {
      const current = currentNativeSession(db, config, transport.product);
      if (current !== bound) refuse();
      return current;
    }) };
  } catch { return refuse(); }
}
