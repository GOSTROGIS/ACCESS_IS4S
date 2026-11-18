// Runs one action card once through the existing write paths (src/github/write.ts, the decision answer,
// the per-repo approvals) with the operator's login on every audit row. Cards never run on their own.
import { guardRepo } from "../core/guard.ts";
import { githubIdentity } from "../github/identity.ts";
import { claimSettling, pendingAnswerRefusal, releaseSettling, RUNNING_STALE_MS, sweepSettling } from "../answers/hold.ts";
import { initExecState, laneForOperator, type Lane, type LaneDeps } from "../github/user-lane.ts";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { readLive, writeEffect } from "../act/index.ts";
import { duplicateComment } from "../act/templates.ts";
import { audit } from "../dash/audit.ts";
import { optionsOf, BACKLOG, HANDLED, getDecision, reposOf, replaceProposedCards } from "../decisions.ts";
import { actRoom, needOf, queuedAhead, queuedCards, queuePlace, queueReason, type QueueArgs, cardWriteCount } from "./queue.ts";
import { settlesNow } from "../settlers.ts";
import { actBlockedReason } from "../runner/autopilot.ts";
import { addLabels, closeItem, commentOn, createIssue, IssueError, assignTo, removeLabel, reopenItem, requestReviewers, transferIssue, type Note, type Writer } from "../github/write.ts";
import { storedNote } from "../github/note.ts";
import { exec as defaultExec, type Exec } from "../fixup/git.ts";
import { runPipelineStep } from "../preapproval/index.ts";
import type { CardEdit } from "../../web/src/api/types.ts";
import { repoLabels } from "../labels/github.ts";
import { Client, type Querier } from "../mirror.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { closeRefusal, decisionStamp, dependsOnCode, isSettling, openDecision, otherTypeLabel, PUBLIC_TEXT_STEPS, settleLine, stepLine, type CardParams, type Settle, type Step } from "./cards.ts";
import { isQuiet } from "../security/quiet.ts";
import { ConversationError, insertTurn, staleOf, systemBlock, type StoreDeps } from "./store.ts";
import { COMMENT_MAX, INSTRUCTIONS_MAX, ISSUE_TITLE_MAX, NOTE_MAX, type CloseReason } from "./types.ts";
import { ownerOf, slugOf } from "../owners.ts";

export type CardRow = {
  seen: string | null;
  /** The decision_choices row the card was run from. */
  choice_id?: string | null;
  /** Set while the card waits for room under the daily limit: when it was pressed and what the press carried (QueueArgs JSON); a dispute by someone else of the queued press. */
  queued_at?: string | null; queue_args?: string | null; dispute_by?: string | null; dispute_reason?: string | null; dispute_at?: string | null;
  id: number; turn_id: number; repo: string; number: number; kind: string; params: string; text: string | null; description: string;
  state: string; result: string | null; result_url: string | null; error: string | null; acted_by: string | null; acted_at: string | null; edited_by: string | null; edited_at: string | null;
};

/** `canWrite` is the signed-in operator's write access to a repo; the shell has none to check. */
export type ActDeps = StoreDeps & { querier?: Querier; /** Runs `gh` for the open_issue step. */ exec?: Exec; canWrite?: (repo: string) => Promise<boolean>; /** Indexes into a resolution's steps the operator removed. */ skip?: number[]; /** The user lane's token source and transports; default: the secrets file's app. */ lane?: LaneDeps; /** The note with the choice. */ note?: string; /** The presser's role, named in the conversation block (default operator). */ role?: string; /** The presser is not an operator: the note is stored and shown but never put in the model's block. */ noteStaysOut?: boolean; /** Set by the Act step's drain: run the queued card as its presser pressed it. */ drain?: boolean };

export const cardOf = (db: DatabaseSync, id: number): CardRow | undefined =>
  db.prepare("SELECT * FROM conversation_cards WHERE id = ?").get(id) as CardRow | undefined;

function need(db: DatabaseSync, id: number): CardRow {
  const c = cardOf(db, id);
  if (!c) throw new ConversationError(404, `no card ${id}`);
  return c;
}

/** A prepared choice and a conversation turn have independent stored authorship. */
export function cardNote(db: DatabaseSync, c: Pick<CardRow, "turn_id" | "choice_id" | "repo" | "number">): Note {
  const source = c.choice_id
    ? db.prepare("SELECT serving_metadata FROM decision_choices WHERE id = ? AND repo = ? AND number = ?").get(c.choice_id, c.repo, c.number)
    : db.prepare("SELECT serving_metadata FROM conversation_turns WHERE id = ? AND repo = ? AND number = ?").get(c.turn_id, c.repo, c.number);
  return storedNote({ by: "operator", model: CLAUDE_PROMPTS["conversation.turn"].models[0] },
    source ? source.serving_metadata : { schema: 0, provider: "unknown", runs: [], models: [] });
}

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim().slice(0, 300);
const ref = (repo: string, n: number) => `${repo}#${n}`;

/** The repos a card writes to: its item's, and where a resolution transfers the item or opens an issue. */
export const cardRepos = (c: CardRow, params: CardParams): string[] =>
  [...new Set([c.repo, ...(params.kind === "resolution" ? params.steps.flatMap((x) => (x.kind === "transfer" ? [x.to] : x.kind === "open_issue" ? [x.repo] : [])) : [])])];


/** What a press is bound to: the card's text and steps as the presser's screen showed them. Any edit gives a new digest. */
export const cardDigest = (c: Pick<CardRow, "text" | "params">): string => createHash("sha256").update(JSON.stringify([c.text, c.params])).digest("hex").slice(0, 16);

