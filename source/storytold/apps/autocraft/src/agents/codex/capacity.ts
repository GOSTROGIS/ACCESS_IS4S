import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { checkCallActive, currentClass, stepOf, WaitLimitError } from "../call.ts";
import { insertRun, type RunStart } from "../runs.ts";
import { modelPolicy } from "./config.ts";
import { CodexBudgetError } from "./budget.ts";
import { CODEX_EXECUTION_READY, CODEX_UNAVAILABLE } from "./capabilities.ts";

type Input = Omit<RunStart, "accountId" | "jobId" | "step" | "stage">;
const STALE_WAITER_MS = 30000;
const CLI_SCOPE = `cli:${randomUUID()}`;
/** Separate provider capacity; it never consumes or invents a Claude account. */
export function tryCodexRun(db: DatabaseSync, input: Input, maxConcurrent: number, waiter?: number): number | null {
  db.exec("BEGIN IMMEDIATE");
  try {
    const active = (db.prepare("SELECT COUNT(*) n FROM agent_runs WHERE provider='codex' AND state='running'").get() as { n: number }).n;
    const ahead = waiter === undefined ? 0 : (db.prepare(`SELECT COUNT(*) n FROM model_waits WHERE provider='codex' AND seen_at>=? AND
      (class > (SELECT class FROM model_waits WHERE id=?) OR (class=(SELECT class FROM model_waits WHERE id=?) AND id<?))`).get(Date.now() - STALE_WAITER_MS, waiter, waiter, waiter) as { n: number }).n;
    if (active + ahead >= maxConcurrent) { db.exec("COMMIT"); return null; }
    const context = stepOf(input.promptId), policy = modelPolicy(db), scope = context.jobId === null ? CLI_SCOPE : `job:${context.jobId}`;
    const reserved = (db.prepare(`SELECT COALESCE(SUM(CASE WHEN state<>'done' OR provider_usage IS NULL THEN
      MAX(COALESCE(token_budget,?),COALESCE(input_tokens,0)+COALESCE(output_tokens,0)+COALESCE(cache_read_tokens,0)+COALESCE(cache_write_tokens,0)) ELSE
      COALESCE(input_tokens,0)+COALESCE(output_tokens,0)+COALESCE(cache_read_tokens,0)+COALESCE(cache_write_tokens,0) END),0) tokens
      FROM agent_runs WHERE provider='codex' AND budget_scope=?`).get(policy.maxTokens, scope) as { tokens: number }).tokens;
    const tokenBudget = Math.min(policy.maxTokens, policy.maxJobTokens - reserved);
    if (tokenBudget < 256) throw new CodexBudgetError();
    const run = insertRun(db, { ...input, ...context, accountId: null, tokenBudget, budgetScope: scope });
    if (waiter !== undefined) db.prepare("DELETE FROM model_waits WHERE id=?").run(waiter);
    db.exec("COMMIT");
    return run;
  } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
}

export async function startCodexRun(db: DatabaseSync, input: Input, maxWaitMs = 600000): Promise<number> {
  if (!CODEX_EXECUTION_READY) throw new WaitLimitError(CODEX_UNAVAILABLE);
  const began = Date.now(), context = stepOf(input.promptId);
  const waiter = Number(db.prepare(`INSERT INTO model_waits(provider,class,level,job_id,step,repo,since,seen_at,eligible)
    VALUES ('codex',?,2,?,?,NULL,?,?,1)`).run(currentClass(input.promptId), context.jobId, context.step, began, began).lastInsertRowid);
  try {
    for (;;) {
      checkCallActive();
      if (modelPolicy(db).provider !== "codex") throw new WaitLimitError("Codex was deselected while the call waited.");
      db.prepare("UPDATE model_waits SET seen_at=? WHERE id=?").run(Date.now(), waiter);
      const run = tryCodexRun(db, input, modelPolicy(db).maxConcurrent, waiter);
      if (run !== null) return run;
      if (Date.now() - began >= maxWaitMs) throw new WaitLimitError("No Codex capacity became free before the deadline.");
      await new Promise<void>(done => setTimeout(done, 500));
    }
  } finally { db.prepare("DELETE FROM model_waits WHERE id=?").run(waiter); }
}
