// Converts the resolution cards Opus proposed before the choices format into decision_choices drafts, without a model call.
// `cardsToDrafts` is the pure mapping (also used for settling cards in a conversation turn); `convertOpenDecisions` applies it to the open decisions.
import type { DatabaseSync } from "node:sqlite";
import type { CardParams, Step } from "../conversations/cards.ts";
import { decisionStamp, openDecision } from "../conversations/cards.ts";
import type { DecisionRow } from "../decisions.ts";
import { applyDrafts, coresFor, MAX_ADDED_CORES, withIds, writeChoices } from "./choices.ts";
import { coreKey, type ChoicesBlockExtra, type ChoicesRow, type CoreKey, type StoredDraft } from "./choices-types.ts";

/** A proposed card as the mapper reads it. */
export interface DraftCard { params: CardParams; text: string | null }

type Draft = { params?: StoredDraft["params"]; extras: ChoicesBlockExtra[] };

export interface MappedDrafts {
  /** Drafts for the cores the decision offers (options, fixup-merge, backlog). */
  cores: Record<CoreKey, Draft>;
  /** Drafts for the cores only Opus adds. */
  add: { key: CoreKey; draft: Draft }[];
  notes: string[];
  /** Indexes of the cards that mapped to a core (the settling ones); the others are not settling cards. */
  used: number[];
}

const ENDING = new Set(["close", "duplicate", "transfer", "fixup", "review"]);

function extraOf(step: Step, text: string | null): ChoicesBlockExtra | null {
  switch (step.kind) {
    case "comment": return { kind: "comment", on: true, text: text ?? "" };
    case "label": return { kind: "label", on: true, label: step.label };
    case "unlabel": return { kind: "unlabel", on: true, label: step.label };
    case "assign": return { kind: "assign", on: true, login: step.login };
    case "request_reviewers": return { kind: "request_reviewers", on: true, logins: step.logins };
    case "open_issue": return { kind: "open_issue", on: true, repo: step.repo, title: step.title, body: step.body };
    default: return null;
  }
}

/** The core a card maps to with its draft, or null for a card that is not a settling answer (a lone comment, a label). */
function mapCard(c: DraftCard): { key: CoreKey; draft: Draft; note?: string } | null {
  const p = c.params;
  if (p.kind === "answer") return { key: coreKey.option(p.option), draft: { extras: [] } };
  if (p.kind === "backlog") return { key: coreKey.backlog, draft: { extras: [] } };
  if (p.kind !== "resolution") return null;
  const steps = p.steps;
  const extras = steps.map((s) => extraOf(s, c.text)).filter((e): e is ChoicesBlockExtra => !!e);
  const end = steps.find((s) => ENDING.has(s.kind));
  if (p.settle?.kind === "backlog") return { key: coreKey.backlog, draft: { extras: [] } };
  if (p.settle?.kind === "answer") {
    const draft: Draft = { extras };
    if (p.settle.reason) draft.params = { reason: p.settle.reason };
    return { key: coreKey.option(p.settle.option), draft, ...(end && { note: `dropped the ${end.kind} step from the answer "${p.settle.option}"` }) };
  }
  if (!end) return null;
  switch (end.kind) {
    case "close": return { key: coreKey.close(end.reason), draft: { extras } };
    case "duplicate": return { key: coreKey.duplicate(end.of), draft: { extras } };
    case "transfer": return { key: coreKey.transfer(end.to), draft: { extras } };
    case "review": return { key: coreKey.review, draft: { extras } };
    case "fixup": return { key: end.merge ? coreKey.fixupMerge : coreKey.fixup, draft: { params: { instructions: end.instructions }, extras } };
    default: return null;
  }
}

/**
 * Maps proposed cards to choice drafts: an answer card to its option core (non-ending steps become ticked extras, the comment text the
 * comment extra, the settle reason the reason param), a backlog card to `backlog`, a closing/duplicate/transfer/fixup/review card to the
 * matching core. Cores the decision does not offer now and extras a core does not take for the item are dropped with a note.
 */
