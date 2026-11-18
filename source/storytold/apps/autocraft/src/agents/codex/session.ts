import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { RESUME_WINDOW_MS, type KeptSession } from "../../prepush/resume.ts";
import { sessionRoot } from "../../sandbox/session-store.ts";
import { parseCodexSessionState } from "./client.ts";

/** Only our own exclusive, physical session directory can be restored. */
export function safeCodexSessionDir(path: string): boolean {
  try {
    if (!isAbsolute(path) || !/^call-[a-zA-Z0-9]+$/.test(basename(path)) || realpathSync(path) !== path ||
        dirname(path) !== realpathSync(sessionRoot())) return false;
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 &&
      process.getuid !== undefined && stat.uid === process.getuid();
  } catch { return false; }
}

/** Private recovery reference for genuine partial work; paths never enter the HTTP API. */
export function retainedCodexSession(db: DatabaseSync, input: { repo: string; number: number; promptId: string }, now = Date.now()):
  { session: KeptSession; at: string; runId: number } | null {
  const row = db.prepare(`SELECT r.id,r.state,r.session_state,COALESCE(r.ended_at,r.started_at) at FROM agent_runs r
    JOIN agent_run_items i ON i.run_id=r.id WHERE r.provider='codex' AND r.prompt_id=?
    AND i.repo=? AND i.number=? ORDER BY r.id DESC LIMIT 1`)
    .get(input.promptId, input.repo, input.number) as { id: number; state: string; session_state: string | null; at: string } | undefined;
  // A newer completed/running/refused run invalidates an older failed receipt.
  if (!row || row.state !== "failed" || row.session_state === null || row.session_state.length > 65536 || !Number.isFinite(Date.parse(row.at)) || now - Date.parse(row.at) > RESUME_WINDOW_MS || Date.parse(row.at) > now) return null;
  try {
    const state: unknown = JSON.parse(row.session_state);
    if (!state || typeof state !== "object" || Array.isArray(state)) return null;
    const value = state as Record<string, unknown>;
    if (Object.keys(value).sort().join("|") !== "checkout|codexState|dir|provider|threadId" || value.provider !== "codex" ||
        typeof value.threadId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.threadId) || typeof value.dir !== "string" ||
        typeof value.checkout !== "string" || !isAbsolute(value.checkout) || value.checkout.includes("\0") || !safeCodexSessionDir(value.dir)) return null;
    const codexState = parseCodexSessionState(value.codexState);
    if (!codexState.threads.some(entry => entry.threadId === value.threadId)) return null;
    return { runId: row.id, at: row.at, session: { provider: "codex", id: value.threadId, dir: value.dir, account: "codex", checkout: value.checkout, codexState } };
  } catch { return null; }
}
