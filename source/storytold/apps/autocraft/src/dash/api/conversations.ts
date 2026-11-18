// Opus conversations on items. Everyone who may see the repo reads them; only operators write, edit, run and dismiss.
import type { DatabaseSync } from "node:sqlite";
import type { CardEdit, Conversation, ConversationCard, ConversationTurn, DecisionChoices } from "../../../web/src/api/types.ts";
import { buttonLabel, cardEffect, cardLines, decisionStamp, dependsOnCode, headline, isSettling, openDecision, stepLine, validateCard, type CardParams } from "../../conversations/cards.ts";
import { applyDrafts, choicesById, compose, coresFor, currentChoices, seenJson, type ComposeExtra, type Core } from "../../decide/choices.ts";
import { parseCoreKey, type ChoicesRow, type CoreKey } from "../../decide/choices-types.ts";
import { getDecision } from "../../decisions.ts";
import { disputeCard, keepCard, queuePlace, queueReason } from "../../conversations/queue.ts";
import { audit } from "../audit.ts";
import { NOTE_MAX } from "../../conversations/types.ts";
import { cardDigest, cardOf, cardRepos, dismissCard, doCard, editCard, sweepRunningCards, type ActDeps, type CardRow } from "../../conversations/act.ts";
import { ConversationError, addOperatorMessage, conversationOf, includesOf, pendingTurn, setInclude, staleOf, turnsOf, type IncludeRow, type StoreDeps } from "../../conversations/store.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { isQuiet } from "../../security/quiet.ts";
import { canSeeInternals } from "./staff.ts";
import { needVisible } from "./visible.ts";
import { slugOf } from "../../owners.ts";
import { canSettle, canSettleCached } from "../../settlers.ts";
import { servingFields } from "./serving.ts";

const isOperator = (req: Req): boolean => req.user.role === "operator";

function guard<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof ConversationError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

async function guardAsync<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof ConversationError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

function queuedView(db: DatabaseSync, c: CardRow, staff: boolean): NonNullable<ConversationCard["queued"]> {
  const place = c.dispute_by ? null : queuePlace(db, c.id);
  return { place, reason: queueReason(place), dispute: c.dispute_by ? { by: c.dispute_by, reason: staff ? (c.dispute_reason ?? "") : "", at: c.dispute_at ?? "" } : null };
}