export function cardsToDrafts(db: DatabaseSync, d: DecisionRow, cards: DraftCard[]): MappedDrafts {
  const out: MappedDrafts = { cores: {}, add: [], notes: [], used: [] };
  if (!d.repo || !d.number) return out;
  const offered = coresFor(db, d);
  const mapped = new Map<number, { key: CoreKey; draft: Draft }>();
  const seen = new Set<CoreKey>();
  cards.forEach((c, i) => {
    if (c.params.kind === "resolution" && c.params.steps.some((s) => s.kind === "reopen")) out.notes.push("dropped the reopen step of a card: choices have no reopen");
    const m = mapCard(c);
    if (!m) return;
    if (m.note) out.notes.push(m.note);
    if (seen.has(m.key)) { out.notes.push(`left out a second card for ${m.key}`); return; }
    seen.add(m.key);
    mapped.set(i, m);
  });
  const adds = [...mapped.values()].map((m) => m.key).filter((k) => k.startsWith("x:"));
  const kept = new Set(adds.slice(0, MAX_ADDED_CORES));
  for (const k of adds.slice(MAX_ADDED_CORES)) out.notes.push(`left out the added choice ${k}: at most ${MAX_ADDED_CORES} are kept`);
  // The extras each core takes are what applyDrafts shows for the drafts as stored.
  const drafts: ChoicesRow["drafts"] = {};
  for (const m of mapped.values()) drafts[m.key] = { ...(m.draft.params && { params: m.draft.params }), extras: withIds(m.draft.extras) };
  const view = applyDrafts(db, d, offered, { added: [...kept], drafts } as ChoicesRow);
  for (const [i, m] of mapped) {
    const core = view.find((c) => c.key === m.key);
    const isAdded = m.key.startsWith("x:");
    if (!core || (isAdded && !kept.has(m.key))) {
      if (!core) out.notes.push(`left out ${m.key}: not available for this item now`);
      continue;
    }
    const ok = new Set(core.extras.map((e) => e.id));
    const stored = drafts[m.key]!.extras;
    const extras = m.draft.extras.filter((_, j) => ok.has(stored[j]!.id));
    for (let j = 0; j < m.draft.extras.length; j++) {
      if (!ok.has(stored[j]!.id)) out.notes.push(`dropped ${m.draft.extras[j]!.kind} from ${m.key}: not offered`);
    }
    const draft: Draft = { ...(m.draft.params && { params: m.draft.params }), extras };
    if (isAdded) out.add.push({ key: m.key, draft });
    else out.cores[m.key] = draft;
    out.used.push(i);
  }
  return out;
}

type CardRow = { id: number; params: string; text: string | null; seen: string | null };

/**
 * Gives each open decision that is its item's current question and has no choices yet the drafts of its latest Opus turn's proposed
 * cards (pick: its recommendation). The cards that became drafts are replaced; ask cards stay proposed. One transaction.
 */
export interface ConvertResult {
  converted: number;
  skipped: number;
  /** Cards written for another decision or an earlier state of it; they are not converted. */
  stale: number;
  /** Settling cards that map to no core; they are replaced. */
  unconverted: number;
  notes: string[];
}

