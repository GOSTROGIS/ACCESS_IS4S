// What the dashboard shows of our build of a PR head. Null while the repo's switch is off or no build exists, so the section stays hidden.
import type { DatabaseSync } from "node:sqlite";
import type { ItemPrBuild } from "../../web/src/api/types.ts";
import { featureOn } from "../build/features.ts";

type Row = { head_sha: string; task_id: number | null; state: string; summary: string | null; ci_overall: string | null; disagree: number; created_at: string; finished_at: string | null };

/** The build of the PR's current head, else the newest one. `internals` false: states only, no failure text. */
export function prBuildView(db: DatabaseSync, repo: string, number: number, head: string | null, internals: boolean): ItemPrBuild | null {
  if (!featureOn(db, "pr-builds", repo)) return null;
  const r = db.prepare("SELECT head_sha, task_id, state, summary, ci_overall, disagree, created_at, finished_at FROM main.pr_builds WHERE repo = ? AND number = ? ORDER BY (head_sha = ?) DESC, created_at DESC LIMIT 1")
    .get(repo, number, head) as Row | undefined;
  if (!r) return null;
  let state: ItemPrBuild["state"] = r.state as ItemPrBuild["state"];
  if (state === "queued" as string) {
    const t = r.task_id === null ? undefined : (db.prepare("SELECT state FROM build_tasks WHERE id = ?").get(r.task_id) as { state: string } | undefined);
    state = t?.state === "claimed" || t?.state === "running" ? "running" : "queued";
  }
  return {
    headSha: r.head_sha, current: r.head_sha === head, state, summary: internals ? r.summary : null,
    disagree: r.disagree === 1, ci: r.ci_overall, createdAt: r.created_at, finishedAt: r.finished_at,
  };
}
