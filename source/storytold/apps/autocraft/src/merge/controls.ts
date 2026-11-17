// Operator merge controls: hold or release a PR's merge, remove a PR from its integration batch, stop a batch.
//
//   autocraft merge-hold <repo#n>       autocraft merge-release <repo#n>
//   autocraft batch-remove <repo#n>     autocraft batch-stop <id>
//
// Hold and release change local tables only. Remove and stop close the batch's integration PR through
// src/github/write.ts (audited, on the GitHub activity page); the exec that runs `gh` is injectable.
import { guardRepo } from "../core/guard.ts";
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { FastTrackError, parseItemRef } from "../fasttrack.ts";
import { type Exec, exec as defaultExec } from "../fixup/git.ts";
import { ghClosePr } from "../github/write.ts";
import { isTracked } from "../repos.ts";
import { ACTIVE_BATCH, activeBatches, cancelBuild, getBatch, membersOf, updateBatch } from "./batch-store.ts";
import { slugOf } from "../owners.ts";

export class ControlError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

const refOf = (repo: string, number: number): string => `${repo}#${number}`;

function openPr(db: DatabaseSync, repo: string, number: number): void {
  if (!isTracked(db, repo)) throw new ControlError(`${repo} is not a tracked repo`, 404);
  const it = db.prepare("SELECT kind, state FROM main.items WHERE repo = ? AND number = ?").get(repo, number) as { kind: string; state: string } | undefined;
  if (!it) throw new ControlError(`no item ${refOf(repo, number)} in the mirror`, 404);
  if (it.kind !== "pr") throw new ControlError(`${refOf(repo, number)} is not a pull request`);
  if (it.state !== "OPEN") throw new ControlError(`${refOf(repo, number)} is not open`);
}

/** Holds the PR's merge. Returns false when it was already held. */
export function holdMerge(db: DatabaseSync, by: string, repo: string, number: number, details: Record<string, unknown> = {}): boolean {
  openPr(db, repo, number);
  const r = db.prepare("INSERT OR IGNORE INTO main.merge_holds (repo, number, held_by, held_at) VALUES (?, ?, ?, ?)").run(repo, number, by, new Date().toISOString());
  if (r.changes) audit(db, by, "merge-hold", refOf(repo, number), details);
  return r.changes > 0;
}

/** Releases the PR's merge hold. Returns false when it was not held. */
export function releaseMerge(db: DatabaseSync, by: string, repo: string, number: number): boolean {
  const r = db.prepare("DELETE FROM main.merge_holds WHERE repo = ? AND number = ?").run(repo, number);
  if (r.changes) audit(db, by, "merge-release", refOf(repo, number));
  return r.changes > 0;
}

/** Marks the batch superseded and closes its integration PR, when it has one; the row goes back to its state if the close fails, so a later Stop, Remove or merge run retries. The PRs go back to the queue; the next merge run builds batches from what is eligible. */
async function endBatch(db: DatabaseSync, by: string, id: number, why: string, comment: string, run: Exec): Promise<{ closed: number | null }> {
  const b = getBatch(db, id);
  cancelBuild(db, b, by);
  updateBatch(db, id, new Date().toISOString(), { state: "superseded", summary: why });
  if (b.pr_number === null) return { closed: null };
  const g = guardRepo(db, b.repo, null, { operator: by });
  const r = "refused" in g ? { code: 1, stdout: "", stderr: g.refused }
    : await ghClosePr({ db, login: by }, g, run, { repo: b.repo, number: b.pr_number }, { by: "fixed-operator" }, `Closing: ${comment}.`, { batch: b.branch });
  if (r.code !== 0) {
    const state = await run("gh", ["pr", "view", String(b.pr_number), "--repo", `${slugOf(b.repo)}`, "--json", "state", "--jq", ".state"]);
    if (state.code === 0 && state.stdout.trim() === "MERGED") {
      // The merge went through while the batch was being ended: the merge bookkeeping records it.
      audit(db, by, "batch-end-too-late", `${b.repo}:${b.branch}`, { pr: b.pr_number });
      const at = new Date().toISOString();
      updateBatch(db, id, at, { state: "merged", summary: null });
      for (const m of membersOf(db, id)) db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, 'merged', ?, ?, ?)").run(b.repo, m.number, at, by, `merge in ${b.branch} at ${m.head_oid.slice(0, 7)}`);
      return { closed: null };
    }
    updateBatch(db, id, new Date().toISOString(), { state: b.state, summary: b.summary });
    throw new ControlError(`the batch PR #${b.pr_number} could not be closed: ${r.stderr.replace(/\s+/g, " ").trim().slice(0, 200)}`, 502);
  }
  return { closed: b.pr_number };
}

