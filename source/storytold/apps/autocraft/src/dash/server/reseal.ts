// Startup migration: values sealed under the earlier key label are sealed again under the current key, so
// TokenBox.open never needs the earlier one. Every table that holds TokenBox-sealed values is listed here.
import type { DatabaseSync } from "node:sqlite";
import type { TokenBox } from "./crypto.ts";

type Store = { table: string; key: string; cols: string[]; aad: (r: Record<string, string | null>) => string };

const userAad = (login: string | null): string => `user_tokens:${login!.toLowerCase()}`;

const STORES: Store[] = [
  { table: "sessions", key: "id_hash", cols: [], aad: (r) => r.id_hash! },
  { table: "user_tokens", key: "login", cols: [], aad: (r) => userAad(r.login!) },
  { table: "user_token_revocations", key: "id", cols: ["login", "aad"], aad: (r) => r.aad ?? userAad(r.login!) },
  { table: "reporter_tokens", key: "reporter", cols: [], aad: (r) => `reporter_tokens:${r.reporter!}` },
];

/** Re-seals every legacy-sealed token_enc value in one transaction; returns the count per table (tables with a change only). Idempotent. */
export function resealLegacyValues(db: DatabaseSync, box: TokenBox): Record<string, number> {
  const todo: Array<{ table: string; key: string; id: string | number; old: string; sealed: string }> = [];
  for (const s of STORES) {
    const rows = db.prepare(`SELECT ${[s.key, "token_enc", ...s.cols].join(", ")} FROM ${s.table} WHERE token_enc IS NOT NULL`).all() as Array<Record<string, string | number | null>>;
    for (const r of rows) {
      const old = String(r.token_enc);
      const sealed = box.resealLegacy(old, s.aad(r as Record<string, string | null>));
      if (sealed) todo.push({ table: s.table, key: s.key, id: r[s.key] as string | number, old, sealed });
    }
  }
  const counts: Record<string, number> = {};
  if (!todo.length) return counts;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const t of todo) {
      const r = db.prepare(`UPDATE ${t.table} SET token_enc = ? WHERE ${t.key} = ? AND token_enc = ?`).run(t.sealed, t.id, t.old);
      if (Number(r.changes)) counts[t.table] = (counts[t.table] ?? 0) + 1;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return counts;
}
