// Duplicate group decisions. A group (plan.ts) with a current comparison (compare.ts)
// gets one decision: keep the compared best item, close the others as duplicates,
// carry over what they do better. The decision's number is the kept item (the kept
// PR when the group has one); its members and their roles are in dupe_group_items,
// which the later stages read to hold the items to close. Per-pair decisions from
// before groups exist stay until answered; an open one of a group is superseded
// by the group decision.
import { settledBySql } from "../settlers.ts";
import { jobItem } from "../runner/job-items.ts";
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { actionable, ask, factsOf, getDecision, validateAsk } from "../decisions.ts";
import { compareCanonical, canonInfo } from "./canonical.ts";
import { backlogHeldSql, DUP_FACT, GROUP_OPTIONS, groupId, keepKey, keptOf } from "./held.ts";
import { duplicateGroups, kindSetsOf, currentComparison, type Group, type KindSet, type StoredComparison } from "./plan.ts";
import { oneSentence } from "../review/summary.ts";
import { storeOptionTexts } from "./texts.ts";
import { inPilot, pilotSqlFor } from "../pilot.ts";
import { withdrawGroupedQuestions } from "../merge/withdraw.ts";

export { duplicateEdges, duplicateGroups, type Group } from "./plan.ts";

const ACTOR = "dupes";

export const decisionId = (repo: string, x: number, y: number): string => `${repo}#${x}:duplicate@${y}`;

const clip = (s: string | null, n = 110): string => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

type Role = "keep" | "close" | "stay";
export type PlanItem = { number: number; kind: "pr" | "issue"; role: Role; target: number | null; detail: Record<string, unknown> | null };
export type GroupPlan = {
  repo: string; group: Group; baseId: string; number: number; items: PlanItem[];
  closing: boolean; source: "model" | "closed" | "rule"; model: string | null; reasons: string[];
  sets: { set: KindSet; cmp: StoredComparison }[];
};

const list = (ns: number[]) => ns.map((n) => `#${n}`).join(", ");

/** An earlier answered group decision of the members: its members are settled and its keep stays kept. */
function answeredKeeps(db: DatabaseSync, repo: string, members: number[]): { settled: Set<number>; keep: Map<string, number> } {
  const ph = members.map(() => "?").join(",");
  const ids = db.prepare(`SELECT DISTINCT d.id FROM decisions d JOIN dupe_group_items gi ON gi.decision_id = d.id
    WHERE d.kind = 'duplicate' AND d.answer IS NOT NULL AND d.answer NOT IN ('superseded', 'distinct', 'backlog') AND gi.repo = ? AND gi.number IN (${ph}) ORDER BY d.asked_at, d.id`).all(repo, ...members) as { id: string }[];
  const settled = new Set<number>(), keep = new Map<string, number>();
  for (const { id } of ids)
    for (const r of db.prepare(`SELECT gi.number, gi.kind, gi.role FROM dupe_group_items gi WHERE gi.decision_id = ?
      AND NOT EXISTS (SELECT 1 FROM dupe_group_posts p WHERE p.decision_id = gi.decision_id AND p.number = gi.number AND p.step = 'released')`).all(id) as { number: number; kind: string; role: string }[]) {
      settled.add(r.number);
      if (r.role === "keep") keep.set(r.kind, r.number);
    }
  return { settled, keep };
}

