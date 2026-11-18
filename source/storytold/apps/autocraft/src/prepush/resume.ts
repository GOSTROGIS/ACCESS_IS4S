// A patch the lint sends back to the model continues the model's own session while the prompt cache is warm.
// The session store of a sandboxed patch call is kept with the stored patch row until the row's lint outcome is known or the window passes.
import { rmSync, utimesSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { CHECK_MAX_WALL_MS } from "../core/rules.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import type { CodexSessionState } from "../agents/codex/client.ts";

/** How long after its last use a kept session is resumed: the prompt cache window. */
export const RESUME_WINDOW_MS = 60 * 60_000;

/** The longest a resumed call runs: the longest prompt timeout plus the check tool's wall time. A session is swept only after the window plus this, so a resume started at the window's end keeps its store. */
export const LONGEST_CALL_MS = Math.max(...Object.values(CLAUDE_PROMPTS).map((p) => p.limits.timeoutSeconds)) * 1000 + CHECK_MAX_WALL_MS;

/** Marks a store as in use, so the age-based prune of session stores leaves it alone. */
export function touchStore(dir: string): void {
  try { const t = new Date(); utimesSync(dir, t, t); } catch { /* gone already */ }
}

/** What a sandboxed call leaves behind: its session, the account whose config directory holds the login, the session store and the checkout it ran on. */
export type KeptSession = { id: string; dir: string; account: string; checkout: string; provider?: "codex"; codexState?: CodexSessionState };
export type StoredSession = KeptSession & { at: string };

/** Passed to a patch call: `resume` continues a kept session with a message; the call reports the session it ends with in `kept`. */
export type SessionAsk = { resume?: { session: KeptSession; message: string }; kept?: KeptSession };

/** The tables whose rows keep a session, and the state in which a row waits for its result (lint or build). */
export const SESSION_TABLES = ["fixups", "ci_fixes", "conflict_merges", "main_fixes", "security_fix_rounds"] as const;
const WAITING: Record<(typeof SESSION_TABLES)[number], string> = { fixups: "linting", ci_fixes: "linting", conflict_merges: "linting", main_fixes: "linting", security_fix_rounds: "building" };

export function resumeMessage(findings: string[]): string {
  return `The harness linted your answer. Rustfmt, clippy and the tests of the affected crates report these findings (rustfmt and clippy findings are on lines it changed):\n\n${findings.map((f) => f.trim()).join("\n\n")}\n\nFix them. Reply with your corrected answer in the same reply format as before: complete, not a change to your earlier answer.`;
}

/** A row's sessions by key: the patch stages keep one (key ""), the conflict step one per resolved file. */
export type Kept = Record<string, KeptSession>;

export function storeSessions(kept: Kept, now: Date): string | null {
  const out: Record<string, StoredSession> = {};
  for (const v of Object.values(kept)) touchStore(v.dir);
  for (const [k, v] of Object.entries(kept)) out[k] = { ...v, at: now.toISOString() };
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

export function parseSessions(stored: string | null | undefined): Record<string, StoredSession> {
  const out: Record<string, StoredSession> = {};
  if (!stored) return out;
  try {
    for (const [k, v] of Object.entries(JSON.parse(stored) as Record<string, Partial<StoredSession>>)) {
      if (typeof v?.id === "string" && typeof v.dir === "string" && typeof v.account === "string" && typeof v.checkout === "string" && typeof v.at === "string") out[k] = v as StoredSession;
    }
  } catch { /* unreadable: no sessions */ }
  return out;
}

/** The session options for asking again under `key` with `findings`: a resume when that session was used within the window. */
export function sessionAsk(stored: string | null | undefined, key: string, findings: string[], now: Date): SessionAsk {
  const s = parseSessions(stored)[key];
  if (!s || !findings.length || now.getTime() - Date.parse(s.at) > RESUME_WINDOW_MS) return {};
  return { resume: { session: s, message: resumeMessage(findings) } };
}

const remove = (dir: string): void => rmSync(dir, { recursive: true, force: true });

/** Removes the stores of `stored` that are not among `keep` (the stores a later ask went on with). */
export function dropSessions(stored: string | null | undefined, keep: Kept = {}): void {
  const kept = new Set(Object.values(keep).map((k) => k.dir));
  for (const s of Object.values(parseSessions(stored))) if (!kept.has(s.dir)) remove(s.dir);
}

/** Sessions of one run's asks that no stored row took over (the answer was refused, or pushed without a lint task): removed with `release`. */
export class SessionLedger {
  private held = new Set<KeptSession>();
  hold(k: KeptSession | undefined): void { if (k) this.held.add(k); }
  /** Stores a row now keeps, whether or not it is the object held: a resumed call's store is the one it continued. */
  stored(kept: Kept): void {
    const dirs = new Set(Object.values(kept).map((k) => k.dir));
    for (const h of [...this.held]) if (dirs.has(h.dir)) this.held.delete(h);
  }
  release(): void {
    for (const k of this.held) remove(k.dir);
    this.held.clear();
  }
}

/** Removes the kept sessions whose row is no longer waiting for its lint result (pushed, failed, dropped) or is past the window. */
export function sweepSessions(db: DatabaseSync, now: Date): number {
  let n = 0;
  // A store that a row still waiting on its lint references stays, even when a sibling row (same head) left that state.
  const live = new Set<string>();
  for (const t of SESSION_TABLES) {
    for (const r of db.prepare(`SELECT session FROM ${t} WHERE session IS NOT NULL AND state = '${WAITING[t]}'`).all() as { session: string }[]) {
      for (const s of Object.values(parseSessions(r.session))) if (now.getTime() - Date.parse(s.at) <= RESUME_WINDOW_MS + LONGEST_CALL_MS) live.add(s.dir);
    }
  }
  for (const t of SESSION_TABLES) {
    const rows = db.prepare(`SELECT rowid AS id, state, session FROM ${t} WHERE session IS NOT NULL`).all() as { id: number; state: string; session: string }[];
    for (const r of rows) {
      const all = Object.values(parseSessions(r.session));
      if (all.length && r.state === WAITING[t] && all.every((s) => live.has(s.dir))) continue;
      for (const s of all) if (!live.has(s.dir)) remove(s.dir);
      db.prepare(`UPDATE ${t} SET session = NULL WHERE rowid = ?`).run(r.id);
      n++;
    }
  }
  return n;
}