/** Replaces the drafts of a card that has not run: the comment text, the open_issue step's title and body, the fixup step's instructions. A field left out stays. */
export function editCard(db: DatabaseSync, id: number, by: string, edit: CardEdit, deps?: StoreDeps): CardRow {
  const c = need(db, id);
  if (edit.text === undefined && edit.issue === undefined && edit.instructions === undefined) throw new ConversationError(400, "nothing to edit");
  let text: string | null = c.text;
  if (edit.text !== undefined) {
    if (c.kind !== "comment" && !((c.kind === "close" || c.kind === "resolution") && c.text !== null)) throw new ConversationError(400, "only a comment card, or a card with a comment, has text to edit");
    const t = edit.text.trim();
    if (!t) throw new ConversationError(400, "the comment is empty");
    if (t.length > COMMENT_MAX) throw new ConversationError(400, `the comment is longer than ${COMMENT_MAX} characters`);
    text = t;
  }
  let params = c.params;
  if (edit.issue !== undefined || edit.instructions !== undefined) {
    const p = JSON.parse(c.params) as CardParams;
    if (p.kind !== "resolution") throw new ConversationError(400, "only a resolution has an issue or instructions to edit");
    let steps: Step[] = p.steps;
    if (edit.issue !== undefined) {
      const title = String(edit.issue.title ?? "").replace(/\s+/g, " ").trim(), body = String(edit.issue.body ?? "").trim();
      if (!steps.some((x) => x.kind === "open_issue")) throw new ConversationError(400, "the card has no open_issue step");
      if (!title || !body) throw new ConversationError(400, "the issue needs a title and a body");
      if (title.length > ISSUE_TITLE_MAX) throw new ConversationError(400, `the issue title is longer than ${ISSUE_TITLE_MAX} characters`);
      if (body.length > COMMENT_MAX) throw new ConversationError(400, `the issue body is longer than ${COMMENT_MAX} characters`);
      steps = steps.map((x) => (x.kind === "open_issue" ? { ...x, title, body } : x));
    }
    if (edit.instructions !== undefined) {
      const instructions = edit.instructions.trim();
      if (!steps.some((x) => x.kind === "fixup")) throw new ConversationError(400, "the card has no fixup step");
      if (!instructions) throw new ConversationError(400, "the instructions are empty");
      if (instructions.length > INSTRUCTIONS_MAX) throw new ConversationError(400, `the instructions are longer than ${INSTRUCTIONS_MAX} characters`);
      steps = steps.map((x) => (x.kind === "fixup" ? { ...x, instructions } : x));
    }
    params = JSON.stringify({ ...p, steps });
  }
  const at = (deps?.now?.() ?? new Date()).toISOString();
  const r = db.prepare("UPDATE conversation_cards SET text = ?, params = ?, edited_by = ?, edited_at = ? WHERE id = ? AND state = 'proposed'").run(text, params, by, at, id);
  if (r.changes !== 1) throw new ConversationError(409, `the card is already ${c.state}`);
  audit(db, by, "conversation-card-edit", ref(c.repo, c.number), { card: id });
  return need(db, id);
}

/** Dismisses a proposed card, or a queued press (which releases the lock of the decision it settles). The presser of a queued card stays on the card as `queued_by` in the audit. */
export function dismissCard(db: DatabaseSync, id: number, by: string, deps?: StoreDeps & { role?: string }): CardRow {
  const c = need(db, id);
  const at = (deps?.now?.() ?? new Date()).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = db.prepare("UPDATE conversation_cards SET state = 'dismissed', acted_by = ?, acted_at = ? WHERE id = ? AND state IN ('proposed', 'queued')").run(by, at, id);
    if (r.changes !== 1) throw new ConversationError(409, `the card is already ${c.state}`);
    const settles = c.state === "queued" ? settledDecisionOf(JSON.parse(c.params) as CardParams) : undefined;
    if (settles) releaseSettling(db, settles, id);
    db.exec("COMMIT");
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
  audit(db, by, "conversation-card-dismiss", ref(c.repo, c.number), { card: id, ...(c.state === "queued" && { queuedBy: c.acted_by ?? undefined }) });
  insertTurn(db, c.repo, c.number, { kind: "system", login: "system", body: `${by} dismissed the card: ${c.description}.`, block: systemBlock(`The ${deps?.role ?? "operator"} ${by} dismissed the proposed action: ${c.description}.`) }, deps);
  return need(db, id);
}

type Outcome = { result: string; url: string | null };