/** Plans for the groups whose comparisons are all current. `closing` is false for a group with nothing to close. */
export function groupPlans(db: DatabaseSync, repo?: string): GroupPlan[] {
  const out: GroupPlan[] = [];
  for (const g of duplicateGroups(db, repo)) {
    const sets = kindSetsOf(db, g).filter((s) => s.members.some((m) => m.state === "OPEN" && inPilot(db, s.repo, m.number)));
    if (!sets.length) continue;
    // A member held by a Backlog answer is not asked about again.
    if (g.members.some((n) => db.prepare(`SELECT 1 FROM items i WHERE i.repo = ? AND i.number = ? AND ${backlogHeldSql("i")}`).get(g.repo, n))) continue;
    const ready = sets.map((set) => ({ set, cmp: currentComparison(db, set) }));
    if (ready.some((r) => !r.cmp)) continue;
    const full = ready as { set: KindSet; cmp: StoredComparison }[];
    const { settled, keep: fixedKeep } = answeredKeeps(db, g.repo, g.members);
    const items: PlanItem[] = [];
    for (const { set, cmp } of full) {
      const numbers = set.members.map((m) => m.number);
      // An answered decision's keep stays kept; only members it did not cover are asked against it.
      const fixed = fixedKeep.get(set.kind);
      const kept = fixed !== undefined && numbers.includes(fixed) ? fixed : cmp.kept;
      for (const m of set.members) {
        if (m.number === kept) { items.push({ number: m.number, kind: set.kind, role: "keep", target: null, detail: null }); continue; }
        if (settled.has(m.number)) continue;
        const other = cmp.result?.others.find((o) => o.number === m.number);
        const dup = set.kind === "issue" || other?.duplicate !== false;
        const role: Role = m.state === "OPEN" && dup && inPilot(db, set.repo, m.number) ? "close" : "stay";
        items.push({ number: m.number, kind: set.kind, role, target: role === "close" ? kept : null, detail: other ? { ...other } : null });
      }
    }
    // The kept PR is linked to the kept issue.
    const keepPr = items.find((i) => i.role === "keep" && i.kind === "pr"), keepIssue = items.find((i) => i.role === "keep" && i.kind === "issue");
    if (keepPr && keepIssue) keepPr.detail = { ...(keepPr.detail ?? {}), link: keepIssue.number };
    const primary = (keepPr ?? keepIssue)!;
    const sources = full.map((f) => f.cmp.source);
    const fresh = items.filter((i) => !settled.has(i.number)).map((i) => i.number);
    out.push({
      repo: g.repo, group: g, baseId: groupId(g.repo, Math.min(...(fresh.length ? fresh : items.map((i) => i.number)))), number: primary.number, items,
      closing: items.some((i) => i.role === "close"),
      source: sources.includes("rule") ? "rule" : sources.every((s) => s === "closed" || s === "single") ? "closed" : "model",
      model: full.find((f) => f.cmp.model)?.cmp.model ?? null, reasons: full.map((f) => f.cmp.reason).filter((r): r is string => !!r), sets: full,
    });
  }
  return out;
}

/** What Act compares before closing a member: a PR's head commit, an issue's text hash. */
function headOf(db: DatabaseSync, repo: string, n: number, kind: string): string | null {
  const r = db.prepare("SELECT head_oid, embed_hash FROM items WHERE repo = ? AND number = ?").get(repo, n) as { head_oid: string | null; embed_hash: string | null } | undefined;
  return (kind === "pr" ? r?.head_oid : r?.embed_hash) ?? null;
}

/** The head a decision binds a member to: for a PR the head its comparison read (the current one for comparisons stored without heads), so Act never closes, keeps or carries code no comparison saw. */
function boundHead(db: DatabaseSync, p: GroupPlan, i: { number: number; kind: string }): string | null {
  if (i.kind !== "pr") return headOf(db, p.repo, i.number, i.kind);
  const cmp = p.sets.find((s) => s.set.kind === "pr" && s.cmp.members.includes(i.number))?.cmp;
  let heads: Record<string, string> = {};
  try { heads = JSON.parse(cmp?.heads ?? "{}") as Record<string, string>; } catch { /* none stored */ }
  return cmp?.heads != null ? heads[i.number] ?? null : headOf(db, p.repo, i.number, i.kind);
}

