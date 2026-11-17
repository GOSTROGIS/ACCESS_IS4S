// "Needs you": feedback people left that nobody has answered, and what the pipeline stopped. Decisions have their own API.
// Dashboard users' text is shown here and never read by a prompt.
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { NeedsFeedbackPage, NeedsFeedbackRow, NeedsFixPage, NeedsPage, NeedsStoppedRow } from "../../../web/src/api/types.ts";
import { listAccounts } from "../../agents/accounts.ts";
import { getDecision, reposOf } from "../../decisions.ts";
import { needingSql, touchesQuiet, withoutHidden } from "./decisions.ts";
import { stageLimits } from "../../runner/autopilot.ts";
import { decisionPath, itemPath } from "../../../web/src/lib/links.ts";
import { reviewBots } from "../../review/bots.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { itemState } from "./shown.ts";
import { fixStoppedWait } from "../../core/decide-item.ts";
import { blankIfHidden, hiddenRepos } from "./visible.ts";
import { filtered, hiddenTest, isHiddenRepo, type HiddenRepos } from "../../hidden-sql.ts";
import { allOwnLogins } from "../../github/identity.ts";
import { isQuiet } from "../../security/quiet.ts";
import { canSeeInternals } from "./staff.ts";

export const NEEDS_PAGE = 30;
/** Older feedback is not asked for any more; the window also bounds the scans. */
const WINDOW_MS = 60 * 86_400_000;

type Raw = { id: string; source: NeedsFeedbackRow["source"]; author: string; at: string; text: string; repo: string | null; number: number | null; decision: string | null; turn: number | null; comment: string | null; handled: number };

// One SELECT per source, each with a `handled` flag. They share the parameters :since, :cur (newest time wanted), :own (the box account), :owns (JSON list of every login that is ours) and :bots.
const SOURCES: string[] = [
  // Feedback on a decision from anyone but an operator; handled once the decision was answered afterwards.
  `SELECT 'decision-comment:' || c.id AS id, 'decision' AS source, c.login AS author, c.at, c.body AS text, d.repo, d.number, d.id AS decision, NULL AS turn, c.id AS comment,
     d.answered_at IS NOT NULL AND d.answered_at > c.at AS handled
   FROM decision_comments c JOIN decisions d ON d.id = c.decision_id
   WHERE c.at >= :since AND c.at <= :cur AND NOT EXISTS (SELECT 1 FROM access a WHERE a.login = c.login AND a.role = 'operator')`,
  `SELECT 'decision-opinion:' || o.id, 'decision', o.login, o.at, o.note, d.repo, d.number, d.id, NULL, NULL,
     d.answered_at IS NOT NULL AND d.answered_at > o.at
   FROM decision_opinions o JOIN decisions d ON d.id = o.decision_id
   WHERE o.at >= :since AND o.at <= :cur AND o.retracted_at IS NULL AND TRIM(COALESCE(o.note, '')) <> ''
     AND NOT EXISTS (SELECT 1 FROM access a WHERE a.login = o.login AND a.role = 'operator')`,
  // An operator's message to Opus on an item; handled once Opus answered it.
  `SELECT 'turn:' || t.id, 'operator', t.login, t.at, t.body, t.repo, t.number, NULL, t.id, NULL, t.status IS NULL OR t.status = 'answered'
   FROM conversation_turns t WHERE t.kind = 'operator' AND t.at >= :since AND t.at <= :cur`,
  // A GitHub comment or review that names the pipeline login (flagged when written, so an index finds them); handled once the
  // pipeline login posted on the item afterwards. Nothing without a pipeline login.
  `SELECT 'comment:' || c.id, 'github', c.author, c.created_at, c.body, c.repo, c.number, NULL, NULL, c.id,
     EXISTS (SELECT 1 FROM comments a WHERE a.repo = c.repo AND a.number = c.number AND a.author IN (SELECT value FROM json_each(:owns)) AND a.created_at > c.created_at)
   FROM comments c
   WHERE :own <> '' AND c.mentions_pipeline = 1 AND c.created_at >= :since AND c.created_at <= :cur AND c.author IS NOT NULL AND c.author NOT IN (SELECT value FROM json_each(:owns))`,
  // The comment right after one of AutoCraft's own (a comment the audit log recorded with its URL and text, or the review we posted (audit `review-post`); the account's older manual comments do not count), on an item it commented on; bots do not count as replies.
  `SELECT 'comment:' || c.id, 'github', c.author, c.created_at, c.body, c.repo, c.number, NULL, NULL, c.id,
     EXISTS (SELECT 1 FROM comments a WHERE a.repo = c.repo AND a.number = c.number AND a.author IN (SELECT value FROM json_each(:owns)) AND a.created_at > c.created_at)
   FROM (SELECT DISTINCT repo, number FROM comments WHERE author IN (SELECT value FROM json_each(:owns))) o JOIN comments c ON c.repo = o.repo AND c.number = o.number
   WHERE :own <> '' AND c.mentions_pipeline = 0 AND c.created_at >= :since AND c.created_at <= :cur AND c.author IS NOT NULL AND c.author NOT IN (SELECT value FROM json_each(:owns)) AND c.author NOT LIKE '%[bot]' AND lower(c.author) NOT IN (SELECT value FROM json_each(:bots)) AND TRIM(COALESCE(c.body, '')) <> ''
     AND EXISTS (SELECT 1 FROM (SELECT p.id, p.author, p.body FROM comments p WHERE p.repo = c.repo AND p.number = c.number AND p.created_at < c.created_at ORDER BY p.created_at DESC LIMIT 1) q
       WHERE q.author IN (SELECT value FROM json_each(:owns)) AND EXISTS (SELECT 1 FROM audit a WHERE a.target = c.repo || '#' || c.number
         AND ((json_extract(a.details, '$.url') IS NOT NULL AND TRIM(REPLACE(json_extract(a.details, '$.text'), char(13), ''), ' ' || char(10) || char(9)) = TRIM(REPLACE(q.body, char(13), ''), ' ' || char(10) || char(9)))
           OR (a.action = 'review-post' AND json_extract(a.details, '$.review') = q.id))))`,
];

