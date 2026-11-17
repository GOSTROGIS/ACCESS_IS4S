// What one dashboard reader may see of text the planner stores once for everyone: plan reasons and notes, wait texts,
// status lines and queue rows. Staff (operators and maintainers) read it unless it names a repo hidden from them; viewers
// read plain words without model or log text; a quiet pull request shows viewers none of it.
import type { DatabaseSync } from "node:sqlite";
import type { ItemStatus, QueueRow } from "../../../web/src/api/types.ts";
import { isHiddenRepo, type HiddenRepos } from "../../hidden-sql.ts";
import { BLOCKS_REVIEW, blockersOfWait } from "../../review/blockers.ts";
import { quietFixPrs } from "../../security/quiet.ts";
import type { Req } from "../types.ts";
import { canSeeInternals } from "./staff.ts";
import { blankIfHidden, hiddenRepos } from "./visible.ts";

export type Reader = { staff: boolean; hidden: HiddenRepos; /** Quiet pull requests as `repo#number`; empty for staff, who see them. */ quiet: Set<string> };

export async function readerOf(db: DatabaseSync, req: Req): Promise<Reader> {
  const staff = canSeeInternals(req);
  return { staff, hidden: await hiddenRepos(db, req), quiet: staff ? new Set() : quietFixPrs(db) };
}

/** The reader of one item's trace context (src/dash/api/trace.ts): `veiled` there says the item is quiet for this reader. */
export const itemReader = (c: { staff: boolean; hidden: HiddenRepos; veiled: boolean; ref: string }): Reader => ({ staff: c.staff, hidden: c.hidden, quiet: c.veiled ? new Set([c.ref]) : new Set() });

/** True when the reader gets none of the stored text about `repo#number` (a viewer and a quiet pull request). */
export const veiledFor = (r: Reader, repo: string, number: number): boolean => r.quiet.has(`${repo}#${number}`);

/** A plan reason without its quoted part: the words before the excerpt of a statement, verification or refusal text. */
export function plainReason(s: string): string {
  if (s.startsWith("conflicts with ")) return "conflicts with an owner statement";
  const colon = s.indexOf(": ");
  return colon >= 0 ? s.slice(0, colon) : s;
}

/** The plan's reasons as the reader may see them: whole for staff unless they name a hidden repo, plain words otherwise. */
export const reasonsFor = (r: Pick<Reader, "staff" | "hidden">, reasons: string[]): string[] =>
  reasons.map((s) => (r.staff && blankIfHidden(s, r.hidden) ? s : plainReason(s)));

/**
 * A wait text as the reader may see it. A review held by blocking items keeps the items the reader can see; one held only by
 * hidden items says "another item". Any other wait that names a hidden repo is left out.
 */
export function waitFor(r: Pick<Reader, "hidden">, wait: string | null): string | null {
  if (!wait) return wait;
  const refs = blockersOfWait(wait);
  if (refs.length) {
    const shown = refs.filter((ref) => !isHiddenRepo(r.hidden, ref.slice(0, ref.lastIndexOf("#"))));
    return shown.length === refs.length ? wait : `${shown.length ? shown.join(", ") : "another item"}${BLOCKS_REVIEW}`;
  }
  return blankIfHidden(wait, r.hidden) || null;
}

/** A stored status line for the reader: a viewer of a quiet pull request gets the phase only (the wait and next step quote the planner's reasons). */
export function statusFor<S extends Pick<ItemStatus, "waiting" | "next">>(r: Reader, repo: string, number: number, s: S): S {
  if (veiledFor(r, repo, number)) return { ...s, waiting: null, next: null };
  return { ...s, waiting: waitFor(r, s.waiting), next: blankIfHidden(s.next, r.hidden) || null };
}

/** The text fields of a queue row as the reader may see them; the item API gives viewers the same (no review reason, verification text or notes). */
export function queueTextFor(r: Reader, row: QueueRow): QueueRow {
  const verify = row.verify && { ...row.verify, summary: null, note: null };
  if (veiledFor(r, row.repo, row.number)) return { ...row, reason: "", refusedReason: null, note: null, outsideRule: [], verify };
  if (!r.staff) return { ...row, reason: "", refusedReason: null, note: null, outsideRule: row.outsideRule.map(plainReason), verify };
  return { ...row, outsideRule: reasonsFor(r, row.outsideRule), note: blankIfHidden(row.note, r.hidden) || null, refusedReason: blankIfHidden(row.refusedReason, r.hidden) || null };
}
