// Go-live gate: run on a COPY of the production database.
//   node scripts/golive-gate.ts <db-file> [--decisions 300] [--keep]
// (a) plans every item with the current code and runs the liveness check (must find no stuck item);
// (b) replays a team-sized day on a scratch copy without GitHub or model calls: 12 maintainers and 1 operator answer open decisions in
//     priority order through the dashboard path and the card path, with disputes and concurrent answers on one question; the Act step runs
//     with a fake GitHub that checks the write invariants. (The merge step is not replayed.)
// Exit code 1 when an item is stuck or an invariant broke. Deterministic: nothing random, no clock in any choice.
import { copyFileSync, existsSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { runAct } from "../src/act/index.ts";
import { setCommentApproval } from "../src/act/approval.ts";
import { clearDispute, openDispute } from "../src/answers/hold.ts";
import { writeEffect } from "../src/act/index.ts";
import { doCard } from "../src/conversations/act.ts";
import { decisionStamp } from "../src/conversations/cards.ts";
import { ConversationError } from "../src/conversations/store.ts";
import { loadPlanSet } from "../src/core/plan-set.ts";
import { writePlanCache } from "../src/core/plan-cache.ts";
import { applyAnswer } from "../src/dash/api/decisions.ts";
import { HttpError } from "../src/dash/server/util.ts";
import { connect } from "../src/db.ts";
import { BACKLOG, getDecision, isBatch, optionsOf, type DecisionRow } from "../src/decisions.ts";
import { textsFor, textsHash } from "../src/dupes/texts.ts";
import { computeLiveness, printReport, refreshLiveness } from "../src/liveness.ts";
import type { Querier } from "../src/mirror.ts";
import { pipelineRepos } from "../src/pilot.ts";
import { MAINTAINER_WRITES_KEY, canSettleCached } from "../src/settlers.ts";

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--decisions");
const flag = (name: string, dflt: number): number => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : dflt; };
if (!src) { console.error("usage: golive-gate.ts <db-file> [--decisions N]"); process.exit(2); }
const WANT = flag("--decisions", 300);
const WRITES_BEFORE_LIMIT = 60;

const work = `${src}.gate`;
for (const ext of ["", "-wal", "-shm"]) rmSync(work + ext, { force: true });
for (const ext of ["", "-wal", "-shm"]) if (existsSync(src + ext)) copyFileSync(src + ext, work + ext);
const db: DatabaseSync = connect(work);
console.log(`gate copy: ${work}`);

const planPass = (): void => { writePlanCache(db, loadPlanSet(db)); };

// ---- (a) liveness on current data
planPass();
const before = computeLiveness(db);
console.log("\n== liveness before the replay ==");
printReport({ ...before, items: before.items.slice(0, 40) });
if (before.items.length > 40) console.log(`  ... ${before.items.length - 40} more`);

// ---- (b) replay
const OPERATOR = "gate-op";
const users = [OPERATOR, ...Array.from({ length: 12 }, (_, i) => `gate-m${i + 1}`)];
for (const u of users) db.prepare("INSERT OR REPLACE INTO access (login, role) VALUES (?, ?)").run(u, u === OPERATOR ? "operator" : "maintainer");
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(MAINTAINER_WRITES_KEY);

const on = [...pipelineRepos(db)].sort();
for (const r of on) { try { setCommentApproval(db, OPERATOR, r, true); } catch { /* repo not tracked */ } }