/** `who`: the viewer, for the card's `canSettle` (an operator, or a maintainer under the rule of src/settlers.ts, from cached permissions). */
export function cardView(db: DatabaseSync, c: CardRow, who?: { login: string; role: string }): ConversationCard {
  const params = JSON.parse(c.params) as CardParams;
  const effect = c.kind === "answer" || c.kind === "close" || c.kind === "resolution" ? cardEffect(db, params) : null;
  const lines = cardLines(db, params, c.description);
  const commentStep = params.kind === "resolution" ? params.steps.findIndex((x) => x.kind === "comment") : params.kind === "comment" || (params.kind === "close" && c.text !== null) ? 0 : -1;
  const issueAt = params.kind === "resolution" ? params.steps.findIndex((x) => x.kind === "open_issue") : -1;
  const fixupAt = params.kind === "resolution" ? params.steps.findIndex((x) => x.kind === "fixup") : -1;
  const issueStep = params.kind === "resolution" ? params.steps[issueAt] : undefined;
  const fixupStep = params.kind === "resolution" ? params.steps[fixupAt] : undefined;
  const stale = c.state === "proposed" ? staleOf(db, c.repo, c.number, c.seen) : undefined;
  const one = (t: string) => t.replace(/\s+/g, " ").trim();
  const settleReason = params.kind === "resolution" && params.settle?.kind === "answer" ? params.settle.reason : undefined;
  const previews: [string, string | undefined | null][] = [
    ["Comment", c.text],
    ["Reason", settleReason],
    ["Issue", issueStep?.kind === "open_issue" ? issueStep.title : undefined],
    ["Instructions", fixupStep?.kind === "fixup" ? fixupStep.instructions : undefined],
  ];
  const first = previews.find(([, t]) => t && one(t));
  const preview = first ? `${first[0]}: ${one(first[1]!)}` : undefined;
  return {
    steps: lines.steps,
    ...(commentStep >= 0 && { commentStep }),
    ...(issueStep?.kind === "open_issue" && { issue: { step: issueAt, repo: issueStep.repo, title: issueStep.title, body: issueStep.body } }),
    ...(fixupStep?.kind === "fixup" && { fixup: { step: fixupAt, instructions: fixupStep.instructions, merge: fixupStep.merge } }),
    ...(params.kind === "resolution" && params.settle?.kind === "answer" && { option: params.settle.option }),
    ...(stale && { stale }),
    ...(lines.settles && { settles: lines.settles }),
    label: buttonLabel(db, params),
    headline: headline(db, params),
    ...(preview && { preview }),
    canSettle: !!who && canSettleCached(db, who.login, who.role, cardRepos(c, params)),
    id: c.id, kind: c.kind as ConversationCard["kind"], title: c.description, state: c.state as ConversationCard["state"], digest: cardDigest(c),
    ...(c.text !== null && { text: c.text }),
    ...(effect && { writes: effect }),
    ...(c.state === "done" && { done: { at: c.acted_at ?? "", link: c.result_url ?? "", label: c.result ?? "Done" } }),
    ...(c.state === "failed" && c.error && { error: c.error }),
    ...(c.state === "queued" && { queued: queuedView(db, c, !!who && (who.role === "operator" || who.role === "maintainer")) }),
    ...(c.acted_by && { by: c.acted_by }),
    ...(c.acted_at && { at: c.acted_at }),
    ...(c.edited_by && { edited: true, editedBy: c.edited_by }),
    ...(c.choice_id && { fromChoice: true }),
  };
}

/**
 * The choices of the item's open decision (the one a conversation card would settle): the offered cores with Opus's drafts over them.
 * Null when the item has no such decision or cores, or when the decision has no current choices row written for its present state
 * (the web then offers the plain answer path and Re-prepare).
 */
export function choicesView(db: DatabaseSync, repo: string, n: number): DecisionChoices | null {
  const d = openDecision(db, repo, n);
  if (!d) return null;
  const base = coresFor(db, d);
  if (base.length === 0) return null;
  const row = currentChoices(db, d.id);
  if (!row || row.stamp !== decisionStamp(db, d)) return null;
  const cores = applyDrafts(db, d, base, row);
  const strip = ({ parsed: _p, decision: _d, allowed: _a, closing: _c, ...view }: Core) => view;
  const run = (db.prepare("SELECT id, state, error FROM conversation_cards WHERE choice_id = ? ORDER BY id DESC LIMIT 1").get(row.id) as { id: number; state: string; error: string | null } | undefined);
  const pick = row.pick.core && cores.some((c) => c.key === row.pick.core) ? { core: row.pick.core, reason: row.pick.reason ?? "" } : null;
  return {
    id: row.id, decisionId: d.id, pick, cores: cores.map(strip),
    ...servingFields((db.prepare("SELECT serving_metadata FROM decision_choices WHERE id = ?").get(row.id) as { serving_metadata: unknown } | undefined)?.serving_metadata),
    ...(run && { run: { cardId: run.id, state: run.state as NonNullable<DecisionChoices["run"]>["state"], ...(run.error && { error: run.error }) } }),
    source: row.source, at: row.createdAt,
  };
}

/** The conversation plus the maintainer posts shared with Opus. */
export type ConversationView = Conversation & { includes: IncludeRow[] };

