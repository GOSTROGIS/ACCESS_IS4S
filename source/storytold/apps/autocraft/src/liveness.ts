// The liveness check: every open item of a pipeline-on repo must be LIVE, meaning something will move it or a person has been asked.
// An item that is neither is STUCK; a live item whose plan state and wait have not changed for a long time is LONG (a monitor
// threshold, not a pipeline wait). The runner refreshes the stored result after planner passes (refreshLiveness); the health check,
// the Stuck items page and `autocraft liveness` read it.
import type { DatabaseSync } from "node:sqlite";
import { fixStoppedWait, TRIAGE_WAIT } from "./core/decide-item.ts";
import type { WaitKind } from "./core/plan.ts";
import { blockersOfWait } from "./review/blockers.ts";

export type LivenessVerdict = "stuck" | "long";
/** Why an item is live (`live` causes) or stuck (`stuck` causes). */
export type LiveCause = "planned" | "question" | "answered" | "dispute" | "stopped" | "contributor" | "external" | "parked";
export type StuckCause = "person-wait-without-question" | "no-plan" | "internal-wait" | "duplicate-without-question";

export type PlanRowLike = {
  kind: "pr" | "issue";
  state: string;
  itemState: string | null;
  phase: string;
  wait: string | null;
  waitKind: WaitKind | null;
  actions: number;
  since: string;
};
/** `answered`: a person answered a question about the item and the pipeline has not applied the answer yet. */
export type ItemFlags = { question: boolean; answered?: boolean; dispute: boolean; stopped: boolean };

/** Plan states a person parks on purpose: nothing is due and nobody is asked. */
const PARKED_STATES: ReadonlySet<string> = new Set(["backlog", "held-backlog", "draft", "declined", "out-of-scope"]);
const PARKED_WAITS: ReadonlySet<string> = new Set(["merge held by an operator", "stays open as a plugin candidate", "a Backlog hold", TRIAGE_WAIT]);
/** Waits on a pipeline step that has no action due: nothing is working on them. */
const INTERNAL_WAITS: ReadonlySet<string> = new Set(["the scope question to be asked", "the label referee", "Haiku's second opinion"]);
/** Person waits whose person acts on GitHub, not in a question. */
const GITHUB_PERSON_WAITS: ReadonlySet<string> = new Set(["the maintainer's review"]);

export type Verdict = { live: true; cause: LiveCause } | { live: false; cause: StuckCause };

/** Live or stuck, from the item's stored plan and the questions that name it. Pure. */
export function classify(p: PlanRowLike, f: ItemFlags): Verdict {
  if (p.actions > 0) return { live: true, cause: "planned" };
  if (f.stopped) return { live: true, cause: "stopped" };
  if (f.question) return { live: true, cause: "question" };
  if (f.dispute) return { live: true, cause: "dispute" };
  if (f.answered) return { live: true, cause: "answered" };
  if (p.wait !== null && PARKED_WAITS.has(p.wait)) return { live: true, cause: "parked" };
  if (p.itemState === "held-duplicate" || p.state === "held-duplicate" || p.state === "duplicate") return { live: false, cause: "duplicate-without-question" };
  if (PARKED_STATES.has(p.state) || p.itemState === "held-backlog") return { live: true, cause: "parked" };
  if (p.wait === null) return { live: false, cause: "no-plan" };
  if (p.waitKind === "contributor") return { live: true, cause: "contributor" };
  if (p.waitKind === "person") return GITHUB_PERSON_WAITS.has(p.wait) ? { live: true, cause: "external" } : { live: false, cause: "person-wait-without-question" };
  if (INTERNAL_WAITS.has(p.wait)) return { live: false, cause: "internal-wait" };
  return { live: true, cause: "external" };
}

export type LivenessItem = {
  repo: string; number: number; kind: "pr" | "issue";
  verdict: LivenessVerdict;
  /** Why it is stuck; for a long item, why it is live. */
  cause: string;
  state: string; wait: string | null; phase: string;
  /** When the plan state or wait last changed. */
  since: string;
};
export type Liveness = { checkedAt: string; stuck: number; long: number; open: number; causes: Record<string, number>; items: LivenessItem[] };

export const LONG_DAYS_KEY = "liveness_long_days";
export const LONG_DAYS_DEFAULT = 7;
/** Minimum time between two stored results; planner passes ask for a refresh far more often. */
export const REFRESH_MS = 3 * 60_000;
const DAY_MS = 86_400_000;

