// Decision answers as one core action plus extras: the core list built from the decision and the item, Opus's drafts
// over it, the composition of a chosen core and ticked extras into one resolution card, and the `decision_choices` store.
// Only Opus's drafts and pick are stored; the offered cores are computed whenever they are read.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { writeEffect } from "../act/index.ts";
import { applicableSteps } from "../conversations/cards.ts";
import { getDecision, optionsOf, type DecisionRow, type Kind } from "../decisions.ts";
import {
  coreKey, MAX_ADDED_CORES, parseCoreKey,
  type ActionTag, type ChoiceCore, type ChoiceExtra, type ChoicesBlockExtra, type ChoicesRow, type ChoicesSource, type CoreKey, type ExtraKind,
  type ParsedCoreKey, type StoredDraft, type StoredExtra,
} from "./choices-types.ts";

/** Most cores Opus may add on top of the offered ones. */
export { MAX_ADDED_CORES };

/** A core with what building a card from it needs. The `ChoiceCore` fields are what the web receives. */
export interface Core extends ChoiceCore {
  parsed: ParsedCoreKey;
  /** The decision the card settles. */
  decision: string;
  /** Extra kinds the core takes for this item as it is now (the base set for the core, cut to the steps that can validate). */
  allowed: ExtraKind[];
  /** An option that closes with a reason (the `reason` param). */
  closing: boolean;
  /** A fix-up core on a scope decision: it records a keep answer (small-extra or take) before the fix-up. */
  keepsInCore: boolean;
  /** The item already carries the "small extra" label. */
  hasSmallExtra: boolean;
}

/** One extra as the user sends it: the id of an offered extra and the user's own texts. */
export interface ComposeExtra {
  id: string;
  kind: ExtraKind;
  text?: string;
  title?: string;
  body?: string;
  label?: string;
  login?: string;
  logins?: string[];
  repo?: string;
}

export const EXTRA_TAG: Record<ExtraKind, ActionTag> = {
  comment: "comment", open_issue: "open_issue", label: "label", unlabel: "unlabel", assign: "assign", request_reviewers: "request_review",
};

const NON_ENDING: ExtraKind[] = ["comment", "label", "unlabel", "assign", "request_reviewers", "open_issue"];
/** Extra kinds always offered (with empty text) when the core takes them; the others only when Opus drafted them. */
const ALWAYS: ExtraKind[] = ["comment", "open_issue"];
const NO_ISSUE_OPTIONS = (key: string): boolean => key === "hold" || key === "need-info" || key.startsWith("keep");

/** The id of an extra within its core: its kind, plus the label for label and unlabel. */
export function extraId(e: { kind: ExtraKind; label?: string }): string {
  return e.kind === "label" || e.kind === "unlabel" ? `${e.kind}:${e.label ?? ""}` : e.kind;
}

/** Gives block extras their ids; a repeated id gets a numeric suffix. */
export function withIds(extras: ChoicesBlockExtra[]): StoredExtra[] {
  const seen = new Map<string, number>();
  return extras.map((e) => {
    const base = extraId(e), n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...e, id: n === 1 ? base : `${base}#${n}` };
  });
}

const itemOf = (db: DatabaseSync, repo: string, n: number): { kind: string } | undefined =>
  db.prepare("SELECT kind FROM items WHERE repo = ? AND number = ?").get(repo, n) as { kind: string } | undefined;

/** The GitHub writes an option makes when it is the answer. */
function optionWrites(kind: Kind, key: string): ActionTag[] {
  const effect = writeEffect(kind, key) ?? "";
  const out: ActionTag[] = [];
  if (/\bmerges\b/.test(effect)) out.push("merge");
  if (/\bcloses\b/.test(effect)) out.push("comment", "close");
  return out;
}

/**
 * What AutoCraft itself does after an answer, as one short fixed phrase per core (the dashboard shows it beside the GitHub writes).
 * Each phrase follows the pipeline: scope take / small-extra stay in core (PRs go to review, an issue may get a fix attempt: src/decisions-used.ts),
 * plugin makes the Label stage add the plugin candidate label, need-info and Hold only keep the item out of later stages, a merge answer
 * goes through verify, CI and the merge queue (src/core/decide.ts), and every answer that closes or moves the item ends the work on it here.
 */
