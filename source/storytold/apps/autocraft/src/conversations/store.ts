// Conversation storage: the item block (written once), the turns in prompt order, and the cards of each Opus turn.
// Every turn stores the exact text its prompt block carries, so later prompts repeat earlier ones byte for byte.
import { isBotLogin } from "../review/bots.ts";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { factsOf, getDecision, optionsOf, type DecisionRow } from "../decisions.ts";
import { CLAUDE_PROMPTS, untrustedJson } from "../prompts/index.ts";
import { applicableSteps, cleanComment, openDecision, type NewCard } from "./cards.ts";
import { choicesJson, storeParsedChoices, type ParsedChoices } from "../decide/choices-parse.ts";
import { coreSummaries } from "../decide/choices.ts";
import { ITEM_BODY_LIMIT, ITEM_COMMENT_LIMIT, ITEM_COMMENTS, ITEM_DIFF_LIMIT, MESSAGE_MAX, OPENING_MAX, type TurnKind } from "./types.ts";

export class ConversationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The pull request diff for the item block, or null (an issue, an unavailable or oversized diff). Injected: the default asks GitHub. */
export type DiffSource = (repo: string, number: number, head: string) => Promise<string | null>;
export type StoreDeps = { diff?: DiffSource; now?: () => Date };
const nowOf = (d?: StoreDeps) => (d?.now?.() ?? new Date()).toISOString();

export type ConversationRow = { repo: string; number: number; item_block: string; item_sig: string; created_at: string; created_by: string };
export type TurnRow = { id: number; repo: string; number: number; kind: TurnKind; login: string; at: string; body: string; block: string; status: string | null; error: string | null; notes: string | null; seq: number | null; claim: string | null; claimed_at: string | null; progress: string | null };

export const conversationOf = (db: DatabaseSync, repo: string, n: number): ConversationRow | undefined =>
  db.prepare("SELECT * FROM conversations WHERE repo = ? AND number = ?").get(repo, n) as ConversationRow | undefined;

/** All turns in display order: the prompt order, then the message Opus is answering, then turns held until its reply. */
export const turnsOf = (db: DatabaseSync, repo: string, n: number): TurnRow[] =>
  db.prepare("SELECT * FROM conversation_turns WHERE repo = ? AND number = ? ORDER BY seq IS NULL, COALESCE(status, '') = 'held', seq, id").all(repo, n) as unknown as TurnRow[];

/** The operator message that waits for its reply: queued or claimed by a run. */
export const pendingTurn = (db: DatabaseSync, repo: string, n: number): TurnRow | undefined =>
  db.prepare("SELECT * FROM conversation_turns WHERE repo = ? AND number = ? AND kind = 'operator' AND status IN ('pending', 'answering')").get(repo, n) as TurnRow | undefined;

/** A claim older than this is released: a run makes `attempts` calls of at most the prompt timeout each. */
const STALE_CLAIM_MS = (CLAUDE_PROMPTS["conversation.turn"].limits.timeoutSeconds * CLAUDE_PROMPTS["conversation.turn"].limits.attempts + 60) * 1000;

// ---- blocks ------------------------------------------------------------------

/** Text of operators and Opus must not close or open the frame the prompt puts around turns. */
const frameSafe = (t: string): string => t.replace(/<(\/?)(turn|item|actions|choices|cores|untrusted|included|steps)\b/gi, "&lt;$1$2");

export type Included = { login: string; at: string; text: string; /** An agent sent it for the login. */ viaAgent?: boolean };

const attr = (v: string): string => v.replace(/[^\w.:-]/g, "");

/** `included`: maintainers' posts the operator chose to share, carried in this turn once. */
export function operatorBlock(login: string, text: string, included: Included[] = [], steps?: string[], cores?: unknown[]): string {
  const extra = included.map((i) => `<included from="maintainer" login="${attr(i.login)}" at="${attr(i.at)}"${i.viaAgent ? ' via="agent"' : ""}>\n${frameSafe(i.text)}\n</included>\n`).join("");
  return `<turn from="operator" login="${attr(login)}">\n${frameSafe(text)}\n${extra}${cores ? `<cores>${JSON.stringify(cores)}</cores>\n` : ""}${steps ? `<steps>${JSON.stringify(steps)}</steps>\n` : ""}</turn>\n`;
}

