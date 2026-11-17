// Similar items and semantic search over the item embeddings that
// `autocraft embed` writes. The vectors live in memory (src/embed/vectors.ts);
// the query text of a search, and an item that has no vector yet, are embedded
// here with the same model.
import type { DatabaseSync } from "node:sqlite";
import type { SimilarHit } from "../../../web/src/api/types.ts";
import type { Embedder } from "../../embed/model.ts";
import { itemText } from "../../embed/text.ts";
import { VectorIndex, type Hit } from "../../embed/vectors.ts";
import { Semaphore } from "../server/limits.ts";
import { HttpError } from "../server/util.ts";
import { latestRun, settledOf } from "../../classify/settled.ts";
import type { Req } from "../types.ts";
import { itemState } from "./decisions.ts";
import { needVisible, visibleRepos } from "./visible.ts";

const REASON: Record<string, SimilarHit["stateReason"]> = { COMPLETED: "completed", NOT_PLANNED: "not-planned", DUPLICATE: "duplicate" };

function limitOf(req: Req, def: number): number {
  const l = Number(req.query.get("limit") ?? def);
  return Number.isInteger(l) && l > 0 ? Math.min(l, 50) : def;
}

// Neighbours are looked up among every embedded item, then cut to the repos the
// requester may see; the lookup asks for extra so the cut rarely shortens the list.
const OVERFETCH = 4;

async function visibleHits(db: DatabaseSync, req: Req, index: VectorIndex, q: Float32Array, limit: number, skip?: string): Promise<Hit[]> {
  const visible = new Set(await visibleRepos(db, req));
  return index.nearest(db, q, Math.min(limit * OVERFETCH, 200), skip).filter((h) => visible.has(h.repo)).slice(0, limit);
}

function describe(db: DatabaseSync, hits: Hit[]): SimilarHit[] {
  const row = db.prepare("SELECT kind, title, author, state, state_reason FROM items WHERE repo = ? AND number = ?");
  const run = latestRun(db);
  const out: SimilarHit[] = [];
  for (const h of hits) {
    const r = row.get(h.repo, h.number) as { kind: string; title: string | null; author: string | null; state: string; state_reason: string | null } | undefined;
    if (!r) continue;
    const l = settledOf(db, h.repo, h.number, run);
    out.push({
      repo: h.repo, number: h.number, kind: r.kind === "pr" ? "pr" : "issue", title: r.title ?? "", author: r.author ?? "",
      state: itemState(r.state), score: Math.round(h.score * 1000) / 1000,
      stateReason: REASON[r.state_reason ?? ""] ?? null, label: l.label, labelBy: l.source,
    });
  }
  return out;
}

// At most two embeddings run at once per index; a request waits a few seconds
// for a turn, then gets 429.
export const EMBED_CONCURRENCY = 2;
const gates = new WeakMap<VectorIndex, Semaphore>();
const gateOf = (index: VectorIndex) => {
  let g = gates.get(index);
  if (!g) gates.set(index, (g = new Semaphore(EMBED_CONCURRENCY, 3000)));
  return g;
};

async function embedOne(index: VectorIndex, text: string, role: "item" | "query", gate = gateOf(index)): Promise<Float32Array> {
  const release = await gate.acquire();
  if (!release) throw new HttpError(429, "Too many searches are running; try again in a moment.");
  try {
    return (await index.embedder.embed([text], role))[0]!;
  } catch (e) {
    console.error(`embedding model unavailable: ${(e as Error).message}`);
    throw new HttpError(503, "The embedding model is not available on the server.");
  } finally {
    release();
  }
}

async function needVectors(db: DatabaseSync, index: VectorIndex): Promise<void> {
  await index.ready(db);
  if (!index.size) throw new HttpError(503, "No item embeddings yet: run autocraft embed.");
}

export async function similar(db: DatabaseSync, req: Req, index: VectorIndex, gate?: Semaphore): Promise<SimilarHit[]> {
  const repo = req.params.repo!;
  const n = Number(req.params.n);
  if (!Number.isInteger(n)) throw new HttpError(400, "not an item number");
  await needVisible(db, req, repo);
  const it = db.prepare("SELECT title, body FROM items WHERE repo = ? AND number = ?").get(repo, n) as { title: string | null; body: string | null } | undefined;
  if (!it) throw new HttpError(404, `no item ${repo}#${n} in the mirror`);
  await needVectors(db, index);
  const q = index.vectorOf(db, repo, n) ?? await embedOne(index, itemText(it.title, it.body), "item", gate);
  return describe(db, await visibleHits(db, req, index, q, limitOf(req, 10), `${repo}#${n}`));
}

export async function semanticSearch(db: DatabaseSync, req: Req, index: VectorIndex, gate?: Semaphore): Promise<SimilarHit[]> {
  const q = (req.query.get("q") ?? "").trim().slice(0, 500);
  if (!q) return [];
  await needVectors(db, index);
  return describe(db, await visibleHits(db, req, index, await embedOne(index, q, "query", gate), limitOf(req, 20)));
}
