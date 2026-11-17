// The outside-author protections over JSON (src/outside.ts): the three numbers, and the operator's releases.
import { filtered, hiddenTest } from "../../hidden-sql.ts";
import type { DatabaseSync } from "node:sqlite";
import type { NeedsOutsideList } from "../../../web/src/api/types.ts";
import { OutsideError, releaseAuthor, releaseOutside, setOutsideLimits } from "../../outside.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { hiddenRepos, needVisible } from "./visible.ts";

const operator = (req: Req, what: string): void => {
  if (req.user.role !== "operator") throw new HttpError(403, `only operators ${what}`);
};

const wrap = <T>(f: () => T): T => {
  try {
    return f();
  } catch (e) {
    if (e instanceof OutsideError) throw new HttpError(e.status, e.message);
    throw e;
  }
};

/** Operator: sets the daily budgets and the surge threshold; 0 turns a protection off. */
export function putLimits(db: DatabaseSync, req: Req) {
  operator(req, "change the outside-author limits");
  return wrap(() => setOutsideLimits(db, req.user.login, req.json));
}

/** Operator: exempts one held item. */
export async function release(db: DatabaseSync, req: Req) {
  operator(req, "release an item");
  const repo = req.params.repo!;
  const n = Number(req.params.n);
  if (!Number.isInteger(n)) throw new HttpError(400, "not an item number");
  await needVisible(db, req, repo);
  wrap(() => releaseOutside(db, req.user.login, repo, n));
  return { ok: true };
}

/** Operator: exempts every item now held for one author. */
export function releaseAll(db: DatabaseSync, req: Req) {
  operator(req, "release items");
  const author = (req.json as { author?: unknown } | null)?.author;
  if (typeof author !== "string" || !/^[A-Za-z0-9\[\]-]{1,60}$/.test(author)) throw new HttpError(400, "author must be a login");
  return { released: wrap(() => releaseAuthor(db, req.user.login, author)) };
}

/** The items held for one author, oldest first. */
export async function held(db: DatabaseSync, req: Req): Promise<NeedsOutsideList> {
  const hidden = await hiddenRepos(db, req);
  const rows = db.prepare(`SELECT h.repo, h.number, h.kind, h.reason, i.title, i.created_at FROM main.outside_holds h LEFT JOIN items i ON i.repo = h.repo AND i.number = h.number
    WHERE h.author = ? COLLATE NOCASE${filtered(hidden) ? ` AND NOT (${hiddenTest("h.repo", hidden).sql})` : ""} ORDER BY i.created_at, h.number LIMIT 200`).all(req.params.author!, ...(filtered(hidden) ? hiddenTest("h.repo", hidden).args : [])) as { repo: string; number: number; kind: "pr" | "issue"; reason: "limit" | "surge"; title: string | null; created_at: string | null }[];
  return { rows: rows.map((r) => ({ id: `outside:${r.repo}#${r.number}`, repo: r.repo, number: r.number, title: r.title ?? "", kind: r.kind, reason: r.reason, createdAt: r.created_at })) };
}