function supersede(db: DatabaseSync, p: GroupPlan, id: string, at: string): void {
  const ph = p.group.members.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id FROM decisions WHERE kind = 'duplicate' AND repo = ? AND answer IS NULL AND id <> ? AND number IN (${ph})`).all(p.repo, id, ...p.group.members) as { id: string }[];
  const items = db.prepare(`SELECT DISTINCT d.id FROM decisions d JOIN dupe_group_items gi ON gi.decision_id = d.id
    WHERE d.kind = 'duplicate' AND d.repo = ? AND d.answer IS NULL AND d.id <> ? AND gi.number IN (${ph})`).all(p.repo, id, ...p.group.members) as { id: string }[];
  for (const r of new Set([...rows, ...items].map((x) => x.id))) {
    db.prepare("UPDATE main.decisions SET answer = 'superseded', answered_by = ?, answered_at = ?, applied_at = ? WHERE id = ? AND answer IS NULL").run(ACTOR, at, at, r);
    audit(db, ACTOR, "duplicate-superseded", r, { by: id });
  }
}

function unchanged(db: DatabaseSync, q: Record<string, unknown>, p: GroupPlan): boolean {
  const id = q.id as string;
  const cur = db.prepare("SELECT question, context, facts, options, recommended, recommended_reason, summary, summary_by, prepared_at FROM decisions WHERE id = ? AND answer IS NULL").get(id) as Record<string, string | null> | undefined;
  if (!cur) return false;
  const next = validateAsk(q);
  // A prepared decision keeps the judgement model's summary and pick.
  const cols = ["question", "context", "facts", "options", ...(cur.prepared_at ? [] : ["recommended", "recommended_reason", "summary", "summary_by"])];
  if (cols.some((c) => cur[c] !== next[c])) return false;
  const g = db.prepare("SELECT source, applied_answer FROM dupe_groups WHERE decision_id = ?").get(id) as { source: string; applied_answer: string | null } | undefined;
  if (!g || g.source !== p.source || g.applied_answer !== null) return false;
  type Row = { number: number; role: string; target: number | null; base_role: string; base_target: number | null; detail: string | null; head: string | null };
  const rows = db.prepare("SELECT number, role, target, base_role, base_target, detail, head FROM dupe_group_items WHERE decision_id = ?").all(id) as Row[];
  if (rows.some((r) => r.role !== r.base_role || r.target !== r.base_target)) return false;
  const key = (number: number, role: string, target: number | null, detail: string | null, head: string | null) => JSON.stringify([number, role, target, detail, head]);
  const stored = rows.map((r) => key(r.number, r.base_role, r.base_target, r.detail, r.head)).sort();
  const planned = p.items.map((i) => key(i.number, i.role, i.target, i.detail ? JSON.stringify(i.detail) : null, boundHead(db, p, i))).sort();
  return stored.length === planned.length && stored.every((s, k) => s === planned[k]);
}

/** The open group decision that already lists one of the plan's members, else the first unused id. */
function idFor(db: DatabaseSync, p: GroupPlan): string {
  const ph = p.group.members.map(() => "?").join(",");
  const open = db.prepare(`SELECT d.id FROM decisions d JOIN dupe_group_items gi ON gi.decision_id = d.id
    WHERE d.kind = 'duplicate' AND d.answer IS NULL AND d.id LIKE '%:dupegroup:%' AND gi.repo = ? AND gi.number IN (${ph}) ORDER BY d.id LIMIT 1`).get(p.repo, ...p.group.members) as { id: string } | undefined;
  if (open) return open.id;
  for (let k = 1; ; k++) {
    const id = k === 1 ? p.baseId : `${p.baseId}~${k}`;
    if (!getDecision(db, id)) return id;
  }
}

const refList = (ns: number[]) => list(ns);

function textOf(db: DatabaseSync, p: GroupPlan) {
  const info = db.prepare("SELECT kind, state, title, comments_count FROM items WHERE repo = ? AND number = ?");
  const keeps = p.items.filter((i) => i.role === "keep");
  const closes = p.items.filter((i) => i.role === "close").map((i) => i.number);
  const stays = p.items.filter((i) => i.role === "stay").map((i) => i.number);
  const byRule = p.source === "rule";
  const primary = keeps.find((k) => k.number === p.number)!;
  // The model's own summary, whole. A comparison stored without one gives its reason whole; a rule-picked one says so.
  const used = p.sets.filter((s) => s.cmp.source !== "single").map((s) => s.cmp);
  const kept = (c: StoredComparison) => list(keeps.filter((k) => k.kind === c.kind).map((k) => k.number));
  const texts = used.map((c) => c.summary
    || (c.source === "rule" ? `Kept ${kept(c)} by rule: ${(c.reason ?? "").replace(/^kept by rule: /, "")}.` : c.source === "closed" ? `Kept ${kept(c)}: ${c.reason ?? ""}.` : c.reason ?? "")).filter(Boolean);
  const summary = texts.join(" ") || `Keep ${list(keeps.map((k) => k.number))}.`;
  const by = used.length && used.every((c) => c.source === "model") ? p.model ?? "" : "";
  // One sentence for the recommendation; none from a rule or when the model gave nothing to say.
  const lead = p.sets.find((s) => s.cmp.kept === primary.number) ?? p.sets[0]!;
  const why = byRule || lead.cmp.source === "single" ? null : oneSentence(lead.cmp.why) ?? oneSentence(lead.cmp.reason);
  const keepFacts = keeps.map((k) => {
    const r = info.get(p.repo, k.number) as { kind: string; state: string; title: string | null; comments_count: number | null };
    return `Keep: #${k.number} (${r.kind === "pr" ? "PR" : "issue"}, ${r.state === "OPEN" ? "open" : r.state === "MERGED" ? "merged" : "closed"}, ${r.comments_count ?? 0} comments): ${clip(r.title)}`;
  });
  const chosen = byRule ? `Chosen by: rule (${p.reasons.map((r) => r.replace(/^kept by rule: /, "")).join(", ") || "older"}); the model comparison gave no answer`
    : p.source === "closed" ? `Chosen by: ${clip(p.reasons.join("; "), 100) || "already closed"}` : `Chosen by: ${p.model ?? "model"}, all ${p.group.members.length} compared in one pass`;
  const facts = [...keepFacts, `Close: ${refList(closes)}${stays.length ? `; stays open: ${refList(stays)}` : ""}`, chosen];
  const question = `Keep #${primary.number}${keeps.length > 1 ? ` and #${keeps.find((k) => k !== primary)!.number}` : ""} and close ${refList(closes)} as ${keeps.length > 1 ? "their" : "its"} ${closes.length === 1 ? "duplicate" : "duplicates"}?`;
  const context = byRule
    ? `The model comparison gave no valid answer, so the rule picked the item to keep: ${p.reasons.map((r) => r.replace(/^kept by rule: /, "")).join(", ")}.`
    : `${list(p.group.members)} describe the same bug or request. ${p.model ? `${p.model[0]!.toUpperCase()}${p.model.slice(1)} compared them together` : "They are compared together"}${p.source === "closed" ? "; one is already done, so the open ones duplicate it" : ""}.`;
  return { facts: facts.slice(0, 5), question, context, summary, by, why, keepLabel: `Keep ${list(keeps.map((k) => k.number))}` };
}