/** The steps list Opus last saw: the newest `<steps>` line of the stored turns, else the item block's. */
function seenSteps(db: DatabaseSync, repo: string, n: number): string[] | null {
  const parse = (j: string): string[] | null => { try { const v = JSON.parse(j) as unknown; return Array.isArray(v) ? v.map(String) : null; } catch { return null; } };
  for (const t of [...turnsOf(db, repo, n)].reverse()) {
    if (t.kind !== "operator") continue;
    const m = /\n<steps>(\[[^\n]*\])<\/steps>\n<\/turn>\n$/.exec(t.block);
    if (m) return parse(m[1]!);
  }
  const m = /"steps": (\[[^\]]*\])/.exec(conversationOf(db, repo, n)?.item_block ?? "");
  return m ? parse(m[1]!) : null;
}

/** The cores Opus last saw for the item's open decision: the newest `<cores>` line of the stored operator turns, else the item block's. Null: none known. */
function seenCores(db: DatabaseSync, repo: string, n: number): unknown[] | null {
  const parse = (j: string): unknown[] | null => { try { const v = JSON.parse(j) as unknown; return Array.isArray(v) ? v : null; } catch { return null; } };
  for (const t of [...turnsOf(db, repo, n)].reverse()) {
    if (t.kind !== "operator") continue;
    const m = /\n<cores>(\[[^\n]*\])<\/cores>\n(?:<steps>[^\n]*<\/steps>\n)?<\/turn>\n$/.exec(t.block);
    if (m) return parse(m[1]!);
  }
  try {
    const decision = (JSON.parse(conversationOf(db, repo, n)?.item_block ?? "null") as { decision?: { cores?: unknown } } | null)?.decision;
    return Array.isArray(decision?.cores) ? decision.cores : null;
  } catch { return null; }
}

export function opusBlock(text: string, cards: NewCard[], choices?: ParsedChoices | null): string {
  const list = cards.map((c) => ({ ...c.params, ...(c.params.kind === "resolution" && c.text !== null && { text: c.text }) }));
  return `<turn from="opus">\n${frameSafe(text)}\n${cards.length ? `<actions>\n${JSON.stringify(list)}\n</actions>\n` : ""}${choices ? `<choices>\n${choicesJson(choices)}\n</choices>\n` : ""}</turn>\n`;
}

/** A turn from our code: a plain sentence and, when GitHub text is quoted, that data as untrusted JSON. */
export function systemBlock(text: string, data?: unknown): string {
  return `<turn from="system">\n${text}\n${data === undefined ? "" : `<untrusted>\n${untrustedJson(data)}\n</untrusted>\n`}</turn>\n`;
}

// ---- the item ----------------------------------------------------------------

type ItemRow = { repo: string; number: number; kind: string; state: string; title: string | null; body: string | null; author: string | null; author_association: string | null; labels: string | null; head_oid: string | null; additions: number | null; deletions: number | null; changed_files: number | null };

const itemRow = (db: DatabaseSync, repo: string, n: number): ItemRow | undefined =>
  db.prepare("SELECT repo, number, kind, state, title, body, author, author_association, labels, head_oid, additions, deletions, changed_files FROM items WHERE repo = ? AND number = ?").get(repo, n) as ItemRow | undefined;

const hash = (v: unknown, n = 16): string => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, n);

