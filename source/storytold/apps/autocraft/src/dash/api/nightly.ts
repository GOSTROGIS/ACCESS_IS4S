// The Nightly page: per repo, the catalogue's checks with their last 14 nights and the benchmark series. Repos the
// viewer cannot see are left out (a bench or selection request for one is a 404). Only operators change a selection.
import type { DatabaseSync } from "node:sqlite";
import type { NightlyBench, NightlyCell, NightlyCheckRow, NightlyGrid, NightlyRepo, NightlySeries } from "../../../web/src/api/types.ts";
import { featureOn } from "../../build/features.ts";
import { audit } from "../audit.ts";
import { BENCH_MIN_HISTORY, BENCH_WINDOW, NIGHTLY_CHECKS, benchSeries, checkOf, recentRuns, selectionOf, setSelection } from "../../nightly/index.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { visibleRepos } from "./visible.ts";

const NIGHTS = 14;
const SPARK_POINTS = 30;
/** Crate and target names reach argv only; this is the same shape the catalogue's steps accept. */
const NAME = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_NAMES = 40;

/** Crates for wasm, windows, miri, bench and asan; fuzz targets for fuzz; nothing for audit. */
const takesOf = (id: string): NightlyCheckRow["takes"] => (id === "audit" ? null : id === "fuzz" ? "targets" : "crates");

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

function benchesOf(db: DatabaseSync, repo: string): NightlyBench[] {
  const names = (db.prepare("SELECT DISTINCT bench FROM nightly_bench WHERE repo = ? ORDER BY bench").all(repo) as { bench: string }[]).map((r) => r.bench);
  return names.map((name) => {
    const s = benchSeries(db, repo, name);
    const last = s[s.length - 1]!;
    const before = s.slice(-1 - BENCH_WINDOW, -1).map((p) => p.value);
    const base = before.length >= BENCH_MIN_HISTORY ? median(before) : 0;
    return { name, unit: last.unit, latest: last.value, deltaPct: base > 0 ? Math.round(((last.value - base) / base) * 1000) / 10 : null, points: s.slice(-SPARK_POINTS).map((p) => p.value), at: last.at };
  });
}

function repoOf(db: DatabaseSync, repo: string): NightlyRepo {
  const runs = recentRuns(db, repo, NIGHTS);
  const sel = selectionOf(db, repo);
  const checks = NIGHTLY_CHECKS.map((c): NightlyCheckRow => {
    const s = sel.find((x) => x.checkId === c.id);
    const cells = runs.map((u): NightlyCell | null => {
      const r = u.results.find((x) => x.checkId === c.id);
      return r ? { state: r.state, taskId: r.taskId, summary: r.summary, issueNumber: r.issueNumber } : null;
    });
    return { id: c.id, label: c.label, enabled: s?.enabled ?? false, experimental: !!c.experimental, needs: c.needs ?? null, takes: takesOf(c.id), crates: s?.crates ?? [], targets: s?.targets ?? [], cells };
  });
  return { repo, on: featureOn(db, "nightly", repo), nights: runs.map((u) => ({ runId: u.id, startedAt: u.startedAt, sha: u.sha })), checks, benches: benchesOf(db, repo) };
}

/** Repos with the switch on, any selection row or any run. */
const shown = (db: DatabaseSync, repo: string): boolean =>
  featureOn(db, "nightly", repo) || !!db.prepare("SELECT 1 FROM nightly_selection WHERE repo = ? UNION ALL SELECT 1 FROM nightly_runs WHERE repo = ? LIMIT 1").get(repo, repo);

export const grid = async (db: DatabaseSync, req: Req): Promise<NightlyGrid> =>
  ({ repos: (await visibleRepos(db, req)).filter((r) => shown(db, r)).map((r) => repoOf(db, r)) });

async function visible(db: DatabaseSync, req: Req, repo: unknown): Promise<string> {
  if (typeof repo !== "string" || !(await visibleRepos(db, req)).includes(repo)) throw new HttpError(404, "no such repo");
  return repo;
}

export const series = async (db: DatabaseSync, req: Req): Promise<NightlySeries> => {
  const repo = await visible(db, req, req.params.repo);
  const points = benchSeries(db, repo, req.params.bench ?? "");
  if (!points.length) throw new HttpError(404, "no such benchmark");
  return { repo, bench: points[0]!.bench, unit: points[points.length - 1]!.unit, points: points.map(({ sha, at, value }) => ({ sha, at, value })) };
};

function names(v: unknown, what: string): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > MAX_NAMES || !v.every((x) => typeof x === "string" && NAME.test(x))) throw new HttpError(400, `${what} must be up to ${MAX_NAMES} names of letters, digits, _ and -`);
  return [...new Set(v as string[])];
}

export const select = async (db: DatabaseSync, req: Req): Promise<NightlyGrid> => {
  const b = (req.json ?? {}) as { repo?: unknown; check?: unknown; enabled?: unknown; crates?: unknown; targets?: unknown };
  const repo = await visible(db, req, b.repo);
  if (typeof b.check !== "string" || !checkOf(b.check)) throw new HttpError(400, `check must be one of ${NIGHTLY_CHECKS.map((c) => c.id).join(", ")}`);
  if (typeof b.enabled !== "boolean") throw new HttpError(400, "enabled must be true or false");
  const crates = names(b.crates, "crates");
  const targets = names(b.targets, "targets");
  setSelection(db, repo, b.check, b.enabled, { crates, targets });
  audit(db, req.user.login, "nightly-select", repo, { check: b.check, enabled: b.enabled, crates: crates ?? null, targets: targets ?? null });
  return grid(db, req);
};
