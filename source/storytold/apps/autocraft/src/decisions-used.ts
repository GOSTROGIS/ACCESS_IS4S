// Answers the pipeline consumes without writing anywhere: it marks them applied
// so the dashboard stops showing "not applied yet" and no longer offers Undo.
//   - scope take / small-extra: a PR is applied once it was reviewed after the answer, an issue once a
//     fix attempt exists or its label is not bugfix (Fix is the only reader of an issue's take);
//   - scope plugin: once the item carries the plugin candidate label (the Label stage writes it);
//   - scope need-info and Close? hold / keep: at the next pass (they only keep the item out of later stages).
// An item that is no longer open has nothing left to use the answer. Answers that close (applied by the
// act step) and duplicate answers (src/dupes/decide.ts) are not handled here.
import type { DatabaseSync } from "node:sqlite";
import { settledOf } from "./classify/settled.ts";
import { audit } from "./dash/audit.ts";
import { actionable, getDecision } from "./decisions.ts";
import { PLUGIN_LABEL } from "./labels/plan.ts";
import { sameLabel } from "./labels/set.ts";
import { markExecDone } from "./github/user-lane.ts";

const ACTOR = "pipeline";

type ItemRow = { kind: string; state: string; labels: string | null };

/** Marks the actionable answers the pipeline has used as applied; returns how many. */
export function applyUsedAnswers(db: DatabaseSync, at: string = new Date().toISOString()): number {
  const item = db.prepare("SELECT kind, state, labels FROM items WHERE repo = ? AND number = ?");
  const reviewed = db.prepare("SELECT 1 FROM final_reviews WHERE repo = ? AND number = ? AND at >= ?");
  const attempted = db.prepare("SELECT 1 FROM fix_attempts WHERE repo = ? AND number = ?");
  let n = 0;
  for (const a of actionable(db)) {
    if (a.kind !== "scope" && a.kind !== "close" && a.kind !== "hold") continue;
    const d = getDecision(db, a.id)!;
    const perItem = a.items.map((it) => ({ it, answer: a.exceptions.find((e) => e.repo === it.repo && e.number === it.number)?.answer ?? a.answer }));
    if (!perItem.length || perItem.some((p) => p.answer === "close")) continue;
    const used = perItem.every(({ it, answer }) => {
      if (a.kind === "hold") return answer === "wait";
      if (a.kind === "close") return answer === "hold" || answer === "keep";
      if (answer === "need-info") return true;
      const row = item.get(it.repo, it.number) as ItemRow | undefined;
      if (!row || row.state !== "OPEN") return true;
      if (answer === "plugin") return labelsOf(row.labels).some((l) => sameLabel(l, PLUGIN_LABEL));
      if (answer !== "take" && answer !== "small-extra") return false;
      if (row.kind === "pr") return !!reviewed.get(it.repo, it.number, d.answered_at ?? "");
      return !!attempted.get(it.repo, it.number) || settledOf(db, it.repo, it.number).label !== "bugfix";
    });
    if (!used) continue;
    db.prepare("UPDATE main.decisions SET applied_at = ? WHERE id = ? AND applied_at IS NULL").run(at, a.id);
    audit(db, ACTOR, "answer-used", a.id, { answer: a.answer });
    n++;
  }
  markExecDone(db);
  return n;
}

function labelsOf(s: string | null): string[] {
  try {
    const v = JSON.parse(s ?? "[]") as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch { return []; }
}
