// Decisions for people. The pipeline asks them with the CLI; only a signed-in
// person on the dashboard answers them. The one command that sets answers is
// the operator's bulk Backlog (`decisions backlog`), which only holds items.
import { settledBy, settledBySql } from "./settlers.ts";
import { lockLiveSql } from "./answers/hold.ts";
import { readFileSync } from "node:fs";
import { userInfo } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { audit } from "./dash/audit.ts";
import { connect } from "./db.ts";
import { inPilot } from "./pilot.ts";

export const KINDS = ["scope", "duplicate", "close", "merge", "hold", "split", "other"] as const;
export type Kind = (typeof KINDS)[number];

export type Option = { key: string; label: string; hint?: string };
export type Ref = { repo: string; number: number };
export type Exception = Ref & { answer: string };

export type DecisionRow = {
  id: string; kind: Kind; repo: string | null; number: number | null; items: string | null;
  question: string; context: string | null; facts: string | null; options: string;
  recommended: string | null; recommended_reason: string | null; recommended_by: string | null; public_text: string | null; asked_at: string; asked_by: string | null;
  docket: string | null; answer: string | null; answer_note: string | null; exceptions: string | null;
  answered_by: string | null; answered_at: string | null; applied_at: string | null;
  prepared_at?: string | null; prepared_head?: string | null; prepared_discussion?: string | null; prepare_requested_at?: string | null; prepare_failed_head?: string | null; recommend_failures?: number | null; recommend_failed_at?: string | null;
  summary: string | null; summary_by: string | null; summary_at: string | null; adopted_opinion: string | null; snoozed_by: string | null; snoozed_at: string | null;
  exec_state?: string | null; exec_reason?: string | null; dispute_by?: string | null; dispute_reason?: string | null; dispute_at?: string | null;
};

const j = <T>(s: string | null, d: T): T => {
  if (!s) return d;
  try { return JSON.parse(s) as T; } catch { return d; }
};
/** The answer every decision offers last: nothing is written to GitHub and the items stay held (see src/dupes/held.ts). */
export const BACKLOG: Option = { key: "backlog", label: "Backlog", hint: "Hold this undecided: nothing is written and no later step takes the item up." };
/** The answer of a decision the conversation settled without choosing an option: no step acts on it and nothing is written to GitHub. The note holds Opus's one-line summary. */
export const HANDLED: Option = { key: "handled", label: "Handled in the conversation" };
/** The answer the pipeline gives a question that can no longer be answered (see src/merge/withdraw.ts). */
export const WITHDRAWN_OPTION: Option = { key: "withdrawn", label: "Withdrawn" };
/**
 * A decision is snoozed while `snoozed_at` is set and the item has had no activity since: a GitHub comment or review, a pushed commit or force-push,
 * a decision comment or opinion, an operator conversation message. Evaluated at read time, so no writer has to clear it and a missed
 * clear is impossible. Use with the table unaliased (`decisions`).
 */
export const SNOOZED_SQL = (() => {
  // The item itself, or for a duplicate-group decision any of its member items.
  const onItem = (a: string): string => `((${a}.repo = decisions.repo AND ${a}.number = decisions.number)
    OR EXISTS (SELECT 1 FROM dupe_group_items gi WHERE gi.decision_id = decisions.id AND gi.repo = ${a}.repo AND gi.number = ${a}.number))`;
  return `(decisions.answer IS NULL AND decisions.snoozed_at IS NOT NULL AND NOT (
  EXISTS (SELECT 1 FROM comments sc WHERE ${onItem("sc")} AND sc.created_at > decisions.snoozed_at)
  OR EXISTS (SELECT 1 FROM pr_commits sp WHERE ${onItem("sp")} AND COALESCE(sp.first_seen_at, sp.committed_at) > decisions.snoozed_at)
  OR EXISTS (SELECT 1 FROM item_activity sf WHERE ${onItem("sf")} AND sf.kind = 'force-push' AND sf.at > decisions.snoozed_at)
  OR EXISTS (SELECT 1 FROM decision_comments sd WHERE sd.decision_id = decisions.id AND sd.at > decisions.snoozed_at)
  OR EXISTS (SELECT 1 FROM decision_opinions so WHERE so.decision_id = decisions.id AND so.at > decisions.snoozed_at)
  OR EXISTS (SELECT 1 FROM conversation_turns st WHERE ${onItem("st")} AND st.kind = 'operator' AND st.at > decisions.snoozed_at)))`;
})();