export function autocraftLine(p: ParsedCoreKey, kind: string, itemKind: string): string {
  switch (p.type) {
    case "backlog": return "moves it to the Backlog";
    case "fixup-merge": return kind === "scope" ? "keeps it in core, pushes the fix-up, reviews again and merges if both pass" : "pushes the fix-up, reviews again, merges if both pass";
    case "close": return "records the answer and stops working on it";
    case "duplicate": return "records it as a duplicate and stops working on it";
    case "transfer": return "stops working on it here";
    case "fixup": return kind === "scope" ? "keeps it in core, pushes the fix-up and reviews again" : "pushes the fix-up and reviews again";
    case "review": return "reviews the PR again, then asks again if needed";
    case "option": break;
  }
  switch (p.option) {
    case "merge": return "queues it: merges after CI and checks pass";
    case "hold": return kind === "merge" ? "holds the merge until someone answers again" : "keeps it open and waits";
    case "close": return "records the answer and stops working on it";
    case "keep": return kind === "duplicate" ? "keeps this one and works on it as before" : "keeps it open and does not ask again at this head";
    case "take": case "small-extra": return itemKind === "pr" ? "keeps working: review, fix-up, merge" : "keeps working: may try a fix";
    case "plugin": return "adds the plugin candidate label later";
    case "need-info": return "keeps it out of later stages until asked again";
    case "wait": return "keeps it open and leaves it to the author; asks again after a new commit or review";
    case "accept": return "closes the duplicates and keeps the original";
    case "distinct": return "records that they differ and works on each";
  }
  if (p.option.startsWith("keep:")) return "closes the other duplicates and keeps this one";
  return "records the answer";
}

const labelsOf = (db: DatabaseSync, repo: string, n: number): string[] => {
  try { return JSON.parse((db.prepare("SELECT labels FROM items WHERE repo = ? AND number = ?").get(repo, n) as { labels: string | null } | undefined)?.labels ?? "[]") as string[]; } catch { return []; }
};

const mk = (db: DatabaseSync, d: DecisionRow, key: CoreKey, label: string, o: { writes: ActionTag[]; base: ExtraKind[]; applicable: Set<string>; closing?: boolean }): Core => {
  const parsed = parseCoreKey(key)!;
  const allowed = o.base.filter((k) => o.applicable.has(k));
  return {
    key, label, writes: o.writes, autocraft: autocraftLine(parsed, d.kind, itemOf(db, d.repo!, d.number!)?.kind ?? "issue"), extras: [], drafted: false, parsed, decision: d.id, allowed, closing: !!o.closing,
    keepsInCore: d.kind === "scope" && (parsed.type === "fixup-merge" || parsed.type === "fixup"),
    hasSmallExtra: labelsOf(db, d.repo!, d.number!).some((l) => String(l).toLowerCase() === "small extra"),
    ...(o.closing && { params: { reason: "" } }),
  };
};

/**
 * The cores offered for a decision about one item: the options (not Backlog), "Fix up first, then merge" where it applies, then Backlog.
 * Extras are not filled in; `applyDrafts` adds Opus's drafts and the always-offered extras. A group or batch decision has no cores here.
 */
