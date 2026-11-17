// Binds each author login with PR history to the GitHub account id it belongs to, so a login that later passes to another account
// does not inherit the history (tiersOf reads author_ids). The sync binds ids as it writes rows; this step covers history written earlier.
import type { DatabaseSync } from "node:sqlite";
import { ownerOf } from "./owners.ts";
import type { Querier } from "./mirror.ts";

const BATCH = 40;

/** Logins whose merged or closed PRs count toward a tier and that have no bound account id. */
export function unboundLogins(db: DatabaseSync): string[] {
  return (db.prepare(`SELECT DISTINCT author FROM items WHERE kind = 'pr' AND author IS NOT NULL AND state IN ('MERGED','CLOSED')
    AND NOT EXISTS (SELECT 1 FROM author_ids a WHERE a.login = items.author) ORDER BY author`).all() as { author: string }[]).map((r) => r.author);
}

/**
 * The author account of `n` pull requests of one owner (`$owner`), passed as $r{i} (repository name) and $k{i} (number).
 * A deleted account reads as a null author.
 */
export function authorIdsQuery(n: number): string {
  const decl = Array.from({ length: n }, (_, i) => `, $r${i}: String!, $k${i}: Int!`).join("");
  const body = Array.from({ length: n }, (_, i) => `p${i}: repository(owner: $owner, name: $r${i}) { pullRequest(number: $k${i}) { author { __typename ... on User { databaseId } ... on Bot { databaseId } } } }`).join(" ");
  return `query($owner: String!${decl}) { rateLimit { cost remaining resetAt } ${body} }`;
}

/** Bound for an account GitHub no longer has: no later holder of the login is the same person. */
export const DELETED_ACCOUNT_ID = -1;

type Pr = { login: string; repo: string; number: number };

async function lookup(client: Querier, owner: string, prs: Pr[], out: Map<string, number>): Promise<void> {
  if (!prs.length) return;
  const vars: Record<string, string | number> = { owner };
  prs.forEach((p, i) => { vars[`r${i}`] = p.repo; vars[`k${i}`] = p.number; });
  try {
    const data = await client.query(authorIdsQuery(prs.length), vars);
    prs.forEach((p, i) => {
      const pr = data?.[`p${i}`]?.pullRequest;
      if (!pr) return;
      const id = pr.author?.databaseId;
      if (typeof id === "number") out.set(p.login, id);
      else if (pr.author === null) out.set(p.login, DELETED_ACCOUNT_ID);
    });
  } catch (e) {
    // A repository or pull request GitHub cannot find, or one the token may not read, fails the whole query: split until those
    // stand alone, and leave them unbound.
    const type = (e as { type?: string })?.type;
    if (type !== "NOT_FOUND" && type !== "FORBIDDEN") throw e;
    if (prs.length === 1) return;
    const mid = prs.length >> 1;
    await lookup(client, owner, prs.slice(0, mid), out);
    await lookup(client, owner, prs.slice(mid), out);
  }
}

/**
 * Binds the logins that have merged or closed PRs and no account id. A login can have passed to another account, so the id comes
 * from the login's own oldest merged or closed PR (what GitHub reports as its author), never from the login's current holder.
 * Ids stored on item rows are used only when every row of the login has one. One batched pass per owner; nothing when all are bound.
 */
export async function backfillAuthorIds(db: DatabaseSync, client: Querier | null): Promise<number> {
  const bind = db.prepare("INSERT OR IGNORE INTO main.author_ids (login, id) VALUES (?, ?)");
  let n = 0;
  const known = db.prepare(`SELECT author, author_id FROM items i WHERE author IS NOT NULL AND author_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM author_ids a WHERE a.login = i.author)
    AND NOT EXISTS (SELECT 1 FROM items j WHERE j.author = i.author AND j.author_id IS NULL)
    GROUP BY author ORDER BY MIN(created_at)`).all() as { author: string; author_id: number }[];
  for (const r of known) n += Number(bind.run(r.author, r.author_id).changes);
  const missing = new Set(unboundLogins(db));
  if (!client || !missing.size) return n;
  const oldest = (db.prepare(`SELECT author AS login, repo, number, MIN(created_at) AS first FROM items WHERE kind = 'pr' AND author IS NOT NULL AND state IN ('MERGED','CLOSED')
    GROUP BY author ORDER BY author`).all() as Pr[]).filter((p) => missing.has(p.login));
  const byOwner = new Map<string, Pr[]>();
  for (const p of oldest) (byOwner.get(ownerOf(p.repo)) ?? byOwner.set(ownerOf(p.repo), []).get(ownerOf(p.repo))!).push(p);
  const found = new Map<string, number>();
  const skipped: string[] = [];
  for (const [owner, prs] of byOwner) {
    try {
      for (let i = 0; i < prs.length; i += BATCH) await lookup(client, owner, prs.slice(i, i + BATCH), found);
    } catch (e) {
      // An owner no token can read (e.g. the app is not installed there) leaves its logins unbound; the other owners go on.
      if (!/not installed|FORBIDDEN|Resource not accessible/i.test(String((e as Error)?.message))) throw e;
      skipped.push(owner);
    }
  }
  if (skipped.length) console.log(`author ids: skipped ${skipped.join(", ")} (no readable token)`);
  for (const [login, id] of found) n += Number(bind.run(login, id).changes);
  return n;
}
