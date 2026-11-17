// Reading the model's fenced `choices` block: every extra is checked with the step checkers, every core with its extras through
// compose and validateCard. What fails is dropped with a note; what survives is what `writeChoices` and `mergeChoices` store.
import type { DatabaseSync } from "node:sqlite";
import { applicableSteps, cleanComment, decisionStamp, openDecision, parseReply, type Parsed, commentText, labelStep, assignStep, reviewersStep, unlabelStep, openIssueStep, validateCard, type NewCard, type Step } from "../conversations/cards.ts";
import { optionsOf, type DecisionRow } from "../decisions.ts";
import {
  addedCore, compose, coresFor, currentChoices, extraId, mergeChoices, MAX_ADDED_CORES, withIds, writeChoices, type Core,
} from "./choices.ts";
import { coreKey, type ChoicesBlockExtra, type ChoicesRow, type CoreKey, type ExtraKind, type StoredDraft } from "./choices-types.ts";
import { cardsToDrafts } from "./choices-convert.ts";
import { PREPARE_REASON_MAX } from "./prepare-types.ts";

/** A validated `choices` block: what a prepare writes whole and a conversation turn merges. */
export interface ParsedChoices {
  pick: { core: CoreKey | null; reason: string | null };
  /** Each core the reply drafted, by key. */
  cores: Record<CoreKey, { params?: StoredDraft["params"]; extras: ChoicesBlockExtra[] }>;
  /** Cores the reply adds. */
  add: { key: CoreKey; draft: { params?: StoredDraft["params"]; extras: ChoicesBlockExtra[] } }[];
  /** Added cores the reply removes. */
  drop: CoreKey[];
}

export interface ChoicesReply {
  /** The reply's text before the block. */
  text: string;
  /** Null: the reply has no block, or it is unusable (see `notes`). */
  choices: ParsedChoices | null;
  /** The question to the author as a proposed comment card, when the block has a valid `ask`. */
  ask: NewCard | null;
  notes: string[];
  /** The pick's core when it was dropped or does not exist; asks for a repeat. */
  pickLost: CoreKey | null;
  /** The reply has a choices block (valid or not). */
  hasBlock: boolean;
}

const FENCE = /```choices[ \t]*\r?\n([\s\S]*?)```[ \t]*$/;
const MAX_EXTRAS = 8;
const KINDS: ExtraKind[] = ["comment", "open_issue", "label", "unlabel", "assign", "request_reviewers"];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const plain = (note: string): string => note.replace(/^dropped (a resolution|a card)[: ]*/, "");

function blockOf(reply: string): { text: string; json: string | null } {
  const t = reply.trimEnd(), m = FENCE.exec(t);
  return { text: (m ? t.slice(0, m.index) : reply).trim(), json: m ? m[1]! : null };
}

/** One drafted extra checked with its step checker, or why it is dropped. */
function checkExtra(db: DatabaseSync, repo: string, n: number, raw: unknown, removing: string[], drop: ReadonlySet<string>): { extra: ChoicesBlockExtra } | { note: string } {
  if (!isObj(raw)) return { note: "an extra is not an object" };
  const kind = raw.kind as ExtraKind;
  if (!KINDS.includes(kind)) return { note: `unknown extra "${String(raw.kind).slice(0, 40)}"` };
  const on = raw.on === true;
  const step = (r: { value: Step } | { note: string }): { value: Step } | { note: string } => ("note" in r ? { note: plain(r.note) } : r);
  switch (kind) {
    case "comment": {
      const t = commentText(raw.text, drop);
      return "note" in t ? { note: plain(t.note) } : { extra: { kind, on, text: t.value } };
    }
    case "label": {
      const r = step(labelStep(db, repo, n, raw.label, removing));
      return "note" in r ? r : { extra: { kind, on, label: (r.value as Extract<Step, { kind: "label" }>).label } };
    }
    case "unlabel": {
      const r = step(unlabelStep(db, repo, n, raw.label));
      return "note" in r ? r : { extra: { kind, on, label: (r.value as Extract<Step, { kind: "unlabel" }>).label } };
    }
    case "assign": {
      const r = step(assignStep(db, repo, n, raw.login));
      return "note" in r ? r : { extra: { kind, on, login: (r.value as Extract<Step, { kind: "assign" }>).login } };
    }
    case "request_reviewers": {
      const r = step(reviewersStep(db, repo, n, raw.logins));
      return "note" in r ? r : { extra: { kind, on, logins: (r.value as Extract<Step, { kind: "request_reviewers" }>).logins } };
    }
    case "open_issue": {
      const r = step(openIssueStep(db, { repo: raw.repo ?? repo, title: raw.title, body: raw.body }, drop));
      if ("note" in r) return r;
      const v = r.value as Extract<Step, { kind: "open_issue" }>;
      return { extra: { kind, on, repo: v.repo, title: v.title, body: v.body } };
    }
  }
}