/** Asks (or refreshes) the group decisions of one repo (every repo when omitted). Returns the ids asked or refreshed. Each plan is written in one transaction, so no other process sees its members unheld in between. */
export function askGroupDecisions(db: DatabaseSync, repo: string | undefined, at: string): string[] {
  const asked: string[] = [];
  for (const p of groupPlans(db, repo)) {
    db.exec("BEGIN IMMEDIATE");
    try {
      if (!p.closing) {
        // Nothing to close: the pair decisions and an open group decision about these members have no use.
        supersede(db, p, "", at);
        db.exec("COMMIT");
        continue;
      }
      // An answer waiting for Act that already lists every member to close: no second decision.
      const waiting = new Set((db.prepare(`SELECT gi.number FROM decisions d JOIN dupe_group_items gi ON gi.decision_id = d.id WHERE d.kind = 'duplicate' AND d.id LIKE '%:dupegroup:%' AND d.repo = ?
        AND d.answer IS NOT NULL AND d.answer NOT IN ('superseded', 'distinct', 'backlog') AND d.applied_at IS NULL`).all(p.repo) as { number: number }[]).map((r) => r.number));
      p.items = p.items.filter((i) => !(i.role === "close" && waiting.has(i.number)));
      if (!p.items.some((i) => i.role === "close")) {
        db.exec("COMMIT");
        continue;
      }
      const id = idFor(db, p);
      const t = textOf(db, p);
      const primary = p.items.find((i) => i.number === p.number)!;
      const alts = canonInfo(db, p.repo, p.items.filter((i) => i.kind === primary.kind && i.number !== p.number && i.role !== "stay").map((i) => i.number)).sort(compareCanonical).slice(0, 3);
      const q = {
        id, kind: "duplicate", repo: p.repo, number: p.number, question: t.question, context: t.context, facts: t.facts,
        options: [{ ...GROUP_OPTIONS.accept, label: t.keepLabel }, ...alts.map((a) => ({ key: keepKey(a.number), label: `Keep #${a.number} instead`, hint: `Posts the comments shown under it: keeps #${a.number}, closes the others, #${p.number} too.` })), GROUP_OPTIONS.distinct],
        recommended: t.why ? "accept" : null, recommended_reason: t.why,
        asked_by: ACTOR, asked_at: at, summary: t.summary, summary_by: t.by, summary_at: at,
      };
      supersede(db, p, id, at);
      // An open decision whose question and member roles are unchanged keeps its asked time and stored texts.
      if (unchanged(db, q, p)) {
        db.exec("COMMIT");
        continue;
      }
      ask(db, [q], true);
      // ask() keeps the stored summary_by when the new one is empty; the author must follow the text.
      db.prepare("UPDATE main.decisions SET summary_by = ? WHERE id = ?").run(t.by || null, id);
      // A refresh restores the comparison's roles; an answer is applied to them again.
      db.prepare("INSERT INTO dupe_groups (decision_id, repo, source) VALUES (?, ?, ?) ON CONFLICT(decision_id) DO UPDATE SET source = excluded.source, applied_answer = NULL").run(id, p.repo, p.source);
      db.prepare("DELETE FROM dupe_group_items WHERE decision_id = ?").run(id);
      const ins = db.prepare("INSERT INTO dupe_group_items (decision_id, repo, number, kind, role, target, detail, base_role, base_target, head) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const i of p.items) ins.run(id, p.repo, i.number, i.kind, i.role, i.target, i.detail ? JSON.stringify(i.detail) : null, i.role, i.target, boundHead(db, p, i));
      storeOptionTexts(db, id, ["accept", ...alts.map((a) => keepKey(a.number))], (n) => {
        const r = db.prepare("SELECT state FROM items WHERE repo = ? AND number = ?").get(p.repo, n) as { state: string } | undefined;
        return r?.state === "OPEN" && inPilot(db, p.repo, n);
      });
      db.exec("COMMIT");
      asked.push(id);
      jobItem(db, p.repo, p.number, "asked a duplicate decision", console.log, id);
      withdrawGroupedQuestions(db, at, p.repo);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return asked;
}

/** Groups whose plan has no decision yet. Reads only, for the autopilot. */
export function groupsToAsk(db: DatabaseSync, repo?: string): GroupPlan[] {
  return groupPlans(db, repo).filter((p) => p.closing && !getDecision(db, idFor(db, p)));
}

/**
 * Answers to apply: pair decisions answered other than close, and group decisions whose answer is not yet in the roles.
 * Each is listed with the items it concerns (a pair's two, a group's members), so the item plans can carry it.
 */
export function answersToApply(db: DatabaseSync): { id: string; refs: string[] }[] {
  const rows = db.prepare(`SELECT d.id, d.repo, d.number FROM decisions d WHERE d.kind = 'duplicate' AND d.answer IS NOT NULL AND d.answer <> 'backlog' AND d.applied_at IS NULL
    AND ${settledBySql("d")}
    AND ((d.id NOT LIKE '%:dupegroup:%' AND d.answer <> 'close' AND ${pilotSqlFor("d.repo", "d.number")})
      OR (d.id LIKE '%:dupegroup:%' AND EXISTS (SELECT 1 FROM dupe_group_items gi WHERE gi.decision_id = d.id AND ${pilotSqlFor("gi.repo", "gi.number")}) AND COALESCE((SELECT g.applied_answer FROM dupe_groups g WHERE g.decision_id = d.id), '') <> d.answer))`).all() as
    { id: string; repo: string | null; number: number | null }[];
  const members = db.prepare("SELECT repo, number FROM dupe_group_items WHERE decision_id = ?");
  return rows.map((d) => {
    if (d.id.includes(":dupegroup:")) return { id: d.id, refs: (members.all(d.id) as { repo: string; number: number }[]).map((m) => `${m.repo}#${m.number}`) };
    const other = /@(\d+)$/.exec(d.id)?.[1];
    return { id: d.id, refs: [`${d.repo}#${d.number}`, ...(other ? [`${d.repo}#${other}`] : [])] };
  });
}

function markDistinct(db: DatabaseSync, repo: string, numbers: number[], at: string): void {
  const upd = db.prepare("UPDATE duplicate_pairs SET verdict = 'distinct', by_operator = 1 WHERE repo = ? AND a = ? AND b = ?");
  const ins = db.prepare(`INSERT OR IGNORE INTO duplicate_pairs (repo, a, b, a_hash, b_hash, similarity, verdict, by_operator, created_at, checked_at)
    SELECT ?, ?, ?, ia.embed_hash, ib.embed_hash, 0, 'distinct', 1, ?, ? FROM items ia, items ib
    WHERE ia.repo = ? AND ia.number = ? AND ib.repo = ? AND ib.number = ?`);
  for (const x of numbers) for (const y of numbers) {
    if (x >= y) continue;
    upd.run(repo, x, y);
    // A pair not stored yet (or stored at other text) still must never be asked again.
    ins.run(repo, x, y, at, at, repo, x, repo, y);
  }
}

/** Back to the comparison's roles; the next answer is applied to them. */
function restoreRoles(db: DatabaseSync, id: string): void {
  db.prepare("UPDATE dupe_group_items SET role = base_role, target = base_target WHERE decision_id = ?").run(id);
}

/** An undone answer leaves nothing of it in the roles. */
export function resetGroupAnswer(db: DatabaseSync, id: string): void {
  if (!id.includes(":dupegroup:")) return;
  restoreRoles(db, id);
  db.prepare("UPDATE dupe_groups SET applied_answer = NULL WHERE decision_id = ?").run(id);
}

/** Writes the roles an answer of "keep #N instead" implies: N is kept; the kept item it replaces closes when it is open and in the pilot, else stays. */
function rekeep(db: DatabaseSync, id: string, n: number, repo: string): void {
  restoreRoles(db, id);
  const row = db.prepare("SELECT kind FROM dupe_group_items WHERE decision_id = ? AND number = ?").get(id, n) as { kind: string } | undefined;
  if (!row) return;
  const old = db.prepare("SELECT gi.number, i.state FROM dupe_group_items gi JOIN items i ON i.repo = gi.repo AND i.number = gi.number WHERE gi.decision_id = ? AND gi.kind = ? AND gi.role = 'keep' AND gi.number <> ?").all(id, row.kind, n) as { number: number; state: string }[];
  for (const o of old) {
    const closes = o.state === "OPEN" && inPilot(db, repo, o.number);
    db.prepare("UPDATE dupe_group_items SET role = ?, target = ? WHERE decision_id = ? AND number = ?").run(closes ? "close" : "stay", closes ? n : null, id, o.number);
  }
  db.prepare("UPDATE dupe_group_items SET target = ? WHERE decision_id = ? AND kind = ? AND role = 'close' AND number <> ?").run(n, id, row.kind, n);
  db.prepare("UPDATE dupe_group_items SET role = 'keep', target = NULL WHERE decision_id = ? AND number = ?").run(id, n);
}

/**
 * Operator answers. A pair decision answered "not a duplicate" or "keep both" stores the pair as distinct for
 * good. A group decision answered "not duplicates" does so for every pair of the group; "keep #N instead"
 * rewrites the group's roles; "use this answer" needs no change. Closing is the act step's.
 * With `only`, just the decisions whose ids it holds.
 */
export function applyDuplicateAnswers(db: DatabaseSync, at: string, only?: ReadonlySet<string>): number {
  let n = 0;
  for (const a of actionable(db)) {
    if (a.kind !== "duplicate" || a.number === null || a.repo === null) continue;
    if (only && !only.has(a.id)) continue;
    if (a.id.includes(":dupegroup:")) {
      const g = db.prepare("SELECT applied_answer FROM dupe_groups WHERE decision_id = ?").get(a.id) as { applied_answer: string | null } | undefined;
      if (!g || g.applied_answer === a.answer) continue;
      restoreRoles(db, a.id);
      const members = (db.prepare("SELECT number FROM dupe_group_items WHERE decision_id = ?").all(a.id) as { number: number }[]).map((r) => r.number);
      const kept = keptOf(a.answer);
      if (a.answer === "distinct") {
        markDistinct(db, a.repo, members, at);
        db.prepare("UPDATE main.decisions SET applied_at = ? WHERE id = ? AND applied_at IS NULL").run(at, a.id);
      } else if (kept !== null) rekeep(db, a.id, kept, a.repo);
      db.prepare("UPDATE dupe_groups SET applied_answer = ? WHERE decision_id = ?").run(a.answer, a.id);
      audit(db, ACTOR, "duplicate-answer", `${a.repo}#${a.number}`, { decision: a.id, answer: a.answer });
      n++;
      continue;
    }
    if (a.answer === "close") continue;
    const d = getDecision(db, a.id)!;
    const f = factsOf(d).find((x) => x.startsWith(DUP_FACT))?.slice(DUP_FACT.length);
    const m = f ? /^([\w.-]+)#(\d+)$/.exec(f) : null;
    if ((a.answer === "distinct" || a.answer === "keep") && m) markDistinct(db, a.repo, [a.number, Number(m[2])], at);
    db.prepare("UPDATE main.decisions SET applied_at = ? WHERE id = ? AND applied_at IS NULL").run(at, a.id);
    audit(db, ACTOR, "duplicate-answer", `${a.repo}#${a.number}`, { decision: a.id, answer: a.answer });
    n++;
  }
  return n;
}
