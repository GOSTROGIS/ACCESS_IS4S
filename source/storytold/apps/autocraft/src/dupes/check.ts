// The pair check: Jev for every pair, accepted at 0.9 either way; Haiku for the
// pairs Jev is not sure about, and for every pair while Jev is unavailable.
import type { DatabaseSync } from "node:sqlite";
import { jevParallel } from "../agents/accounts.ts";
import { queueRoom } from "../agents/call.ts";
import { jevAvailable } from "../agents/jev.ts";
import { askClaude, pool } from "../classify/run.ts";
import { runModelStep } from "../agents/step.ts";
import { DUPES_HAIKU, DUPES_JEV } from "../agents/steps.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { pickCanonical } from "./canonical.ts";
import { pairRef, settlePair, type DupePair, type PairVerdict } from "./pair.ts";
import { pilotSqlFor } from "../pilot.ts";

const HAIKU = CLAUDE_PROMPTS["dupes.haiku"];

export type PairKey = { repo: string; a: number; b: number; a_hash: string; b_hash: string; similarity: number };

/** Unchecked pairs whose items still have the hashed text and of which at least one is open, most similar first. */
export function uncheckedPairs(db: DatabaseSync, limit: number): PairKey[] {
  return db.prepare(`SELECT p.repo, p.a, p.b, p.a_hash, p.b_hash, p.similarity FROM duplicate_pairs p
    JOIN items ia ON ia.repo = p.repo AND ia.number = p.a AND ia.embed_hash = p.a_hash
    JOIN items ib ON ib.repo = p.repo AND ib.number = p.b AND ib.embed_hash = p.b_hash
    WHERE p.verdict IS NULL AND (ia.state = 'OPEN' OR ib.state = 'OPEN') AND p.repo IN (SELECT name FROM tracked_repos)
      AND (${pilotSqlFor("p.repo", "p.a")} OR ${pilotSqlFor("p.repo", "p.b")})
    ORDER BY p.similarity DESC, p.repo, p.a, p.b LIMIT ?`).all(limit) as PairKey[];
}

export function pairInput(db: DatabaseSync, k: PairKey): DupePair {
  const get = db.prepare("SELECT number, kind, state, title, body FROM items WHERE repo = ? AND number = ?");
  const item = (n: number) => {
    const r = get.get(k.repo, n) as { number: number; kind: "pr" | "issue"; state: string; title: string | null; body: string | null };
    return { number: r.number, kind: r.kind, state: r.state, title: r.title ?? "", body: r.body ?? "" };
  };
  return { ref: pairRef(k.repo, k.a, k.b), repo: k.repo, a: item(k.a), b: item(k.b) };
}

export type CheckDeps = {
  /** Jev's yes-probability that the pair is one bug or request; null when it gave no valid answer. */
  jev(pair: DupePair): Promise<number | null>;
  /** Haiku's reply text for a batch of pairs; null when there was none. */
  haiku(pairs: DupePair[]): Promise<string | null>;
  /** False while Jev is unavailable: Haiku then decides the pairs alone. Absent means available. */
  jevUsable?(): boolean;
  now(): Date;
};

export function defaultCheckDeps(db: DatabaseSync): CheckDeps {
  return {
    async jev(pair) {
      const r = await runModelStep(db, DUPES_JEV, pair);
      return r.ok ? r.value : null;
    },
    async haiku(pairs) {
      return (await askClaude("dupes.haiku", HAIKU.models[0]!, pairs, db))?.text ?? null;
    },
    jevUsable: () => jevAvailable(db),
    now: () => new Date(),
  };
}

export type CheckCounts = { checked: number; jev: number; haiku: number; haikuAlone: number; verdicts: Record<string, number>; unanswered: number };

function store(db: DatabaseSync, k: PairKey, jev: number | null, haiku: PairVerdict | null, verdict: PairVerdict, at: string): void {
  const canonical = verdict === "duplicate" ? pickCanonical(db, k.repo, [k.a, k.b]).number : null;
  db.prepare(`UPDATE duplicate_pairs SET jev_p = ?, haiku = ?, verdict = ?, canonical = ?, checked_at = ?
    WHERE repo = ? AND a = ? AND b = ? AND a_hash = ? AND b_hash = ?`).run(jev, haiku, verdict, canonical, at, k.repo, k.a, k.b, k.a_hash, k.b_hash);
}

/** Checks the pairs and stores each answered one. `onHandled` gets the running count of pairs sent to a model. */
export async function checkPairs(db: DatabaseSync, keys: PairKey[], deps: CheckDeps, onHandled?: (n: number) => void): Promise<CheckCounts> {
  const c: CheckCounts = { checked: 0, jev: 0, haiku: 0, haikuAlone: 0, verdicts: {}, unanswered: 0 };
  const jevP = new Map<string, number | null>();
  /** Pairs Jev could not be asked because it is unavailable. */
  const alone = new Set<string>();
  const pairs = new Map(keys.map((k) => [pairRef(k.repo, k.a, k.b), { k, pair: pairInput(db, k) }]));
  let handled = 0;
  await pool([...pairs.entries()].map(([ref, e]) => async () => {
    const usable = deps.jevUsable?.() ?? true;
    const p = usable ? await deps.jev(e.pair) : null;
    jevP.set(ref, p);
    if (p === null && !(deps.jevUsable?.() ?? true)) alone.add(ref);
    else c.jev++;
    onHandled?.(++handled);
  }), jevParallel(db));
  const at = deps.now().toISOString();
  const done = (ref: string, haiku: PairVerdict | null, verdict: PairVerdict) => {
    store(db, pairs.get(ref)!.k, jevP.get(ref) ?? null, haiku, verdict, at);
    c.checked++;
    c.verdicts[verdict] = (c.verdicts[verdict] ?? 0) + 1;
  };
  const second: string[] = [];
  for (const ref of pairs.keys()) {
    const v = alone.has(ref) ? null : settlePair(jevP.get(ref) ?? null, null);
    if (v) done(ref, null, v);
    else second.push(ref);
  }
  const batches: string[][] = [];
  for (let i = 0; i < second.length; i += HAIKU.limits.perCall) batches.push(second.slice(i, i + HAIKU.limits.perCall));
  await pool(batches.map((batch) => async () => {
    // One entry per batch pair; a pair without a valid answer stays in `rest` and is asked again.
    const input = batch.map((r) => pairs.get(r)!.pair);
    const r = await runModelStep(db, DUPES_HAIKU, input, { ask: async (ps) => {
      const text = await deps.haiku(ps);
      return text === null ? null : { text, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: null } };
    } });
    if (r.ok) for (const answers of r.values) {
      c.haiku += answers.length;
      for (const a of answers) {
        if (alone.has(a.ref)) c.haikuAlone++;
        done(a.ref, a.verdict, settlePair(jevP.get(a.ref) ?? null, a.verdict, alone.has(a.ref)) ?? "unsure");
      }
    }
    const todo = r.ok ? (r.rest ?? []) : input;
    c.unanswered += todo.length;
  }), () => queueRoom(db), { first: true });
  return c;
}
