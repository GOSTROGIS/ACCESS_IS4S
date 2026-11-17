import type { DatabaseSync } from "node:sqlite";

// An unauthenticated caller can make this row by signing in with any GitHub
// account, so it is written once per login per hour; later refusals add to the
// `refused` count in that row's details.
export function auditRefusedSignIn(db: DatabaseSync, login: string, details: Record<string, unknown>): void {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const last = db.prepare("SELECT rowid, details FROM audit WHERE action = 'sign-in-refused' AND login = ? AND at > ? ORDER BY at DESC LIMIT 1")
    .get(login, since) as { rowid: number; details: string | null } | undefined;
  if (!last) return audit(db, login, "sign-in-refused", login, { ...details, refused: 1 });
  let prev: Record<string, unknown> = {};
  try {
    prev = JSON.parse(last.details ?? "{}") as Record<string, unknown>;
  } catch { /* unreadable: start the count again */ }
  const refused = (typeof prev.refused === "number" ? prev.refused : 1) + 1;
  db.prepare("UPDATE audit SET details = ? WHERE rowid = ?").run(JSON.stringify({ ...prev, refused }), last.rowid);
}

export function audit(db: DatabaseSync, login: string, action: string, target: string | null, details?: unknown): void {
  db.prepare("INSERT INTO audit (at, login, action, target, details) VALUES (?, ?, ?, ?, ?)")
    .run(new Date().toISOString(), login, action, target, details === undefined ? null : JSON.stringify(details));
}
