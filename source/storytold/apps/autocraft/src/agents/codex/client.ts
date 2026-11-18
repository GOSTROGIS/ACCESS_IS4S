import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { AppServerFailure, AppServerRpc, normalizedUsage, type CodexTokenUsage } from "./rpc.ts";
import { ExternalTokenAuth, type LeaseProvider } from "./external-auth.ts";
import { CODEX_TOOL_PATH, codexSandbox, type CodexSandboxSpec } from "./sandbox.ts";
import type { ModelPolicy } from "./config.ts";
import { CodexBudgetError } from "./budget.ts";
import type { ReportedServingMetadata } from "../provenance.ts";

export type ReportedUsage = CodexTokenUsage & { totalTokens: number };
export type CodexReply = {
  text: string; model: string; modelProvider: string; reasoningEffort: string | null; threadId: string; turnId: string;
  usage: ReportedUsage; responses: number; items: Record<string, unknown>[]; hasReportedUsage: boolean; primaryHasReportedUsage?: boolean;
  extra: { model: string; usage: ReportedUsage }[];
  /** Exact notification-time model and reported effort; null is genuinely unreported. */
  servedModels?: ReportedServingMetadata["models"];
};
export type CodexSessionState = { schema: 1; threads: { threadId: string; model: string; total: ReportedUsage }[] };
type Object = Record<string, unknown>;
const object = (x: unknown): x is Object => !!x && typeof x === "object" && !Array.isArray(x);
const effort = (value: unknown): string | null => typeof value === "string" && /^[a-zA-Z0-9._-]{1,100}$/.test(value) ? value : null;
const id = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(x);
function refuse(): never { throw new AppServerFailure("PROTOCOL"); }
const zero = (): ReportedUsage => ({ inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 });
const sum = (a: ReportedUsage, b: ReportedUsage): ReportedUsage => reportedUsage(Object.fromEntries(Object.keys(a).map(k => [k, a[k as keyof ReportedUsage] + b[k as keyof ReportedUsage]])));
export function reportedUsage(value: unknown): ReportedUsage {
  if (!object(value) || Object.keys(value).sort().join("|") !== Object.keys(zero()).sort().join("|") ||
      Object.keys(zero()).some(key => !Number.isSafeInteger(value[key]) || (value[key] as number) < 0)) refuse();
  const usage = value as ReportedUsage;
  normalizedUsage(usage);
  if (usage.totalTokens !== usage.inputTokens + usage.outputTokens) refuse();
  return { ...usage };
}
export function parseCodexSessionState(value: unknown): CodexSessionState {
  if (!object(value) || Object.keys(value).sort().join("|") !== "schema|threads" || value.schema !== 1 ||
      !Array.isArray(value.threads) || value.threads.length > 64) refuse();
  const seen = new Set<string>();
  return { schema: 1, threads: value.threads.map(entry => {
    if (!object(entry) || Object.keys(entry).sort().join("|") !== "model|threadId|total" || !id(entry.threadId) ||
        seen.has(entry.threadId) || typeof entry.model !== "string" || !/^[a-zA-Z0-9._:/-]{1,200}$/.test(entry.model)) refuse();
    seen.add(entry.threadId);
    return { threadId: entry.threadId, model: entry.model, total: reportedUsage(entry.total) };
  }) };
}