const ownLogin = (db: DatabaseSync): string => (db.prepare("SELECT value FROM main.settings WHERE key = 'pipeline_login'").get() as { value: string } | undefined)?.value ?? "";

function hiddenSql(hidden: HiddenRepos, params: Record<string, SQLInputValue>): string {
  if (!filtered(hidden)) return "1";
  const h = hiddenTest("repo", hidden);
  let k = 0;
  return `(repo IS NULL OR NOT (${h.sql.replace(/\?/g, () => { params[`h${k}`] = h.args[k]!; return `:h${k++}`; })}))`;
}

/** True when a feedback row is about a quiet pull request: its item, or any item of its decision (batch and duplicate-group members too). */
function quietRow(db: DatabaseSync, r: Pick<Raw, "repo" | "number" | "decision">, memo: Map<string, boolean>): boolean {
  if (r.repo !== null && r.number !== null && isQuiet(db, r.repo, r.number)) return true;
  if (!r.decision) return false;
  let q = memo.get(r.decision);
  if (q === undefined) {
    const d = getDecision(db, r.decision);
    memo.set(r.decision, (q = !!d && touchesQuiet(db, d)));
  }
  return q;
}

function feedback(db: DatabaseSync, hidden: HiddenRepos, cursor: { at: string; id: string } | null, limit: number, staff: boolean): { rows: Raw[]; more: boolean; unhandled: number } {
  const params: Record<string, SQLInputValue> = { since: new Date(Date.now() - WINDOW_MS).toISOString(), own: ownLogin(db), owns: JSON.stringify([...allOwnLogins(db)]), bots: JSON.stringify(reviewBots()) };
  const union = SOURCES.map((s) => `SELECT * FROM (${s})`).join(" UNION ALL ");
  const where = hiddenSql(hidden, params);
  const size = limit * 3 + 1;
  // Feedback on a batch decision is hidden when the batch holds an item of a hidden repo.
  const batches = new Map<string, boolean>();
  const visible = (r: Pick<Raw, "source" | "number" | "decision">): boolean => {
    if (r.source !== "decision" || r.number !== null || !r.decision) return true;
    let ok = batches.get(r.decision);
    if (ok === undefined) {
      const d = getDecision(db, r.decision);
      ok = !d || !reposOf(d).some((x) => isHiddenRepo(hidden, x));
      batches.set(r.decision, ok);
    }
    return ok;
  };
  // Time-ordered, so each source reads its index range; rows that are filtered out make it read on until the page is full.
  const page = db.prepare(`SELECT * FROM (${union}) WHERE ${where} AND (at < :cur OR (at = :cur AND id < :curId)) ORDER BY at DESC, id DESC LIMIT :limit`);
  const rows: Raw[] = [];
  let pos = cursor ?? { at: "9999", id: "\uffff" };
  while (rows.length <= limit) {
    const batch = page.all({ ...params, cur: pos.at, curId: pos.id, limit: size }) as Raw[];
    rows.push(...batch.filter(visible));
    const tail = batch[batch.length - 1];
    if (batch.length < size || !tail) break;
    pos = { at: tail.at, id: tail.id };
  }
  const open = db.prepare(`SELECT source, number, decision, COUNT(*) AS n FROM (${union}) WHERE ${where} AND NOT handled GROUP BY source, number IS NULL, decision`).all({ ...params, cur: "9999" }) as { source: Raw["source"]; number: number | null; decision: string | null; n: number }[];
  const unhandled = open.reduce((sum, r) => sum + (visible(r) ? r.n : 0), 0);
  // What staff wrote about a quiet pull request reaches viewers as the row only, as the decision and conversation APIs give it.
  const quiet = new Map<string, boolean>();
  const out = rows.slice(0, limit);
  return { rows: staff ? out : out.map((r) => (quietRow(db, r, quiet) ? { ...r, text: "" } : r)), more: rows.length > limit, unhandled };
}

