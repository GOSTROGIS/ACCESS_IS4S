import { createHash } from 'node:crypto';
import { AppServerFailure } from './rpc.ts';

export type AccessLease = { accessToken: string; chatgptAccountId: string; expiresAt: number; chatgptPlanType?: string };
export type LeaseProvider = (previousAccountId: string | null, signal: AbortSignal) => Promise<AccessLease>;
type ExternalTokenFields = { accessToken: string; chatgptAccountId: string; chatgptPlanType?: string };
type RefreshRequest = { method: string; params: unknown };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const refused = () => new AppServerFailure('PROTOCOL');

/** The host authenticates the lease; these checks bind its fields and JWT claims to the private configured account. */
export class ExternalTokenAuth {
  private readonly expectedAccountSha256: string;
  private readonly getLease: LeaseProvider;
  private readonly now: () => number;
  private readonly minimumRemainingMs: number;
  private account: string | null = null;
  private refreshInFlight = false;
  constructor(getLease: LeaseProvider, options: { expectedAccountSha256: string; minimumRemainingMs?: number; now?: () => number }) {
    if (!/^[a-f0-9]{64}$/.test(options.expectedAccountSha256) ||
        (options.minimumRemainingMs !== undefined && (!Number.isSafeInteger(options.minimumRemainingMs) || options.minimumRemainingMs < 1))) {
      throw new Error('The configured Codex account pin or lease bound is invalid.');
    }
    this.expectedAccountSha256 = options.expectedAccountSha256;
    this.minimumRemainingMs = options.minimumRemainingMs ?? 30000;
    this.getLease = getLease; this.now = options.now ?? Date.now;
  }
  private async lease(previousAccountId: string | null, signal: AbortSignal): Promise<ExternalTokenFields> {
    if (signal.aborted || (previousAccountId !== null && previousAccountId !== this.account)) throw refused();
    let value: AccessLease;
    try { value = await this.getLease(this.account, signal); } catch { throw refused(); }
    if (signal.aborted || !object(value) || typeof value.accessToken !== 'string' ||
        value.accessToken.length < 20 || value.accessToken.length > 16384 || !/^[\x21-\x7e]+$/.test(value.accessToken) ||
        typeof value.chatgptAccountId !== 'string' || !value.chatgptAccountId || value.chatgptAccountId.length > 256 || /[\x00-\x1f\x7f]/.test(value.chatgptAccountId) ||
        !Number.isSafeInteger(value.expiresAt) || value.expiresAt < this.now() + this.minimumRemainingMs ||
        (value.chatgptPlanType !== undefined && (typeof value.chatgptPlanType !== 'string' || value.chatgptPlanType.length > 64 || /[\x00-\x1f\x7f]/.test(value.chatgptPlanType)))) throw refused();
    const accountSha = createHash('sha256').update(value.chatgptAccountId).digest('hex');
    if (accountSha !== this.expectedAccountSha256 || (this.account !== null && this.account !== value.chatgptAccountId)) throw refused();
    // This is consistency checking, not local JWT signature verification. The genuine Codex backend authenticates the token.
    try {
      const parts = value.accessToken.split('.');
      if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw refused();
      const claims: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(parts[1]!, 'base64url')));
      if (!object(claims) || !object(claims['https://api.openai.com/auth']) ||
          claims['https://api.openai.com/auth'].chatgpt_account_id !== value.chatgptAccountId ||
          typeof claims.exp !== 'number' || claims.exp * 1000 !== value.expiresAt) throw refused();
    } catch { throw refused(); }
    this.account = value.chatgptAccountId;
    return { accessToken: value.accessToken, chatgptAccountId: value.chatgptAccountId,
      ...(value.chatgptPlanType === undefined ? {} : { chatgptPlanType: value.chatgptPlanType }) };
  }
  async login(signal: AbortSignal): Promise<ExternalTokenFields & { type: 'chatgptAuthTokens' }> {
    const fields = await this.lease(this.account, signal);
    return { type: 'chatgptAuthTokens', ...fields };
  }
  /** Exact generated v0.167 refresh contract; all approval/input/unknown methods fail closed. */
  async serverRequest(request: RefreshRequest, signal: AbortSignal): Promise<ExternalTokenFields> {
    if (request.method !== 'account/chatgptAuthTokens/refresh' || !this.account || !object(request.params) ||
        (request.params.previousAccountId !== undefined && request.params.previousAccountId !== null && request.params.previousAccountId !== this.account) ||
        this.refreshInFlight) throw refused();
    this.refreshInFlight = true;
    try { return await this.lease(this.account, signal); }
    finally { this.refreshInFlight = false; }
  }
}
