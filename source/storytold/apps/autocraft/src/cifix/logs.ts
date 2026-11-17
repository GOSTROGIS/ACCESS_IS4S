// Reads why a head's CI failed. Read-only: two `gh` calls per failed run, no write wrapper. The text is the
// PR's own CI output, so it is untrusted data wherever it goes next (a prompt frames it as such).
import type { Gh } from "../merge/safe-merge.ts";
import type { CiFailure, FailedCheck, FailedStep } from "./types.ts";
import { slugOf } from "../owners.ts";

/** Characters kept from the end of one failed step's log, per check, and in all. */
export const STEP_TAIL = 4000;
export const CHECK_CAP = 8000;
export const TOTAL_CAP = 16_000;
/** Failed steps kept per check. */
const MAX_STEPS = 3;

const FAILED = new Set(["failure", "timed_out", "cancelled", "startup_failure", "stale"]);
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
const STAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z ?/;
const GATE = /gate/i;

type CheckRuns = { check_runs?: { name?: string; status?: string; conclusion?: string | null; details_url?: string | null; completed_at?: string | null }[] };
type Run = { name: string; conclusion: string; runId: number | null; completedAt: string | null };

/**
 * The failed check runs of a head. The repos' CI calls the suite's gate workflow, so its checks carry "gate" in their
 * name; when some failed check does, only those count (a failing optional check next to a passing gate is not the
 * gate's failure). With no such name every failed check counts. `gatePassed`: gate checks exist and none failed, so
 * whatever fails is not the gate and is left alone. Checks on the repo's optional list are never failures to fix.
 */
export function failedRuns(reply: CheckRuns, optional: string[] = []): { runs: Run[]; gatePassed: boolean } {
  const all = reply.check_runs ?? [];
  const failed = all.filter((c) => c.status === "completed" && FAILED.has(c.conclusion ?? "") && !optional.includes(c.name ?? "?"))
    .map((c) => ({ name: c.name ?? "?", conclusion: c.conclusion ?? "failure", runId: Number(/\/actions\/runs\/(\d+)/.exec(c.details_url ?? "")?.[1]) || null, completedAt: c.completed_at ?? null }));
  const gate = failed.filter((c) => GATE.test(c.name));
  const gatePassed = !gate.length && all.some((c) => GATE.test(c.name ?? ""));
  return { runs: gate.length ? gate : failed, gatePassed };
}

/** `gh run view --log-failed` lines are `job<TAB>step<TAB>text`; groups them per job and step, in order. */
export function parseFailedLog(text: string): FailedStep[] {
  const groups = new Map<string, FailedStep>();
  for (const line of text.replace(ANSI, "").split("\n")) {
    const [job, step, ...rest] = line.split("\t");
    if (job === undefined || step === undefined || !rest.length) continue;
    const key = `${job}\t${step}`;
    const g = groups.get(key) ?? { job, step, tail: "" };
    g.tail += `${rest.join("\t").replace(STAMP, "")}\n`;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, tail: g.tail.length > STEP_TAIL ? g.tail.slice(-STEP_TAIL) : g.tail }));
}

export type Reading = { kind: "failure"; failure: CiFailure } | { kind: "skip"; why: string };

/**
 * Reads the failed checks of `head` and the failed steps' log tails. A head with no failed check run (a commit status
 * or an action_required run failed it), or whose gate checks all passed, is skipped: there is nothing here to fix.
 */
export async function readFailure(gh: Gh, repo: string, head: string, optional: string[] = []): Promise<Reading> {
  const { runs, gatePassed } = failedRuns(JSON.parse(await gh(["api", `repos/${slugOf(repo)}/commits/${head}/check-runs?per_page=100`])) as CheckRuns, optional);
  if (gatePassed) return { kind: "skip", why: "the gate checks passed; only an optional check failed" };
  if (!runs.length) return { kind: "skip", why: "no failed check run at the head (a commit status or a run waiting for approval failed)" };
  const logs = new Map<number, FailedStep[]>();
  const checks: FailedCheck[] = [];
  let total = 0;
  for (const r of runs) {
    let steps: FailedStep[] = [];
    if (r.runId !== null && r.conclusion === "failure") {
      if (!logs.has(r.runId)) {
        try { logs.set(r.runId, parseFailedLog(await gh(["run", "view", String(r.runId), "--repo", `${slugOf(repo)}`, "--log-failed"]))); }
        catch { logs.set(r.runId, []); }
      }
      // A run holds several checks (jobs); a step belongs to the check whose name ends with its job's name.
      const all = logs.get(r.runId)!;
      steps = all.filter((s) => r.name === s.job || r.name.endsWith(` / ${s.job}`));
      if (!steps.length && runs.filter((x) => x.runId === r.runId).length === 1) steps = all;
    }
    const kept: FailedStep[] = [];
    let size = 0;
    for (const s of steps.slice(-MAX_STEPS)) {
      const room = Math.min(CHECK_CAP - size, TOTAL_CAP - total);
      if (room <= 0) break;
      const tail = s.tail.length > room ? s.tail.slice(-room) : s.tail;
      kept.push({ ...s, tail });
      size += tail.length;
      total += tail.length;
    }
    checks.push({ name: r.name, conclusion: r.conclusion, runId: r.runId, completedAt: r.completedAt, steps: kept });
  }
  return { kind: "failure", failure: { head, checks } };
}
