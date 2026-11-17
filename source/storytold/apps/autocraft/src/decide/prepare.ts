// The prepare step: one judgement-model call per open decision, so every question a person has to answer comes with
// a summary, a pick and drafted answers. The call reads what stopped the pipeline (the output of the call that asked),
// the item and, for a pull request, its diff, with read-only tools on a checkout when there is one.
// A single-item decision gets an Opus turn in the item's conversation and its choices (a pick, drafted params and extras per
// core) stored as the decision's current version; a group decision gets a summary and a pick only. Our code accepts only a
// pick that is one of the decision's cores or options.
import type { DatabaseSync } from "node:sqlite";
import { queueRoom } from "../agents/call.ts";
import { runModelStep, type ClaudeStep } from "../agents/step.ts";
import { referenceProblems, defaultSemanticDeps, type SemanticDeps } from "../reference-lint.ts";
import { dropTexts } from "../replylint.ts";
import { referenceDir } from "../reference.ts";
import { SUMMARY_MIN, summaryInput } from "../classify/parse.ts";
import { pool } from "../classify/run.ts";
import { itemsOf, optionsOf, factsOf, type DecisionRow } from "../decisions.ts";
import { openDecision, type NewCard } from "../conversations/cards.ts";
import { choicesTexts, parseChoices, type ParsedChoices } from "./choices-parse.ts";
import { coreSummaries } from "./choices.ts";
import { parseCoreKey, type CoreKey } from "./choices-types.ts";
import { ensureConversation, insertTurn, opusBlock, refreshItem, turnsOf, type DiffSource } from "../conversations/store.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { codeDiff } from "../review/diff.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { applicableSteps } from "../conversations/cards.ts";
import { pilotSql } from "../pilot.ts";
import { notOwnIntegrationSql } from "../dupes/held.ts";
import { judgementModel } from "./judgement.ts";
import { loadSummaryItems } from "./index.ts";
import { lockLiveSql } from "../answers/hold.ts";
import { discussionKeySql, openSubjectSql, prepareDue, prepareStateSql, utcDayStart, type PrepareColumns } from "./prepared.ts";
import { PREPARE_DIFF_LIMIT, PREPARE_MEMBERS, PREPARE_STOPPED_LIMIT, PREPARE_SUMMARY_MAX, PREPARE_TURNS_LIMIT, type PrepareInput } from "./prepare-types.ts";

export const PREPARE_PROMPT = CLAUDE_PROMPTS["decide.prepare"];

/**
 * The reply as our code reads it: the summary and the checked choices block. `choices` is null for a decision that is not its
 * item's newest open one only when the model sent no block (those take the pick alone). `pickLost` is the pick the checks removed; it asks for the repeat.
 */
export type Prepared = {
  summary: string;
  choices: ParsedChoices | null;
  /** The question to the author, a proposed comment card. */
  ask: NewCard | null;
  notes: string[];
  pickLost: CoreKey | null;
  /** The reply text before the block. */
  text: string;
  /** The option key the pick names when it is an option core (the decision's recommendation), else null. */
  pick: string | null;
  reason: string;
};

type Subject = { repo: string; n: number; d: DecisionRow; /** The decision the conversation binds its choices to. */ single: boolean };

/**
 * Reads a prepare reply. The summary is the text before the block (SUMMARY_MIN to PREPARE_SUMMARY_MAX characters). A single
 * decision needs a usable choices block: its drafts replace the decision's choices whole. Any other decision takes the pick alone
 * (`o:<option key>` or null) and may come without a block. Null: no valid summary or block, so the call is repeated.
 */
export function parsePrepareReply(db: DatabaseSync, x: Subject, text: string, drop: ReadonlySet<string> = new Set()): Prepared | null {
  const r = parseChoices(db, x.repo, x.n, x.d, text, drop, { fresh: true, pickOnly: !x.single });
  if (!r) return null;
  const summary = r.text.replace(/\s+/g, " ").trim();
  if (summary.length < SUMMARY_MIN || summary.length > PREPARE_SUMMARY_MAX) return null;
  if (x.single && !r.choices) return null;
  const parsed = r.choices;
  const pickCore = parsed?.pick.core ? parseCoreKey(parsed.pick.core) : null;
  const pick = pickCore?.type === "option" ? pickCore.option : null;
  return { summary, choices: parsed, ask: x.single ? r.ask : null, notes: r.notes, pickLost: r.pickLost, text: r.text, pick, reason: parsed?.pick.core ? parsed.pick.reason ?? "" : "" };
}