const labelsOf = (i: { labels: string | null }): string[] => {
  try { const l = JSON.parse(i.labels ?? "[]") as unknown; return Array.isArray(l) ? l.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
};

/** What a block or update turn described of the item; a change in any field sends an update turn. */
type Snapshot = { head: string | null; title: string; body: string; state: string; labels: string[]; comments: number; last_comment: string | null; decision: string | null; answer: string | null };

// The app's bot (the mirror stores its bare slug) is the pipeline itself: its posts are no news for the conversation.
const COMMENTS_WHERE = `repo = ? AND number = ? AND COALESCE(TRIM(body), '') <> '' AND COALESCE(author, '') NOT LIKE '%[bot]'
  AND COALESCE(author, '') NOT IN (SELECT value FROM json_each(COALESCE((SELECT value FROM main.settings WHERE key = 'app_slugs'), '[]')))`;

function snapshotOf(db: DatabaseSync, i: ItemRow): Snapshot {
  const cnt = db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE ${COMMENTS_WHERE}`).get(i.repo, i.number) as { n: number };
  const last = db.prepare(`SELECT id FROM comments WHERE ${COMMENTS_WHERE} ORDER BY created_at DESC, id DESC LIMIT 1`).get(i.repo, i.number) as { id: string } | undefined;
  const d = openDecision(db, i.repo, i.number) ?? latestDecision(db, i.repo, i.number);
  return { head: i.head_oid, title: hash(i.title), body: hash(i.body), state: i.state, labels: labelsOf(i).sort(), comments: Number(cnt.n), last_comment: last?.id ?? null, decision: d?.id ?? null, answer: d?.answer ?? null };
}

const sigOf = (db: DatabaseSync, i: ItemRow): string => JSON.stringify(snapshotOf(db, i));

const parseSig = (sig: string): Snapshot | null => {
  try { const v = JSON.parse(sig) as Snapshot; return v && typeof v === "object" ? v : null; } catch { return null; }
};

/** The head and newest comment Opus had been told about (the conversation's item snapshot), recorded on each card it proposes. */
function seenOf(db: DatabaseSync, repo: string, n: number): string | null {
  const c = conversationOf(db, repo, n);
  const s = c ? parseSig(c.item_sig) : null;
  return s ? JSON.stringify({ head: s.head, last_comment: s.last_comment }) : null;
}

/** Whether a card still proposed was written for an older item: a push since (it refuses to run) or new GitHub comments since (it still runs). */
export function staleOf(db: DatabaseSync, repo: string, n: number, seen: string | null): "pr-changed" | "new-comments" | undefined {
  const i = itemRow(db, repo, n);
  if (!seen || !i) return undefined;
  let was: { head: string | null; last_comment: string | null };
  try { was = JSON.parse(seen) as typeof was; } catch { return undefined; }
  if (i.kind === "pr" && (was.head ?? null) !== i.head_oid) return "pr-changed";
  if (was.last_comment === snapshotOf(db, i).last_comment) return undefined;
  return newerPersonComment(db, i.repo, i.number, was.last_comment) ? "new-comments" : undefined;
}

/**
 * Whether a person commented after the comment a card was written against. Stricter than COMMENTS_WHERE, which also
 * drives update turns and must not change: review bots and our own posts (made through an account a person also
 * uses, so recognised by their note line, never by login) are news for Opus but do not make a decision card stale.
 * When the seen comment is gone, any change in the newest counted comment counts, as before.
 */
function newerPersonComment(db: DatabaseSync, repo: string, n: number, seenId: string | null): boolean {
  const at = seenId === null ? null : (db.prepare("SELECT created_at, id FROM comments WHERE repo = ? AND number = ? AND id = ?").get(repo, n, seenId) as { created_at: string; id: string } | undefined);
  if (seenId !== null && !at) return true;
  const rows = db.prepare(`SELECT author, body FROM comments WHERE ${COMMENTS_WHERE}${at ? " AND (created_at > ? OR (created_at = ? AND id > ?))" : ""}`)
    .all(...[repo, n, ...(at ? [at.created_at, at.created_at, at.id] : [])]) as { author: string | null; body: string }[];
  return rows.some((r) => !(r.author && isBotLogin(r.author)) && !OWN_NOTE_PREFIXES.some((p) => r.body.trimStart().startsWith(p)));
}

// Openings of the note lines in src/github/note.ts.
export const OWN_NOTE_PREFIXES = ["_AI-generated ", "_Automated "];

const cut = (s: string | null, max: number): string => (s ?? "").slice(0, max);

function decisionPart(db: DatabaseSync, d: DecisionRow | undefined): unknown {
  if (!d) return null;
  return {
    question: d.question, facts: factsOf(d), summary: d.summary ?? "",
    options: optionsOf(d).map((o) => ({ key: o.key, label: o.label, hint: o.hint ?? "" })),
    cores: coreSummaries(db, d),
    recommended: d.recommended ?? null, recommended_reason: d.recommended_reason ?? null, answer: d.answer ?? null,
  };
}

/** The item block: everything about the item the conversation starts from, as untrusted JSON. Written once. */
export async function buildItemBlock(db: DatabaseSync, repo: string, n: number, deps?: StoreDeps): Promise<{ block: string; sig: string }> {
  const i = itemRow(db, repo, n);
  if (!i) throw new ConversationError(404, `no item ${repo}#${n} in the mirror`);
  const pr = i.kind === "pr";
  const comments = db.prepare(`SELECT author, body FROM comments WHERE ${COMMENTS_WHERE} ORDER BY created_at, id LIMIT ?`).all(repo, n, ITEM_COMMENTS) as { author: string | null; body: string }[];
  let diff: string | null = null;
  if (pr && i.head_oid && deps?.diff) diff = await deps.diff(repo, n, i.head_oid).catch(() => null);
  const data = {
    ref: `${repo}#${n}`, kind: pr ? "pull request" : "issue", state: i.state, title: i.title ?? "", body: cut(i.body, ITEM_BODY_LIMIT),
    author: i.author, author_association: i.author_association, labels: labelsOf(i),
    comments: comments.map((c) => ({ author: c.author, body: cut(c.body, ITEM_COMMENT_LIMIT) })),
    ...(pr ? { head: i.head_oid, lines: { additions: i.additions, deletions: i.deletions, files: i.changed_files }, diff: diff === null ? null : cut(diff, ITEM_DIFF_LIMIT) + (diff.length > ITEM_DIFF_LIMIT ? "\n[diff cut]" : "") } : {}),
    decision: decisionPart(db, openDecision(db, repo, n) ?? latestDecision(db, repo, n)),
    steps: applicableSteps(db, repo, n),
  };
  return { block: untrustedJson(data), sig: sigOf(db, i) };
}

const latestDecision = (db: DatabaseSync, repo: string, n: number): DecisionRow | undefined =>
  db.prepare("SELECT * FROM decisions WHERE repo = ? AND number = ? AND id NOT LIKE '%:dupegroup:%' ORDER BY asked_at DESC, id DESC LIMIT 1").get(repo, n) as DecisionRow | undefined;

/** Creates the conversation with its item block when the item has none. Returns whether it was created. */
export async function ensureConversation(db: DatabaseSync, repo: string, n: number, by: string, deps?: StoreDeps): Promise<boolean> {
  if (conversationOf(db, repo, n)) return false;
  const { block, sig } = await buildItemBlock(db, repo, n, deps);
  return db.prepare("INSERT OR IGNORE INTO conversations (repo, number, item_block, item_sig, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)").run(repo, n, block, sig, nowOf(deps), by).changes === 1;
}

// ---- turns -------------------------------------------------------------------

/** Validated choices an Opus turn carries; stored with the turn (a prepare replaces the decision's choices, a conversation turn merges into them). */
export type TurnChoices = { decision: DecisionRow; parsed: ParsedChoices; source: "prepare" | "conversation"; by?: string; stampThen?: string | null };

type NewTurn = { kind: TurnKind; login: string; body: string; block: string; status?: string | null; notes?: string[]; cards?: NewCard[]; choices?: TurnChoices };

const nextSeq = (db: DatabaseSync, repo: string, n: number): number =>
  Number((db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM conversation_turns WHERE repo = ? AND number = ?").get(repo, n) as { s: number }).s);

function inTx<T>(db: DatabaseSync, f: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = f();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function insertRow(db: DatabaseSync, repo: string, n: number, t: NewTurn, seq: number | null, status: string | null, deps?: StoreDeps, seenAt?: string | null): number {
  const id = Number(db.prepare("INSERT INTO conversation_turns (repo, number, kind, login, at, body, block, status, error, notes, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)")
    .run(repo, n, t.kind, t.login, nowOf(deps), t.body, t.block, status, t.notes?.length ? JSON.stringify(t.notes) : null, seq).lastInsertRowid);
  // One current set: a new Opus turn replaces the proposals of the earlier ones.
  if (t.kind === "opus") db.prepare("UPDATE conversation_cards SET state = 'replaced' WHERE repo = ? AND number = ? AND state = 'proposed'").run(repo, n);
  // A reply's cards are stamped with what Opus was told when its prompt was built, not with a later refresh.
  const seen = seenAt !== undefined ? seenAt : seenOf(db, repo, n);
  for (const c of t.cards ?? []) {
    db.prepare("INSERT INTO conversation_cards (turn_id, repo, number, kind, params, text, description, seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, repo, n, c.params.kind, JSON.stringify(c.params), c.text, c.description, seen);
  }
  if (t.choices) storeParsedChoices(db, t.choices.decision, t.choices.parsed, { turnId: id, seen, source: t.choices.source, by: t.choices.by, stampThen: t.choices.stampThen });
  return id;
}

/**
 * Appends a turn inside the caller's transaction. A turn has a stable id and takes the next seq. While a run is answering the
 * message, a system turn is held without a seq (the run already sent the prompt without it) and is placed after the reply.
 * An operator message has no seq until it is answered; only one may wait per conversation.
 */
function appendTurn(db: DatabaseSync, repo: string, n: number, t: NewTurn, deps?: StoreDeps): number {
  const wait = pendingTurn(db, repo, n);
  if (t.status === "pending") {
    if (wait) throw new ConversationError(409, "Opus has not answered the last message yet");
    return insertRow(db, repo, n, t, null, "pending", deps);
  }
  if (wait?.status === "answering") return insertRow(db, repo, n, t, null, "held", deps);
  return insertRow(db, repo, n, t, nextSeq(db, repo, n), t.status ?? null, deps);
}

/** Appends a turn (see appendTurn). Returns the turn id. */
export function insertTurn(db: DatabaseSync, repo: string, n: number, t: NewTurn, deps?: StoreDeps): number {
  return inTx(db, () => appendTurn(db, repo, n, t, deps));
}

const NOTHING: Snapshot = { head: null, title: "", body: "", state: "", labels: [], comments: -1, last_comment: null, decision: null, answer: null };

/**
 * Adds a system turn carrying what changed in the item since the stored block or the last update turn described it: head commit,
 * title or body, state, labels, comments, the open decision and its answer. The block itself is never rewritten.
 */
export async function refreshItem(db: DatabaseSync, repo: string, n: number, deps?: StoreDeps): Promise<boolean> {
  const c = conversationOf(db, repo, n), i = itemRow(db, repo, n);
  if (!c || !i) return false;
  const sig = sigOf(db, i);
  if (sig === c.item_sig) return false;
  const was = parseSig(c.item_sig) ?? NOTHING, now = JSON.parse(sig) as Snapshot;
  const pr = i.kind === "pr";
  const changed: string[] = [];
  const data: Record<string, unknown> = {};
  if (pr && was.head !== now.head) {
    changed.push("head commit");
    let diff: string | null = null;
    if (i.head_oid && deps?.diff) diff = await deps.diff(repo, n, i.head_oid).catch(() => null);
    Object.assign(data, { head: i.head_oid, lines: { additions: i.additions, deletions: i.deletions, files: i.changed_files }, diff: diff === null ? null : cut(diff, ITEM_DIFF_LIMIT) + (diff.length > ITEM_DIFF_LIMIT ? "\n[diff cut]" : "") });
  }
  if (was.title !== now.title) { changed.push("title"); data.title = i.title ?? ""; }
  if (was.body !== now.body) { changed.push("text"); data.body = cut(i.body, ITEM_BODY_LIMIT); }
  if (was.state !== now.state) { changed.push("state"); data.state = i.state; }
  if (JSON.stringify(was.labels) !== JSON.stringify(now.labels)) { changed.push("labels"); data.labels = labelsOf(i); }
  if (was.comments !== now.comments || was.last_comment !== now.last_comment) {
    changed.push("comments");
    const rows = db.prepare(`SELECT author, body FROM comments WHERE ${COMMENTS_WHERE} ORDER BY created_at DESC, id DESC LIMIT 3`).all(repo, n) as { author: string | null; body: string }[];
    data.comments = { total: now.comments, newest: rows.reverse().map((r) => ({ author: r.author, body: cut(r.body, ITEM_COMMENT_LIMIT) })) };
  }
  if (was.decision !== now.decision || was.answer !== now.answer) {
    changed.push("decision");
    data.decision = decisionPart(db, openDecision(db, repo, n) ?? latestDecision(db, repo, n));
  }
  const text = `The ${pr ? "PR" : "issue"} was updated (${changed.join(", ")}). The current values of these fields follow; they replace the item block where they differ.`;
  return inTx(db, () => {
    // Another run may have written the same update while the diff was fetched.
    if (conversationOf(db, repo, n)?.item_sig !== c.item_sig) return false;
    appendTurn(db, repo, n, { kind: "system", login: "system", body: text, block: systemBlock(text, data) }, deps);
    db.prepare("UPDATE conversations SET item_sig = ? WHERE repo = ? AND number = ?").run(sig, repo, n);
    return true;
  });
}

/**
 * An operator's message: creates the conversation when the item has none and queues the message for the Conversation step.
 * With `ask` false the message is only stored (no pending state, no model call); Opus sees it among the turns at the next ask.
 */
export async function addOperatorMessage(db: DatabaseSync, repo: string, n: number, login: string, text: string, deps?: StoreDeps, ask = true): Promise<number> {
  const body = text.trim();
  if (!body) throw new ConversationError(400, "the message is empty");
  if (body.length > MESSAGE_MAX) throw new ConversationError(400, `the message is longer than ${MESSAGE_MAX} characters`);
  if (!itemRow(db, repo, n)) throw new ConversationError(404, `no item ${repo}#${n} in the mirror`);
  if (ask && pendingTurn(db, repo, n)) throw new ConversationError(409, "Opus has not answered the last message yet");
  await ensureConversation(db, repo, n, login, deps);
  await refreshItem(db, repo, n, deps);
  const shared = ask ? unsentIncludes(db, repo, n) : [];
  try {
    return inTx(db, () => {
      const now = applicableSteps(db, repo, n), seen = seenSteps(db, repo, n);
      const steps = seen && JSON.stringify(seen) === JSON.stringify(now) ? undefined : now;
      const d = openDecision(db, repo, n), nowCores = d ? coreSummaries(db, d) : [], seenC = seenCores(db, repo, n);
      const cores = JSON.stringify(seenC ?? []) === JSON.stringify(nowCores) ? undefined : nowCores;
      const id = appendTurn(db, repo, n, { kind: "operator", login, body, block: operatorBlock(login, body, shared.map((x) => x.post), steps, cores), ...(ask && { status: "pending" }) }, deps);
      for (const x of shared) db.prepare("UPDATE conversation_includes SET sent_turn = ? WHERE repo = ? AND number = ? AND source = ? AND sent_turn IS NULL").run(id, repo, n, x.source);
      return id;
    });
  } catch (e) {
    if (/UNIQUE/i.test(String((e as Error).message))) throw new ConversationError(409, "Opus has not answered the last message yet");
    throw e;
  }
}

// ---- maintainer posts shared with Opus ---------------------------------------

export type IncludeRow = { source: string; by: string; at: string; sent: boolean };

/** The stored post behind an include source of this item, or null. Only decision comments and opinions on the item's own decisions can be shared. */
function postOf(db: DatabaseSync, repo: string, n: number, source: string): Included | null {
  const m = /^(decision-comment|decision-opinion):(.+)$/.exec(source);
  if (!m) return null;
  if (m[1] === "decision-comment") {
    const row = db.prepare("SELECT c.login, c.at, c.body AS text, c.via FROM decision_comments c JOIN decisions d ON d.id = c.decision_id WHERE c.id = ? AND d.repo = ? AND d.number = ?")
      .get(m[2]!, repo, n) as { login: string; at: string; text: string | null; via: string | null } | undefined;
    const text = row?.text ? cleanComment(row.text).slice(0, ITEM_COMMENT_LIMIT) : "";
    return row && text ? { login: row.login, at: row.at, text, viaAgent: row.via === "mcp" } : null;
  }
  const o = db.prepare("SELECT o.login, o.at, o.option, o.note, o.decision_id, o.via FROM decision_opinions o JOIN decisions d ON d.id = o.decision_id WHERE o.id = ? AND d.repo = ? AND d.number = ? AND o.retracted_at IS NULL")
    .get(m[2]!, repo, n) as { login: string; at: string; option: string | null; note: string | null; decision_id: string; via: string | null } | undefined;
  if (!o) return null;
  const d = getDecision(db, o.decision_id);
  const label = o.option ? (d ? optionsOf(d).find((x) => x.key === o.option)?.label : undefined) ?? o.option : null;
  const note = o.note ? cleanComment(o.note) : "";
  const text = (label ? (note ? `Suggests ${label}: ${note}` : `Suggests ${label}`) : note).slice(0, ITEM_COMMENT_LIMIT);
  return text ? { login: o.login, at: o.at, text, viaAgent: o.via === "mcp" } : null;
}

function unsentIncludes(db: DatabaseSync, repo: string, n: number): { source: string; post: Included }[] {
  const rows = db.prepare("SELECT source FROM conversation_includes WHERE repo = ? AND number = ? AND sent_turn IS NULL ORDER BY at, source").all(repo, n) as { source: string }[];
  return rows.flatMap((r) => { const post = postOf(db, repo, n, r.source); return post ? [{ source: r.source, post }] : []; });
}

export function includesOf(db: DatabaseSync, repo: string, n: number): IncludeRow[] {
  const rows = db.prepare("SELECT source, by, at, sent_turn FROM conversation_includes WHERE repo = ? AND number = ? ORDER BY at, source").all(repo, n) as { source: string; by: string; at: string; sent_turn: number | null }[];
  return rows.map((r) => ({ source: r.source, by: r.by, at: r.at, sent: r.sent_turn !== null }));
}

/** Shares (`on`) or stops sharing a maintainer post with Opus. A post already sent stays sent. */
export function setInclude(db: DatabaseSync, repo: string, n: number, source: string, on: boolean, by: string, deps?: StoreDeps): void {
  const row = db.prepare("SELECT sent_turn FROM conversation_includes WHERE repo = ? AND number = ? AND source = ?").get(repo, n, source) as { sent_turn: number | null } | undefined;
  if (row?.sent_turn != null) throw new ConversationError(409, "already sent to Opus");
  if (!on) { db.prepare("DELETE FROM conversation_includes WHERE repo = ? AND number = ? AND source = ?").run(repo, n, source); return; }
  if (row) return;
  if (!itemRow(db, repo, n)) throw new ConversationError(404, `no item ${repo}#${n} in the mirror`);
  if (!postOf(db, repo, n, source)) throw new ConversationError(400, "no such post on this item's questions");
  db.prepare("INSERT INTO conversation_includes (repo, number, source, by, at) VALUES (?, ?, ?, ?, ?)").run(repo, n, source, by, nowOf(deps));
}

/** Opus's opening turn (a question or proposal from the recommendation). Does nothing when the item already has a conversation. */
export async function startFromOpus(db: DatabaseSync, repo: string, n: number, opening: string, deps?: StoreDeps): Promise<boolean> {
  const text = opening.replace(/\r\n/g, "\n").trim().slice(0, OPENING_MAX);
  if (!text || conversationOf(db, repo, n) || !itemRow(db, repo, n)) return false;
  if (!(await ensureConversation(db, repo, n, "opus", deps))) return false;
  insertTurn(db, repo, n, { kind: "opus", login: "opus", body: text, block: opusBlock(text, []) }, deps);
  return true;
}

/** The message Opus is answering and the token of the run that holds it. */
export type Claim = { turn: TurnRow; claim: string };

/**
 * Takes the queued message of the conversation for one run, or null when none is queued or another run holds it.
 * A claim older than the prompt timeouts is released first, so a crashed run does not block the conversation.
 */
export function claimPending(db: DatabaseSync, repo: string, n: number, deps?: StoreDeps): Claim | null {
  const at = nowOf(deps);
  const stale = new Date(Date.parse(at) - STALE_CLAIM_MS).toISOString();
  return inTx(db, () => {
    db.prepare("UPDATE conversation_turns SET status = 'pending', claim = NULL, claimed_at = NULL, progress = NULL WHERE repo = ? AND number = ? AND kind = 'operator' AND status = 'answering' AND claimed_at < ?").run(repo, n, stale);
    // A run that died while answering left system turns held without a seq; the next prompt must include them.
    if (!db.prepare("SELECT 1 FROM conversation_turns WHERE repo = ? AND number = ? AND status = 'answering'").get(repo, n)) {
      for (const h of db.prepare("SELECT id FROM conversation_turns WHERE repo = ? AND number = ? AND status = 'held' ORDER BY id").all(repo, n) as { id: number }[])
        db.prepare("UPDATE conversation_turns SET status = NULL, seq = ? WHERE id = ?").run(nextSeq(db, repo, n), h.id);
    }
    const claim = randomUUID();
    const r = db.prepare("UPDATE conversation_turns SET status = 'answering', claim = ?, claimed_at = ? WHERE repo = ? AND number = ? AND kind = 'operator' AND status = 'pending'").run(claim, at, repo, n);
    if (r.changes !== 1) return null;
    return { turn: db.prepare("SELECT * FROM conversation_turns WHERE claim = ?").get(claim) as unknown as TurnRow, claim };
  });
}

/** Stores what Opus is doing on the message the run holds (newest line last); the live topic pushes it. Cleared when the reply or the failure is stored. */
export function setTurnProgress(db: DatabaseSync, repo: string, n: number, claim: string, lines: string[]): void {
  db.prepare("UPDATE conversation_turns SET progress = ? WHERE repo = ? AND number = ? AND status = 'answering' AND claim = ?").run(JSON.stringify(lines), repo, n, claim);
}

/** The pieces of the next prompt: the stored item block and the turns in prompt order, the claimed message last. */
export function promptParts(db: DatabaseSync, repo: string, n: number, wait: TurnRow): { item: string; turns: string; earlier: string; message: string; seen: string | null } | null {
  const c = conversationOf(db, repo, n);
  if (!c) return null;
  const earlier = (db.prepare("SELECT block FROM conversation_turns WHERE repo = ? AND number = ? AND seq IS NOT NULL ORDER BY seq").all(repo, n) as { block: string }[]).map((t) => t.block).join("");
  return { item: c.item_block, turns: earlier + wait.block, earlier, message: wait.block, seen: seenOf(db, repo, n) };
}

/** Gives the claimed message its place in the prompt order, then the turns held while it was answered, in the order they arrived. */
function settleWait(db: DatabaseSync, repo: string, n: number, wait: TurnRow, status: string, error: string | null, between?: () => void): void {
  db.prepare("UPDATE conversation_turns SET status = ?, error = ?, seq = ?, claim = NULL, progress = NULL WHERE id = ?").run(status, error, nextSeq(db, repo, n), wait.id);
  between?.();
  const held = db.prepare("SELECT id FROM conversation_turns WHERE repo = ? AND number = ? AND status = 'held' ORDER BY id").all(repo, n) as { id: number }[];
  for (const h of held) db.prepare("UPDATE conversation_turns SET status = NULL, seq = ? WHERE id = ?").run(nextSeq(db, repo, n), h.id);
}

const claimed = (db: DatabaseSync, repo: string, n: number, claim: string): TurnRow | undefined =>
  db.prepare("SELECT * FROM conversation_turns WHERE repo = ? AND number = ? AND status = 'answering' AND claim = ?").get(repo, n, claim) as TurnRow | undefined;

/**
 * Stores Opus's reply to the claimed message and marks the message answered, in one transaction. Returns the reply's turn id,
 * or null when the run no longer holds the message (its claim was released and taken by another run).
 */
export function storeReply(db: DatabaseSync, repo: string, n: number, claim: string, text: string, cards: NewCard[], notes: string[], deps?: StoreDeps, seen?: string | null, choices?: TurnChoices): number | null {
  return inTx(db, () => {
    const wait = claimed(db, repo, n, claim);
    if (!wait) return null;
    let id = 0;
    settleWait(db, repo, n, wait, "answered", null, () => { id = insertRow(db, repo, n, { kind: "opus", login: "opus", body: text, block: opusBlock(text, cards, choices?.parsed), notes, cards, ...(choices && { choices }) }, nextSeq(db, repo, n), null, deps, seen); });
    return id;
  });
}

export function failTurn(db: DatabaseSync, repo: string, n: number, claim: string, error: string): boolean {
  return inTx(db, () => {
    const wait = claimed(db, repo, n, claim);
    if (!wait) return false;
    settleWait(db, repo, n, wait, "failed", error.slice(0, 300));
    return true;
  });
}

/** Conversations with a message waiting for Opus (queued, or claimed by a run that went stale), oldest message first. */
export function pendingConversations(db: DatabaseSync, deps?: StoreDeps): { repo: string; number: number; turnId: number }[] {
  const stale = new Date(Date.parse(nowOf(deps)) - STALE_CLAIM_MS).toISOString();
  return db.prepare("SELECT repo, number, id AS turnId FROM conversation_turns WHERE kind = 'operator' AND (status = 'pending' OR (status = 'answering' AND claimed_at < ?)) ORDER BY id").all(stale) as { repo: string; number: number; turnId: number }[];
}