export function conversationView(db: DatabaseSync, repo: string, n: number, who?: { login: string; role: string }): ConversationView {
  // A card left Running by a crash must not show as running until the next restart.
  sweepRunningCards(db);
  const c = conversationOf(db, repo, n);
  const includes = includesOf(db, repo, n);
  const choices = choicesView(db, repo, n);
  if (!c) return { repo, number: n, exists: false, pending: false, startedBy: null, turns: [], includes, choices };
  const cards = db.prepare("SELECT * FROM conversation_cards WHERE repo = ? AND number = ? ORDER BY id").all(repo, n) as unknown as CardRow[];
  const serving = new Map((db.prepare("SELECT id, serving_metadata FROM conversation_turns WHERE repo = ? AND number = ?").all(repo, n) as { id: number; serving_metadata: unknown }[]).map(row => [row.id, row.serving_metadata]));
  const turns: ConversationTurn[] = turnsOf(db, repo, n).map((t) => ({
    id: t.id, kind: t.kind, login: t.login, at: t.at, body: t.body,
    ...servingFields(serving.get(t.id)),
    actions: cards.filter((x) => x.turn_id === t.id).map((x) => cardView(db, x, who)),
    notes: t.notes ? (JSON.parse(t.notes) as string[]) : [],
    ...(t.status && { status: t.status as ConversationTurn["status"] }),
    ...(t.error && { error: t.error }),
  }));
  const wait = pendingTurn(db, repo, n);
  const progress = wait?.status === "answering" && wait.progress ? (JSON.parse(wait.progress) as string[]) : [];
  return { repo, number: n, exists: true, pending: !!wait, ...(progress.length > 0 && { progress }), startedBy: c.created_by, turns, includes, choices };
}

function itemOf(req: Req): { repo: string; n: number } {
  const n = Number(req.params.n);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "the item number must be a whole number");
  return { repo: req.params.repo!, n };
}

/** The edit a card-edit request carries: any of text, issue ({title, body}) and instructions. */
function cardEdit(req: Req): CardEdit {
  const b = req.json as Record<string, unknown> | null;
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "the body must be an object");
  const edit: CardEdit = {};
  if (b.text !== undefined) { if (typeof b.text !== "string") throw new HttpError(400, "text must be a string"); edit.text = b.text; }
  if (b.instructions !== undefined) { if (typeof b.instructions !== "string") throw new HttpError(400, "instructions must be a string"); edit.instructions = b.instructions; }
  if (b.issue !== undefined) {
    const i = b.issue as Record<string, unknown> | null;
    if (!i || typeof i !== "object" || typeof i.title !== "string" || typeof i.body !== "string") throw new HttpError(400, "issue must be an object with a title and a body");
    edit.issue = { title: i.title, body: i.body };
  }
  if (Object.keys(edit).length === 0) throw new HttpError(400, "the body must have a text, an issue or instructions");
  return edit;
}

function text(req: Req): string {
  const b = req.json;
  if (!b || typeof b !== "object" || Array.isArray(b) || typeof (b as { text?: unknown }).text !== "string") throw new HttpError(400, "the body must be an object with a text");
  return (b as { text: string }).text;
}

/** `ask: false` stores the message without asking Opus. */
function ask(req: Req): boolean {
  const a = (req.json as { ask?: unknown } | null)?.ask;
  if (a !== undefined && typeof a !== "boolean") throw new HttpError(400, "ask must be true or false");
  return a !== false;
}

function needOperator(req: Req): void {
  if (!isOperator(req)) throw new HttpError(403, "only operators write in conversations");
}

export async function getConversation(db: DatabaseSync, req: Req): Promise<ConversationView> {
  const { repo, n } = itemOf(req);
  await needVisible(db, req, repo);
  const view = conversationView(db, repo, n, req.user);
  return !canSeeInternals(req) && isQuiet(db, repo, n) ? veilConversation(view) : view;
}

/** A viewer's copy of a quiet pull request's conversation: who spoke and when stays; the text, cards, choices and their reasons go. */
function veilConversation(v: ConversationView): ConversationView {
  const { progress: _p, ...rest } = v;
  return { ...rest, turns: v.turns.map((t) => ({ id: t.id, kind: t.kind, login: t.login, at: t.at, body: "", actions: [], notes: [], ...(t.serving && { serving: t.serving }), ...(t.status && { status: t.status }) })), includes: [], choices: null };
}

