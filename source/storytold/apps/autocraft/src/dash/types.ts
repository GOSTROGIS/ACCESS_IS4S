// The contract between the server (auth, sessions, routing: src/dash/server/)
// and the API handlers (src/dash/api/). The server authenticates every request and
// checks CSRF on every POST before a handler runs.
import type { DatabaseSync } from "node:sqlite";

export type Role = "operator" | "maintainer" | "viewer";

export type User = {
  login: string;
  role: Role;
  // write, maintain or admin on <owner>/<repo>, checked against GitHub
  // (cached; re-checked when older than a minute). Handlers call this
  // before every decision write.
  canWrite(repo: string): Promise<boolean>;
  // Any permission but none on <owner>/<repo>, from the same cached check.
  canRead(repo: string): Promise<boolean>;
};

export type Req = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  params: Record<string, string>;   // from the route pattern, e.g. /item/:repo/:n
  query: URLSearchParams;
  form: URLSearchParams;            // POST body (application/x-www-form-urlencoded)
  json?: unknown;                   // POST body of an /api/ route (application/json)
  user: User;
  /** The one repo a `scoped` route's list is narrowed to (`x-autocraft-scope`), null on every other route; only ever hides more, see visibleRepos. */
  scope?: string | null;
  csrf: string;                     // the session's CSRF token
  nonce: string;                    // put on every <script> and <style> as nonce="..."
};

export type Res = {
  status?: number;                  // default 200
  html?: string;
  redirect?: string;                // 303 for POSTs
  json?: unknown;
  body?: Buffer;                    // raw bytes (artifact downloads); set content-type in headers
  headers?: Record<string, string>;
};

export type Route = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  pattern: string;                  // "/api/items/:repo/:n"
  operator?: boolean;               // server returns 403 unless user.role is operator
  /** A GET that aggregates the mirror or runs the embedder: it spends the session's expensive-GET budget (for the given query, when a function). */
  expensive?: true | ((query: URLSearchParams) => boolean);
  /** A GET list narrowed to the web app's picked project (`Req.scope`); every other route sees every repo the requester may see. */
  scoped?: true;
  handler: (db: DatabaseSync, req: Req) => Res | Promise<Res>;
};