type PrepareCtx = { db: DatabaseSync; subject: Subject; dir: string | undefined; semantic: SemanticDeps | undefined };

/** The prepare call: the reply parser and the reference lint of the drafted texts (as the conversation step has). */
export const PREPARE: ClaudeStep<PrepareInput, Prepared, PrepareCtx> = {
  provider: "claude", id: "decide.prepare",
  toPrompt: (x) => [x], size: () => 1,
  lint: { fields: ["cores[].reason", "cores[].extras[].text", "cores[].extras[].title", "cores[].extras[].body", "add[].extras[].text", "add[].extras[].title", "add[].extras[].body", "ask.text"], make: (_x, c) => async (text, stage) => (c.subject.single && parsePrepareReply(c.db, c.subject, text) ? referenceProblems(choicesTexts(text), c.dir, c.semantic, { stage }) : null) },
  // A single decision whose choices were dropped, or whose pick was dropped, is asked once more with the drop notes; the repeat's value replaces the first.
  parse: (text, x, ctx, c) => {
    const r = parsePrepareReply(c.db, c.subject, text, dropTexts(ctx.problems));
    if (r === null) return null;
    const empty = !r.choices || (!Object.keys(r.choices.cores).length && !r.choices.add.length);
    if (c.subject.single && ctx.attempt === 0 && !ctx.last && (r.pickLost || (empty && r.notes.length))) {
      return { value: r, rest: { ...x, previous: [...r.notes, ...(r.pickLost ? [`your pick "${r.pickLost}" is not a choice that passed the checks; pick one of the cores that did, or null`] : [])] } };
    }
    return { value: r };
  },
};

// ---- what is due ---------------------------------------------------------------

type DueRow = PrepareColumns & { id: string; repo: string; asked_at: string; number: number | null; item_kind: string | null; head_oid: string | null };

/** The head a decision is prepared for: a pull request's head commit, else null. */
const headOf = (r: { item_kind: string | null; head_oid: string | null }): string | null => (r.item_kind === "pr" ? r.head_oid : null);

/** A decision gains one level band for each day it has been open (at most all 4), so P2 decisions are not starved by a steady flow of P0 ones. Aging orders the prepares; nothing waits on a timer. */
export const PREPARE_AGING_MS = 24 * 3600_000;

/**
 * Ids of the open decisions whose prepare is due (no prepare for the current state, tries left, backoff over), those an operator asked to prepare again first,
 * then repos in turn (each repo's first, then each repo's second, and so on), and within a round by the item's priority level raised by the age of the decision
 * (P0 first), then oldest first. A decision whose press is running or queued is locked and not prepared. The item's Plan says whether the decide step has work; this reads the decisions themselves.
 */
export function prepareIds(db: DatabaseSync, repos?: string[], nowMs: number = Date.now()): string[] {
  const rows = db.prepare(`SELECT d.id, d.repo, d.asked_at, d.number, d.prepare_requested_at, d.prepared_at, d.prepared_head, d.prepare_failed_head, d.recommend_failures, d.recommend_failed_at, i.kind AS item_kind, i.head_oid, d.kind, d.prepared_discussion, ${prepareStateSql("d")},
      COALESCE(CAST(rk.score / 10000 AS INTEGER), 2) AS band
    FROM decisions d LEFT JOIN items i ON i.repo = d.repo AND i.number = d.number LEFT JOIN item_rank rk ON rk.repo = d.repo AND rk.number = d.number
    WHERE d.answer IS NULL AND d.repo IS NOT NULL AND d.number IS NOT NULL AND ${openSubjectSql("d", "i")} AND ${pilotSql("i")} AND ${notOwnIntegrationSql("i")} AND NOT ${lockLiveSql("d")}
    ORDER BY d.prepare_requested_at IS NULL, d.prepare_requested_at, d.asked_at, d.id`).all(utcDayStart(nowMs)) as (DueRow & { band: number })[];
  const due = rows.filter((r) => !repos?.length || repos.includes(r.repo)).filter((r) => prepareDue(r, headOf(r), nowMs));
  const level = (r: { band: number; asked_at: string }): number => r.band + Math.min(4, Math.floor(Math.max(0, nowMs - Date.parse(r.asked_at)) / PREPARE_AGING_MS) || 0);
  // Within a repo the best (aged level, then oldest) comes first, so its round numbers follow that order.
  due.sort((x, y) => level(y) - level(x) || (x.asked_at < y.asked_at ? -1 : x.asked_at > y.asked_at ? 1 : 0) || (x.id < y.id ? -1 : 1));
  const round = new Map<string, number>();
  const turn = new Map(due.map((r) => [r.id, r.prepare_requested_at ? -1 : (round.set(r.repo, (round.get(r.repo) ?? -1) + 1), round.get(r.repo)!)]));
  return due.sort((x, y) => turn.get(x.id)! - turn.get(y.id)! || level(y) - level(x) || (x.asked_at < y.asked_at ? -1 : x.asked_at > y.asked_at ? 1 : 0) || (x.id < y.id ? -1 : 1)).map((r) => r.id);
}

