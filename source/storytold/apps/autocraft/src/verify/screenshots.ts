// Before/after screenshots of UI pull requests (build feature "screenshots"). maybeScreenshot runs inside
// runVerify for a PR head: when the repo's switch is on, it has a screenshot config and the diff touches a UI
// path, a planning call chooses a script from the config's commands and two display tasks render it at the base
// and at the head. It never touches the `verifications` rows that gate merges; its own state is `screenshot_runs`.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { absolute } from "../build/artifacts.ts";
import { BuildError } from "../build/envs.ts";
import { TERMINAL, getTask } from "../build/tasks.ts";
import { holdMerge, ControlError } from "../merge/controls.ts";
import { pilotSqlFor } from "../pilot.ts";
import { backlogHeldSql } from "../dupes/held.ts";
import { leaseItem } from "../runner/leases.ts";
import { scrub } from "../runner/scrub.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { CURRENT_HEAD_SQL, cancelOpen, oneLine, outcomeOf } from "./results.ts";
import { featureOn } from "../build/features.ts";
import { runModelStep } from "../agents/step.ts";
import { VERIFY_COMPARE, VERIFY_SCREENSHOT } from "../agents/steps.ts";
import { cachedDiff, codeDiff, splitDiff } from "../review/diff.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { jobItem } from "../runner/job-items.ts";
import { matchesGlob } from "node:path";
import { getConfig, type ScreenshotConfig } from "./screenshot-config.ts";
import type { CompareParsed, ScreenshotParsed } from "./plan.ts";
import type { VerifyCandidate } from "./candidates.ts";
import type { VerifyDeps } from "./index.ts";
import { SCREENSHOT_STEP, cloneTask, queueScreenshotTasks } from "./tasks.ts";
import type { ScreenshotCompareInput, ScreenshotPlanInput, ShotStep } from "./types.ts";
import type { CollectDeps } from "./results.ts";

/** Characters of diff the screenshot planner is shown. */
export const MAX_SHOT_DIFF_CHARS = 60_000;

/** Injectable parts, so tests need no model. `plan` returns the parsed reply, or null when the call gave no answer. */
export type ScreenshotDeps = {
  plan?: (input: ScreenshotPlanInput, ctx: { ref: string; config: ScreenshotConfig }) => Promise<ScreenshotParsed | null>;
  /** The model comparison of the before/after images; `dir` holds `before/` and `after/`. Null when the call gave no answer. */
  compare?: (input: ScreenshotCompareInput, ctx: { ref: string; dir: string }) => Promise<CompareParsed | null>;
};

type Env = Pick<VerifyDeps, "fetchDiff" | "baseOf" | "model" | "checkout"> & { screenshots?: ScreenshotDeps };
type Cand = Pick<VerifyCandidate, "repo" | "number" | "title" | "body" | "head_oid" | "label" | "review">;

const nowIso = (): string => new Date().toISOString();
const refOf = (c: { repo: string; number: number }): string => `${c.repo}#${c.number}`;