// Fake GitHub: records writes and checks the invariants at the moment of each write.
type Mode = "card" | "act";
const ctx: { mode: Mode } = { mode: "act" };
const violations: string[] = [];
const writes: { kind: string; ref: string; mode: Mode }[] = [];
const refOf = (id: string): { repo: string; number: number } | null => { const m = /^(.+)#(\d+)$/.exec(id); return m ? { repo: m[1]!, number: Number(m[2]) } : null; };
function checkWrite(kind: string, id: string): void {
  const r = refOf(id);
  if (!r) return;
  writes.push({ kind, ref: id, mode: ctx.mode });
  const locked = !!db.prepare("SELECT 1 FROM decisions WHERE repo = ? AND number = ? AND exec_state = 'settling' AND answer IS NULL").get(r.repo, r.number);
  const disputed = !!db.prepare("SELECT 1 FROM decisions WHERE repo = ? AND number = ? AND exec_state = 'disputed' AND answer IS NOT NULL AND applied_at IS NULL").get(r.repo, r.number);
  const answered = !!db.prepare("SELECT 1 FROM decisions WHERE repo = ? AND number = ? AND answer IS NOT NULL AND exec_state IS NOT 'disputed'").get(r.repo, r.number);
  if (!locked && disputed) violations.push(`write after dispute: ${kind} on ${id}`);
  else if (!locked && !answered) violations.push(`write without lock or answer: ${kind} on ${id}`);
}
const querier = {
  spent: 0, remaining: 5000,
  async query(q: string, v: Record<string, unknown>) {
    if (q.includes("collaborators")) return { repository: { collaborators: { edges: [{ permission: "WRITE", node: { login: String(v.login) } }] } } };
    if (q.startsWith("mutation")) {
      const id = String(v.id ?? "");
      checkWrite(q.includes("addComment") ? "comment" : q.includes("close") ? "close" : "write", id);
      return q.includes("addComment") ? { addComment: { commentEdge: { node: { url: `https://x.test/${id}` } } } } : {};
    }
    if (q.includes("issueOrPullRequest")) {
      // GitHub agrees with the mirror: a PR keeps the head the database holds.
      const it = db.prepare("SELECT kind, head_oid FROM items WHERE repo = ? AND number = ?").get(String(v.name), Number(v.n)) as { kind: string; head_oid: string | null } | undefined;
      const id = `${v.name}#${v.n}`;
      return { repository: { issueOrPullRequest: it?.kind === "pr" ? { __typename: "PullRequest", id, state: "OPEN", headRefOid: it.head_oid } : { __typename: "Issue", id, state: "OPEN" } } };
    }
    if (q.includes("viewer")) return { viewer: { login: "pipeline-bot", id: "U1" } };
    return { repository: {} };
  },
} as unknown as Querier;
const deps = { querier, now: () => new Date() };

// The day's decisions, highest priority first.
const LEVEL = `CASE WHEN p.score IS NULL THEN 0 ELSE p.score END`;
const open = db.prepare(`SELECT d.id FROM decisions d LEFT JOIN item_priority p ON p.repo = d.repo AND p.number = d.number
  WHERE d.answer IS NULL AND d.number IS NOT NULL AND d.repo IN (${on.map(() => "?").join(",") || "''"}) AND d.id NOT LIKE '%~replaced-%'
  ORDER BY ${LEVEL} DESC, d.asked_at, d.id LIMIT ?`).all(...on, WANT) as { id: string }[];
const pick = (d: DecisionRow): string => {
  const keys = optionsOf(d).map((o) => o.key).filter((k) => k !== BACKLOG.key);
  return d.recommended && keys.includes(d.recommended) ? d.recommended : keys[0] ?? BACKLOG.key;
};

const used = (db.prepare("SELECT COUNT(*) AS n FROM actions WHERE substr(created_at, 1, 10) = ?").get(new Date().toISOString().slice(0, 10)) as { n: number }).n;
db.prepare("INSERT OR REPLACE INTO stage_limits (step, per_day) VALUES ('act', ?)").run(used + WRITES_BEFORE_LIMIT);

const stat = { superseded: 0, operatorFallback: 0, dashboard: 0, card: 0, applied: 0, queuedLimit: 0, refusedLock: 0, conflicts: 0, disputes: 0, otherRefused: [] as string[] };
const isLock = (m: string) => /is applying their answer|waits for the daily GitHub write limit/.test(m);
const isTaken = (m: string) => /already answered|answered this a moment ago|no longer open|decision changed/.test(m);
const disputed: string[] = [];

function dashboard(d: DecisionRow, u: string, opt: string): void {
  const body: Record<string, unknown> = { answer: opt };
  if (d.kind === "duplicate" && d.id.includes(":dupegroup:")) { const t = textsFor(db, d.id, opt); if (t.length) body.textsHash = textsHash(t); }
  try {
    applyAnswer(db, d, u, body, "dashboard");
    stat.applied++; stat.dashboard++;
  } catch (e) {
    const m = (e as Error).message;
    if (e instanceof HttpError && isLock(m)) stat.refusedLock++;
    else if (isTaken(m)) stat.conflicts++;
    else stat.otherRefused.push(`${d.id}: ${m.slice(0, 100)}`);
  }
}

for (const [i, row] of open.entries()) {
  const d = getDecision(db, row.id)!;
  // A maintainer answers only where the dashboard would let them settle; otherwise the operator does.
  const want = users[i % users.length]!;
  const u = want === OPERATOR || canSettleCached(db, want, "maintainer", [d.repo!]) ? want : OPERATOR;
  if (u !== want) stat.operatorFallback++;
  const other = users[(i + 5) % users.length]!;
  const opt = pick(d);
  const cardable = i % 3 === 0 && !isBatch(d) && !d.id.includes(":dupegroup:") && opt !== BACKLOG.key;
  if (cardable) {
    const params = { kind: "resolution", steps: [{ kind: "comment" }], settle: { kind: "answer", decision: d.id, option: opt, stamp: decisionStamp(db, d) } };
    const card = Number(db.prepare("INSERT INTO conversation_cards (turn_id, repo, number, kind, params, text, description) VALUES (0, ?, ?, 'resolution', ?, 'Noted.', 'gate card')").run(d.repo, d.number, JSON.stringify(params)).lastInsertRowid);
    let release!: () => void;
    const gate = new Promise<boolean>((r) => { release = () => r(true); });
    const concurrent = i % 9 === 0;
    ctx.mode = "card";
    const running = doCard(db, card, u, { ...deps, canWrite: () => (concurrent ? gate : Promise.resolve(true)), role: db.prepare("SELECT role FROM access WHERE login = ?").get(u) ? "maintainer" : "operator" } as never);
    if (concurrent) {
      // Let the press claim the decision first.
      for (let k = 0; k < 400 && (db.prepare("SELECT state FROM conversation_cards WHERE id = ?").get(card) as { state: string }).state === "proposed"; k++) await new Promise((r) => setTimeout(r, 5));
      // Another person answers the same question while the first press is in flight.
      dashboard(getDecision(db, d.id)!, other, opt);
      release();
    }
    try {
      const r = await running;
      stat.card++;
      if (r.card.state === "done") stat.applied++;
      else if (r.card.state === "queued") stat.queuedLimit++;
      else if (r.card.state === "replaced" && concurrent) stat.superseded++;
      else stat.otherRefused.push(`${d.id}: card ${r.card.state} ${r.card.error ?? ""} ${concurrent ? "(concurrent)" : ""} ${other}`.slice(0, 160));
    } catch (e) {
      const m = (e as Error).message;
      if (e instanceof ConversationError && isLock(m)) stat.refusedLock++;
      else if (isTaken(m)) stat.conflicts++;
      else stat.otherRefused.push(`${d.id}: ${m.slice(0, 100)}`);
    }
    ctx.mode = "act";
  } else {
    dashboard(d, u, opt);
    const now = getDecision(db, d.id)!;
    if (i % 7 === 2 && now.answer && writeEffect(now.kind, now.answer) && openDispute(db, d.id, other, "gate dispute", new Date().toISOString())) { stat.disputes++; disputed.push(d.id); }
  }
}

// Every second dispute is kept (cleared); the rest stay disputed through the Act step.
for (const [i, id] of disputed.entries()) if (i % 2 === 0) clearDispute(db, id);

// End of day: the limit is lifted and the Act step carries out queued presses and answered decisions, per repo, with the fake GitHub.
db.prepare("UPDATE stage_limits SET per_day = NULL WHERE step = 'act'").run();
ctx.mode = "act";
const actFailures: string[] = [];
for (const repo of on) {
  try {
    const s = await runAct(db, { repo, dryRun: false }, () => {}, deps as never);
    for (const f of s.failed ?? []) actFailures.push(`${repo}: ${JSON.stringify(f).slice(0, 120)}`);
  } catch (e) { actFailures.push(`${repo}: ${(e as Error).message.slice(0, 120)}`); }
}

// Invariants on the stored result.
const dupAnswers = db.prepare("SELECT target, COUNT(*) AS n FROM audit WHERE action = 'answer' AND login LIKE 'gate-%' GROUP BY target HAVING n > 1").all() as { target: string; n: number }[];
for (const r of dupAnswers) violations.push(`two answers on one question: ${r.target} (${r.n})`);
const stillQueued = (db.prepare("SELECT COUNT(*) AS n FROM conversation_cards WHERE state = 'queued'").get() as { n: number }).n;
const stillLocked = (db.prepare("SELECT COUNT(*) AS n FROM decisions WHERE exec_state = 'settling' AND answer IS NULL").get() as { n: number }).n;
if (stillLocked > 0 && stillQueued === 0) violations.push(`${stillLocked} decisions still locked with no card running or queued`);
const heldDisputed = (db.prepare("SELECT COUNT(*) AS n FROM decisions WHERE exec_state = 'disputed' AND answer IS NOT NULL AND applied_at IS NULL").get() as { n: number }).n;

// Plan again with the answers in and check liveness once more.
planPass();
const after = computeLiveness(db);
refreshLiveness(db, Date.now(), true);

console.log("\n== replay ==");
console.log(`decisions in the day: ${open.length}; users: ${users.length} (1 operator, 12 maintainers)`);
console.log(`answers by the operator because the maintainer may not settle that repo: ${stat.operatorFallback}`);
console.log(`answers applied: ${stat.applied} (dashboard ${stat.dashboard}, card ${stat.card - stat.queuedLimit - 0})`);
console.log(`queued behind the daily limit: ${stat.queuedLimit} (still queued after the Act step: ${stillQueued})`);
console.log(`refused by the lock (concurrent answer): ${stat.refusedLock}; answered by someone else first: ${stat.conflicts}; press superseded by the concurrent answer: ${stat.superseded}`);
console.log(`disputes opened: ${stat.disputes}; still disputed at the end: ${heldDisputed}`);
console.log(`fake GitHub writes: ${writes.length} (${writes.filter((w) => w.mode === "card").length} from cards)`);
if (stat.otherRefused.length) { console.log(`other refusals: ${stat.otherRefused.length}`); for (const m of stat.otherRefused.slice(0, 15)) console.log(`  ${m}`); }
if (actFailures.length) { console.log(`act failures: ${actFailures.length}`); for (const m of actFailures.slice(0, 10)) console.log(`  ${m}`); }
console.log(`invariants broken: ${violations.length}`);
for (const v of violations.slice(0, 20)) console.log(`  ${v}`);
console.log("\n== liveness after the replay ==");
printReport({ ...after, items: after.items.slice(0, 40) });
if (after.items.length > 40) console.log(`  ... ${after.items.length - 40} more`);

process.exit(before.stuck > 0 || after.stuck > 0 || violations.length > 0 ? 1 : 0);
