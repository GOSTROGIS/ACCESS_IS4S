// The PRs the fix-up and conflict steps work on: those whose Plan holds a `fixup` or `conflict` action.
import type { DatabaseSync } from "node:sqlite";
import { planned } from "../core/select.ts";
import type { PlanSet } from "../core/plan-set.ts";
import type { PrFacts } from "../core/plan.ts";
import { findingsOf, premergeAt } from "../premerge/store.ts";
import { type Carry, type FixCandidate, type FixSelection, parseFixes } from "./candidates.ts";
import { conflictTries, type ConflictCandidate } from "./conflict-state.ts";
import { queuedOperatorFix } from "../preapproval/state.ts";

/** The queued carry-over jobs of a kept PR that have points to carry, in the order the facts list them. */
function carriesOf(db: DatabaseSync, f: PrFacts, head: string): FixCandidate[] {
  const rows = db.prepare("SELECT decision_id, attempts FROM dupe_carries WHERE repo = ? AND number = ? AND state = 'queued' ORDER BY number").all(f.repo, f.number) as { decision_id: string; attempts: number }[];
  const out: FixCandidate[] = [];
  for (const r of rows) {
    const sources = (db.prepare("SELECT number, detail, head FROM dupe_group_items WHERE decision_id = ? AND kind = 'pr' AND role = 'close' ORDER BY number").all(r.decision_id) as { number: number; detail: string | null; head: string | null }[])
      .map((x) => {
        let pts: unknown = [];
        try { pts = (JSON.parse(x.detail ?? "null") as { carry?: unknown } | null)?.carry ?? []; } catch { /* no points */ }
        // The head that was compared and closed, not the one the PR has now.
        return { number: x.number, head: x.head, points: Array.isArray(pts) ? pts.filter((p): p is string => typeof p === "string") : [] };
      }).filter((x) => x.points.length);
    if (!sources.length) continue;
    const suggestion = (db.prepare("SELECT t.text FROM dupe_group_texts t JOIN dupe_groups g ON g.decision_id = t.decision_id AND g.applied_answer = t.option WHERE t.decision_id = ? AND t.number = ? AND t.step = 'suggestion'").get(r.decision_id, f.number) as { text: string } | undefined)?.text ?? null;
    const carry: Carry = { decisionId: r.decision_id, suggestion, sources };
    out.push({ repo: f.repo, number: f.number, head, reason: `Parts of ${sources.map((x) => `#${x.number}`).join(", ")}, closed as duplicates, to carry over.`, fixes: [], attempt: r.attempts + 1,
      model: (db.prepare("SELECT summary_by, serving_metadata FROM decisions WHERE id = ?").get(r.decision_id) as { summary_by: string | null; serving_metadata: string | null } | undefined)?.summary_by ?? null, servingMetadata: (db.prepare("SELECT serving_metadata FROM decisions WHERE id = ?").get(r.decision_id) as { serving_metadata: string | null } | undefined)?.serving_metadata ?? null, carry });
  }
  return out;
}

