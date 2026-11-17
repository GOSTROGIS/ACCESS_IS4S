// Health checks computed from the database: one list read by the dashboard's warnings menu and by GET /healthz/checks.
// Every check reads rows the runner, the sync and the build workers already write; none starts work or wakes the planner.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { listAccounts } from "./agents/accounts.ts";
import { deadlineStops } from "./runner/autopilot.ts";
import { stepTitle } from "./dash/api/trace.ts";
import { repoErrors } from "./sync-errors.ts";
import { slugOf } from "./owners.ts";
import { trackedNames } from "./repos.ts";
import { storedLiveness } from "./liveness.ts";
import { coverageSnapshot, githubIdentity } from "./github/identity.ts";
import { readAppSecrets } from "./github/install-token.ts";
import { PROBE_HEADERS } from "./health.ts";
import { unboundLogins } from "./author-ids.ts";
import { confidentialReadyAt, PRIVATE_STEPS_SQL } from "./build/tasks.ts";

/** Thresholds, in one place. */
export const THRESHOLDS = {
  /** The runner writes its heartbeat every few seconds. */
  runnerStaleMs: 2 * 60_000,
  /** A build worker polls at least every few seconds while it runs. */
  workerStaleMs: 5 * 60_000,
  /** A queued build task older than this has had time to be claimed. */
  taskQueuedMs: 10 * 60_000,
  /** The sync timer runs every minute. */
  syncStaleMs: 10 * 60_000,
  /** Consecutive failed sync runs that make a failure of the run itself. */
  syncFailStreak: 3,
  /** GitHub API points left in the hour: warn below `warn`, fail below `fail`. */
  rateWarn: 500,
  rateFail: 100,
} as const;

export type CheckState = "ok" | "warn" | "fail";
export type Check = {
  /** Stable name: `runner`, `sync`, `worker:<env id>`, `sync-repo:<repo>`, … */
  id: string;
  state: CheckState;
  /** One plain sentence for operators and maintainers. */
  text: string;
  /** The same for viewers: says that something is wrong, not why. */
  brief: string;
  /** When the check turned bad; null when unknown or ok. */
  since: string | null;
  /** The repo a check is about; viewers who cannot see the repo do not see the check. */
  repo?: string;
  /** Checks of one kind that /healthz/checks reports as one entry with counts, so no repo or environment name leaves the server. */
  group?: "workers" | "sync-repos" | "deadlines";
  /** Set on a job stopped for running past its step's limit: the step an operator acknowledges to clear it. */
  ackStep?: string;
  /** Items a check counts (the liveness check); reported with `of`. */
  count?: number;
  /** Size of the group the check is counted against (tracked repos for `sync-repos`). */
  of?: number;
  /** Dashboard page that shows the cause. */
  to: string;
};
/** `probe`: the unauthenticated endpoint; it reads stored and cached state only (no account inserts, no GitHub App token work). */
export type CheckCtx = { db: DatabaseSync; nowMs: number; probe?: boolean };