export async function postMessage(db: DatabaseSync, req: Req, deps?: StoreDeps): Promise<ConversationView> {
  needOperator(req);
  const { repo, n } = itemOf(req);
  await needVisible(db, req, repo);
  await guardAsync(() => addOperatorMessage(db, repo, n, req.user.login, text(req), deps, ask(req)));
  return conversationView(db, repo, n, req.user);
}

/** Shares a maintainer post with Opus (`on`) or stops sharing it; the next asked message carries it. */
export async function postInclude(db: DatabaseSync, req: Req, deps?: StoreDeps): Promise<ConversationView> {
  needOperator(req);
  const { repo, n } = itemOf(req);
  await needVisible(db, req, repo);
  const b = req.json as { source?: unknown; on?: unknown } | null;
  if (!b || typeof b !== "object" || typeof b.source !== "string" || typeof b.on !== "boolean") throw new HttpError(400, "the body must be an object with a source and on (true or false)");
  guard(() => setInclude(db, repo, n, b.source as string, b.on as boolean, req.user.login, deps));
  return conversationView(db, repo, n, req.user);
}

/** The card, for someone who settles it: an operator with write access on its repo, or a maintainer under the rule of src/settlers.ts on every repo it writes to. */
async function needCard(db: DatabaseSync, req: Req): Promise<CardRow> {
  const id = Number(req.params.id);
  const c = Number.isInteger(id) ? cardOf(db, id) : undefined;
  if (!c) throw new HttpError(404, `no card ${req.params.id}`);
  await needVisible(db, req, c.repo);
  if (isOperator(req)) {
    if (!(await req.user.canWrite(c.repo).catch(() => false))) throw new HttpError(403, `no write access to ${slugOf(c.repo)}`);
  } else if (!(await canSettle(db, req.user, cardRepos(c, JSON.parse(c.params) as CardParams)))) {
    throw new HttpError(403, "only an operator, or a maintainer with write access where the app acts for them, runs cards");
  }
  return c;
}

export async function editCardText(db: DatabaseSync, req: Req): Promise<ConversationCard> {
  const c = await needCard(db, req);
  const edit = cardEdit(req);
  // The fix-up instructions go to the fix-up model: only an operator writes them.
  if (edit.instructions !== undefined && !isOperator(req)) throw new HttpError(403, "only operators edit a fix-up's instructions");
  return cardView(db, guard(() => editCard(db, c.id, req.user.login, edit)), req.user);
}

/** A queued press is the presser's: only they and operators dismiss, keep or take it back; anyone who settles may dispute it. */
function ownsPress(req: Req, c: CardRow): boolean {
  return isOperator(req) || c.acted_by?.toLowerCase() === req.user.login.toLowerCase();
}

export async function dismiss(db: DatabaseSync, req: Req): Promise<ConversationCard> {
  const c = await needCard(db, req);
  if (c.state === "queued" && !ownsPress(req, c)) throw new HttpError(403, "only the person who pressed it, or an operator, dismisses a queued press; dispute it instead");
  return cardView(db, guard(() => dismissCard(db, c.id, req.user.login, { role: req.user.role })), req.user);
}

