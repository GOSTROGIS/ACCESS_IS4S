// Area lists (one saved version per change), item areas and model proposals. Plain SQL over the
// tables area_lists, item_areas and area_proposals; the assignment itself is in assign.ts.
import { prep } from "../sql-cache.ts";
import type { DatabaseSync } from "node:sqlite";
import { AREAS_MAX, AREA_DESCRIPTION_MAX, AREA_NAME_MAX, NONE_OF_THESE, type Area } from "./types.ts";

export class AreaError extends Error {}

const now = () => new Date().toISOString();
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function cleanName(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, AREA_NAME_MAX) : "";
}
export function cleanDescription(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, AREA_DESCRIPTION_MAX) : "";
}

/** A list with unusable and repeated entries dropped. Used on model output; operator edits go through `editAreas`, which refuses them. */
export function lenientAreas(v: unknown, max = AREAS_MAX): Area[] {
  const out: Area[] = [];
  if (!Array.isArray(v)) return out;
  for (const o of v as Record<string, unknown>[]) {
    const name = cleanName(o?.name), description = cleanDescription(o?.description);
    if (!name || !description || same(name, NONE_OF_THESE) || out.some((a) => same(a.name, name))) continue;
    out.push({ name, description });
    if (out.length >= max) break;
  }
  return out;
}

export type AreaList = { repo: string; version: number; areas: Area[]; at: string; by: string | null; note: string | null };

export function currentList(db: DatabaseSync, repo: string): AreaList | null {
  const r = db.prepare("SELECT version, areas, at, by, note FROM area_lists WHERE repo = ? ORDER BY version DESC LIMIT 1").get(repo) as { version: number; areas: string; at: string; by: string | null; note: string | null } | undefined;
  return r ? { repo, version: r.version, areas: JSON.parse(r.areas) as Area[], at: r.at, by: r.by, note: r.note } : null;
}

export function listVersions(db: DatabaseSync, repo: string): Omit<AreaList, "repo">[] {
  return (db.prepare("SELECT version, areas, at, by, note FROM area_lists WHERE repo = ? ORDER BY version DESC").all(repo) as { version: number; areas: string; at: string; by: string | null; note: string | null }[])
    .map((r) => ({ version: r.version, areas: JSON.parse(r.areas) as Area[], at: r.at, by: r.by, note: r.note }));
}

/**
 * Saves `areas` as the repo's next version. `moved` says where items of a changed area go: a new name
 * (rename, merge) or null (removed: the item becomes unassigned and is asked again). Items whose area is
 * still in the list move to the new version; unassigned ones stay on the version they were asked against.
 */
