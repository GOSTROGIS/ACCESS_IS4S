// Queue position: the place of an open item among the items whose next step is the same queued stage.
// Items are those in the pipeline's scope (repo switch on or fast-tracked, the pilot, not our own integration PRs),
// ordered by the work rank with fast-tracked items first (src/fasttrack.ts); the Merge stage follows the Merge tab's order.
// Items whose next step is not a queued stage (a person's answer, a running job, held, done) have none.
// The place is current, not an estimate.
import type { DatabaseSync } from "node:sqlite";
import type { QueueSlot } from "../../web/src/api/types.ts";
import { workScores } from "../fasttrack.ts";
import { targetKeys } from "../act/order.ts";
import { commentApprovalOf } from "../act/approval.ts";

/** Next step text → queued stage and the Queue tab that lists it. Steps not listed here are not queued. */
const QUEUED: Record<string, Pick<QueueSlot, "stage" | "tab">> = {
  Review: { stage: "Review", tab: "review" },
  Fix: { stage: "Fix", tab: "fix" },
  "Fix-up": { stage: "Fix-up", tab: "fix" },
  Verify: { stage: "Verify", tab: "verify" },
  "Merge queue": { stage: "Merge", tab: "merge" },
};

const BATCHED = new Set(["batch-checking", "in-batch"]);

/** The Act stage is queued by the order the Act step works in (priority level, then the time of the answer), not by the work rank. */
const ACT_SLOT: Pick<QueueSlot, "stage" | "tab"> = { stage: "Act", tab: "act" };

type Entry = { repo: string; number: number; score: number } & Pick<QueueSlot, "stage" | "tab">;
export type Stages = Map<string, Entry[]>;

/** Work score of an item with fast-tracked ones raised, one lookup per repo. */
export function scoreLookup(db: DatabaseSync): (repo: string, number: number) => number | undefined {
  const by = new Map<string, Map<number, number>>();
  return (repo, number) => {
    let m = by.get(repo);
    if (!m) by.set(repo, (m = workScores(db, repo)));
    return m.get(number);
  };
}

/** The Merge tab's order, the same as every other stage's: fast-tracked first, then the work rank, then repo and number. Batched PRs are listed under their batch, not here. */
export function mergeOrder<T extends { repo: string; number: number; state?: string }>(db: DatabaseSync, entries: T[]): T[] {
  const score = scoreLookup(db);
  const s = (e: T): number => score(e.repo, e.number) ?? 0;
  return entries.filter((e) => !BATCHED.has(e.state ?? "")).sort((a, b) => s(b) - s(a) || a.repo.localeCompare(b.repo) || a.number - b.number);
}

/** Orders items by stage: best first by score. */
export function orderStages(items: { repo: string; number: number; score: number; next: string }[]): Stages {
  const by: Stages = new Map();
  for (const i of items) {
    const q = QUEUED[i.next];
    if (!q) continue;
    const list = by.get(q.stage) ?? [];
    list.push({ repo: i.repo, number: i.number, score: i.score, ...q });
    by.set(q.stage, list);
  }
  for (const list of by.values()) list.sort((a, b) => b.score - a.score || a.repo.localeCompare(b.repo) || a.number - b.number);
  return by;
}

/** Orders the pipeline's open ranked items by stage, from the Plan cache: the next-step text of each item in scope, and the batch states of the PRs. */
export function computeStages(db: DatabaseSync): Stages {
  const held = new Set((db.prepare("SELECT repo, number FROM main.merge_holds").all() as { repo: string; number: number }[]).map((r) => `${r.repo}#${r.number}`));
  const rows = db.prepare(`SELECT p.repo, p.number, p.state, json_extract(p.view, '$.next') AS next FROM main.item_plans p
    JOIN main.items i ON i.repo = p.repo AND i.number = p.number AND i.state = 'OPEN' JOIN main.item_rank r ON r.repo = p.repo AND r.number = p.number
    WHERE json_extract(p.view, '$.scope') = 1`).all() as { repo: string; number: number; state: string; next: string | null }[];
  const score = scoreLookup(db);
  const out: { repo: string; number: number; score: number; next: string }[] = [];
  for (const r of rows) {
    const step = r.next ?? "";
    const k = `${r.repo}#${r.number}`;
    // A held PR has no place in the merge order, and batched PRs are listed under their batch on the Merge tab.
    if (!QUEUED[step] || (step === "Merge queue" && (held.has(k) || BATCHED.has(r.state)))) continue;
    out.push({ repo: r.repo, number: r.number, score: score(r.repo, r.number) ?? 0, next: step });
  }
  const stages = orderStages(out);
  const act = actEntries(db);
  if (act.length) stages.set("Act", act);
  return stages;
}