/** A settled decision makes the drafts still proposed on its item obsolete (the ask card, the other options' drafts) and replaces its own choices. */
export function replaceProposedCards(db: DatabaseSync, repo: string | null, number: number | null, decisionId: string): void {
  if (repo && number !== null) {
    db.prepare("UPDATE main.conversation_cards SET state = 'replaced' WHERE repo = ? AND number = ? AND state = 'proposed'").run(repo, number);
    // Only the choices of the decision that settled: another open decision of the item keeps its own.
    db.prepare("UPDATE main.decision_choices SET state = 'replaced' WHERE decision_id = ? AND state = 'current'").run(decisionId);
  }
}

export const isBacklog = (answer: string | null): boolean => answer === BACKLOG.key;

/** The options the pipeline asked, then Backlog. */
export const optionsOf = (d: DecisionRow): Option[] => {
  const asked = j<Option[]>(d.options, []);
  return asked.some((o) => o.key === BACKLOG.key) ? asked : [...asked, BACKLOG];
};
export const factsOf = (d: DecisionRow): string[] => j<string[]>(d.facts, []);
export const itemsOf = (d: DecisionRow): Ref[] => (d.number === null ? j<Ref[]>(d.items, []) : [{ repo: d.repo!, number: d.number }]);
export const exceptionsOf = (d: DecisionRow): Exception[] => j<Exception[]>(d.exceptions, []);
export const isBatch = (d: DecisionRow): boolean => d.number === null;
export const reposOf = (d: DecisionRow): string[] => [...new Set(itemsOf(d).map((r) => r.repo).concat(d.repo ? [d.repo] : []))].sort();

export function getDecision(db: DatabaseSync, id: string): DecisionRow | undefined {
  return db.prepare("SELECT * FROM decisions WHERE id = ?").get(id) as DecisionRow | undefined;
}

const ASK_FIELDS = ["kind", "repo", "number", "items", "question", "context", "facts", "options", "recommended", "recommended_reason", "public_text", "asked_at", "asked_by", "docket", "summary", "summary_by", "summary_at"] as const;

// A re-ask without a summary keeps the one the decision has.
const SUMMARY_FIELDS: readonly string[] = ["summary", "summary_by", "summary_at"];

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

// Validates one question from the pipeline and returns the column values.
export function validateAsk(q: Record<string, unknown>): Record<string, string | number | null> {
  const err = (m: string) => new Error(`decision ${String(q.id ?? "?")}: ${m}`);
  if (typeof q.id !== "string" || !q.id) throw err("id is required");
  if (!KINDS.includes(q.kind as Kind)) throw err(`kind must be one of ${KINDS.join(", ")}`);
  if (typeof q.question !== "string" || !q.question.trim()) throw err("question is required");
  const options = q.options as Option[];
  if (!Array.isArray(options) || options.length < 2 || options.length > 5 ||
    !options.every((o) => typeof o?.key === "string" && typeof o?.label === "string" && (o.hint === undefined || typeof o.hint === "string")))
    throw err("options must be 2–5 {key, label, hint?}");
  if (new Set(options.map((o) => o.key)).size !== options.length) throw err("option keys must be unique");
  if (q.recommended != null && !options.some((o) => o.key === q.recommended)) throw err("recommended must be an option key");
  const facts = (q.facts ?? []) as unknown[];
  if (!Array.isArray(facts) || facts.length > 5 || !facts.every((f) => typeof f === "string")) throw err("facts must be up to five strings");
  const batch = q.number == null;
  let items: Ref[] | null = null;
  if (batch) {
    items = q.items as Ref[];
    if (!Array.isArray(items) || !items.length || !items.every((r) => typeof r?.repo === "string" && Number.isInteger(r?.number)))
      throw err("a batch needs items: [{repo, number}]");
  } else {
    if (typeof q.repo !== "string" || !Number.isInteger(q.number)) throw err("repo and number are required for one item");
  }
  const repo = typeof q.repo === "string" ? q.repo : batch && new Set(items!.map((r) => r.repo)).size === 1 ? items![0].repo : null;
  return {
    id: q.id, kind: q.kind as string, repo, number: batch ? null : (q.number as number),
    items: items ? JSON.stringify(items.map((r) => ({ repo: r.repo, number: r.number }))) : null,
    question: q.question.trim(), context: typeof q.context === "string" ? q.context : null,
    facts: JSON.stringify(facts), options: JSON.stringify(options.map((o) => ({ key: o.key, label: o.label, ...(o.hint ? { hint: o.hint } : {}) }))),
    recommended: (q.recommended as string) ?? null,
    // A reason without a recommendation would be shown with nothing to explain.
    recommended_reason: q.recommended ? str(q.recommended_reason) : null,
    public_text: typeof q.public_text === "string" ? q.public_text : null,
    asked_at: typeof q.asked_at === "string" ? q.asked_at : new Date().toISOString(),
    asked_by: typeof q.asked_by === "string" ? q.asked_by : null, docket: typeof q.docket === "string" ? q.docket : null,
    summary: str(q.summary), summary_by: str(q.summary_by), summary_at: str(q.summary_at),
  };
}

