// autocraft prioritize [--limit N]: priority level (P0-P4) of open items and their reach (src/priority/score.ts).
//
// Jev classifies the impact of each item whose text has no priority row at its
// current hash; Haiku decides where Jev is under 90 % sure, and for every item
// while Jev is unavailable (src/agents/jev.ts). The reach is
// recomputed from the mirror's reach signals on every pass, without a model.
import type { DatabaseSync } from "node:sqlite";
import { runTiered } from "../agents/step.ts";
import { PRIORITY } from "../agents/steps.ts";
import { type Item, refOf } from "../classify/parse.ts";
import { connect } from "../db.ts";
import { fillEmbedHashes } from "../itemhash.ts";
import { reachOfOpenItems } from "./reach.ts";
import { reachScore, settleImpact, type Impact } from "./score.ts";
import { itemOf, plannedItems } from "../core/select-items.ts";

const JEV_CHUNK = 40;
const now = () => new Date().toISOString();

type Due = Item & { hash: string };

/** The items the Plans send to rating: no priority row, or one made at other text. */
function dueItems(db: DatabaseSync): Due[] {
  return plannedItems(db, "prioritize").map((p) => ({ ...itemOf(db, p.facts.repo, p.facts.number), hash: p.facts.embedHash }));
}

type Verdict = { jev: { impact: Impact; p: number } | null; haiku: { impact: Impact; reason: string } | null };

function save(db: DatabaseSync, item: Due, v: Verdict): boolean {
  const s = settleImpact(v.jev, v.haiku?.impact ?? null);
  if (!s) return false;
  const reason = s.model === "haiku" ? v.haiku!.reason : v.jev ? `${v.jev.impact} ${v.jev.p.toFixed(2)}` : "";
  db.prepare(`INSERT INTO item_priority (repo, number, text_hash, impact, jev_impact, jev_p, haiku_impact, score, model, reason, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (repo, number) DO UPDATE SET text_hash = excluded.text_hash, impact = excluded.impact, jev_impact = excluded.jev_impact, jev_p = excluded.jev_p,
      haiku_impact = excluded.haiku_impact, serving_metadata = NULL, model = excluded.model, reason = excluded.reason, at = excluded.at`).run(item.repo, item.number, item.hash, s.impact, v.jev?.impact ?? null, v.jev?.p ?? null,
    v.haiku?.impact ?? null, 0, s.model, reason, now());
  return true;
}

/**
 * Recomputes the reach of every open item with a priority row from the current reach signals.
 * Returns the number of rows whose reach changed.
 */
export function rescore(db: DatabaseSync, nowMs: number = Date.now()): number {
  const reach = reachOfOpenItems(db, nowMs);
  const rows = db.prepare(`SELECT p.repo, p.number, p.score FROM item_priority p JOIN items i ON i.repo = p.repo AND i.number = p.number WHERE i.state = 'OPEN'`)
    .all() as { repo: string; number: number; score: number }[];
  const upd = db.prepare("UPDATE item_priority SET score = ? WHERE repo = ? AND number = ?");
  let changed = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const r of rows) {
      const rc = reach.get(`${r.repo}#${r.number}`);
      if (!rc) continue;
      const score = reachScore(rc);
      if (score !== r.score) { upd.run(score, r.repo, r.number); changed++; }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return changed;
}

export type PrioritizeOptions = { limit: number; onSent?: (n: number) => void; cancelled?: () => boolean; log?: (line: string) => void };
export type PrioritizeResult = { due: number; sent: number; jev: number; haiku: number; saved: number; rescored: number; haikuAlone: number };

export async function runPrioritize(db: DatabaseSync, opts: PrioritizeOptions): Promise<PrioritizeResult> {
  const log = opts.log ?? (() => {});
  fillEmbedHashes(db);
  const all = dueItems(db);
  const due = all.length;
  const todo = all.slice(0, opts.limit);
  log(`prioritize: ${due} items due, taking ${todo.length}`);
  const res: PrioritizeResult = { due, sent: 0, jev: 0, haiku: 0, saved: 0, rescored: 0, haikuAlone: 0 };
  for (let i = 0; i < todo.length && !opts.cancelled?.(); i += JEV_CHUNK) {
    const chunk = todo.slice(i, i + JEV_CHUNK);
    res.sent += chunk.length;
    opts.onSent?.(res.sent);
    const t = await runTiered(db, PRIORITY, chunk);
    const verdicts = new Map<string, Verdict>();
    for (const item of chunk) {
      const ref = refOf(item), v = t.jev.get(ref) ?? null;
      verdicts.set(ref, { jev: v, haiku: t.haiku.get(ref) ?? null });
      if (v) res.jev++;
      if (t.haiku.has(ref)) res.haiku++;
    }
    res.haikuAlone += t.alone.size;
    for (const item of chunk) if (save(db, item, verdicts.get(refOf(item))!)) res.saved++;
    else log(`prioritize: no valid answer for ${refOf(item)}`);
  }
  res.rescored = rescore(db);
  if (res.haikuAlone) log(`Jev unavailable: Haiku rated ${res.haikuAlone} items`);
  return res;
}

export const commands = {
  prioritize: {
    summary: "prioritize [--limit N]: Jev (Haiku where unsure) rates the level (P0-P4) of open items without a priority, then recomputes all reach",
    async run(args: string[]): Promise<void> {
      const i = args.indexOf("--limit");
      const limit = i >= 0 ? Number(args[i + 1]) : 500;
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit is a whole number of at least 1");
      const r = await runPrioritize(connect(), { limit, log: console.log });
      console.log(`${r.saved} of ${r.sent} rated (${r.jev} by Jev, ${r.haiku} by Haiku); ${r.rescored} reach values changed${r.haikuAlone ? `; Jev unavailable: Haiku rated ${r.haikuAlone} items` : ""}`);
    },
  },
};
