// The real dependencies of the security scan: the pinned checkout from the bare cache and `claude` in the read-only sandbox.
import type { DatabaseSync } from "node:sqlite";
import { ownerOf } from "../owners.ts";
import { askClaude, saveUsage, type Usage } from "../classify/run.ts";
import { exec, fixupDir, Git } from "../fixup/git.ts";
import { checkoutForCommit, sandboxAvailable } from "../sandbox/index.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { cachedCrates, ghCrates } from "../verify/crates.ts";
import type { ScanDeps } from "./scan.ts";
import { reportedRunCost } from "./costs.ts";
import { CodexBudgetError, CodexUsageError } from "../agents/codex/budget.ts";
import { modelPolicy } from "../agents/codex/config.ts";
import { retainedCodexSession } from "../agents/codex/session.ts";
import { SessionLedger, type SessionAsk } from "../prepush/resume.ts";

/** The token_usage run id of a scan: the job registers it with `usageRun`, so the spend shows in the job's usage and on the Cost page. */
export const usageRunId = (scanId: number): string => `security-${scanId}`;

/** Continued jobs append usage; a resumed phase must not replace its earlier partial call's counters. */
export function saveScanUsage(db: DatabaseSync, scanId: number, id: string, usage: Usage, start: string, end: string): void {
  const run = usageRunId(scanId);
  const { seq } = db.prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(agent, INSTR(agent, '#') + 1) AS INTEGER)), 0) AS seq
    FROM token_usage WHERE run_id = ? AND agent LIKE ?`).get(run, `${id}#%`) as { seq: number };
  saveUsage(db, run, `${id}#${seq + 1}`, "security", "opus", 1, usage, start, end);
}

export function realDeps(db: DatabaseSync, scanId: number, io: { cancelled: () => boolean; log: (line: string) => void; progress: (line: string) => void }): ScanDeps {
  let dir = "";
  // The checkout is read-only in bubblewrap; the CLI keeps its API access, the model gets Read, Grep and Glob and no web tool.
  // The cost is read from the agent runs the call made (a failed call and a fix turn cost money too), so the spend cap sees all of it.
  const send = async (id: "security.model" | "security.area" | "security.verify" | "security.scantest", input: { repo: string; number: number }) => {
    const before = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM agent_runs").get() as { n: number }).n;
    const start = new Date().toISOString();
    const codex = modelPolicy(db).provider === "codex";
    const retained = codex ? retainedCodexSession(db, { ...input, promptId: id }) : null;
    const session: SessionAsk | undefined = retained ? { resume: { session: retained.session,
      message: "Continue the retained read-only scan work under the new bounded budget. " + JSON.stringify({ ...input, repo_dir: REPO_PATH }) } } : undefined;
    let text: string | null = null, usage: Usage | null = null;
    try {
      const r = await askClaude(id, "opus", [{ ...input, repo_dir: REPO_PATH }] as never, db, { checkout: dir, ...(session && { session }) });
      if (r) {
        text = r.text; usage = r.usage;
        const completed = new SessionLedger();
        completed.hold(session?.kept); completed.release();
      }
    } catch (e) {
      if (e instanceof CodexBudgetError) {
        if (e.usage) saveScanUsage(db, scanId, id, { ...e.usage, cost: null }, start, new Date().toISOString());
        throw e;
      }
      if (e instanceof CodexUsageError) usage = e.usage ?? null;
      io.log(`${id} failed: ${(e as Error).message}`.slice(0, 300));
    }
    const cost = reportedRunCost(db, input.repo, input.number, before, usage?.cost ?? null);
    if (usage || !codex) saveScanUsage(db, scanId, id,
      usage ? { ...usage, cost } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost }, start, new Date().toISOString());
    const runId = (db.prepare(`SELECT MIN(r.id) AS id FROM agent_runs r JOIN agent_run_items i ON i.run_id = r.id WHERE i.repo = ? AND i.number = ? AND r.id > ?`)
      .get(input.repo, input.number, before) as { id: number | null }).id;
    return { text, cost, runId };
  };
  return {
    ...io,
    checkout: async (repo, pin) => {
      if (!sandboxAvailable()) {
        io.log("the sandbox is not available on this machine");
        return null;
      }
      const branch = (db.prepare("SELECT default_branch FROM main.repos WHERE name = ?").get(repo) as { default_branch: string | null } | undefined)?.default_branch ?? "main";
      const sha = pin ?? await new Git(exec, fixupDir(), repo).fetchBase(ownerOf(repo), repo, branch);
      const d = await checkoutForCommit(repo, branch, sha, io.log);
      if (!d) return null;
      dir = d;
      return { dir: d, sha };
    },
    ask: send as ScanDeps["ask"],
    // Used only while the scan-tests switch is on (the scan checks it).
    writeTest: (input) => send("security.scantest", input),
    crates: (repo, sha) => cachedCrates(repo, sha, ghCrates),
  };
}
