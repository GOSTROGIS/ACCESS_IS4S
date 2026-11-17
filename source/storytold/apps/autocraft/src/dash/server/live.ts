// Server-sent events for GET /api/live. One watcher reads the `change_seq` markers
// (src/live.ts) and tells every connected browser which topics changed. The stream
// carries topic names and counters only, never data: browsers refetch through the API.
import type { ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { readSeqs } from "../../live.ts";

export type LiveOptions = {
  pollMs?: number;       // how often the markers are read
  heartbeatMs?: number;  // idle streams are dropped by proxies after 100 s
  maxClients?: number;
  maxPerSession?: number;  // the oldest stream of a session is closed when it opens more
  stallMs?: number;        // a client whose socket stays backed up this long is dropped
};

type Client = { res: ServerResponse; alive: () => boolean; session: string; stalled?: NodeJS.Timeout };

export class LiveHub {
  private clients = new Set<Client>();
  private last: Record<string, number> = {};
  private timer?: NodeJS.Timeout;
  private beat?: NodeJS.Timeout;
  private readonly pollMs: number;
  private readonly heartbeatMs: number;
  private readonly maxClients: number;
  private readonly maxPerSession: number;
  private readonly stallMs: number;

  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync, o: LiveOptions = {}) {
    this.db = db;
    this.pollMs = o.pollMs ?? 500;
    this.heartbeatMs = o.heartbeatMs ?? 25_000;
    this.maxClients = o.maxClients ?? 200;
    this.maxPerSession = o.maxPerSession ?? 32;
    this.stallMs = o.stallMs ?? 5000;
  }

  get size(): number {
    return this.clients.size;
  }

  get full(): boolean {
    return this.clients.size >= this.maxClients;
  }

  /** Takes over `res` (headers already written). `alive` tells whether the session still exists. */
  add(res: ServerResponse, alive: () => boolean, session = ""): void {
    const c: Client = { res, alive, session };
    const mine = [...this.clients].filter((x) => x.session === session);
    for (const old of mine.slice(0, Math.max(0, mine.length + 1 - this.maxPerSession))) {
      old.res.end();
      this.remove(old);
    }
    this.clients.add(c);
    if (this.clients.size === 1) this.start();
    const seqs = this.read();
    res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ seqs })}\n\n`);
    res.on("close", () => this.remove(c));
  }

  /** Checks the markers now, for the answer to a write the dashboard just handled. */
  poke(): void {
    if (this.clients.size) this.check();
  }

  close(): void {
    for (const c of this.clients) c.res.end();
    this.clients.clear();
    this.stop();
  }

  private read(): Record<string, number> {
    this.last = readSeqs(this.db);
    return this.last;
  }

  private remove(c: Client): void {
    clearTimeout(c.stalled);
    this.clients.delete(c);
    if (!this.clients.size) this.stop();
  }

  private start(): void {
    this.last = readSeqs(this.db);
    this.timer = setInterval(() => this.check(), this.pollMs);
    this.beat = setInterval(() => this.heartbeat(), this.heartbeatMs);
    this.timer.unref();
    this.beat.unref();
  }

  private stop(): void {
    clearInterval(this.timer);
    clearInterval(this.beat);
    this.timer = this.beat = undefined;
  }

  private check(): void {
    let now: Record<string, number>;
    try {
      now = readSeqs(this.db);
    } catch (e) {
      console.error(`live: ${(e as Error).message}`);
      return;
    }
    const topics = Object.keys(now).filter((t) => now[t] !== this.last[t]);
    this.last = now;
    if (!topics.length) return;
    const seqs: Record<string, number> = {};
    for (const t of topics) seqs[t] = now[t]!;
    this.send(`event: change\ndata: ${JSON.stringify({ topics, seqs })}\n\n`);
  }

  private heartbeat(): void {
    for (const c of this.clients) if (!c.alive()) { c.res.end(); this.remove(c); }
    this.send(": hb\n\n");
  }

  private send(frame: string): void {
    for (const c of this.clients) {
      if (c.res.write(frame) || c.stalled) continue;
      // Backed up: wait for 'drain', and drop the client when it does not come.
      const drop = () => { c.res.destroy(); this.remove(c); };
      c.stalled = setTimeout(drop, this.stallMs);
      c.stalled.unref();
      c.res.once("drain", () => { clearTimeout(c.stalled); c.stalled = undefined; });
    }
  }
}