// Inserts or updates the question by id; answer columns are never touched. A re-ask replaces the recommendation along with its reason and clears its author, except that a question and options the prepare step already covered keep its pick. A changed question or options clear the snooze and the prepare. A summary the new question lacks is kept.
export function ask(db: DatabaseSync, questions: Record<string, unknown>[], inTransaction = false): { inserted: number; updated: number } {
  const rows = questions.map(validateAsk);
  const cols = ["id", ...ASK_FIELDS];
  const changed = "(excluded.question IS NOT question OR excluded.options IS NOT options)";
  const keepsPick = "(prepared_at IS NOT NULL AND NOT " + changed + ")";
  const set = (c: string): string =>
    SUMMARY_FIELDS.includes(c) ? `${c} = COALESCE(excluded.${c}, ${c})`
    : c === "recommended" || c === "recommended_reason" ? `${c} = CASE WHEN ${keepsPick} THEN ${c} ELSE excluded.${c} END`
    : `${c} = excluded.${c}`;
  const stmt = db.prepare(`INSERT INTO main.decisions (${cols.join(",")}) VALUES (${cols.map((c) => `:${c}`).join(",")})
    ON CONFLICT(id) DO UPDATE SET ${ASK_FIELDS.map(set).join(", ")}, recommended_by = CASE WHEN ${keepsPick} THEN recommended_by ELSE NULL END,
      prepared_at = CASE WHEN ${changed} THEN NULL ELSE prepared_at END,
      recommend_failures = CASE WHEN ${changed} THEN NULL ELSE recommend_failures END,
      snoozed_by = CASE WHEN ${changed} THEN NULL ELSE snoozed_by END,
      snoozed_at = CASE WHEN ${changed} THEN NULL ELSE snoozed_at END`);
  const exists = db.prepare("SELECT 1 FROM decisions WHERE id = ?");
  let inserted = 0, updated = 0;
  if (!inTransaction) db.exec("BEGIN IMMEDIATE");
  try {
    for (const r of rows) {
      if (exists.get(r.id as string)) updated++; else inserted++;
      stmt.run(r);
    }
    if (!inTransaction) db.exec("COMMIT");
  } catch (e) {
    if (!inTransaction) db.exec("ROLLBACK");
    throw e;
  }
  return { inserted, updated };
}

// Answers the pipeline may act on: answered by someone who settles now (an operator, or a maintainer while
// settings.maintainer_writes is on, see src/settlers.ts), not yet applied, and not Backlog (which only holds). Option keys only, never free text.
// Opinions and comments are display-only and never read here.
export type Actionable = { id: string; kind: Kind; repo: string | null; number: number | null; items: Ref[]; answer: string; exceptions: Exception[] };

export function operators(db: DatabaseSync): Set<string> {
  return new Set((db.prepare("SELECT login FROM access WHERE role = 'operator'").all() as { login: string }[]).map((r) => r.login));
}

export function actionable(db: DatabaseSync): Actionable[] {
  const rows = db.prepare(`SELECT * FROM decisions WHERE answer IS NOT NULL AND answer <> '${BACKLOG.key}' AND applied_at IS NULL
    AND ${settledBySql("decisions")} ORDER BY answered_at`).all() as DecisionRow[];
  return rows.map((d) => ({
    id: d.id, kind: d.kind, repo: d.repo, number: d.number, items: itemsOf(d), answer: d.answer!,
    exceptions: exceptionsOf(d).map((e) => ({ repo: e.repo, number: e.number, answer: e.answer })),
  }));
}