type Row = { repo: string; number: number; kind: "pr" | "issue"; state: string; item_state: string | null; actions: string; wait: string | null; view: string; planned_at: string };

function keySet(db: DatabaseSync, sql: string): Set<string> {
  return new Set((db.prepare(sql).all() as { repo: string; number: number }[]).map((r) => `${r.repo}#${r.number}`));
}

/** Items that have an open question, a disputed answer, or a stopped step, by `repo#number`. */
export function flagSets(db: DatabaseSync): { question: Set<string>; answered: Set<string>; dispute: Set<string>; stopped: Set<string> } {
  const question = keySet(db, `SELECT repo, number FROM main.decisions WHERE answer IS NULL AND number IS NOT NULL
    UNION SELECT di.repo, di.number FROM main.decision_items di JOIN main.decisions d ON d.id = di.decision_id WHERE d.answer IS NULL
    UNION SELECT g.repo, g.number FROM main.dupe_group_items g JOIN main.decisions d ON d.id = g.decision_id WHERE d.answer IS NULL`);
  const answered = keySet(db, `SELECT repo, number FROM main.decisions WHERE answer IS NOT NULL AND applied_at IS NULL AND exec_state IS NOT 'disputed' AND number IS NOT NULL
    UNION SELECT di.repo, di.number FROM main.decision_items di JOIN main.decisions d ON d.id = di.decision_id WHERE d.answer IS NOT NULL AND d.applied_at IS NULL AND d.exec_state IS NOT 'disputed'
    UNION SELECT g.repo, g.number FROM main.dupe_group_items g JOIN main.decisions d ON d.id = g.decision_id WHERE d.answer IS NOT NULL AND d.applied_at IS NULL AND d.exec_state IS NOT 'disputed'`);
  const dispute = keySet(db, `SELECT repo, number FROM main.decisions WHERE answer IS NOT NULL AND exec_state = 'disputed' AND number IS NOT NULL
    UNION SELECT di.repo, di.number FROM main.decision_items di JOIN main.decisions d ON d.id = di.decision_id WHERE d.answer IS NOT NULL AND d.exec_state = 'disputed'
    UNION SELECT g.repo, g.number FROM main.dupe_group_items g JOIN main.decisions d ON d.id = g.decision_id WHERE d.answer IS NOT NULL AND d.exec_state = 'disputed'`);
  const stopped = keySet(db, `SELECT a.repo, a.number FROM main.actions a JOIN main.decisions d ON d.id = a.decision_id
    WHERE a.state = 'stopped' AND d.answer IS NOT NULL AND d.applied_at IS NULL AND d.exec_state IS NOT 'disputed'
    UNION SELECT repo, number FROM main.item_plans WHERE kind = 'issue' AND wait IN ('${fixStoppedWait("skipped").replaceAll("'", "''")}', '${fixStoppedWait("failed").replaceAll("'", "''")}')`);
  return { question, answered, dispute, stopped };
}

