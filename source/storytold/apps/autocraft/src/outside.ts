// Protection of model spend from authors outside the team (docs/pipeline.md, "Outside authors").
//
// An outside author is an item's author who is not an operator or maintainer of the dashboard, not a GitHub Bot account (an app can open items only where it is installed),
// not a member, owner or collaborator of the repo (the mirror's author association), and not whitelisted (the Contributors page:
// an `allow` override or a whitelisted tier). A post-merge follow-up issue counts as an item of the merged PR's author. Two protections, each off at 0:
//   - Daily budget: of one outside author's items created in the last 24 hours, only the first `outside_prs_per_day` PRs and the
//     first `outside_issues_per_day` issues get model work. Later open ones wait until the window frees.
//   - Surge breaker: more than `outside_surge_per_hour` new outside-author items in the last hour trips the stage_trips row
//     `outside-surge`. Outside-author items created from an hour before the trip hold until an operator resumes it.
// An operator's Release exempts one item (or every held item of one author) from both holds.
//
// The planner calls refreshOutsideHolds() once per pass; it rewrites outside_holds. pilotSqlFor (src/pilot.ts) leaves a held item
// out of scope, so every stage that reads candidates through the pilot condition skips it. Sync, Embed and Rank do not use it.
import { filtered, hiddenTest, type HiddenRepos } from "./hidden-sql.ts";
import type { DatabaseSync } from "node:sqlite";
import { listAccess } from "./access.ts";
import { audit } from "./dash/audit.ts";
import { allOwnLogins } from "./github/identity.ts";
import type { OutsideHoldInfo } from "./core/plan.ts";
import { sinceOf, trip, tripRow } from "./push-outcomes.ts";
import { isWhitelisted } from "./whitelist.ts";
import { pipelineRepos } from "./pilot.ts";
import { isBotLogin } from "./review/bots.ts";

export const OUTSIDE_SURGE = "outside-surge";
export const KEYS = { prsPerDay: "outside_prs_per_day", issuesPerDay: "outside_issues_per_day", surgePerHour: "outside_surge_per_hour" } as const;
export type OutsideLimits = { prsPerDay: number; issuesPerDay: number; surgePerHour: number };
export const DEFAULT_LIMITS: OutsideLimits = { prsPerDay: 5, issuesPerDay: 5, surgePerHour: 30 };
const MAX = 100_000;
const DAY_MS = 24 * 3_600_000;
const HOUR_MS = 3_600_000;

export class OutsideError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function outsideLimits(db: DatabaseSync): OutsideLimits {
  const rows = db.prepare("SELECT key, value FROM main.settings WHERE key IN (?, ?, ?)").all(KEYS.prsPerDay, KEYS.issuesPerDay, KEYS.surgePerHour) as { key: string; value: string }[];
  const m = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const get = (k: string, d: number): number => { const v = m.get(k); return v !== undefined && Number.isInteger(v) && v >= 0 ? v : d; };
  return { prsPerDay: get(KEYS.prsPerDay, DEFAULT_LIMITS.prsPerDay), issuesPerDay: get(KEYS.issuesPerDay, DEFAULT_LIMITS.issuesPerDay), surgePerHour: get(KEYS.surgePerHour, DEFAULT_LIMITS.surgePerHour) };
}

/** Stores the three numbers (0 turns a protection off) and audits the change. */
export function setOutsideLimits(db: DatabaseSync, by: string, input: unknown): OutsideLimits {
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const was = outsideLimits(db);
  const next = { ...was };
  for (const k of Object.keys(KEYS) as (keyof OutsideLimits)[]) {
    if (b[k] === undefined) continue;
    const v = b[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX) throw new OutsideError(`${k} must be a whole number from 0 to ${MAX}`);
    next[k] = v;
  }
  const set = db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  for (const k of Object.keys(KEYS) as (keyof OutsideLimits)[]) set.run(KEYS[k], String(next[k]));
  if (JSON.stringify(was) !== JSON.stringify(next)) audit(db, by, "abuse-limits", "pipeline", { ...next, was });
  return next;
}

type Row = { repo: string; number: number; kind: string; author: string; author_id: number | null; state: string; created_at: string; author_association: string | null; author_type: string | null };
export type Hold = { repo: string; number: number; author: string; kind: "pr" | "issue"; reason: "limit" | "surge" };

