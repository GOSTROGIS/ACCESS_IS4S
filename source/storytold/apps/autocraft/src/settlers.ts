// Who may settle a decision (answer, undo their own answer, Backlog, press a conversation card). An operator always may.
// A maintainer may when `settings.maintainer_writes` is on, every repo the decision covers has the app's identity (the
// merges and closes then run as that person through the user lane, never as the box account) and the person has write
// permission on every one of those repos.
import type { DatabaseSync } from "node:sqlite";
import { githubIdentity } from "./github/identity.ts";
import { PERM_READ_TTL } from "./dash/server/sessions.ts";

export const MAINTAINER_WRITES_KEY = "maintainer_writes";

export const maintainerWritesOn = (db: DatabaseSync): boolean =>
  (db.prepare("SELECT value FROM main.settings WHERE key = ?").get(MAINTAINER_WRITES_KEY) as { value: string } | undefined)?.value === "1";

export function setMaintainerWrites(db: DatabaseSync, on: boolean): boolean {
  if (maintainerWritesOn(db) === on) return false;
  if (on) db.prepare("INSERT INTO main.settings (key, value) VALUES (?, '1') ON CONFLICT (key) DO UPDATE SET value = '1'").run(MAINTAINER_WRITES_KEY);
  else db.prepare("DELETE FROM main.settings WHERE key = ?").run(MAINTAINER_WRITES_KEY);
  return true;
}

/** SQL for the logins whose answers the pipeline acts on: operators, and maintainers while `maintainer_writes` is on. */
export const SETTLER_LOGINS_SQL = `(SELECT login FROM main.access WHERE role = 'operator'
  OR (role = 'maintainer' AND EXISTS (SELECT 1 FROM main.settings WHERE key = '${MAINTAINER_WRITES_KEY}' AND value = '1')))`;

export function settlerLogins(db: DatabaseSync): Set<string> {
  return new Set((db.prepare(`SELECT login FROM ${SETTLER_LOGINS_SQL}`).all() as { login: string }[]).map((r) => r.login));
}

/** Values read once per planner pass or response, so a loop over decisions does not query per decision. */
export type SettleMemo = { operators?: Set<string>; maintainers?: Set<string>; on?: boolean; app: Map<string, boolean>; write: Map<string, boolean> };
export const settleMemo = (): SettleMemo => ({ app: new Map(), write: new Map() });

const roles = (db: DatabaseSync, m: SettleMemo): void => {
  if (m.operators) return;
  const rows = db.prepare("SELECT login, role FROM main.access WHERE role IN ('operator', 'maintainer')").all() as { login: string; role: string }[];
  m.operators = new Set(rows.filter((r) => r.role === "operator").map((r) => r.login));
  m.maintainers = new Set(rows.filter((r) => r.role === "maintainer").map((r) => r.login));
  m.on = maintainerWritesOn(db);
};

/** At least one repo, and every repo has the app's identity, so a maintainer's GitHub writes run as that maintainer. */
export function allAppIdentity(db: DatabaseSync, repos: string[], m: SettleMemo = settleMemo()): boolean {
  return repos.length > 0 && repos.every((r) => {
    let v = m.app.get(r);
    if (v === undefined) m.app.set(r, (v = githubIdentity(db) === "app"));
    return v;
  });
}

const WRITE = "('write', 'maintain', 'admin')";

/** A cached write permission younger than PERM_READ_TTL: the pipeline never asks GitHub; the write itself reads the live permission again. */
function cachedWrite(db: DatabaseSync, login: string, repo: string, m: SettleMemo): boolean {
  const k = `${login}\n${repo}`;
  let v = m.write.get(k);
  if (v === undefined) {
    const row = db.prepare(`SELECT checked_at FROM main.repo_permissions WHERE login = ? AND repo = ? AND permission IN ${WRITE}`).get(login, repo) as { checked_at: string } | undefined;
    m.write.set(k, (v = !!row && Date.now() - Date.parse(row.checked_at) < PERM_READ_TTL));
  }
  return v;
}

/** The sync form for views and the planner: write permission from the cached `repo_permissions` value. */
export function canSettleCached(db: DatabaseSync, login: string, role: string, repos: string[], m: SettleMemo = settleMemo()): boolean {
  if (role === "operator") return true;
  roles(db, m);
  if (role !== "maintainer" || !m.on || !allAppIdentity(db, repos, m)) return false;
  return repos.every((r) => cachedWrite(db, login, r, m));
}

/** The request form: write permission is read live (the session's `canWrite`). An operator's write access is checked by the caller. */
export async function canSettle(db: DatabaseSync, user: { login: string; role: string; canWrite: (repo: string) => Promise<boolean> }, repos: string[]): Promise<boolean> {
  if (user.role === "operator") return true;
  if (user.role !== "maintainer" || !maintainerWritesOn(db) || !allAppIdentity(db, repos)) return false;
  const ok = await Promise.all(repos.map((r) => user.canWrite(r).catch(() => false)));
  return ok.every(Boolean);
}

