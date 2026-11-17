// Build environments and tasks over JSON. Everyone signed in reads (tasks of repos
// the viewer cannot see are left out); only operators register or change an
// environment, rotate its key or cancel a task, all audited. A worker key is
// returned once, on creation and rotation. Whatever a worker reported is data:
// viewers get neither logs, patches nor artifact downloads; the page shows it as text and artifacts download with `attachment` (PNG inline),
// `nosniff` and `Content-Security-Policy: sandbox`.
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { BuildEnv, BuildFeatureState, ScreenshotSetups, BuildFeatures, BuildSummary, BuildTask, BuildTaskDetail, TaskFilter, TaskPage, TaskState } from "../../../web/src/api/types.ts";
import { absolute } from "../../build/artifacts.ts";
import { BuildError, createEnv, listEnvs, rotateKey, updateEnv } from "../../build/envs.ts";
import { PRIVATE_STEPS, PRIVATE_STEPS_SQL, cancelTask, getTaskDetail, listTasks, summary } from "../../build/tasks.ts";
import { BUILD_FEATURES, REPO_SCOPED, featureStates, isFeature, setFeature } from "../../build/features.ts";
import { ScreenshotConfigError, deleteConfig, listConfigs, putConfig } from "../../verify/screenshot-config.ts";
import { audit } from "../audit.ts";
import { scopeOf, perDayOf, setScope, setPerDay } from "../../prbuild/select.ts";
import type { PrBuildScope } from "../../../web/src/api/types.ts";
import { HttpError } from "../server/util.ts";
import type { Req, Res } from "../types.ts";
import { hiddenRepos, visibleRepos } from "./visible.ts";
import { canSeeInternals } from "./staff.ts";
import { isHiddenRepo } from "../../hidden-sql.ts";

const wrap = async <T>(f: () => T | Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    if (e instanceof BuildError) throw new HttpError(e.status, e.message);
    throw e;
  }
};

/** Operators see every environment; others only the enabled ones. */
export const envs = (db: DatabaseSync, req: Req): BuildEnv[] => listEnvs(db).filter((e) => e.enabled || canSeeInternals(req));

export const postEnv = (db: DatabaseSync, req: Req) => wrap(() => createEnv(db, req.json, req.user.login));
export const putEnv = (db: DatabaseSync, req: Req) => wrap(() => updateEnv(db, req.params.id, req.json, req.user.login));
export const postRotate = (db: DatabaseSync, req: Req) => wrap(() => rotateKey(db, req.params.id, req.user.login));

function intParam(req: Req, name: string): number | undefined {
  const v = req.query.get(name);
  if (v === null || v === "") return undefined;
  if (!/^\d{1,4}$/.test(v)) throw new HttpError(400, `${name} must be a whole number`);
  return Number(v);
}

export const tasks = (db: DatabaseSync, req: Req): Promise<TaskPage> => wrap(async () => {
  const q = (k: string) => req.query.get(k) || undefined;
  const repo = q("repo");
  const hidden = await hiddenRepos(db, req);
  if (repo && isHiddenRepo(hidden, repo)) throw new HttpError(404, `${repo} is not a tracked repo`);
  const f: TaskFilter = { state: q("state") as TaskState | "active" | undefined, env: q("env"), repo, cursor: q("cursor"), limit: intParam(req, "limit") };
  return listTasks(db, f, hidden, canSeeInternals(req));
});

async function visibleTask(db: DatabaseSync, req: Req): Promise<BuildTaskDetail> {
  if (!/^\d{1,15}$/.test(req.params.id ?? "")) throw new HttpError(400, "not a task id");
  const t = getTaskDetail(db, Number(req.params.id));
  // The same answer for a task that does not exist and one of a repo the viewer cannot see.
  if (!t || isHiddenRepo(await hiddenRepos(db, req), t.repo) || (PRIVATE_STEPS.includes(t.step) && !canSeeInternals(req))) throw new HttpError(404, "no such task");
  return t;
}

/** Viewers get the task without its log and patch. */
export const task = (db: DatabaseSync, req: Req) => wrap(async (): Promise<BuildTaskDetail> => {
  const t = await visibleTask(db, req);
  return canSeeInternals(req) ? t : { ...t, logTail: null, logBytes: 0, logTruncated: false, patch: null };
});

export const cancel = (db: DatabaseSync, req: Req): Promise<BuildTask> => wrap(async () => {
  await visibleTask(db, req);
  return cancelTask(db, req.params.id, req.user.login);
});

export const buildSummary = async (db: DatabaseSync, req: Req): Promise<BuildSummary> => summary(db, await hiddenRepos(db, req), canSeeInternals(req));

async function featuresOf(db: DatabaseSync, req: Req): Promise<BuildFeatures> {
  const tracked = new Set((db.prepare("SELECT name FROM main.tracked_repos").all() as { name: string }[]).map((r) => r.name));
  const repos = (await visibleRepos(db, req)).filter((r) => tracked.has(r)).sort();
  const shown = new Set(repos);
  const features: BuildFeatureState[] = featureStates(db).map((s) => ({ ...s, repoScoped: REPO_SCOPED[s.feature], repos: s.repos.filter((r) => shown.has(r)) }));
  const scopes: Record<string, PrBuildScope> = {};
  for (const r of repos) scopes[r] = scopeOf(db, r);
  return { features, repos, prBuilds: { scopes, perDay: perDayOf(db) } };
}

