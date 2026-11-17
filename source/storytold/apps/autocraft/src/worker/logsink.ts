import { LIMITS } from "./types.ts";

/** Batches step output into chunks of at most 64 KB (UTF-8 bytes) per request. Stops sending past the per-task cap. */
export class LogSink {
  #pending: { step: string; buf: Buffer }[] = [];
  #chain: Promise<void> = Promise.resolve();
  #sent = 0;
  #timer: NodeJS.Timeout;
  #send: (step: string, chunk: string) => Promise<void>;
  constructor(send: (step: string, chunk: string) => Promise<void>, flushMs = 1000) {
    this.#send = send;
    this.#timer = setInterval(() => this.flush(), flushMs);
    this.#timer.unref();
  }

  write(step: string, text: string): Promise<void> {
    const last = this.#pending.at(-1);
    const buf = Buffer.from(text, "utf8");
    if (last && last.step === step) last.buf = Buffer.concat([last.buf, buf]);
    else this.#pending.push({ step, buf });
    if (this.#pending.reduce((n, p) => n + p.buf.length, 0) >= LIMITS.logChunkBytes) this.flush();
    return Promise.resolve();
  }

  flush(): Promise<void> {
    const items = this.#pending;
    this.#pending = [];
    for (const { step, buf } of items) {
      let rest = buf;
      while (rest.length) {
        let n = Math.min(rest.length, LIMITS.logChunkBytes);
        if (n < rest.length) while (n > 0 && (rest[n]! & 0xc0) === 0x80) n--; // do not split a character
        if (n === 0) n = Math.min(rest.length, LIMITS.logChunkBytes);
        const piece = rest.subarray(0, n);
        rest = rest.subarray(n);
        if (this.#sent >= LIMITS.logTotalBytes) continue;
        this.#sent += piece.length;
        let chunk = piece.toString("utf8");
        // Invalid bytes decode to 3-byte replacement characters; keep the request within the cap.
        if (Buffer.byteLength(chunk) > LIMITS.logChunkBytes) chunk = chunk.slice(0, Math.floor(LIMITS.logChunkBytes / 3));
        this.#chain = this.#chain.then(() => this.#send(step, chunk)).catch(() => {});
      }
    }
    return this.#chain;
  }

  async close(): Promise<void> {
    clearInterval(this.#timer);
    await this.flush();
  }
}
