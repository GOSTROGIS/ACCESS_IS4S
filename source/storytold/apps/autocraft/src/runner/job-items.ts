// The items a job handled, for the item page: one job_items row per item, and the same line in the job log
// prefixed with the item ref, so a log parser can pick an item's lines out of the job log.
import type { DatabaseSync } from "node:sqlite";
import { currentJobId } from "../agents/call.ts";

/** `[owner/repo#n]`, the prefix of a job log line about one item. */
export const itemTag = (repo: string, number: number): string => `[${repo}#${number}]`;

/**
 * Records that the running job handled an item and logs the outcome (one line) under the item's tag. Stage code calls it once
 * per item it handled. `decision` is the id of the decision the job asked about the item. Outside a job (a dry run, a direct command) nothing is stored; the line is still logged.
 */
export function jobItem(db: DatabaseSync, repo: string, number: number, outcome: string, log: (line: string) => void = console.log, decision: string | null = null): void {
  const line = outcome.replace(/\s+/g, " ").trim().slice(0, 300);
  log(`${itemTag(repo, number)} ${line}`);
  const job = currentJobId();
  if (job === null) return;
  // Bookkeeping: a failed insert must not fail the stage.
  try {
    db.prepare("INSERT INTO job_items (job_id, repo, number, outcome, at, ref) VALUES (?, ?, ?, ?, ?, ?)").run(job, repo, number, line, new Date().toISOString(), decision);
  } catch (e) {
    log(`job item not recorded: ${(e as Error).message}`);
  }
}

export type ItemJob = { jobId: number; outcome: string | null; at: string };

/** The jobs that handled an item, oldest first. */
export function itemJobs(db: DatabaseSync, repo: string, number: number): ItemJob[] {
  return (db.prepare("SELECT job_id, outcome, at FROM job_items WHERE repo = ? AND number = ? ORDER BY id").all(repo, number) as { job_id: number; outcome: string | null; at: string }[])
    .map((r) => ({ jobId: r.job_id, outcome: r.outcome, at: r.at }));
}
