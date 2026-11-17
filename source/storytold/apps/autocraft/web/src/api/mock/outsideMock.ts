// Outside-author protections on fake data: the three numbers, the tripped surge breaker and the items held for two authors.
import type { NeedsOutsideList, NeedsOutsideRow, OutsideState } from "../types";
import { NOW } from "./fixtures";

const at = (min: number) => new Date(NOW - min * 60_000).toISOString();

const TITLES = ["Add dark theme toggle", "Fix typo in README", "Update dependencies", "Rewrite the export module", "Add telemetry opt-out", "Improve startup time", "Support left-to-right marks"];

const held: NeedsOutsideRow[] = [
  ...TITLES.map((title, k): NeedsOutsideRow => ({ id: `outside:craft-libs#${512 + k}`, repo: "craft-libs", number: 512 + k, title, kind: "pr", reason: "limit", createdAt: at(300 - k * 20) })),
  { id: "outside:photocraft#4101", repo: "photocraft", number: 4101, title: "Crash on open", kind: "issue", reason: "surge", createdAt: at(25) },
  { id: "outside:photocraft#4102", repo: "photocraft", number: 4102, title: "Please add a dark mode", kind: "issue", reason: "surge", createdAt: at(22) },
];
const author = (r: NeedsOutsideRow): string => (r.kind === "pr" ? "wren-lat" : "kestrel-dev");

export const outside: OutsideState = {
  prsPerDay: 5, issuesPerDay: 5, surgePerHour: 30, heldByLimit: 7, heldBySurge: 2, authors: 2,
  tripped: { reason: "41 new items from outside authors in the last hour (more than 30)", since: at(18) },
};

const recount = (): void => {
  outside.heldByLimit = held.filter((r) => r.reason === "limit").length;
  outside.heldBySurge = held.filter((r) => r.reason === "surge").length;
  outside.authors = new Set(held.map(author)).size;
};

export function outsideGroups() {
  const by = new Map<string, NeedsOutsideRow[]>();
  for (const r of held) (by.get(author(r)) ?? by.set(author(r), []).get(author(r))!).push(r);
  return [...by].map(([a, rows]) => {
    const prs = rows.filter((r) => r.kind === "pr").length;
    const parts = [prs && `${prs} PR${prs === 1 ? "" : "s"}`, rows.length - prs && `${rows.length - prs} issue${rows.length - prs === 1 ? "" : "s"}`].filter(Boolean).join(", ");
    return { id: `outside:${a}`, kind: "outside-group" as const, title: a, reason: `${parts} waiting for ${rows.some((r) => r.reason === "surge") ? "the outside-surge breaker or " : ""}the author's daily limit`, since: rows[0]!.createdAt, count: rows.length, resume: { type: "outside" as const, author: a } };
  });
}

export const outsideList = (a: string): NeedsOutsideList => ({ rows: held.filter((r) => author(r) === a) });

export function releaseHeld(repo: string, number: number): void {
  const k = held.findIndex((r) => r.repo === repo && r.number === number);
  if (k >= 0) held.splice(k, 1);
  recount();
}

export function releaseAuthorHeld(a: string): void {
  for (let k = held.length - 1; k >= 0; k--) if (author(held[k]!) === a) held.splice(k, 1);
  recount();
}

export function resumeSurge(): void {
  outside.tripped = null;
  for (let k = held.length - 1; k >= 0; k--) if (held[k]!.reason === "surge") held.splice(k, 1);
  recount();
}