/** Answers the decision the card was written for, like a dashboard answer: one transaction, the decision's claims cleared. */
async function answerDecision(db: DatabaseSync, c: CardRow, decisionId: string | undefined, stamp: string | undefined, key: string, by: string, at: string, canWrite?: ActDeps["canWrite"], note?: string, publicReason?: string): Promise<Outcome> {
  if (!decisionId) throw new Error("the card names no decision: the decision changed");
  const d0 = getDecision(db, decisionId);
  if (!d0 || d0.answer !== null || d0.repo !== c.repo || d0.number !== c.number || (stamp !== undefined && decisionStamp(db, d0) !== stamp)) throw new Error("the decision changed");
  if (canWrite) for (const r of reposOf(d0)) if (!(await canWrite(r).catch(() => false))) throw new Error(`no write access to ${slugOf(r)}`);
  db.exec("BEGIN IMMEDIATE");
  try {
    const d = getDecision(db, decisionId);
    if (!d || d.answer !== null || (stamp !== undefined && decisionStamp(db, d) !== stamp)) throw new Error("the decision changed");
    const o = optionsOf(d).find((x) => x.key === key);
    if (!o) throw new Error(`"${key}" is not an option of the decision`);
    const r = db.prepare(`UPDATE main.decisions SET answer = ?, answer_note = ?, exceptions = NULL, answered_by = ?, answered_at = ?, adopted_opinion = NULL, snoozed_by = NULL, snoozed_at = NULL, exec_state = NULL, exec_reason = NULL,
      public_text = COALESCE(?, public_text)
      WHERE id = ? AND answer IS NULL`).run(key, note ?? null, by, at, publicReason ?? null, d.id);
    if (r.changes !== 1) throw new Error("the decision changed");
    db.prepare("DELETE FROM main.decision_claims WHERE decision_id = ?").run(d.id);
    replaceProposedCards(db, d.repo, d.number, d.id);
    audit(db, by, "answer", d.id, { answer: key, source: "conversation", card: c.id });
    db.exec("COMMIT");
    if (writeEffect(d.kind, key)) initExecState(db, d.id);
    return { result: `Answered the decision with "${o.label}"`, url: null };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Closes the card's decision as handled in the conversation: the answer is HANDLED with the summary as its note, already applied, so no step acts on it. Writes nothing to GitHub. */
function resolveDecision(db: DatabaseSync, c: CardRow, decisionId: string | undefined, stamp: string | undefined, summary: string, by: string, at: string): Outcome {
  if (!decisionId) throw new Error("the card names no decision: the decision changed");
  db.exec("BEGIN IMMEDIATE");
  try {
    const d = getDecision(db, decisionId);
    if (!d || d.answer !== null || d.repo !== c.repo || d.number !== c.number || (stamp !== undefined && decisionStamp(db, d) !== stamp)) throw new Error("the decision changed");
    const r = db.prepare(`UPDATE main.decisions SET answer = ?, answer_note = ?, exceptions = NULL, answered_by = ?, answered_at = ?, applied_at = ?, adopted_opinion = NULL, snoozed_by = NULL, snoozed_at = NULL, exec_state = NULL, exec_reason = NULL
      WHERE id = ? AND answer IS NULL`).run(HANDLED.key, summary, by, at, at, d.id);
    if (r.changes !== 1) throw new Error("the decision changed");
    db.prepare("DELETE FROM main.decision_claims WHERE decision_id = ?").run(d.id);
    replaceProposedCards(db, d.repo, d.number, d.id);
    audit(db, by, "answer", d.id, { answer: HANDLED.key, source: "conversation", card: c.id });
    db.exec("COMMIT");
    return { result: "Decision closed as handled in the conversation", url: null };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

async function liveOpen(q: Querier, repo: string, n: number) {
  const live = await readLive(q, repo, n);
  if (!live) throw new Error("GitHub returned no such item");
  if (live.state !== "OPEN") throw new Error(`already ${live.state.toLowerCase()} on GitHub`);
  return live;
}

/** A resolution step failed; `posted` says the comment step had completed. */
class StepError extends Error {
  posted: boolean;
  constructor(message: string, posted: boolean) { super(message); this.posted = posted; }
}

type Ctx = {
  exec: Exec;
  /** The transport for a write in `repo`: the operator's lane on a repo with the app's identity, the box's own on a legacy repo. */
  execFor: (repo: string) => Exec;
  /** Labels the same card removes: a type label among them does not block adding another. */
  unlabeling?: string[];
  /** The operator's note: kept on the decision it settles, never posted to GitHub. */
  note?: string; db: DatabaseSync; c: CardRow; by: string; q: Querier; at: string; w: Writer; source: { source: string; card: number } };

async function postComment({ db, c, by, q, w, source }: Ctx, text: string): Promise<Outcome> {
  const g = actGrant(db, c.repo, by);
  const live = await liveOpen(q, c.repo, c.number);
  const url = await commentOn(w, g, q, "act-comment", { repo: c.repo, number: c.number, id: live.id }, cardNote(db, c), text, source);
  return { result: "Comment posted", url: url || null };
}

async function addLabel({ db, c, by, q, at, w, source, unlabeling }: Ctx, label: string): Promise<Outcome> {
  const g = actGrant(db, c.repo, by, "labels");
  const other = otherTypeLabel(db, c.repo, c.number, label, unlabeling);
  if (other) throw new Error(`the item already has the type label "${other}" and an item has one type label`);
  const live = await liveOpen(q, c.repo, c.number);
  const have = await repoLabels(q, c.repo);
  const id = have.labels.get(label.toLowerCase());
  if (!id) throw new Error(`the label "${label}" does not exist on ${c.repo}`);
  const done = await addLabels(w, q, c.repo, [{ number: c.number, id: live.id, labelIds: [id], names: [label], g }], undefined, source);
  if (!done.includes(c.number)) throw new Error("GitHub did not add the label");
  db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, 'labeled', ?, ?, ?)").run(c.repo, c.number, at, by, `added: ${label}`);
  return { result: `Label "${label}" added`, url: null };
}

/** Closes the item (after the optional comment) and returns how it was closed, for notes. Settling the decisions is the caller's. */
async function closeThe({ db, c, by, q, at, w, source }: Ctx, p: { reason: CloseReason }, text: string | null): Promise<{ how: string; url: string }> {
  const g = actGrant(db, c.repo, by);
  const refusal = closeRefusal(db, c.repo, c.number);
  if (refusal) throw new Error(refusal);
  const live = await liveOpen(q, c.repo, c.number);
  const item = { repo: c.repo, number: c.number, id: live.id };
  const url = text ? await commentOn(w, g, q, "act-comment", item, cardNote(db, c), text, source) : "";
  await closeItem(w, g, q, { ...item, pr: live.type === "PullRequest" }, { ...source, head: live.head }, p.reason === "completed" ? "COMPLETED" : "NOT_PLANNED");
  const how = live.type === "PullRequest" ? "" : p.reason === "completed" ? " as completed" : " as not planned";
  db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, 'closed', ?, ?, ?)").run(c.repo, c.number, at, by, `closed${how} from a conversation`);
  return { how, url };
}

/** The item is closed or moved: its open decisions (but `except`) are settled now, not at the next sync's withdrawal. `what` is the phrase after "Closed" or the whole summary when it starts with "Moved". */
function settleOthers(db: DatabaseSync, c: CardRow, how: string, by: string, at: string, except?: string): void {
  const open = db.prepare("SELECT id FROM decisions WHERE repo = ? AND number = ? AND answer IS NULL AND id NOT LIKE '%:dupegroup:%'").all(c.repo, c.number) as { id: string }[];
  for (const d of open) {
    if (d.id === except) continue;
    try { resolveDecision(db, c, d.id, undefined, how.startsWith("Moved") ? `${how} in the conversation` : `Closed${how} in the conversation`, by, at); } catch { /* answered meanwhile; the next sync withdraws what is left */ }
  }
}

/** Closes the item as a duplicate: Act's comment and close, recorded in `actions`. */
async function closeDuplicate({ db, c, by, q, at, w, source }: Ctx, of: number): Promise<{ url: string }> {
  const g = actGrant(db, c.repo, by);
  const refusal = closeRefusal(db, c.repo, c.number);
  if (refusal) throw new Error(refusal);
  const live = await liveOpen(q, c.repo, c.number);
  const orig = await readLive(q, c.repo, of);
  if (!orig) throw new Error(`GitHub returned no ${ref(c.repo, of)}`);
  const url = await commentOn(w, g, q, "act-comment", { repo: c.repo, number: c.number, id: live.id }, cardNote(db, c), duplicateComment({ repo: c.repo, original: ref(c.repo, of), closed: orig.state !== "OPEN" }), source);
  // Recorded like Act's close: saved after the comment so the failed close shows what was posted.
  const action = (state: string, reason: string | null) => db.prepare(`INSERT INTO main.actions (decision_id, repo, number, kind, state, comment_url, reason, created_at) VALUES (?, ?, ?, 'comment-close', ?, ?, ?, ?)
    ON CONFLICT (decision_id, repo, number, kind) DO UPDATE SET state = excluded.state, reason = excluded.reason, created_at = excluded.created_at`).run(`conversation-card:${c.id}`, c.repo, c.number, state, url || null, reason, at);
  action("failed", "comment posted; close not done yet");
  await closeItem(w, g, q, { repo: c.repo, number: c.number, id: live.id, pr: live.type === "PullRequest" }, { ...source, head: live.head });
  action("done", null);
  db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, 'closed', ?, ?, ?)").run(c.repo, c.number, at, by, `closed as a duplicate of ${ref(c.repo, of)} from a conversation`);
  return { url };
}

/** The Act approval of `repo` for the operator's write. Room under the daily limit was taken for the whole card before its first write (doCard), so a card never stops halfway for it. */
function actGrant(db: DatabaseSync, repo: string, by: string, need: "comment" | "labels" = "comment") {
  // The grant names the presser; only a close is made as them (src/github/identity.ts).
  const g = guardRepo(db, repo, need, { operator: by }, undefined, by);
  if ("refused" in g) throw new Error(g.refused);
  return g;
}

const USER_ID = `query($login: String!) { user(login: $login) { id login } }`;
const COLLABORATORS = `query($owner: String!, $name: String!, $login: String!) { repository(owner: $owner, name: $name) { collaborators(query: $login, first: 10) { edges { permission node { login } } } } }`;
const REPO_ID = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id } }`;

async function userOf(q: Querier, login: string): Promise<{ id: string; login: string }> {
  const d = await q.query(USER_ID, { login }) as { user?: { id: string; login: string } | null };
  if (!d.user) throw new Error(`GitHub has no user ${login}`);
  return d.user;
}

/** Reads the live permission: `login` must hold write, maintain or admin on the repo. Throws when GitHub cannot tell. */
/**
 * The login's write permission on the repo, read from GitHub now. "no" only when the list is empty or its edge for the login has a lower
 * permission; a missing repository or collaborators field (a partial or failed read) is "transient".
 */
async function livePermission(q: Querier, repo: string, login: string): Promise<"ok" | "no" | "transient"> {
  const d = await q.query(COLLABORATORS, { owner: ownerOf(repo), name: repo, login }) as { repository?: { collaborators?: { edges?: { permission: string; node: { login: string } }[] } | null } | null };
  const edges = d.repository?.collaborators?.edges;
  if (!edges) return "transient";
  if (edges.length === 0) return "no";
  const e = edges.find((x) => x.node.login.toLowerCase() === login.toLowerCase());
  if (!e) return "transient";
  return ["WRITE", "MAINTAIN", "ADMIN"].includes(e.permission) ? "ok" : "no";
}

async function needLiveWrite(q: Querier, repo: string, login: string): Promise<void> {
  const p = await livePermission(q, repo, login);
  if (p === "no") throw new Error(`${login} does not have write access to ${repo}`);
  if (p === "transient") throw new Error(`could not read ${login}'s access to ${repo} from GitHub`);
}

