// Assigning an item to the pipeline's account while a stage works on it, and taking the assignment back when the stage
// gives up. The audit rows written by src/github/write.ts are the record of what we did: we unassign only what we assigned.
import type { DatabaseSync } from "node:sqlite";
import type { Querier } from "../mirror.ts";
import type { Grant } from "../core/guard.ts";
import { assignTo, unassignFrom, type Writer } from "./write.ts";
import { ownerOf } from "../owners.ts";

export type Me = { id: string; login: string };
export type Assignable = { id: string; state: string; assignees: string[] };

/** An issue's id, state and assignees, or null when it does not exist. */
export async function issueInfo(q: Querier, org: string, repo: string, number: number): Promise<Assignable | null> {
  const r = await q.query(`query($owner: String!, $name: String!, $n: Int!) { repository(owner: $owner, name: $name) { issue(number: $n) { id state assignees(first: 10) { nodes { login } } } } }`, { owner: org, name: repo, n: number }) as
    { repository?: { issue?: { id: string; state: string; assignees?: { nodes?: { login: string }[] } } | null } };
  const i = r.repository?.issue;
  return i ? { id: i.id, state: i.state, assignees: (i.assignees?.nodes ?? []).map((a) => a.login) } : null;
}

/** A pull request's id, state and assignees, or null when it does not exist. */
export async function pullRequestInfo(q: Querier, org: string, repo: string, number: number): Promise<Assignable | null> {
  const r = await q.query(`query($owner: String!, $name: String!, $n: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $n) { id state assignees(first: 10) { nodes { login } } } } }`, { owner: org, name: repo, n: number }) as
    { repository?: { pullRequest?: { id: string; state: string; assignees?: { nodes?: { login: string }[] } } | null } };
  const i = r.repository?.pullRequest;
  return i ? { id: i.id, state: i.state, assignees: (i.assignees?.nodes ?? []).map((a) => a.login) } : null;
}

/** True when the last assign or unassign in the audit for the item is an assignment of `login` that succeeded, made by a run whose id starts with `runPrefix` (any run when omitted). */
export function weAssigned(db: DatabaseSync, repo: string, number: number, login: string, runPrefix = ""): boolean {
  const last = db.prepare("SELECT action, details FROM audit WHERE target = ? AND action IN ('assign', 'unassign') AND COALESCE(details, '') NOT LIKE '%\"error\":%' ORDER BY rowid DESC LIMIT 1").get(`${repo}#${number}`) as { action: string; details: string | null } | undefined;
  if (last?.action !== "assign") return false;
  const d = JSON.parse(last.details ?? "{}") as { assignee?: string; run?: string };
  return d.assignee === login && (d.run ?? "").startsWith(runPrefix) && (!runPrefix || !!d.run);
}

/** Called by a stage when its work on an item starts: reads the item live and assigns `me` when it is open, nobody is assigned and the audit does not show that we assigned it (a person who removed us is final; our own unassign is not). A failure is logged and never stops the stage. Returns true when it assigned. */
export async function claimForWork(w: Writer, g: Grant, q: Querier, repo: string, number: number, kind: "pr" | "issue", who: Me | (() => Promise<Me | null>), details: Record<string, unknown> = {}, log: (line: string) => void = () => {}): Promise<boolean> {
  try {
    const me = typeof who === "function" ? await who() : who;
    if (!me) return false;
    const info = await (kind === "pr" ? pullRequestInfo(q, ownerOf(repo), repo, number) : issueInfo(q, ownerOf(repo), repo, number));
    if (!info || weAssigned(w.db, repo, number, me.login) || !(await claimItem(w, g, q, repo, number, info, me, details))) return false;
    log(`  ${repo}#${number}: assigned to ${me.login}`);
    return true;
  } catch (e) {
    log(`  ${repo}#${number}: could not assign: ${String((e as Error).message ?? e).replace(/\s+/g, " ").trim().slice(0, 200)}`);
    return false;
  }
}

/** Assigns the open item to `me` when nobody is assigned. Returns true when it did. */
export async function claimItem(w: Writer, g: Grant, q: Querier, repo: string, number: number, info: Assignable, me: Me, details: Record<string, unknown> = {}): Promise<boolean> {
  if (info.state !== "OPEN" || info.assignees.length) return false;
  await assignTo(w, g, q, { repo, number, id: info.id }, me, details);
  return true;
}

/** Removes our assignment when the audit shows we made it and we are still the only assignee. Returns true when it did. */
export async function releaseItem(w: Writer, g: Grant, q: Querier, repo: string, number: number, info: Assignable | null, me: Me, details: Record<string, unknown> = {}, runPrefix = ""): Promise<boolean> {
  if (!info || info.assignees.length !== 1 || info.assignees[0] !== me.login || !weAssigned(w.db, repo, number, me.login, runPrefix)) return false;
  await unassignFrom(w, g, q, { repo, number, id: info.id }, me, details);
  return true;
}
