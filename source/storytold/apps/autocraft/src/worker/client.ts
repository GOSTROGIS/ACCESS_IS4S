// Client of the coordinator's worker API. The key goes only into the
// Authorization header; errors carry the path and status, never the key.
import type { SandboxInfo } from "./environment.ts";
import type { Capabilities, ClaimResponse, StepResult } from "./types.ts";

export class ApiError extends Error {
  status: number;
  retryAfterMs = 1000;
  constructor(status: number, path: string, detail: string) {
    super(`${path}: HTTP ${status}${detail ? ` ${detail}` : ""}`);
    this.status = status;
  }
}

export class WorkerApi {
  #base: string;
  #key: string;
  #fetch: typeof fetch;
  constructor(base: string, key: string, fetchImpl: typeof fetch = fetch) {
    this.#base = base.replace(/\/+$/, "");
    this.#key = key;
    this.#fetch = fetchImpl;
  }

  /** Runs a call that is worth repeating when the coordinator's rate limit answers 429: waits for retry-after (at most 5 s) and tries up to 4 times. */
  async #patient<T>(method: string, path: string, body?: Buffer | object): Promise<T> {
    for (let n = 1; ; n++) {
      try {
        return await this.#call<T>(method, path, body);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 429 || n >= 4) throw e;
        await new Promise((r) => setTimeout(r, e.retryAfterMs));
      }
    }
  }

  async #call<T>(method: string, path: string, body?: Buffer | object, contentType = "application/json"): Promise<T> {
    const raw = body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body);
    let res: Response;
    try {
      res = await this.#fetch(`${this.#base}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.#key}`, ...(raw === undefined ? {} : { "content-type": contentType }) },
        body: raw as BodyInit | undefined,
        signal: AbortSignal.timeout(60_000),
        // The key goes only to the configured coordinator, never to a host a redirect names.
        redirect: "error",
      });
    } catch (e) {
      throw new Error(`${path}: ${(e as Error).name}: ${(e as Error).message}`.replaceAll(this.#key, "***"));
    }
    const text = await res.text();
    if (!res.ok) {
      const err = new ApiError(res.status, path, text.slice(0, 200).replaceAll(this.#key, "***"));
      const header = res.headers.get("retry-after");
      const secs = header === null || header.trim() === "" ? 1 : Number(header);
      if (Number.isFinite(secs) && secs >= 0) err.retryAfterMs = Math.min(secs, 5) * 1000;
      throw err;
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  hello(version: string, capabilities: Capabilities, slots: number) {
    return this.#call<{ envId: string; label: string }>("POST", "/worker/hello", { version, capabilities, slots });
  }
  claim(free: number, pausedReason: string | null) {
    return this.#call<ClaimResponse>("POST", "/worker/claim", { free, pausedReason });
  }
  start(id: number) {
    return this.#patient<object>("POST", `/worker/tasks/${id}/start`, {});
  }
  log(id: number, step: string, chunk: string) {
    return this.#patient<object>("POST", `/worker/tasks/${id}/log`, { step, chunk });
  }
  heartbeat(id: number) {
    return this.#patient<{ cancel?: number[] }>("POST", `/worker/tasks/${id}/heartbeat`, {});
  }
  upload(id: number, name: string, body: Buffer, contentType: string) {
    return this.#call<object>("PUT", `/worker/tasks/${id}/artifacts/${encodeURIComponent(name)}`, body, contentType);
  }
  finish(id: number, results: StepResult[], summary: string, environment?: SandboxInfo) {
    return this.#patient<object>("POST", `/worker/tasks/${id}/finish`, { results, summary, ...(environment ? { environment } : {}) });
  }
}
