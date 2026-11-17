// Facts of open items (issues and PRs) for the triage steps: classification, priority, embedding, duplicates, scope decision, labels.
// Loaded in one pass for a whole database or a slice. Reads only: the old selectors fill missing text hashes in the database on the way; here a missing hash is computed.
import { settleMemo, settledBy } from "../settlers.ts";
import { groupClosersPending } from "../act/dupe-groups.ts";
import { pipelineWrites } from "./rules.ts";
import { assignmentsOf, ownFixPrs } from "./facts.ts";
import { activeTrips } from "../push-outcomes.ts";
import type { DatabaseSync } from "node:sqlite";
import { notOwnIntegrationSql, groupHeldSql, backlogHeldSql } from "../dupes/held.ts";
import { FAST_FLOOR, fastScoreSql } from "../fasttrack.ts";
import { latestRun, needsDecisionOf, refereeClosed, securityOf, settle, topOf, SURE, type Referee } from "../classify/settled.ts";
import { JEV_FLAG_NO, JEV_NEEDS_DECISION_YES, JEV_SECURITY_YES } from "../classify/parse.ts";
import { answersToApply, groupsToAsk } from "../dupes/decide.ts";
import { uncheckedPairs } from "../dupes/check.ts";
import { dueSets } from "../dupes/plan.ts";
import { embedderId, modelName } from "../embed/model.ts";
import { classifyHash, embedHash as hashOfText, SCHEME_ID } from "../itemhash.ts";
import { actionable } from "../decisions.ts";
import { commentApprovalOf } from "../act/approval.ts";
import { TERMINAL } from "../build/tasks.ts";
import { fixIssueApprovalOf } from "../fixissue/approval.ts";
import { issuesWithOpenPr, type OpenPr, notRustKey, textHash } from "../fixissue/candidates.ts";
import { headOf, scopeAnswers, unsettledScope } from "../review/candidates.ts";
import { approvalOf as labelsApprovalOf } from "../labels/approval.ts";
import { pilotSql } from "../pilot.ts";
import { holdMap } from "../outside.ts";
import { lockLiveSql } from "../answers/hold.ts";
import { isPreparing, prepareStateSql, utcDayStart, type PrepareColumns } from "../decide/prepared.ts";
import type { ItemFacts } from "./plan.ts";

export type { ItemFacts } from "./plan.ts";

export type ItemLoadOptions = {
  repo?: string;
  /** Only these items, as "repo#number". */
  refs?: Iterable<string>;
  /** Decision time in ms (default: the clock). */
  now?: number;
  /** The embedding model whose vectors count (default: the configured one). */
  model?: string;
  /** The classification run (default: latestRun, the current run else the newest verdict run). */
  run?: string | null;
};

type Row = {
  repo: string; number: number; kind: "pr" | "issue"; state: string; title: string | null; assignees: string | null; is_draft: number | null; updated_at: string | null; labels: string | null;
  embed_hash: string | null; class_hash: string | null; class_scheme: string | null; score: number | null;
  in_pilot: number; not_integration: number; held_backlog: number; held_dup: number;
  pr_hash: string | null; e_hash: string | null; scan_hash: string | null; stage: string | null; impact: string | null;
  a_state: string | null; a_pr: string | null; a_hash: string | null; a_head: string | null; a_base: string | null; h_state: string | null; b_state: string | null;
};

