// The real dependencies of the security scan: the pinned checkout from the bare cache and `claude` in the read-only sandbox.
import type { DatabaseSync } from "node:sqlite";
import { ownerOf } from "../owners.ts";
import { askClaude, saveUsage, type Usage } from "../classify/run.ts";
import { exec, fixupDir, Git } from "../fixup/git.ts";
import { checkoutForCommit, sandboxAvailable } from "../sandbox/index.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { cachedCrates, ghCrates } from "../verify/crates.ts";
import type { ScanDeps } from "./scan.ts";

/** The token_usage run id of a scan: the job registers it with `usageRun`, so the spend shows in the job's usage and on the Cost page. */
export const usageRunId = (scanId: number): string => `security-${scanId}`;

export function realDeps(db: DatabaseSync, scanId: number, io: { cancelled: () => boolean; log: (line: string) => void; progress: (line: string) => void }): ScanDeps {
  let dir = "";
  let seq = 0;
  // The checkout is read-only in bubblewrap; the CLI keeps its API access, the model gets Read, Grep and Glob and no web tool.
  // The cost is read from the agent runs the call made (a failed call and a fix turn cost money too), so the spend cap sees all of it.
  const send = async (id: "security.model" | "security.area" | "security.verify" | "security.scantest", input: { repo: string; number: number }) => {
    const before = (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM agent_runs").get() as { n: number }).n;
    const start = new Date().toISOString();
    let text: string | null = null, usage: Usage | null = null;
    try {
      const r = await askClaude(id, "opus", [{ ...input, repo_dir: REPO_PATH }] as never, db, { checkout: dir });
      if (r) { text = r.text; usage = r.usage; }
    } catch (e) {
      io.log(`${id} failed: ${(e as Error).message}`.slice(0, 300));
    }
    const spent = (db.prepare(`SELECT SUM(r.cost_usd) AS c FROM agent_runs r JOIN agent_run_items i ON i.run_id = r.id WHERE i.repo = ? AND i.number = ? AND r.id > ?`)
      .get(input.repo, input.number, before) as { c: number | null }).c;
    const cost = spent ?? usage?.cost ?? null;
    saveUsage(db, usageRunId(scanId), `${id}#${++seq}`, "security", "opus", 1, usage ? { ...usage, cost } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost }, start, new Date().toISOString());
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