/** The presser's write permission on a repo the box acts on; a failed read is "transient". */
export async function liveWrite(q: Querier, repo: string, login: string): Promise<"ok" | "no" | "transient"> {
  try {
    return await livePermission(q, repo, login);
  } catch {
    return "transient";
  }
}

async function unlabel(ctx: Ctx, label: string): Promise<Outcome> {
  const { db, c, by, q, w, source } = ctx;
  const g = actGrant(db, c.repo, by, "labels");
  const live = await liveOpen(q, c.repo, c.number);
  const id = (await repoLabels(q, c.repo)).labels.get(label.toLowerCase());
  if (!id) throw new Error(`the label "${label}" does not exist on ${c.repo}`);
  await removeLabel(w, g, q, { repo: c.repo, number: c.number, id: live.id }, { id, name: label }, source);
  // The mirror catches up at the next sync; later steps of this card read it now.
  const row = db.prepare("SELECT labels FROM main.items WHERE repo = ? AND number = ?").get(c.repo, c.number) as { labels: string | null } | undefined;
  try {
    const have = JSON.parse(row?.labels ?? "[]") as unknown[];
    db.prepare("UPDATE main.items SET labels = ? WHERE repo = ? AND number = ?").run(JSON.stringify(have.filter((x) => String(x).toLowerCase() !== label.toLowerCase())), c.repo, c.number);
  } catch { /* unreadable labels stay for the sync to rewrite */ }
  return { result: `Label "${label}" removed`, url: null };
}

async function reopen(ctx: Ctx): Promise<Outcome> {
  const { db, c, by, q, w, source } = ctx;
  const g = actGrant(db, c.repo, by);
  const refusal = closeRefusal(db, c.repo, c.number);
  if (refusal) throw new Error(refusal);
  const live = await readLive(q, c.repo, c.number);
  if (!live) throw new Error("GitHub returned no such item");
  if (live.state === "OPEN") throw new Error("already open on GitHub");
  if (live.state !== "CLOSED") throw new Error(`${live.state.toLowerCase()} on GitHub: it cannot be reopened`);
  await reopenItem(w, g, q, { repo: c.repo, number: c.number, id: live.id, pr: live.type === "PullRequest" }, source);
  return { result: "Reopened", url: null };
}

async function openIssue(ctx: Ctx, st: Extract<Step, { kind: "open_issue" }>): Promise<Outcome> {
  const { db, c, by, w, source } = ctx;
  const exec = ctx.execFor(st.repo);
  const g = actGrant(db, st.repo, by);
  try {
    const made = await createIssue(w, g, exec, { repo: st.repo, target: ref(c.repo, c.number), title: st.title, body: st.body, action: "act-open-issue" }, cardNote(db, c), source);
    return { result: `Opened ${ref(st.repo, made.number)}`, url: made.url };
  } catch (e) {
    if (e instanceof IssueError && !e.clear) throw new Error(`${e.message}; the issue may exist in ${st.repo}, check before running again`);
    throw e;
  }
}

