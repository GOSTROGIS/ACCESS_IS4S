// Act for duplicate group decisions answered "use this answer" or "keep #N instead": post the
// exact comments stored for the chosen option (src/dupes/texts.ts) and close the members it closes.
// Each write is recorded in dupe_group_posts right after it happens, so a retry or a crash
// midway never repeats a comment or a close. A member that closed, merged or moved on its own
// is skipped, and so is a whole decision whose answer or roles changed (undo, refresh) while the run went on.
import { settledBySql } from "../settlers.ts";
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { embedHash } from "../itemhash.ts";
import { backlogHeld } from "../dupes/held.ts";
import { inPilot } from "../pilot.ts";
import { textsFor } from "../dupes/texts.ts";
import { compareAgain } from "../dupes/compare.ts";
import { comparedHead } from "../dupes/plan.ts";

const ACTOR = "act";
/** Failed writes on one member before it is recorded as skipped. */
export const MAX_FAILS = 3;

export type GroupLive = { id: string; type: "Issue" | "PullRequest"; state: string; head: string | null };
export type GroupIo = {
  live(number: number): Promise<GroupLive | null>;
  /** Returns the comment's URL. */
  comment(live: GroupLive, body: string, at: { number: number; decision: string }): Promise<string>;
  /** `kept` is the group's kept item (an issue when there is one) the closed member duplicates. */
  close(live: GroupLive, at: { number: number; decision: string }, kept?: GroupLive & { number: number }): Promise<void>;
  /** Called before a decision's writes: a string says why the decision waits (its operator has no token or no access), and it is left for a later run. */
  begin?(decision: string): Promise<string | null>;
  /** A write of the decision failed with `why` (the error `err`); true when that is a wait for the operator's access or a transient failure, not a failure to count. */
  failed?(decision: string, why: string, err: unknown): boolean;
};
export type GroupRun = {
  repo: string; io: GroupIo; at: () => string; log: (line: string) => void;
  /** Writes this run may still do under the step's limit. */
  left: () => number;
  handled: () => void;
  dryRun: boolean;
};
export type GroupResult = { done: string[]; skipped: { ref: string; reason: string }[]; failed: { ref: string; reason: string }[] };

type Item = { number: number; kind: string; role: string; detail: string | null; head: string | null };
type Decision = { id: string; answer: string };

/** Answered group decisions of the repo whose roles are written (applyDuplicateAnswers ran) and that are not applied yet. */
export function groupDecisionsToAct(db: DatabaseSync, repo: string): Decision[] {
  return db.prepare(`SELECT d.id, d.answer FROM decisions d JOIN dupe_groups g ON g.decision_id = d.id
    WHERE d.kind = 'duplicate' AND d.repo = ? AND d.answer IS NOT NULL AND d.answer NOT IN ('distinct', 'backlog') AND d.applied_at IS NULL
      AND g.applied_answer = d.answer AND ${settledBySql("d")} ORDER BY d.answered_at`).all(repo) as Decision[];
}

/** Members the act step still has to close, over all repos: close-role members of the decisions above (as actOnGroups selects its closers) with no close record yet. The planner lists an act action for each. */
export function groupClosersPending(db: DatabaseSync): { decisionId: string; repo: string; number: number }[] {
  const rows = db.prepare(`SELECT d.id, d.repo, gi.number FROM decisions d JOIN dupe_groups g ON g.decision_id = d.id JOIN dupe_group_items gi ON gi.decision_id = d.id
    WHERE d.kind = 'duplicate' AND d.repo IS NOT NULL AND d.id LIKE '%:dupegroup:%' AND d.answer IS NOT NULL AND d.answer NOT IN ('distinct', 'backlog') AND d.applied_at IS NULL
      AND g.applied_answer = d.answer AND ${settledBySql("d")} AND gi.role = 'close'
      AND NOT EXISTS (SELECT 1 FROM dupe_group_posts p WHERE p.decision_id = d.id AND p.number = gi.number AND p.step = 'close')
    ORDER BY d.answered_at, gi.number`).all() as { id: string; repo: string; number: number }[];
  return rows.filter((r) => inPilot(db, r.repo, r.number) && !backlogHeld(db, r.repo, r.number)).map((r) => ({ decisionId: r.id, repo: r.repo, number: r.number }));
}