// ---- what stopped the pipeline -----------------------------------------------

const cut = (s: string | null | undefined, n: number): string => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const arr = (s: string | null): unknown[] => { try { const v = JSON.parse(s ?? "[]") as unknown; return Array.isArray(v) ? v : []; } catch { return []; } };

/**
 * The output of the call that asked the question, as stored: the question's context line; for a pull request the newest Opus review
 * (verdict, reason, fixes, risks), at the current head first; the classifiers' latest labels and reasons; the duplicate comparison that
 * lists the item; for a group decision its members and roles. Maintainers' comments and opinions on the dashboard are never read here.
 */
export function stoppedBy(db: DatabaseSync, d: DecisionRow, head: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (d.context) out.context = cut(d.context, 1000);
  if (d.number === null || !d.repo) return out;
  const review = db.prepare(`SELECT head_oid, verdict, sure, reason, fixes, risks FROM opus_reviews WHERE repo = ? AND number = ? AND verdict IS NOT NULL
    ORDER BY (head_oid = ?) DESC, at DESC LIMIT 1`).get(d.repo, d.number, head ?? "") as { head_oid: string; verdict: string; sure: number | null; reason: string | null; fixes: string | null; risks: string | null } | undefined;
  if (review) out.review = { at_head: review.head_oid === head, verdict: review.verdict, sure: review.sure === null ? null : review.sure === 1, reason: cut(review.reason, 1500), fixes: arr(review.fixes).slice(0, 10), risks: arr(review.risks).slice(0, 10).map((r) => cut(String(r), 400)) };
  const cls = db.prepare("SELECT classifier, at, type_label, want, reference, flags, reason, dup_of FROM classifications WHERE repo = ? AND number = ? ORDER BY at DESC").all(d.repo, d.number) as { classifier: string; type_label: string | null; want: string | null; reference: string | null; flags: string | null; reason: string | null; dup_of: number | null }[];
  const seen = new Set<string>();
  const classifications = cls.filter((c) => !seen.has(c.classifier) && seen.add(c.classifier)).map((c) => ({ classifier: c.classifier, type_label: c.type_label, want: c.want, reference_claim: cut(c.reference, 300) || null, flags: arr(c.flags), reason: cut(c.reason, 400), duplicate_of: c.dup_of }));
  if (classifications.length) out.classifications = classifications;
  const cmp = db.prepare(`SELECT kind, members, source, reason, result FROM dupe_comparisons WHERE repo = ? AND EXISTS (SELECT 1 FROM json_each(members) WHERE value = ?) ORDER BY at DESC LIMIT 2`).all(d.repo, d.number) as { kind: string; members: string; source: string; reason: string | null; result: string | null }[];
  if (cmp.length) out.duplicate_comparisons = cmp.map((c) => ({ kind: c.kind, members: arr(c.members), by: c.source, reason: cut(c.reason, 600), result: cut(c.result, 1500) }));
  if (d.id.includes(":dupegroup:")) {
    const members = db.prepare("SELECT number, kind, role, target, detail FROM dupe_group_items WHERE decision_id = ? ORDER BY number").all(d.id) as { number: number; kind: string; role: string; target: number | null; detail: string | null }[];
    if (members.length) out.group_members = members.map((m) => ({ number: m.number, kind: m.kind, role: m.role, target: m.target, detail: cut(m.detail, 400) || null }));
  }
  return out;
}

/** The operator messages of the item's conversation (the operator's own words and the posts they shared), newest last, cut from the front. */
function operatorTurns(db: DatabaseSync, repo: string, n: number): string {
  const all = turnsOf(db, repo, n).filter((t) => t.kind === "operator").map((t) => t.block).join("");
  return all.length > PREPARE_TURNS_LIMIT ? all.slice(all.length - PREPARE_TURNS_LIMIT) : all;
}

// ---- the step ----------------------------------------------------------------