const ok = (id: string, to: string, extra: Partial<Check> = {}): Check => ({ id, state: "ok", text: "", brief: "", since: null, to, ...extra });
const minutes = (ms: number): string => (ms < 90 * 60_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 3_600_000)} h`);
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const all = <T>(db: DatabaseSync, sql: string, ...args: (string | number)[]): T[] => db.prepare(sql).all(...args) as T[];

function runnerCheck({ db, nowMs }: CheckCtx): Check[] {
  const hb = (db.prepare("SELECT value FROM settings WHERE key = 'runner_heartbeat'").get() as { value: string } | undefined)?.value ?? null;
  const beat = hb ? Date.parse(hb) : NaN;
  if (!Number.isNaN(beat) && nowMs - beat <= THRESHOLDS.runnerStaleMs) return [ok("runner", "/pipeline")];
  const text = Number.isNaN(beat) ? "The runner has not reported" : `The runner has not reported for ${minutes(nowMs - beat)}`;
  return [{ id: "runner", state: "fail", text, brief: text, since: hb, to: "/pipeline" }];
}

type Env = { id: string; label: string; last_seen_at: string | null; created_at: string };
const enabledEnvs = (db: DatabaseSync): Env[] => all<Env>(db, "SELECT id, label, last_seen_at, created_at FROM build_envs WHERE enabled = 1 ORDER BY id");
const seenRecently = (e: Env, nowMs: number): boolean => e.last_seen_at !== null && nowMs - Date.parse(e.last_seen_at) <= THRESHOLDS.workerStaleMs;

function workerChecks({ db, nowMs }: CheckCtx): Check[] {
  return enabledEnvs(db).map((e) => {
    const id = `worker:${e.id}`;
    if (seenRecently(e, nowMs)) return ok(id, "/envs", { group: "workers" });
    const text = e.last_seen_at ? `Build worker ${e.label} has not reported for ${minutes(nowMs - Date.parse(e.last_seen_at))}` : `Build worker ${e.label} has never reported`;
    return { id, state: "fail", text, brief: "A build worker is not reporting", since: e.last_seen_at ?? e.created_at, to: "/envs", group: "workers" };
  });
}

function queueCheck({ db, nowMs }: CheckCtx): Check[] {
  const cutoff = new Date(nowMs - THRESHOLDS.taskQueuedMs).toISOString();
  // Private tasks that no confidential environment can take are the confidential-env check's.
  const private_ = confidentialReadyAt(db) === null ? ` AND step NOT IN (${PRIVATE_STEPS_SQL})` : "";
  const r = db.prepare(`SELECT COUNT(*) AS n, MIN(queued_at) AS oldest FROM build_tasks WHERE state = 'queued' AND queued_at < ?${private_}`).get(cutoff) as { n: number; oldest: string | null };
  if (!r.n) return [ok("build-queue", "/envs")];
  // Workers that are up but busy leave tasks waiting: that is slow, not broken.
  const anyUp = enabledEnvs(db).some((e) => seenRecently(e, nowMs));
  const text = `${r.n} build task${r.n === 1 ? " has" : "s have"} waited over ${minutes(THRESHOLDS.taskQueuedMs)} for a worker`;
  return [{ id: "build-queue", state: anyUp ? "warn" : "fail", text, brief: text, since: r.oldest, to: "/envs" }];
}

/** Security fixes and scan tests wait, with no other sign, until a confidential build environment has reported. */
function confidentialCheck({ db }: CheckCtx): Check[] {
  if (confidentialReadyAt(db) !== null) return [ok("confidential-env", "/envs")];
  const t = db.prepare(`SELECT COUNT(*) AS n, MIN(queued_at) AS oldest FROM build_tasks WHERE state = 'queued' AND step IN (${PRIVATE_STEPS_SQL})`).get() as { n: number; oldest: string | null };
  const f = db.prepare("SELECT COUNT(*) AS n, MIN(env_wait_at) AS oldest FROM security_findings WHERE state = 'fixing' AND env_wait_at IS NOT NULL").get() as { n: number; oldest: string | null };
  if (!t.n && !f.n) return [ok("confidential-env", "/envs")];
  const parts = [f.n ? `${f.n} security fix${f.n === 1 ? "" : "es"}` : "", t.n ? `${t.n} security build task${t.n === 1 ? "" : "s"}` : ""].filter(Boolean);
  const text = `${parts.join(" and ")} ${t.n + f.n === 1 ? "is" : "are"} waiting for a confidential build environment`;
  const since = [t.oldest, f.oldest].filter((x): x is string => !!x).sort()[0] ?? null;
  return [{ id: "confidential-env", state: "warn", text, brief: "Some builds are waiting for a build environment", since, to: "/envs" }];
}

function syncCheck({ db, nowMs }: CheckCtx): Check[] {
  const runs = all<{ started_at: string; ended_at: string | null; error: string | null }>(db, "SELECT started_at, ended_at, error FROM sync_runs ORDER BY started_at DESC LIMIT 20")
    .filter((r) => r.ended_at !== null || r.error !== null);
  const streak = runs.findIndex((r) => r.error === null);
  const failing = streak === -1 ? runs.length : streak;
  if (failing >= THRESHOLDS.syncFailStreak) {
    return [{ id: "sync", state: "fail", text: `Sync is failing: ${clip(runs[0]!.error ?? "", 140)}`, brief: "Sync is failing", since: runs[failing - 1]!.started_at, to: "/pipeline" }];
  }
  const good = runs.find((r) => r.error === null);
  const last = good?.ended_at ? Date.parse(good.ended_at) : NaN;
  if (Number.isNaN(last)) {
    return trackedNames(db).length ? [{ id: "sync", state: "fail", text: "Sync has not succeeded yet", brief: "Sync has not succeeded yet", since: null, to: "/pipeline" }] : [ok("sync", "/pipeline")];
  }
  if (nowMs - last > THRESHOLDS.syncStaleMs) {
    const text = `No successful sync in ${minutes(nowMs - last)}`;
    return [{ id: "sync", state: "fail", text, brief: text, since: good!.ended_at, to: "/pipeline" }];
  }
  return [ok("sync", "/pipeline")];
}

function syncRepoChecks({ db }: CheckCtx): Check[] {
  const errors = repoErrors(db);
  const total = trackedNames(db).length;
  // When most repos cannot be read the cause is shared (a token that lost access), not one repo: that is a failure.
  const state: CheckState = errors.length * 2 > total ? "fail" : "warn";
  if (!errors.length) return [ok("sync-repos", "/repos", { group: "sync-repos", of: total })];
  return errors.map((e) => {
    const slug = slugOf(e.repo);
    const why = e.kind === "not-found"
      ? `${slug} no longer resolves on GitHub (${e.movedTo ? `moved to ${e.movedTo}` : "moved, renamed or deleted"})`
      : e.kind === "forbidden" ? `${slug} cannot be read: GitHub denied access`
      : e.kind === "transient" ? `${slug} could not be read: GitHub kept failing`
      : `${slug} failed to sync: ${clip(e.message, 120)}`;
    return { id: `sync-repo:${e.repo}`, state, text: why, brief: `${slug} is not syncing`, since: e.since, repo: e.repo, group: "sync-repos", of: total, to: "/repos" } satisfies Check;
  });
}

function accountsCheck({ db, nowMs, probe }: CheckCtx): Check[] {
  const on = listAccounts(db, nowMs, !probe).filter((a) => a.enabled);
  if (on.length && on.every((a) => a.pausedReason || a.auth.loggedIn === false)) {
    const text = on.length === 1 ? "The Claude account is paused" : "All Claude accounts are paused";
    return [{ id: "accounts", state: "fail", text, brief: text, since: null, to: "/accounts" }];
  }
  return [ok("accounts", "/accounts")];
}

function rateCheck({ db, nowMs }: CheckCtx): Check[] {
  const get = (k: string) => (db.prepare("SELECT value FROM settings WHERE key = ?").get(k) as { value: string } | undefined)?.value ?? null;
  const left = Number(get("sync_rate_remaining"));
  const reset = Date.parse(get("sync_rate_reset_at") ?? "");
  // A reading from before the last reset says nothing about the new hour.
  if (get("sync_rate_remaining") === null || Number.isNaN(left) || Number.isNaN(reset) || reset < nowMs || left >= THRESHOLDS.rateWarn) return [ok("github-rate", "/pipeline")];
  const text = `GitHub rate limit is nearly used up: ${left} points left until ${new Date(reset).toISOString().slice(11, 16)} UTC`;
  return [{ id: "github-rate", state: left < THRESHOLDS.rateFail ? "fail" : "warn", text, brief: "GitHub rate limit is nearly used up", since: null, to: "/pipeline" }];
}

/** One warning per step whose job the runner stopped for running past its limit, until an operator acknowledges it or a later job of the step succeeds. */
function deadlineChecks({ db }: CheckCtx): Check[] {
  return deadlineStops(db).map((d) => ({
    id: `deadline:${d.step}`, state: "warn", group: "deadlines", ackStep: d.step, to: `/pipeline/${d.jobId}`, since: d.endedAt,
    text: `${stepTitle(d.step)} was stopped (job ${d.jobId}: ${d.error})${d.count > 1 ? `, ${d.count} times in a row` : ""}`,
    brief: `${stepTitle(d.step)} was stopped for running too long`,
  }));
}

/** Open items that nothing will move and nobody is asked about (fail), or that have not changed for days (warn). Read from the result the runner stores after planner passes. */
function livenessCheck({ db }: CheckCtx): Check[] {
  const l = storedLiveness(db);
  if (!l || (l.stuck === 0 && l.long === 0)) return [ok("liveness", "/stuck", { of: l?.open })];
  const oldest = (v: string) => l.items.filter((i) => i.verdict === v).map((i) => i.since).sort()[0] ?? null;
  if (l.stuck > 0) {
    const text = `${l.stuck} open item${l.stuck === 1 ? " is" : "s are"} stuck: nothing is due and nobody is asked${l.long ? `; ${l.long} more unchanged for days` : ""}`;
    return [{ id: "liveness", state: "fail", text, brief: "Some items are stuck", since: oldest("stuck"), count: l.stuck, of: l.open, to: "/stuck" }];
  }
  const text = `${l.long} open item${l.long === 1 ? " has" : "s have"} not changed for days`;
  return [{ id: "liveness", state: "warn", text, brief: "Some items have not moved for days", since: oldest("long"), count: l.long, of: l.open, to: "/stuck" }];
}

/** Under the GitHub App identity: the app's keys must be readable (fail), and every tracked repo should be in its installation (warn). Nothing is listed under the box account. */
function appIdentityChecks({ db, probe }: CheckCtx): Check[] {
  if (githubIdentity(db) !== "app") return [];
  let keys = false;
  try { keys = readAppSecrets() !== null; } catch { keys = false; }
  if (!keys) {
    const text = "The GitHub identity is the GitHub App, but no app keys are available";
    return [{ id: "app-keys", state: "fail", text, brief: "GitHub sign-in and writes are unavailable", since: null, to: "/admin/github-app" }];
  }
  const { uncovered } = coverageSnapshot(db, !probe);
  if (!uncovered.length) return [ok("app-keys", "/admin/github-app"), ok("app-coverage", "/admin/github-app")];
  const text = `The GitHub App does not cover ${uncovered.length} tracked repo${uncovered.length === 1 ? "" : "s"}: ${clip(uncovered.join(", "), 120)}`;
  return [ok("app-keys", "/admin/github-app"), { id: "app-coverage", state: "warn", text, brief: "The GitHub App does not cover every tracked repo", since: null, count: uncovered.length, to: "/admin/github-app" }];
}

/** The last pass that binds contributors' account ids failed: the earlier PRs of the logins it did not bind count toward no tier until a pass succeeds. */
function authorIdsCheck({ db }: CheckCtx): Check[] {
  const err = (db.prepare("SELECT value FROM settings WHERE key = 'author_ids_error'").get() as { value: string } | undefined)?.value;
  const passed = (db.prepare("SELECT value FROM settings WHERE key = 'author_ids_backfilled'").get() as { value: string } | undefined)?.value;
  // A pass that succeeded after the error supersedes it.
  if (!err || (passed && passed >= (err.split(" ")[0] ?? ""))) return [ok("author-ids", "/contributors")];
  const n = unboundLogins(db).length;
  if (!n) return [ok("author-ids", "/contributors")];
  const at = err.split(" ")[0] ?? null;
  return [{ id: "author-ids", state: "warn", count: n, since: at, to: "/contributors",
    text: `Contributor account ids could not be read (${err.slice(at ? at.length + 1 : 0).trim() || "error"}): the earlier PRs of ${n} login${n === 1 ? "" : "s"} count toward no whitelist tier until the next sync reads them`,
    brief: "Some contributors' whitelist history cannot be read" }];
}

/** The outside-author surge breaker (src/outside.ts) while it is tripped; an operator resumes it on the Pipeline page. */
function outsideSurgeCheck({ db }: CheckCtx): Check[] {
  const t = db.prepare("SELECT reason, tripped_at FROM stage_trips WHERE stage = 'outside-surge' AND active = 1").get() as { reason: string; tripped_at: string } | undefined;
  if (!t) return [ok("outside-surge", "/pipeline")];
  const held = (db.prepare("SELECT COUNT(*) AS n FROM main.outside_holds WHERE reason = 'surge'").get() as { n: number }).n;
  return [{ id: "outside-surge", state: "warn", text: `New items from outside authors are held: ${t.reason}`, brief: "New items from outside authors are held", since: t.tripped_at, count: held, to: "/pipeline" }];
}

/** Every check, in the order the lists show them. */
const SOURCES: ((ctx: CheckCtx) => Check[])[] = [runnerCheck, workerChecks, queueCheck, confidentialCheck, syncCheck, syncRepoChecks, accountsCheck, rateCheck, deadlineChecks, livenessCheck, appIdentityChecks, authorIdsCheck, outsideSurgeCheck];

export function computeChecks(db: DatabaseSync, nowMs: number = Date.now(), probe = false): Check[] {
  return SOURCES.flatMap((f) => f({ db, nowMs, probe }));
}

/** The answer of GET /healthz/checks for staff: states, times and counts only; no repo, environment, account or error text. */
export type PublicCheck = { id: string; state: CheckState; since: string | null; count?: number; of?: number };

export function publicChecks(checks: Check[]): { status: CheckState; checks: PublicCheck[] } {
  const out: PublicCheck[] = [];
  const groups = new Map<string, Check[]>();
  for (const c of checks) {
    if (c.group) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
    else out.push({ id: c.id, state: c.state, since: c.since, ...(c.count !== undefined ? { count: c.count } : {}), ...(c.of !== undefined ? { of: c.of } : {}) });
  }
  for (const [id, list] of groups) {
    const bad = list.filter((c) => c.state !== "ok");
    out.push({
      id, state: bad.some((c) => c.state === "fail") ? "fail" : bad.length ? "warn" : "ok",
      since: bad.map((c) => c.since).filter((x): x is string => !!x).sort()[0] ?? null, count: bad.length, of: list[0]!.of ?? list.length,
    });
  }
  const status = out.some((c) => c.state === "fail") ? "fail" : out.some((c) => c.state === "warn") ? "warn" : "ok";
  return { status, checks: out };
}

/** What an anonymous caller (external monitoring) reads: each check's name and state, without counts or times. */
export const anonymousChecks = (body: ReturnType<typeof publicChecks>): { status: CheckState; checks: Pick<PublicCheck, "id" | "state">[] } =>
  ({ status: body.status, checks: body.checks.map(({ id, state }) => ({ id, state })) });

let cached: { db: DatabaseSync; at: number; full: string; plain: string; fail: boolean } | null = null;

/**
 * Answers GET/HEAD /healthz/checks: 200 when every check is ok or warn, 503 when one fails; returns false for any other request.
 * No auth: anyone gets the names and states (`anonymousChecks`); `staff` (a signed-in operator or maintainer) also gets the times and
 * counts of `publicChecks`. The answer is reused for `ttlMs`, since anyone can call this.
 */
export function serveChecks(req: IncomingMessage, res: ServerResponse, db: DatabaseSync, nowMs: number = Date.now(), ttlMs = 5_000, staff: (req: IncomingMessage) => boolean = () => false): boolean {
  if ((req.method !== "GET" && req.method !== "HEAD") || (req.url ?? "").split("?")[0] !== "/healthz/checks") return false;
  if (!cached || cached.db !== db || Date.now() - cached.at >= ttlMs) {
    let body: ReturnType<typeof publicChecks>;
    try {
      body = publicChecks(computeChecks(db, nowMs, true));
    } catch {
      body = { status: "fail", checks: [{ id: "database", state: "fail", since: null }] };
    }
    cached = { db, at: Date.now(), full: JSON.stringify({ ...body, at: new Date(nowMs).toISOString() }), plain: JSON.stringify(anonymousChecks(body)), fail: body.status === "fail" };
  }
  const text = staff(req) ? cached.full : cached.plain;
  res.writeHead(cached.fail ? 503 : 200, { ...PROBE_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-length": Buffer.byteLength(text) });
  res.end(req.method === "HEAD" ? undefined : text);
  return true;
}