export function coresFor(db: DatabaseSync, d: DecisionRow): Core[] {
  if (!d.repo || !d.number || d.id.includes(":dupegroup:") || !itemOf(db, d.repo, d.number)) return [];
  const applicable = new Set(applicableSteps(db, d.repo, d.number));
  const out: Core[] = [];
  // A Hold question always offers a new review first: the other cores follow the options.
  if (d.kind === "hold") { const c = addedCore(db, d, coreKey.review, applicable); if (c) out.push(c); }
  for (const o of optionsOf(d)) {
    if (o.key === "backlog") continue;
    const effect = writeEffect(d.kind, o.key);
    const base: ExtraKind[] = effect
      ? ["label", "unlabel", "assign", "open_issue", ...(/\bmerges\b/.test(effect) ? ["comment" as const] : [])]
      : ["comment", "label", "unlabel", "assign", "request_reviewers", ...(NO_ISSUE_OPTIONS(o.key) ? [] : ["open_issue" as const])];
    out.push(mk(db, d, coreKey.option(o.key), o.label, { writes: optionWrites(d.kind, o.key).filter((t) => t !== "comment" || applicable.has("comment")), base, applicable, closing: /\bcloses\b/.test(effect ?? "") && applicable.has("comment") }));
  }
  if (applicable.has("fixup with merge")) {
    const c = mk(db, d, coreKey.fixupMerge, "Fix up first, then merge", { writes: ["push", "merge"], base: NON_ENDING, applicable });
    c.params = { instructions: "" };
    out.push(c);
  }
  out.push(mk(db, d, coreKey.backlog, "Later", { writes: [], base: [], applicable }));
  return out;
}

/** The cores as the prompt lists them: key, label and the extra kinds each takes. */
export function coreSummaries(db: DatabaseSync, d: DecisionRow): { key: CoreKey; label: string; extras: ExtraKind[] }[] {
  return coresFor(db, d).map((c) => ({ key: c.key, label: c.label, extras: c.allowed }));
}

/** A core only Opus adds, or null when its key is outside the scheme or cannot apply to the item now. */
export function addedCore(db: DatabaseSync, d: DecisionRow, key: CoreKey, applicable: Set<string>): Core | null {
  const p = parseCoreKey(key);
  if (!p) return null;
  const isPr = itemOf(db, d.repo!, d.number!)?.kind === "pr";
  const c = (label: string, step: string, writes: ActionTag[], base: ExtraKind[], params?: Core["params"]): Core | null =>
    applicable.has(step) ? { ...mk(db, d, key, label, { writes, base, applicable }), ...(params && { params }) } : null;
  switch (p.type) {
    case "close": return c(isPr ? "Close PR" : `Close issue as ${p.reason === "completed" ? "completed" : "not planned"}`, "close", ["close"], ["comment", "label", "unlabel", "open_issue"]);
    case "duplicate": return c(`Close as duplicate of #${p.of}`, "duplicate", ["close"], ["comment", "label", "unlabel"], { target: String(p.of) });
    case "transfer": return c(`Move issue to ${p.repo}`, "transfer", ["move"], ["comment", "label"], { target: p.repo });
    case "fixup": return c("Fix up the PR", "fixup", ["push"], NON_ENDING, { instructions: "" });
    case "review": return c("Review the PR again", "review", [], ["comment", "label", "request_reviewers"]);
    default: return null;
  }
}

const viewExtra = (e: StoredExtra, core: Core, d: DecisionRow): ChoiceExtra => ({
  id: e.id, kind: e.kind, tag: EXTRA_TAG[e.kind], on: e.on,
  ...(e.text !== undefined && { text: e.text }),
  ...(e.title !== undefined && { title: e.title }),
  ...(e.body !== undefined && { body: e.body }),
  ...(e.label !== undefined && { label: e.label }),
  ...(e.login !== undefined && { login: e.login }),
  ...(e.logins !== undefined && { logins: e.logins }),
  ...((e.repo !== undefined || e.kind === "open_issue") && { repo: e.repo ?? d.repo ?? undefined }),
});

/**
 * Puts Opus's drafts over the offered cores: params and extras per core, the cores Opus added, and an empty comment and open_issue
 * extra where a core takes them. A drafted extra the core does not take for this item now is left out. Returns new cores.
 */