export type PrepareParams = {
  /** The judgement model; default: the operator's setting. */
  model?: string;
  /** Host directory with a read-only checkout, or null to ask without tools: a pull request's head commit, else the repo's default branch. */
  checkout: (repo: string, number: number, head: string | null) => Promise<string | null>;
  /** PR diffs (also for the conversation's item block). */
  diff: DiffSource;
  usageRun: string;
  onSent?: () => void;
  cancelled?: () => boolean;
  log: (line: string) => void;
  /** The semantic reference check of drafted comments; absent: the real one. */
  semantic?: SemanticDeps;
};

export type PrepareResult = { /** Decisions prepared and stored. */ stored: number; failed: number };

type Row = DecisionRow & PrepareColumns;
type ItemRow = { kind: string; state: string; mergeable: string | null; head_oid: string | null; additions: number | null; deletions: number | null; changed_files: number | null };

const now = () => new Date().toISOString();

/** The PR's CI and mergeable state as the mirror holds them now; checks count only when fetched for the current head (as in core/facts). */
function liveState(it: ItemRow, c: { head_oid: string | null; overall: string | null; mergeable: string | null } | undefined): { ci: string | null; mergeable: string } {
  const atHead = !!c && c.head_oid === it.head_oid;
  return { ci: atHead ? c!.overall ?? null : null, mergeable: (atHead ? c!.mergeable : it.mergeable) ?? "UNKNOWN" };
}