async function transfer(ctx: Ctx, st: Extract<Step, { kind: "transfer" }>): Promise<Outcome> {
  const { db, c, by, q, w, source } = ctx;
  const g = actGrant(db, c.repo, by);
  const gTo = actGrant(db, st.to, by);
  const refusal = closeRefusal(db, c.repo, c.number);
  if (refusal) throw new Error(refusal);
  const live = await liveOpen(q, c.repo, c.number);
  if (live.type !== "Issue") throw new Error("only an issue can be moved to another repository");
  if (ownerOf(st.to) !== ownerOf(c.repo)) throw new Error("an issue moves only between repositories of one owner");
  const t = await q.query(REPO_ID, { owner: ownerOf(st.to), name: st.to }) as { repository?: { id: string } | null };
  if (!t.repository) throw new Error(`GitHub has no repository ${st.to}`);
  const url = await transferIssue(w, g, gTo, q, { repo: c.repo, number: c.number, id: live.id }, { repo: st.to, id: t.repository.id }, source);
  return { result: `Moved to ${st.to}`, url: url || null };
}

async function assign(ctx: Ctx, login: string): Promise<Outcome> {
  const { db, c, by, q, w, source } = ctx;
  const g = actGrant(db, c.repo, by);
  const live = await liveOpen(q, c.repo, c.number);
  const author = (db.prepare("SELECT author FROM items WHERE repo = ? AND number = ?").get(c.repo, c.number) as { author: string | null } | undefined)?.author ?? null;
  if (author?.toLowerCase() !== login.toLowerCase()) await needLiveWrite(q, c.repo, login);
  await assignTo(w, g, q, { repo: c.repo, number: c.number, id: live.id }, await userOf(q, login), source);
  return { result: `Assigned ${login}`, url: null };
}

async function askReviewers(ctx: Ctx, logins: string[]): Promise<Outcome> {
  const { db, c, by, q, w, source } = ctx;
  const g = actGrant(db, c.repo, by);
  const live = await liveOpen(q, c.repo, c.number);
  if (live.type !== "PullRequest") throw new Error("reviewers can be requested on a PR only");
  const author = (db.prepare("SELECT author FROM items WHERE repo = ? AND number = ?").get(c.repo, c.number) as { author: string | null } | undefined)?.author ?? null;
  const users: { id: string; login: string }[] = [];
  for (const l of logins) {
    if (author?.toLowerCase() === l.toLowerCase()) throw new Error(`${l} is the PR's author`);
    await needLiveWrite(q, c.repo, l);
    users.push(await userOf(q, l));
  }
  await requestReviewers(w, g, q, { repo: c.repo, number: c.number, id: live.id }, users, source);
  return { result: `Asked ${logins.join(", ")} for a review`, url: null };
}

/** Fails before any step runs when the decision a resolution settles has changed. */
async function checkSettle(db: DatabaseSync, c: CardRow, s: Settle, canWrite?: ActDeps["canWrite"]): Promise<void> {
  const d = getDecision(db, s.decision);
  if (!d || d.answer !== null || d.repo !== c.repo || d.number !== c.number || decisionStamp(db, d) !== s.stamp) throw new Error("the decision changed");
  if (s.kind === "answer" && !optionsOf(d).some((x) => x.key === s.option)) throw new Error(`"${s.option}" is not an option of the decision`);
  if (s.kind !== "handled" && canWrite) for (const r of reposOf(d)) if (!(await canWrite(r).catch(() => false))) throw new Error(`no write access to ${slugOf(r)}`);
}

/** Runs the steps in order, then the settlement. A failure stops the run, leaves the decision open and names the steps already done. */
async function runResolution(ctx: Ctx, p: CardParams & { kind: "resolution" }, canWrite?: ActDeps["canWrite"]): Promise<Outcome> {
  const { db, c, by, at } = ctx;
  if (p.settle) await checkSettle(db, c, p.settle, canWrite);
  else if (!(p.steps.length === 1 && p.steps[0]!.kind === "comment") && openDecision(db, c.repo, c.number)) throw new Error("the decision changed");
  ctx.unlabeling = p.steps.flatMap((x) => (x.kind === "unlabel" ? [x.label] : []));
  const done: string[] = [];
  const results: string[] = [];
  let url: string | null = null;
  let closedHow: string | null = null;
  // A keep answer with a fix-up is recorded after the other steps and before the fix-up, so the fix-up's plan check and the later review see the PR in core.
  const early = p.settle?.kind === "answer" && p.steps.some((x) => x.kind === "fixup") ? p.settle : null;
  let answered = false;
  const answerNow = async (s: NonNullable<typeof early>): Promise<void> => {
    results.push((await answerDecision(db, c, s.decision, s.stamp, s.option, by, at, canWrite, ctx.note, s.reason)).result);
    answered = true;
    done.push(settleLine(db, s));
  };
  try {
    for (const st of p.steps) {
      if (early && !answered && st.kind === "fixup") await answerNow(early);
      switch (st.kind) {
        case "comment": {
          const o = await postComment(ctx, c.text ?? "");
          url ??= o.url;
          results.push(o.result);
          break;
        }
        case "label": results.push((await addLabel(ctx, st.label)).result); break;
        case "close": {
          const r = await closeThe(ctx, st, null);
          closedHow = r.how;
          results.push(`Closed${r.how}`);
          break;
        }
        case "duplicate": {
          const r = await closeDuplicate(ctx, st.of);
          url ??= r.url || null;
          closedHow = " as a duplicate";
          results.push(`Closed as a duplicate of ${ref(c.repo, st.of)}`);
          break;
        }
        case "unlabel": results.push((await unlabel(ctx, st.label)).result); break;
        case "reopen": results.push((await reopen(ctx)).result); break;
        case "open_issue": {
          const o = await openIssue(ctx, st);
          url ??= o.url;
          results.push(o.result);
          break;
        }
        case "transfer": {
          const o = await transfer(ctx, st);
          url ??= o.url;
          closedHow = `Moved to ${st.to}`;
          results.push(o.result);
          break;
        }
        case "assign": results.push((await assign(ctx, st.login)).result); break;
        case "request_reviewers": results.push((await askReviewers(ctx, st.logins)).result); break;
        case "review": case "fixup": results.push((await runPipelineStep(db, { repo: c.repo, number: c.number, step: st, by })).label); break;
      }
      done.push(stepLine(st));
    }
    const s = p.settle;
    if (s && !answered) {
      results.push((s.kind === "answer" ? await answerDecision(db, c, s.decision, s.stamp, s.option, by, at, canWrite, ctx.note, s.reason)
        : s.kind === "backlog" ? await answerDecision(db, c, s.decision, s.stamp, BACKLOG.key, by, at, canWrite, ctx.note)
        : resolveDecision(db, c, s.decision, s.stamp, ctx.note ? `${s.summary}: ${ctx.note}` : s.summary, by, at)).result);
    }
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    throw new StepError(done.length ? `Already done: ${done.join("; ")}. ${msg}${answered ? ". The question is answered" : ". The question stays open"}` : msg, done.includes(stepLine({ kind: "comment" })));
  }
  if (closedHow !== null) settleOthers(db, c, closedHow, by, at, p.settle?.decision);
  return { result: results.join("; "), url };
}