export function applyDrafts(db: DatabaseSync, d: DecisionRow, cores: Core[], row: ChoicesRow | undefined): Core[] {
  const applicable = new Set(applicableSteps(db, d.repo!, d.number!));
  const all = [...cores];
  if (row) {
    const at = all.findIndex((c) => c.key === coreKey.backlog);
    const extra: Core[] = [];
    for (const key of row.added.slice(0, MAX_ADDED_CORES)) {
      if (all.some((c) => c.key === key) || extra.some((c) => c.key === key)) continue;
      const c = addedCore(db, d, key, applicable);
      if (c) extra.push(c);
    }
    all.splice(at < 0 ? all.length : at, 0, ...extra);
  }
  return all.map((core) => {
    const draft: StoredDraft | undefined = row?.drafts[core.key];
    const extras = (draft?.extras ?? []).filter((e) => core.allowed.includes(e.kind)).map((e) => viewExtra(e, core, d));
    for (const kind of ALWAYS) {
      if (core.allowed.includes(kind) && !extras.some((e) => e.kind === kind)) {
        extras.push(viewExtra({ id: kind, kind, on: false, ...(kind === "comment" ? { text: "" } : { title: "", body: "" }) }, core, d));
      }
    }
    let params = core.params;
    if (core.closing) params = { ...params, reason: draft?.params?.reason ?? params?.reason ?? "" };
    if (params && "instructions" in params) params = { ...params, instructions: draft?.params?.instructions ?? params.instructions ?? "" };
    return { ...core, ...(params && { params }), extras, drafted: !!draft };
  });
}

/**
 * On a scope decision a fix-up core also keeps the PR in core: the answer is small-extra when the card adds the "small extra" label
 * or the PR already has it, else take. It is recorded before the fix-up runs, so the fix-up's plan check and the review see the PR in core.
 */
function keepAnswer(core: Core, steps: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!core.keepsInCore) return null;
  return { kind: "answer", option: steps.some((s) => s.kind === "label" && s.label === "small extra") || core.hasSmallExtra ? "small-extra" : "take" };
}

/**
 * The raw resolution (as `validateCard` takes it) for a core, the chosen extras and the user's params; or why it cannot be built.
 * The caller validates it. Step order: comment, labels, unlabels, assign, request_reviewers, open_issue, fix-up or review, ending step.
 */
export function compose(core: Core, extras: ComposeExtra[], params: { reason?: string; instructions?: string } = {}): { card: Record<string, unknown> } | { note: string } {
  const ids = new Set<string>();
  for (const e of extras) {
    if (!core.allowed.includes(e.kind)) return { note: `"${e.kind}" is not offered with "${core.label}"` };
    if (ids.has(e.id)) return { note: `the extra ${e.id} is chosen twice` };
    ids.add(e.id);
  }
  const of = (k: ExtraKind) => extras.filter((e) => e.kind === k);
  const steps: Record<string, unknown>[] = [];
  let text: string | undefined;
  for (const e of of("comment")) { steps.push({ kind: "comment" }); text = e.text; }
  for (const e of of("label")) steps.push({ kind: "label", label: e.label });
  for (const e of of("unlabel")) steps.push({ kind: "unlabel", label: e.label });
  for (const e of of("assign")) steps.push({ kind: "assign", login: e.login });
  for (const e of of("request_reviewers")) steps.push({ kind: "request_reviewers", logins: e.logins });
  for (const e of of("open_issue")) steps.push({ kind: "open_issue", repo: e.repo, title: e.title, body: e.body });
  let settle: Record<string, unknown> | null = null;
  const p = core.parsed;
  switch (p.type) {
    case "option": settle = { kind: "answer", option: p.option, ...(core.closing && params.reason?.trim() && { reason: params.reason }) }; break;
    case "backlog": settle = { kind: "backlog" }; break;
    case "fixup-merge": steps.push({ kind: "fixup", instructions: params.instructions ?? "", merge: true }); settle = keepAnswer(core, steps); break;
    case "fixup": steps.push({ kind: "fixup", instructions: params.instructions ?? "", merge: false }); settle = keepAnswer(core, steps); break;
    case "review": steps.push({ kind: "review" }); break;
    case "close": steps.push({ kind: "close", reason: p.reason }); break;
    case "duplicate": steps.push({ kind: "duplicate", of: p.of }); break;
    case "transfer": steps.push({ kind: "transfer", to: p.repo }); break;
  }
  return { card: { kind: "resolution", steps, settle, ...(text !== undefined && { text }) } };
}