/** One call per decision id, concurrently as the Claude room allows. */
export async function prepare(db: DatabaseSync, ids: string[], p: PrepareParams): Promise<PrepareResult> {
  const model = p.model ?? judgementModel(db);
  const checkouts = new Map<string, Promise<string | null>>();
  const select = db.prepare("SELECT * FROM decisions WHERE id = ? AND answer IS NULL");
  const itemOf = db.prepare("SELECT kind, state, mergeable, head_oid, additions, deletions, changed_files FROM items WHERE repo = ? AND number = ?");
  const checksOf = db.prepare("SELECT head_oid, overall, mergeable FROM pr_checks WHERE repo = ? AND number = ?");
  const failed = db.prepare(`UPDATE main.decisions SET recommend_failures = CASE WHEN prepare_failed_head IS ? THEN COALESCE(recommend_failures, 0) + 1 ELSE 1 END,
    recommend_failed_at = ?, prepare_failed_head = ? WHERE id = ?`);
  const store = db.prepare(`UPDATE main.decisions SET recommended = ?, recommended_reason = ?, recommended_by = ?, summary = ?, summary_by = ?, summary_at = ?,
    prepared_at = ?, prepared_head = ?, prepared_discussion = ?, recommend_failures = NULL, recommend_failed_at = NULL, prepare_failed_head = NULL, prepare_requested_at = NULL
    WHERE id = ? AND answer IS NULL AND question = ? AND options = ?`);
  const res: PrepareResult = { stored: 0, failed: 0 };
  await pool(ids.map((id, k) => async () => {
    if (p.cancelled?.()) return;
    const d = select.get(id) as Row | undefined;
    if (!d || !d.repo || d.number === null) return;
    const repo = d.repo, n = d.number;
    const it = itemOf.get(repo, n) as ItemRow | undefined;
    if (!it) return;
    const isPr = it.kind === "pr";
    const head = isPr ? it.head_oid : null;
    const group = d.id.includes(":dupegroup:");
    // Only the decision the conversation binds its cards to (the item's newest open one) gets a turn with cards; the item's other decisions get a summary and a pick, like groups.
    const single = !group && openDecision(db, repo, n)?.id === d.id;
    const options = optionsOf(d);
    const [item] = loadSummaryItems(db, [{ repo, number: n }]);
    if (!item) return;
    const members = group ? loadSummaryItems(db, (db.prepare("SELECT number FROM dupe_group_items WHERE decision_id = ? ORDER BY number LIMIT ?").all(d.id, PREPARE_MEMBERS) as { number: number }[]).map((m) => ({ repo, number: m.number }))) : [];
    const start = now();
    p.onSent?.();
    let prDiff: string | null = null;
    if (isPr && head) {
      const raw = await p.diff(repo, n, head).catch(() => null);
      if (raw) {
        let cd = codeDiff(raw);
        if (!cd.files.length && cd.testsOmitted.length) cd = codeDiff(raw, true);
        prDiff = cd.text.length <= PREPARE_DIFF_LIMIT ? cd.text : null;
      }
    }
    const ckey = `${repo}#${isPr ? n : 0}@${head ?? ""}`;
    if (!checkouts.has(ckey)) checkouts.set(ckey, p.checkout(repo, n, head).catch(() => null));
    const checkout = await checkouts.get(ckey)!;
    // The conversation (item block, updates) is brought up to date before the call: the drafts are stamped with what the call was told.
    if (single) {
      await ensureConversation(db, repo, n, "opus", { diff: p.diff }).catch((e) => p.log(`decide: no conversation for ${id}: ${(e as Error).message}`));
      await refreshItem(db, repo, n, { diff: p.diff }).catch(() => false);
    }
    const input: PrepareInput = {
      ref: `${repo}#${n}`, item: { ...summaryInput(item), steps: applicableSteps(db, repo, n) }, question: d.question, facts: factsOf(d),
      options: options.map((o) => ({ key: o.key, label: o.label, hint: o.hint ?? "" })),
      cores: single ? coreSummaries(db, d) : [],
      stopped: stoppedBy(db, d, head),
      ...(!single && { group: true }), ...(group && { members: members.map(summaryInput) }),
      ...(isPr && { pr: { head, lines: { additions: it.additions, deletions: it.deletions, files: it.changed_files }, diff: prDiff, live: liveState(it, checksOf.get(repo, n) as { head_oid: string | null; overall: string | null; mergeable: string | null } | undefined) } }),
    };
    const turns = group ? "" : operatorTurns(db, repo, n);
    if (turns) input.operator_turns = turns;
    if (checkout) input.repo_dir = REPO_PATH;
    const dir = referenceDir(repo);
    const semantic = p.semantic ?? defaultSemanticDeps(db, `${repo}#${n}`);
    // What the call reads of the discussion, kept with the prepare; the call counts against the decision's daily cap unless an operator asked for it.
    const readKey = (db.prepare(`SELECT ${discussionKeySql("d")} AS k FROM decisions d WHERE d.id = ?`).get(d.id) as { k: string | null }).k ?? "";
    db.prepare("INSERT INTO main.decision_prepares (decision_id, at, manual) VALUES (?, ?, ?)").run(d.id, now(), d.prepare_requested_at ? 1 : 0);
    const r = await runModelStep(db, PREPARE, input, {
      model, checkout: checkout ?? undefined, reference: checkout ? dir : undefined,
      ctx: { db, subject: { repo, n, d, single }, dir, semantic },
      usage: { run: p.usageRun, agent: `prepare-${String(k).padStart(3, "0")}`, stage: "decide", model, items: () => 1 },
      onReply: (reply) => { if (reply.fixTurn) p.log(`decide: ${id}: reply lint: ${reply.problems?.length ? `${reply.problems.length} problems left after the fix turn` : "fixed by one fix turn"}`); },
      cancelled: p.cancelled,
    });
    if (!r.ok) {
      if (p.cancelled?.()) return;
      failed.run(head, now(), head, d.id);
      res.failed++;
      p.log(`decide: no valid prepare for ${d.id}; retried in an hour, at most 3 tries`);
      return;
    }
    const got = r.value;
    // The PR moved on while the call ran: the next pass prepares it for the new head. A group's kept item may be closed; prepareIds decides whether the group is still open.
    const after = itemOf.get(repo, n) as ItemRow | undefined;
    if (!after || (!group && after.state !== "OPEN") || (isPr && (d.kind === "merge" || d.kind === "hold") && after.head_oid !== head)) {
      // Counted as a try at the head it was asked for: a new head is prepared at once, anything else waits like a failure instead of repeating every pass.
      failed.run(head, now(), head, d.id);
      p.log(`decide: ${d.id}: head moved on during the call; prepared again next pass`);
      return;
    }
    // The decision was answered or asked again while the call ran: nothing is stored, the next pass prepares what is still open.
    if (!db.prepare("SELECT 1 FROM decisions WHERE id = ? AND answer IS NULL AND question = ? AND options = ?").get(d.id, d.question, d.options)) return;
    const at = now();
    try {
      if (single) {
        const cards = got.ask ? [got.ask] : [];
        insertTurn(db, repo, n, { kind: "opus", login: "opus", body: got.text, block: opusBlock(got.text, cards, got.choices), notes: got.notes, cards, ...(got.choices && { choices: { decision: d, parsed: got.choices, source: "prepare" as const, by: model } }) }, { diff: p.diff });
      }
      store.run(got.pick, got.pick ? got.reason || null : null, model, got.summary, model, at, at, head, readKey, d.id, d.question, d.options);
      res.stored++;
    } catch (e) {
      p.log(`decide: could not store the prepare of ${d.id}: ${(e as Error).message}`);
      try { failed.run(head, now(), head, d.id); } catch { /* the next pass tries again */ }
      res.failed++;
    }
  }), () => queueRoom(db), { first: true });
  return res;
}