/** The DB-side form for the pipeline: the login's current role, and the cached write permission for a maintainer. Write access is read live again when the write is made. */
export function settlesNow(db: DatabaseSync, login: string | null, repos: string[], m: SettleMemo = settleMemo()): boolean {
  if (!login) return false;
  roles(db, m);
  return m.operators!.has(login) || (m.maintainers!.has(login) && canSettleCached(db, login, "maintainer", repos, m));
}

/** SQL: `login` (an expression) is an operator, or a maintainer who settles on the repo expression (setting on, app identity, fresh cached write). */
export const settlesLoginSql = (login: string, repo: string): string => `(${login} IN (SELECT login FROM main.access WHERE role = 'operator')
  OR (${login} IN ${SETTLER_LOGINS_SQL}
    AND EXISTS (SELECT 1 FROM main.settings s WHERE s.key = 'github_identity' AND s.value = 'app')
    AND EXISTS (SELECT 1 FROM main.repo_permissions rp WHERE rp.login = ${login} AND rp.repo = ${repo} AND rp.permission IN ${WRITE}
      AND rp.checked_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${PERM_READ_TTL / 1000} seconds'))))`;

/**
 * SQL condition on a decisions row (`a` is its table name or alias): a disputed answer never counts. Otherwise its answer counts because its answerer is an operator, or a
 * maintainer while `maintainer_writes` is on and every repo the decision covers (its own and its batch items') has the app's
 * identity, so its merge or close is made as that person. Checked wherever the pipeline reads answers.
 */
export const settledBySql = (a: string): string => `(${a}.exec_state IS NOT 'disputed' AND (${a}.answered_by IN (SELECT login FROM main.access WHERE role = 'operator')
  OR (${a}.answered_by IN ${SETTLER_LOGINS_SQL}
    AND (${a}.repo IS NOT NULL OR json_array_length(CASE WHEN json_valid(${a}.items) THEN ${a}.items ELSE '[]' END) > 0)
    AND NOT EXISTS (SELECT 1 WHERE ${a}.repo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM main.settings s WHERE s.key = 'github_identity' AND s.value = 'app'))
    AND NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(${a}.items) THEN ${a}.items ELSE '[]' END) j
      WHERE json_extract(j.value, '$.repo') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM main.settings s WHERE s.key = 'github_identity' AND s.value = 'app')))))`;

/** The same check for one loaded decision row. */
export function settledBy(db: DatabaseSync, d: { answered_by: string | null; repo: string | null; items: string | null; exec_state?: string | null }, m: SettleMemo = settleMemo()): boolean {
  if (!d.answered_by || d.exec_state === "disputed") return false;
  roles(db, m);
  if (m.operators!.has(d.answered_by)) return true;
  if (!m.maintainers!.has(d.answered_by) || !m.on) return false;
  let items: { repo: string }[] = [];
  try { items = JSON.parse(d.items ?? "[]"); } catch { /* none */ }
  return allAppIdentity(db, [...new Set([...(d.repo ? [d.repo] : []), ...items.map((i) => i.repo)])], m);
}

/**
 * SQL condition on a decisions row (`a`: its table name or alias): `login` with `role` settles it, as `canSettleCached` decides for one row. An operator
 * settles everything. A maintainer needs `maintainer_writes` on, and for the decision's repo and every batch item's repo the app's identity and a fresh
 * cached write permission. Anyone else settles nothing.
 */
export function canSettleSql(login: string, role: string, a = "decisions"): string {
  if (role === "operator") return "1";
  if (role !== "maintainer") return "0";
  const me = `'${login.replace(/'/g, "''")}'`;
  const ok = (repo: string): string => `(EXISTS (SELECT 1 FROM main.settings s WHERE s.key = 'github_identity' AND s.value = 'app')
    AND EXISTS (SELECT 1 FROM main.repo_permissions rp WHERE rp.login = ${me} AND rp.repo = ${repo} AND rp.permission IN ${WRITE}
      AND rp.checked_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${PERM_READ_TTL / 1000} seconds')))`;
  return `(EXISTS (SELECT 1 FROM main.settings WHERE key = '${MAINTAINER_WRITES_KEY}' AND value = '1')
    AND (${a}.repo IS NOT NULL OR json_array_length(CASE WHEN json_valid(${a}.items) THEN ${a}.items ELSE '[]' END) > 0)
    AND (${a}.repo IS NULL OR ${ok(`${a}.repo`)})
    AND NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(${a}.items) THEN ${a}.items ELSE '[]' END) j
      WHERE json_extract(j.value, '$.repo') IS NOT NULL AND NOT ${ok("json_extract(j.value, '$.repo')")}))`;
}
