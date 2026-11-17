// The PRs Verify plans: those whose Plan holds a `verify` action (a take at the current head, CI not failing, not verified yet).
import type { DatabaseSync } from "node:sqlite";
import { planned } from "../core/select.ts";
import type { ReviewInfo, VerifyCandidate } from "./candidates.ts";

const list = <T>(s: string | null): T[] => {
  try {
    const v = JSON.parse(s ?? "[]") as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch { return []; }
};

/** The PRs to plan and build, in selection order. */
export function selectCandidates(db: DatabaseSync, repo: string | undefined, run?: string | null): VerifyCandidate[] {
  return candidatesIn(db, "plan", repo, run).map((x) => x.c);
}

/** The PRs Verify cannot build (private repo, or no Cargo.toml at the root of a repo without CI), with why. */
export function unavailableCandidates(db: DatabaseSync, repo: string | undefined, run?: string | null): { c: VerifyCandidate; reason: string }[] {
  return candidatesIn(db, "unavailable", repo, run).map((x) => ({ c: x.c, reason: x.reason! }));
}

function candidatesIn(db: DatabaseSync, bucket: "plan" | "unavailable", repo: string | undefined, run: string | null | undefined): { c: VerifyCandidate; reason: string | null }[] {
  const review = db.prepare("SELECT verdict, reason, risks, fixes FROM final_reviews WHERE repo = ? AND number = ? AND head_oid = ?");
  const text = db.prepare("SELECT title, body FROM items WHERE repo = ? AND number = ?");
  return planned(db, "verify", { bucket, ...(repo ? { repo } : {}), ...(run !== undefined ? { run } : {}) }).map(({ facts: f, action }) => {
    const r = review.get(f.repo, f.number, action.head!) as { verdict: string; reason: string | null; risks: string | null; fixes: string | null } | undefined;
    const t = text.get(f.repo, f.number) as { title: string | null; body: string | null } | undefined;
    const info: ReviewInfo = { verdict: r?.verdict ?? "take", reason: r?.reason ?? "", risks: list<string>(r?.risks ?? null), fixes: list<{ file: string; change: string }>(r?.fixes ?? null) };
    return { c: { repo: f.repo, number: f.number, title: t?.title ?? "", body: t?.body ?? "", head_oid: action.head!, label: f.label, review: info }, reason: f.verifyUnavailable };
  });
}
