// Limits for expensive work: a token bucket per key (for GET endpoints that
// aggregate the mirror or run the embedder) and a counting semaphore with a
// bounded wait (for upstream image fetches and embeddings).
import { LIMITER_KEYS, trimKeys } from "./util.ts";

/** Refills `perSec` tokens a second up to `burst`; `take` spends one. */
export class TokenBucket {
  #buckets = new Map<string, { tokens: number; at: number }>();
  #burst: number;
  #perSec: number;
  #swept = 0;
  constructor(burst: number, perSec: number) {
    this.#burst = burst;
    this.#perSec = perSec;
  }
  /** Seconds to wait before a token is available, or 0 when one was taken. */
  take(key: string, now = Date.now()): number {
    if (this.#buckets.size >= LIMITER_KEYS && !this.#buckets.has(key)) {
      // A full bucket is the same as no entry; a walk at most once per refill time.
      this.#swept = trimKeys(this.#buckets, now, this.#swept, (this.#burst / this.#perSec) * 1000, (b) => b.tokens + ((now - b.at) / 1000) * this.#perSec >= this.#burst);
    }
    const b = this.#buckets.get(key) ?? { tokens: this.#burst, at: now };
    b.tokens = Math.min(this.#burst, b.tokens + ((now - b.at) / 1000) * this.#perSec);
    b.at = now;
    // Re-inserted, so the map stays in order of last use and the least recent go first.
    this.#buckets.delete(key);
    this.#buckets.set(key, b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    return Math.max(1, Math.ceil((1 - b.tokens) / this.#perSec));
  }
}

/** At most `max` holders at once; later callers wait up to `waitMs` in order. */
export class Semaphore {
  #free: number;
  #waiters: ((release: (() => void) | null) => void)[] = [];
  #waitMs: number;
  constructor(max: number, waitMs: number) {
    this.#free = max;
    this.#waitMs = waitMs;
  }
  /** A release function, or null when the wait ran out. */
  acquire(): Promise<(() => void) | null> {
    if (this.#free > 0) {
      this.#free--;
      return Promise.resolve(this.#releaser());
    }
    return new Promise((resolve) => {
      const waiter = (r: (() => void) | null) => {
        clearTimeout(timer);
        resolve(r);
      };
      const timer = setTimeout(() => {
        const i = this.#waiters.indexOf(waiter);
        if (i >= 0) this.#waiters.splice(i, 1);
        resolve(null);
      }, this.#waitMs);
      this.#waiters.push(waiter);
    });
  }
  #releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.#waiters.shift();
      if (next) next(this.#releaser());
      else this.#free++;
    };
  }
}