const EPOCH_CAP = 1e10;

/** Items with an answered close the Act step has not carried out yet, in the step's order. Repos not approved for commenting and disputed answers have no place. */
function actEntries(db: DatabaseSync): Entry[] {
  const rows = db.prepare(`SELECT repo, number, actions FROM main.item_plans WHERE actions LIKE '%"kind":"act"%'`).all() as { repo: string; number: number; actions: string | null }[];
  const targets: { decisionId: string; repo: string; number: number }[] = [];
  const approved = new Map<string, boolean>();
  for (const r of rows) {
    let acts: { kind?: string; params?: { ask?: boolean; group?: boolean; decisionId?: string } }[];
    try { acts = JSON.parse(r.actions ?? "[]"); } catch { continue; }
    const t = acts.find((a) => a.kind === "act" && !a.params?.ask && !a.params?.group && a.params?.decisionId);
    if (!t) continue;
    if (!approved.has(r.repo)) approved.set(r.repo, commentApprovalOf(db, r.repo) !== null);
    if (approved.get(r.repo)) targets.push({ decisionId: t.params!.decisionId!, repo: r.repo, number: r.number });
  }
  if (!targets.length) return [];
  const keys = targetKeys(db, targets);
  const disputed = new Set((db.prepare("SELECT id FROM main.decisions WHERE exec_state = 'disputed' AND id IN (SELECT value FROM json_each(?))").all(JSON.stringify(targets.map((t) => t.decisionId))) as { id: string }[]).map((x) => x.id));
  return targets.filter((t) => !disputed.has(t.decisionId)).map((t) => {
    const k = keys.get(t.decisionId);
    const sec = k?.at ? Date.parse(k.at) / 1000 : 0;
    return { repo: t.repo, number: t.number, score: (k?.band ?? 2) * EPOCH_CAP + (EPOCH_CAP - (Number.isFinite(sec) ? sec : 0)), ...ACT_SLOT };
  }).sort((a, b) => b.score - a.score || a.repo.localeCompare(b.repo) || a.number - b.number);
}

const cache = new WeakMap<DatabaseSync, { sig: string; stages: Stages }>();

// Recomputed when the Plan cache, the work rank, fast track or merge holds change (the `plans` and `steps` topics).
function stages(db: DatabaseSync): Stages {
  const sig = JSON.stringify(db.prepare("SELECT (SELECT seq FROM change_seq WHERE topic = 'steps') AS s, (SELECT seq FROM change_seq WHERE topic = 'plans') AS p").get() ?? null);
  const hit = cache.get(db);
  if (hit && hit.sig === sig) return hit.stages;
  const fresh = computeStages(db);
  cache.set(db, { sig, stages: fresh });
  return fresh;
}

/** Slots of `repo#number` for the items in `visible` repos; places count only visible items. Pure over the ordered stages. */
export function slotsOf(byStage: Stages, visible: Iterable<string>): Map<string, QueueSlot> {
  const seen = new Set(visible);
  const out = new Map<string, QueueSlot>();
  for (const list of byStage.values()) {
    let place = 0;
    for (const e of list) {
      if (!seen.has(e.repo)) continue;
      const key = `${e.repo}#${e.number}`;
      // An item with a place in a pipeline stage keeps it; the Act place is for items with no other.
      if (e.stage === "Act" && out.has(key)) continue;
      out.set(key, { stage: e.stage, tab: e.tab, place: ++place });
    }
  }
  return out;
}

/** One pass for all items: call it once per request, not per item. */
export const queueSlots = (db: DatabaseSync, visible: Iterable<string>): Map<string, QueueSlot> => slotsOf(stages(db), visible);
