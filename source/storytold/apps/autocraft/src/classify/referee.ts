// Referee: Sonnet decides disagreements between Jev and Haiku under the written rules.
import { serializeServingMetadata } from "../agents/provenance.ts";
import { jobItem } from "../runner/job-items.ts";
import type { DatabaseSync } from "node:sqlite";
import { queueRoom } from "../agents/call.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { type Item } from "./parse.ts";
import { type Pair, ref } from "./report.ts";
import { loadItems, pool } from "./run.ts";
import { runModelStep } from "../agents/step.ts";
import { REFEREE_SONNET } from "../agents/steps.ts";
import { rng, spread } from "./sample.ts";

export function pickDisagreements(pairs: Pair[], count: number, seed: number): Pair[] {
  const dis = pairs.filter((p) => p.jev.type_label !== p.haiku.type_label);
  return spread(dis, (p) => `${p.r.kind}|${p.jev.type_label}`, count, rng(seed));
}

const REFEREE = CLAUDE_PROMPTS["referee.sonnet"];

export async function runReferee(db: DatabaseSync, runId: string, picked: Pair[], perCall = REFEREE.limits.perCall): Promise<void> {
  await refereeItems(db, runId, loadItems(db, picked.map((p) => p.r)), { perCall, pipeline: false });
}

type RefereeOpts = {
  perCall?: number;
  /** Pipeline results carry probs {"sure": bool}, which settled.ts reads; evaluation rows carry none and never settle an item. */
  pipeline: boolean;
  /** The model asked, when not the prompt's own (Sonnet). An Opus answer is the last word: its row is marked final, so an unsure one still settles the label and flags a scope decision. */
  model?: string;
  /** Items sent to the model so far. */
  onSent?: (n: number) => void;
  cancelled?: () => boolean;
};

/** Sends the items to the Sonnet referee and stores one 'sonnet' row per answer in `runId`. Returns the number of answers. */
export async function refereeItems(db: DatabaseSync, runId: string, items: Item[], opts: RefereeOpts): Promise<number> {
  const perCall = opts.perCall ?? REFEREE.limits.perCall;
  const chunks: Item[][] = [];
  for (let i = 0; i < items.length; i += perCall) chunks.push(items.slice(i, i + perCall));
  const ins = db.prepare(`INSERT OR REPLACE INTO main.classifications (repo, number, classifier, run_id, at, type_label, flags, reason, probs, serving_metadata)
    VALUES (?, ?, 'sonnet', ?, ?, ?, '[]', ?, ?, ?)`);
  const have = db.prepare(`SELECT 1 FROM classifications WHERE repo = ? AND number = ? AND classifier = 'sonnet' AND run_id = ? AND at >= ?`);
  // Evaluation runs resume: any earlier answer in the run counts. Pipeline runs ask again, since a new answer replaces the old one.
  let total = 0, sent = 0;
  await pool(chunks.map((chunk, n) => async () => {
    if (opts.cancelled?.()) return;
    const start = new Date().toISOString();
    let got = 0;
    // The first call asks only the items without an answer yet; a retry asks the ones still missing from the reply.
    const first = chunk.filter((i) => !have.get(i.repo, i.number, runId, opts.pipeline ? start : ""));
    if (first.length) {
      const r = await runModelStep(db, REFEREE_SONNET, first, {
        usage: { run: runId, agent: opts.pipeline ? `${opts.model ?? "sonnet"}-${Date.now().toString(36)}-${n}` : `sonnet-${n}`, stage: "referee", ...(opts.model && { model: opts.model }) },
        ...(opts.model && { model: opts.model }),
        onAttempt: (todo) => opts.onSent?.((sent += todo.length)),
      });
      if (r.ok) for (const [index, verdicts] of r.values.entries()) for (const v of verdicts) {
        const [repo, num] = v.ref.split("#");
        ins.run(repo!, Number(num), runId, new Date().toISOString(), v.type_label, v.why, opts.pipeline ? JSON.stringify({ sure: v.sure === true, ...(opts.model && { final: true }) }) : null, serializeServingMetadata(r.servingValues[index]));
        got++;
        jobItem(db, repo!, Number(num), `refereed${opts.model ? ` by ${opts.model}` : ""} as ${v.type_label}${v.sure === true ? "" : " (unsure)"}`);
      }
      // A reply arrived and left an item out (or was invalid): count the failure on Sonnet's row (rewritten, so the settled table sees it); the planner backs off, and the third failure ends the referee's turn.
      // No reply at all (no Claude account free, a failed call) and a cancelled job are not the item's failure.
      const replied = r.ok || r.error !== "no answer";
      if (opts.model && opts.pipeline && replied && !opts.cancelled?.()) {
        const answered = new Set(r.ok ? r.values.flat().map((v) => v.ref) : []);
        for (const i of first) {
          if (answered.has(`${i.repo}#${i.number}`)) continue;
          const row = db.prepare(`SELECT type_label, reason, probs, at, serving_metadata FROM classifications WHERE repo = ? AND number = ? AND classifier = 'sonnet' AND run_id = ?`).get(i.repo, i.number, runId) as { type_label: string; reason: string | null; probs: string | null; at: string; serving_metadata: string | null } | undefined;
          if (!row) continue;
          let p: Record<string, unknown> = {};
          try { p = (JSON.parse(row.probs ?? "{}") as Record<string, unknown>) ?? {}; } catch { /* keep empty */ }
          p.opusFailures = (typeof p.opusFailures === "number" ? p.opusFailures : 0) + 1;
          p.opusFailedAt = new Date().toISOString();
          db.prepare(`INSERT OR REPLACE INTO main.classifications (repo, number, classifier, run_id, at, type_label, flags, reason, probs, serving_metadata) VALUES (?, ?, 'sonnet', ?, ?, ?, '[]', ?, ?, ?)`)
            .run(i.repo, i.number, runId, row.at, row.type_label, row.reason, JSON.stringify(p), row.serving_metadata);
        }
      }
    }
    total += got;
  }), () => queueRoom(db), { first: true });
  return total;
}

/** Marks a varied subset (by kind and by whom Sonnet sided with) for the owner to check by hand. */
export function markSpotCheck(db: DatabaseSync, runId: string, pairs: Pair[], count: number, seed: number): void {
  const verdicts = new Map(
    (db.prepare(`SELECT repo, number, type_label FROM classifications WHERE classifier = 'sonnet' AND run_id = ?`).all(runId) as
      { repo: string; number: number; type_label: string }[]).map((r) => [ref(r), r.type_label]),
  );
  const refereed = pairs.filter((p) => verdicts.has(ref(p.r)));
  const side = (p: Pair) => { const v = verdicts.get(ref(p.r)); return v === p.jev.type_label ? "jev" : v === p.haiku.type_label ? "haiku" : "neither"; };
  db.prepare(`UPDATE main.classifications SET flags = '[]' WHERE classifier = 'sonnet' AND run_id = ?`).run(runId);
  const upd = db.prepare(`UPDATE main.classifications SET flags = '["spot-check"]' WHERE classifier = 'sonnet' AND run_id = ? AND repo = ? AND number = ?`);
  for (const p of spread(refereed, (p) => `${p.r.kind}|${side(p)}`, count, rng(seed + 1))) upd.run(runId, p.r.repo, p.r.number);
}