function view(db: DatabaseSync, r: Raw): NeedsFeedbackRow {
  const it = r.repo && r.number !== null ? (db.prepare("SELECT kind, state, title FROM items WHERE repo = ? AND number = ?").get(r.repo, r.number) as { kind: string; state: string; title: string | null } | undefined) : undefined;
  const item = r.repo && r.number !== null ? { repo: r.repo, number: r.number, kind: it ? (it.kind === "pr" ? "pr" as const : "issue" as const) : null, state: it ? itemState(it.state) : null, title: it?.title ?? null } : null;
  const trace = (event: string) => (item ? `${itemPath(item.repo, item.number)}#event=${encodeURIComponent(event)}` : "/needs");
  const [href, hrefLabel] = r.source === "decision"
    ? [decisionPath({ id: r.decision!, repo: r.repo ?? "", number: null }), "Decision"]
    : r.source === "operator" ? [trace(`turn:${r.turn}`), "Conversation"] : [trace(`comment:${r.comment}`), "Comment"];
  return { id: r.id, source: r.source, item, author: r.author, at: r.at, text: r.text, href, hrefLabel, handled: !!r.handled };
}

const humanize = (id: string): string => { const t = id.replace(/[-_]+/g, " ").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

export async function stopped(db: DatabaseSync, hidden: HiddenRepos): Promise<NeedsStoppedRow[]> {
  const out: NeedsStoppedRow[] = [];
  for (const t of db.prepare("SELECT stage, reason, tripped_at FROM stage_trips WHERE active = 1 ORDER BY tripped_at").all() as { stage: string; reason: string; tripped_at: string }[])
    out.push({ id: `breaker:${t.stage}`, kind: "breaker", title: humanize(t.stage), reason: blankIfHidden(t.reason, hidden), since: t.tripped_at, resume: { type: "trip", stage: t.stage } });
  const updated = new Map((db.prepare("SELECT step, updated_at FROM stage_limits").all() as { step: string; updated_at: string | null }[]).map((r) => [r.step, r.updated_at]));
  for (const l of await stageLimits(db))
    if (l.perDay === 0 && !l.tripped) out.push({ id: `limit:${l.step}`, kind: "limit", title: l.title, reason: "The daily limit is 0", since: updated.get(l.step) ?? null, resume: { type: "link", to: "/pipeline" } });
  for (const a of listAccounts(db))
    if (a.enabled && a.pausedReason) out.push({ id: `account:${a.id}`, kind: "account", title: a.label, reason: blankIfHidden(a.pausedReason, hidden), since: null, resume: { type: "link", to: "/accounts" } });
  // Targets Act stopped after repeated failures, while the answer still stands: an operator retries them from here.
  for (const a of db.prepare(`SELECT a.decision_id, a.repo, a.number, a.reason, a.created_at FROM main.actions a JOIN main.decisions d ON d.id = a.decision_id JOIN main.items i ON i.repo = a.repo AND i.number = a.number
    WHERE a.state = 'stopped' AND d.answer IS NOT NULL AND d.applied_at IS NULL AND d.exec_state IS NOT 'disputed' AND d.id NOT LIKE '%~replaced-%' AND i.state = 'OPEN' ORDER BY a.created_at`).all() as { decision_id: string; repo: string; number: number; reason: string | null; created_at: string }[]) {
    if (isHiddenRepo(hidden, a.repo)) continue;
    out.push({ id: `act:${a.decision_id}:${a.number}`, kind: "act", title: `${a.repo}#${a.number}`, reason: blankIfHidden(a.reason ?? "Act stopped after repeated failures", hidden), since: a.created_at, resume: { type: "retry", decision: a.decision_id } });
  }
  // Items held for an outside author's daily limit or a surge: one group row per author, listed by `/api/needs/outside/:author`.
  for (const g of db.prepare(`SELECT h.author, COUNT(*) AS n, SUM(h.kind = 'pr') AS prs, MIN(i.created_at) AS since, MAX(h.reason = 'surge') AS surge FROM main.outside_holds h
    LEFT JOIN items i ON i.repo = h.repo AND i.number = h.number ${filtered(hidden) ? `WHERE NOT (${hiddenTest("h.repo", hidden).sql})` : ""} GROUP BY h.author COLLATE NOCASE ORDER BY n DESC, h.author`).all(...(filtered(hidden) ? hiddenTest("h.repo", hidden).args : [])) as { author: string; n: number; prs: number; since: string | null; surge: number }[]) {
    const parts = [g.prs && `${g.prs} PR${g.prs === 1 ? "" : "s"}`, g.n - g.prs && `${g.n - g.prs} issue${g.n - g.prs === 1 ? "" : "s"}`].filter(Boolean).join(", ");
    out.push({ id: `outside:${g.author}`, kind: "outside-group", title: g.author, reason: `${parts} waiting for ${g.surge ? "the outside-surge breaker or " : ""}the author's daily limit`, since: g.since, count: g.n, resume: { type: "outside", author: g.author } });
  }
  // Issues whose fix attempt was skipped or failed wait on a person: one group row per repo, listed by `fixes`.
  const groups = db.prepare(`SELECT p.repo, COUNT(*) AS n, MAX(COALESCE(a.updated_at, p.planned_at)) AS since
    FROM main.item_plans p LEFT JOIN fix_attempts a ON a.repo = p.repo AND a.number = p.number
    WHERE p.kind = 'issue' AND p.wait IN (?, ?) GROUP BY p.repo ORDER BY n DESC, p.repo`).all(fixStoppedWait("skipped"), fixStoppedWait("failed")) as { repo: string; n: number; since: string | null }[];
  for (const g of groups) {
    if (isHiddenRepo(hidden, g.repo)) continue;
    out.push({ id: `fixes:${g.repo}`, kind: "fix-group", title: g.repo, reason: `${g.n} issue${g.n === 1 ? "" : "s"} with a stopped fix`, since: g.since, count: g.n, resume: { type: "fixes", repo: g.repo } });
  }
  return out;
}

export const FIXES_PAGE = 25;

const STOP_WORDS: Record<string, string> = { skipped: "was skipped", failed: "failed" };

/** One page of a repo's issues with a stopped fix: higher priority first (unprioritized last), then the newest stop, then the number. The cursor is the last row's `score|since|number`. */
export async function fixes(db: DatabaseSync, req: Req): Promise<NeedsFixPage> {
  const repo = req.params.repo ?? req.query.get("repo") ?? "";
  if (isHiddenRepo(await hiddenRepos(db, req), repo)) return { rows: [], nextCursor: null };
  const c = req.query.get("cursor");
  const m = c === null ? null : /^(-?\d{1,9})\|([^|]{1,40})\|(\d{1,9})$/.exec(c);
  if (c !== null && !m) throw new HttpError(400, "bad cursor");
  const after = m ? { score: Number(m[1]), since: m[2]!, number: Number(m[3]) } : { score: 2_000_000_000, since: "", number: 0 };
  const rows = db.prepare(`SELECT * FROM (
      SELECT p.number, i.title, a.state, a.reason, a.summary, COALESCE(a.updated_at, p.planned_at) AS since, pr.impact, COALESCE(pr.score, -1) AS score
      FROM main.item_plans p JOIN items i ON i.repo = p.repo AND i.number = p.number
      LEFT JOIN fix_attempts a ON a.repo = p.repo AND a.number = p.number LEFT JOIN item_priority pr ON pr.repo = p.repo AND pr.number = p.number
      WHERE p.repo = ? AND p.kind = 'issue' AND p.wait IN (?, ?))
    WHERE ? = 2000000000 OR score < ? OR (score = ? AND (since < ? OR (since = ? AND number < ?)))
    ORDER BY score DESC, since DESC, number DESC LIMIT ?`).all(repo, fixStoppedWait("skipped"), fixStoppedWait("failed"), after.score, after.score, after.score, after.since, after.since, after.number, FIXES_PAGE + 1) as
    { number: number; title: string | null; state: string | null; reason: string | null; summary: string | null; since: string; impact: string | null; score: number }[];
  const page = rows.slice(0, FIXES_PAGE);
  const last = page[page.length - 1];
  // The attempt's reason and summary are model text: staff only, as on the item page.
  const staff = canSeeInternals(req);
  return {
    rows: page.map((r) => ({ id: `fix:${repo}#${r.number}`, repo, number: r.number, title: r.title ?? "", reason: `The fix attempt ${STOP_WORDS[r.state ?? ""] ?? "stopped"}${staff && (r.reason ?? r.summary) ? `: ${r.reason ?? r.summary}` : ""}`, since: r.since, impact: r.impact })),
    nextCursor: rows.length > FIXES_PAGE && last ? `${last.score}|${last.since}|${last.number}` : null,
  };
}

export async function needs(db: DatabaseSync, req: Req): Promise<NeedsPage> {
  const hidden = await hiddenRepos(db, req);
  const q = req.query;
  const limitRaw = q.get("limit");
  if (limitRaw !== null && !/^\d{1,3}$/.test(limitRaw)) throw new HttpError(400, "limit must be a whole number");
  const limit = Math.min(Math.max(Number(limitRaw ?? NEEDS_PAGE), 1), 100);
  const c = q.get("cursor");
  let cursor: { at: string; id: string } | null = null;
  if (c) {
    const i = c.indexOf("|");
    if (i < 1) throw new HttpError(400, "bad cursor");
    cursor = { at: c.slice(0, i), id: c.slice(i + 1) };
  }
  const fb = feedback(db, hidden, cursor, q.get("feedback") === "1" ? limit : 1, canSeeInternals(req));
  // The same filter as the Needs you list: what this person settles, plus the disputes they resolve; a batch counts only when none of its items is in a hidden repo.
  const dp: Record<string, string> = {};
  const hide = withoutHidden(hidden, dp);
  const decisions = (db.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE ${needingSql(req)}${hide ? ` AND ${hide}` : ""}`).get(dp) as { n: number }).n;
  const rows = await stopped(db, hidden);
  const last = fb.rows[fb.rows.length - 1];
  return {
    counts: { decisions, feedback: fb.unhandled, stopped: rows.length },
    feedback: q.get("feedback") === "1" ? { rows: fb.rows.map((r) => view(db, r)), nextCursor: fb.more && last ? `${last.at}|${last.id}` : null } : null,
    stopped: rows,
  };
}