const composeExtra = (e: ChoicesBlockExtra) => ({ ...e, id: extraId(e) });

/**
 * A core with its drafted params and extras. The core alone is validated first (a core that fails is dropped), then the extras
 * one at a time on top of the ones kept, so an extra that breaks the card is dropped alone.
 */
function checkCore(db: DatabaseSync, repo: string, n: number, core: Core, raw: { reason?: unknown; instructions?: unknown; extras?: unknown }, drop: ReadonlySet<string>, notes: string[]): { draft: { params?: StoredDraft["params"]; extras: ChoicesBlockExtra[] } } | null {
  const params: { reason?: string; instructions?: string } = {};
  if (core.closing && typeof raw.reason === "string") {
    const r = cleanComment(raw.reason);
    if (r && drop.has(r)) notes.push(`left out the reason of ${core.key}: it mentions the reference folder or its documentation`);
    else if (r) params.reason = r;
  }
  if (core.params && "instructions" in core.params && typeof raw.instructions === "string") params.instructions = raw.instructions.trim();
  const base = compose(core, [], params);
  if ("note" in base) { notes.push(`dropped the choice ${core.key}: ${base.note}`); return null; }
  const v = validateCard(db, repo, n, base.card, drop);
  if ("note" in v) { notes.push(`dropped the choice ${core.key}: ${plain(v.note)}`); return null; }
  const settle = v.card.params.kind === "resolution" ? v.card.params.settle : null;
  const stored: StoredDraft["params"] = {};
  if (core.closing && settle?.kind === "answer" && settle.reason) stored.reason = settle.reason;
  else if (core.closing && params.reason && settle?.kind === "answer") stored.reason = params.reason;
  if (params.instructions) stored.instructions = params.instructions;
  const list = Array.isArray(raw.extras) ? raw.extras.slice(0, MAX_EXTRAS) : [];
  const removing = list.flatMap((x) => (isObj(x) && x.kind === "unlabel" && typeof x.label === "string" ? [x.label] : []));
  const kept: ChoicesBlockExtra[] = [];
  for (const x of list) {
    const c = checkExtra(db, repo, n, x, removing, drop);
    if ("note" in c) { notes.push(`dropped the ${isObj(x) ? String(x.kind).slice(0, 20) : "?"} extra of ${core.key} (${c.note})`); continue; }
    if (!core.allowed.includes(c.extra.kind)) { notes.push(`dropped the ${c.extra.kind} extra of ${core.key}: it is not offered with that choice`); continue; }
    const trial = [...kept, c.extra];
    const comp = compose(core, trial.map(composeExtra), params);
    if ("note" in comp) { notes.push(`dropped the ${c.extra.kind} extra of ${core.key} (${comp.note})`); continue; }
    const tv = validateCard(db, repo, n, comp.card, drop);
    if ("note" in tv) { notes.push(`dropped the ${c.extra.kind} extra of ${core.key} (${plain(tv.note)})`); continue; }
    kept.push(c.extra);
  }
  return { draft: { ...(Object.keys(stored).length && { params: stored }), extras: kept } };
}

/** The key of an added core from the `end` of an `add` entry, or null. */
function endKey(end: unknown): CoreKey | null {
  if (!isObj(end)) return null;
  if (end.close === "completed" || end.close === "not_planned") return coreKey.close(end.close);
  if (Number.isInteger(end.duplicate) && (end.duplicate as number) > 0) return coreKey.duplicate(end.duplicate as number);
  if (typeof end.transfer === "string" && end.transfer.trim()) return coreKey.transfer(end.transfer.trim().replace(/^[^/]*\//, ""));
  if (end.fixup === true) return coreKey.fixup;
  if (end.review === true) return coreKey.review;
  return null;
}

const reasonOf = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, PREPARE_REASON_MAX) : "";
  return s || null;
};

