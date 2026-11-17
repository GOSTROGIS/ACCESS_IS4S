/**
 * Shared shapes for decision answers as one core action plus extras
 * (the web mirrors the view types in web/src/api/types.ts under the same names).
 */

/** The GitHub write a core or an extra performs; one pill each in the UI. */
export type ActionTag = "merge" | "close" | "reopen" | "comment" | "open_issue" | "label" | "unlabel" | "assign" | "request_review" | "push" | "move";

export type ExtraKind = "comment" | "open_issue" | "label" | "unlabel" | "assign" | "request_reviewers";

/** Most cores Opus may add on top of the offered ones. */
export const MAX_ADDED_CORES = 3;

export type CloseReason = "completed" | "not_planned";

/**
 * Core keys: `o:<option>`, `fixup-merge`, `backlog`, and the cores only Opus adds:
 * `x:close:<reason>`, `x:duplicate:<n>`, `x:transfer:<repo>`, `x:fixup`, `x:review`.
 */
export type CoreKey = string;

export type ParsedCoreKey =
  | { type: "option"; option: string }
  | { type: "fixup-merge" }
  | { type: "backlog" }
  | { type: "close"; reason: CloseReason }
  | { type: "duplicate"; of: number }
  | { type: "transfer"; repo: string }
  | { type: "fixup" }
  | { type: "review" };

export const coreKey = {
  option: (option: string): CoreKey => `o:${option}`,
  fixupMerge: "fixup-merge" as CoreKey,
  backlog: "backlog" as CoreKey,
  close: (reason: CloseReason): CoreKey => `x:close:${reason}`,
  duplicate: (of: number): CoreKey => `x:duplicate:${of}`,
  transfer: (repo: string): CoreKey => `x:transfer:${repo}`,
  fixup: "x:fixup" as CoreKey,
  review: "x:review" as CoreKey,
};

/** Null for a key outside the scheme. */
export function parseCoreKey(key: string): ParsedCoreKey | null {
  if (key === "fixup-merge") return { type: "fixup-merge" };
  if (key === "backlog") return { type: "backlog" };
  if (key === "x:fixup") return { type: "fixup" };
  if (key === "x:review") return { type: "review" };
  if (key.startsWith("o:") && key.length > 2) return { type: "option", option: key.slice(2) };
  const close = /^x:close:(completed|not_planned)$/.exec(key);
  if (close) return { type: "close", reason: close[1] as CloseReason };
  const dup = /^x:duplicate:(\d+)$/.exec(key);
  if (dup) return { type: "duplicate", of: Number(dup[1]) };
  if (key.startsWith("x:transfer:") && key.length > 11) return { type: "transfer", repo: key.slice(11) };
  return null;
}

export function formatCoreKey(p: ParsedCoreKey): CoreKey {
  switch (p.type) {
    case "option": return coreKey.option(p.option);
    case "fixup-merge": return coreKey.fixupMerge;
    case "backlog": return coreKey.backlog;
    case "close": return coreKey.close(p.reason);
    case "duplicate": return coreKey.duplicate(p.of);
    case "transfer": return coreKey.transfer(p.repo);
    case "fixup": return coreKey.fixup;
    case "review": return coreKey.review;
  }
}

// ---- Stored row (table decision_choices) ----------------------------------------

/** One drafted or ticked extra as Opus wrote it; the fields used depend on `kind`. */
export interface StoredExtra {
  id: string;
  kind: ExtraKind;
  on: boolean;
  text?: string;
  title?: string;
  body?: string;
  label?: string;
  login?: string;
  logins?: string[];
  repo?: string;
}

export interface StoredDraft {
  params?: { reason?: string; instructions?: string };
  extras: StoredExtra[];
}

export type ChoicesSource = "prepare" | "conversation" | "converted";

export interface ChoicesRow {
  id: string;
  decisionId: string;
  repo: string;
  number: number;
  turnId: number | null;
  /** decisionStamp at write time. */
  stamp: string;
  seen: { head: string | null; lastComment: string | null };
  source: ChoicesSource;
  drafts: Record<CoreKey, StoredDraft>;
  /** Cores Opus added (end kinds only, at most 3). */
  added: CoreKey[];
  pick: { core: CoreKey | null; reason: string | null };
  state: "current" | "replaced";
  createdAt: string;
}

// ---- Parsed model block (the fenced `choices` block) -------------------------------

export type ChoicesBlockExtra = Omit<StoredExtra, "id">;

export interface ChoicesBlock {
  pick: { core: CoreKey; reason: string };
  cores: { core: CoreKey; reason?: string; instructions?: string; extras: ChoicesBlockExtra[] }[];
  add?: { end: { close?: CloseReason; duplicate?: number; transfer?: string; fixup?: true; review?: true }; /** Fix-up instructions (an added fixup core). */ instructions?: string; extras: ChoicesBlockExtra[] }[];
  drop?: CoreKey[];
  ask?: { text: string };
}

// ---- View shapes (served to the web) -----------------------------------------------

export interface ChoiceExtra {
  id: string;
  kind: ExtraKind;
  tag: ActionTag;
  /** Ticked: Opus's tick before the user changes it. */
  on: boolean;
  text?: string;
  title?: string;
  body?: string;
  label?: string;
  login?: string;
  logins?: string[];
  repo?: string;
}

export interface ChoiceCore {
  key: CoreKey;
  label: string;
  /** reason: closing cores; instructions: fix-up cores; target: duplicate-of number or transfer repo. */
  params?: { reason?: string; instructions?: string; target?: string };
  /** GitHub writes the core itself performs; empty when it only records an answer in AutoCraft. */
  writes: ActionTag[];
  /** What AutoCraft does after the answer: one short fixed phrase (lower case, no full stop), shown after "AutoCraft". */
  autocraft: string;
  extras: ChoiceExtra[];
  /** Opus drafted this core's params and extras (beyond the offered list). */
  drafted: boolean;
}

export interface DecisionChoices {
  id: string;
  decisionId: string;
  pick: { core: CoreKey; reason: string } | null;
  cores: ChoiceCore[];
  /** The newest card run from these choices. */
  run?: { cardId: number; state: "proposed" | "running" | "done" | "failed" | "dismissed" | "replaced"; error?: string };
  source: ChoicesSource;
  at: string;
}

/** POST /api/decision-choices/:id/do */
export interface DoChoiceBody {
  core: CoreKey;
  params?: { reason?: string; instructions?: string };
  /** Ticked extras only, with the user's own text edits. */
  extras: { id: string; text?: string; title?: string; body?: string }[];
  note?: string;
}
