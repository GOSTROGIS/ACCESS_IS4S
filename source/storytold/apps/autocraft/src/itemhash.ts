// Hashes of an item's text, stored on the item row when sync writes it so the
// planner compares columns instead of reading and hashing every body each minute.
//   embed_hash: hash of the embedded text (src/embed/text.ts); decides re-embedding.
//   class_hash: the classifier's input hash (scheme, title, body, size); decides re-classifying.
//     class_scheme names the scheme it was computed under, so a changed scheme rehashes lazily.
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { itemInput, type Item } from "./classify/parse.ts";
import { LABELS, RULES } from "./classify/rules.ts";
import { itemText, textHash } from "./embed/text.ts";

export const SCHEME = createHash("sha256").update(JSON.stringify(LABELS)).update(RULES).digest("hex");
export const SCHEME_ID = SCHEME.slice(0, 16);

export const inputHash = (i: Item): string =>
  createHash("sha256").update(SCHEME).update(JSON.stringify(itemInput(i))).digest("hex").slice(0, 32);

export const embedHash = (title: string | null, body: string | null): string => textHash(itemText(title, body));

type Fields = {
  repo: string; number: number; kind: string; title: string | null; body: string | null;
  additions: number | null; deletions: number | null; changed_files: number | null; author_association: string | null;
};

/** The classifier's view of an item row (the same shape `SELECT ... i.additions + i.deletions` gives). */
export function classifyHash(r: Fields): string {
  return inputHash({
    repo: r.repo, number: r.number, kind: r.kind as "pr" | "issue", title: r.title ?? "", body: r.body ?? "",
    lines_changed: r.additions === null || r.deletions === null ? null : r.additions + r.deletions,
    files_changed: r.changed_files, author_association: r.author_association,
  });
}

/** Hash columns for an item row about to be written. */
export function hashColumns(r: Fields): { embed_hash: string; class_hash: string; class_scheme: string } {
  return { embed_hash: embedHash(r.title, r.body), class_hash: classifyHash(r), class_scheme: SCHEME_ID };
}

const FIELDS = "repo, number, kind, title, body, additions, deletions, changed_files, author_association";
const BATCH = 2000;

/** Fills embed_hash where it is missing. Returns the number of rows written. */
export function fillEmbedHashes(db: DatabaseSync): number {
  return fill(db, `SELECT ${FIELDS} FROM main.items WHERE embed_hash IS NULL LIMIT ${BATCH}`,
    "UPDATE main.items SET embed_hash = ? WHERE repo = ? AND number = ?", (r) => [embedHash(r.title, r.body)]);
}

/** Fills class_hash where it is missing or was computed under another scheme. Only open items: the classifier reads no others. */
export function fillClassHashes(db: DatabaseSync): number {
  return fill(db, `SELECT ${FIELDS} FROM main.items WHERE state = 'OPEN' AND class_scheme IS NOT '${SCHEME_ID}' LIMIT ${BATCH}`,
    `UPDATE main.items SET class_hash = ?, class_scheme = '${SCHEME_ID}' WHERE repo = ? AND number = ?`, (r) => [classifyHash(r)]);
}

function fill(db: DatabaseSync, select: string, update: string, values: (r: Fields) => string[]): number {
  const sel = db.prepare(select), upd = db.prepare(update);
  let total = 0;
  for (;;) {
    const rows = sel.all() as unknown as Fields[];
    if (!rows.length) return total;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const r of rows) upd.run(...values(r), r.repo, r.number);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    total += rows.length;
  }
}
