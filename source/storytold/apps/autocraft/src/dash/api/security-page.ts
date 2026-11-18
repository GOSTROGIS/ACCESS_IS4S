// The Security list and the finding page. Staff only; everyone else gets 404, as the other security endpoints do. A
// finding's open question is built here from its state (never stored as a decision), and answers go to
// `POST /api/security/findings/:repo/:n`.
import type { DatabaseSync } from "node:sqlite";
import type { ChoiceCore, Decision, DecisionChoices, FindingAction, FindingSeverity, FindingState, FindingView } from "../../../web/src/api/types.ts";
import { FIX_ROUNDS } from "../../security/rules.ts";
import { sumReportedCosts } from "../../security/costs.ts";
import { findingRow, INTERNAL_FINDING_STATES, reconcileFindings, toFinding, type FindingRow as StoredFinding } from "../../security/store.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { canSeeInternals } from "./staff.ts";
import { needVisible, visibleRepos } from "./visible.ts";

export type ItemPhase = "Triage" | "Waiting for a person" | "Review" | "Fixing" | "Verifying" | "In queue" | "Merged" | "Closed" | "Held" | "Out of scope";
export interface ItemStatus { phase: ItemPhase; waiting: string | null; next: string | null; since: string }
export interface FindingRow { repo: string; number: number; title: string; severity: FindingSeverity; state: FindingState; urgent: boolean; area: string; status: ItemStatus; attempts: number; updatedAt: string }
export type SecurityGroup = "Needs a person" | "Fixing" | "Ready to land" | "Landing" | "Landed or published" | "Dismissed or backlog";
export interface SecurityList { groups: { group: SecurityGroup; rows: FindingRow[] }[] }
export interface HistoryEntry { id: string; at: string; step: string; outcome: string; model: string | null; costUsd: number | null; kind: "model" | "write" | "decision" | "event"; calls: { label: string; kind: "model" | "tool"; costUsd: number | null }[]; writeId: string | null }
export interface FixRound { round: number; outcome: "passed" | "failed"; why: string; at: string; costUsd: number | null }
export interface FindingPageData { finding: FindingView; decision: Decision | null; choices: DecisionChoices | null; status: ItemStatus; attempts: number; rounds: FixRound[]; history: HistoryEntry[]; costUsd: number | null }

const GROUPS: SecurityGroup[] = ["Needs a person", "Fixing", "Ready to land", "Landing", "Landed or published", "Dismissed or backlog"];
const GROUP: Record<FindingState, SecurityGroup> = {
  new: "Needs a person", "awaiting-admin": "Needs a person", ready: "Ready to land", fixing: "Fixing", landing: "Landing",
  landed: "Landed or published", advisory: "Landed or published", published: "Landed or published", dismissed: "Dismissed or backlog", backlog: "Dismissed or backlog",
};
const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const HIDDEN = INTERNAL_FINDING_STATES.map((s) => `'${s}'`).join(", ");

const NOT_FOUND = "not found";
function needStaff(req: Req): void {
  if (!canSeeInternals(req)) throw new HttpError(404, NOT_FOUND);
}

/** The status line of a finding. `rounds` is the number of rounds the last fix attempt ran, or the round now building. */
export function findingStatus(state: FindingState, note: string | null, attempts: number, lastFailure: string | null, since: string, rounds: number | null = null): ItemStatus {
  const at = (phase: ItemPhase, waiting: string | null, next: string | null): ItemStatus => ({ phase, waiting, next, since });
  switch (state) {
    case "new":
      if (attempts > 0) {
        const why = lastFailure ?? note;
        return at("Waiting for a person", `a decision: fix failed after ${rounds ?? FIX_ROUNDS} rounds${why ? `, ${why}` : ""}`, "Fix again with a note, Backlog or Dismiss");
      }
      return at("Waiting for a person", "a decision to fix", "Fix opens a private fix");
    case "fixing": return at("Fixing", rounds ? `round ${rounds} of ${FIX_ROUNDS} building` : "the fix rounds", "Opus review of the patch");
    case "ready": return at("Waiting for a person", "Land or an advisory", "Land opens a quiet pull request");
    case "landing": return at("In queue", "the pull request's checks", "merge by rule");
    case "awaiting-admin": return at("Waiting for a person", "a repository admin", "publish the advisory");
    case "backlog": return at("Held", null, null);
    default: return at("Closed", null, null);
  }
}