/**
 * Reads a reply's `choices` block for decision `d` of item repo#n. Null: the reply has no text. `fresh` (a prepare): the block
 * replaces everything, so cores Opus added earlier are not offered. `pickOnly`, or a decision without cores (a group, a number-0 decision),
 * takes the pick only, as `o:<option key>`; its drafts are ignored.
 * `drop`: cleaned texts the reply lint still flagged after the fix turn; extras with them are dropped.
 */
export function parseChoices(db: DatabaseSync, repo: string, n: number, d: DecisionRow, reply: string, drop: ReadonlySet<string> = new Set(), o: { fresh?: boolean; pickOnly?: boolean } = {}): ChoicesReply | null {
  const { text, json } = blockOf(reply);
  if (!text) return null;
  const out: ChoicesReply = { text, choices: null, ask: null, notes: [], pickLost: null, hasBlock: json !== null };
  if (json === null) return out;
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { raw = null; }
  if (!isObj(raw)) { out.notes.push("dropped the choices block: it is not a JSON object"); return out; }
  if (!isObj(raw.pick) || (raw.pick.core !== null && typeof raw.pick.core !== "string")) { out.notes.push("dropped the choices block: it has no pick with a core or null"); return out; }
  const pickRaw = raw.pick.core as string | null, reason = reasonOf(raw.pick.reason);
  const offered = coresFor(db, d);
  const notes = out.notes;
  const ask = (() => {
    if (!isObj(raw.ask)) return null;
    const v = validateCard(db, repo, n, { kind: "resolution", steps: [{ kind: "comment" }], settle: null, text: raw.ask.text }, drop);
    if ("note" in v) { notes.push(`dropped the question to the author: ${plain(v.note)}`); return null; }
    return v.card;
  })();
  out.ask = ask;

  if (o.pickOnly || !offered.length) {
    const keys = optionsOf(d).map((x) => coreKey.option(x.key));
    if (pickRaw !== null && !keys.includes(pickRaw)) { out.pickLost = pickRaw; notes.push(`dropped the pick ${pickRaw}: it is not an option of the decision`); }
    const core = pickRaw !== null && keys.includes(pickRaw) ? pickRaw : null;
    out.choices = { pick: { core, reason: core ? reason : null }, cores: {}, add: [], drop: [] };
    return out;
  }

  const applicable = new Set(applicableSteps(db, repo, n));
  const cur = o.fresh ? undefined : currentChoices(db, d.id);
  const dropRaw = Array.isArray(raw.drop) ? raw.drop.filter((k): k is string => typeof k === "string") : [];
  const drops = dropRaw.filter((k) => cur?.added.includes(k));
  const existing: Core[] = [...offered];
  for (const k of cur?.added ?? []) {
    if (drops.includes(k)) continue;
    const c = addedCore(db, d, k, applicable);
    if (c) existing.push(c);
  }
  const lost = new Set<CoreKey>();
  const out_: ParsedChoices = { pick: { core: null, reason: null }, cores: {}, add: [], drop: drops };

  // Added cores first, so a pick may name one.
  const newCores: Core[] = [];
  const capped = new Set<CoreKey>();
  let room = MAX_ADDED_CORES - existing.filter((c) => c.key.startsWith("x:")).length;
  for (const a of Array.isArray(raw.add) ? raw.add.slice(0, MAX_ADDED_CORES * 2) : []) {
    if (!isObj(a)) continue;
    const key = endKey(a.end);
    if (!key) { notes.push("dropped an added choice without a valid end (close, duplicate, transfer, fixup or review)"); continue; }
    const known = [...existing, ...newCores].find((c) => c.key === key);
    if (!known && room <= 0) { notes.push(`left out the added choice ${key}: at most ${MAX_ADDED_CORES} are kept`); capped.add(key); continue; }
    const core = known ?? addedCore(db, d, key, applicable);
    if (!core) { notes.push(`left out the added choice ${key}: it does not apply to this item now`); lost.add(key); continue; }
    const r = checkCore(db, repo, n, core, { instructions: a.instructions, extras: a.extras }, drop, notes);
    if (!r) { lost.add(key); continue; }
    if (!known) { newCores.push(core); room--; }
    out_.add = out_.add.filter((x) => x.key !== key);
    out_.add.push({ key, draft: r.draft });
  }

  const seen = new Set<CoreKey>();
  for (const c of Array.isArray(raw.cores) ? raw.cores.slice(0, 20) : []) {
    if (!isObj(c) || typeof c.core !== "string") { notes.push("dropped a choice entry without a core key"); continue; }
    const core = existing.find((x) => x.key === c.core);
    if (!core) { notes.push(`dropped the choice ${c.core.slice(0, 60)}: it is not one of the offered choices`); continue; }
    if (seen.has(core.key)) { notes.push(`dropped a second entry for the choice ${core.key}`); continue; }
    seen.add(core.key);
    const r = checkCore(db, repo, n, core, c, drop, notes);
    if (!r) { lost.add(core.key); continue; }
    out_.cores[core.key] = r.draft;
  }

  if (pickRaw !== null && capped.has(pickRaw)) {
    // The pick's core was left out by the cap: the earlier pick stays.
    const old = cur?.pick.core && [...existing].some((c) => c.key === cur.pick.core) && !drops.includes(cur.pick.core) ? cur.pick : { core: null, reason: null };
    out_.pick = old;
    notes.push(`kept the earlier pick: ${pickRaw} was left out`);
  } else if (pickRaw !== null) {
    const live = [...existing, ...newCores].some((c) => c.key === pickRaw) && !lost.has(pickRaw);
    if (live) out_.pick = { core: pickRaw, reason };
    else {
      out.pickLost = pickRaw;
      if (!lost.has(pickRaw)) notes.push(`dropped the pick ${pickRaw.slice(0, 60)}: it is not one of the choices`);
    }
  }
  out.choices = out_;
  return out;
}

