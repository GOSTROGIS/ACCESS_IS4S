// The dashboard's access list. The Access API and the CLI both write through
// these functions, so every change ends the login's sessions and is audited.
import { MAINTAINER_WRITES_KEY, maintainerWritesOn, setMaintainerWrites } from "./settlers.ts";
import type { DatabaseSync } from "node:sqlite";
import { connect } from "./db.ts";
import { audit } from "./dash/audit.ts";
import type { Role } from "./dash/types.ts";
import { endAnswerTokens, endTokens } from "./dash/mcp/tokens.ts";
import { dropUserTokens } from "./dash/server/user-tokens.ts";

export type AccessRow = { login: string; role: Role; added_by: string | null; added_at: string | null; note: string | null };

export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export const ROLES: readonly Role[] = ["operator", "maintainer", "viewer"];
export const isRole = (v: unknown): v is Role => (ROLES as readonly unknown[]).includes(v);

export class AccessError extends Error {}

export function listAccess(db: DatabaseSync): AccessRow[] {
  return db.prepare("SELECT login, role, added_by, added_at, note FROM access ORDER BY login COLLATE NOCASE").all() as AccessRow[];
}

// The access entry's GitHub id is stored when the entry is added (or, for an
// entry added without one, at the first sign-in). Sign-ins must present the
// same id: a login that was renamed or released and taken by someone else is
// not the person who was added.
export function checkGithubId(db: DatabaseSync, login: string, id: number): "ok" | "bound" | "mismatch" {
  const row = db.prepare("SELECT github_id FROM access WHERE login = ?").get(login) as { github_id: number | null } | undefined;
  if (!row) return "mismatch";
  if (row.github_id === null) {
    const r = db.prepare("UPDATE access SET github_id = ? WHERE login = ? AND github_id IS NULL").run(id, login);
    if (r.changes) return "bound";
    return checkGithubId(db, login, id);
  }
  return Number(row.github_id) === id ? "ok" : "mismatch";
}

export function getAccess(db: DatabaseSync, login: string): AccessRow | undefined {
  return db.prepare("SELECT login, role, added_by, added_at, note FROM access WHERE login = ?").get(login) as AccessRow | undefined;
}

function endSessions(db: DatabaseSync, login: string): number {
  db.prepare("DELETE FROM repo_permissions WHERE login = ?").run(login);
  return Number(db.prepare("DELETE FROM sessions WHERE login = ?").run(login).changes);
}

/** Org setup links are an operator's: they end when their creator stops being one (the link flow also checks the creator's role). */
function endSetupLinks(db: DatabaseSync, login: string): number {
  return Number(db.prepare("UPDATE github_setup_links SET revoked_at = ? WHERE created_by = ? COLLATE NOCASE AND revoked_at IS NULL AND used_at IS NULL")
    .run(new Date().toISOString(), login).changes);
}

