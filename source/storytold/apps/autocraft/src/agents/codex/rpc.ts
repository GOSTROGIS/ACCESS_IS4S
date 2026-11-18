import { Buffer } from 'node:buffer';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

type RpcId = string | number;
type JsonObject = Record<string, unknown>;
type Request = { id: RpcId; method: string; params: unknown };
export type RpcFailureCode = 'DEADLINE' | 'OUTPUT_LIMIT' | 'PROTOCOL' | 'PROCESS_EXIT' | 'CLOSED';
export class AppServerFailure extends Error {
  readonly code: RpcFailureCode;
  constructor(code: RpcFailureCode) {
    super('The Codex application server could not complete the operation.');
    this.name = 'AppServerFailure';
    this.code = code;
  }
}
export type ServerRequestHandler = (request: Request, signal: AbortSignal) => Promise<unknown>;
type Pending = { resolve(value: unknown): void; reject(error: AppServerFailure): void; timer: ReturnType<typeof setTimeout> };
type Options = {
  /** The caller owns containment. On Linux this must stop the whole sandbox process group. */
  stop(): Promise<void> | void;
  onNotification?(method: string, params: unknown): void;
  /** A production caller permits the external-token refresh method only; approval requests fail closed. */
  onServerRequest?: ServerRequestHandler;
  deadlineMs: number;
  maxLineBytes?: number;
  maxReceivedBytes?: number;
  maxStderrBytes?: number;
  serverRequestTimeoutMs?: number;
};
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
const has = (value: JsonObject, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const validId = (id: unknown): id is RpcId => typeof id === 'string' ? id.length > 0 && id.length <= 128 : Number.isSafeInteger(id);
const methodName = /^[A-Za-z][A-Za-z0-9/_-]{0,127}$/;

/** No protocol transcript, stderr text, credentials, or provider error strings leave this transport. */
export class AppServerRpc {
  readonly child: ChildProcessWithoutNullStreams;
  readonly options: Options;
  readonly ended: Promise<AppServerFailure>;
  private resolveEnded!: (failure: AppServerFailure) => void;
  private readonly pending = new Map<RpcId, Pending>();
  private readonly notifications = new Set<(method: string, params: unknown) => void>();
  private readonly clock: ReturnType<typeof setTimeout>;
  private chunk = Buffer.alloc(0);
  private received = 0;
  private stderrBytes = 0;
  private sequence = 0;
  private closed: AppServerFailure | null = null;
  private stopPromise: Promise<void> | null = null;
  private inFlightServerRequests = 0;
  private readonly serverRequestIds = new Set<RpcId>();
  private readonly serverRequests = new Map<RpcId, AbortController>();
  constructor(child: ChildProcessWithoutNullStreams, options: Options) {
    if (!Number.isSafeInteger(options.deadlineMs) || options.deadlineMs < 1) throw new Error('A finite Codex deadline is required.');
    for (const name of ['maxLineBytes', 'maxReceivedBytes', 'maxStderrBytes', 'serverRequestTimeoutMs'] as const) {
      const value = options[name];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error('Finite Codex transport limits are required.');
    }
    if ((options.serverRequestTimeoutMs ?? 8000) > 8000) throw new Error('Codex token refresh must finish within eight seconds.');
    this.child = child; this.options = options;
    this.ended = new Promise(resolve => { this.resolveEnded = resolve; });
    this.clock = setTimeout(() => this.fail('DEADLINE'), options.deadlineMs);
    child.stdout.on('data', (part: Buffer) => this.receive(Buffer.from(part)));
    child.stderr.on('data', (part: Buffer) => {
      this.stderrBytes += part.length;
      if (this.stderrBytes > (options.maxStderrBytes ?? 65536)) this.fail('OUTPUT_LIMIT');
    });
    child.stdin.on('error', () => this.fail('PROCESS_EXIT'));
    child.once('error', () => this.fail('PROCESS_EXIT'));
    child.once('close', () => this.fail('PROCESS_EXIT'));
  }
  private fail(code: RpcFailureCode): void {
    if (this.closed) return;
    this.closed = new AppServerFailure(code);
    this.resolveEnded(this.closed);
    clearTimeout(this.clock);
    this.chunk = Buffer.alloc(0);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer); pending.reject(this.closed);
    }
    this.pending.clear(); this.notifications.clear();
    for (const controller of this.serverRequests.values()) controller.abort();
    this.serverRequests.clear();
    // The channel is already closed; containment teardown runs once without exposing a child diagnostic.
    this.stopPromise = Promise.resolve().then(() => this.options.stop()).catch(() => {});
  }
  private send(value: unknown): void {
    if (this.closed) throw this.closed;
    const data = Buffer.from(JSON.stringify(value) + '\n', 'utf8');
    if (data.length > (this.options.maxLineBytes ?? 2 * 1024 * 1024)) {
      this.fail('OUTPUT_LIMIT'); throw this.closed;
    }
    this.child.stdin.write(data, error => { if (error) this.fail('PROCESS_EXIT'); });
  }
  request(method: string, params: unknown, timeoutMs = 30000): Promise<unknown> {
    if (!methodName.test(method) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Invalid Codex request.');
    if (this.closed) return Promise.reject(this.closed);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail('DEADLINE'), timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); }
      catch { this.fail('PROTOCOL'); }
    });
  }
  notify(method: string, params: unknown = {}): void {
    if (!methodName.test(method)) throw new Error('Invalid Codex notification.');
    this.send({ method, params });
  }
  /** Subscribe before starting a turn: real app-server notifications may precede its request response. */
  subscribe(listener: (method: string, params: unknown) => void): () => void {
    if (this.closed) throw this.closed;
    this.notifications.add(listener); return () => void this.notifications.delete(listener);
  }
  private receive(part: Buffer): void {
    if (this.closed) return;
    this.received += part.length;
    if (this.received > (this.options.maxReceivedBytes ?? 16 * 1024 * 1024)) return this.fail('OUTPUT_LIMIT');
    this.chunk = Buffer.concat([this.chunk, part]);
    let split: number;
    while (!this.closed && (split = this.chunk.indexOf(10)) !== -1) {
      const line = this.chunk.subarray(0, split);
      this.chunk = this.chunk.subarray(split + 1);
      if (line.length > (this.options.maxLineBytes ?? 2 * 1024 * 1024)) return this.fail('OUTPUT_LIMIT');
      if (!line.length) continue;
      let value: unknown;
      try {
        // TextDecoder's fatal mode rejects malformed UTF-8 instead of silently changing a credential/message.
        value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line));
      } catch { return this.fail('PROTOCOL'); }
      if (!object(value)) return this.fail('PROTOCOL');
      if (typeof value.method === 'string' && methodName.test(value.method)) {
        if (has(value, 'id')) {
          if (!validId(value.id) || this.serverRequestIds.has(value.id) || this.inFlightServerRequests >= 4) return this.fail('PROTOCOL');
          this.serverRequestIds.add(value.id); void this.serverRequest({ id: value.id, method: value.method, params: value.params });
        } else {
          try {
            this.options.onNotification?.(value.method, value.params);
            for (const listener of this.notifications) listener(value.method, value.params);
          } catch { return this.fail('PROTOCOL'); }
        }
      } else if (validId(value.id) && (has(value, 'result') !== has(value, 'error'))) {
        const pending = this.pending.get(value.id);
        if (!pending) continue;
        this.pending.delete(value.id); clearTimeout(pending.timer);
        if (has(value, 'error')) pending.reject(new AppServerFailure('PROTOCOL'));
        else pending.resolve(value.result);
      } else return this.fail('PROTOCOL');
    }
    if (this.chunk.length > (this.options.maxLineBytes ?? 2 * 1024 * 1024)) this.fail('OUTPUT_LIMIT');
  }
  private async serverRequest(request: Request): Promise<void> {
    this.inFlightServerRequests++;
    const controller = new AbortController(); this.serverRequests.set(request.id, controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      if (!this.options.onServerRequest) {
        this.send({ id: request.id, error: { code: -32601, message: 'This client does not permit this operation.' } });
        return;
      }
      const result = await Promise.race([
        this.options.onServerRequest(request, controller.signal),
        new Promise((_, reject) => {
          onAbort = () => reject(new AppServerFailure('DEADLINE'));
          controller.signal.addEventListener('abort', onAbort, { once: true });
          timer = setTimeout(() => controller.abort(), this.options.serverRequestTimeoutMs ?? 8000);
        }),
      ]);
      if (!this.closed) this.send({ id: request.id, result });
    } catch {
      if (!this.closed) this.send({ id: request.id, error: { code: -32000, message: 'The requested operation was refused.' } });
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      this.serverRequests.delete(request.id);
      this.inFlightServerRequests--; this.serverRequestIds.delete(request.id);
    }
  }
  async close(): Promise<void> {
    this.fail('CLOSED'); await this.stopPromise;
  }
}

export type CodexTokenUsage = { inputTokens: number; cachedInputTokens: number; cacheWriteInputTokens: number; outputTokens: number; reasoningOutputTokens: number };
/** Input counters include cached tokens; output includes reasoning. Cost is unknown when the provider omits it. */
export function normalizedUsage(usage: CodexTokenUsage): { input: number; output: number; cacheRead: number; cacheWrite: number; cost: null } {
  for (const name of ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'reasoningOutputTokens'] as const) {
    const value = usage[name];
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid Codex usage counter.');
  }
  if (usage.cachedInputTokens + usage.cacheWriteInputTokens > usage.inputTokens || usage.reasoningOutputTokens > usage.outputTokens) throw new Error('Inconsistent Codex usage counters.');
  return { input: usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteInputTokens, output: usage.outputTokens,
    cacheRead: usage.cachedInputTokens, cacheWrite: usage.cacheWriteInputTokens, cost: null };
}
