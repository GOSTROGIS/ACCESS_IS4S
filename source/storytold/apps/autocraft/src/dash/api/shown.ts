// Kind, state and title of mirrored items, for rows that show an item reference.
import type { DatabaseSync } from "node:sqlite";
import type { ItemRef, ItemShown, ItemState } from "../../../web/src/api/types.ts";

const STATE: Record<string, ItemState> = { OPEN: "open", MERGED: "merged", CLOSED: "closed" };
export const itemState = (s: string | null | undefined): ItemState => STATE[s ?? ""] ?? "open";

export function shownLookup(db: DatabaseSync): (repo: string, number: number) => ItemShown {
  const q = db.prepare("SELECT kind, state, title FROM items WHERE repo = ? AND number = ?");
  return (repo, number) => {
    const r = q.get(repo, number) as { kind: string; state: string; title: string | null } | undefined;
    return r ? { kind: r.kind === "pr" ? "pr" : "issue", state: itemState(r.state), title: r.title } : { kind: null, state: null, title: null };
  };
}

export const withShown = (db: DatabaseSync, refs: ItemRef[]): (ItemRef & ItemShown)[] => {
  const shown = shownLookup(db);
  return refs.map((r) => ({ ...r, ...shown(r.repo, r.number) }));
};