const INSIDE_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/** GitHub Bot authors: the mirror's author type, or (rows synced before it was stored) a `[bot]` suffix or a known app login (the mirror stores app logins without the suffix). */
const isBotAuthor = (r: { author: string; author_type: string | null }): boolean =>
  r.author_type === "Bot" || (r.author_type === null && (isBotLogin(r.author) || r.author.toLowerCase() === "github-actions")) || r.author.endsWith("[bot]");

/** Once, on the first run: items that already have pipeline work (a decision, review, classification, stage row, fix-up, ...) count as admitted, so nothing in flight is held on deploy. */
function backfillAdmitted(db: DatabaseSync, since: string, now: number): void {
  if (db.prepare("SELECT 1 FROM main.settings WHERE key = 'outside_admitted_backfill'").get()) return;
  const has = ["decisions", "opus_reviews", "classifications", "fixups", "ci_fixes", "fix_attempts", "verifications", "pr_builds", "stages"].map((t) => `EXISTS (SELECT 1 FROM main.${t} x WHERE x.repo = i.repo AND x.number = i.number)`).join(" OR ");
  db.prepare(`INSERT OR IGNORE INTO main.outside_admitted (repo, number, at) SELECT i.repo, i.number, ? FROM items i WHERE i.created_at >= ? AND (${has})`).run(new Date(now).toISOString(), since);
  db.prepare("INSERT OR IGNORE INTO main.settings (key, value) VALUES ('outside_admitted_backfill', '1')").run();
}

/** Whether a PR or issue row is by an outside author: not a collaborator by association, not a bot, not an operator, maintainer or own pipeline login. `inside` may be passed when many rows are judged. */
export function isOutsideAuthor(db: DatabaseSync, r: { author: string | null; author_association: string | null; author_type: string | null }, inside: Set<string> = insiders(db)): boolean {
  if (!r.author) return false;
  return !INSIDE_ASSOCIATIONS.has(r.author_association ?? "") && !isBotAuthor({ author: r.author, author_type: r.author_type }) && !inside.has(r.author.toLowerCase());
}

/** Logins that are never outside authors: the dashboard's operators and maintainers and the pipeline's own accounts (lowercase). */
function insiders(db: DatabaseSync): Set<string> {
  const out = new Set<string>();
  for (const a of listAccess(db)) if (a.role === "operator" || a.role === "maintainer") out.add(a.login.toLowerCase());
  for (const l of allOwnLogins(db)) out.add(l.toLowerCase());
  return out;
}

export type OutsideRefresh = { holds: Hold[]; tripped: boolean; wakeAt: number | null };

/**
 * Recomputes the holds from the items created in the last 24 hours, evaluates the surge breaker and rewrites outside_holds
 * (only when the set changed). Returns the holds and the time the first hold can lapse.
 */
