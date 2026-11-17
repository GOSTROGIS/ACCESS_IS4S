// The PRs the CI fix step works on: those whose Plan holds a `cifix` action.
import type { DatabaseSync } from "node:sqlite";
import { planned } from "../core/select.ts";
import type { PlanSet } from "../core/plan-set.ts";
import type { CifixCandidate, CifixSelection } from "./candidates.ts";

export function selectCifix(db: DatabaseSync, repo: string, run?: string | null, plans?: PlanSet): CifixSelection {
  const out: CifixSelection = { work: [], collect: [], rerun: [], capped: [], ask: [], lint: [] };
  for (const { facts: f, action } of planned(db, "cifix", { repo, ...(run !== undefined ? { run } : {}), ...(plans ? { plans } : {}) })) {
    const x = f.cifix!, r = f.review;
    const c: CifixCandidate = {
      repo, number: f.number, head: action.head!, verdict: r?.verdict === "take-fix" ? "take-fix" : "take", reason: r?.reason ?? "", attempt: x.tries + 1,
      route: f.pushable ? "branch" : "comment", rerun: x.rerunAt !== null, rerunAt: x.rerunAt,
    };
    const bucket = action.params?.bucket;
    if (bucket === "work") out.work.push(c);
    else if (bucket === "capped") out.capped.push(c);
    else if (bucket === "ask") out.ask.push(c);
    else if (bucket === "rerun") out.rerun.push({ c, runs: x.infraRuns ?? [] });
    else if (bucket === "collect") out.collect.push({ c, task: x.formattingTask! });
  }
  const row = db.prepare("SELECT rowid AS id, attempt, patch, files, lint_task, lint_round, lint_state, session FROM ci_fixes WHERE repo = ? AND number = ? AND head = ? AND state = 'linting' ORDER BY rowid DESC");
  for (const { facts: f, action } of planned(db, "lint", { repo, bucket: "cifix", ...(run !== undefined ? { run } : {}), ...(plans ? { plans } : {}) })) {
    const head = action.head!, r = f.review!;
    if (out.lint.some((x) => x.number === f.number)) continue;
    const w = row.get(repo, f.number, head) as { id: number; attempt: number; patch: string | null; files: string | null; lint_task: number | null; lint_round: number | null; lint_state: string | null; session: string | null } | undefined;
    if (!w || !w.patch) continue;
    let files: string[] = [];
    try { files = (JSON.parse(w.files ?? "[]") as unknown[]).filter((x): x is string => typeof x === "string"); } catch { /* none */ }
    out.lint.push({ repo, number: f.number, head, verdict: r.verdict as "take" | "take-fix", reason: r.reason, attempt: w.attempt, route: f.pushable ? "branch" : "comment", rerun: false, rerunAt: null,
      lint: { rowid: w.id, round: w.lint_round ?? 1, task: w.lint_task, state: w.lint_state ?? "pending", patch: w.patch, files, session: w.session } });
  }
  return out;
}