/** Actual official app-server, inside the original read-only application boundary. No lease socket is mounted. */
export class CodexClient {
  readonly rpc: AppServerRpc;
  readonly policy: ModelPolicy;
  private readonly auth: ExternalTokenAuth;
  private thread: { id: string; model: string; modelProvider: string; reasoningEffort: string } | null = null;
  private readonly stopPolling: ReturnType<typeof setInterval>;
  private readonly threadModels = new Map<string, string>();
  private readonly threadEfforts = new Map<string, string | null>();
  private readonly rerouted = new Map<string, { model: string; effort: string | null }>();
  private readonly cumulativeUsage = new Map<string, ReportedUsage>();
  private readonly snapshotGeneration = new Map<string, number>();
  private cumulativeMode = false;
  private readonly retiredTurns = new Set<string>();
  private observed: CodexReply | null = null;
  private consumedTokens = 0;
  private halted: unknown = null;
  private readonly active: () => void;
  private readonly progress: (item: Object, completed: boolean) => void;
  constructor(spec: CodexSandboxSpec, policy: ModelPolicy, lease: LeaseProvider, accountSha256: string,
    active: () => void, progress: (item: Object, completed: boolean) => void = () => {},
    createProcess: (command: ReturnType<typeof codexSandbox>) => ChildProcessWithoutNullStreams = command =>
      spawn(command.cmd, command.args, { stdio: "pipe", detached: true, env: command.env })) {
    this.policy = policy;
    this.active = active; this.progress = progress;
    const command = codexSandbox(spec);
    const child = createProcess(command);
    this.auth = new ExternalTokenAuth(lease, { expectedAccountSha256: accountSha256 });
    this.rpc = new AppServerRpc(child, { deadlineMs: policy.maxWallMs, stop: () => {
      clearInterval(this.stopPolling);
      // This process group was created for this one bubblewrap child. Its PID
      // namespace and die-with-parent terminate the provider's descendants.
      if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
    }, onServerRequest: (request, signal) => this.auth.serverRequest(request, signal) });
    this.stopPolling = setInterval(() => { try { this.active(); } catch (error) { this.halted = error; void this.rpc.close(); } }, 250);
    this.rpc.subscribe((method, params) => {
      if (!object(params)) return;
      if (method === "thread/started" && object(params.thread) && id(params.thread.id) && typeof params.thread.model === "string") {
        if (this.threadModels.get(params.thread.id) !== params.thread.model) this.threadEfforts.set(params.thread.id, null);
        this.threadModels.set(params.thread.id, params.thread.model);
      }
      if (method === "thread/settings/updated" && id(params.threadId) && object(params.threadSettings) && typeof params.threadSettings.model === "string") {
        this.threadModels.set(params.threadId, params.threadSettings.model);
        this.threadEfforts.set(params.threadId, effort(params.threadSettings.effort));
        for (const [key, value] of this.rerouted) if (key.startsWith(params.threadId + ":") && value.model === params.threadSettings.model) value.effort = effort(params.threadSettings.effort);
      }
      if (method === "model/rerouted" && id(params.threadId) && id(params.turnId) && typeof params.toModel === "string") {
        const key = `${params.threadId}:${params.turnId}`;
        if (!this.retiredTurns.has(key)) this.rerouted.set(key, { model: params.toModel, effort: null });
        while (this.rerouted.size > 4096) this.rerouted.delete(this.rerouted.keys().next().value!);
      }
      if ((method === "item/started" || method === "item/completed") && object(params.item) && params.item.type === "subAgentActivity" &&
          id(params.item.agentThreadId) && typeof params.item.model === "string") {
        this.threadModels.set(params.item.agentThreadId, params.item.model);
        this.threadEfforts.set(params.item.agentThreadId, effort(params.item.reasoningEffort));
        if (!this.cumulativeUsage.has(params.item.agentThreadId)) this.cumulativeUsage.set(params.item.agentThreadId, zero());
      }
      if (method === "thread/tokenUsage/updated" && id(params.threadId) && object(params.tokenUsage)) {
        this.cumulativeUsage.set(params.threadId, reportedUsage(params.tokenUsage.total));
        reportedUsage(params.tokenUsage.last);
        this.snapshotGeneration.set(params.threadId, (this.snapshotGeneration.get(params.threadId) ?? 0) + 1);
      }
    });
  }

