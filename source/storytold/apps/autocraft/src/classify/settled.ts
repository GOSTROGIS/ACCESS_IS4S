// The settled type label of an item for one classification run. Jev judges
// every item; Haiku gives a second opinion on the items Jev is unsure about.
//
// - Jev's top probability >= SURE: Jev's label is settled.
// - Otherwise, Haiku agrees with Jev: settled with that label.
// - Otherwise unsettled: "waiting" while Haiku hasn't answered, "disagree" when
//   it gave another label. A disagreement the Sonnet referee is sure about is
//   settled with its label (source "sonnet"); when it was unsure, the item stays
//   "disagree" with the referee's answer attached, for a person.
// - No Jev verdict in the run (Jev was unavailable): Haiku's label and flags
//   settle the item, source "haiku". Without either verdict: "unclassified".
//
// Each flag (security, needs decision) follows the same rule on its own: Jev
// sure yes sets it, Jev sure no clears it, and between the two bands Haiku's
// flag counts once Haiku has answered (not set before). The type's state does
// not matter for the flags.
//
// settle() is the rule; settledOf() applies it to one item and settledTable()
// to a whole run for queries.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { REFEREE_MAX_FAILURES } from "../core/item-rules.ts";
import { flagBand, JEV_NEEDS_DECISION_YES, JEV_SECURITY_YES } from "./parse.ts";

export const SURE = 0.9;

/**
 * Rows that make an item or a run count as classified: Jev's, and Haiku's when it classified alone (Jev unavailable).
 * Only that path sets input_hash on a Haiku row; a second opinion or an evaluation row has none.
 */
export const VERDICT_SQL = "(classifier = 'jev' OR (classifier = 'haiku' AND input_hash IS NOT NULL))";

export type SettledStatus = "settled" | "waiting" | "disagree" | "unclassified";

export type Verdict = { label: string; flags: string[] };

/** The referee's answer to the item's current disagreement. */
export type Referee = {
  label: string; sure: boolean; reason: string;
  /** The answer of the last referee (Opus, after Sonnet was unsure). An unsure final answer still settles the label, with a scope decision for the maintainer. */
  final?: boolean;
  /** Opus calls that gave no answer for the item, and when the last one failed. */
  failures?: number;
  failedAt?: string;
};

/** The referee has had its last word: Opus answered, or failed too often. An unsure last word still settles the label. */
export const refereeClosed = (r: Referee | null | undefined): boolean => !!r && (!!r.final || (r.failures ?? 0) >= REFEREE_MAX_FAILURES);

export type Settled = {
  status: SettledStatus;
  label: string | null;          // set only when status is "settled"
  source: "jev" | "haiku" | "sonnet" | null;
  confidence: number | null;     // Jev's top probability
  jevLabel: string | null;
  haikuLabel: string | null;
  // Flags that are set: see the rule above.
  flags: string[];
  // The referee's answer when one exists for the current verdicts, else null.
  referee: Referee | null;
};

/** Jev's needs_decision probability a settled bugfix needs before its "needs decision" flag counts. */
export const BUGFIX_NEEDS_DECISION = 0.7;

/** Jev raises needs_decision too freely on plain bugs: on a settled bugfix the flag counts only when Jev is firm. */
function firmFlags(s: Settled, nd: number | null | undefined): Settled {
  if (s.label !== "bugfix" || !s.flags.includes("needs decision") || (nd ?? 0) >= BUGFIX_NEEDS_DECISION) return s;
  return { ...s, flags: s.flags.filter((f) => f !== "needs decision") };
}

type JevVerdict = Verdict & { top: number | null; nd?: number | null; sec?: number | null };

/** One flag: Jev's band decides; unsure takes Haiku's answer, if any. A missing probability falls back to Jev's stored flag. */
function flagSet(name: string, p: number | null | undefined, yesMin: number, jev: JevVerdict, haiku: Verdict | null): boolean {
  if (typeof p !== "number") return jev.flags.includes(name);
  const band = flagBand(p, yesMin);
  return band === "unsure" ? !!haiku?.flags.includes(name) : band === "yes";
}

/** `jev.nd` and `jev.sec` are Jev's needs_decision and security probabilities (needsDecisionOf, securityOf). */
export function settle(jev: JevVerdict | null, haiku: Verdict | null, referee: Referee | null = null): Settled {
  const s = settleLabel(jev, haiku, referee);
  if (!jev) return s;
  const flags = [
    ...(flagSet("security", jev.sec, JEV_SECURITY_YES, jev, haiku) ? ["security"] : []),
    ...(flagSet("needs decision", jev.nd, JEV_NEEDS_DECISION_YES, jev, haiku) ? ["needs decision"] : []),
  ];
  const firm = firmFlags({ ...s, flags }, jev.nd);
  // The last referee was unsure whether we have the feature or want the difference: the label stands and a maintainer makes the call.
  return refereeClosed(referee) && !referee!.sure && !firm.flags.includes("needs decision") ? { ...firm, flags: [...firm.flags, "needs decision"] } : firm;
}