/** The state of a screenshot run for a head: its row is the record that the head was handled. */
export function insertRun(db: DatabaseSync, c: { repo: string; number: number; head_oid: string }, r: { state: string; reason: string | null; baseSha?: string | null; plan?: unknown; headTask?: number | null; baseTask?: number | null }): void {
  const at = nowIso();
  db.prepare(`INSERT OR IGNORE INTO screenshot_runs (repo, number, head_sha, base_sha, state, reason, plan, head_task_id, base_task_id, created_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(c.repo, c.number, c.head_oid, r.baseSha ?? null, r.state, r.reason, r.plan === undefined ? null : JSON.stringify(r.plan), r.headTask ?? null, r.baseTask ?? null, at,
      r.state === "planned" ? null : at);
}

function stage(db: DatabaseSync, c: Cand, name: "screenshot-planned" | "screenshot-skipped", note: string, log: (line: string) => void): void {
  jobItem(db, c.repo, c.number, `${name}: ${note} at ${c.head_oid.slice(0, 7)}`, log);
}

/** Whether any changed path of the diff matches one of the repo's UI globs. */
export const touchesUi = (paths: string[], globs: string[]): boolean => paths.some((p) => globs.some((g) => matchesGlob(p, g)));

/**
 * Plans and queues the screenshots of one PR head, when due. Returns whether tasks were queued. Throws nothing the
 * caller must handle except errors outside the step itself (runVerify catches and logs them).
 */
export async function maybeScreenshot(db: DatabaseSync, c: Cand, deps: Env, log: (line: string) => void, runId: string): Promise<boolean> {
  if (!featureOn(db, "screenshots", c.repo)) return false;
  const config = getConfig(db, c.repo);
  if (!config) return false;
  if (db.prepare("SELECT 1 FROM screenshot_runs WHERE repo = ? AND number = ? AND head_sha = ?").get(c.repo, c.number, c.head_oid)) return false;
  const ref = refOf(c);
  const d = await cachedDiff(c.repo, c.number, c.head_oid, deps.fetchDiff);
  if (!d.ok) { log(`  ${ref}: screenshots: no diff: ${d.error}`); return false; }
  if (!touchesUi(splitDiff(d.text).map((f) => f.path), config.ui_paths)) return false;
  const base = await deps.baseOf(c.repo, c.number);
  if (!base) { log(`  ${ref}: screenshots: no base commit`); return false; }

  const cd = codeDiff(d.text, true);
  const input: ScreenshotPlanInput = {
    ref, title: c.title, body: c.body, label: c.label, review: c.review, files: cd.files, diff: cd.text.slice(0, MAX_SHOT_DIFF_CHARS),
    commands: Object.entries(config.commands).map(([name, s]) => ({ name, doc: s.doc, params: s.params, capture: s.capture === true })),
    ...(config.size ? { size: config.size } : {}),
  };
  const plan = deps.screenshots?.plan ?? (async (i: ScreenshotPlanInput, x: { ref: string; config: ScreenshotConfig }): Promise<ScreenshotParsed | null> => {
    const checkout = (await deps.checkout?.(c.repo, c.number, c.head_oid)) ?? undefined;
    if (checkout) i.repo_dir = REPO_PATH;
    const r = await runModelStep(db, VERIFY_SCREENSHOT, i, {
      model: deps.model, checkout, ctx: x,
      usage: { run: runId, agent: `screenshot-${c.number}`, stage: "verify", items: (ok: boolean) => (ok ? 1 : 0) },
    });
    return r.ok ? r.value : null;
  });
  const result = await plan(input, { ref, config });
  if (!result) { log(`  ${ref}: screenshots: no answer from the planner`); return false; }
  if (!result.ok) {
    log(`  ${ref}: screenshots: invalid plan: ${result.error}`);
    insertRun(db, c, { state: "error", reason: `invalid plan: ${result.error}`.slice(0, 300), baseSha: base });
    return false;
  }
  const p = result.plan;
  if (!p.screenshot) {
    insertRun(db, c, { state: "skipped", reason: p.reason, baseSha: base });
    stage(db, c, "screenshot-skipped", p.reason, log);
    return false;
  }
  try {
    const ids = queueScreenshotTasks(db, p.steps, config, { repo: c.repo, number: c.number, head: c.head_oid, base });
    if (!ids.length) return false;   // the switch went off since the check above
    insertRun(db, c, { state: "planned", reason: p.reason, baseSha: base, plan: { steps: p.steps }, headTask: ids[0] ?? null, baseTask: ids[1] ?? null });
    stage(db, c, "screenshot-planned", `${p.steps.length} steps: ${p.reason}`, log);
    return true;
  } catch (e) {
    if (!(e instanceof BuildError)) throw e;
    log(`  ${ref}: screenshots: tasks not queued: ${e.message}`);
    insertRun(db, c, { state: "error", reason: `tasks not queued: ${e.message}`.slice(0, 300), baseSha: base });
    return false;
  }
}

// ---- collecting ---------------------------------------------------------------

type Run = {
  repo: string; number: number; head_sha: string; base_sha: string | null; state: string; plan: string | null;
  head_task_id: number | null; base_task_id: number | null; item_state: string | null; item_head: string | null;
  title: string | null; body: string | null;
};
const TERMINAL_SQL = TERMINAL.map((x) => `'${x}'`).join(", ");
const SHOT_RE = /^s\d+\.png$/;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8192;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The sha256 of a stored screenshot, or null when it is not a PNG of at most 8 MB and 8192 x 8192 pixels. Checks the size and the header before reading the whole file. */
async function validImageHash(file: string): Promise<string | null> {
  try {
    const st = await stat(file);
    if (!st.isFile() || st.size < 33 || st.size > MAX_IMAGE_BYTES) return null;
    const fh = await open(file, "r");
    const head = Buffer.alloc(24);
    try { await fh.read(head, 0, 24, 0); } finally { await fh.close(); }
    if (!head.subarray(0, 8).equals(PNG_SIGNATURE) || head.readUInt32BE(8) !== 13 || head.subarray(12, 16).toString("latin1") !== "IHDR") return null;
    const w = head.readUInt32BE(16), h = head.readUInt32BE(20);
    if (w < 1 || h < 1 || w > MAX_IMAGE_SIDE || h > MAX_IMAGE_SIDE) return null;
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch { return null; }
}

/** Whether a run in flight has work: its tasks ended or started, its PR moved or closed, or the repo's switch went off. */
export function screenshotsDue(db: DatabaseSync): boolean {
  if (db.prepare(`SELECT 1 FROM screenshot_runs r
    LEFT JOIN items i ON i.repo = r.repo AND i.number = r.number
    LEFT JOIN pr_checks c ON c.repo = r.repo AND c.number = r.number
    LEFT JOIN build_tasks h ON h.id = r.head_task_id
    LEFT JOIN build_tasks b ON b.id = r.base_task_id
    WHERE r.state IN ('planned', 'running') AND ${pilotSqlFor("r.repo", "r.number")} AND NOT ${backlogHeldSql("r")} AND (
      i.state IS NOT 'OPEN' OR (${CURRENT_HEAD_SQL}) IS NOT r.head_sha
      OR (h.state IN (${TERMINAL_SQL}) AND (b.id IS NULL OR b.state IN (${TERMINAL_SQL})))
      OR (r.state = 'planned' AND (h.state IN ('claimed', 'running') OR b.state IN ('claimed', 'running'))))
    LIMIT 1`).get()) return true;
  const repos = db.prepare(`SELECT DISTINCT r.repo FROM screenshot_runs r WHERE r.state IN ('planned', 'running') AND ${pilotSqlFor("r.repo", "r.number")} AND NOT ${backlogHeldSql("r")}`).all() as { repo: string }[];
  return repos.some((r) => !featureOn(db, "screenshots", r.repo));
}

/** The default comparison: Opus reads the image pairs from `dir`, mounted as the call's read-only checkout (a plain directory works: nothing of the sandbox needs a repository). */
async function compareWithModel(db: DatabaseSync, input: ScreenshotCompareInput, ctx: { ref: string; dir: string }, runId: string, n: number): Promise<CompareParsed | null> {
  const r = await runModelStep(db, VERIFY_COMPARE, { ...input, repo_dir: REPO_PATH }, {
    checkout: ctx.dir, ctx: { ref: ctx.ref },
    usage: { run: runId, agent: `screenshot-compare-${n}`, stage: "verify", items: (ok: boolean) => (ok ? 1 : 0) },
  });
  return r.ok ? r.value : null;
}

/**
 * Reads the screenshot runs that are planned or running: ends them when their PR moved on or the switch went off,
 * and when both tasks have ended compares the images. Returns how many runs left planned/running. Only a clear
 * regression holds the merge, and only while the head is still the run's head; any error holds nothing.
 */
export async function collectScreenshots(db: DatabaseSync, deps: Pick<CollectDeps, "screenshots">, log: (line: string) => void, runId: string, stopping?: () => boolean): Promise<number> {
  const rows = db.prepare(`SELECT r.*, i.state AS item_state, ${CURRENT_HEAD_SQL} AS item_head, i.title AS title, i.body AS body FROM screenshot_runs r
    LEFT JOIN items i ON i.repo = r.repo AND i.number = r.number
    LEFT JOIN pr_checks c ON c.repo = r.repo AND c.number = r.number
    WHERE r.state IN ('planned', 'running') AND ${pilotSqlFor("r.repo", "r.number")} AND NOT ${backlogHeldSql("r")} ORDER BY r.created_at, r.number`).all() as Run[];
  let changed = 0;
  for (const r of rows) {
    if (stopping?.()) break;
    const release = leaseItem(db, `pr:${r.repo}#${r.number}`, log);
    if (!release) continue;
    try { if (await collectOne(db, r, deps, log, runId)) changed++; } catch (e) { log(`  ${r.repo}#${r.number}: screenshots: ${(e as Error).message}`); } finally { release(); }
  }
  return changed;
}