/** Someone else who settles disputes a queued press: it stays queued, the drain skips it, and the presser or an operator keeps or dismisses it. A reason is required. */
export async function disputePress(db: DatabaseSync, req: Req): Promise<ConversationCard> {
  const c = await needCard(db, req);
  const reason = typeof (req.json as { reason?: unknown } | null)?.reason === "string" ? ((req.json as { reason: string }).reason).trim() : "";
  if (!reason) throw new HttpError(400, "a dispute needs a reason");
  if (reason.length > NOTE_MAX) throw new HttpError(400, `the reason is longer than ${NOTE_MAX} characters`);
  if (c.state !== "queued") throw new HttpError(409, "only a queued press can be disputed");
  if (c.acted_by?.toLowerCase() === req.user.login.toLowerCase()) throw new HttpError(409, "you pressed this: dismiss it instead");
  if (!disputeCard(db, c.id, req.user.login, reason, new Date().toISOString())) throw new HttpError(409, c.dispute_by ? `already disputed by ${c.dispute_by}` : "the press ran a moment ago");
  audit(db, req.user.login, "dispute", `card:${c.id}`, { reason, queuedBy: c.acted_by ?? undefined });
  return cardView(db, cardOf(db, c.id)!, req.user);
}

/** The presser, or an operator, keeps a disputed queued press: the drain takes it up again. */
export async function keepPress(db: DatabaseSync, req: Req): Promise<ConversationCard> {
  const c = await needCard(db, req);
  if (!ownsPress(req, c)) throw new HttpError(403, "only the person who pressed it, or an operator, keeps a disputed press");
  if (!keepCard(db, c.id)) throw new HttpError(409, "that press is not disputed");
  audit(db, req.user.login, "dispute-resolve", `card:${c.id}`, { resolution: "keep", disputedBy: c.dispute_by ?? undefined });
  return cardView(db, cardOf(db, c.id)!, req.user);
}

/**
 * Runs the card once; a second press returns the card as it is. The press carries the digest of the card it was made on,
 * so an edit by someone else in between is refused instead of running under this press.
 */
export async function doIt(db: DatabaseSync, req: Req, deps?: ActDeps): Promise<ConversationCard> {
  const c = await needCard(db, req);
  const b = req.json as { skip?: unknown; note?: unknown; digest?: unknown } | null;
  if (typeof b?.digest !== "string") throw new HttpError(400, "digest must be the digest of the card as shown");
  if (c.state === "proposed" && b.digest !== cardDigest(c)) throw new HttpError(409, c.edited_by ? `the card changed since it was shown (edited by ${c.edited_by}); look at it again` : "the card changed since it was shown; look at it again");
  if (b?.note !== undefined && typeof b.note !== "string") throw new HttpError(400, "note must be a string");
  if (b?.skip !== undefined && (!Array.isArray(b.skip) || b.skip.some((k) => !Number.isInteger(k)))) throw new HttpError(400, "skip must be a list of step positions");
  const skip = (b?.skip as number[] | undefined) ?? [];
  return cardView(db, (await guardAsync(() => doCard(db, c.id, req.user.login, { ...deps, skip, note: b?.note as string | undefined, noteStaysOut: !isOperator(req), role: req.user.role, canWrite: (r) => req.user.canWrite(r) }))).card, req.user);
}

/** The request body of a choice run, checked for shape only. */
function choiceBody(req: Req): { core: CoreKey; params: { reason?: string; instructions?: string }; extras: { id: string; text?: string; title?: string; body?: string }[]; note?: string } {
  const b = req.json as Record<string, unknown> | null;
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "the body must be an object");
  if (typeof b.core !== "string" || !parseCoreKey(b.core)) throw new HttpError(400, "core must be a choice key");
  const str = (o: Record<string, unknown>, k: string, what: string): string | undefined => {
    if (o[k] === undefined) return undefined;
    if (typeof o[k] !== "string") throw new HttpError(400, `${what} must be a string`);
    return o[k] as string;
  };
  const p = (b.params ?? {}) as Record<string, unknown>;
  if (typeof p !== "object" || Array.isArray(p)) throw new HttpError(400, "params must be an object");
  if (!Array.isArray(b.extras ?? [])) throw new HttpError(400, "extras must be a list");
  const extras = ((b.extras ?? []) as unknown[]).map((x) => {
    const e = x as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || typeof e.id !== "string") throw new HttpError(400, "each extra needs an id");
    return { id: e.id, text: str(e, "text", "text"), title: str(e, "title", "title"), body: str(e, "body", "body") };
  });
  return { core: b.core, params: { reason: str(p, "reason", "reason"), instructions: str(p, "instructions", "instructions") }, extras, note: str(b, "note", "note") };
}