export function refreshOutsideHolds(db: DatabaseSync, now: number = Date.now()): OutsideRefresh {
  const lim = outsideLimits(db);
  const enabled = lim.prsPerDay > 0 || lim.issuesPerDay > 0 || lim.surgePerHour > 0;
  const holds: Hold[] = [];
  let wakeAt: number | null = null;
  const released = new Set((db.prepare("SELECT repo, number FROM main.outside_released").all() as { repo: string; number: number }[]).map((r) => `${r.repo}#${r.number}`));
  if (enabled) {
    const dayAgo = now - DAY_MS;
    const tripped = lim.surgePerHour > 0 ? tripRow(db, OUTSIDE_SURGE) : undefined;
    const surgeFrom = tripped?.active ? Date.parse(tripped.tripped_at) - HOUR_MS : null;
    // While the breaker is tripped its holds last until it is resumed, however old the items are.
    const from = Math.min(dayAgo, surgeFrom ?? dayAgo);
    // Only items in scope for model work count: repos with the pipeline on, and not fast-tracked.
    const scope = pipelineRepos(db);
    const fast = new Set((db.prepare("SELECT repo, number FROM main.fast_track").all() as { repo: string; number: number }[]).map((r) => `${r.repo}#${r.number}`));
    // A post-merge follow-up issue is opened by the pipeline from a review of a merged PR: it counts as an item of that PR's author.
    const rows = (db.prepare(`SELECT i.repo, i.number, i.kind, i.state, i.created_at,
        COALESCE(p.author, i.author) AS author,
        CASE WHEN p.author IS NULL THEN i.author_id ELSE p.author_id END AS author_id,
        CASE WHEN p.author IS NULL THEN i.author_association ELSE p.author_association END AS author_association,
        CASE WHEN p.author IS NULL THEN i.author_type ELSE p.author_type END AS author_type
      FROM items i LEFT JOIN items p ON i.kind = 'issue' AND p.repo = i.repo
        AND p.number = (SELECT f.number FROM main.postmerge_followups f WHERE f.repo = i.repo AND f.issue_number = i.number LIMIT 1)
      WHERE i.created_at >= ? AND i.author IS NOT NULL`)
      .all(new Date(from).toISOString()) as Row[]).filter((r) => scope.has(r.repo) && !fast.has(`${r.repo}#${r.number}`));
    backfillAdmitted(db, new Date(from).toISOString(), now);
    const admitted = new Set((db.prepare("SELECT repo, number FROM main.outside_admitted").all() as { repo: string; number: number }[]).map((r) => `${r.repo}#${r.number}`));
    const inside = insiders(db);
    const memo = new Map<string, boolean>();
    // Whitelisting belongs to the author's account, not to the login string.
    const whitelisted = (r: Row): boolean => {
      const k = `${r.author.toLowerCase()}|${r.author_id ?? ""}`;
      let v = memo.get(k);
      if (v === undefined) { v = isWhitelisted(db, r.author, r.author_id).ok; memo.set(k, v); }
      return v;
    };
    const cheap = rows.filter((r) => isOutsideAuthor(db, r, inside));

    // Surge: outside-author items of the last hour since the last resume.
    if (lim.surgePerHour > 0 && !tripped?.active) {
      const since = Math.max(now - HOUR_MS, Date.parse(sinceOf(db, OUTSIDE_SURGE)) || 0);
      const recent = cheap.filter((r) => Date.parse(r.created_at) > since);
      // The whitelist is read only when the cheap count already passes the threshold.
      const real = recent.length > lim.surgePerHour ? recent.filter((r) => !whitelisted(r)) : [];
      if (real.length > lim.surgePerHour) {
        const byAuthor = new Map<string, number>();
        for (const r of real) byAuthor.set(r.author, (byAuthor.get(r.author) ?? 0) + 1);
        const top = [...byAuthor].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a, n]) => `${a}: ${n}`);
        trip(db, OUTSIDE_SURGE, `${real.length} new items from outside authors in the last hour (more than ${lim.surgePerHour})`, top, new Date(now).toISOString());
        return refreshOutsideHolds(db, now);
      }
    }
    const groups = new Map<string, Row[]>();
    for (const r of cheap) {
      const k = `${r.author.toLowerCase()}|${r.author_id ?? ""}|${r.kind}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    for (const rs of groups.values()) {
      rs.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.number - b.number);
      const kind = rs[0]!.kind === "pr" ? "pr" as const : "issue" as const;
      const limit = kind === "pr" ? lim.prsPerDay : lim.issuesPerDay;
      const win = rs.filter((r) => Date.parse(r.created_at) >= dayAgo);
      const overLimit = limit > 0 && win.length > limit;
      const inSurge = surgeFrom !== null && rs.some((r) => Date.parse(r.created_at) >= surgeFrom);
      if (!overLimit && !inSurge) continue;
      if (whitelisted(rs[0]!)) continue;
      // An admitted item (planned without a hold once, or with pipeline work already) is never held again.
      const free = (r: Row) => r.state !== "OPEN" || released.has(`${r.repo}#${r.number}`) || admitted.has(`${r.repo}#${r.number}`);
      for (const r of rs) if (!free(r) && surgeFrom !== null && Date.parse(r.created_at) >= surgeFrom) holds.push({ repo: r.repo, number: r.number, author: r.author, kind, reason: "surge" });
      const surged = new Set(holds.map((h) => `${h.repo}#${h.number}`));
      win.forEach((r, i) => {
        if (overLimit && i >= limit && !free(r) && !surged.has(`${r.repo}#${r.number}`)) holds.push({ repo: r.repo, number: r.number, author: r.author, kind, reason: "limit" });
      });
      if (overLimit) { const t = Date.parse(win[0]!.created_at) + DAY_MS; wakeAt = wakeAt === null ? t : Math.min(wakeAt, t); }
    }
    // Admit what is in scope and not held.
    const held = new Set(holds.map((h) => `${h.repo}#${h.number}`));
    const admit = db.prepare("INSERT OR IGNORE INTO main.outside_admitted (repo, number, at) VALUES (?, ?, ?)");
    const at = new Date(now).toISOString();
    for (const r of cheap) if (!held.has(`${r.repo}#${r.number}`) && !admitted.has(`${r.repo}#${r.number}`)) admit.run(r.repo, r.number, at);
  }
  const have = db.prepare("SELECT repo, number, author, kind, reason FROM main.outside_holds").all() as Hold[];
  const key = (h: Hold) => `${h.repo}#${h.number}|${h.author}|${h.kind}|${h.reason}`;
  const want = new Set(holds.map(key));
  if (have.length !== holds.length || have.some((h) => !want.has(key(h)))) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("DELETE FROM main.outside_holds");
      const ins = db.prepare("INSERT INTO main.outside_holds (repo, number, author, kind, reason) VALUES (?, ?, ?, ?, ?)");
      for (const h of holds) ins.run(h.repo, h.number, h.author, h.kind, h.reason);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return { holds, tripped: !!tripRow(db, OUTSIDE_SURGE)?.active, wakeAt };
}