/** The actions a finding offers in its state; an urgent finding lists the advisory route first. */
export function findingActions(f: { state: FindingState; urgent: boolean }): FindingAction[] {
  switch (f.state) {
    case "new": return ["fix", "dismiss", "backlog"];
    case "backlog": return ["fix", "dismiss"];
    case "dismissed": return ["reopen"];
    case "ready": return f.urgent ? ["advisory", "land", "dismiss"] : ["land", "advisory", "dismiss"];
    case "awaiting-admin": return ["advisory", "land", "dismiss"];
    case "landed":
    case "advisory": return ["publish"];
    default: return [];
  }
}

const CORE: Record<FindingAction, { label: string; autocraft: string; writes: ChoiceCore["writes"] }> = {
  fix: { label: "Fix", autocraft: "starts a private fix, up to three rounds", writes: [] },
  dismiss: { label: "Dismiss", autocraft: "closes the finding with your reason", writes: [] },
  backlog: { label: "Backlog", autocraft: "keeps it for later", writes: [] },
  reopen: { label: "Reopen", autocraft: "puts it back to a decision", writes: [] },
  land: { label: "Land", autocraft: "opens a quiet pull request with the fix", writes: ["push"] },
  advisory: { label: "Advisory", autocraft: "opens a private fix in a security advisory", writes: [] },
  publish: { label: "Publish", autocraft: "publishes the advisory", writes: [] },
};

type LogRound = { attempt: number; round: number; state: string; failure: string | null; created_at: string; ended_at: string };
type LiveRound = { round: number; state: string; failure: string | null; created_at: string };

const logRounds = (db: DatabaseSync, repo: string, n: number): LogRound[] =>
  db.prepare("SELECT attempt, round, state, failure, created_at, ended_at FROM security_fix_log WHERE repo = ? AND number = ? ORDER BY attempt, round").all(repo, n) as LogRound[];
const liveRounds = (db: DatabaseSync, repo: string, n: number): LiveRound[] =>
  db.prepare("SELECT round, state, failure, created_at FROM security_fix_rounds WHERE repo = ? AND number = ? ORDER BY round").all(repo, n) as LiveRound[];

/** Rounds the last attempt ran, from the log; null when the log has none. */
function lastAttemptRounds(log: LogRound[]): number | null {
  if (!log.length) return null;
  const last = log[log.length - 1]!.attempt;
  return log.filter((r) => r.attempt === last).length;
}

function rowOf(r: StoredFinding, log: LogRound[], live: LiveRound[]): FindingRow {
  const building = live.find((l) => l.state === "building");
  const rounds = r.state === "fixing" ? (building?.round ?? null) : lastAttemptRounds(log.filter((l) => l.attempt === r.fix_attempts));
  return {
    repo: r.repo, number: r.number, title: r.title, severity: r.severity, state: r.state, urgent: r.urgent === 1, area: r.area,
    status: findingStatus(r.state, r.note, r.fix_attempts, r.last_failure, r.updated_at, rounds), attempts: r.fix_attempts, updatedAt: r.updated_at,
  };
}

/** Findings of the repos the reader can see, grouped by what they wait for; most severe first. */
export async function securityFindings(db: DatabaseSync, req: Req): Promise<SecurityList> {
  needStaff(req);
  const repos = await visibleRepos(db, req);
  const rows: FindingRow[] = [];
  for (const repo of repos) {
    reconcileFindings(db, repo);
    const stored = db.prepare(`SELECT * FROM security_findings WHERE repo = ? AND state NOT IN (${HIDDEN})`).all(repo) as StoredFinding[];
    for (const r of stored) rows.push(rowOf(r, logRounds(db, r.repo, r.number), liveRounds(db, r.repo, r.number)));
  }
  const byRank = (a: FindingRow, b: FindingRow) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.repo.localeCompare(b.repo) || a.number - b.number;
  return { groups: GROUPS.map((group) => ({ group, rows: rows.filter((r) => GROUP[r.state] === group).sort(byRank) })).filter((g) => g.rows.length) };
}

const STEP: Record<string, string> = { area: "Area scan", verify: "Verification", test: "Scan test", model: "Threat model", fix: "Fix", review: "Fix review", duplicate: "Found again" };

function history(f: FindingView): HistoryEntry[] {
  return f.timeline.map((c, i) => ({
    id: `t${i}`, at: c.at, step: STEP[c.kind] ?? c.kind, outcome: c.kind === "duplicate" ? "seen again" : c.ok ? "done" : "failed",
    model: null, costUsd: c.costUsd, kind: c.kind === "duplicate" ? "event" : "model", calls: [], writeId: null,
  }));
}