/** The public texts of a reply's choices block with their field names, for the reference checks. */
export function choicesTexts(reply: string): { field: string; text: string }[] {
  const { json } = blockOf(reply);
  if (json === null) return [];
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return []; }
  if (!isObj(raw)) return [];
  const out: { field: string; text: string }[] = [];
  const add = (field: string, v: unknown, oneLine = false) => {
    const t = typeof v === "string" ? (oneLine ? cleanComment(v).replace(/\s+/g, " ") : cleanComment(v)) : "";
    if (t) out.push({ field, text: t });
  };
  const extras = (path: string, list: unknown) => {
    if (!Array.isArray(list)) return;
    list.slice(0, MAX_EXTRAS).forEach((e, j) => {
      if (!isObj(e)) return;
      add(`${path}.extras[${j}].text`, e.text);
      add(`${path}.extras[${j}].title`, e.title, true);
      add(`${path}.extras[${j}].body`, e.body);
    });
  };
  if (Array.isArray(raw.cores)) raw.cores.slice(0, 20).forEach((c, i) => {
    if (!isObj(c)) return;
    add(`cores[${i}].reason`, c.reason);
    extras(`cores[${i}]`, c.extras);
  });
  if (Array.isArray(raw.add)) raw.add.slice(0, MAX_ADDED_CORES * 2).forEach((a, i) => { if (isObj(a)) extras(`add[${i}]`, a.extras); });
  if (isObj(raw.ask)) add("ask.text", raw.ask.text);
  return out;
}

// ---- A conversation turn ---------------------------------------------------------------

/** What a conversion of settling action cards into drafts gives back; see `hooks.settlingCardsToDrafts`. */
export interface SettlingDrafts {
  /** Drafts to merge into the turn's choices; null: the cards are dropped. */
  patch: { cores: ParsedChoices["cores"]; add: ParsedChoices["add"]; pick: ParsedChoices["pick"] | null } | null;
  notes: string[];
}

/**
 * Settling action cards of a conversation turn become drafts through `cardsToDrafts`; cards that map to no core are dropped with a note.
 * Tests or other callers may replace the hook.
 */
export const hooks: { settlingCardsToDrafts: (db: DatabaseSync, repo: string, n: number, d: DecisionRow, cards: NewCard[]) => SettlingDrafts } = {
  settlingCardsToDrafts: (db, _repo, _n, d, cards) => {
    const r = cardsToDrafts(db, d, cards.map((c) => ({ params: c.params, text: c.text })));
    const notes = [...r.notes];
    const unmapped = cards.length - r.used.length;
    if (unmapped > 0) notes.push(`dropped ${unmapped === 1 ? "a card" : `${unmapped} cards`} that settle the decision without matching one of its choices`);
    return { patch: r.used.length ? { cores: r.cores, add: r.add, pick: null } : null, notes };
  },
};

