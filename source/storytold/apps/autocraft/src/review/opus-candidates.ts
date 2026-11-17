// Which PRs the Opus review looks at: the PRs whose Plan holds a `review` action (no Opus verdict at
// the current head commit, or one older than a comment or review by someone else).
import type { DatabaseSync } from "node:sqlite";
import { planned } from "../core/select.ts";
import type { PrFacts } from "../core/plan.ts";
import { type Size } from "./candidates.ts";

export type OpusCandidate = {
  repo: string; number: number; title: string; body: string; author_association: string | null;
  head_oid: string; lines_changed: number; size: Size; score: number | null;
};

/** The candidate of a PR at `head`: its text and author association from the items row, size and score from its facts. */
export function opusCandidateOf(db: DatabaseSync, f: Pick<PrFacts, "repo" | "number" | "lines" | "size" | "score">, head: string, fallbackTitle = ""): OpusCandidate {
  const it = db.prepare("SELECT title, body, author_association FROM items WHERE repo = ? AND number = ?").get(f.repo, f.number) as
    { title: string | null; body: string | null; author_association: string | null } | undefined;
  return { repo: f.repo, number: f.number, title: it?.title ?? fallbackTitle, body: it?.body ?? "", author_association: it?.author_association ?? null, head_oid: head, lines_changed: f.lines, size: f.size, score: f.score };
}

/** PRs of `repo` still to review, highest work score first. */
export function selectOpusCandidates(db: DatabaseSync, repo: string, run?: string | null): OpusCandidate[] {
  return planned(db, "review", { repo, ...(run !== undefined ? { run } : {}) }).map((p) => opusCandidateOf(db, p.facts, p.action.head!));
}