export function selectFixups(db: DatabaseSync, repo: string, run?: string | null, plans?: PlanSet): FixSelection {
  const opts = { repo, ...(run !== undefined ? { run } : {}), ...(plans ? { plans } : {}) };
  const out: FixSelection = { fix: [], cannotPush: [], ask: [], lint: [], conflictMerge: [], conflictAsk: [] };
  const review = db.prepare("SELECT fixes, model, serving_metadata FROM final_reviews WHERE repo = ? AND number = ? AND head_oid = ? AND verdict = 'take-fix'");
  const text = db.prepare("SELECT title FROM items WHERE repo = ? AND number = ?");
  for (const { facts: f, action } of planned(db, "conflict", opts)) {
    const c: ConflictCandidate = {
      repo, number: f.number, head: action.head!, base: f.conflict!.base, title: ((text.get(repo, f.number) as { title: string | null } | undefined)?.title ?? "").slice(0, 300),
      reason: f.review!.reason, attempt: conflictTries(db, repo, f.number, action.head!) + 1, pushable: f.pushable,
    };
    (action.params?.bucket === "merge" ? out.conflictMerge : out.conflictAsk).push(c);
  }
  const carryFix: FixCandidate[] = [], carryAsk: FixCandidate[] = [], fix: FixCandidate[] = [];
  const carryIndex = new Map<string, number>();
  for (const { facts: f, action } of planned(db, "fixup", opts)) {
    const head = action.head!, bucket = action.params?.bucket;
    if (action.params?.source === "carry") {
      const ref = `${f.number}`;
      const i = carryIndex.get(ref) ?? 0;
      carryIndex.set(ref, i + 1);
      const c = carriesOf(db, f, head)[i];
      if (c) (bucket === "fix" ? carryFix : carryAsk).push(c);
    } else if (action.params?.source === "operator") {
      const o = queuedOperatorFix(db, repo, f.number, head);
      if (o) fix.push({ repo, number: f.number, head, reason: "an operator's instructions", fixes: [], attempt: (f.operator?.fix?.attempts ?? 0) + 1, model: null, source: "operator", operator: { id: o.id, instructions: o.instructions } });
    } else if (action.params?.source === "premerge") {
      // Only a branch we may push to gets a pre-merge round; otherwise the step leaves it alone.
      if (!f.pushable || !f.repoFacts.pushApproved) continue;
      const row = premergeAt(db, repo, f.number, head);
      const defects = findingsOf(row).filter((x) => x.severity === "defect");
      fix.push({ repo, number: f.number, head, reason: "pre-merge review", fixes: parseFixes(JSON.stringify(defects.map((x) => x.fix))), attempt: 1, model: row?.model ?? null, servingMetadata: row?.serving_metadata ?? null, source: "premerge" });
    } else {
      const r = review.get(repo, f.number, head) as { fixes: string | null; model: string | null; serving_metadata: string | null } | undefined;
      const c: FixCandidate = { repo, number: f.number, head, reason: f.review!.reason, fixes: parseFixes(r?.fixes ?? null), attempt: f.fixup!.attempts + 1, model: r?.model ?? null, servingMetadata: r?.serving_metadata ?? null };
      if (bucket === "ask") out.ask.push(c);
      else if (bucket === "cannot-push") out.cannotPush.push(c);
      else if (bucket === "fix") fix.push(c);
    }
  }
  // Stored patches (review, pre-merge and carry-over sources) whose lint task ended. Their row is found by source; a carry-over's also by its decision.
  const row = db.prepare("SELECT rowid AS id, attempt, patch, lint_task, lint_round, lint_state, carry_decision, session, operator_fix, changes, serving_metadata FROM fixups WHERE repo = ? AND number = ? AND from_head = ? AND COALESCE(source, 'review') = ? AND state = 'linting' ORDER BY rowid");
  type LintRow = { id: number; attempt: number; patch: string | null; lint_task: number | null; lint_round: number | null; lint_state: string | null; carry_decision: string | null; session: string | null; operator_fix: number | null; changes: string | null; serving_metadata: string | null };
  const seenLint = new Set<string>();
  for (const { facts: f, action } of planned(db, "lint", { ...opts, bucket: "fixup" })) {
    const head = action.head!, source = String(action.params?.source ?? "review");
    // Several lint actions of one PR (one per stored row) would otherwise list every row of the key again.
    const key = `${f.number} ${head} ${source}`;
    if (seenLint.has(key)) continue;
    seenLint.add(key);
    for (const w of row.all(repo, f.number, head, source) as LintRow[]) {
      if (!w.patch) continue;
      const lint = { servingMetadata: w.serving_metadata, rowid: w.id, round: w.lint_round ?? 1, task: w.lint_task, state: w.lint_state ?? "pending", patch: w.patch, session: w.session, changes: changesOf(w.changes) };
      if (source === "carry") {
        const c = carriesOf(db, f, head).find((x) => x.carry!.decisionId === w.carry_decision);
        if (c) out.lint.push({ ...c, attempt: w.attempt, lint });
      } else if (source === "operator") {
        const o = queuedOperatorFix(db, repo, f.number, head);
        if (o && w.operator_fix === o.id) out.lint.push({ repo, number: f.number, head, reason: "an operator's instructions", fixes: [], attempt: w.attempt, model: null, source: "operator", operator: { id: o.id, instructions: o.instructions }, lint });
      } else if (source === "premerge") {
        const pm = premergeAt(db, repo, f.number, head);
        const defects = findingsOf(pm).filter((x) => x.severity === "defect");
        out.lint.push({ repo, number: f.number, head, reason: "pre-merge review", fixes: parseFixes(JSON.stringify(defects.map((x) => x.fix))), attempt: w.attempt, model: pm?.model ?? null, servingMetadata: pm?.serving_metadata ?? null, source: "premerge", lint });
      } else {
        const r = review.get(repo, f.number, head) as { fixes: string | null; model: string | null; serving_metadata: string | null } | undefined;
        if (f.review) out.lint.push({ repo, number: f.number, head, reason: f.review.reason, fixes: parseFixes(r?.fixes ?? null), attempt: w.attempt, model: r?.model ?? null, servingMetadata: r?.serving_metadata ?? null, lint });
      }
    }
  }
  // Stored conflict resolutions whose lint task ended: collected by the conflict step.
  const lintedMerge = db.prepare("SELECT rowid AS id, attempt, patch, lint_task, lint_round, base_sha, files, session, serving_metadata FROM conflict_merges WHERE repo = ? AND number = ? AND from_head = ? AND state = 'linting' ORDER BY rowid");
  for (const { facts: f, action } of planned(db, "lint", { ...opts, bucket: "conflict" })) {
    const head = action.head!;
    for (const w of lintedMerge.all(repo, f.number, head) as { id: number; attempt: number; patch: string | null; lint_task: number | null; lint_round: number | null; base_sha: string | null; files: string | null; session: string | null; serving_metadata: string | null }[]) {
      if (!w.patch || !w.base_sha) continue;
      out.conflictMerge.unshift({
        repo, number: f.number, head, base: f.conflict!.base, title: ((text.get(repo, f.number) as { title: string | null } | undefined)?.title ?? "").slice(0, 300),
        reason: f.review!.reason, attempt: w.attempt, pushable: f.pushable,
        lint: { servingMetadata: w.serving_metadata, rowid: w.id, round: w.lint_round ?? 1, task: w.lint_task, baseSha: w.base_sha, resolved: w.patch, files: JSON.parse(w.files ?? "[]") as string[], session: w.session },
      });
    }
  }
  out.fix.push(...carryFix, ...fix);
  out.ask.unshift(...carryAsk);
  return out;
}

/** The stored list of changes of an operator fix-up row; empty when none or unreadable. */
function changesOf(json: string | null): string[] {
  try { const v = JSON.parse(json ?? "[]") as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
}