/** The decision's answer and the item's stored role are still what the run started from: an undo or a refresh in between changes them. */
function unchanged(db: DatabaseSync, dec: Decision, item: Item): boolean {
  return !!db.prepare(`SELECT 1 FROM decisions d JOIN dupe_groups g ON g.decision_id = d.id JOIN dupe_group_items gi ON gi.decision_id = d.id
    WHERE d.id = ? AND d.answer = ? AND d.applied_at IS NULL AND g.applied_answer = ? AND gi.number = ? AND gi.role = ?`).get(dec.id, dec.answer, dec.answer, item.number, item.role);
}

const carryOf = (detail: string | null): string[] => {
  try {
    const v = (JSON.parse(detail ?? "null") as { carry?: unknown } | null)?.carry;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
};

export async function actOnGroups(db: DatabaseSync, run: GroupRun): Promise<GroupResult> {
  const res: GroupResult = { done: [], skipped: [], failed: [] };
  const posted = db.prepare("SELECT 1 FROM dupe_group_posts WHERE decision_id = ? AND number = ? AND step = ?");
  const record = (id: string, n: number, step: string, url: string | null) =>
    db.prepare("INSERT OR IGNORE INTO dupe_group_posts (decision_id, number, step, url, at) VALUES (?, ?, ?, ?, ?)").run(id, n, step, url, run.at());
  const ref = (n: number) => `${run.repo}#${n}`;

  decisions: for (const dec of groupDecisionsToAct(db, run.repo)) {
    const items = db.prepare("SELECT number, kind, role, detail, head FROM dupe_group_items WHERE decision_id = ? ORDER BY number").all(dec.id) as Item[];
    const texts = new Map(textsFor(db, dec.id, dec.answer).map((t) => [`${t.number}:${t.step}`, t.text]));
    const closers = items.filter((i) => i.role === "close" && inPilot(db, run.repo, i.number) && !backlogHeld(db, run.repo, i.number));
    const details = items.find((i) => i.role === "keep" && i.kind === "issue" && texts.has(`${i.number}:details`) && inPilot(db, run.repo, i.number));
    if (run.dryRun) {
      if (details && !posted.get(dec.id, details.number, "details")) run.log(`  would post the details comment on ${ref(details.number)} (${dec.id})`);
      for (const c of closers) if (!posted.get(dec.id, c.number, "close")) run.log(`  would comment and close ${ref(c.number)} (${dec.id})`);
      continue;
    }
    // A PR is closed or kept only at a head a stored comparison read: with none that recorded heads, the set is compared first
    // (compareAgain marks a stored row; a set with no row is due anyway). A PR with no head is released below instead.
    const unbound = items.filter((i) => i.kind === "pr" && i.role !== "stay" && !!i.head && !posted.get(dec.id, i.number, "close") && comparedHead(db, run.repo, i.number) === undefined);
    if (unbound.length) {
      for (const i of unbound) compareAgain(db, ACTOR, run.repo, i.number);
      run.log(`  ${dec.id}: waits for a comparison that records the heads of ${unbound.map((i) => ref(i.number)).join(", ")}`);
      continue;
    }
    const waits = await run.io.begin?.(dec.id);
    if (waits) { run.log(`  ${dec.id}: waiting: ${waits}`); continue; }
    const skip = (n: number, step: string, reason: string, release = false) => {
      record(dec.id, n, step, null);
      if (release) {
        // Not closed by this decision: it stays open, is no longer held or settled by it, and the next comparison may ask about it again.
        db.prepare("UPDATE dupe_group_items SET role = 'stay', target = NULL, base_role = 'stay', base_target = NULL WHERE decision_id = ? AND number = ?").run(dec.id, n);
        record(dec.id, n, "released", null);
        audit(db, ACTOR, "duplicate-member-released", ref(n), { decision: dec.id, reason });
      }
      audit(db, ACTOR, "act-skip", ref(n), { decision: dec.id, reason });
      res.skipped.push({ ref: ref(n), reason });
      run.log(`  ${ref(n)}: skipped: ${reason}`);
    };
    const changed = (it: Item): boolean => {
      if (unchanged(db, dec, it)) return false;
      run.log(`  ${dec.id}: changed since the run started; left for the next run`);
      return true;
    };
    let cur: { item: Item; step: string } | null = null;
    try {
      if (closers.some((c) => !posted.get(dec.id, c.number, "close")) || (details && !posted.get(dec.id, details.number, "details"))) {
        // The kept items must still stand: a closed (unmerged) kept item makes the duplicates' comments wrong.
        for (const k of items.filter((i) => i.role === "keep")) {
          const live = await run.io.live(k.number);
          const gone = !live || (live.state !== "OPEN" && !(live.type === "PullRequest" && live.state === "MERGED"));
          // An open kept PR at another head than the comparison read is no longer the code the duplicates were closed for.
          const bound = k.kind === "pr" ? comparedHead(db, run.repo, k.number) : undefined;
          // A kept PR with no known head is no code a comparison saw: the decision ends, and comparing again would not tell more.
          const unknown = !gone && k.kind === "pr" && live!.state === "OPEN" && (!k.head || !bound);
          const moved = !gone && !unknown && k.kind === "pr" && live!.state === "OPEN" && (live!.head !== k.head || bound !== k.head);
          if (gone || unknown || moved) {
            // Nothing stays held by a decision that can no longer close anything: the members are released and the next comparison asks again.
            const reason = moved ? `the head of the kept PR ${ref(k.number)} moved since the comparison` : unknown ? `no comparison read a head of the kept PR ${ref(k.number)}` : `the kept item ${ref(k.number)} is gone or closed`;
            for (const c of closers) if (!posted.get(dec.id, c.number, "close")) skip(c.number, "close", reason, true);
            // The next comparison reads the kept PR's new head.
            if (moved) compareAgain(db, ACTOR, run.repo, k.number);
            db.prepare("UPDATE main.decisions SET applied_at = ? WHERE id = ? AND applied_at IS NULL").run(run.at(), dec.id);
            audit(db, ACTOR, "duplicate-group-ended", dec.id, { reason });
            run.log(`  ${dec.id}: ${reason}; group ended`);
            continue decisions;
          }
        }
      }
      if (details && !posted.get(dec.id, details.number, "details")) {
        if (run.left() <= 0) return res;
        cur = { item: details, step: "details" };
        if (changed(details)) continue decisions;
        const live = await run.io.live(details.number);
        if (!live || live.state !== "OPEN") skip(details.number, "details", "the kept issue is gone or closed; no details comment");
        else {
          if (changed(details)) continue decisions;
          const text = texts.get(`${details.number}:details`)!;
          const url = await run.io.comment(live, text, { number: details.number, decision: dec.id });
          record(dec.id, details.number, "details", url);
          run.handled();
          run.log(`  ${ref(details.number)}: posted the details comment`);
        }
      }
      for (const c of closers) {
        if (posted.get(dec.id, c.number, "close")) continue;
        if (run.left() <= 0) return res;
        cur = { item: c, step: "close" };
        if (changed(c)) continue decisions;
        const live = await run.io.live(c.number);
        if (!live) { skip(c.number, "close", "GitHub returned no such item"); continue; }
        if (live.state !== "OPEN") { skip(c.number, "close", `already ${live.state.toLowerCase()} on GitHub`); continue; }
        if (c.kind === "pr") {
          const bound = comparedHead(db, run.repo, c.number);
          // No head known: released without comparing again, which would read no head either.
          if (!c.head || !bound) { skip(c.number, "close", "no comparison read a head of it", true); continue; }
          if (live.head !== c.head || bound !== c.head) { skip(c.number, "close", "the head moved since the comparison", true); compareAgain(db, ACTOR, run.repo, c.number); continue; }
        }
        if (c.kind === "issue" && c.head) {
          const row = db.prepare("SELECT embed_hash, title, body FROM items WHERE repo = ? AND number = ?").get(run.repo, c.number) as { embed_hash: string | null; title: string | null; body: string | null } | undefined;
          // A missing stored hash is computed from the text; an item without a row counts as changed.
          const now = row ? (row.embed_hash ?? embedHash(row.title, row.body)) : null;
          if (now !== c.head) { skip(c.number, "close", "the text changed since the comparison", true); continue; }
        }
        const text = texts.get(`${c.number}:close`);
        if (!text) { skip(c.number, "close", "the decision stores no comment for this answer"); continue; }
        let url = (db.prepare("SELECT url FROM dupe_group_posts WHERE decision_id = ? AND number = ? AND step = 'comment'").get(dec.id, c.number) as { url: string | null } | undefined)?.url ?? null;
        if (url === null) {
          if (changed(c)) continue decisions;
          url = await run.io.comment(live, text, { number: c.number, decision: dec.id });
          record(dec.id, c.number, "comment", url);
        }
        if (changed(c)) continue decisions;
        const keep = items.find((i) => i.role === "keep" && i.kind === "issue") ?? items.find((i) => i.role === "keep");
        const keptLive = keep ? await run.io.live(keep.number) : null;
        await run.io.close(live, { number: c.number, decision: dec.id }, keep && keptLive ? { ...keptLive, number: keep.number } : undefined);
        record(dec.id, c.number, "close", url);
        db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, 'closed', ?, ?, ?)").run(run.repo, c.number, run.at(), ACTOR, `closed after duplicate group decision ${dec.id}`);
        res.done.push(ref(c.number));
        run.handled();
        run.log(`  ${ref(c.number)}: commented and closed`);
      }
    } catch (e) {
      const why = (e as Error).message.replace(/\s+/g, " ").slice(0, 300);
      if (run.io.failed?.(dec.id, why, e)) { run.log(`  ${dec.id}: waiting: ${why}`); continue; }
      res.failed.push({ ref: cur ? ref(cur.item.number) : dec.id, reason: why });
      run.log(`  ${dec.id}: failed: ${why}`);
      if (!cur) return res;
      // One permanent error (a locked issue, a 403) must not block every later group: after MAX_FAILS the member is skipped.
      db.prepare("INSERT INTO dupe_group_fails (decision_id, number, fails) VALUES (?, ?, 1) ON CONFLICT (decision_id, number) DO UPDATE SET fails = fails + 1").run(dec.id, cur.item.number);
      const n = (db.prepare("SELECT fails FROM dupe_group_fails WHERE decision_id = ? AND number = ?").get(dec.id, cur.item.number) as { fails: number }).fails;
      if (n < MAX_FAILS) return res;
      // A member whose comment is already public is settled, not released: re-asking would repeat the comment.
      const commented = !!db.prepare("SELECT 1 FROM dupe_group_posts WHERE decision_id = ? AND number = ? AND step = 'comment' AND url IS NOT NULL").get(dec.id, cur.item.number);
      skip(cur.item.number, cur.step, `${n} writes failed: ${why}`, cur.step === "close" && !commented);
    }
    // Applied once every member to close has a close record and the details comment is settled.
    if (closers.every((c) => posted.get(dec.id, c.number, "close")) && (!details || posted.get(dec.id, details.number, "details"))) {
      db.prepare("UPDATE main.decisions SET applied_at = ? WHERE id = ? AND applied_at IS NULL").run(run.at(), dec.id);
      audit(db, ACTOR, "act-group-applied", dec.id, { answer: dec.answer });
      queueCarry(db, run.repo, dec.id, items, run.at());
    }
  }
  return res;
}

/** The kept PR gets a carry job when the PRs closed in its group name parts worth carrying over. */
function queueCarry(db: DatabaseSync, repo: string, id: string, items: Item[], at: string): void {
  const keep = items.find((i) => i.role === "keep" && i.kind === "pr");
  if (!keep || !items.some((i) => i.kind === "pr" && i.role === "close" && carryOf(i.detail).length && db.prepare("SELECT 1 FROM dupe_group_posts WHERE decision_id = ? AND number = ? AND step = 'close' AND url IS NOT NULL").get(id, i.number))) return;
  db.prepare("INSERT OR IGNORE INTO dupe_carries (decision_id, repo, number, state, updated_at) VALUES (?, ?, ?, 'queued', ?)").run(id, repo, keep.number, at);
  audit(db, ACTOR, "carry-queued", `${repo}#${keep.number}`, { decision: id });
}