/** The wait text of a held item (the registered wait "author over daily limit", and the surge variant). */
export function holdWait(h: Pick<OutsideHoldInfo, "reason" | "kind" | "limit">): string {
  return h.reason === "surge" ? "the outside-surge breaker, until an operator resumes it" : `author's daily limit (${h.limit} new ${h.kind === "pr" ? "PRs" : "issues"} a day)`;
}

/** The holds as `repo#number` to their reason. */
export function holdMap(db: DatabaseSync): Map<string, OutsideHoldInfo> {
  const rows = db.prepare("SELECT repo, number, author, kind, reason FROM main.outside_holds").all() as Hold[];
  if (!rows.length) return new Map();
  const lim = outsideLimits(db);
  return new Map(rows.map((h) => [`${h.repo}#${h.number}`, { reason: h.reason, author: h.author, kind: h.kind, limit: h.kind === "pr" ? lim.prsPerDay : lim.issuesPerDay }]));
}

/** An operator exempts one held item from both holds. */
export function releaseOutside(db: DatabaseSync, by: string, repo: string, number: number): void {
  const h = db.prepare("SELECT author FROM main.outside_holds WHERE repo = ? AND number = ?").get(repo, number) as { author: string } | undefined;
  if (!h) throw new OutsideError(`${repo}#${number} is not held for its author`, 409);
  const at = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO main.outside_released (repo, number, by, at) VALUES (?, ?, ?, ?)").run(repo, number, by, at);
  db.prepare("DELETE FROM main.outside_holds WHERE repo = ? AND number = ?").run(repo, number);
  audit(db, by, "outside-release", `${repo}#${number}`, { author: h.author });
}

/** An operator exempts every item now held for one author. Returns how many. */
export function releaseAuthor(db: DatabaseSync, by: string, author: string): number {
  const rows = db.prepare("SELECT repo, number FROM main.outside_holds WHERE author = ? COLLATE NOCASE").all(author) as { repo: string; number: number }[];
  if (!rows.length) throw new OutsideError(`nothing is held for ${author}`, 409);
  const at = new Date().toISOString();
  const ins = db.prepare("INSERT OR IGNORE INTO main.outside_released (repo, number, by, at) VALUES (?, ?, ?, ?)");
  for (const r of rows) ins.run(r.repo, r.number, by, at);
  db.prepare("DELETE FROM main.outside_holds WHERE author = ? COLLATE NOCASE").run(author);
  audit(db, by, "outside-release-author", author, { items: rows.length });
  return rows.length;
}

export type OutsideState = OutsideLimits & { heldByLimit: number; heldBySurge: number; authors: number; tripped: { reason: string; since: string } | null };

export function outsideState(db: DatabaseSync, hidden: HiddenRepos = []): OutsideState {
  const h = hiddenTest("repo", hidden);
  const hide = filtered(hidden) ? ` WHERE NOT (${h.sql})` : "";
  const c = db.prepare(`SELECT SUM(reason = 'limit') AS l, SUM(reason = 'surge') AS s, COUNT(DISTINCT author) AS a FROM main.outside_holds${hide}`).get(...(filtered(hidden) ? h.args : [])) as { l: number | null; s: number | null; a: number };
  const t = tripRow(db, OUTSIDE_SURGE);
  return { ...outsideLimits(db), heldByLimit: c.l ?? 0, heldBySurge: c.s ?? 0, authors: c.a, tripped: t?.active ? { reason: t.reason, since: t.tripped_at } : null };
}