  async initialize(): Promise<void> {
    this.active();
    await this.rpc.request("initialize", { clientInfo: { name: "autocraft", title: "Automation", version: "0.1.0" },
      capabilities: { experimentalApi: true, requestAttestation: false } });
    this.rpc.notify("initialized");
    const controller = new AbortController(), clock = setTimeout(() => controller.abort(), 8000);
    try {
      const login = await this.rpc.request("account/login/start", await this.auth.login(controller.signal), 8000);
      if (!object(login) || login.type !== "chatgptAuthTokens") refuse();
    }
    finally { clearTimeout(clock); controller.abort(); }
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const catalog = await this.rpc.request("model/list", { includeHidden: false, limit: 100, cursor });
      if (!object(catalog) || !Array.isArray(catalog.data)) refuse();
      const model = catalog.data.find(x => object(x) && (x.id === this.policy.model || x.model === this.policy.model));
      if (object(model)) {
        if (!Array.isArray(model.supportedReasoningEfforts) || !model.supportedReasoningEfforts.some(x => object(x) && x.reasoningEffort === this.policy.reasoningEffort)) refuse();
        return;
      }
      if (catalog.nextCursor === null) refuse();
      if (typeof catalog.nextCursor !== "string" || !catalog.nextCursor || catalog.nextCursor.length > 4096 || catalog.nextCursor === cursor) refuse();
      cursor = catalog.nextCursor;
    }
    refuse();
  }

  async open(instructions: string, config: Object, threadId?: string): Promise<string> {
    this.active();
    const params = { model: this.policy.model, cwd: "/work", approvalPolicy: "never", sandbox: "read-only", developerInstructions: instructions,
      config: { ...config, cli_auth_credentials_store: "ephemeral", model_reasoning_effort: this.policy.reasoningEffort,
        shell_environment_policy: { inherit: "none", set: { PATH: CODEX_TOOL_PATH, LANG: "C.UTF-8" } },
        features: { ...(object(config.features) ? config.features : {}),
          rollout_budget: { enabled: true, limit_tokens: this.policy.maxTokens, enforce_limit: true, prefill_token_weight: 1, sampling_token_weight: 1 } } } };
    const beforeSnapshot = threadId ? this.snapshotGeneration.get(threadId) ?? 0 : 0;
    if (threadId && !this.cumulativeUsage.has(threadId)) refuse();
    const result = threadId ? await this.rpc.request("thread/resume", { ...params, threadId, excludeTurns: true,
      initialTurnsPage: { limit: 1, sortDirection: "desc", itemsView: "summary" } }) :
      await this.rpc.request("thread/start", { ...params, ephemeral: false, historyMode: "paginated", experimentalRawEvents: true });
    if (!object(result) || !object(result.thread) || !id(result.thread.id) || typeof result.model !== "string" ||
        typeof result.modelProvider !== "string" || result.reasoningEffort !== this.policy.reasoningEffort || result.approvalPolicy !== "never" ||
        !object(result.sandbox) || result.sandbox.type !== "readOnly" || result.sandbox.networkAccess !== false || result.cwd !== "/work" ||
        result.thread.historyMode !== "paginated" || threadId && result.thread.id !== threadId) refuse();
    this.thread = { id: result.thread.id, model: result.model, modelProvider: result.modelProvider, reasoningEffort: result.reasoningEffort as string };
    this.threadModels.set(result.thread.id, result.model);
    this.threadEfforts.set(result.thread.id, effort(result.reasoningEffort));
    this.cumulativeMode = !!threadId;
    if (!threadId) this.cumulativeUsage.set(result.thread.id, zero());
    else {
      if (!object(result.initialTurnsPage) || !Array.isArray(result.initialTurnsPage.data)) refuse();
      // The official paginated resume sends its restored cumulative usage after
      // the response. Wait before starting new work, avoiding historical rebill.
      if (result.initialTurnsPage.data.length) {
        const until = Date.now() + 3000;
        while ((this.snapshotGeneration.get(threadId) ?? 0) <= beforeSnapshot) {
          if (Date.now() >= until) refuse();
          this.active(); await new Promise<void>(resolve => setTimeout(resolve, 10));
        }
      } else if (this.cumulativeUsage.get(threadId)!.totalTokens !== 0) refuse();
    }
    return result.thread.id;
  }

  restoreState(value: unknown): void {
    if (this.thread) refuse();
    for (const entry of parseCodexSessionState(value).threads) {
      this.threadModels.set(entry.threadId, entry.model); this.cumulativeUsage.set(entry.threadId, entry.total);
    }
  }
  sessionState(): CodexSessionState {
    return parseCodexSessionState({ schema: 1, threads: [...this.cumulativeUsage].map(([threadId, total]) =>
      ({ threadId, model: this.threadModels.get(threadId), total })) });
  }

  async turn(message: string, maximumResponses: number): Promise<CodexReply> {
    this.observed = null;
    this.active();
    const thread = this.thread;
    if (!thread || !Number.isSafeInteger(maximumResponses) || maximumResponses < 1) refuse();
    const items = new Map<string, Object>(), responses = new Set<string>();
    const byModel = new Map<string, ReportedUsage>();
    const served = new Map<string, Set<string | null>>(), allowedThreads = new Set([thread.id]);
    let parentModel = thread.model;
    const servedModels = (): ReportedServingMetadata["models"] => [...served].map(([model, efforts]) => ({ model, reasoningEfforts: [...efforts] }));
    const primaryEffort = (model: string): string | null => { const values = served.get(model); return values?.size === 1 ? [...values][0]! : null; };
    const baselines = new Map(this.cumulativeUsage), activeTurns = new Map<string, string>(), endedTurns = new Set<string>();
    let turnId: string | null = null, completed: Object | null = null, failure = false;
    let capped = false;
    let capMessage = "The Codex token budget was exhausted; partial work and its session are retained.";
    const snapshot = (): void => {
      const model = parentModel;
      this.observed = { text: "", model, modelProvider: thread!.modelProvider, reasoningEffort: primaryEffort(model), servedModels: servedModels(), threadId: thread!.id,
        turnId: turnId ?? "pending", usage: byModel.get(model) ?? zero(), responses: responses.size, items: [...items.values()], hasReportedUsage: byModel.size > 0, primaryHasReportedUsage: byModel.has(model),
        extra: [...byModel].filter(([name]) => name !== model).map(([name, usage]) => ({ model: name, usage })) };
    };
    let resolveDone: () => void;
    const done = new Promise<void>(resolve => { resolveDone = resolve; });
    let resolveTerminal: () => void;
    const terminal = new Promise<void>(resolve => { resolveTerminal = resolve; });
    const account = (model: string | undefined, reasoning: string | null, parent: boolean, key: string, usage: ReportedUsage | null): void => {
      if (responses.has(key)) return;
      responses.add(key);
      if (!usage || !model) {
        capMessage = "The provider did not report attributable usage; the call was stopped and its partial session retained.";
        failure = true; capped = true; resolveDone!();
      }
      else {
        byModel.set(model, sum(byModel.get(model) ?? zero(), usage));
        const efforts = served.get(model) ?? new Set<string | null>(); efforts.add(reasoning); served.set(model, efforts);
        if (parent) parentModel = model;
      }
      const total = [...byModel.values()].reduce((n, u) => n + u.totalTokens, 0);
      snapshot();
      if (responses.size > maximumResponses || this.consumedTokens + total > this.policy.maxTokens) {
        capMessage = responses.size > maximumResponses ? "The Codex model-response budget was exhausted; partial work and its session are retained." :
          "The Codex token budget was exhausted; partial work and its session are retained.";
        failure = true; capped = true; resolveDone!();
      }
    };
    type Event = { method: string; value: Object; model: string | undefined; reasoning: string | null; childBaseline?: ReportedUsage };
    const early: Event[] = [];
    let responseKnown = false;
    const finishIfReady = (): void => {
      if (completed && [...activeTurns].every(([threadId, active]) => endedTurns.has(`${threadId}:${active}`))) resolveDone!();
    };
    const receive = ({ method, value, model, reasoning, childBaseline }: Event): void => {
      if (!object(value)) return;
      if ((method === "item/started" || method === "item/completed") && object(value.item) && value.item.type === "subAgentActivity" &&
          value.threadId === thread!.id && value.turnId === turnId && id(value.item.agentThreadId) &&
          !allowedThreads.has(value.item.agentThreadId) && childBaseline) {
        baselines.set(value.item.agentThreadId, childBaseline); allowedThreads.add(value.item.agentThreadId);
      }
      if (!id(value.threadId) || !allowedThreads.has(value.threadId) || !baselines.has(value.threadId)) return;
      if (method === "model/rerouted" && value.turnId === activeTurns.get(value.threadId) && typeof value.toModel === "string") {
        this.threadModels.set(value.threadId, value.toModel); this.threadEfforts.set(value.threadId, null);
      }
      if (method === "turn/started" && object(value.turn) && id(value.turn.id)) {
        const key = `${value.threadId}:${value.turn.id}`, previous = activeTurns.get(value.threadId);
        if (this.retiredTurns.has(key) || value.threadId === thread!.id && value.turn.id !== turnId) return;
        if (previous && previous !== value.turn.id && !endedTurns.has(`${value.threadId}:${previous}`)) refuse();
        activeTurns.set(value.threadId, value.turn.id);
      }
      if (method === "rawResponse/completed" && !this.cumulativeMode && id(value.responseId) && value.turnId === activeTurns.get(value.threadId)) {
        account(model, reasoning, value.threadId === thread!.id, value.responseId, value.usage === null ? null : reportedUsage(value.usage));
      }
      if (method === "thread/tokenUsage/updated" && this.cumulativeMode && object(value.tokenUsage) && value.turnId === activeTurns.get(value.threadId)) {
        const total = reportedUsage(value.tokenUsage.total), previous = baselines.get(value.threadId)!;
        const delta = Object.fromEntries(Object.keys(total).map(key => [key, total[key as keyof ReportedUsage] - previous[key as keyof ReportedUsage]]));
        const usage = reportedUsage(delta);
        baselines.set(value.threadId, total);
        if (usage.totalTokens > 0) account(model, reasoning, value.threadId === thread!.id, `${value.threadId}:${JSON.stringify(total)}`, usage);
      }
      if ((method === "item/started" || method === "item/completed") && value.turnId === activeTurns.get(value.threadId) && object(value.item) && id(value.item.id)) {
        items.set(`${value.threadId}:${value.item.id}`, value.item); snapshot(); this.progress(value.item, method === "item/completed");
      }
      if (method === "turn/completed" && object(value.turn) && id(value.turn.id) && value.turn.id === activeTurns.get(value.threadId)) {
        endedTurns.add(`${value.threadId}:${value.turn.id}`);
        if (value.threadId === thread!.id && value.turn.id === turnId) { completed = value.turn; resolveTerminal!(); }
        finishIfReady();
      }
    };
    const off = this.rpc.subscribe((method, value) => {
      if (!object(value)) return;
      const route = this.rerouted.get(`${value.threadId}:${value.turnId}`);
      const event = { method, value, model: route?.model ?? this.threadModels.get(String(value.threadId)),
        reasoning: route ? route.effort : this.threadEfforts.get(String(value.threadId)) ?? null,
        ...(object(value.item) && id(value.item.agentThreadId) && { childBaseline: this.cumulativeUsage.get(value.item.agentThreadId) }) };
      if (!responseKnown) { if (early.length >= 4096) refuse(); early.push(event); }
      else receive(event);
    });
    const death = this.rpc.ended.then(() => { failure = true; });
    try {
      const started = await this.rpc.request("turn/start", { threadId: thread!.id, input: [{ type: "text", text: message, text_elements: [] }],
        approvalPolicy: "never", sandboxPolicy: { type: "readOnly", networkAccess: false }, effort: this.policy.reasoningEffort }, this.policy.maxWallMs);
      if (!object(started) || !object(started.turn) || !id(started.turn.id)) refuse();
      turnId = started.turn.id;
      activeTurns.set(thread!.id, turnId);
      responseKnown = true;
      for (const event of early) receive(event);
      early.length = 0;
      await Promise.race([done, death]);
      const final = completed as Object | null;
      if (capped) throw new CodexBudgetError(capMessage);
      if (failure || !final || final.id !== turnId || final.status !== "completed" || final.error !== null || !responses.size || !byModel.size) refuse();
      const messages = [...items].filter(([key]) => key.startsWith(thread!.id + ":")).map(([, item]) => item).filter(x => x.type === "agentMessage" && typeof x.text === "string");
      const text = messages.filter(x => x.phase === "final_answer").map(x => x.text).join("\n") || messages.at(-1)?.text;
      if (typeof text !== "string" || !text) refuse();
      const model = parentModel;
      if (!byModel.has(model)) refuse();
      const usage = byModel.get(model) ?? zero();
      this.consumedTokens += [...byModel.values()].reduce((n, value) => n + value.totalTokens, 0);
      const reply = { text, model, modelProvider: thread!.modelProvider, reasoningEffort: primaryEffort(model), servedModels: servedModels(), threadId: thread!.id,
        turnId: turnId!, usage, responses: responses.size, items: [...items.values()], hasReportedUsage: true, primaryHasReportedUsage: true,
        extra: [...byModel].filter(([key]) => key !== model).map(([key, value]) => ({ model: key, usage: value })) };
      this.observed = reply;
      return reply;
    } finally {
      try {
        if (failure && turnId && !completed) {
          // Usage can arrive while the real provider acknowledges interruption.
          // Keep listening through that bounded drain; a failed call still has
          // unreported-spend uncertainty even after all observed counters save.
          try { await this.rpc.request("turn/interrupt", { threadId: thread!.id, turnId }, 1000); } catch {}
          let clock: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([terminal, death, new Promise<void>(resolve => { clock = setTimeout(resolve, 500); })]);
          clearTimeout(clock);
        }
      } finally {
        for (const [threadId, active] of activeTurns) this.retiredTurns.add(`${threadId}:${active}`);
        while (this.retiredTurns.size > 4096) this.retiredTurns.delete(this.retiredTurns.values().next().value!);
        off();
      }
    }
  }

  lastObserved(): CodexReply | null { return this.observed; }
  haltReason(): unknown { return this.halted; }

  async close(): Promise<void> {
    clearInterval(this.stopPolling);
    // EOF gives the genuine thread writer/MCP lifecycle a chance to flush. A
    // short deadline still owns and terminates only this call's process group.
    this.rpc.child.stdin.end();
    if (this.rpc.child.exitCode === null) {
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(clock); this.rpc.child.off("close", done); resolve(); };
        const clock = setTimeout(done, 1500);
        this.rpc.child.once("close", done);
      });
    }
    await this.rpc.close();
  }
}
