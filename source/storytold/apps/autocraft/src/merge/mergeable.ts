// A PR whose mergeable state GitHub keeps reporting as unknown. The checks step reads every waiting PR each minute; when a read still
// shows UNKNOWN after UNKNOWN_AFTER_MS, the PR is read again (GitHub computes the merge state when a PR is requested), at most
// UNKNOWN_REREADS times with UNKNOWN_GAP_MS between tries. The merge queue then asks a person (src/core/decide.ts).
import type { DatabaseSync } from "node:sqlite";
import type { Querier } from "../mirror.ts";
import { refreshChecks, type PrChecks } from "../review/checks.ts";

import { spawn } from "node:child_process";
import { slugOf } from "../owners.ts";
import { mergeDecisionId, UNKNOWN_REREADS } from "../core/rules.ts";
import { withdrawMergeQuestion } from "./withdraw.ts";
import { readEnvFor } from "../github/read.ts";

const PREFIX = "mergeable_unknown:";
const keyOf = (repo: string, n: number) => `${PREFIX}${repo}#${n}`;

export type UnknownState = { head: string; since: string; reads: number; rereads: number; stuck: boolean };

const parse = (v: string): UnknownState | null => { try { const x = JSON.parse(v) as UnknownState; return typeof x.since === "string" && typeof x.head === "string" ? x : null; } catch { return null; } };

/** GraphQL checks reads in a row that still showed an unknown state before GitHub's REST endpoint is asked (a count, not a clock). */
export const READS_BEFORE_REQUEST = 5;

/**
 * Follows PRs whose plan waits on GitHub's mergeable state: a take review at the head and CI success. Counts the consecutive checks reads
 * that still show an unknown state; a known state forgets the PR (and sets aside a Merge? question that was asked about the unknown state).
 */
export function noteMergeable(db: DatabaseSync, rows: PrChecks[], at: string): void {
  const get = db.prepare("SELECT value FROM main.settings WHERE key = ?");
  const set = db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  const del = db.prepare("DELETE FROM main.settings WHERE key = ?");
  const taken = db.prepare(`SELECT 1 FROM final_reviews l WHERE l.repo = ? AND l.number = ? AND l.head_oid = ? AND l.verdict IN ('take', 'take-fix')
    AND l.head_oid = (SELECT r.head_oid FROM opus_reviews r WHERE r.repo = l.repo AND r.number = l.number AND r.verdict IS NOT NULL ORDER BY r.at DESC, r.rowid DESC LIMIT 1)`);
  const open = db.prepare("SELECT id FROM decisions WHERE id = ? AND answer IS NULL AND context LIKE '%still reports the merge state as unknown%'");
  for (const r of rows) {
    const k = keyOf(r.repo, r.number);
    const cur = get.get(k) as { value: string } | undefined;
    const known = r.mergeable === "MERGEABLE" || r.mergeable === "CONFLICTING";
    if (known || r.state !== "OPEN" || r.overall !== "success" || !taken.get(r.repo, r.number, r.head_oid)) {
      if (cur) {
        del.run(k);
        const prev = parse(cur.value);
        if (prev && known && open.get(mergeDecisionId(r.repo, r.number, prev.head))) withdrawMergeQuestion(db, r.repo, r.number, prev.head, at, "GitHub now reports the merge state");
      }
      continue;
    }
    const prev = cur ? parse(cur.value) : null;
    if (!prev || prev.head !== r.head_oid) set.run(k, JSON.stringify({ head: r.head_oid, since: at, reads: 1, rereads: 0, stuck: false } satisfies UnknownState));
    else set.run(k, JSON.stringify({ ...prev, reads: prev.reads + 1 } satisfies UnknownState));
  }
}

/** What the planner needs for one PR at a head, or null when its state is not unknown (or not noted yet). */
export function unknownOf(db: DatabaseSync, repo: string, n: number, head: string): UnknownState | null {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(keyOf(repo, n)) as { value: string } | undefined;
  const s = row ? parse(row.value) : null;
  return s && s.head === head ? s : null;
}

/** The mergeable state of a PR as GitHub's REST endpoint reports it (reading it starts GitHub's mergeability job); null while GitHub has not computed it. */
export type RestRead = (repo: string, number: number) => Promise<string | null>;

export const restMergeable: RestRead = async (repo, number) => {
  const args = ["api", `repos/${slugOf(repo)}/pulls/${number}`, "--jq", ".mergeable"];
  const env = await readEnvFor("gh", args);
  return new Promise((resolve, reject) => {
  const p = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"], ...(env ? { env } : {}) });
  let out = "", err = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (err += d));
  p.on("error", reject);
  p.on("close", (code) => (code === 0 ? resolve(out.trim() === "true" ? "MERGEABLE" : out.trim() === "false" ? "CONFLICTING" : null) : reject(new Error(err.trim().slice(0, 200) || `gh exited ${code}`))));
  });
};

/**
 * Requests a PR whose state stayed unknown for READS_BEFORE_REQUEST checks reads from GitHub's REST endpoint, which starts the mergeability job.
 * A null answer marks the PR stuck, and the merge queue asks a person. No clock: one request per PR and head. A known answer is stored by reading the PR's checks again.
 */
export async function rereadUnknown(db: DatabaseSync, client: Querier, repo: string, log: (line: string) => void = () => {}, read: RestRead = restMergeable): Promise<number[]> {
  const rows = db.prepare("SELECT key, value FROM main.settings WHERE key LIKE ?").all(`${PREFIX}${repo}#%`) as { key: string; value: string }[];
  const open = db.prepare("SELECT 1 FROM main.items WHERE repo = ? AND number = ? AND kind = 'pr' AND state = 'OPEN'");
  const done: number[] = [], known: number[] = [];
  const set = db.prepare("UPDATE main.settings SET value = ? WHERE key = ?");
  for (const r of rows) {
    const s = parse(r.value);
    const n = Number(r.key.slice(r.key.lastIndexOf("#") + 1));
    if (!Number.isInteger(n)) continue;
    if (!s || !open.get(repo, n)) { db.prepare("DELETE FROM main.settings WHERE key = ?").run(r.key); continue; }
    if (s.stuck || s.rereads >= UNKNOWN_REREADS || s.reads < READS_BEFORE_REQUEST) continue;
    let state: string | null;
    try { state = await read(repo, n); } catch (e) { log(`checks: ${repo}#${n}: the REST read failed: ${String((e as Error).message ?? e)}`); continue; }
    done.push(n);
    if (state !== null) { known.push(n); continue; }
    set.run(JSON.stringify({ ...s, rereads: s.rereads + 1, stuck: true } satisfies UnknownState), r.key);
  }
  if (known.length) await refreshChecks(db, client, repo, known, log);
  if (done.length) log(`checks: ${repo}: requested ${done.length} PR${done.length === 1 ? "" : "s"} with an unknown mergeable state from GitHub (${done.map((n) => `#${n}`).join(", ")})`);
  return done;
}