export type BacklogScope = { outsidePilot?: boolean; repo?: string };
export type BacklogResult = { applied: boolean; decisions: { id: string; kind: Kind; repo: string | null; number: number | null }[] };

/** Open decisions in scope: of the repo when given, and, with `outsidePilot`, none of whose items is in the pilot (with no pilot set, none is outside). */
export function backlogCandidates(db: DatabaseSync, scope: BacklogScope): DecisionRow[] {
  if (!scope.outsidePilot && !scope.repo) throw new Error("name a scope: outsidePilot or a repo");
  const rows = db.prepare("SELECT * FROM decisions WHERE answer IS NULL ORDER BY asked_at, id").all() as DecisionRow[];
  const members = db.prepare("SELECT repo, number FROM dupe_group_items WHERE decision_id = ?");
  return rows.filter((d) => {
    const refs = [...itemsOf(d), ...(members.all(d.id) as Ref[])];
    if (scope.repo && !reposOf(d).includes(scope.repo) && !refs.some((x) => x.repo === scope.repo)) return false;
    // Outside the scope: no item in a repo whose pipeline is on and, with an item pilot, in that pilot.
    // An item held for its outside author (src/outside.ts) is in scope: the hold is temporary.
    return !scope.outsidePilot || !refs.some((x) => inPilot(db, x.repo, x.number) || !!db.prepare("SELECT 1 FROM main.outside_holds WHERE repo = ? AND number = ?").get(x.repo, x.number));
  });
}