export function computeLiveness(db: DatabaseSync, nowMs: number = Date.now()): Liveness {
  const setting = Number((db.prepare("SELECT value FROM main.settings WHERE key = ?").get(LONG_DAYS_KEY) as { value: string } | undefined)?.value);
  const longMs = (Number.isFinite(setting) && setting > 0 ? setting : LONG_DAYS_DEFAULT) * DAY_MS;
  const flags = flagSets(db);
  const rows = db.prepare(`SELECT p.repo, p.number, p.kind, p.state, p.item_state, p.actions, p.wait, p.view, p.planned_at
    FROM main.item_plans p JOIN main.items i ON i.repo = p.repo AND i.number = p.number WHERE i.state = 'OPEN'`).all() as Row[];
  const items: LivenessItem[] = [];
  const causes: Record<string, number> = {};
  let open = 0;
  for (const r of rows) {
    const v = JSON.parse(r.view) as { status?: { phase?: string; since?: string }; waitKind?: WaitKind };
    const phase = v.status?.phase ?? "Triage";
    if (phase === "Pipeline off" || phase === "Merged" || phase === "Closed") continue;
    open++;
    const key = `${r.repo}#${r.number}`;
    const since = v.status?.since ?? r.planned_at;
    // A review held by other items waits on the questions about those items.
    const asked = flags.question.has(key) || blockersOfWait(r.wait).some((b) => flags.question.has(b));
    const verdict = classify(
      { kind: r.kind, state: r.state, itemState: r.item_state, phase, wait: r.wait, waitKind: v.waitKind ?? null, actions: (JSON.parse(r.actions) as unknown[]).length, since },
      { question: asked, answered: flags.answered.has(key), dispute: flags.dispute.has(key), stopped: flags.stopped.has(key) },
    );
    const base = { repo: r.repo, number: r.number, kind: r.kind, state: r.state, wait: r.wait, phase, since };
    if (!verdict.live) {
      items.push({ ...base, verdict: "stuck", cause: verdict.cause });
      causes[verdict.cause] = (causes[verdict.cause] ?? 0) + 1;
    } else if (verdict.cause !== "parked" && verdict.cause !== "question" && verdict.cause !== "dispute" && verdict.cause !== "stopped"
      && !asked && nowMs - Date.parse(since) > longMs) {
      items.push({ ...base, verdict: "long", cause: verdict.cause });
    }
  }
  items.sort((a, b) => (a.verdict === b.verdict ? 0 : a.verdict === "stuck" ? -1 : 1) || a.since.localeCompare(b.since) || a.repo.localeCompare(b.repo) || a.number - b.number);
  return { checkedAt: new Date(nowMs).toISOString(), stuck: items.filter((i) => i.verdict === "stuck").length, long: items.filter((i) => i.verdict === "long").length, open, causes, items };
}

/** Recomputes and stores the result unless one is newer than REFRESH_MS. Returns true when it ran. */
export function refreshLiveness(db: DatabaseSync, nowMs: number = Date.now(), force = false): boolean {
  const last = Date.parse((db.prepare("SELECT value FROM main.settings WHERE key = 'liveness_at'").get() as { value: string } | undefined)?.value ?? "");
  if (!force && Number.isFinite(last) && nowMs - last < REFRESH_MS) return false;
  const res = computeLiveness(db, nowMs);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM main.liveness_items");
    const put = db.prepare("INSERT INTO main.liveness_items (repo, number, kind, verdict, cause, state, wait, phase, since, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const i of res.items) put.run(i.repo, i.number, i.kind, i.verdict, i.cause, i.state, i.wait, i.phase, i.since, res.checkedAt);
    const set = db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    set.run("liveness_at", res.checkedAt);
    set.run("liveness_open", String(res.open));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return true;
}

/** The stored result; null before the first refresh. */
export function storedLiveness(db: DatabaseSync): Liveness | null {
  const at = (db.prepare("SELECT value FROM main.settings WHERE key = 'liveness_at'").get() as { value: string } | undefined)?.value;
  if (!at) return null;
  const items = (db.prepare("SELECT repo, number, kind, verdict, cause, state, wait, phase, since FROM main.liveness_items ORDER BY verdict DESC, since, repo, number").all() as LivenessItem[]);
  const causes: Record<string, number> = {};
  for (const i of items) if (i.verdict === "stuck") causes[i.cause] = (causes[i.cause] ?? 0) + 1;
  const open = Number((db.prepare("SELECT value FROM main.settings WHERE key = 'liveness_open'").get() as { value: string } | undefined)?.value ?? 0);
  return { checkedAt: at, stuck: items.filter((i) => i.verdict === "stuck").length, long: items.filter((i) => i.verdict === "long").length, open, causes, items };
}

export function printReport(l: Liveness): void {
  console.log(`liveness: ${l.open} open items checked, ${l.stuck} stuck, ${l.long} long`);
  for (const [c, n] of Object.entries(l.causes).sort()) console.log(`  stuck by cause: ${c} ${n}`);
  for (const i of l.items) console.log(`${i.verdict.padEnd(5)} ${i.repo}#${i.number} ${i.state} | wait: ${i.wait ?? "-"} | ${i.cause} | since ${i.since.slice(0, 16)}`);
}

export const commands = {
  liveness: {
    summary: "liveness [--json]: open items that are stuck (nothing due, nobody asked) or long; exit 1 when any is stuck",
    run: async (args: string[]) => {
      const { connect } = await import("./db.ts");
      const l = computeLiveness(connect());
      if (args.includes("--json")) console.log(JSON.stringify(l, null, 2));
      else printReport(l);
      process.exit(l.stuck > 0 ? 1 : 0);
    },
  },
};