export interface TurnReply extends Parsed {
  /** The valid choices of the reply, for the decision below. */
  choices?: ParsedChoices;
  decision?: DecisionRow;
}

const isAsk = (c: NewCard): boolean => c.params.kind === "resolution" && !c.params.settle;

/**
 * A conversation reply. On an item whose open decision has cores the reply's block is `choices`; settling cards of an `actions`
 * block go through `hooks.settlingCardsToDrafts`, a card that only asks the author is kept. Otherwise it is `parseReply`.
 */
export function parseTurn(db: DatabaseSync, repo: string, n: number, reply: string, drop: ReadonlySet<string> = new Set()): TurnReply | null {
  const d = openDecision(db, repo, n);
  if (!d || !coresFor(db, d).length) return parseReply(db, repo, n, reply, drop);
  const c = parseChoices(db, repo, n, d, reply, drop);
  if (!c) return null;
  const notes = [...c.notes];
  const cards: NewCard[] = c.ask ? [c.ask] : [];
  // Without a choices block the actions fence is cut off the text by parseReply.
  let text = c.text;
  let choices = c.choices ?? undefined;
  if (!c.hasBlock) {
    const r = parseReply(db, repo, n, reply, drop);
    if (r) {
      text = r.text;
      notes.push(...r.notes);
      if (!cards.length) cards.push(...r.cards.filter(isAsk).slice(0, 1));
      const settling = r.cards.filter((x) => !isAsk(x));
      if (settling.length) {
        const h = hooks.settlingCardsToDrafts(db, repo, n, d, settling);
        notes.push(...h.notes);
        if (h.patch) choices = { cores: h.patch.cores, add: h.patch.add, drop: [], pick: h.patch.pick ?? currentChoices(db, d.id)?.pick ?? { core: null, reason: null } };
      }
    }
  }
  return { text, cards, notes, ...(choices && { choices, decision: d }) };
}

/**
 * Stores validated choices for a decision: a prepare writes a whole new row, a conversation turn merges into the current one.
 * Call inside the transaction that inserts the turn (`turnId`); `seen` is the item snapshot JSON the turn was written against.
 */
export function storeParsedChoices(db: DatabaseSync, d: DecisionRow, p: ParsedChoices, o: { turnId: number | null; seen: string | null; source: "prepare" | "conversation"; by?: string | null; /** The decision's stamp when the reply's prompt was built. */ stampThen?: string | null }): void {
  // A late reply: the decision was answered, undone or asked again while the call ran.
  const now = db.prepare("SELECT * FROM main.decisions WHERE id = ?").get(d.id) as unknown as DecisionRow | undefined;
  if (!now || now.answer !== null || (o.stampThen != null && decisionStamp(db, now) !== o.stampThen)) return;
  let seen: ChoicesRow["seen"] = { head: null, lastComment: null };
  try { const v = JSON.parse(o.seen ?? "{}") as { head?: string | null; last_comment?: string | null }; seen = { head: v.head ?? null, lastComment: v.last_comment ?? null }; } catch { /* no snapshot */ }
  const stamp = decisionStamp(db, d);
  const by = o.by === undefined ? {} : { by: o.by };
  if (o.source === "conversation") {
    mergeChoices(db, d.id, { turnId: o.turnId, stamp, seen, cores: p.cores, add: p.add, drop: p.drop, pick: p.pick }, by);
    return;
  }
  const drafts: ChoicesRow["drafts"] = {};
  for (const [k, v] of Object.entries(p.cores)) drafts[k] = { ...(v.params && { params: v.params }), extras: withIds(v.extras) };
  for (const a of p.add) drafts[a.key] = { ...(a.draft.params && { params: a.draft.params }), extras: withIds(a.draft.extras) };
  writeChoices(db, { decisionId: d.id, repo: d.repo!, number: d.number!, turnId: o.turnId, stamp, seen, source: "prepare", drafts, added: p.add.map((a) => a.key), pick: p.pick }, by);
}

/** The compact `<choices>` JSON a turn block carries: the pick and the drafts as validated. */
export function choicesJson(p: ParsedChoices): string {
  return JSON.stringify({
    pick: p.pick,
    cores: Object.entries(p.cores).map(([core, v]) => ({ core, ...v.params, extras: v.extras })),
    ...(p.add.length && { add: p.add.map((a) => ({ core: a.key, ...a.draft.params, extras: a.draft.extras })) }),
    ...(p.drop.length && { drop: p.drop }),
  });
}