export function convertOpenDecisions(db: DatabaseSync, o: { dryRun?: boolean } = {}): ConvertResult {
  const open = db.prepare(`SELECT * FROM main.decisions WHERE answer IS NULL AND number IS NOT NULL AND repo IS NOT NULL AND id NOT LIKE '%:dupegroup:%'
    AND NOT EXISTS (SELECT 1 FROM main.decision_choices c WHERE c.decision_id = decisions.id AND c.state = 'current')`).all() as unknown as DecisionRow[];
  let converted = 0, skipped = 0, stale = 0, unconverted = 0;
  const notes: string[] = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const d of open) {
      if (openDecision(db, d.repo!, d.number!)?.id !== d.id) { skipped++; continue; }
      const turn = db.prepare("SELECT id FROM main.conversation_turns WHERE repo = ? AND number = ? AND kind = 'opus' ORDER BY id DESC LIMIT 1").get(d.repo, d.number) as { id: number } | undefined;
      const rows = turn ? db.prepare("SELECT id, params, text, seen FROM main.conversation_cards WHERE turn_id = ? AND state = 'proposed' ORDER BY id").all(turn.id) as unknown as CardRow[] : [];
      const cards: DraftCard[] = [];
      const kept: CardRow[] = [];
      const stampNow = decisionStamp(db, d);
      for (const r of rows) {
        let params: CardParams;
        try { params = JSON.parse(r.params) as CardParams; } catch { params = { kind: "comment", text: "" }; }
        const settle = params.kind === "resolution" ? params.settle : params.kind === "answer" || params.kind === "backlog" ? params : null;
        if (settle && (settle.decision !== d.id || (settle.stamp !== undefined && settle.stamp !== stampNow))) { stale++; continue; }
        cards.push({ params, text: r.text });
        kept.push(r);
      }
      const m = cardsToDrafts(db, d, cards);
      notes.push(...m.notes.map((x) => `${d.id}: ${x}`));
      if (!turn || !m.used.length) { skipped++; continue; }
      converted++;
      if (o.dryRun) continue;
      const first = kept[m.used[0]!]!;
      const seen = (() => { try { const s = JSON.parse(first.seen ?? "{}") as { head?: string | null; last_comment?: string | null }; return { head: s.head ?? null, lastComment: s.last_comment ?? null }; } catch { return { head: null, lastComment: null }; } })();
      const pickKey = d.recommended ? (d.recommended === "backlog" ? coreKey.backlog : coreKey.option(d.recommended)) : null;
      const pick = pickKey && coresFor(db, d).some((c) => c.key === pickKey) ? { core: pickKey, reason: d.recommended_reason ?? null } : { core: null, reason: null };
      writeChoices(db, {
        decisionId: d.id, repo: d.repo!, number: d.number!, turnId: turn.id, stamp: decisionStamp(db, d), seen, source: "converted",
        drafts: Object.fromEntries([...Object.entries(m.cores), ...m.add.map((a) => [a.key, a.draft] as const)].map(([k, v]) => [k, { ...(v.params && { params: v.params }), extras: withIds(v.extras) }])),
        added: m.add.map((a) => a.key), pick,
      });
      const mark = db.prepare("UPDATE main.conversation_cards SET state = 'replaced' WHERE id = ? AND state = 'proposed'");
      for (const i of m.used) mark.run(kept[i]!.id);
      // A settling card that maps to no core would show next to the new answer list; it is replaced and counted.
      cards.forEach((c, i) => {
        const p = c.params;
        const settling = p.kind === "resolution" ? p.settle !== null || p.steps.some((s) => ENDING.has(s.kind)) : p.kind === "answer" || p.kind === "backlog" || p.kind === "resolve" || p.kind === "close" || p.kind === "duplicate";
        if (m.used.includes(i) || !settling) return;
        unconverted++;
        notes.push(`${d.id}: replaced a card that settles the decision and matches none of its choices`);
        mark.run(kept[i]!.id);
      });
    }
    db.exec(o.dryRun ? "ROLLBACK" : "COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { converted, skipped, stale, unconverted, notes };
}

/** Runs the conversion once per database (settings key `choices_converted`). */
export function convertOpenDecisionsOnce(db: DatabaseSync): ConvertResult | null {
  if (db.prepare("SELECT 1 FROM main.settings WHERE key = 'choices_converted'").get()) return null;
  const r = convertOpenDecisions(db);
  db.exec("INSERT INTO main.settings (key, value) VALUES ('choices_converted', '1') ON CONFLICT (key) DO NOTHING");
  return r;
}