// ---- Store ------------------------------------------------------------------------

type Raw = { id: string; decision_id: string; repo: string; number: number; turn_id: number | null; stamp: string; seen: string | null; source: string; drafts: string; added: string; pick: string; state: string; created_at: string };

const json = <T>(s: string | null, fallback: T): T => {
  try { return s === null ? fallback : (JSON.parse(s) as T); } catch { return fallback; }
};

/** A key written while the keep answer was part of the fix-up core's key (`fixup-merge:take`, `x:fixup:small-extra`) reads as the plain key. */
const plainKey = (k: CoreKey): CoreKey => k.replace(/^(fixup-merge|x:fixup):(small-extra|take)$/, "$1");

function rowOf(r: Raw): ChoicesRow {
  const seen = json<{ head?: string | null; last_comment?: string | null }>(r.seen, {});
  const pick = json<ChoicesRow["pick"]>(r.pick, { core: null, reason: null });
  return {
    id: r.id, decisionId: r.decision_id, repo: r.repo, number: r.number, turnId: r.turn_id, stamp: r.stamp,
    seen: { head: seen.head ?? null, lastComment: seen.last_comment ?? null },
    source: r.source as ChoicesSource, drafts: Object.fromEntries(Object.entries(json<ChoicesRow["drafts"]>(r.drafts, {})).map(([k, v]) => [plainKey(k), v])), added: json<CoreKey[]>(r.added, []).map(plainKey),
    pick: pick.core ? { ...pick, core: plainKey(pick.core) } : pick, state: r.state as ChoicesRow["state"], createdAt: r.created_at,
  };
}

/** The `seen` JSON conversation cards carry ({head, last_comment}). */
export const seenJson = (s: ChoicesRow["seen"]): string => JSON.stringify({ head: s.head, last_comment: s.lastComment });

/** The decision's current choices, or undefined. */
export function currentChoices(db: DatabaseSync, decisionId: string): ChoicesRow | undefined {
  const r = db.prepare("SELECT * FROM main.decision_choices WHERE decision_id = ? AND state = 'current' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(decisionId) as Raw | undefined;
  return r && rowOf(r);
}

export function choicesById(db: DatabaseSync, id: string): ChoicesRow | undefined {
  const r = db.prepare("SELECT * FROM main.decision_choices WHERE id = ?").get(id) as Raw | undefined;
  return r && rowOf(r);
}

/**
 * Stores a new full row as the decision's current choices; earlier ones become replaced. An option pick also sets the decision's
 * recommendation (and `recommended_by` when `by` is given), any other pick clears it. Runs in its own transaction unless the caller has one.
 */
export function writeChoices(db: DatabaseSync, row: Omit<ChoicesRow, "id" | "state" | "createdAt">, o: { by?: string | null; now?: Date } = {}): ChoicesRow {
  const id = randomUUID(), at = (o.now ?? new Date()).toISOString();
  const own = !db.isTransaction;
  if (own) db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE main.decision_choices SET state = 'replaced' WHERE decision_id = ? AND state = 'current'").run(row.decisionId);
    db.prepare(`INSERT INTO main.decision_choices (id, decision_id, repo, number, turn_id, stamp, seen, source, drafts, added, pick, state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?)`)
      .run(id, row.decisionId, row.repo, row.number, row.turnId, row.stamp, seenJson(row.seen), row.source, JSON.stringify(row.drafts), JSON.stringify(row.added), JSON.stringify(row.pick), at);
    const opt = row.pick.core ? parseCoreKey(row.pick.core) : null;
    // Backlog is an option of every decision, so a Later pick is the recommendation "backlog".
    const recommended = opt?.type === "option" ? opt.option : opt?.type === "backlog" ? "backlog" : null;
    if (recommended !== null) {
      db.prepare(`UPDATE main.decisions SET serving_metadata = CASE WHEN serving_metadata IS NULL THEN NULL ELSE '{"schema":0,"provider":"unknown","runs":[],"models":[]}' END, recommended = ?, recommended_reason = ?${o.by !== undefined ? ", recommended_by = ?" : ""} WHERE id = ? AND answer IS NULL`)
        .run(...[recommended, row.pick.reason, ...(o.by !== undefined ? [o.by] : []), row.decisionId] as (string | null)[]);
    } else {
      db.prepare(`UPDATE main.decisions SET serving_metadata = CASE WHEN serving_metadata IS NULL THEN NULL ELSE '{"schema":0,"provider":"unknown","runs":[],"models":[]}' END, recommended = NULL, recommended_reason = NULL${o.by !== undefined ? ", recommended_by = ?" : ""} WHERE id = ? AND answer IS NULL`)
        .run(...[...(o.by !== undefined ? [o.by] : []), row.decisionId] as (string | null)[]);
    }
    if (own) db.exec("COMMIT");
  } catch (e) {
    if (own) db.exec("ROLLBACK");
    throw e;
  }
  return choicesById(db, id)!;
}