/**
 * Runs a decision's chosen core with its ticked extras: composes one resolution card from them, stores it as an ordinary card
 * (`choice_id` set) and runs it like Do it. The user's own edited texts go through the card edit, so they are not cleaned and
 * show as edited; a maintainer may not edit fix-up instructions.
 */
export async function doChoice(db: DatabaseSync, req: Req, deps?: ActDeps): Promise<ConversationCard> {
  const row = choicesById(db, req.params.id!);
  if (!row) throw new HttpError(404, `no choices ${req.params.id}`);
  await needVisible(db, req, row.repo);
  const body = choiceBody(req);
  if (row.state !== "current") throw new HttpError(409, "replaced by newer choices");
  const d = getDecision(db, row.decisionId);
  if (!d || d.answer !== null) throw new HttpError(409, "the decision is already settled");
  if (decisionStamp(db, d) !== row.stamp || openDecision(db, row.repo, row.number)?.id !== d.id) throw new HttpError(409, "the decision changed since these choices were written");
  const priorOf = (): CardRow | undefined => db.prepare("SELECT * FROM conversation_cards WHERE choice_id = ? ORDER BY id DESC LIMIT 1").get(row.id) as unknown as CardRow | undefined;
  // A card for these choices that is already running or done is returned as it is (a second press).
  const first = priorOf();
  if (first && (first.state === "running" || first.state === "done" || first.state === "queued")) return cardView(db, first, req.user);

  const core = applyDrafts(db, d, coresFor(db, d), row).find((c) => c.key === body.core);
  if (!core) throw new HttpError(400, `"${body.core}" is not one of the choices`);
  const user = (id: string) => body.extras.find((x) => x.id === id);
  const extras: ComposeExtra[] = body.extras.map((x) => {
    const offered = core.extras.find((e) => e.id === x.id);
    if (!offered) throw new HttpError(400, `the extra "${x.id}" is not offered with "${core.label}"`);
    const { id, kind, label, login, logins, repo } = offered;
    // The user's text is what runs; the card edit below keeps it as written.
    return { id, kind, label, login, logins, repo, text: x.text ?? offered.text, title: x.title ?? offered.title, body: x.body ?? offered.body };
  });
  const drafted = core.params?.instructions ?? "";
  const params = { reason: body.params.reason ?? core.params?.reason, instructions: body.params.instructions ?? core.params?.instructions };
  if (body.params.instructions !== undefined && body.params.instructions.trim() !== drafted.trim() && !isOperator(req)) throw new HttpError(403, "only operators edit a fix-up's instructions");
  const composed = compose(core, extras, params);
  if ("note" in composed) throw new HttpError(400, composed.note);
  const v = validateCard(db, row.repo, row.number, composed.card);
  if (!("card" in v)) throw new HttpError(400, v.note);
  // After a push only cards that do not rest on the code (backlog, hold, label, close, plain answers) run; a drafted text or a fix-up waits for the updated choices.
  if (staleOf(db, row.repo, row.number, seenJson(row.seen)) === "pr-changed" && dependsOnCode(v.card.params, v.card.text)) throw new HttpError(409, "the PR changed since these choices were written; Opus is updating the choices");

  const probe = { repo: row.repo } as CardRow;
  if (isOperator(req)) {
    if (!(await req.user.canWrite(row.repo).catch(() => false))) throw new HttpError(403, `no write access to ${slugOf(row.repo)}`);
  } else if (!(await canSettle(db, req.user, cardRepos(probe, v.card.params)))) {
    throw new HttpError(403, "only an operator, or a maintainer with write access where the app acts for them, runs choices");
  }

  // The press is claimed here, with no await between the check and the insert: a second press that got this far sees the first one's card.
  let id = 0;
  let failedBefore: CardRow | undefined;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (choicesById(db, row.id)?.state !== "current") throw new HttpError(409, "replaced by newer choices");
    const prior = priorOf();
    if (prior && (prior.state === "running" || prior.state === "done" || prior.state === "queued")) { db.exec("COMMIT"); return cardView(db, prior, req.user); }
    // A run whose outcome is unknown may have repeated writes: the operator prepares again or says what else to do.
    if (prior?.state === "failed" && /^outcome unknown/.test(prior.error ?? "")) throw new HttpError(409, "the last run of these choices stopped after some of its steps; Re-prepare, or tell Opus what to do next");
    failedBefore = prior?.state === "failed" ? prior : undefined;
    db.prepare("UPDATE main.conversation_cards SET state = 'replaced' WHERE choice_id = ? AND state = 'proposed'").run(row.id);
    id = Number(db.prepare("INSERT INTO main.conversation_cards (turn_id, repo, number, kind, params, text, description, seen, choice_id) VALUES (?, ?, ?, 'resolution', ?, ?, ?, ?, ?)")
      .run(row.turnId ?? 0, row.repo, row.number, JSON.stringify(v.card.params), v.card.text, v.card.description, seenJson(row.seen), row.id).lastInsertRowid);
    db.exec("COMMIT");
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
  try {
    // Edits the user made to the drafted texts: the comment, the issue, the fix-up instructions.
    const edit: CardEdit = {};
    const steps = v.card.params.kind === "resolution" ? v.card.params.steps : [];
    const typedComment = extras.find((e) => e.kind === "comment" && user(e.id)?.text !== undefined);
    if (typedComment && typedComment.text!.trim() && typedComment.text!.trim() !== v.card.text) edit.text = typedComment.text!;
    const issue = steps.find((x) => x.kind === "open_issue");
    const typedIssue = extras.find((e) => e.kind === "open_issue" && (user(e.id)?.title !== undefined || user(e.id)?.body !== undefined));
    if (issue?.kind === "open_issue" && typedIssue && (typedIssue.title!.trim() !== issue.title || typedIssue.body!.trim() !== issue.body)) edit.issue = { title: typedIssue.title!, body: typedIssue.body! };
    const fix = steps.find((x) => x.kind === "fixup");
    if (fix?.kind === "fixup" && body.params.instructions !== undefined && body.params.instructions.trim() !== fix.instructions) edit.instructions = body.params.instructions;
    if (Object.keys(edit).length) guard(() => editCard(db, id, req.user.login, edit));
  } catch (e) {
    db.prepare("UPDATE main.conversation_cards SET state = 'replaced' WHERE id = ? AND state = 'proposed'").run(id);
    throw e;
  }
  // Steps a failed earlier press of these choices completed (its error names them) are not run again.
  const allSteps = v.card.params.kind === "resolution" ? v.card.params.steps : [];
  const priorDone = failedBefore?.error?.startsWith("Already done:") ? failedBefore.error : "";
  const doneAt = allSteps.flatMap((x, k) => (priorDone.includes(stepLine(x)) && !isSettling(x) ? [k] : []));
  const alreadyDone = doneAt.length < allSteps.length || (v.card.params.kind === "resolution" && v.card.params.settle) ? doneAt : [];
  let ran;
  try {
    ran = await guardAsync(() => doCard(db, id, req.user.login, { ...deps, skip: alreadyDone, note: body.note, noteStaysOut: !isOperator(req), role: req.user.role, canWrite: (r) => req.user.canWrite(r) }));
  } catch (e) {
    // Refused before the claim (lane, approval): the card never ran and must not stay proposed.
    db.prepare("UPDATE main.conversation_cards SET state = 'replaced' WHERE id = ? AND state = 'proposed'").run(id);
    throw e;
  }
  return cardView(db, ran.card, req.user);
}
