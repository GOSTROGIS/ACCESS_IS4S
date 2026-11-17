// Fast track: operators mark items (PRs or issues) that go first in every stage ordering work by the work rank
// (Decide, Review, Fix, Fix-up, Verify, merges). Each has a weight from 1 to 10 (default 5): heavier items go first,
// and items of equal weight keep the order they were added in; new ones join the end of their weight.
// A fast-tracked item runs through every stage even when its repo's Pipeline switch is off (src/pilot.ts); the global
// pipeline switch, approvals, daily limits and merge gates apply as before. A row of an item that is closed or merged
// stays in the table but is ignored: lists and positions count open items only.
//
//   autocraft fasttrack add <url|repo#n> [--weight N] | weight <url|repo#n> <N> | remove <url|repo#n> | list
import type { DatabaseSync } from "node:sqlite";
import { ownerOf } from "./owners.ts";
import { audit } from "./dash/audit.ts";
import { connect } from "./db.ts";
import { isTracked } from "./repos.ts";

export class FastTrackError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type FastRef = { repo: string; number: number };
export type FastItem = FastRef & { position: number; of: number; weight: number; addedBy: string; addedAt: string };

export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 10;
export const WEIGHT_DEFAULT = 5;

/** A whole number from WEIGHT_MIN to WEIGHT_MAX; nothing gives the default. */
export function parseWeight(input: unknown): number {
  if (input === undefined || input === null || input === "") return WEIGHT_DEFAULT;
  const n = typeof input === "number" ? input : typeof input === "string" && /^\d{1,2}$/.test(input.trim()) ? Number(input) : NaN;
  if (!Number.isInteger(n) || n < WEIGHT_MIN || n > WEIGHT_MAX) throw new FastTrackError(`the weight is a whole number from ${WEIGHT_MIN} to ${WEIGHT_MAX}`);
  return n;
}

const refText = (r: FastRef): string => `${r.repo}#${r.number}`;