async function run(db: DatabaseSync, c: CardRow, p: CardParams, by: string, boxQ: Querier, at: string, canWrite?: ActDeps["canWrite"], note?: string, boxExec: Exec = defaultExec, lane: Lane | null = null): Promise<Outcome> {
  // Under the app's identity only a close uses the presser's lane (write.ts); every other write is the app's.
  const laneFor = (repo: string): Lane | null => (lane && githubIdentity(db) === "app" ? lane : null);
  const q = laneFor(c.repo)?.querier ?? boxQ;
  const ctx: Ctx = { exec: laneFor(c.repo)?.exec ?? boxExec, execFor: (repo) => laneFor(repo)?.exec ?? boxExec, note, db, c, by, q, at, w: { db, login: by }, source: { source: "conversation", card: c.id } };
  switch (p.kind) {
    case "resolution": return runResolution(ctx, p, canWrite);
    case "answer": return answerDecision(db, c, p.decision, p.stamp, p.option, by, at, canWrite, note);
    case "resolve": return resolveDecision(db, c, p.decision, p.stamp, note ? `${p.summary}: ${note}` : p.summary, by, at);
    case "backlog": return answerDecision(db, c, p.decision, p.stamp, BACKLOG.key, by, at, canWrite, note);
    case "comment": return postComment(ctx, c.text ?? p.text);
    case "label": return addLabel(ctx, p.label);
    case "close": {
      const r = await closeThe(ctx, p, c.text);
      settleOthers(db, c, r.how, by, at);
      return { result: `Closed${r.how}`, url: r.url || null };
    }
    case "duplicate": {
      const r = await closeDuplicate(ctx, p.of);
      return { result: `Closed as a duplicate of ${ref(c.repo, p.of)}`, url: r.url || null };
    }
  }
}

/**
 * Runs the card once. A card that is not `proposed` is returned unchanged, so a second press (or a double click) does nothing.
 * A failure is stored on the card; the card does not run again.
 */