async function collectOne(db: DatabaseSync, r: Run, deps: Pick<CollectDeps, "screenshots">, log: (line: string) => void, runId: string): Promise<boolean> {
  const ref = `${r.repo}#${r.number}`, sha7 = r.head_sha.slice(0, 7);
  const at = (): string => new Date().toISOString();
  const finish = (state: string, f: { reason?: string | null; verdict?: string; clear?: boolean; comparison?: string; model?: string } = {}): boolean =>
    Number(db.prepare(`UPDATE screenshot_runs SET state = ?, reason = COALESCE(?, reason), verdict = ?, clear = ?, comparison = ?, model = ?, finished_at = ?
      WHERE repo = ? AND number = ? AND head_sha = ? AND state IN ('planned', 'running')`)
      .run(state, f.reason ?? null, f.verdict ?? null, f.clear === undefined ? null : f.clear ? 1 : 0, f.comparison ?? null, f.model ?? null, at(), r.repo, r.number, r.head_sha).changes) > 0;
  // The only stage row a screenshot run writes is `hold`; its other outcomes are read from screenshot_runs.
  const row = (stageName: string, note: string): void => { jobItem(db, r.repo, r.number, `${stageName}: ${note} at ${sha7}`, log); };
  const ids = [r.head_task_id, r.base_task_id];

  if (!featureOn(db, "screenshots", r.repo)) {
    cancelOpen(db, ids);
    return finish("skipped", { reason: "screenshots switched off" });
  }
  if (r.item_state !== "OPEN" || r.item_head !== r.head_sha) {
    cancelOpen(db, ids);
    if (finish("stale", {})) { jobItem(db, r.repo, r.number, `screenshots stale (${r.item_state === "OPEN" ? "head moved" : "no longer open"})`, log); return true; }
    return false;
  }
  const head = r.head_task_id === null ? null : getTask(db, r.head_task_id);
  const base = r.base_task_id === null ? null : getTask(db, r.base_task_id);
  if (!head || !base) { const w = "the build task is gone"; if (finish("error", { reason: w })) { row("screenshot-error", w); return true; } return false; }
  if (![head, base].every((t) => TERMINAL.includes(t.state))) {
    if (r.state === "planned" && [head, base].some((t) => t.state === "claimed" || t.state === "running")) {
      db.prepare("UPDATE screenshot_runs SET state = 'running' WHERE repo = ? AND number = ? AND head_sha = ? AND state = 'planned'").run(r.repo, r.number, r.head_sha);
      return true;
    }
    return false;
  }

  const fail = (why: string): boolean => {
    const w = oneLine(why);
    if (!finish("error", { reason: w })) return false;
    row("screenshot-error", w);
    return true;
  };
  // A lost task or a build-environment error says nothing about the change: the pair is queued again once, as Verify does.
  const outcomes = [["head", head, outcomeOf(head)], ["base", base, outcomeOf(base)]] as const;
  if (outcomes.some(([, t, o]) => o.kind === "error" && t.state !== "cancelled")) {
    const tries = (db.prepare("SELECT COUNT(*) AS n FROM build_tasks WHERE step = ? AND repo = ? AND number = ? AND head_sha = ? AND warm_role = 'use'").get(SCREENSHOT_STEP, r.repo, r.number, r.head_sha) as { n: number }).n;
    if (tries <= 1) {
      try {
        const [h, b] = [head.id, base.id].map((id) => cloneTask(db, id)) as [number, number];
        db.prepare("UPDATE screenshot_runs SET head_task_id = ?, base_task_id = ?, state = 'planned' WHERE repo = ? AND number = ? AND head_sha = ?").run(h, b, r.repo, r.number, r.head_sha);
        jobItem(db, r.repo, r.number, "screenshot render failed in the build environment; queued the tasks again", log);
        return true;
      } catch (e) { if (!(e instanceof BuildError)) throw e; }
    }
  }
  for (const [role, , o] of outcomes) {
    if (o.kind === "fail") return fail(`${role} render step "${o.step}" ${o.timedOut ? "timed out" : `failed (exit ${o.exitCode ?? "none"})`}`);
    if (o.kind === "error") return fail(`${role}: ${o.reason}`);
  }

  const shotsOf = (id: number): Map<string, string> => new Map((db.prepare("SELECT name, file FROM build_artifacts WHERE task_id = ? ORDER BY name").all(id) as { name: string; file: string }[])
    .filter((a) => SHOT_RE.test(a.name)).map((a) => [a.name, a.file]));
  const before = shotsOf(base.id), after = shotsOf(head.id);
  const names = [...after.keys()].sort((a, b) => Number(a.slice(1, -4)) - Number(b.slice(1, -4)));
  if (!names.length) return fail("the render stored no screenshot");
  if (names.length !== before.size || names.some((x) => !before.has(x))) return fail("the base and the head produced different sets of screenshots");
  const files = (m: Map<string, string>, name: string): string | null => absolute(m.get(name)!);
  const pairs = names.map((name) => ({ name, b: files(before, name), a: files(after, name) }));
  if (pairs.some((p) => !p.a || !p.b)) return fail("a stored screenshot is missing");
  // Images are the render's output, so they are untrusted: PNG signature, size and dimensions are checked before anything reads or copies them.
  const hashes: [string, string][] = [];
  for (const p of pairs) {
    const [a, b] = [await validImageHash(p.a!), await validImageHash(p.b!)];
    if (!a || !b) return fail("the render stored an invalid image");
    hashes.push([a, b]);
  }
  const same = hashes.every(([a, b]) => a === b);
  if (same) {
    if (!finish("compared", { verdict: "unchanged", comparison: "The screens are identical before and after." })) return false;
    row("screenshot-compared", "unchanged");
    return true;
  }

  const script: ShotStep[] = (() => { try { return (JSON.parse(r.plan ?? "{}") as { steps?: ShotStep[] }).steps ?? []; } catch { return []; } })();
  const rev = db.prepare("SELECT verdict, reason FROM opus_reviews WHERE repo = ? AND number = ? AND head_oid = ? AND verdict IS NOT NULL").get(r.repo, r.number, r.head_sha) as { verdict: string; reason: string | null } | undefined;
  const input: ScreenshotCompareInput = {
    ref, title: r.title ?? "", body: r.body ?? "", script, review: rev ? { verdict: rev.verdict, reason: rev.reason ?? "" } : null,
    shots: names.map((name) => ({ name, before: `before/${name}`, after: `after/${name}` })),
  };
  const dir = mkdtempSync(join(tmpdir(), "shots-"));
  let parsed: CompareParsed | null;
  try {
    mkdirSync(join(dir, "before")); mkdirSync(join(dir, "after"));
    for (const p of pairs) { copyFileSync(p.b!, join(dir, "before", p.name)); copyFileSync(p.a!, join(dir, "after", p.name)); }
    parsed = await (deps.screenshots?.compare ?? ((i, x) => compareWithModel(db, i, x, runId, r.number)))(input, { ref, dir });
  } catch (e) {
    return fail(`the comparison failed: ${(e as Error).message}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  if (!parsed) return fail("no answer from the comparison");
  if (!parsed.ok) return fail(`invalid comparison: ${parsed.error}`);
  const { verdict, clear } = parsed.result;
  const summary = scrub(parsed.result.summary);
  const model = CLAUDE_PROMPTS["verify.compare"].models[0];
  if (!finish("compared", { verdict, clear, comparison: summary, model })) return false;

  if (verdict === "regression" && clear) {
    // The head may have moved, or the switch gone off, while the model looked: hold only the head that was compared, and only while the feature is on.
    const now = db.prepare(`SELECT i.state AS s, ${CURRENT_HEAD_SQL} AS h FROM items i LEFT JOIN pr_checks c ON c.repo = i.repo AND c.number = i.number WHERE i.repo = ? AND i.number = ?`).get(r.repo, r.number) as { s: string; h: string | null } | undefined;
    if (featureOn(db, "screenshots", r.repo) && now?.s === "OPEN" && now.h === r.head_sha) {
      try {
        if (holdMerge(db, "screenshots", r.repo, r.number, { head: r.head_sha, summary })) {
          db.prepare("UPDATE screenshot_runs SET held = 1 WHERE repo = ? AND number = ? AND head_sha = ?").run(r.repo, r.number, r.head_sha);
          db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, 'hold', ?, 'verify', ?)").run(r.repo, r.number, at(), `screenshots show a regression: ${summary}`.slice(0, 300));
          row("screenshot-regression", summary);
          return true;
        }
      } catch (e) { if (!(e instanceof ControlError)) throw e; }
    }
  }
  row("screenshot-compared", `${verdict}${clear ? "" : ", not clear"}: ${summary}`);
  return true;
}
