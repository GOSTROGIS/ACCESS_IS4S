// Operator tool: `autocraft fixup try REPO#N` runs the fix-up patch step for one PR as the stage does (the same sandboxed
// model call with the check tool, then apply, validate, the Opus patch check and the lint task) and prints what happened.
// It stores no fixups row, records no check or audit row and writes nothing to GitHub; model usage, model_checks and the
// worker tasks are recorded as for any run. The pipeline setting and the stage's limits do not apply.
import { modelText, servingLabel } from "../agents/provenance.ts";
import { mkdirSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { getTask, TERMINAL } from "../build/tasks.ts";
import { CheckTool, applyCheck, refusal } from "../checktool/index.ts";
import { CHECK_DIFF_CAP, CHECK_PATCH_CAP } from "../patchcheck/types.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { parseCheck, checkLine } from "../patchcheck/index.ts";
import { queueLintFor, readLint } from "../prepush/index.ts";
import { cachedDiff } from "../review/diff.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { parseFixes } from "./candidates.ts";
import { DIFF_CAP, FILE_CAP, TOTAL_CAP, defaultDeps, type FixupDeps } from "./index.ts";
import { shownSize, viewFile } from "./excerpt.ts";
import { Git } from "./git.ts";
import { buildScriptsAt, fixupEditable, validatePatch, type FixupPr } from "./patch.ts";
import { ownerOf } from "../owners.ts";

const LINT_GIVE_UP_MS = 90 * 60_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const indent = (s: string) => s.trimEnd().split("\n").map((l) => `  ${l}`).join("\n");

/** Returns the exit code: 0 clean, 2 when the lint task found something or the Opus check rejected, 1 on an error. */
const BASE_QUERY = `query($owner: String!, $name: String!, $n: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $n) { baseRefOid } } }`;

export async function runFixupTry(db: DatabaseSync, repo: string, number: number, d: FixupDeps = defaultDeps(), log: (line: string) => void = console.log): Promise<number> {
  const ref = `${repo}#${number}`;
  const item = db.prepare("SELECT head_oid, title FROM items WHERE repo = ? AND number = ? AND kind = 'pr'").get(repo, number) as { head_oid: string | null; title: string | null } | undefined;
  if (!item?.head_oid) throw new Error(`${ref} is not a PR in the database`);
  const review = db.prepare("SELECT fixes, reason, verdict FROM final_reviews WHERE repo = ? AND number = ? AND head_oid = ? ORDER BY at DESC LIMIT 1").get(repo, number, item.head_oid) as { fixes: string | null; reason: string | null; verdict: string } | undefined;
  if (!review) throw new Error(`${ref} has no review at its head ${item.head_oid.slice(0, 7)}`);
  if (review.verdict !== "take-fix") throw new Error(`the latest review of ${ref} at its head is ${review.verdict}, not take-fix`);
  const fixes = parseFixes(review.fixes);
  if (!fixes.length) throw new Error(`the take-fix review of ${ref} lists no usable fix`);
  const files = [...new Set(fixes.map((f) => f.file))];

  mkdirSync(d.root, { recursive: true });
  const git = new Git(d.exec, d.root, repo);
  const head = await git.fetchPr(ownerOf(repo), repo, number);
  if (head !== item.head_oid) throw new Error(`the PR head is now ${head.slice(0, 7)}, not the reviewed ${item.head_oid.slice(0, 7)}`);
  const scripts = await buildScriptsAt(git, head);
  const bad = files.find((f) => !fixupEditable(f, scripts));
  if (bad) throw new Error(`the fixes name ${bad}, which a fix-up may not edit`);
  const diff = await cachedDiff(repo, number, head, d.fetchDiff);
  if (!diff.ok) throw new Error(`no diff: ${diff.error}`);
  if (diff.text.length > DIFF_CAP) throw new Error(`the PR diff is over the ${DIFF_CAP} character limit`);
  const checkout = (await d.checkout?.(repo, number, head)) ?? undefined;
  const repoDir = checkout ? { repo_dir: REPO_PATH } : {};
  const shown: FixupPr["files"] = [];
  let total = 0;
  for (const path of files) {
    const f = await git.file(head, path);
    if (!f.ok) throw new Error(f.reason);
    if (checkout) { shown.push({ path }); continue; }
    const v = viewFile(path, f.content, fixes.filter((x) => x.file === path).map((x) => x.change), diff.text, FILE_CAP);
    if (!v.ok) throw new Error(v.reason);
    total += shownSize(v.file);
    if (total > TOTAL_CAP) throw new Error(`the files named in the fixes are over the ${TOTAL_CAP} character limit`);
    shown.push(v.file);
  }
  log(`${ref} at ${head.slice(0, 7)}: ${fixes.length} fixes in ${files.join(", ")}; ${checkout ? "sandbox checkout ready" : "NO checkout: the model runs without tools"}`);

  const before0 = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM agent_runs").get() as { n: number }).n;
  const before = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM model_checks").get() as { n: number }).n;
  const base = (await d.querier.query(BASE_QUERY, { owner: ownerOf(repo), name: repo, n: number }) as { repository?: { pullRequest?: { baseRefOid?: string } | null } }).repository?.pullRequest?.baseRefOid ?? null;
  const tool = new CheckTool({ db, step: "fixup", repo, number, head, base, applies: applyCheck(git, d.root, head, (p) => refusal(validatePatch(p, files, (x) => fixupEditable(x, scripts)))) });
  const t0 = Date.now();
  const patchAnswer = modelText(await d.ask(db, [{ ref, title: (item.title ?? "").slice(0, 300), fixes, files: shown, diff: diff.text, ...repoDir }], checkout, tool));
  const reply = patchAnswer?.text ?? null;
  log(`model call took ${Math.round((Date.now() - t0) / 1000)} s`);

  const offered = checkout !== undefined && CLAUDE_PROMPTS["fixup.patch"].sandbox?.check === true;
  log(`\ntools given to the model: ${offered ? `${[...CLAUDE_PROMPTS["fixup.patch"].sandbox!.tools, "Agent", "mcp__build__check"].join(", ")} (check offered; commands that returned a result: ${[...tool.ran].join(", ") || "none"})` : "none (no checkout, so no sandbox and no check tool)"}`);
  const runs = db.prepare("SELECT id, summary FROM agent_runs WHERE prompt_id IN ('fixup.patch') AND id > ? ORDER BY id").all(before0) as { id: number; summary: string | null }[];
  for (const r of runs) log(`model call: agent run ${r.id}: ${r.summary ?? "no summary"}`);
  log("tool calls:");
  const calls = db.prepare("SELECT command, crate, test_name, task_id, outcome, started_at, ended_at FROM model_checks WHERE id > ? AND step = 'fixup' AND repo = ? AND number = ? AND head = ? ORDER BY id").all(before, repo, number, head) as
    { command: string; crate: string | null; test_name: string | null; task_id: number | null; outcome: string | null; started_at: string; ended_at: string | null }[];
  if (!calls.length) log("  none");
  for (const c of calls) log(`  ${c.command}${c.crate ? ` -p ${c.crate}` : ""}${c.test_name ? ` ${c.test_name}` : ""}: ${c.outcome ?? "unfinished"} (task ${c.task_id ?? "none"}, ${c.ended_at ? Math.round((Date.parse(c.ended_at) - Date.parse(c.started_at)) / 1000) : "?"} s)`);

  if (reply === null) { log("\nthe model gave no answer"); return 1; }
  const v = validatePatch(reply, files, (x) => fixupEditable(x, scripts));
  if (!v.ok) { log(`\nrefused: ${v.reason}\n\nreply:\n${indent(reply.slice(0, 3000))}`); return 1; }
  log(`\nfinal patch (${v.changed} changed lines):\n${indent(v.patch)}`);
  const applied = await applyCheck(git, d.root, head)(v.patch);
  if (applied) { log(`\nrefused: ${applied}`); return 1; }
  log("\napply: the patch applies to the head");

  let code = 0;
  if (v.patch.length > CHECK_PATCH_CAP) { log(`\nOpus check skipped: the patch is over the ${CHECK_PATCH_CAP} character limit`); return 1; }
  const checkAnswer = modelText(await d.check(db, [{ ref, title: (item.title ?? "").slice(0, 300), review_reason: review.reason ?? "", fixes, diff: diff.text.slice(0, CHECK_DIFF_CAP), patch: v.patch, ...repoDir }], checkout));
  const checkReply = checkAnswer?.text ?? null;
  const verdict = checkReply === null ? null : parseCheck(checkReply);
  if (!verdict) log("\nPatch check: no answer");
  else if (!verdict.ok) log(`\n${servingLabel(checkAnswer?.serving, "Opus")} check: no valid answer: ${verdict.error}`);
  else { log(`\n${servingLabel(checkAnswer?.serving, "Opus")} check: ${verdict.check.verdict}: ${checkLine(verdict.check)}`); if (verdict.check.verdict === "reject") code = 2; }

  const task = await queueLintFor(db, { step: "fixup", repo, number, head, base, patch: v.patch });
  if (task === null) { log("\nlint: the patch changes no .rs file; no lint task"); return code; }
  log(`\nlint task ${task} queued`);
  const l0 = Date.now();
  while (Date.now() - l0 < LINT_GIVE_UP_MS) {
    const t = getTask(db, task);
    if (!t || TERMINAL.includes(t.state)) break;
    await sleep(5000);
  }
  const res = readLint(db, task);
  if (res.kind !== "result") { log(`lint: no result: ${res.kind === "pending" ? "still running" : res.reason}`); return 1; }
  log(`lint: ${res.findings.length} findings on the patch's lines`);
  for (const f of res.findings) log(indent(`${f.level} ${f.code ?? ""} ${f.file}:${f.line}\n${f.rendered}`));
  log(`lint: format changes: ${res.formatDiff ? `\n${indent(res.formatDiff)}` : "none"}`);
  return res.findings.length || res.formatDiff ? 2 : code;
}
