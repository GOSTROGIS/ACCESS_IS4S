// Operator tool: lint a PR's current head (optionally with a patch applied) on a build worker and print what the
// pipeline's lint check would see. Writes nothing to GitHub.
//
//   autocraft lint REPO#N [--patch FILE] [--tests]
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { getTask, logTail, TERMINAL } from "../build/tasks.ts";
import { connect } from "../db.ts";
import { ghExec } from "../merge/safe-merge.ts";
import { ghDiff } from "../review/diff.ts";
import { changedRsFiles, queueLint, queueLintFor, readLint, type Finding, type LintJob } from "./index.ts";
import { cratesForTests } from "./tests.ts";
import { ghCrates } from "../verify/crates.ts";
import { slugOf } from "../owners.ts";

const POLL_MS = 5000;
const GIVE_UP_MS = 90 * 60_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function parseArgs(args: string[]): { repo: string; number: number; patch: string | null; tests: boolean } {
  let ref: string | undefined, patch: string | null = null, tests = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--patch") patch = args[++i] ?? null;
    else if (args[i] === "--tests") tests = true;
    else if (!ref && !args[i]!.startsWith("--")) ref = args[i];
    else throw new Error(`unknown argument ${args[i]}; usage: lint REPO#N [--patch FILE] [--tests]`);
  }
  const m = /^([A-Za-z0-9._-]+)#(\d+)$/.exec(ref ?? "");
  if (!m) throw new Error("usage: lint REPO#N [--patch FILE] [--tests]");
  return { repo: m[1]!, number: Number(m[2]), patch, tests };
}

const stamp = (t0: number): string => `[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`;

function printFinding(f: Finding): void {
  console.log(`  ${f.level} ${f.code ?? ""} ${f.file}:${f.line}: ${f.message}`.replace(/\s+/g, " ").replace(/^ /, "  "));
  for (const l of f.rendered.split("\n")) console.log(`      ${l}`);
}

export async function runLint(db: DatabaseSync, a: { repo: string; number: number; patch: string | null; tests?: boolean }): Promise<number> {
  const ref = `${a.repo}#${a.number}`;
  const item = db.prepare("SELECT head_oid, state FROM items WHERE repo = ? AND number = ? AND kind = 'pr'").get(a.repo, a.number) as { head_oid: string | null; state: string } | undefined;
  if (!item?.head_oid) throw new Error(`${ref} is not a PR in the database`);
  const head = item.head_oid;
  const patch = a.patch ? readFileSync(a.patch, "utf8") : undefined;
  // Without a patch the PR's own diff names the files to format and decides which findings count.
  let against: string | undefined, files: string[] | undefined;
  if (patch === undefined) {
    const diff = await ghDiff(a.repo, a.number);
    if (!diff.ok) throw new Error(`could not read the diff of ${ref}: ${diff.error}`);
    against = diff.text;
    files = changedRsFiles(diff.text);
  }
  let base: string | null = null;
  try {
    const sha = (await ghExec(["api", `repos/${slugOf(a.repo)}/pulls/${a.number}`, "--jq", ".base.sha"])).trim();
    if (/^[0-9a-f]{40}$/.test(sha)) base = sha;
  } catch { /* without a base the task runs in the stock image */ }
  const job: LintJob = { step: "lint", repo: a.repo, number: a.number, head, base, ...(patch !== undefined ? { patch } : { files: files! }) };
  // --tests adds the affected crates' tests whatever the switch says.
  const crates = a.tests ? await cratesForTests(job, ghCrates) : null;
  const id = crates ? queueLint(db, { ...job, crates }) : await queueLintFor(db, job);
  if (id === null) { console.log(`${ref}: no .rs file changed; nothing to lint`); return 0; }
  const t0 = Date.now();
  console.log(`${ref} at ${head.slice(0, 7)}: lint task ${id} queued${patch !== undefined ? ` with ${a.patch}` : ` for ${files!.length} changed .rs files`}; base ${base ? base.slice(0, 7) : "unknown (head used)"}`);
  let last = "";
  while (Date.now() - t0 < GIVE_UP_MS) {
    const t = getTask(db, id);
    if (!t) { console.log("the task is gone"); return 1; }
    const line = `${t.state}${t.results.length ? `, steps done: ${t.results.map((r) => r.step).join(", ")}` : ""}`;
    if (line !== last) { console.log(`${stamp(t0)} ${line}`); last = line; }
    if (TERMINAL.includes(t.state)) break;
    await sleep(POLL_MS);
  }
  const t = getTask(db, id)!;
  if (!TERMINAL.includes(t.state)) { console.log(`gave up waiting; task ${id} is still ${t.state}`); return 1; }
  console.log("\nsteps:");
  for (const s of t.results) console.log(`  ${s.step.padEnd(12)} exit ${s.exitCode ?? "none"}${s.timedOut ? " (timed out)" : ""}  ${(s.durationMs / 1000).toFixed(1)}s`);
  const res = readLint(db, id, against !== undefined ? { against } : {});
  if (res.kind !== "result") {
    console.log(`\nno result: ${res.kind === "pending" ? "still running" : res.reason}`);
    const log = logTail(db, id).text.trimEnd().split("\n").slice(-25);
    if (log.length) console.log(`\nlast log lines:\n${log.map((l) => `  ${l}`).join("\n")}`);
    return 1;
  }
  console.log("\nformat changes:");
  console.log(res.formatDiff ? res.formatDiff.trimEnd().split("\n").map((l) => `  ${l}`).join("\n") : "  none");
  console.log(`\nclippy findings on the ${against !== undefined ? "PR's" : "patch's"} lines: ${res.findings.length}`);
  for (const f of res.findings) printFinding(f);
  if (res.testsNote) console.log(`\ntests: ${res.testsNote}`);
  return res.findings.length ? 2 : 0;
}

export const commands = {
  lint: {
    summary: "lint REPO#N [--patch FILE] [--tests]: queue the format and clippy lint task for the PR's head (with the patch applied, if given), wait, print the format diff and the findings; writes nothing to GitHub",
    async run(args: string[]): Promise<void> {
      process.exitCode = await runLint(connect(), parseArgs(args));
    },
  },
};
