// Items held back from the later stages while a duplicate decision about them
// is open or was answered "close as duplicate", or any decision about them was
// answered Backlog. An answer of "not a duplicate"
// or "keep both" releases them. No Node imports besides the type and the app-slug lookup.
import type { DatabaseSync } from "node:sqlite";
import { pilotSql } from "../pilot.ts";
import { appSlug } from "../github/identity.ts";

/** The fact line that names the original; the act step reads it. */
export const DUP_FACT = "duplicate of ";

/** Option keys of a group decision: use the compared answer, keep another member instead (`keep:<number>`), or not duplicates. */
export const GROUP_OPTIONS = {
  accept: { key: "accept", label: "Use this answer", hint: "Posts the comments shown under it and closes the others as duplicates." },
  distinct: { key: "distinct", label: "Not duplicates", hint: "They are different; do not ask about this group again." },
} as const;
export const keepKey = (n: number): string => `keep:${n}`;
/** The member an answer keeps instead, or null. */
export const keptOf = (answer: string): number | null => {
  const m = /^keep:(\d+)$/.exec(answer);
  return m ? Number(m[1]) : null;
};
/** The id of the group decision whose lowest member is `lowest`. */
export const groupId = (repo: string, lowest: number): string => `${repo}:dupegroup:${lowest}`;

/** SQL condition, true when the item `alias` is a member a group decision closes and the group is still open or was answered other than "not duplicates". */
export const groupHeldSql = (alias: string): string =>
  `EXISTS (SELECT 1 FROM dupe_group_items gi JOIN decisions dg ON dg.id = gi.decision_id WHERE gi.repo = ${alias}.repo AND gi.number = ${alias}.number
    AND gi.role = 'close' AND dg.kind = 'duplicate' AND (dg.answer IS NULL OR dg.answer = 'accept' OR dg.answer LIKE 'keep:%'))`;

/** SQL condition, true when the item `alias` is named by a decision answered Backlog: the decision's own item, an item of a batch, or a member of a duplicate group. */
export const backlogHeldSql = (alias: string): string =>
  `EXISTS (SELECT 1 FROM decisions db WHERE db.answer = 'backlog' AND (
    (db.repo = ${alias}.repo AND db.number = ${alias}.number)
    OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(db.items) THEN db.items ELSE '[]' END) bj
      WHERE json_extract(bj.value, '$.repo') = ${alias}.repo AND json_extract(bj.value, '$.number') = ${alias}.number)
    OR EXISTS (SELECT 1 FROM dupe_group_items bg WHERE bg.decision_id = db.id AND bg.repo = ${alias}.repo AND bg.number = ${alias}.number)))`;

/** Live app slug as a JSON list; the persisted `app_slugs` setting covers slugs that are unreadable now or were replaced. */
const liveSlugJson = (): string => JSON.stringify([appSlug()].filter(Boolean)).replaceAll("'", "''");

/** SQL condition, true when the item `alias` (a row of items) is not an integration batch PR the pipeline opened itself (see src/merge/batch.ts). Such PRs only carry reviewed PRs and never enter the pipeline as contributor PRs. */
export const notOwnIntegrationSql = (alias: string): string =>
  `NOT EXISTS (SELECT 1 FROM main.merge_batches mb WHERE mb.repo = ${alias}.repo AND mb.pr_number = ${alias}.number
    AND (${alias}.author = (SELECT value FROM main.settings WHERE key = 'pipeline_login')
      OR EXISTS (SELECT 1 FROM (SELECT value AS slug FROM json_each('${liveSlugJson()}')
          UNION SELECT value FROM json_each(CASE WHEN json_valid((SELECT value FROM main.settings WHERE key = 'app_slugs')) THEN (SELECT value FROM main.settings WHERE key = 'app_slugs') ELSE '[]' END))
        WHERE ${alias}.author IN (slug, slug || '[bot]')))) `;

/** SQL condition, true when the item `alias` (a row of items) is not held by a duplicate decision, is not one of our integration PRs and is in the pilot (when one is set). For WHERE clauses of candidate queries. */
export const notHeldSql = (alias: string): string =>
  `${notOwnIntegrationSql(alias)} AND ${pilotSql(alias)} AND NOT EXISTS (SELECT 1 FROM decisions dh WHERE dh.kind = 'duplicate' AND dh.id NOT LIKE '%:dupegroup:%' AND dh.repo = ${alias}.repo AND dh.number = ${alias}.number AND (dh.answer IS NULL OR dh.answer = 'close')) AND NOT ${groupHeldSql(alias)} AND NOT ${backlogHeldSql(alias)}`;

/** True when a Backlog answer holds the item. */
export function backlogHeld(db: DatabaseSync, repo: string, number: number): boolean {
  return !!db.prepare(`SELECT 1 FROM items i WHERE i.repo = ? AND i.number = ? AND ${backlogHeldSql("i")}`).get(repo, number);
}

export function duplicateHeld(db: DatabaseSync, repo: string, number: number): boolean {
  return !!db.prepare(`SELECT 1 FROM decisions WHERE kind = 'duplicate' AND id NOT LIKE '%:dupegroup:%' AND repo = ? AND number = ? AND (answer IS NULL OR answer = 'close')`).get(repo, number)
    || !!db.prepare(`SELECT 1 FROM items i WHERE i.repo = ? AND i.number = ? AND (${groupHeldSql("i")} OR ${backlogHeldSql("i")})`).get(repo, number);
}

/** Open duplicates pointing at the canonical item: items held by a decision that names it as the original. */
export function duplicateCount(db: DatabaseSync, repo: string, canonical: number): number {
  const pairs = (db.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE kind = 'duplicate' AND id NOT LIKE '%:dupegroup:%' AND repo = ? AND (answer IS NULL OR answer = 'close')
    AND EXISTS (SELECT 1 FROM json_each(facts) WHERE value = ?)`).get(repo, `${DUP_FACT}${repo}#${canonical}`) as { n: number }).n;
  const groups = (db.prepare(`SELECT COUNT(*) AS n FROM dupe_group_items gi JOIN decisions dg ON dg.id = gi.decision_id
    WHERE gi.repo = ? AND gi.target = ? AND gi.role = 'close' AND (dg.answer IS NULL OR dg.answer = 'accept' OR dg.answer LIKE 'keep:%')`).get(repo, canonical) as { n: number }).n;
  return pairs + groups;
}