/** What a conversation turn's validated `choices` block changes. */
export interface ChoicesUpdate {
  turnId: number | null;
  /** decisionStamp now. */
  stamp: string;
  seen: ChoicesRow["seen"];
  /** Each listed core's draft replaces that core's draft whole. */
  cores: Record<CoreKey, { params?: StoredDraft["params"]; extras: ChoicesBlockExtra[] }>;
  /** Cores Opus adds, appended (at most MAX_ADDED_CORES in all; an existing added core's draft is replaced). */
  add?: { key: CoreKey; draft: { params?: StoredDraft["params"]; extras: ChoicesBlockExtra[] } }[];
  /** Added cores to remove, with their drafts. */
  drop?: CoreKey[];
  /** Required in every block. */
  pick: ChoicesRow["pick"];
}

/** Writes a new current row: the current one with the update's drops, replaced drafts, added cores and pick. Returns the row and why an added core was left out. */
export function mergeChoices(db: DatabaseSync, decisionId: string, u: ChoicesUpdate, o: { by?: string | null; now?: Date } = {}): { row: ChoicesRow; notes: string[] } {
  const cur = currentChoices(db, decisionId);
  const d = db.prepare("SELECT repo, number FROM main.decisions WHERE id = ?").get(decisionId) as { repo: string; number: number } | undefined;
  if (!d) throw new Error(`no decision ${decisionId}`);
  const drafts: ChoicesRow["drafts"] = { ...(cur?.drafts ?? {}) };
  let added = [...(cur?.added ?? [])];
  // The cap counts the stored added cores that still apply to the item, as the parser does.
  const dec = getDecision(db, decisionId);
  const applicable = dec ? new Set(applicableSteps(db, d.repo, d.number)) : null;
  const live = (ks: CoreKey[]): number => (dec && applicable ? ks.filter((k) => addedCore(db, dec, k, applicable)).length : ks.length);
  const notes: string[] = [];
  for (const k of u.drop ?? []) {
    if (added.includes(k)) { added = added.filter((x) => x !== k); delete drafts[k]; }
  }
  for (const [k, v] of Object.entries(u.cores)) drafts[k] = { ...(v.params && { params: v.params }), extras: withIds(v.extras) };
  for (const a of u.add ?? []) {
    if (!added.includes(a.key)) {
      if (dec && applicable && !addedCore(db, dec, a.key, applicable)) { notes.push(`left out the added choice ${a.key}: it does not apply to this item now`); continue; }
      if (live(added) >= MAX_ADDED_CORES) { notes.push(`left out the added choice ${a.key}: at most ${MAX_ADDED_CORES} are kept`); continue; }
      added.push(a.key);
    }
    drafts[a.key] = { ...(a.draft.params && { params: a.draft.params }), extras: withIds(a.draft.extras) };
  }
  const row = writeChoices(db, { decisionId, repo: d.repo, number: d.number, turnId: u.turnId, stamp: u.stamp, seen: u.seen, source: "conversation", drafts, added, pick: u.pick }, o);
  return { row, notes };
}