/** Rounds of every fix attempt, oldest first. A round's cost is that of the fix and review calls made while it ran. */
function rounds(f: FindingView, log: LogRound[], live: LiveRound[]): FixRound[] {
  const calls = f.timeline.filter((c) => c.kind === "fix" || c.kind === "review");
  const cost = (from: string, to: string | null) => sumReportedCosts(calls.filter((c) => c.at >= from && (to === null || c.at <= to)).map((c) => c.costUsd));
  const out: FixRound[] = log.map((r) => ({
    round: r.round, outcome: r.state === "passed" ? "passed" : "failed", why: r.failure ?? (r.state === "building" ? "cut short" : ""), at: r.ended_at, costUsd: cost(r.created_at, r.ended_at),
  }));
  for (const r of live) if (r.state !== "building") out.push({ round: r.round, outcome: r.state === "passed" ? "passed" : "failed", why: r.failure ?? "", at: r.created_at, costUsd: cost(r.created_at, null) });
  return out;
}

/** The finding's open question in the shape decisions use, built from its state. The recommendation stays empty: no model gives one. */
function synthesize(f: FindingView, row: StoredFinding, status: ItemStatus, rounds: number | null, canSettle: boolean): { decision: Decision | null; choices: DecisionChoices | null } {
  const actions = findingActions({ state: f.state, urgent: f.urgent });
  if (!actions.length) return { decision: null, choices: null };
  const again = f.state === "new" && row.fix_attempts > 0;
  const id = `${f.repo}:finding:${f.number}:security`;
  const question = again ? `The fix gave up after ${rounds ?? FIX_ROUNDS} rounds. What next?` : f.state === "ready" ? "How should the fix land?" : "What should happen to this finding?";
  const decision: Decision = {
    id, kind: "other", repo: f.repo, number: f.number, items: [], shown: null, title: f.title, question, summary: "", summaryBy: "", summaryAt: f.updatedAt, body: null, context: [], facts: [status.waiting ?? ""].filter(Boolean),
    options: actions.map((a) => ({ key: a, label: a === "fix" && again ? "Fix again with a note" : CORE[a].label })), recommended: "", recommendedReason: "", group: [], risks: [], undoable: false, canSettle, preparing: false, snoozed: null,
    publicText: null, optionTexts: [], askedAt: f.updatedAt, askedBy: "autocraft", docket: null, answer: null, answerNote: null, answeredBy: null, answeredAt: null, appliedAt: null, exec: null, adoptedOpinion: null,
    opinions: [], exceptions: [], claim: null, commentCount: 0, related: [], classifications: [],
  };
  const cores: ChoiceCore[] = actions.map((a) => ({
    key: a === "backlog" ? "backlog" : `o:${a}`, label: a === "fix" && again ? "Fix again with a note" : CORE[a].label, autocraft: CORE[a].autocraft, writes: CORE[a].writes, drafted: false, extras: [],
    ...(a === "dismiss" ? { params: { reason: "" } } : {}),
  }));
  return { decision, choices: { id: `ch-f-${f.repo}-${f.number}-${f.state}`, decisionId: id, pick: null, cores, source: "prepare", at: f.updatedAt } };
}

export async function findingPage(db: DatabaseSync, req: Req): Promise<FindingPageData> {
  needStaff(req);
  const repo = req.params.repo!;
  await needVisible(db, req, repo);
  reconcileFindings(db, repo);
  const n = Number(req.params.n);
  const stored = Number.isInteger(n) ? findingRow(db, repo, n) : undefined;
  if (!stored) throw new HttpError(404, NOT_FOUND);
  const finding = toFinding(db, stored);
  const log = logRounds(db, repo, n);
  const live = liveRounds(db, repo, n);
  const row = rowOf(stored, log, live);
  const { decision, choices } = synthesize(finding, stored, row.status, lastAttemptRounds(log.filter((l) => l.attempt === stored.fix_attempts)), req.user.role === "operator");
  return {
    finding, decision, choices, status: row.status, attempts: stored.fix_attempts, rounds: rounds(finding, log, live), history: history(finding),
    costUsd: sumReportedCosts(finding.timeline.filter((c) => c.kind !== "duplicate").map((c) => c.costUsd)),
  };
}
