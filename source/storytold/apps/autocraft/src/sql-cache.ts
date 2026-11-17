// Prepared statements kept per connection, for the per-row lookups of list endpoints: preparing the same text again for every row costs more than running it.
import type { DatabaseSync, StatementSync } from "node:sqlite";

const cache = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

/** The prepared statement for `sql` on `db`. Only for fixed text: every distinct text stays in memory. */
export function prep(db: DatabaseSync, sql: string): StatementSync {
  let m = cache.get(db);
  if (!m) cache.set(db, (m = new Map()));
  let st = m.get(sql);
  if (!st) m.set(sql, (st = db.prepare(sql)));
  return st;
}