function tx<T>(db: DatabaseSync, f: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = f();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function addLogin(db: DatabaseSync, by: string, login: string, role: Role, note: string | null, githubId: number | null = null): void {
  if (!LOGIN.test(login)) throw new AccessError(`not a GitHub login: ${JSON.stringify(login)}`);
  if (!isRole(role)) throw new AccessError(`role must be ${ROLES.join(", ")}`);
  tx(db, () => {
    if (getAccess(db, login)) throw new AccessError(`${login} is already on the access list`);
    db.prepare("INSERT INTO access (login, role, added_by, added_at, note, github_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(login, role, by, new Date().toISOString(), note || null, githubId);
    audit(db, by, "access-add", login, { role });
  });
}

// Refuses a change that would leave the dashboard without an operator. The
// dashboard applies it to every access write; the CLI doesn't, because only
// someone with a shell on the host runs it.
function keepAnOperator(db: DatabaseSync, row: AccessRow): void {
  if (row.role === "operator" && operatorCount(db) <= 1) throw new AccessError("That would leave no operator. Add another operator first.");
}

export type AccessWriteOptions = { keepOperator?: boolean };

export function removeLogin(db: DatabaseSync, by: string, login: string, opts: AccessWriteOptions = {}): void {
  tx(db, () => {
    const row = getAccess(db, login);
    if (!row) throw new AccessError(`${login} is not on the access list`);
    if (opts.keepOperator) keepAnOperator(db, row);
    db.prepare("DELETE FROM access WHERE login = ?").run(login);
    const sessions = endSessions(db, login);
    // Re-adding the login later must not bring its old agent tokens back.
    const mcpTokens = endTokens(db, login);
    // The GitHub App user token goes with the login; its grant is revoked at GitHub later (the vault's sweep).
    const userTokens = dropUserTokens(db, row.login);
    // A linked Discord account acts as the login (presses, alerts); the delete trigger takes the alert opt-ins with the links.
    // Matched in any letter case: the access list is, and the removal may name the login in another case than the link stores.
    const discordLinks = Number(db.prepare("DELETE FROM discord_links WHERE login = ? COLLATE NOCASE").run(row.login).changes);
    db.prepare("DELETE FROM discord_link_codes WHERE login = ? COLLATE NOCASE").run(row.login);
    const setupLinks = endSetupLinks(db, row.login);
    audit(db, by, "access-remove", row.login, { role: row.role, sessions, ...(mcpTokens ? { mcpTokens } : {}), ...(userTokens ? { userTokens } : {}), ...(discordLinks ? { discordLinks } : {}), ...(setupLinks ? { setupLinks } : {}) });
  });
}

const RANK: Record<Role, number> = { viewer: 0, maintainer: 1, operator: 2 };

export function setRole(db: DatabaseSync, by: string, login: string, role: Role, opts: AccessWriteOptions = {}): boolean {
  if (!isRole(role)) throw new AccessError(`role must be ${ROLES.join(", ")}`);
  return tx(db, () => {
    const row = getAccess(db, login);
    if (!row) throw new AccessError(`${login} is not on the access list`);
    if (row.role === role) return false;
    if (opts.keepOperator) keepAnOperator(db, row);
    db.prepare("UPDATE access SET role = ? WHERE login = ?").run(role, login);
    const sessions = endSessions(db, login);
    // A lowered role ends the login's answering tokens: they would work again if the login is promoted again.
    const answerTokens = RANK[role] < RANK[row.role] ? endAnswerTokens(db, login) : 0;
    // A role change ends the sessions, so the login's GitHub App user token goes too and the next sign-in makes a new one.
    const userTokens = dropUserTokens(db, row.login);
    const setupLinks = role === "operator" ? 0 : endSetupLinks(db, row.login);
    audit(db, by, "access-role", row.login, { from: row.role, to: role, sessions, ...(answerTokens ? { answerTokens } : {}), ...(userTokens ? { userTokens } : {}), ...(setupLinks ? { setupLinks } : {}) });
    return true;
  });
}

export function operatorCount(db: DatabaseSync): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM access WHERE role = 'operator'").get() as { n: number }).n);
}

const USAGE = "usage: autocraft access list | add <login> [--operator|--maintainer] [--note TEXT] | remove <login> | role <login> operator|maintainer|viewer | maintainer-writes [on|off]";

function run(args: string[]): void {
  const [sub, login, ...rest] = args;
  const db = connect();
  try {
    switch (sub) {
      case "list": {
        const rows = listAccess(db);
        if (!rows.length) console.log("access list is empty");
        for (const r of rows) {
          console.log(`${r.login.padEnd(40)} ${r.role.padEnd(10)} added ${r.added_at?.slice(0, 10) ?? "-"} by ${r.added_by ?? "-"}${r.note ? `  ${r.note}` : ""}`);
        }
        return;
      }
      case "add": {
        if (!login) break;
        let role: Role = "viewer";
        let note: string | null = null;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === "--operator") role = "operator";
          else if (rest[i] === "--maintainer") role = "maintainer";
          else if (rest[i] === "--note" && i + 1 < rest.length) note = rest[++i]!;
          else throw new AccessError(`unknown argument ${rest[i]}\n${USAGE}`);
        }
        addLogin(db, "cli", login, role, note);
        console.log(`added ${login} as ${role}`);
        return;
      }
      case "maintainer-writes": {
        // Maintainers with write access settle decisions on repos that use the app's identity (src/settlers.ts).
        if (login === undefined) {
          console.log(`maintainer-writes: ${maintainerWritesOn(db) ? "on" : "off"}`);
          return;
        }
        if (login !== "on" && login !== "off") break;
        const changed = setMaintainerWrites(db, login === "on");
        if (changed) audit(db, "cli", "maintainer-writes", MAINTAINER_WRITES_KEY, { value: login });
        console.log(changed ? `maintainer-writes: ${login}` : `maintainer-writes was already ${login}`);
        return;
      }
      case "remove":
        if (!login) break;
        removeLogin(db, "cli", login);
        console.log(`removed ${login}; their sessions are ended`);
        return;
      case "role": {
        const role = rest[0];
        if (!login || !isRole(role)) break;
        setRole(db, "cli", login, role);
        console.log(`${login} is ${role}; their sessions are ended`);
        return;
      }
    }
    throw new AccessError(USAGE);
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

export const commands = {
  access: { summary: "dashboard access list: list | add <login> [--operator|--maintainer] [--note] | remove <login> | role <login> operator|maintainer|viewer | maintainer-writes [on|off]", run },
};