const SELECT = `SELECT i.repo, i.number, i.kind, i.state, i.title, i.assignees, i.is_draft, i.updated_at, i.labels, i.embed_hash, i.class_hash, i.class_scheme,
    ${fastScoreSql("i.repo", "i.number", "r.score")} AS score,
    ${pilotSql("i")} AS in_pilot, ${notOwnIntegrationSql("i")} AS not_integration, ${backlogHeldSql("i")} AS held_backlog,
    (EXISTS (SELECT 1 FROM decisions dh WHERE dh.kind = 'duplicate' AND dh.id NOT LIKE '%:dupegroup:%' AND dh.repo = i.repo AND dh.number = i.number AND (dh.answer IS NULL OR dh.answer = 'close'))
      OR ${groupHeldSql("i")}) AS held_dup,
    p.text_hash AS pr_hash, p.impact, e.hash AS e_hash, s.hash AS scan_hash, st.stage,
    fa.state AS a_state, fa.pr_url AS a_pr, fa.text_hash AS a_hash, fa.head_task_id AS a_head, fa.base_task_id AS a_base, ht.state AS h_state, bt.state AS b_state
  FROM items i JOIN tracked_repos t ON t.name = i.repo
  LEFT JOIN item_rank r ON r.repo = i.repo AND r.number = i.number
  LEFT JOIN item_priority p ON p.repo = i.repo AND p.number = i.number
  LEFT JOIN item_embeddings e ON e.repo = i.repo AND e.number = i.number AND e.model = :model
  LEFT JOIN duplicate_scans s ON s.repo = i.repo AND s.number = i.number
  LEFT JOIN item_stage st ON st.repo = i.repo AND st.number = i.number
  LEFT JOIN fix_attempts fa ON fa.repo = i.repo AND fa.number = i.number
  LEFT JOIN build_tasks ht ON ht.id = fa.head_task_id LEFT JOIN build_tasks bt ON bt.id = fa.base_task_id
  WHERE (i.state = 'OPEN' OR i.repo || '#' || i.number IN (SELECT value FROM json_each(:closing)))`;

/** `asked_by` of the decisions a security scan asks (act/index.ts SECURITY_ASKER). */
const SECURITY_ASKER = "security-scan";
/** Kind of the actions row Act writes for a comment-and-close. */
const ACT_KIND = "comment-close";