/** Answers the open decisions in scope with Backlog and audits each; a dry run only lists them. The answer is written for `by`. */
export function backlogOpen(db: DatabaseSync, scope: BacklogScope, by: string, apply: boolean, at: string = new Date().toISOString()): BacklogResult {
  const rows = backlogCandidates(db, scope);
  const decisions = rows.map((d) => ({ id: d.id, kind: d.kind, repo: d.repo, number: d.number }));
  if (!apply) return { applied: false, decisions };
  db.exec("BEGIN IMMEDIATE");
  try {
    const set = db.prepare(`UPDATE main.decisions SET answer = ?, answer_note = NULL, exceptions = ?, answered_by = ?, answered_at = ?, adopted_opinion = NULL, snoozed_by = NULL, snoozed_at = NULL WHERE id = ? AND answer IS NULL AND NOT ${lockLiveSql("decisions")}`);
    for (const d of rows) {
      if (set.run(BACKLOG.key, isBatch(d) ? "[]" : null, by, at, d.id).changes === 1) audit(db, by, "answer", d.id, { answer: BACKLOG.key, bulk: true });
    }
    audit(db, by, "backlog-bulk", null, { ...scope, count: rows.length });
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { applied: true, decisions };
}

/**
 * Returns a function that removes the stages row Decide wrote when it asked a scope decision, so the item counts as never
 * asked (a scope question is asked only for an item whose stage is not past classified). item_stage is kept by an insert
 * trigger only, so it is rebuilt from the remaining stages rows.
 */
export function clearAskedStage(db: DatabaseSync): (repo: string, number: number, decisionId: string) => void {
  const stage = db.prepare("DELETE FROM main.stages WHERE repo = ? AND number = ? AND stage = 'needs-decision' AND note = ?");
  const latest = db.prepare("SELECT stage, at FROM stages WHERE repo = ? AND number = ? ORDER BY at DESC, rowid DESC LIMIT 1");
  const reviewed = db.prepare("SELECT 1 FROM stages WHERE repo = ? AND number = ? AND stage = 'reviewed' LIMIT 1");
  const put = db.prepare("UPDATE item_stage SET stage = ?, at = ?, reviewed = ? WHERE repo = ? AND number = ?");
  const drop = db.prepare("DELETE FROM item_stage WHERE repo = ? AND number = ?");
  return (repo, number, decisionId) => {
    stage.run(repo, number, `scope decision ${decisionId}`);
    const l = latest.get(repo, number) as { stage: string; at: string } | undefined;
    if (l) put.run(l.stage, l.at, reviewed.get(repo, number) ? 1 : 0, repo, number);
    else drop.run(repo, number);
  };
}

/**
 * Withdraws open scope decisions in scope: deletes each with its opinions, comments, claims and the stages row Decide
 * wrote when it asked, so the item counts as never asked and Decide asks it again later. Other kinds are left alone
 * (their answers drive side tables). A dry run only lists them. Writes nothing to GitHub.
 */
export function withdrawOpen(db: DatabaseSync, scope: BacklogScope, by: string, apply: boolean): BacklogResult {
  const rows = backlogCandidates(db, scope).filter((d) => d.kind === "scope" && !isBatch(d) && d.repo !== null && d.number !== null);
  const decisions = rows.map((d) => ({ id: d.id, kind: d.kind, repo: d.repo, number: d.number }));
  if (!apply) return { applied: false, decisions };
  db.exec("BEGIN IMMEDIATE");
  try {
    const del = db.prepare("DELETE FROM main.decisions WHERE id = ? AND answer IS NULL");
    const side = ["decision_opinions", "decision_comments", "decision_claims"].map((t) => db.prepare(`DELETE FROM ${t} WHERE decision_id = ?`));
    const clear = clearAskedStage(db);
    for (const d of rows) {
      if (del.run(d.id).changes !== 1) continue;
      for (const s of side) s.run(d.id);
      clear(d.repo!, d.number!, d.id);
      audit(db, by, "withdraw", d.id, { repo: d.repo, number: d.number, question: d.question });
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { applied: true, decisions };
}

const testKey = (repo: string): string => `test_repo:${repo}`;

/** Test repos accept answers from the CLI (`decisions answer`), so a session can run scenarios on them without a person pressing buttons. */
export function isTestRepo(db: DatabaseSync, repo: string): boolean {
  return db.prepare("SELECT 1 FROM main.settings WHERE key = ?").get(testKey(repo)) !== undefined;
}

export function testRepos(db: DatabaseSync): string[] {
  return (db.prepare("SELECT key FROM main.settings WHERE key LIKE 'test_repo:%' ORDER BY key").all() as { key: string }[]).map((r) => r.key.slice("test_repo:".length));
}

/** Returns false when nothing changed. */
export function setTestRepo(db: DatabaseSync, by: string, repo: string, on: boolean): boolean {
  if (!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(repo)) throw new Error(`${repo} is not tracked`);
  if (isTestRepo(db, repo) === on) return false;
  if (on) db.prepare("INSERT INTO main.settings (key, value) VALUES (?, '1')").run(testKey(repo));
  else db.prepare("DELETE FROM main.settings WHERE key = ?").run(testKey(repo));
  audit(db, by, "test-repo", repo, { on });
  return true;
}

/**
 * Answers an open decision as `login` the way the dashboard's Answer button does. Refused unless every repo the decision
 * concerns is a test repo and `login` is an operator. The audit row says the answer came from a session.
 */
export async function answerAsSession(db: DatabaseSync, id: string, option: string, login: string, note?: string): Promise<DecisionRow> {
  const d = sessionDecision(db, id, login);
  if (d.answer) throw new Error(`decision ${id} is already answered by ${d.answered_by}`);
  const { applyAnswer } = await import("./dash/api/decisions.ts");
  // A group answer approves the comments stored for its option; the session approves the ones stored now (answerCmd prints them).
  const { textsFor, textsHash } = await import("./dupes/texts.ts");
  const texts = d.id.includes(":dupegroup:") ? textsFor(db, id, option) : [];
  applyAnswer(db, d, login, { answer: option, note, ...(texts.length && { textsHash: textsHash(texts) }) }, "cli", "session");
  db.prepare("DELETE FROM decision_claims WHERE decision_id = ?").run(id);
  return getDecision(db, id)!;
}

/** A decision a session may act on as `login`: every repo it concerns is a test repo and `login` is an operator. */
function sessionDecision(db: DatabaseSync, id: string, login: string): DecisionRow {
  const d = getDecision(db, id);
  if (!d) throw new Error(`no decision ${id}`);
  const repos = [...new Set([...reposOf(d), ...itemsOf(d).map((r) => r.repo)])];
  const outside = repos.filter((r) => !isTestRepo(db, r));
  if (!repos.length || outside.length) throw new Error(`refused: ${outside.join(", ") || "no repo"} is not marked as a test repo (decisions test-repo REPO on)`);
  if (!operators(db).has(login)) throw new Error(`refused: ${login} is not an operator`);
  return d;
}

/** Tries the GitHub write of a waiting or failed answer again, like the dashboard's Retry; test repos only. */
export async function retryAsSession(db: DatabaseSync, id: string, login: string): Promise<void> {
  const d = sessionDecision(db, id, login);
  if (!d.answer || d.applied_at) throw new Error(`decision ${id} has nothing waiting to run`);
  const { retryDecision } = await import("./github/user-lane.ts");
  if (!retryDecision(db, id)) throw new Error(`decision ${id} is not waiting or failed`);
  audit(db, login, "retry", id, { answer: d.answer, source: "cli", via: "session" });
}

/** The repos a card writes to: its item's, and a resolution's transfer and new-issue targets. */
function cardRepos(c: { repo: string; params: string }): string[] {
  const p = JSON.parse(c.params) as { kind: string; steps?: { kind: string; to?: string; repo?: string }[] };
  return [c.repo, ...(p.kind === "resolution" ? (p.steps ?? []).flatMap((x) => (x.kind === "transfer" && x.to ? [x.to] : x.kind === "open_issue" && x.repo ? [x.repo] : [])) : [])];
}

/** Runs a proposed card as `login` the way the dashboard's button does; test repos only, operator logins only. */
export async function cardAsSession(db: DatabaseSync, id: number, login: string, opts: { note?: string; skip?: number[] } = {}): Promise<{ state: string; result: string | null; error: string | null }> {
  const c = db.prepare("SELECT id, repo, number, params, state FROM main.conversation_cards WHERE id = ?").get(id) as { id: number; repo: string; number: number; params: string; state: string } | undefined;
  if (!c) throw new Error(`no card ${id}`);
  const outside = [...new Set(cardRepos(c))].filter((r) => !isTestRepo(db, r));
  if (outside.length) throw new Error(`refused: ${outside.join(", ")} is not marked as a test repo (decisions test-repo REPO on)`);
  if (!operators(db).has(login)) throw new Error(`refused: ${login} is not an operator`);
  const { doCard } = await import("./conversations/act.ts");
  const { card, ran } = await doCard(db, id, login, opts);
  if (!ran) throw new Error(`card ${id} is ${card.state}, not proposed`);
  audit(db, login, "card", `${c.repo}#${c.number}`, { card: id, source: "cli", via: "session" });
  const after = db.prepare("SELECT state, result, error FROM main.conversation_cards WHERE id = ?").get(id) as { state: string; result: string | null; error: string | null };
  return after;
}

function cardsCmd(args: string[]): void {
  const m = /^(.+)#(\d+)$/.exec(args[0] ?? "");
  if (!m) throw new Error("usage: decisions cards REPO#N");
  const rows = connect().prepare("SELECT id, kind, state, description FROM main.conversation_cards WHERE repo = ? AND number = ? ORDER BY id").all(m[1]!, Number(m[2])) as { id: number; kind: string; state: string; description: string | null }[];
  for (const r of rows) console.log(`${r.id}\t${r.kind}\t${r.state}\t${r.description ?? ""}`);
}

async function cardCmd(args: string[]): Promise<void> {
  const id = Number(args[0]);
  const ai = args.indexOf("--as");
  const ni = args.indexOf("--note");
  const si = args.indexOf("--skip");
  const login = ai >= 0 ? args[ai + 1] : undefined;
  if (!Number.isInteger(id) || !login || (ni >= 0 && args[ni + 1] === undefined) || (si >= 0 && !/^\d+(,\d+)*$/.test(args[si + 1] ?? "")))
    throw new Error("usage: decisions card ID --as LOGIN [--skip N,N] [--note TEXT]");
  const r = await cardAsSession(connect(), id, login, { note: ni >= 0 ? args[ni + 1] : undefined, skip: si >= 0 ? args[si + 1]!.split(",").map(Number) : undefined });
  console.log(`card ${id}\t${r.state} as ${login} (source cli, via session)${r.result ? `: ${r.result}` : ""}${r.error ? `: ${r.error}` : ""}`);
}

async function retryCmd(args: string[]): Promise<void> {
  const [id] = args;
  const ai = args.indexOf("--as");
  const login = ai >= 0 ? args[ai + 1] : undefined;
  if (!id || id.startsWith("--") || !login) throw new Error("usage: decisions retry ID --as LOGIN");
  await retryAsSession(connect(), id, login);
  console.log(`${id}\tqueued again as ${login} (source cli, via session)`);
}

async function answerCmd(args: string[]): Promise<void> {
  const [id, option] = args;
  const ai = args.indexOf("--as");
  const ni = args.indexOf("--note");
  const login = ai >= 0 ? args[ai + 1] : undefined;
  if (!id || !option || id.startsWith("--") || option.startsWith("--") || !login || (ni >= 0 && args[ni + 1] === undefined))
    throw new Error("usage: decisions answer ID OPTION --as LOGIN [--note TEXT]");
  const d = await answerAsSession(connect(), id, option, login, ni >= 0 ? args[ni + 1] : undefined);
  console.log(`${d.id}\tanswered ${d.answer} as ${d.answered_by} (source cli, via session)`);
  if (d.id.includes(":dupegroup:")) {
    const { textsFor } = await import("./dupes/texts.ts");
    for (const t of textsFor(connect(), d.id, d.answer!)) console.log(`approved ${t.step} on #${t.number}: ${t.text}`);
  }
  console.log(`state: ${d.applied_at ? "applied" : "waiting for the pipeline to act"}`);
}

function testRepoCmd(args: string[]): void {
  const db = connect();
  const [repo, mode] = args;
  if (!repo) {
    for (const r of testRepos(db)) console.log(r);
    return;
  }
  if (mode !== "on" && mode !== "off") throw new Error("usage: decisions test-repo [REPO on|off]");
  console.log(setTestRepo(db, "cli", repo, mode === "on") ? `${repo} test repo ${mode}` : `${repo} test repo already ${mode}`);
}

function withdrawCmd(args: string[]): void {
  const ri = args.indexOf("--repo");
  const scope: BacklogScope = { outsidePilot: args.includes("--outside-pilot"), repo: ri >= 0 ? args[ri + 1] : undefined };
  if (ri >= 0 && !scope.repo) throw new Error("--repo needs a repo name");
  if (!scope.outsidePilot && !scope.repo) throw new Error("usage: decisions withdraw (--outside-pilot | --repo R) [--apply]");
  const apply = args.includes("--apply");
  const res = withdrawOpen(connect(), scope, userInfo().username, apply);
  for (const d of res.decisions) console.log(`${d.id}\t${d.repo}#${d.number}`);
  console.log(`${res.decisions.length} open scope decision${res.decisions.length === 1 ? "" : "s"} ${apply ? "withdrawn" : "would be withdrawn (dry run; --apply writes)"}`);
}

function backlogCmd(args: string[]): void {
  const ri = args.indexOf("--repo");
  const scope: BacklogScope = { outsidePilot: args.includes("--outside-pilot"), repo: ri >= 0 ? args[ri + 1] : undefined };
  if (ri >= 0 && !scope.repo) throw new Error("--repo needs a repo name");
  if (!scope.outsidePilot && !scope.repo) throw new Error("usage: decisions backlog (--outside-pilot | --repo R) [--apply]");
  const apply = args.includes("--apply");
  const res = backlogOpen(connect(), scope, userInfo().username, apply);
  for (const d of res.decisions) console.log(`${d.id}\t${d.kind}\t${d.repo ?? ""}${d.number === null ? "" : `#${d.number}`}`);
  console.log(`${res.decisions.length} open decision${res.decisions.length === 1 ? "" : "s"} ${apply ? "answered Backlog" : "would be answered Backlog (dry run; --apply writes)"}`);
}

function list(args: string[]): void {
  if (args.includes("--actionable")) {
    for (const a of actionable(connect())) console.log(JSON.stringify(a));
    return;
  }
  const which = args.includes("--all") ? "all" : args.includes("--answered") ? "answered" : "open";
  const ri = args.indexOf("--repo");
  const repo = ri >= 0 ? args[ri + 1] : undefined;
  const where = [which === "open" ? "answer IS NULL" : which === "answered" ? "answer IS NOT NULL" : "1"];
  if (repo) where.push("(repo = :repo OR items LIKE :like)");
  const params: Record<string, string> = {};
  if (repo) Object.assign(params, { repo, like: `%"repo":"${repo}"%` });
  const db = connect();
  const rows = db.prepare(`SELECT * FROM decisions WHERE ${where.join(" AND ")} ORDER BY asked_at`).all(params) as DecisionRow[];
  for (const d of rows) {
    const target = isBatch(d) ? `batch of ${itemsOf(d).length}` : `${d.repo}#${d.number}`;
    const by = isBacklog(d.answer) || settledBy(db, d) ? "" : " (not actionable: not answered by someone who settles)";
    const state = d.answer ? `answered ${d.answer}${d.applied_at ? ", applied" : ""}${by}` : "open";
    const keys = optionsOf(d).map((o) => o.key).join(",");
    console.log(`${d.id}\t${d.kind}\t${target}\t${state}\t${d.question}\toptions: ${keys}`);
  }
}

function show(args: string[]): void {
  const id = args[0];
  if (!id) throw new Error("usage: decisions show <id>");
  const db = connect();
  const d = getDecision(db, id);
  if (!d) throw new Error(`no decision ${id}`);
  // Agents run this command: no free text from people (answer_note), and
  // adopted_opinion points at an opinion, which agents never see.
  const { adopted_opinion: _adopted, answer_note: _note, snoozed_by: _sb, snoozed_at: _sa, ...rest } = d;
  const actionable = d.answer !== null && !isBacklog(d.answer) && settledBy(db, d);
  const out = { ...rest, actionable, items: j(d.items, null), facts: factsOf(d), options: optionsOf(d), exceptions: j(d.exceptions, null) };
  console.log(JSON.stringify(out, null, 2));
}

function askCmd(args: string[]): void {
  const file = args[0];
  if (!file) throw new Error("usage: decisions ask <file.json>  (one object or an array)");
  const data = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const qs = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
  for (const q of qs) {
    if (q && typeof q === "object" && ["answer", "answer_note", "answered_by", "answered_at", "exceptions", "applied_at", "adopted_opinion"].some((k) => k in q))
      throw new Error(`decision ${String(q.id)}: the CLI cannot set answers`);
  }
  const r = ask(connect(), qs);
  console.log(`${r.inserted} asked, ${r.updated} updated`);
}

async function convertChoicesCmd(args: string[]): Promise<void> {
  const { convertOpenDecisions } = await import("./decide/choices-convert.ts");
  const dryRun = args.includes("--dry-run");
  const r = convertOpenDecisions(connect(), { dryRun });
  console.log(`${dryRun ? "would convert" : "converted"} ${r.converted} open decisions to choices; skipped ${r.skipped}; ${r.stale} stale cards, ${r.unconverted} cards matching no choice`);
  for (const note of r.notes) console.log(note);
}

const SUB: Record<string, (args: string[]) => void | Promise<void>> = { list, show, ask: askCmd, backlog: backlogCmd, withdraw: withdrawCmd, answer: answerCmd, retry: retryCmd, cards: cardsCmd, card: cardCmd, "test-repo": testRepoCmd, "convert-choices": convertChoicesCmd };

export const commands = {
  decisions: {
    summary: "decisions for people: list [--open|--answered|--all|--actionable] [--repo R] | show ID | ask FILE.json | backlog (--outside-pilot | --repo R) [--apply] | withdraw (--outside-pilot | --repo R) [--apply] | answer ID OPTION --as LOGIN [--note TEXT] | retry ID --as LOGIN | cards REPO#N | card ID --as LOGIN [--skip N,N] [--note TEXT] | test-repo [REPO on|off] | convert-choices [--dry-run] (answers come from the dashboard, or `answer`/`card` on test repos as an operator login; backlog is the operator bulk hold; withdraw deletes open scope decisions so Decide asks them again later)",
    run(args: string[]): void | Promise<void> {
      const [sub, ...rest] = args;
      const fn = sub ? SUB[sub] : undefined;
      if (!fn) {
        console.log("usage: autocraft decisions list|show|ask|backlog|withdraw|answer|retry|test-repo ...");
        process.exit(sub ? 1 : 0);
      }
      return fn(rest);
    },
  },
};
