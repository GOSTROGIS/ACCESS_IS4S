// Which jobs may run together: one queued or running job per (step, repo), at most `step_parallel` repos per step,
// and the named mutexes of StepDef.exclusive. The planner, the command-line gate and the runner use the same rules.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import type { StepDef } from "./steps.ts";

export const STEP_PARALLEL_KEY = "step_parallel";
export const STEP_PARALLEL_DEFAULT = 1;
export const STEP_PARALLEL_MAX = 1000;

export class ParallelError extends Error {
  status = 400;
}

/** The setting as shown and stored: a positive integer or "none". */
export function stepParallelSetting(db: DatabaseSync): string {
  const v = (db.prepare("SELECT value FROM settings WHERE key = ?").get(STEP_PARALLEL_KEY) as { value: string } | undefined)?.value;
  if (v === "none") return v;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= STEP_PARALLEL_MAX ? String(n) : String(STEP_PARALLEL_DEFAULT);
}

/** The most repos one step may have running at once (Infinity for "none"). */
export const stepParallel = (db: DatabaseSync): number => { const s = stepParallelSetting(db); return s === "none" ? Infinity : Number(s); };

export function setStepParallel(db: DatabaseSync, input: unknown, by: string): string {
  const v = typeof input === "number" ? String(input) : input;
  if (v !== "none" && !(typeof v === "string" && /^[0-9]+$/.test(v) && Number(v) >= 1 && Number(v) <= STEP_PARALLEL_MAX)) {
    throw new ParallelError(`repos at once per step must be a whole number from 1 to ${STEP_PARALLEL_MAX}, or none`);
  }
  const was = stepParallelSetting(db);
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(STEP_PARALLEL_KEY, v);
  if (v !== was) audit(db, by, "step-parallel", "pipeline", { stepParallel: v, was });
  return v as string;
}

/** A job that holds or waits for its (step, repo). `number` is the finding of a security-fix job. */
export type Active = { id: number; step: string; state: string; repo: string | null; number: number | null };

export function activeJobs(db: DatabaseSync, states: ("queued" | "running")[] = ["queued", "running"]): Active[] {
  return db.prepare(`SELECT id, step, state, repo, json_extract(params, '$.number') AS number FROM jobs WHERE state IN (${states.map(() => "?").join(",")})`)
    .all(...states) as Active[];
}

/** Two jobs of one step do the same work: the same repo (and finding), or one of them is not about a single repo. */
function sameWork(step: string, a: { repo: string | null; number: number | null }, b: { repo: string | null; number: number | null }): boolean {
  if (a.repo === null || b.repo === null) return true;
  return a.repo === b.repo && (step !== "security-fix" || a.number === b.number);
}

export type Want = { step: string; repo: string | null; number?: number | null };

/**
 * Why the job cannot be queued or started now, or null. `states` are the jobs that count: queued and running for
 * queueing, running alone for starting. `extra` are proposals of the same pass: they only count as the same work (a duplicate), so a fallback proposal for another repo can still be made. `reserved` are jobs this pass already queued or gated: they count for the same work and for the repo capacity. `mutex` also checks StepDef.exclusive
 * against running jobs. With `precheck` (a planner check before any repo is known) only the repo capacity is checked.
 */
export function jobBlock(db: DatabaseSync, steps: Map<string, StepDef>, want: Want, o: { states?: ("queued" | "running")[]; extra?: Active[]; reserved?: Active[]; mutex?: boolean; precheck?: boolean } = {}): string | null {
  const held = [...activeJobs(db, o.states), ...(o.reserved ?? [])].filter((j) => j.step === want.step);
  const same = [...held, ...(o.extra ?? []).filter((j) => j.step === want.step)];
  if (!o.precheck) {
    const clash = same.find((j) => sameWork(want.step, j, { repo: want.repo, number: want.number ?? null }));
    if (clash) return `job ${clash.id} of ${want.step} is ${clash.state}`;
  }
  const cap = stepParallel(db);
  if (cap !== Infinity) {
    const repos = new Set(held.map((j) => j.repo ?? ""));
    if (repos.size >= cap && (o.precheck || !repos.has(want.repo ?? ""))) return `${want.step} is working ${repos.size} repo${repos.size === 1 ? "" : "s"}, the most at once (step_parallel)`;
  }
  const mutex = steps.get(want.step)?.exclusive;
  if (o.mutex && mutex) {
    const other = activeJobs(db, ["running"]).find((j) => steps.get(j.step)?.exclusive === mutex);
    if (other) return `job ${other.id} (${other.step}) is running with the same mutex (${mutex})`;
  }
  return null;
}