export const features = async (db: DatabaseSync, req: Req): Promise<BuildFeatures> => {
  if (!canSeeInternals(req)) throw new HttpError(403, "only operators and maintainers read the build features");
  return featuresOf(db, req);
};

export const postFeature = async (db: DatabaseSync, req: Req): Promise<BuildFeatures> => {
  const b = (req.json ?? {}) as { feature?: unknown; on?: unknown; repo?: unknown; scope?: unknown; perDay?: unknown };
  if (!isFeature(b.feature)) throw new HttpError(400, `feature must be one of ${BUILD_FEATURES.join(", ")}`);
  const tracked = (r: unknown): r is string => typeof r === "string" && !!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(r);
  // Every field is checked before anything is written.
  if (b.scope !== undefined || b.perDay !== undefined) {
    if (b.feature !== "pr-builds") throw new HttpError(400, "only pr-builds has a scope and a daily cap");
    if (b.scope !== undefined && b.scope !== "outside" && b.scope !== "all") throw new HttpError(400, "scope must be outside or all");
    if (b.scope !== undefined && !tracked(b.repo)) throw new HttpError(400, "repo must be a tracked repo");
    if (b.perDay !== undefined && (typeof b.perDay !== "number" || !Number.isInteger(b.perDay) || b.perDay < 0 || b.perDay > 1000)) throw new HttpError(400, "perDay must be a whole number from 0 to 1000");
  }
  if (b.on !== undefined && typeof b.on !== "boolean") throw new HttpError(400, "on must be true or false");
  if (b.on === undefined && b.scope === undefined && b.perDay === undefined) throw new HttpError(400, "on must be true or false");
  let repo: string | undefined;
  if (b.on !== undefined && b.repo !== undefined && b.repo !== null) {
    if (!tracked(b.repo)) throw new HttpError(400, "repo must be a tracked repo");
    if (!REPO_SCOPED[b.feature]) throw new HttpError(400, `${b.feature} has no per-repo switch`);
    repo = b.repo;
  }
  if (b.scope !== undefined && scopeOf(db, b.repo as string) !== b.scope) { setScope(db, b.repo as string, b.scope as PrBuildScope); audit(db, req.user.login, "build-feature", "pr-builds", { feature: "pr-builds", scope: b.scope, repo: b.repo }); }
  if (b.perDay !== undefined && perDayOf(db) !== b.perDay) { setPerDay(db, b.perDay as number); audit(db, req.user.login, "build-feature", "pr-builds", { feature: "pr-builds", perDay: b.perDay }); }
  if (typeof b.on === "boolean") setFeature(db, b.feature, b.on, req.user.login, repo);
  return featuresOf(db, req);
};

async function screenshotSetups(db: DatabaseSync, req: Req): Promise<ScreenshotSetups> {
  const shown = new Set(await visibleRepos(db, req));
  return { setups: listConfigs(db).filter((c) => shown.has(c.repo)).map(({ repo, updatedBy, updatedAt, ...config }) => ({ repo, config, updatedBy, updatedAt })) };
}

function trackedRepo(db: DatabaseSync, repo: string): string {
  if (!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(repo)) throw new HttpError(400, "repo must be a tracked repo");
  return repo;
}

export const screenshots = async (db: DatabaseSync, req: Req): Promise<ScreenshotSetups> => {
  if (!canSeeInternals(req)) throw new HttpError(403, "only operators and maintainers read the screenshot setup");
  return screenshotSetups(db, req);
};

export const putScreenshots = async (db: DatabaseSync, req: Req): Promise<ScreenshotSetups> => {
  const repo = trackedRepo(db, req.params.repo);
  try {
    putConfig(db, req.user.login, repo, req.json);
  } catch (e) {
    if (e instanceof ScreenshotConfigError) throw new HttpError(400, e.message);
    throw e;
  }
  return screenshotSetups(db, req);
};

export const deleteScreenshots = async (db: DatabaseSync, req: Req): Promise<ScreenshotSetups> => {
  if (!deleteConfig(db, req.user.login, req.params.repo)) throw new HttpError(404, "no screenshot setup for that repo");
  return screenshotSetups(db, req);
};

export async function artifact(db: DatabaseSync, req: Req): Promise<Res> {
  try {
    if (!canSeeInternals(req)) throw new HttpError(403, "only operators and maintainers download artifacts");
    const t = await visibleTask(db, req);
    const a = t.artifacts.find((x) => x.name === req.params.name);
    const row = a && (db.prepare("SELECT file FROM build_artifacts WHERE task_id = ? AND name = ?").get(t.id, a.name) as { file: string } | undefined);
    const path = row && absolute(row.file);
    if (!a || !path) throw new HttpError(404, "no such artifact");
    let data: Buffer;
    try {
      data = readFileSync(path);
    } catch {
      throw new HttpError(404, "the artifact file is gone");
    }
    return {
      body: data,
      headers: {
        "content-type": a.contentType === "image/png" ? "image/png" : `${a.contentType}; charset=utf-8`,
        "content-disposition": `${a.contentType === "image/png" ? "inline" : "attachment"}; filename="${a.name.replace(/[^A-Za-z0-9._-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(a.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "content-security-policy": "sandbox",
        "cache-control": "private, max-age=300",
      },
    };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, json: { error: e.message } };
    throw e;
  }
}