/** `https://github.com/<owner>/<repo>/pull/<n>` (or `/issues/<n>`), `<repo>#<n>` or `<owner>/<repo>#<n>`. */
export function parseItemRef(input: unknown): FastRef {
  const t = typeof input === "string" ? input.trim() : "";
  const m = /^https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(?:pull|issues)\/([1-9][0-9]*)(?:[/?#].*)?$/.exec(t)
    ?? /^(?:([A-Za-z0-9._-]+)\/)?([A-Za-z0-9._-]+)#([1-9][0-9]*)$/.exec(t);
  if (!m) throw new FastTrackError("not an item: use a GitHub URL, repo#number or owner/repo#number");
  if (m[1] && m[1].toLowerCase() !== ownerOf(m[2]!).toLowerCase()) throw new FastTrackError(`${m[1]}/${m[2]} is not a tracked repo of ${m[1]}`);
  return { repo: m[2]!, number: Number(m[3]) };
}

/** Open fast-tracked items, first to run first: heaviest first, then in the order added. */
export function fastTrackList(db: DatabaseSync): FastItem[] {
  const rows = db.prepare(`SELECT f.repo, f.number, f.weight, f.added_by, f.added_at FROM main.fast_track f
    JOIN main.items i ON i.repo = f.repo AND i.number = f.number AND i.state = 'OPEN' ORDER BY f.weight DESC, f.id`).all() as { repo: string; number: number; weight: number; added_by: string; added_at: string }[];
  return rows.map((r, k) => ({ repo: r.repo, number: r.number, position: k + 1, of: rows.length, weight: r.weight, addedBy: r.added_by, addedAt: r.added_at }));
}

/** `repo#number` → position, list size and weight, for the open fast-tracked items. */
export function fastPositions(db: DatabaseSync): Map<string, { position: number; of: number; weight: number }> {
  return new Map(fastTrackList(db).map((f) => [refText(f), { position: f.position, of: f.of, weight: f.weight }]));
}

/** Adds an open item of a tracked repo at the end of its weight. Returns false when it was already there (its weight stays as it is). */
export function addFastTrack(db: DatabaseSync, by: string, input: unknown, weight: unknown = WEIGHT_DEFAULT): { ref: FastRef; added: boolean } {
  const ref = parseItemRef(input);
  if (!isTracked(db, ref.repo)) throw new FastTrackError(`${ref.repo} is not a tracked repo`, 404);
  const item = db.prepare("SELECT state FROM main.items WHERE repo = ? AND number = ?").get(ref.repo, ref.number) as { state: string } | undefined;
  if (!item) throw new FastTrackError(`no item ${refText(ref)} in the mirror`, 404);
  if (item.state !== "OPEN") throw new FastTrackError(`${refText(ref)} is not open`, 409);
  const w = parseWeight(weight);
  const r = db.prepare("INSERT OR IGNORE INTO main.fast_track (repo, number, added_by, added_at, weight) VALUES (?, ?, ?, ?, ?)").run(ref.repo, ref.number, by, new Date().toISOString(), w);
  if (r.changes) audit(db, by, "fasttrack-add", refText(ref), { weight: w });
  return { ref, added: r.changes > 0 };
}

/** Changes the weight of a fast-tracked item; among items of its new weight it keeps its place by when it was added. */
export function setFastTrackWeight(db: DatabaseSync, by: string, input: unknown, weight: unknown): { ref: FastRef; weight: number } {
  const ref = parseItemRef(input);
  const w = parseWeight(weight);
  if (!db.prepare("SELECT 1 FROM main.fast_track WHERE repo = ? AND number = ?").get(ref.repo, ref.number)) throw new FastTrackError(`${refText(ref)} is not fast-tracked`, 404);
  const r = db.prepare("UPDATE main.fast_track SET weight = ? WHERE repo = ? AND number = ? AND weight <> ?").run(w, ref.repo, ref.number, w);
  if (r.changes) audit(db, by, "fasttrack-weight", refText(ref), { weight: w });
  return { ref, weight: w };
}

/** Takes an item off the list; it returns to normal ranking. Returns false when it was not on it. */
export function removeFastTrack(db: DatabaseSync, by: string, input: unknown): { ref: FastRef; removed: boolean } {
  const ref = parseItemRef(input);
  const r = db.prepare("DELETE FROM main.fast_track WHERE repo = ? AND number = ?").run(ref.repo, ref.number);
  if (r.changes) audit(db, by, "fasttrack-remove", refText(ref));
  return { ref, removed: r.changes > 0 };
}

const FAST_BASE = 1e15;
/** One step of weight outranks every difference in the order added (row ids stay far below it). */
const WEIGHT_STEP = 1e12;
/** A fast-tracked row's score: its weight first, then the earlier addition. `f` is the table alias. */
const rowScore = (f: string) => `(${FAST_BASE} + ${f}.weight * ${WEIGHT_STEP} - ${f}.id)`;
/** Scores at or above this belong to fast-tracked items. */
export const FAST_FLOOR = FAST_BASE / 2;

/**
 * SQL for the score a stage orders by: a fast-tracked item outranks every ranked one, heavier first, then earlier additions;
 * the others keep `scoreExpr`. `repo` and `number` are SQL expressions of the item.
 */
export const fastScoreSql = (repo: string, number: string, scoreExpr: string): string =>
  `COALESCE((SELECT MAX(${rowScore("fq")}) FROM main.fast_track fq WHERE fq.repo = ${repo} AND (fq.number = ${number}
    OR EXISTS (SELECT 1 FROM main.fix_attempts fa WHERE fa.repo = ${repo} AND fa.number = fq.number AND fa.pr_url LIKE '%/pull/' || ${number}))), ${scoreExpr})`;

/** The fast-track score of the item (see `fastScoreSql`), or null when it is not fast-tracked. */
export function fastScoreOf(db: DatabaseSync, repo: string, number: number): number | null {
  const r = db.prepare(`SELECT ${fastScoreSql("?1", "CAST(?2 AS INTEGER)", "NULL")} AS s`).get(repo, number) as { s: number | null };
  return r.s;
}

export const isFastTracked = (db: DatabaseSync, repo: string, number: number): boolean => fastScoreOf(db, repo, number) !== null;

/** True when the sandbox task belongs to a fast-tracked item: its PR or issue, or a batch of fast-tracked PRs only. */
export function fastTask(db: DatabaseSync, t: { id: number; repo: string; number: number | null }): boolean {
  if (t.number !== null) return isFastTracked(db, t.repo, t.number);
  const b = db.prepare("SELECT id FROM main.merge_batches WHERE task_id = ?").get(t.id) as { id: number } | undefined;
  if (!b) return false;
  const ms = db.prepare("SELECT number FROM main.merge_batch_prs WHERE batch_id = ?").all(b.id) as { number: number }[];
  return ms.length > 0 && ms.every((m) => isFastTracked(db, t.repo, m.number));
}

/**
 * Repos whose best candidate (`top` gives its number) is fast-tracked come first, the earliest fast-tracked first; the others follow in the given order.
 * Planners that visit repos one per job use it so fast track also orders across repos.
 */
export function fastFirst(db: DatabaseSync, repos: string[], top: (repo: string) => number | undefined): string[] {
  const score = new Map(repos.map((r) => { const n = top(r); return [r, n === undefined ? null : fastScoreOf(db, r, n)] as const; }));
  const fast = repos.filter((r) => (score.get(r) ?? 0) >= FAST_FLOOR).sort((x, y) => score.get(y)! - score.get(x)!);
  return [...fast, ...repos.filter((r) => !fast.includes(r))];
}

/** Work score of every ranked open item of the repo, with fast-tracked items raised above all others. */
export function workScores(db: DatabaseSync, repo: string): Map<number, number> {
  const out = new Map((db.prepare("SELECT number, score FROM main.item_rank WHERE repo = ?").all(repo) as { number: number; score: number }[]).map((r) => [r.number, r.score]));
  for (const f of db.prepare(`SELECT number, ${rowScore("ft")} AS s FROM main.fast_track ft WHERE repo = ?`).all(repo) as { number: number; s: number }[]) out.set(f.number, f.s);
  // A fast-tracked issue's Fix PR takes the issue's place.
  for (const f of db.prepare(`SELECT fa.pr_url, ${rowScore("ft")} AS s FROM main.fast_track ft JOIN main.fix_attempts fa ON fa.repo = ft.repo AND fa.number = ft.number
    WHERE ft.repo = ? AND fa.pr_url IS NOT NULL`).all(repo) as { pr_url: string; s: number }[]) {
    const n = Number(/\/pull\/(\d+)$/.exec(f.pr_url)?.[1]);
    const own = out.get(n) ?? 0;
    // The higher score (heavier, then earlier addition) counts, like fastScoreSql.
    if (n && f.s > own) out.set(n, f.s);
  }
  return out;
}

export const commands = {
  fasttrack: {
    summary: "fasttrack add <url|repo#n> [--weight N] | weight <url|repo#n> <N> | remove <url|repo#n> | list: items that go first in every stage, heaviest first (1-10, default 5), then in the order added",
    run(args: string[]): void {
      const db = connect();
      const [sub, item] = args;
      try {
        if (sub === "list" && args.length === 1) {
          const list = fastTrackList(db);
          if (!list.length) console.log("no fast-tracked items");
          for (const f of list) console.log(`${f.position} of ${f.of}  weight ${f.weight}  ${refText(f)}  added by ${f.addedBy} ${f.addedAt}`);
          return;
        }
        if (sub === "weight" && item && args.length === 3) {
          const r = setFastTrackWeight(db, "cli", item, args[2]);
          console.log(`${refText(r.ref)}: weight ${r.weight}`);
          return;
        }
        const weighted = sub === "add" && args.length === 4 && args[2] === "--weight";
        if ((sub === "add" || sub === "remove") && item && (args.length === 2 || weighted)) {
          if (sub === "add") {
            const r = addFastTrack(db, "cli", item, weighted ? args[3] : undefined);
            console.log(r.added ? `${refText(r.ref)}: fast-tracked` : `${refText(r.ref)}: already fast-tracked`);
          } else {
            const r = removeFastTrack(db, "cli", item);
            console.log(r.removed ? `${refText(r.ref)}: fast track removed` : `${refText(r.ref)}: was not fast-tracked`);
          }
          return;
        }
        throw new FastTrackError("usage: fasttrack add <url|repo#n> [--weight N] | weight <url|repo#n> <N> | remove <url|repo#n> | list");
      } catch (e) {
        if (!(e instanceof FastTrackError)) throw e;
        console.error(e.message);
        process.exit(1);
      }
    },
  },
};