export async function doCard(db: DatabaseSync, id: number, by: string, deps: ActDeps = {}): Promise<{ card: CardRow; ran: boolean }> {
  const c = need(db, id);
  if (c.state === "replaced") throw new ConversationError(409, "replaced by a later reply");
  const draining = deps.drain === true && c.state === "queued";
  if (c.state === "queued" && !draining) return { card: c, ran: false };
  let params = JSON.parse(c.params) as CardParams;
  if ((c.state === "proposed" || draining) && staleOf(db, c.repo, c.number, c.seen) === "pr-changed" && dependsOnCode(params, c.text)) throw new ConversationError(409, "the PR changed since this was proposed");
  const note = deps.note?.trim() || undefined;
  if (note && note.length > NOTE_MAX) throw new ConversationError(400, `the note is longer than ${NOTE_MAX} characters`);
  const skipped: string[] = [];
  let noteIsSummary = false;
  // A card drafted before the PR became quiet (a security fix not yet published) must not post model-written text any more.
  if ((params.kind === "comment") || (params.kind === "close" && c.text) || (params.kind === "resolution" && params.steps.some((x) => PUBLIC_TEXT_STEPS.has(x.kind)))) {
    if (isQuiet(db, c.repo, c.number)) throw new ConversationError(409, "this card posts text, and the pull request is quiet until its fix is published");
  }
  if (deps.skip?.length) {
    if (params.kind !== "resolution") throw new ConversationError(400, "only a resolution has steps to skip");
    const all = params.steps;
    if (new Set(deps.skip).size !== deps.skip.length || deps.skip.some((k) => !Number.isInteger(k) || k < 0 || k >= all.length)) throw new ConversationError(400, "skip must list distinct step positions of the card");
    const steps = all.filter((_, k) => !deps.skip!.includes(k));
    if (steps.length === 0 && !params.settle) throw new ConversationError(400, "a card with no steps left and no settlement does nothing");
    skipped.push(...all.filter((_, k) => deps.skip!.includes(k)).map(stepLine));
    params = { ...params, steps };
    // The settlement derived from a close step says the item was closed; without that step only the operator's own words are true.
    if (params.settle?.kind === "handled" && params.settle.fromClose && all.some((x, k) => deps.skip!.includes(k) && isSettling(x))) {
      if (!note) throw new ConversationError(400, "skipping the step that settles the question needs a note saying how it was handled");
      params = { ...params, settle: { kind: "handled", decision: params.settle.decision, summary: note, stamp: params.settle.stamp } };
      noteIsSummary = true;
    }
  }
  // A card's close is the pressing operator's own: under the app's identity it uses that operator's token, and a card that cannot stays proposed. Its other writes are the app's.
  const repos = cardRepos(c, params);
  const writes = params.kind === "comment" || params.kind === "label" || params.kind === "close" || params.kind === "duplicate"
    || (params.kind === "resolution" && params.steps.some((x) => x.kind !== "review" && x.kind !== "fixup"));
  const writing = writesItem(params);
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  // A press from the queue is carried out as its presser if they still may: their role and write access are read again now.
  if (draining) {
    if (writes && !settlesNow(db, by, repos)) throw new ConversationError(409, `${by} no longer has write access`);
    if (writes) {
      const q = deps.querier ?? new Client(1000);
      for (const r of githubIdentity(db) === "app" ? [] : repos) {
        const live = await liveWrite(q, r, by);
        if (live === "no") throw new ConversationError(409, `${by} no longer has write access to ${slugOf(r)}`);
        if (live === "transient") throw new ConversationError(503, "GitHub could not be reached to check the presser's access");
      }
    }
  }
  // Only a close is made as the presser; a card that closes nothing runs as the app and needs no token.
  const closes = params.kind === "close" || params.kind === "duplicate" || (params.kind === "resolution" && params.steps.some((x) => x.kind === "close" || x.kind === "duplicate"));
  const lr = writes && closes ? await laneForOperator(db, deps.lane, by, repos) : null;
  if (lr && !("lane" in lr)) throw new ConversationError("transient" in lr ? 503 : 409, "transient" in lr ? `GitHub could not be reached to check your access: ${lr.transient}` : lr.reason);
  const at = (deps.now?.() ?? new Date()).toISOString();
  // The card claims the decision it settles in the transaction that queues or starts it: no dashboard answer or other card settles it meanwhile.
  const settles = settledDecisionOf(params);
  const needW = cardWriteCount(params, c.text);
  // Refusals a press that has to wait would only meet at the drain are given now.
  if (!draining && needW > 0 && (!actRoom(db, needW, nowMs) || queuedAhead(db, id))) {
    const g = guardRepo(db, c.repo, grantNeed(params), { operator: by }, undefined, by);
    if ("refused" in g) throw new ConversationError(409, g.refused);
    if (params.kind === "resolution" && params.settle) await checkSettle(db, c, params.settle, deps.canWrite).catch((e) => { throw new ConversationError(409, String((e as Error).message ?? e)); });
  }
  let queued = false;
  db.exec("BEGIN IMMEDIATE");
  try {
    const from = draining ? "queued" : "proposed";
    // Room is taken in this transaction, for all the card's writes at once. A press queues behind the presses already waiting.
    const wait = needW > 0 && (!actRoom(db, needW, nowMs) || (!draining && queuedAhead(db, id)));
    if (wait && draining) { db.exec("ROLLBACK"); return { card: c, ran: false }; }
    if (wait) {
      const block = actBlockedReason(db, c.repo);
      if (block) throw new Error(`The daily GitHub write limit leaves no room and ${block}, so this cannot wait in line`);
    }
    const claim = wait
      ? db.prepare("UPDATE conversation_cards SET state = 'queued', acted_by = ?, acted_at = ?, queued_at = ?, queue_args = ?, error = NULL, dispute_by = NULL, dispute_reason = NULL, dispute_at = NULL WHERE id = ? AND state = 'proposed'")
        .run(by, at, at, JSON.stringify({ ...(deps.skip?.length && { skip: deps.skip }), ...(note && { note }), ...(deps.noteStaysOut && { noteStaysOut: true }), ...(deps.role && { role: deps.role }) } satisfies QueueArgs), id)
      : db.prepare("UPDATE conversation_cards SET state = 'running', acted_by = ?, acted_at = ? WHERE id = ? AND state = ? AND dispute_by IS NULL").run(by, at, id, from);
    if (claim.changes !== 1) { db.exec("ROLLBACK"); return { card: need(db, id), ran: false }; }
    // Checked inside the transaction that starts the run, so an answer written a moment ago is seen.
    const refusal = writing ? pendingAnswerRefusal(db, c.repo, c.number, by) : null;
    if (refusal) throw new Error(refusal);
    if (settles) claimSettling(db, settles, id, by);
    db.exec("COMMIT");
    queued = wait;
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw new ConversationError(409, String((e as Error).message ?? e));
  }
  if (queued) {
    audit(db, by, "conversation-card-queue", ref(c.repo, c.number), { card: id, kind: c.kind });
    insertTurn(db, c.repo, c.number, {
      kind: "system", login: "system", body: `${by} pressed the card: ${c.description}. Queued: daily GitHub write limit.` + (note ? ` Note: ${note}` : ""),
      block: systemBlock(`The ${deps.role ?? "operator"} ${by} chose the proposed action: ${c.description}. It is queued behind the daily limit of GitHub writes and runs in order when room returns.`),
    }, deps);
    return { card: need(db, id), ran: false };
  }
  let out: Outcome | null = null, error: string | null = null, posted = false;
  try {
    out = await run(db, c, params, by, deps.querier ?? new Client(1000), at, deps.canWrite, noteIsSummary ? undefined : note, deps.exec, lr ? lr.lane : null);
  } catch (e) {
    error = oneLine(String((e as Error).message ?? e));
    posted = e instanceof StepError && e.posted;
  }
  if (settles) releaseSettling(db, settles, id);
  if (out && skipped.length) out = { ...out, result: `${out.result} (skipped: ${skipped.join("; ")})` };
  const end = (deps.now?.() ?? new Date()).toISOString();
  db.prepare("UPDATE conversation_cards SET state = ?, result = ?, result_url = ?, error = ?, acted_at = ? WHERE id = ?")
    .run(out ? "done" : "failed", out?.result ?? null, out?.url ?? null, error, end, id);
  audit(db, by, "conversation-card", ref(c.repo, c.number), { card: id, kind: c.kind, state: out ? "done" : "failed", error: error ?? undefined, ...(skipped.length && { skipped }), ...(note && { note: true }) });
  const who = deps.role ?? "operator";
  const sentence = out ? `The ${who} ${by} ran the proposed action: ${c.description}. Result: ${out.result}.` : `The ${who} ${by} tried the proposed action: ${c.description}${skipped.length ? ` (without: ${skipped.join("; ")})` : ""}. It failed: ${error}.`;
  // Only text that was posted, and only text no non-operator wrote, goes into the model's block.
  const editedByOperator = !c.edited_by || !!db.prepare("SELECT 1 FROM access WHERE login = ? AND role = 'operator'").get(c.edited_by);
  const posted_text = !(out || posted) || !editedByOperator ? undefined : params.kind === "comment" ? c.text ?? params.text : (params.kind === "close" || (params.kind === "resolution" && params.steps.some((x) => x.kind === "comment") && (out || posted))) && c.text ? c.text : undefined;
  const modelNote = deps.noteStaysOut ? undefined : note;
  const data = posted_text !== undefined || modelNote ? { ...(posted_text !== undefined && { posted_text }), ...(modelNote && { operator_note: modelNote }) } : undefined;
  insertTurn(db, c.repo, c.number, {
    kind: "system", login: "system", body: (out ? `${by} ran the card: ${c.description}. ${out.result}.` : `${by} tried the card: ${c.description}. It failed: ${error}.`) + (note ? ` Note: ${note}` : ""),
    block: systemBlock(sentence, data),
  }, deps);
  return { card: need(db, id), ran: true };
}

