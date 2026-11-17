// Similar items and semantic search for the mockup: word overlap between titles
// stands in for embedding similarity.
import type { SimilarHit } from "../types";
import { SEARCH_POOL, itemFor } from "./fixtures";

const LABELS = ["bugfix", "missing feature", "small extra", "plugin candidate", "performance"];
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{3,}/g) ?? []);

function rank(text: string, limit: number, skip?: string): SimilarHit[] {
  const q = words(text);
  const seen = new Set<string>();
  return SEARCH_POOL.filter((h) => {
    const key = `${h.repo}#${h.number}`;
    if (key === skip || seen.has(key)) return false;
    seen.add(key);
    return true;
  })
    .map((h) => {
      const w = words(h.title);
      const shared = [...w].filter((x) => q.has(x)).length;
      const score = 0.45 + 0.5 * (shared / Math.max(1, Math.min(q.size, w.size))) + (h.number % 7) / 200;
      const closed = h.number % 5 === 0;
      const hit: SimilarHit = {
        ...h,
        state: closed && h.kind === "issue" ? "closed" : h.state,
        score: Math.round(Math.min(score, 0.98) * 1000) / 1000,
        stateReason: closed && h.kind === "issue" ? (h.number % 2 ? "duplicate" : "completed") : null,
        label: h.number % 3 ? LABELS[h.number % LABELS.length] : null,
        labelBy: h.number % 3 ? "jev" : null,
      };
      return hit;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export const similarFor = (repo: string, n: number, limit = 10) => rank(itemFor(repo, n).title, limit, `${repo}#${n}`);
export const semanticHits = (q: string) => (q.trim() ? rank(q, 20) : []);