function activeBatch(db: DatabaseSync, id: number) {
  const b = Number.isInteger(id) ? getBatch(db, id) : undefined;
  if (!b) throw new ControlError(`no batch ${id}`, 404);
  if (!ACTIVE_BATCH.includes(b.state)) throw new ControlError(`batch ${b.branch} is ${b.state}, not in flight`);
  return b;
}

/** Stops the batch: closes its integration PR and holds each member PR (audited per PR), so the next merge run does not rebuild the same batch. Release them one by one. */
export async function stopBatch(db: DatabaseSync, by: string, id: number, run: Exec = defaultExec): Promise<{ batch: string; prs: number[]; held: number[]; closed: number | null }> {
  const b = activeBatch(db, id);
  const prs = membersOf(db, id).map((m) => m.number);
  audit(db, by, "batch-stop", `${b.repo}:${b.branch}`, { prs });
  const held = prs.filter((n) => db.prepare("SELECT 1 FROM main.items WHERE repo = ? AND number = ? AND state = 'OPEN'").get(b.repo, n) && holdMerge(db, by, b.repo, n, { batch: b.branch }));
  const { closed } = await endBatch(db, by, id, "stopped by an operator", "the batch was stopped by an operator. Its pull requests are held until released", run);
  return { batch: b.branch, prs, held, closed };
}

/** Holds the PR and ends its batch: the others go back to the queue and the next merge run builds a batch without it. */
export async function removeFromBatch(db: DatabaseSync, by: string, repo: string, number: number, run: Exec = defaultExec): Promise<{ batch: string; closed: number | null }> {
  const b = activeBatches(db, repo).find((x) => membersOf(db, x.id).some((m) => m.number === number));
  if (!b) throw new ControlError(`${refOf(repo, number)} is not in a batch in flight`);
  holdMerge(db, by, repo, number, { batch: b.branch });
  audit(db, by, "batch-remove", refOf(repo, number), { batch: b.branch });
  const { closed } = await endBatch(db, by, b.id, `${refOf(repo, number)} was removed by an operator`, `${refOf(repo, number)} was removed from the batch by an operator. The other pull requests are rebuilt in a new batch`, run);
  return { batch: b.branch, closed };
}

function parseRef(text: string | undefined): { repo: string; number: number } {
  try {
    return parseItemRef(text);
  } catch (e) {
    if (e instanceof FastTrackError) throw new ControlError(e.message, 400);
    throw e;
  }
}

async function cli(f: () => Promise<string> | string): Promise<void> {
  try {
    console.log(await f());
  } catch (e) {
    if (!(e instanceof ControlError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}

export const commands = {
  "merge-hold": {
    summary: "merge-hold <repo#n>: keep a PR from merging, alone or in a batch, until merge-release (reviews and fixes go on)",
    run: (args: string[]) => cli(async () => {
      const { connect } = await import("../db.ts");
      const r = parseRef(args[0]);
      return holdMerge(connect(), "cli", r.repo, r.number) ? `${refOf(r.repo, r.number)}: merge held` : `${refOf(r.repo, r.number)}: already held`;
    }),
  },
  "merge-release": {
    summary: "merge-release <repo#n>: let a held PR merge again",
    run: (args: string[]) => cli(async () => {
      const { connect } = await import("../db.ts");
      const r = parseRef(args[0]);
      return releaseMerge(connect(), "cli", r.repo, r.number) ? `${refOf(r.repo, r.number)}: released` : `${refOf(r.repo, r.number)}: was not held`;
    }),
  },
  "batch-remove": {
    summary: "batch-remove <repo#n>: close the PR's integration batch PR, hold the PR; the others are rebuilt in a new batch (writes to GitHub)",
    run: (args: string[]) => cli(async () => {
      const { connect } = await import("../db.ts");
      const r = parseRef(args[0]);
      const out = await removeFromBatch(connect(), "cli", r.repo, r.number);
      return `${refOf(r.repo, r.number)}: held and removed from ${out.batch}${out.closed ? `; closed batch PR #${out.closed}` : ""}`;
    }),
  },
  "batch-stop": {
    summary: "batch-stop <id>: close a batch's integration PR; holds its PRs (writes to GitHub)",
    run: (args: string[]) => cli(async () => {
      const { connect } = await import("../db.ts");
      const out = await stopBatch(connect(), "cli", Number(args[0]));
      return `${out.batch}: stopped${out.closed ? `; closed batch PR #${out.closed}` : ""}; held ${out.held.length ? out.held.map((n) => `#${n}`).join(", ") : "no PRs"} (merge-release to let them merge)`;
    }),
  },
};