function save(db: DatabaseSync, repo: string, areas: Area[], by: string | null, note: string, moved: Map<string, string | null>): number {
  if (areas.length > AREAS_MAX) throw new AreaError(`a list holds at most ${AREAS_MAX} areas`);
  db.exec("BEGIN IMMEDIATE");
  try {
    const version = (currentList(db, repo)?.version ?? 0) + 1;
    db.prepare("INSERT INTO area_lists (repo, version, areas, at, by, note) VALUES (?, ?, ?, ?, ?, ?)").run(repo, version, JSON.stringify(areas), now(), by, note);
    const move = db.prepare("UPDATE item_areas SET area = ? WHERE repo = ? AND area = ?");
    // An operator's choice of a removed area is dropped, so the item is asked again.
    const dropOperator = db.prepare("DELETE FROM item_areas WHERE repo = ? AND area = ? AND source = 'operator'");
    for (const [from, to] of moved) {
      if (to === null) dropOperator.run(repo, from);
      move.run(to, repo, from);
    }
    // A pass that was running during the edit may have written a name that is gone: unassign it. Rows with a name in the list move to the new version.
    const marks = areas.map(() => "?").join(",") || "NULL";
    const names = areas.map((a) => a.name);
    db.prepare(`UPDATE item_areas SET area = NULL WHERE repo = ? AND area IS NOT NULL AND area NOT IN (${marks})`).run(repo, ...names);
    db.prepare(`UPDATE item_areas SET list_version = ? WHERE repo = ? AND area IN (${marks})`).run(version, repo, ...names);
    db.exec("COMMIT");
    return version;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export type AreaEdit =
  | { op: "add"; name: string; description: string }
  | { op: "rename"; from: string; to: string }
  | { op: "merge"; from: string; into: string }
  | { op: "remove"; name: string }
  | { op: "describe"; name: string; description: string }
  /** The whole list, as when an operator accepts a proposal (possibly edited). */
  | { op: "replace"; areas: Area[] };

const find = (areas: Area[], name: string): number => {
  const i = areas.findIndex((a) => same(a.name, name));
  if (i < 0) throw new AreaError(`there is no area "${name}"`);
  return i;
};

function validName(areas: Area[], v: unknown, except?: string): string {
  const name = cleanName(v);
  if (!name) throw new AreaError("an area needs a name");
  if (same(name, NONE_OF_THESE)) throw new AreaError(`"${NONE_OF_THESE}" is not an area name`);
  if (areas.some((a) => same(a.name, name) && !(except && same(a.name, except)))) throw new AreaError(`there is already an area "${name}"`);
  return name;
}

function validDescription(v: unknown): string {
  const d = cleanDescription(v);
  if (!d) throw new AreaError("an area needs a one-line description");
  return d;
}

/** Applies one edit to the current list and saves the result as a new version. Returns the version. */
export function editAreas(db: DatabaseSync, repo: string, edit: AreaEdit, by: string | null): number {
  if (!db.prepare("SELECT 1 FROM tracked_repos WHERE name = ?").get(repo)) throw new AreaError(`${repo} is not tracked`);
  const areas = (currentList(db, repo)?.areas ?? []).map((a) => ({ ...a }));
  const moved = new Map<string, string | null>();
  let note: string;
  switch (edit.op) {
    case "add": {
      const name = validName(areas, edit.name);
      areas.push({ name, description: validDescription(edit.description) });
      note = `added ${name}`;
      break;
    }
    case "rename": {
      const i = find(areas, edit.from), old = areas[i]!.name;
      const name = validName(areas, edit.to, old);
      areas[i]!.name = name;
      if (name !== old) moved.set(old, name);
      note = `renamed ${old} to ${name}`;
      break;
    }
    case "merge": {
      const i = find(areas, edit.from), j = find(areas, edit.into);
      if (i === j) throw new AreaError("merge two different areas");
      moved.set(areas[i]!.name, areas[j]!.name);
      note = `merged ${areas[i]!.name} into ${areas[j]!.name}`;
      areas.splice(i, 1);
      break;
    }
    case "remove": {
      const i = find(areas, edit.name);
      moved.set(areas[i]!.name, null);
      note = `removed ${areas[i]!.name}`;
      areas.splice(i, 1);
      break;
    }
    case "describe": {
      const i = find(areas, edit.name);
      areas[i]!.description = validDescription(edit.description);
      note = `edited the description of ${areas[i]!.name}`;
      break;
    }
    case "replace": {
      const next: Area[] = [];
      for (const a of edit.areas) next.push({ name: validName(next, a.name), description: validDescription(a.description) });
      if (!next.length) throw new AreaError("a list needs at least one area");
      for (const a of areas) if (!next.some((n) => same(n.name, a.name))) moved.set(a.name, null);
      // A name kept with other capitalisation is the same area.
      for (const a of areas) { const n = next.find((x) => same(x.name, a.name)); if (n && n.name !== a.name) moved.set(a.name, n.name); }
      areas.splice(0, areas.length, ...next);
      note = "saved a new list";
      break;
    }
  }
  if (areas.length > AREAS_MAX) throw new AreaError(`a list holds at most ${AREAS_MAX} areas`);
  return save(db, repo, areas, by, note, moved);
}

export type ItemArea = { area: string | null; source: string; confidence: number | null; listVersion: number; at: string };

export function itemAreaOf(db: DatabaseSync, repo: string, number: number): ItemArea | null {
  const r = prep(db, "SELECT area, source, confidence, list_version, at FROM item_areas WHERE repo = ? AND number = ?").get(repo, number) as { area: string | null; source: string; confidence: number | null; list_version: number; at: string } | undefined;
  return r ? { area: r.area, source: r.source, confidence: r.confidence, listVersion: r.list_version, at: r.at } : null;
}

/** The item's area name, or null when it has none. */
export const areaNameOf = (db: DatabaseSync, repo: string, number: number): string | null => itemAreaOf(db, repo, number)?.area ?? null;

export function setItemArea(db: DatabaseSync, repo: string, number: number, area: string | null, source: "jev" | "haiku" | "operator", confidence: number | null, version: number): void {
  db.prepare(`INSERT INTO item_areas (repo, number, area, source, confidence, list_version, at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (repo, number) DO UPDATE SET area = excluded.area, source = excluded.source, confidence = excluded.confidence, list_version = excluded.list_version, at = excluded.at`)
    .run(repo, number, area, source, confidence, version, now());
}

/** Open items of the repo without an area: never asked, asked and answered "none of these", or unassigned by a removed area. */
export function unassignedCount(db: DatabaseSync, repo: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM items i LEFT JOIN item_areas a ON a.repo = i.repo AND a.number = i.number
    WHERE i.repo = ? AND i.state = 'OPEN' AND a.area IS NULL`).get(repo) as { n: number }).n;
}

export type AreaCount = { area: string; open: number };
export function areaCounts(db: DatabaseSync, repo: string): AreaCount[] {
  return db.prepare(`SELECT a.area AS area, COUNT(*) AS open FROM items i JOIN item_areas a ON a.repo = i.repo AND a.number = i.number
    WHERE i.repo = ? AND i.state = 'OPEN' AND a.area IS NOT NULL GROUP BY a.area ORDER BY open DESC, area`).all(repo) as AreaCount[];
}

export type ProposalArea = Area & { state: "open" | "accepted" | "ignored" };
export type Proposal = { id: number; repo: string; kind: "propose" | "suggest"; areas: ProposalArea[]; createdAt: string; createdBy: string | null; state: "open" | "accepted" | "dismissed"; decidedBy: string | null; decidedAt: string | null };
type ProposalRow = { id: number; repo: string; kind: string; areas: string; created_at: string; created_by: string | null; state: string; decided_by: string | null; decided_at: string | null };
const toProposal = (r: ProposalRow): Proposal => ({ id: r.id, repo: r.repo, kind: r.kind as Proposal["kind"], areas: JSON.parse(r.areas) as ProposalArea[], createdAt: r.created_at, createdBy: r.created_by, state: r.state as Proposal["state"], decidedBy: r.decided_by, decidedAt: r.decided_at });

/** Stores a model's proposal. An older open proposal of the same kind is dismissed: the new one replaces it. */
export function saveProposal(db: DatabaseSync, repo: string, kind: Proposal["kind"], areas: Area[], by: string | null): number {
  db.prepare("UPDATE area_proposals SET state = 'dismissed', decided_at = ? WHERE repo = ? AND kind = ? AND state = 'open'").run(now(), repo, kind);
  const r = db.prepare("INSERT INTO area_proposals (repo, kind, areas, created_at, created_by) VALUES (?, ?, ?, ?, ?)")
    .run(repo, kind, JSON.stringify(areas.map((a) => ({ ...a, state: "open" }))), now(), by);
  return Number(r.lastInsertRowid);
}

export function proposalsOf(db: DatabaseSync, repo: string, open = true): Proposal[] {
  return (db.prepare(`SELECT * FROM area_proposals WHERE repo = ? ${open ? "AND state = 'open'" : ""} ORDER BY id DESC LIMIT 20`).all(repo) as ProposalRow[]).map(toProposal);
}

export function proposalById(db: DatabaseSync, id: number): Proposal {
  const r = db.prepare("SELECT * FROM area_proposals WHERE id = ?").get(id) as ProposalRow | undefined;
  if (!r) throw new AreaError(`there is no proposal ${id}`);
  return toProposal(r);
}

const settle = (db: DatabaseSync, p: Proposal, areas: ProposalArea[], by: string | null): void => {
  const open = areas.some((a) => a.state === "open");
  const state = open ? "open" : areas.some((a) => a.state === "accepted") ? "accepted" : "dismissed";
  db.prepare("UPDATE area_proposals SET areas = ?, state = ?, decided_by = ?, decided_at = ? WHERE id = ?").run(JSON.stringify(areas), state, open ? null : by, open ? null : now(), p.id);
};

/** Accepts a whole-list proposal, as stored or with the operator's edits. Returns the new list version. */
export function acceptProposal(db: DatabaseSync, id: number, by: string | null, edited?: Area[]): number {
  const p = proposalById(db, id);
  if (p.kind !== "propose" || p.state !== "open") throw new AreaError("this proposal is not open");
  const version = editAreas(db, p.repo, { op: "replace", areas: edited ?? p.areas }, by);
  db.prepare("UPDATE area_proposals SET state = 'accepted', decided_by = ?, decided_at = ? WHERE id = ?").run(by, now(), id);
  return version;
}

export function dismissProposal(db: DatabaseSync, id: number, by: string | null): void {
  const p = proposalById(db, id);
  if (p.state !== "open") throw new AreaError("this proposal is not open");
  db.prepare("UPDATE area_proposals SET state = 'dismissed', decided_by = ?, decided_at = ? WHERE id = ?").run(by, now(), id);
}

/** Accepts the named areas of a suggestion (one new list version) and ignores `ignore`. Returns the version, or null when nothing was accepted. */
export function decideSuggestion(db: DatabaseSync, id: number, by: string | null, accept: string[], ignore: string[] = []): number | null {
  const p = proposalById(db, id);
  if (p.kind !== "suggest" || p.state !== "open") throw new AreaError("this suggestion is not open");
  const pick = (names: string[]) => names.map((n) => { const a = p.areas.find((x) => x.state === "open" && same(x.name, n)); if (!a) throw new AreaError(`"${n}" is not an open suggestion`); return a; });
  const take = pick(accept), skip = pick(ignore);
  let version: number | null = null;
  if (take.length) {
    const current = currentList(db, p.repo)?.areas ?? [];
    version = editAreas(db, p.repo, { op: "replace", areas: [...current, ...take.map(({ name, description }) => ({ name, description }))] }, by);
  }
  settle(db, p, p.areas.map((a) => (take.includes(a) ? { ...a, state: "accepted" as const } : skip.includes(a) ? { ...a, state: "ignored" as const } : a)), by);
  return version;
}