function settleLabel(jev: (Verdict & { top: number | null }) | null, haiku: Verdict | null, referee: Referee | null): Settled {
  if (!jev && haiku) return { status: "settled", label: haiku.label, source: "haiku", confidence: null, jevLabel: null, haikuLabel: haiku.label, flags: haiku.flags, referee: null };
  if (!jev) return { status: "unclassified", label: null, source: null, confidence: null, jevLabel: null, haikuLabel: null, flags: [], referee: null };
  const base = { confidence: jev.top, jevLabel: jev.label, haikuLabel: haiku?.label ?? null, referee: null };
  const flags: string[] = [];
  if ((jev.top ?? 0) >= SURE) return { ...base, status: "settled", label: jev.label, source: "jev", flags };
  if (!haiku) return { ...base, status: "waiting", label: null, source: null, flags };
  if (haiku.label === jev.label) return { ...base, status: "settled", label: jev.label, source: "haiku", flags };
  if (referee?.sure || refereeClosed(referee)) return { ...base, referee, status: "settled", label: referee!.label, source: "sonnet", flags };
  return { ...base, referee, status: "disagree", label: null, source: null, flags };
}

/** The run of the newest Jev or Haiku-alone verdict: two indexed lookups, the newer wins. */
export function newestVerdictRun(db: DatabaseSync): string | null {
  const jev = db.prepare("SELECT run_id, at FROM classifications WHERE classifier = 'jev' ORDER BY at DESC LIMIT 1").get() as { run_id: string; at: string } | undefined;
  const alone = db.prepare("SELECT run_id, at FROM main.classifications INDEXED BY classifications_alone WHERE classifier = 'haiku' AND input_hash IS NOT NULL ORDER BY at DESC LIMIT 1").get() as { run_id: string; at: string } | undefined;
  return (alone && (!jev || alone.at > jev.at) ? alone : jev)?.run_id ?? null;
}

// The run the dashboard shows: the current classification run (settings.classify_run), else the one with the newest Jev verdict.
export function latestRun(db: DatabaseSync): string | null {
  const set = db.prepare("SELECT value FROM settings WHERE key = 'classify_run'").get() as { value: string } | undefined;
  if (set?.value) return set.value;
  return newestVerdictRun(db);
}

/** True when `run` has at least one Jev or Haiku verdict. */
export const runExists = (db: DatabaseSync, run: string): boolean =>
  !!db.prepare(`SELECT 1 FROM classifications WHERE run_id = ? AND ${VERDICT_SQL} LIMIT 1`).get(run);