/** Ends a queued card that cannot run, with the reason, and frees the decision it held. */
function failQueued(db: DatabaseSync, c: CardRow, error: string, deps: StoreDeps): void {
  const at = (deps.now?.() ?? new Date()).toISOString();
  let settles: string | undefined;
  try { settles = settledDecisionOf(JSON.parse(c.params) as CardParams); } catch { /* a card with unreadable parameters settles nothing */ }
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = db.prepare("UPDATE conversation_cards SET state = 'failed', error = ?, acted_at = ? WHERE id = ? AND state = 'queued'").run(error, at, c.id);
    if (r.changes === 1 && settles) releaseSettling(db, settles, c.id);
    db.exec("COMMIT");
    if (r.changes !== 1) return;
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
  audit(db, c.acted_by ?? "system", "conversation-card", ref(c.repo, c.number), { card: c.id, kind: c.kind, state: "failed", error, queued: true });
  insertTurn(db, c.repo, c.number, { kind: "system", login: "system", body: `${c.acted_by}'s queued card could not run: ${c.description}. ${error}.`, block: systemBlock(`The queued action chosen by ${c.acted_by} could not run: ${c.description}. ${error}.`) }, deps);
}

/**
 * Runs the queued cards that have room, in queue order, as their pressers pressed them (note, skipped steps and role are kept on the
 * card). Stops at the first card that still has no room, so a later one never passes it. A disputed press is skipped, as is one whose repo
 * the pipeline does not cover now. A card that cannot run (the presser lost access, the item closed, the decision changed) fails with the
 * reason and frees its decision; a transient GitHub error leaves it queued. `writes` is how many GitHub writes the caller still allows
 * (the Act job's limit). Returns the cards run and the writes they were counted for.
 */
export async function drainQueuedCards(db: DatabaseSync, deps: ActDeps = {}, o: { writes?: number } = {}): Promise<{ ran: number; writes: number }> {
  let ran = 0, used = 0;
  for (const q of queuedCards(db, { all: true })) {
    if (q.dispute_by) continue;
    const c = cardOf(db, q.id);
    // Read again now: a dispute that landed since the list was taken stops the press.
    if (!c || c.state !== "queued" || !c.acted_by || c.dispute_by) continue;
    const nowMs = (deps.now?.() ?? new Date()).getTime();
    let args: QueueArgs, params: CardParams, need: number;
    try {
      args = JSON.parse(c.queue_args ?? "{}") as QueueArgs;
      params = JSON.parse(c.params) as CardParams;
      need = needOf(c);
    } catch (e) {
      failQueued(db, c, oneLine(`the queued press cannot be read: ${(e as Error).message}`), deps);
      continue;
    }
    const block = actBlockedReason(db, c.repo);
    if (block) { failQueued(db, c, `Act cannot run for ${c.repo} now: ${block}`, deps); continue; }
    if (!actRoom(db, need, nowMs) || (o.writes !== undefined && used + need > o.writes)) break;
    const item = db.prepare("SELECT state FROM main.items WHERE repo = ? AND number = ?").get(c.repo, c.number) as { state: string } | undefined;
    if (item && item.state !== "OPEN") { failQueued(db, c, `the item is already ${item.state.toLowerCase()}`, deps); continue; }
    try {
      const r = await doCard(db, c.id, c.acted_by, { ...deps, drain: true, skip: args.skip, note: args.note, noteStaysOut: args.noteStaysOut, role: args.role, canWrite: undefined });
      if (r.ran) { ran++; used += need; }
      // Room was taken by someone else between the check and the claim: a smaller card behind this one does not jump it.
      else if (cardOf(db, c.id)?.state === "queued" && !cardOf(db, c.id)?.dispute_by) break;
    } catch (e) {
      if (e instanceof ConversationError && e.status === 503) continue;
      failQueued(db, c, oneLine(String((e as Error).message ?? e)), deps);
    }
  }
  return { ran, writes: used };
}

/** The approval a card's writes need: labels alone need the labelling approval, anything else the commenting one. */
const grantNeed = (p: CardParams): "comment" | "labels" =>
  p.kind === "label" || (p.kind === "resolution" && p.steps.length > 0 && p.steps.every((x) => x.kind === "label" || x.kind === "unlabel" || x.kind === "review" || x.kind === "fixup")) ? "labels" : "comment";

/** The decision the card settles, if any. */
const settledDecisionOf = (p: CardParams): string | undefined =>
  p.kind === "answer" || p.kind === "resolve" || p.kind === "backlog" ? p.decision : p.kind === "resolution" ? p.settle?.decision : undefined;

/** Whether the card writes something besides a comment to the item, so it must not run against an answer someone gave and the pipeline has not applied. */
const WRITING_STEPS = new Set(["close", "duplicate", "transfer", "label", "unlabel", "reopen"]);
const writesItem = (p: CardParams): boolean =>
  p.kind === "close" || p.kind === "duplicate" || p.kind === "label" || (p.kind === "resolution" && p.steps.some((x) => WRITING_STEPS.has(x.kind)));

/** A card left 'running' by a crashed process is marked failed: what it did on GitHub is unknown. */
export { RUNNING_STALE_MS };
export function sweepRunningCards(db: DatabaseSync, deps?: StoreDeps): number {
  const cutoff = new Date((deps?.now?.() ?? new Date()).getTime() - RUNNING_STALE_MS).toISOString();
  const n = db.prepare("UPDATE conversation_cards SET state = 'failed', error = 'outcome unknown; see the GitHub activity page' WHERE state = 'running' AND acted_at < ?").run(cutoff).changes as number;
  sweepSettling(db);
  return n;
}
