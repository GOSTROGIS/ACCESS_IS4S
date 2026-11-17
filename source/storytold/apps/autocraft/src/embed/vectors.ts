// The dashboard's in-memory copy of the item vectors, searched by brute force
// (dot products of unit vectors = cosine similarity).
//
// Memory: each vector is stored as int8 with its own scale (4x smaller than
// float32; the cosine error stays below 0.01), in one preallocated array that
// grows by copying only when full.
//
// Loading never blocks a request: it runs in chunks between event-loop turns.
// The first load is awaited by the request that needs it (`ready`); after that
// the index serves what it has while rows added past the last rowid seen are
// read in. A rewritten row gets a new rowid (INSERT OR REPLACE), so it is read
// again and overwrites its slot. Deleted rows and changed tracked repos need a
// rebuild, done on the side and swapped in when complete; a rebuild also runs
// every REBUILD_MS to drop vectors of deleted rows.
import type { DatabaseSync } from "node:sqlite";
import type { Embedder } from "./model.ts";

export type Hit = { repo: string; number: number; score: number };

// How often a request may check the table for changes.
const CHECK_MS = 5000;
const CHUNK = 1000;
const REBUILD_MS = 30 * 60_000;

type Store = {
  dim: number;
  q: Int8Array;
  scale: Float32Array;
  keys: { repo: string; number: number }[];
  at: Map<string, number>;
  lastRowid: number;
  tracked: string;
  builtAt: number;
};

const newStore = (dim: number, capacity: number, tracked: string): Store => ({
  dim, q: new Int8Array(capacity * dim), scale: new Float32Array(capacity), keys: [], at: new Map(),
  lastRowid: 0, tracked, builtAt: Date.now(),
});

function put(s: Store, repo: string, number: number, vec: Uint8Array): void {
  const dim = s.dim;
  if (vec.byteLength !== dim * 4) return;
  const ref = `${repo}#${number}`;
  let slot = s.at.get(ref);
  if (slot === undefined) {
    slot = s.keys.length;
    if ((slot + 1) * dim > s.q.length) {
      const cap = Math.ceil(Math.max(slot + 1, 1024) * 1.5);
      const q = new Int8Array(cap * dim);
      q.set(s.q);
      const scale = new Float32Array(cap);
      scale.set(s.scale);
      s.q = q;
      s.scale = scale;
    }
    s.keys.push({ repo, number });
    s.at.set(ref, slot);
  }
  const f = vec.byteOffset % 4 === 0 ? new Float32Array(vec.buffer, vec.byteOffset, dim) : new Float32Array(vec.buffer.slice(vec.byteOffset, vec.byteOffset + vec.byteLength));
  let max = 0;
  for (let d = 0; d < dim; d++) {
    const a = f[d]!;
    if (a > max) max = a;
    else if (-a > max) max = -a;
  }
  const sc = max > 0 ? max / 127 : 1;
  const inv = 1 / sc;
  const off = slot * dim;
  for (let d = 0; d < dim; d++) s.q[off + d] = Math.round(f[d]! * inv);
  s.scale[slot] = sc;
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

export class VectorIndex {
  private store: Store | null = null;
  private job: Promise<void> | null = null;
  private loading = false;
  private checked = 0;
  private tableRows = 0;

  readonly embedder: Embedder;

  constructor(embedder: Embedder) {
    this.embedder = embedder;
  }

  get size(): number {
    return this.store?.keys.length ?? 0;
  }

  /** Starts loading or catching up when the table changed (checked at most every CHECK_MS). Returns at once. */
  refresh(db: DatabaseSync): void {
    if (this.loading) return;
    const now = Date.now();
    if (this.store && now - this.checked < CHECK_MS) return;
    this.checked = now;
    const s = db.prepare(`SELECT (SELECT COUNT(*) FROM main.item_embeddings) AS n, (SELECT MAX(rowid) FROM main.item_embeddings) AS m,
      (SELECT group_concat(name) FROM main.tracked_repos) AS t`).get() as { n: number; m: number | null; t: string | null };
    const tracked = s.t ?? "";
    const cur = this.store;
    const rebuild = !cur || cur.tracked !== tracked || s.n < this.tableRows || now - cur.builtAt > REBUILD_MS;
    if (!rebuild && (s.m ?? 0) <= cur.lastRowid) {
      this.tableRows = s.n;
      return;
    }
    this.loading = true;
    this.job = this.load(db, rebuild ? null : cur, tracked, s.n).catch((e) => {
      console.error(`vector index: ${(e as Error).message}`);
    });
  }

  /** Resolves once the first load finished (at once when the index has vectors). */
  async ready(db: DatabaseSync): Promise<void> {
    this.refresh(db);
    if (!this.size && this.loading) await this.job;
  }

  private async load(db: DatabaseSync, into: Store | null, tracked: string, tableRows: number): Promise<void> {
    // A full rebuild fills a new store, swapped in at the end; an incremental load writes into the live one.
    const s = into ?? newStore(this.embedder.dim, Math.max(1024, Math.ceil(tableRows * 1.2)), tracked);
    const next = db.prepare(`SELECT rowid AS rid, repo, number, vec FROM main.item_embeddings
      WHERE rowid > ? AND model = ? AND repo IN (SELECT name FROM main.tracked_repos) ORDER BY rowid LIMIT ?`);
    try {
      for (;;) {
        const rows = next.all(s.lastRowid, this.embedder.id, CHUNK) as { rid: number; repo: string; number: number; vec: Uint8Array }[];
        for (const r of rows) put(s, r.repo, r.number, r.vec);
        if (rows.length) s.lastRowid = rows[rows.length - 1]!.rid;
        if (rows.length < CHUNK) break;
        await tick();
      }
      if (!into) s.builtAt = Date.now();
      this.tableRows = tableRows;
      this.store = s;
    } finally {
      this.loading = false;
    }
  }

  vectorOf(db: DatabaseSync, repo: string, number: number): Float32Array | undefined {
    this.refresh(db);
    const s = this.store;
    const i = s?.at.get(`${repo}#${number}`);
    if (!s || i === undefined) return undefined;
    const out = new Float32Array(s.dim);
    for (let d = 0; d < s.dim; d++) out[d] = s.q[i * s.dim + d]! * s.scale[i]!;
    return out;
  }

  // The `limit` items closest to `q`, best first, leaving out `skip` ("repo#n"); with `repo`, only items of that repo.
  nearest(db: DatabaseSync, q: Float32Array, limit: number, skip?: string, repo?: string): Hit[] {
    this.refresh(db);
    const s = this.store;
    if (!s) return [];
    const dim = s.dim;
    const v = s.q;
    const skipAt = skip === undefined ? -1 : (s.at.get(skip) ?? -1);
    const n = s.keys.length;
    // Top `limit` as parallel arrays kept sorted best first.
    const topI: number[] = [];
    const topS: number[] = [];
    let floor = -Infinity;
    for (let i = 0, off = 0; i < n; i++, off += dim) {
      if (i === skipAt || (repo !== undefined && s.keys[i]!.repo !== repo)) continue;
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += v[off + d]! * q[d]!;
      const sc = dot * s.scale[i]!;
      if (topI.length >= limit && sc <= floor) continue;
      let j = topI.length;
      while (j > 0 && topS[j - 1]! < sc) j--;
      topI.splice(j, 0, i);
      topS.splice(j, 0, sc);
      if (topI.length > limit) {
        topI.pop();
        topS.pop();
      }
      if (topI.length >= limit) floor = topS[topS.length - 1]!;
    }
    return topI.map((i, k) => ({ ...s.keys[i]!, score: topS[k]! }));
  }
}