/** Makes `run` the current classification run (settings.classify_run), audited. */
export function setCurrentRun(db: DatabaseSync, run: string, by: string): void {
  const prev = (db.prepare("SELECT value FROM settings WHERE key = 'classify_run'").get() as { value: string } | undefined)?.value ?? null;
  db.prepare("INSERT INTO settings (key, value) VALUES ('classify_run', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(run);
  audit(db, by, "classify-run", `run:${run}`, { previous: prev });
}

const parseFlags = (s: string | null): string[] => {
  try {
    const f = JSON.parse(s ?? "[]") as unknown;
    return Array.isArray(f) ? f.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
};

/** settledOf() for one run, with the statement prepared once: for loops over many items. */
export function settledLookup(db: DatabaseSync, run: string | null): (repo: string, number: number) => Settled {
  if (!run) return () => settle(null, null);
  const q = db.prepare("SELECT type_label, flags, probs, reason, at, input_hash FROM classifications WHERE repo = ? AND number = ? AND classifier = ? AND run_id = ?");
  return (repo, number) => {
    const j = q.get(repo, number, "jev", run) as { type_label: string; flags: string | null; probs: string | null; at: string } | undefined;
    const h0 = q.get(repo, number, "haiku", run) as { type_label: string; flags: string | null; at: string; input_hash: string | null } | undefined;
    // A Haiku row without a Jev row counts only when Haiku classified alone.
    const h = h0 && (j || h0.input_hash !== null) ? h0 : undefined;
    const r = j && h ? (q.get(repo, number, "sonnet", run) as { type_label: string; probs: string | null; reason: string | null; at: string } | undefined) : undefined;
    return settle(
      j ? { label: j.type_label, flags: parseFlags(j.flags), top: topOf(j.probs), nd: needsDecisionOf(j.probs), sec: securityOf(j.probs) } : null,
      h ? { label: h.type_label, flags: parseFlags(h.flags) } : null,
      r && j && h && r.at >= j.at && r.at >= h.at ? refereeOf(r.type_label, r.probs, r.reason) : null,
    );
  };
}

/** Loops resolve `run` once (latestRun) and pass it, or use settledLookup(). */
export function settledOf(db: DatabaseSync, repo: string, number: number, run = latestRun(db)): Settled {
  return settledLookup(db, run)(repo, number);
}

/** A pipeline referee row: evaluation rows have no `sure` in probs and give null. */
function refereeOf(label: string, probs: string | null, reason: string | null): Referee | null {
  try {
    const p = JSON.parse(probs ?? "null") as { sure?: unknown; final?: unknown; opusFailures?: unknown; opusFailedAt?: unknown } | null;
    return typeof p?.sure === "boolean" ? { label, sure: p.sure, reason: reason ?? "", ...(p.final === true && { final: true }), ...(typeof p.opusFailures === "number" && { failures: p.opusFailures }), ...(typeof p.opusFailedAt === "string" && { failedAt: p.opusFailedAt }) } : null;
  } catch { return null; }
}

export function needsDecisionOf(probs: string | null): number | null {
  try {
    const t = (JSON.parse(probs ?? "null") as { needs_decision?: unknown } | null)?.needs_decision;
    return typeof t === "number" ? t : null;
  } catch { return null; }
}

export function securityOf(probs: string | null): number | null {
  try {
    const t = (JSON.parse(probs ?? "null") as { security?: unknown } | null)?.security;
    return typeof t === "number" ? t : null;
  } catch { return null; }
}

export function topOf(probs: string | null): number | null {
  try {
    const t = (JSON.parse(probs ?? "null") as { top?: unknown } | null)?.top;
    return typeof t === "number" ? t : null;
  } catch { return null; }
}

// Settled verdicts of one run as a temp table on this connection, for queries
// that count or filter many items:
//   temp.item_settled(repo, number, status, label, source, top, jev_label, haiku_label, flags JSON, security, needs_decision)
// Items without a Jev or Haiku verdict have no row ("unclassified"). Classifiers only
// insert (INSERT OR REPLACE gives a new rowid), so verdicts with a rowid above
// the last one seen are applied item by item; a new run or fewer rows than
// expected rebuilds the table.
type Seen = { run: string | null; maxRowid: number; count: number };
const seen = new WeakMap<DatabaseSync, Seen>();

type VerdictRow = { repo: string; number: number; jl: string | null; jf: string | null; probs: string | null; hl: string | null; hf: string | null; sl: string | null; ss: number | null; sr: string | null; sf: number | null; sx: number | null };
// Items with a Jev or a Haiku verdict: Haiku alone settles an item when Jev was unavailable.
const VERDICTS = `SELECT k.repo, k.number, j.type_label AS jl, j.flags AS jf, j.probs, h.type_label AS hl, h.flags AS hf,
    s.type_label AS sl, json_extract(CASE WHEN json_valid(s.probs) THEN s.probs END, '$.sure') AS ss, s.reason AS sr, json_extract(CASE WHEN json_valid(s.probs) THEN s.probs END, '$.final') AS sf, json_extract(CASE WHEN json_valid(s.probs) THEN s.probs END, '$.opusFailures') AS sx
  FROM (SELECT repo, number FROM main.classifications WHERE run_id = :run AND classifier = 'jev' UNION SELECT repo, number FROM main.classifications WHERE run_id = :run AND classifier = 'haiku' AND input_hash IS NOT NULL) k
  LEFT JOIN main.classifications j ON j.repo = k.repo AND j.number = k.number AND j.classifier = 'jev' AND j.run_id = :run
  LEFT JOIN main.classifications h ON h.repo = k.repo AND h.number = k.number AND h.classifier = 'haiku' AND h.run_id = :run
  LEFT JOIN main.classifications s ON s.repo = k.repo AND s.number = k.number AND s.classifier = 'sonnet' AND s.run_id = :run
    AND s.at >= j.at AND s.at >= h.at AND json_extract(CASE WHEN json_valid(s.probs) THEN s.probs END, '$.sure') IS NOT NULL
  WHERE 1 = 1`;

export function settledTable(db: DatabaseSync, run: string | null): void {
  const now = db.prepare("SELECT COALESCE(MAX(rowid), 0) AS maxRowid, COUNT(*) AS count FROM main.classifications").get() as { maxRowid: number; count: number };
  const prev = seen.get(db);
  if (prev && prev.run === run && prev.maxRowid === now.maxRowid && prev.count === now.count) return;
  db.exec(`CREATE TEMP TABLE IF NOT EXISTS item_settled (repo TEXT NOT NULL, number INTEGER NOT NULL, status TEXT NOT NULL, label TEXT,
    source TEXT, top REAL, jev_label TEXT, haiku_label TEXT, flags TEXT NOT NULL, security INTEGER NOT NULL, needs_decision INTEGER NOT NULL,
    referee_label TEXT, referee_sure INTEGER, referee_reason TEXT, referee_final INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (repo, number))`);
  const ins = db.prepare("INSERT OR REPLACE INTO temp.item_settled VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const put = (r: VerdictRow) => {
    const ref = r.sl !== null && r.ss !== null ? { label: r.sl, sure: !!r.ss, reason: r.sr ?? "", ...(r.sf ? { final: true } : {}), ...(r.sx ? { failures: r.sx } : {}) } : null;
    const s = settle(r.jl === null ? null : { label: r.jl, flags: parseFlags(r.jf), top: topOf(r.probs), nd: needsDecisionOf(r.probs), sec: securityOf(r.probs) }, r.hl === null ? null : { label: r.hl, flags: parseFlags(r.hf) }, ref);
    ins.run(r.repo, r.number, s.status, s.label, s.source, s.confidence, s.jevLabel, s.haikuLabel, JSON.stringify(s.flags),
      s.flags.includes("security") ? 1 : 0, s.flags.includes("needs decision") ? 1 : 0, s.referee?.label ?? null, s.referee ? Number(s.referee.sure) : null, s.referee?.reason ?? null, refereeClosed(s.referee) ? 1 : 0);
  };
  db.exec("BEGIN IMMEDIATE");
  try {
    const fresh = prev && prev.run === run
      ? (db.prepare("SELECT DISTINCT repo, number FROM main.classifications WHERE rowid > ? AND run_id = ?").all(prev.maxRowid, run) as { repo: string; number: number }[])
      : null;
    const added = prev ? (db.prepare("SELECT COUNT(*) AS n FROM main.classifications WHERE rowid > ?").get(prev.maxRowid) as { n: number }).n : 0;
    // INSERT OR REPLACE removes one row for each it adds, so the count only falls when something was deleted.
    if (fresh && run && now.count >= prev!.count && now.count <= prev!.count + added) {
      const one = db.prepare(`${VERDICTS} AND k.repo = :repo AND k.number = :number`);
      for (const k of fresh) {
        const r = one.get({ run, repo: k.repo, number: k.number }) as VerdictRow | undefined;
        if (r) put(r);
        else db.prepare("DELETE FROM temp.item_settled WHERE repo = ? AND number = ?").run(k.repo, k.number);
      }
    } else {
      db.exec("DELETE FROM temp.item_settled");
      if (run) for (const r of db.prepare(VERDICTS).all({ run }) as VerdictRow[]) put(r);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  seen.set(db, { run, ...now });
}

export type SettledRow = {
  status: string | null; label: string | null; source: string | null;
  top: number | null; jev_label: string | null; haiku_label: string | null; flags: string | null;
  referee_label: string | null; referee_sure: number | null; referee_reason: string | null; referee_final?: number | null;
};

// A temp.item_settled row (or none) as the wire shape.
export function fromRow(r: Partial<SettledRow> | undefined): Settled {
  if (!r?.status) return settle(null, null);
  return {
    status: r.status as SettledStatus, label: r.label ?? null, source: (r.source as Settled["source"]) ?? null,
    confidence: r.top ?? null, jevLabel: r.jev_label ?? null, haikuLabel: r.haiku_label ?? null, flags: parseFlags(r.flags ?? null),
    referee: r.referee_label != null && r.referee_sure != null ? { label: r.referee_label, sure: !!r.referee_sure, reason: r.referee_reason ?? "", ...(r.referee_final ? { final: true } : {}) } : null,
  };
}

/** The verdict of a quiet pull request without its `security` flag (for every role), and without the referee's reason for viewers. */
export const unflagged = (s: Settled, quiet: boolean, staff = true): Settled =>
  quiet ? { ...s, flags: s.flags.filter((f) => f !== "security"), referee: s.referee && !staff ? { ...s.referee, reason: "" } : s.referee } : s;