const json = <T>(s: string | null, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const flagsOf = (s: string | null): string[] => { const f = json<unknown>(s, []); return Array.isArray(f) ? f.filter((x): x is string => typeof x === "string") : []; };
const refsOf = (d: { repo: string | null; number: number | null; items: string | null }): string[] =>
  d.number !== null ? [`${d.repo}#${d.number}`] : json<{ repo: string; number: number }[]>(d.items, []).map((r) => `${r.repo}#${r.number}`);

type Cls = { classifier: string; at: string; type_label: string; flags: string | null; probs: string | null; input_hash: string | null };

/** Facts of every open item (issue or PR) of the tracked repos, for the database, repo or refs given. */
export function loadItemFacts(db: DatabaseSync, opts: ItemLoadOptions = {}): ItemFacts[] {
  const now = opts.now ?? Date.now();
  const model = opts.model ?? embedderId(modelName());
  const pipelineOn = pipelineWrites((db.prepare("SELECT value FROM main.settings WHERE key = 'pipeline_enabled'").get() as { value: string } | undefined)?.value);

  // Values read once for all items.
  const run = opts.run !== undefined ? opts.run : latestRun(db);
  const byItem = new Map<string, Cls[]>();
  if (run) {
    for (const c of db.prepare("SELECT repo, number, classifier, at, type_label, flags, probs, input_hash FROM classifications WHERE run_id = ?").all(run) as (Cls & { repo: string; number: number })[]) {
      const k = `${c.repo}#${c.number}`;
      (byItem.get(k) ?? byItem.set(k, []).get(k)!).push(c);
    }
  }
  const memo = settleMemo();
  const outsideHolds = holdMap(db);
  const answers = scopeAnswers(db);
  const operatorAnswers = scopeAnswers(db, true);
  const unsettled = unsettledScope(db);
  const latestScope = new Map<string, { answer: string | null; byOperator: boolean }>(), securityIds = new Set<string>();
  const head = db.prepare("SELECT kind, head_oid FROM items WHERE repo = ? AND number = ?");
  const openScope = new Set<string>(), covered = new Set<string>(), recommend = new Map<string, { failures: number; failedAt: string | null }>();
  for (const d of db.prepare(`SELECT id, kind, repo, number, items, answer, answered_by, asked_by, prepared_at, prepared_head, prepare_failed_head, recommend_failures, recommend_failed_at, prepared_discussion, prepare_requested_at, ${prepareStateSql("decisions")}, ${lockLiveSql("decisions")} AS locked FROM decisions ORDER BY asked_at, id`).all(utcDayStart(now)) as
    (PrepareColumns & { locked: number; id: string; kind: string; answered_by: string | null; asked_by: string | null; repo: string | null; number: number | null; items: string | null; answer: string | null })[]) {
    const dupegroup = d.id.includes(":dupegroup:");
    if (d.kind === "scope" && d.number !== null && !(d.answer === "withdrawn" && d.answered_by === "pipeline")) latestScope.set(`${d.repo}#${d.number}`, { answer: d.answer, byOperator: settledBy(db, d, memo) });
    if (d.asked_by === SECURITY_ASKER) securityIds.add(d.id);
    if (d.kind === "scope" && d.answer === null) {
      for (const r of refsOf(d)) openScope.add(r);
    }
    // Any open decision of one item that the prepare step has not covered at the item's current head (the item's fewest failed tries win).
    if (d.answer === null && d.number !== null) {
      const k = `${d.repo}#${d.number}`;
      const it = head.get(d.repo, d.number) as { kind: string; head_oid: string | null } | undefined;
      const h = it?.kind === "pr" ? it.head_oid : null;
      // A decision whose press is running or queued is locked and not prepared.
      if (isPreparing(d, h) && !d.locked) {
        const failures = (d.prepare_failed_head ?? null) === h ? d.recommend_failures ?? 0 : 0;
        if (failures < (recommend.get(k)?.failures ?? Infinity)) recommend.set(k, { failures, failedAt: failures ? d.recommend_failed_at : null });
      }
    }
    // A question the pipeline withdrew (its item closed) does not cover the item: if it reopens, it is asked again.
    const withdrawn = d.answer === "withdrawn" && d.answered_by === "pipeline";
    // A maintainer's scope answer that no longer counts (src/settlers.ts) covers nothing: the item needs a decision again.
    const lapsed = d.kind === "scope" && d.answer !== null && refsOf(d).every((r) => unsettled.has(r));
    if ((d.answer === null || d.kind === "scope" || d.answer === "backlog") && (!dupegroup || d.answer === null) && !withdrawn && !lapsed) for (const r of refsOf(d)) covered.add(r);
  }
  const labeled = new Map((db.prepare("SELECT repo, number, note FROM stages WHERE stage = 'labeled' ORDER BY at, rowid").all() as { repo: string; number: number; note: string | null }[])
    .map((s) => [`${s.repo}#${s.number}`, s.note]));
  const own = ownFixPrs(db, opts.repo);
  const assigned = assignmentsOf(db, opts.repo);
  const pairs = new Map<string, number>();
  for (const p of uncheckedPairs(db, -1))
    for (const n of [p.a, p.b]) pairs.set(`${p.repo}#${n}`, (pairs.get(`${p.repo}#${n}`) ?? 0) + 1);
  const dupeAnswers = new Map<string, string[]>();
  for (const a of answersToApply(db)) for (const r of a.refs) (dupeAnswers.get(r) ?? dupeAnswers.set(r, []).get(r)!).push(a.id);
  // Group-level work (which groups to ask about, which sets to compare) is planned per group by dupes/decide.ts and dupes/plan.ts; the items carry its result.
  const inGroup = new Set(groupsToAsk(db, opts.repo).flatMap((g) => g.group.members.map((n) => `${g.repo}#${n}`)));
  const inCompare = new Set(dueSets(db, opts.repo, now).flatMap((s) => s.members.map((m) => `${s.repo}#${m.number}`)));
  const approved = new Map<string, boolean>();
  const labelsApproved = (repo: string) => approved.get(repo) ?? (approved.set(repo, labelsApprovalOf(db, repo) !== null), approved.get(repo)!);
  // Act: answers an operator gave that close an item (decisions.ts actionable, as act/index.ts targetsOf reads them).
  const actionState = new Map((db.prepare("SELECT decision_id, repo, number, state FROM actions WHERE kind = ?").all(ACT_KIND) as { decision_id: string; repo: string; number: number; state: string }[])
    .map((a) => [`${a.decision_id}|${a.repo}#${a.number}`, a.state]));
  const waitingExec = new Set((db.prepare("SELECT id FROM main.decisions WHERE exec_state IN ('waiting-token', 'waiting-permission') AND applied_at IS NULL").all() as { id: string }[]).map((r) => r.id));
  const answeredClose = new Map<string, ItemFacts["answeredClose"]>();
  for (const a of actionable(db)) {
    if (a.kind !== "scope" && a.kind !== "close" && a.kind !== "duplicate" && a.kind !== "merge" && a.kind !== "hold") continue;
    if (a.kind !== "scope" && a.number === null) continue;
    for (const it of a.items) {
      const ex = a.exceptions.find((e) => e.repo === it.repo && e.number === it.number);
      if ((ex ? ex.answer : a.answer) !== "close") continue;
      const k = `${it.repo}#${it.number}`;
      (answeredClose.get(k) ?? answeredClose.set(k, []).get(k)!).push({ decisionId: a.id, kind: a.kind, security: securityIds.has(a.id), action: actionState.get(`${a.id}|${k}`) ?? null, ...(waitingExec.has(a.id) ? { waiting: true } : {}) });
    }
  }
  // Duplicate group answers: the Act step closes the members the group decision names; each member without a close record is a target.
  for (const g of groupClosersPending(db)) {
    if (opts.repo && g.repo !== opts.repo) continue;
    const k = `${g.repo}#${g.number}`;
    (answeredClose.get(k) ?? answeredClose.set(k, []).get(k)!).push({ decisionId: g.decisionId, kind: "duplicate", security: false, action: null, group: true, ...(waitingExec.has(g.decisionId) ? { waiting: true } : {}) });
  }
  // A closed item stays in the facts while an answered close of it is not applied: the Act step records it as already closed.
  const closing = [...answeredClose].filter(([, t]) => t.some((x) => x.action === null || x.action === "failed")).map(([ref]) => ref);
  const params: Record<string, string> = { model, closing: JSON.stringify(closing) };
  let where = "";
  if (opts.repo) { where += " AND i.repo = :repo"; params.repo = opts.repo; }
  if (opts.refs) { where += " AND i.repo || '#' || i.number IN (SELECT value FROM json_each(:refs))"; params.refs = JSON.stringify([...opts.refs]); }
  const rows = db.prepare(`${SELECT}${where} ORDER BY i.repo, i.number`).all(params) as Row[];
  const closeReview = new Map<string, NonNullable<ItemFacts["closeReview"]>>();
  for (const r of db.prepare(`SELECT r.repo, r.number, r.head_oid, i.head_oid AS i_head, i.updated_at, c.head_oid AS c_head, c.fetched_at AS c_at,
      EXISTS (SELECT 1 FROM decisions d WHERE d.id = r.repo || '#' || r.number || ':close@' || r.head_oid) AS asked
    FROM final_reviews r JOIN items i ON i.repo = r.repo AND i.number = r.number AND i.kind = 'pr' AND i.state = 'OPEN'
    LEFT JOIN pr_checks c ON c.repo = r.repo AND c.number = r.number
    WHERE r.verdict = 'close' AND r.head_oid = (SELECT r2.head_oid FROM opus_reviews r2 WHERE r2.repo = r.repo AND r2.number = r.number AND r2.verdict IS NOT NULL ORDER BY r2.at DESC, r2.rowid DESC LIMIT 1)`).all() as
    { repo: string; number: number; head_oid: string; i_head: string | null; updated_at: string | null; c_head: string | null; c_at: string | null; asked: number }[])
    closeReview.set(`${r.repo}#${r.number}`, { head: r.head_oid, atHead: headOf({ head_oid: r.i_head, updated_at: r.updated_at, c_head: r.c_head, c_at: r.c_at }) === r.head_oid, asked: !!r.asked });
  const repoMemo = new Map<string, { comment: boolean; fix: boolean; pub: boolean; notRust: boolean; openPrs: Map<number, OpenPr> }>();
  const repoOf = (repo: string) => {
    let m = repoMemo.get(repo);
    if (!m) {
      m = { comment: commentApprovalOf(db, repo) !== null, fix: fixIssueApprovalOf(db, repo) !== null, pub: !!db.prepare("SELECT 1 FROM repos WHERE name = ? AND visibility = 'public'").get(repo),
        notRust: !!db.prepare("SELECT 1 FROM settings WHERE key = ?").get(notRustKey(repo)), openPrs: issuesWithOpenPr(db, repo) };
      repoMemo.set(repo, m);
    }
    return m;
  };
  const textOf = db.prepare("SELECT title, body FROM items WHERE repo = ? AND number = ?");
  const mirrored = db.prepare("SELECT 1 FROM items WHERE repo = ? AND number = ? AND kind = 'pr'");
  // The fix PR we just opened counts as open until a sync mirrors it: the mirror's open-PR list doesn't have it yet.
  const ownPrUnmirrored = (state: string | null, url: string | null): OpenPr | null => {
    const m = state === "pr-opened" ? /\/([^/]+)\/pull\/(\d+)$/.exec(url ?? "") : null;
    return m && !mirrored.get(m[1]!, Number(m[2])) ? { number: Number(m[2]), closes: true } : null;
  };
  const authorOf = db.prepare("SELECT author FROM items WHERE repo = ? AND number = ?");
  const body = db.prepare("SELECT repo, number, kind, title, body, additions, deletions, changed_files, author_association FROM items WHERE repo = ? AND number = ?");

  return rows.map((r): ItemFacts => {
    const ref = `${r.repo}#${r.number}`;
    const cls = byItem.get(ref) ?? [];
    const j = cls.find((c) => c.classifier === "jev");
    // A Haiku row without a Jev row counts only when Haiku classified alone (it carries the item's input hash).
    const h = cls.find((c) => c.classifier === "haiku" && (j || c.input_hash !== null));
    const s = cls.find((c) => c.classifier === "sonnet");
    let referee: Referee | null = null;
    if (s && j && h && s.at >= j.at && s.at >= h.at) {
      const p = json<{ sure?: unknown; final?: unknown; opusFailures?: unknown; opusFailedAt?: unknown } | null>(s.probs, null);
      if (typeof p?.sure === "boolean") referee = { label: s.type_label, sure: p.sure, reason: "", ...(p.final === true && { final: true }), ...(typeof p.opusFailures === "number" && { failures: p.opusFailures }), ...(typeof p.opusFailedAt === "string" && { failedAt: p.opusFailedAt }) };
    }
    const settled = settle(
      j ? { label: j.type_label, flags: flagsOf(j.flags), top: topOf(j.probs), nd: needsDecisionOf(j.probs), sec: securityOf(j.probs) } : null,
      h ? { label: h.type_label, flags: flagsOf(h.flags) } : null,
      referee,
    );
    // The classifier's input hash: stored on the row, recomputed when it was made under another scheme.
    let classHash = r.class_scheme === SCHEME_ID ? r.class_hash : null;
    if (classHash === null && (j || h)) {
      const b = body.get(r.repo, r.number) as { repo: string; number: number; kind: string; title: string | null; body: string | null; additions: number | null; deletions: number | null; changed_files: number | null; author_association: string | null };
      classHash = classifyHash(b);
    }
    const unsureFlag = (key: string, yes: number): boolean => {
      const p = (json<Record<string, unknown> | null>(j?.probs ?? null, null) ?? {})[key];
      return typeof p === "number" && p >= JEV_FLAG_NO && p < yes;
    };
    const jev = j ? {
      at: j.at,
      changed: j.input_hash !== null ? j.input_hash !== classHash : (r.updated_at ?? "") > j.at,
      unsure: (topOf(j.probs) ?? 0) < SURE || unsureFlag("security", JEV_SECURITY_YES) || unsureFlag("needs_decision", JEV_NEEDS_DECISION_YES),
    } : null;
    const haiku = h ? { at: h.at, aloneCurrent: h.input_hash !== null && h.input_hash === classHash && (!j || h.at > j.at) } : null;
    // Sync and Embed write the text hash; one not written yet is computed here.
    const embedHash = r.embed_hash ?? (() => { const b = textOf.get(r.repo, r.number) as { title: string | null; body: string | null }; return hashOfText(b.title, b.body); })();
    const note = labeled.get(ref) ?? null;
    return {
      repo: r.repo, number: r.number, kind: r.kind, open: r.state === "OPEN", assignment: assigned(ref, r.assignees), now, pipelineOn, tripped: activeTrips(db), inFlight: r.state === "OPEN" && (["retry", "testing", "passed"].includes(r.a_state ?? "") || (r.kind === "pr" && own.prs.has(ref) && own.isOwn(r.repo, (authorOf.get(r.repo, r.number) as { author: string | null } | undefined)?.author ?? null))), draft: !!r.is_draft,
      inScope: !!r.in_pilot, ...(outsideHolds.has(ref) ? { outsideHold: outsideHolds.get(ref)! } : {}), integration: !r.not_integration,
      held: r.held_backlog ? "backlog" : r.held_dup ? "duplicate" : null,
      fast: (r.score ?? 0) >= FAST_FLOOR, score: r.score, repoFacts: { labelsApproved: labelsApproved(r.repo), commentApproved: repoOf(r.repo).comment, fixIssueApproved: repoOf(r.repo).fix },
      run,
      classification: {
        status: settled.status, label: settled.label, flags: settled.flags, jevLabel: settled.jevLabel, haikuLabel: settled.haikuLabel,
        referee: settled.referee ? { sure: settled.referee.sure, final: refereeClosed(settled.referee), failedAt: settled.referee.failedAt ?? null } : null, jev, haiku,
      },
      embedHash, embeddedHash: r.e_hash, priorityHash: r.pr_hash, scannedHash: r.scan_hash,
      pairsToCheck: pairs.get(ref) ?? 0, inGroupToAsk: inGroup.has(ref), inCompareSet: inCompare.has(ref), dupeAnswers: dupeAnswers.get(ref) ?? [],
      scope: { open: openScope.has(ref), answer: answers.get(ref) ?? null, covered: covered.has(ref), recommend: recommend.get(ref) ?? null },
      labels: { quietFix: own.quiet.has(ref), existing: json<unknown[]>(r.labels, []).map(String), pluginAnswer: operatorAnswers.get(ref) === "plugin", labeledNote: note },
      answeredClose: answeredClose.get(ref) ?? [],
      closeReview: closeReview.get(ref) ?? null,
      fix: {
        attempt: r.a_state === null ? null : {
          state: r.a_state,
          textChanged: r.a_state === "skipped" && (() => { const b = textOf.get(r.repo, r.number) as { title: string | null; body: string | null }; return textHash(b.title ?? "", b.body ?? "") !== r.a_hash; })(),
          headDone: r.h_state !== null && (TERMINAL as string[]).includes(r.h_state),
          baseDone: r.a_base === null || (r.b_state !== null && (TERMINAL as string[]).includes(r.b_state)),
        },
        publicRepo: repoOf(r.repo).pub, notRust: repoOf(r.repo).notRust, openPr: r.kind === "issue" ? repoOf(r.repo).openPrs.get(r.number) ?? ownPrUnmirrored(r.a_state, r.a_pr) : null, impact: r.impact,
        scopeDecision: latestScope.get(ref) ?? null,
      },
    };
  });
}

/** Facts of one open item, or null. */
export function loadItemFact(db: DatabaseSync, repo: string, number: number, opts: Omit<ItemLoadOptions, "repo" | "refs"> = {}): ItemFacts | null {
  return loadItemFacts(db, { ...opts, repo, refs: [`${repo}#${number}`] })[0] ?? null;
}
