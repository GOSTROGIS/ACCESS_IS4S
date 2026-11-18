// What a pull request review post says about the review at a head. A carried review has no text of its own: the post uses the
// text, claims and model of the review the carry came from.
import type { DatabaseSync } from "node:sqlite";
import { CARRIED } from "./carry.ts";
import { parsePublic, storedClaims, type PublicReview } from "./opus-parse.ts";

type Row = { head_oid: string; at: string; model: string | null; mode: string | null; base_head: string | null; verdict: string; sure: number | null; public_review: string | null; claims: string | null; serving_metadata: string | null };
const COLS = "head_oid, at, model, mode, base_head, verdict, sure, public_review, claims, serving_metadata";
const MAX_STEPS = 20;

export type PostSource = {
  /** The verdict at the head (a carried review's is take). */
  verdict: string; sure: boolean;
  /** The verdict of the review the text comes from. */
  sourceVerdict: string;
  /** The parsed public text; null when the stored text does not parse. Empty text (no summary, no points) when the row has none. */
  public: PublicReview | null;
  hasPublic: boolean;
  claims: ReturnType<typeof storedClaims>;
  model: string | null;
  /** Attribution of the exact source review, including when its text is carried. */
  serving_metadata?: string;
  /** The head the text was written at. */
  reviewedAt: string;
  /** The head a carried review sits at (the fix-up's head); null when the review is not carried. */
  fixedIn: string | null;
  /** The `at` of the review at the head. */
  at: string;
};

const isCarried = (r: Pick<Row, "model" | "mode">) => r.model === CARRIED || r.mode === CARRIED;

const safeJson = (s: string): unknown => {
  try { return JSON.parse(s); } catch { return null; }
};

/** The review to post at `head`, or null when the head has none. */
export function postSource(db: DatabaseSync, repo: string, number: number, head: string): PostSource | null {
  const get = db.prepare(`SELECT ${COLS} FROM opus_reviews WHERE repo = ? AND number = ? AND head_oid = ? AND verdict IS NOT NULL ORDER BY at DESC, rowid DESC LIMIT 1`);
  const o = get.get(repo, number, head) as Row | undefined;
  if (!o) return null;
  let src = o;
  for (let i = 0; i < MAX_STEPS && isCarried(src) && src.base_head; i++) {
    const next = get.get(repo, number, src.base_head) as Row | undefined;
    if (!next) break;
    src = next;
  }
  const carried = src !== o && !isCarried(src);
  // A walk that ends on a carried row (chain over the cap, or a missing base row) has no model to name.
  const hasPublic = src.public_review !== null;
  return {
    verdict: o.verdict, sure: o.sure !== 0, sourceVerdict: src.verdict,
    public: hasPublic ? parsePublic(safeJson(src.public_review!)) : { summary: "", points: [] },
    hasPublic, claims: storedClaims(safeJson(src.claims ?? "[]")),
    model: isCarried(src) ? null : src.model, reviewedAt: carried ? src.head_oid : o.head_oid, fixedIn: carried ? o.head_oid : null, at: o.at,
    ...(src.serving_metadata !== null && { serving_metadata: src.serving_metadata }),
  };
}
