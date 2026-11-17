// The detail page of one integration batch: header, member PRs with what became of each, the batch PR's CI, and the
// batch's own history. Everything comes from the batch tables, its sandbox task and the audit log; no bookkeeping of its own.
// Reads follow the dashboard rule: anyone signed in sees the records of a visible repo; who acted and the sandbox task's
// worker summary are staff-only.
import type { DatabaseSync } from "node:sqlite";
import type { BatchCi, BatchDetail, BatchEvent, BatchMemberDetail, BatchMemberState, BatchState } from "../../../web/src/api/types.ts";
import { getBatch, membersOf } from "../../merge/batch-store.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { itemState } from "./shown.ts";
import { canSeeInternals } from "./staff.ts";
import { needVisible } from "./visible.ts";
import { ownerOf } from "../../owners.ts";

type AuditRow = { rowid: number; at: string; login: string; action: string; target: string | null; details: string | null };

const detailOf = (s: string | null): Record<string, unknown> => {
  try {
    const v: unknown = JSON.parse(s ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const CHECK_STATES = new Set(["success", "failure", "pending", "skipped"]);

function ciOf(db: DatabaseSync, repo: string, prNumber: number | null): BatchCi | null {
  if (prNumber === null) return null;
  const r = db.prepare("SELECT overall, checks, fetched_at FROM main.pr_checks WHERE repo = ? AND number = ?").get(repo, prNumber) as { overall: string; checks: string; fetched_at: string } | undefined;
  if (!r) return null;
  let list: unknown = [];
  try { list = JSON.parse(r.checks); } catch { /* malformed: no checks */ }
  const url = `https://github.com/${ownerOf(repo)}/${encodeURIComponent(repo)}/pull/${prNumber}/checks`;
  const checks = (Array.isArray(list) ? (list as ({ name?: unknown; state?: unknown } | null)[]) : []).flatMap((c) =>
    c && typeof c.name === "string" && typeof c.state === "string" && CHECK_STATES.has(c.state) ? [{ name: c.name, state: c.state as BatchCi["checks"][number]["state"], url }] : []);
  const state = (["success", "failure", "pending", "none"] as const).find((s) => s === r.overall) ?? "none";
  return { state, fetchedAt: r.fetched_at, checks };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function batchDetail(db: DatabaseSync, id: number, staff: boolean): BatchDetail {
  const b = getBatch(db, id);
  if (!b) throw new HttpError(404, `no batch ${id}`);
  const state = b.state as BatchState;
  const ref = `${b.repo}:${b.branch}`;
  const prRef = (n: number) => `${b.repo}#${n}`;
  const memberRows = membersOf(db, id);
  const nums = memberRows.map((m) => m.number);
  const marks = (xs: unknown[]) => xs.map(() => "?").join(",");

  // Audit rows about the batch itself (target `repo:branch`), its members (target `repo#n`, details.batch the branch) and its PR.
  const audit = db.prepare(
    `SELECT rowid, at, login, action, target, details FROM main.audit
      WHERE (target = ? AND action IN ('batch-start', 'batch-build-skip', 'batch-push', 'batch-pr', 'batch-stop', 'batch-end-too-late', 'batch-merged-after-end'))
         OR (action IN ('batch-remove', 'batch-hold') AND json_extract(details, '$.batch') = ? AND target IN (${marks(nums)}))
         ${b.pr_number === null ? "" : "OR (target = ? AND action IN ('ci-run-approve', 'ci-rerun'))"}
      ORDER BY at, rowid`,
  ).all(ref, b.branch, ...nums.map(prRef), ...(b.pr_number === null ? [] : [prRef(b.pr_number)])) as AuditRow[];

  let buildSkipped: string | null = null;
  const left = new Map<number, { state: BatchMemberState; reason: string }>();
  const events: BatchEvent[] = [];
  const by = (login: string) => (staff ? login : null);
  const ev = (e: Omit<BatchEvent, "by"> & { by?: string | null }) => events.push({ by: null, ...e });

  ev({ id: "opened", at: b.created_at, kind: "opened", summary: `Opened with ${plural(nums.length, "PR")} on the default branch at ${b.base_sha.slice(0, 7)}` });
  if (b.parent_id !== null) {
    const parent = db.prepare("SELECT state FROM main.merge_batches WHERE id = ?").get(b.parent_id) as { state: string } | undefined;
    ev({ id: "parent", at: b.created_at, kind: "opened", summary: parent?.state === "split" ? `Half of batch #${b.parent_id}, which failed` : `Rebuilt from batch #${b.parent_id}`, batchId: b.parent_id });
  }

  const task = b.task_id === null ? undefined : db.prepare("SELECT state, queued_at, started_at, ended_at, summary FROM main.build_tasks WHERE id = ?").get(b.task_id) as
    { state: string; queued_at: string; started_at: string | null; ended_at: string | null; summary: string | null } | undefined;
  if (task && b.task_id !== null) {
    ev({ id: "task-queued", at: task.queued_at, kind: "task", summary: "Sandbox build and test queued", taskId: b.task_id });
    if (task.started_at) ev({ id: "task-started", at: task.started_at, kind: "task", summary: "Sandbox build and test started", taskId: b.task_id });
    if (task.ended_at) {
      const note = staff && task.summary ? `: ${task.summary}` : "";
      ev({ id: "task-ended", at: task.ended_at, kind: "task", summary: `Sandbox build and test ${task.state}${note}`, taskId: b.task_id });
    }
  }

  for (const a of audit) {
    const d = detailOf(a.details);
    const num = a.target?.startsWith(`${b.repo}#`) ? Number(a.target.slice(b.repo.length + 1)) : undefined;
    const base = { id: `audit:${a.rowid}`, at: a.at };
    switch (a.action) {
      case "batch-build-skip": if (typeof d.reason === "string") buildSkipped = d.reason; break;
      case "batch-push": ev({ ...base, kind: "push", summary: "Integration branch pushed" }); break;
      case "batch-pr": ev({ ...base, kind: "pr", summary: "Batch PR opened" }); break;
      case "batch-stop": ev({ ...base, kind: "stopped", summary: "Stopped by an operator; the batch PR is closed and its PRs are held", by: by(a.login) }); break;
      case "batch-remove": {
        const reason = "removed by an operator";
        if (num !== undefined) { left.set(num, { state: "removed", reason }); ev({ ...base, kind: "removed", summary: `${prRef(num)} removed from the batch; the others are rebuilt`, number: num, by: by(a.login) }); }
        break;
      }
      case "batch-hold":
        if (num !== undefined) {
          const reason = typeof d.summary === "string" ? d.summary : "failed alone";
          left.set(num, { state: "failed", reason });
          ev({ ...base, kind: "failed", summary: `${prRef(num)} failed alone and is on hold`, number: num });
        }
        break;
      case "ci-run-approve": ev({ ...base, kind: "ci", summary: "CI runs approved on the batch PR", by: by(a.login) }); break;
      case "ci-rerun": ev({ ...base, kind: "ci", summary: "Failed CI jobs of the batch PR rerun" }); break;
      case "batch-end-too-late": ev({ ...base, kind: "merged", summary: "Stop came after the batch PR had merged", by: by(a.login) }); break;
      default: break;
    }
  }

  // A batch that was stopped has every member held: the audit's stop row says so, and each member is shown as removed.
  if (audit.some((a) => a.action === "batch-stop")) for (const n of nums) if (!left.has(n)) left.set(n, { state: "removed", reason: "batch stopped by an operator" });

  const children = db.prepare("SELECT id, created_at FROM main.merge_batches WHERE parent_id = ? ORDER BY id").all(id) as { id: number; created_at: string }[];
  for (const c of children) {
    ev({ id: `child:${c.id}`, at: c.created_at, kind: state === "split" ? "split" : "superseded", summary: state === "split" ? `Split: batch #${c.id} retries a half` : `Rebuilt as batch #${c.id}`, batchId: c.id });
  }

  const ended = state === "merged" ? ["merged", "Merged"] : state === "failed" ? ["failed", "Failed"] : state === "split" ? ["split", "Failed and split"] : state === "superseded" ? ["superseded", "Ended"] : null;
  if (ended) {
    const why = state === "merged" || !b.summary ? "" : `: ${b.summary}`;
    ev({ id: "ended", at: b.updated_at, kind: ended[0] as BatchEvent["kind"], summary: `${ended[1]}${why}` });
  }
  events.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));

  const shown = db.prepare("SELECT title, state FROM main.items WHERE repo = ? AND number = ?");
  const members: BatchMemberDetail[] = memberRows.map((m) => {
    const it = shown.get(b.repo, m.number) as { title: string | null; state: string } | undefined;
    const l = left.get(m.number);
    const st: BatchMemberState = l?.state ?? (state === "merged" ? "merged" : "in");
    return { repo: b.repo, number: m.number, title: it?.title ?? null, itemState: it ? itemState(it.state) : null, headOid: m.head_oid, state: st, reason: l?.reason ?? null };
  });

  return {
    id: b.id, repo: b.repo, branch: b.branch, fork: b.fork, state, baseSha: b.base_sha, commitSha: b.commit_sha, parentId: b.parent_id,
    childIds: children.map((c) => c.id), prNumber: b.pr_number, prUrl: b.pr_url, summary: b.summary, createdAt: b.created_at, updatedAt: b.updated_at,
    mergedAt: state === "merged" ? b.updated_at : null, taskId: b.task_id, buildState: b.build_state ?? null, buildTries: b.build_tries ?? 0, buildSkipped: b.build_state === "skipped" ? buildSkipped : null, mergeSha: b.merge_sha ?? null, ci: ciOf(db, b.repo, b.pr_number), members, events,
  };
}

export async function batchOne(db: DatabaseSync, req: Req): Promise<BatchDetail> {
  const id = Number(req.params.id);
  const row = Number.isInteger(id) ? (db.prepare("SELECT repo FROM main.merge_batches WHERE id = ?").get(id) as { repo: string } | undefined) : undefined;
  if (!row) throw new HttpError(404, `no batch ${req.params.id}`);
  await needVisible(db, req, row.repo);
  return batchDetail(db, id, canSeeInternals(req));
}
