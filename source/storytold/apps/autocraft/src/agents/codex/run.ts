import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { add, CHECK_REMINDER, docsOf, needsClippy, promptVersion, providerWorkspace, refsOf, type AskOptions, type LintedReply, type Usage } from "../../classify/run.ts";
import { CHECK_MAX_WALL_MS } from "../../core/rules.ts";
import { CHECK_SERVER, startBridge, type Bridge } from "../../checktool/bridge.ts";
import { itemTools } from "../../itemtools/index.ts";
import { CLAUDE_PROMPTS, claudeParts, joinParts, type ClaudeInput, type ClaudePromptId } from "../../prompts/index.ts";
import { fixTurnMessage, mergeFixFields, needsFixTurn, type LintProblem } from "../../replylint.ts";
import { hasFixedCredential, scrub } from "../../runner/scrub.ts";
import { agentsDefinition, EXPLORER } from "../../sandbox/agents.ts";
import { holdCheckouts } from "../../sandbox/checkout.ts";
import { REFERENCE_PATH, REPO_DOCS_PATH } from "../../sandbox/command.ts";
import { sessionStore } from "../../sandbox/session-store.ts";
import { checkCallActive, isHalt } from "../call.ts";
import { finishRun, setRunProgress } from "../runs.ts";
import { startCodexRun, tryCodexRun } from "./capacity.ts";
import { CodexClient, type CodexReply } from "./client.ts";
import { modelPolicy } from "./config.ts";
import { AppServerFailure, normalizedUsage } from "./rpc.ts";
import { nativeTransport, verifyBinary } from "./transport.ts";
import { CodexBudgetError, CodexUsageError, promptBudgetPolicy } from "./budget.ts";
import { safeCodexSessionDir } from "./session.ts";
import { CODEX_EXECUTION_READY, CODEX_UNAVAILABLE } from "./capabilities.ts";

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
/** Declared AutoCraft tools only; extra native executors have no implicit grant. */
export function codexFeatures(sandboxed: boolean, workspace: boolean): Record<string, boolean> {
  return { shell_tool: sandboxed, unified_exec: sandboxed, view_image: sandboxed, multi_agent: workspace,
    apply_patch_freeform: false, web_search: false, standalone_web_search: false, web_search_request: false,
    shell_snapshot: false, js_repl: false, js_repl_tools_only: false, code_mode: false, code_mode_host: false,
    browser_use: false, computer_use: false, image_generation: false, apps: false, connectors: false, plugins: false,
    memory_tool: false, memories: false, skill_env_var_dependency_prompt: false, skill_mcp_dependency_install: false };
}
export function withoutCodexTools(config: Record<string, unknown>): Record<string, unknown> {
  const servers = object(config.mcp_servers) ? config.mcp_servers : {};
  return { ...config, web_search: "disabled", agents: { enabled: false }, features: { ...codexFeatures(false, false), multi_agent_v2: false },
    mcp_servers: Object.fromEntries(Object.entries(servers).map(([name, server]) => {
      if (!object(server)) throw new Error("Invalid registered MCP configuration.");
      return [name, { ...server, enabled: false, required: false }];
    })) };
}
export function codexReplyUsage(reply: CodexReply): Usage {
  return { ...normalizedUsage(reply.usage), provider: "codex", model: reply.model, reasoningEffort: reply.reasoningEffort,
    ...(reply.extra.length > 0 && { extra: reply.extra.map(x => ({ model: x.model, usage: normalizedUsage(x.usage) })) }) };
}
export function codexMcpServers(servers: Record<string, unknown>, wallMs: number): Record<string, unknown> {
  return Object.fromEntries(Object.entries(servers).map(([name, value]) => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name) || !object(value) || typeof value.command !== "string" ||
        !Array.isArray(value.args) || value.args.some(x => typeof x !== "string") || !object(value.env) ||
        Object.values(value.env).some(x => typeof x !== "string") || Object.keys(value).some(k => !["command", "args", "env"].includes(k))) throw new Error("Unsupported registered MCP transport.");
    return [name, { command: value.command, args: value.args, env: value.env, env_vars: [], enabled: true, required: true,
      startup_timeout_sec: 30, tool_timeout_sec: Math.ceil(wallMs / 1000) }];
  }));
}

/** Store genuine Codex item records directly, without inventing Claude events. */
export function saveCodexTools(db: DatabaseSync, run: number, items: Record<string, unknown>[]): void {
  const checks = db.prepare("SELECT id,command FROM model_checks WHERE run_id=? ORDER BY id").all(run) as { id: number; command: string }[];
  let sequence = 0;
  for (const item of items) {
    if (!["commandExecution", "mcpToolCall", "collabAgentToolCall", "dynamicToolCall", "fileChange"].includes(String(item.type))) continue;
    const tool = item.type === "mcpToolCall" ? `mcp__${String(item.server)}__${String(item.tool)}` : String(item.tool ?? item.type);
    const args = item.arguments ?? (item.type === "commandExecution" ? { command: item.command, cwd: item.cwd } : item);
    const command = item.server === CHECK_SERVER && item.tool === "check" && object(item.arguments) && typeof item.arguments.command === "string" ? item.arguments.command : null;
    const checkIndex = command === null ? -1 : checks.findIndex(c => c.command === command);
    const check = checkIndex < 0 ? null : checks.splice(checkIndex, 1)[0]!.id;
    const output = item.result ?? item.aggregatedOutput ?? null;
    db.prepare(`INSERT OR REPLACE INTO agent_run_tools(run_id,seq,tool,args,result_bytes,is_error,started_at,ended_at,check_id) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(run, ++sequence, tool.slice(0, 200), scrub(JSON.stringify(args)).slice(0, 4000), output === null ? null : Buffer.byteLength(JSON.stringify(output)),
        item.error || (typeof item.exitCode === "number" && item.exitCode !== 0) || item.status === "failed" ? 1 : 0,
        typeof item.startedAtMs === "number" ? new Date(item.startedAtMs).toISOString() : null,
        typeof item.completedAtMs === "number" ? new Date(item.completedAtMs).toISOString() : null, check);
  }
}

/** All registered prompts retain their original renderers, parsers, retries, check tools and lint. */
export async function askCodex<K extends ClaudePromptId>(id: K, input: ClaudeInput[K], db: DatabaseSync, opts: AskOptions): Promise<LintedReply | null> {
  if (!CODEX_EXECUTION_READY) throw new CodexBudgetError(CODEX_UNAVAILABLE);
  const policy = modelPolicy(db), reg = CLAUDE_PROMPTS[id];
  promptBudgetPolicy(db, id);
  const { transport, lease } = nativeTransport(db);
  await verifyBinary(transport);
  const sandboxed = opts.checkout !== undefined && reg.sandbox !== undefined;
  const reference = sandboxed && reg.sandbox?.reference ? opts.reference : undefined;
  const docs = sandboxed && reg.sandbox?.docs ? await docsOf(db, opts.checkout!) : undefined;
  if (reference) input = input.map(x => ({ ...x, reference: true })) as ClaudeInput[K];
  if (docs) input = input.map(x => ({ ...x, repo_docs: true })) as ClaudeInput[K];
  const parts = claudeParts(id, input, sandboxed), items = refsOf(input);
  const runInput = (prompt: string) => ({ promptId: id, promptVersion: promptVersion(id), provider: "codex" as const, model: policy.model,
    reasoningEffort: policy.reasoningEffort, items, prompt });
  let currentRun = await startCodexRun(db, runInput(joinParts(parts)), opts.maxWaitMs);
  let activeRun: number | null = currentRun, observingRun: number | null = null;
  const tokenBudget = (db.prepare("SELECT token_budget FROM agent_runs WHERE id=?").get(currentRun) as { token_budget: number }).token_budget;
  const workspace = sandboxed && reg.sandbox?.workspace === true;
  const checkTool = sandboxed && reg.sandbox?.check ? opts.check : undefined;
  let bridge: Bridge | undefined, client: CodexClient | undefined, release: (() => void) | undefined;
  let sessions: string | undefined, kept = false;
  let openedThreadId: string | undefined;
  const reportedByRun = new Map<number, Usage>();
  const resume = opts.session?.resume;
  const existing = resume?.session;
  const persistSession = (): void => {
    if (!openedThreadId || !client || !sessions) return;
    const codexState = client.sessionState();
    if (activeRun !== null) db.prepare("UPDATE agent_runs SET session_state=? WHERE id=?").run(JSON.stringify({ provider: "codex", threadId: openedThreadId, dir: sessions, checkout: opts.checkout ?? null, codexState }), activeRun);
    if (opts.session && sandboxed) {
      opts.session.kept = { provider: "codex", id: openedThreadId, dir: sessions, account: "codex", checkout: opts.checkout!, codexState };
      kept = true;
    }
  };
  // A retained store must be one of our exclusive session directories, bound to
  // this provider and checkout. A Claude session is never opened as Codex.
  try {
    if (existing?.provider === "codex" && existing.checkout === opts.checkout && safeCodexSessionDir(existing.dir)) { sessions = existing.dir; kept = true; }
    sessions ??= sessionStore();
    const shared = workspace ? opts.shared ?? await providerWorkspace(db) : undefined;
    const tools = workspace ? opts.itemTools === undefined ? itemTools() : opts.itemTools : null;
    const uid = process.getuid?.(), gid = process.getgid?.();
    if (process.platform !== "linux" || uid === undefined || gid === undefined) throw new Error("Codex requires its configured Linux sandbox.");
    writeFileSync(join(sessions, "passwd"), `sandbox:x:${uid}:${gid}:Sandbox:/home/sandbox:/bin/sh\n`, { mode: 0o600 });
    if (checkTool) bridge = await startBridge(checkTool, currentRun);
    const servers = { ...(tools?.mcpServers ?? {}), ...(bridge ? { [CHECK_SERVER]: bridge.mcpServer } : {}) };
    const mounts = [...(tools?.mounts ?? []), ...(bridge ? [bridge.mount] : []),
      ...(reference ? [{ host: reference, path: REFERENCE_PATH }] : []), ...(docs ? [{ host: docs, path: REPO_DOCS_PATH }] : [])];
    if (workspace) {
      const role = agentsDefinition(Object.keys(tools?.mcpServers ?? {}))[EXPLORER] as { prompt: string; description: string };
      const rolePath = join(sessions, "workspace-search.toml");
      writeFileSync(rolePath, `model = ${JSON.stringify(policy.model)}\nmodel_reasoning_effort = ${JSON.stringify(policy.reasoningEffort)}\nsandbox_mode = "read-only"\napproval_policy = "never"\ndeveloper_instructions = ${JSON.stringify(role.prompt + " Use Codex read-only shell/search and the registered item MCP tools. Never modify files or request elevated permissions.")}\n[shell_environment_policy]\ninherit = "none"\n[shell_environment_policy.set]\nPATH = "/usr/bin"\nLANG = "C.UTF-8"\n`, { mode: 0o600 });
      mounts.push({ host: rolePath, path: "/provider-role.toml" });
    }
    const maxWallMs = Math.min(policy.maxWallMs, reg.limits.timeoutSeconds * 1000 + (bridge ? CHECK_MAX_WALL_MS : 0));
    const providerDeadline = Date.now() + maxWallMs;
    const spec = { binary: transport.binary.path, node: process.execPath, sessionDir: sessions, ...(sandboxed && { checkout: opts.checkout }), shared, mounts };
    const createClient = (tokens: number): CodexClient => {
      const remainingMs = providerDeadline - Date.now();
      if (tokens < 1 || remainingMs < 1) throw new CodexBudgetError();
      return new CodexClient(spec, { ...policy, maxTokens: tokens, maxWallMs: remainingMs }, lease, transport.accountSha256, checkCallActive, (item, completed) => {
        if (!completed && ["commandExecution", "mcpToolCall", "collabAgentToolCall"].includes(String(item.type))) {
          const line = `Codex: ${String(item.tool ?? item.type)}`;
          setRunProgress(db, currentRun, line); opts.onProgress?.(line);
        }
      });
    };
    client = createClient(tokenBudget);
    release = holdCheckouts([...(opts.checkout ? [opts.checkout] : []), ...(shared ?? []).map(x => x.dir)]);
    if (sessions === existing?.dir) client.restoreState(existing.codexState);
    await client.initialize();
    const config = { mcp_servers: codexMcpServers(servers, maxWallMs), web_search: "disabled", features: codexFeatures(sandboxed, workspace),
      ...(workspace && { agents: { enabled: true, default_subagent_model: policy.model, default_subagent_reasoning_effort: policy.reasoningEffort,
        max_concurrent_threads_per_session: 2, max_depth: 1, [EXPLORER]: { description: "Read-only workspace and item search", config_file: "/provider-role.toml" } } }) };
    const instructions = `${parts.system ?? ""}\n\nExecution provider: Codex. The prompt's Read/Grep/Glob operations use Codex's native read-only shell/search tools, and image reads use its native image viewer. Agent workspace-search uses the configured workspace-search role. Registered MCP tools retain their documented functions. Never write files, run a network command, request elevated execution, or read /proc, credentials or account configuration. Return the original registered reply format. The original prompt id is a workflow identifier; it does not identify the model serving this call.`;
    const threadId = await client.open(instructions, config, sessions === existing?.dir ? existing.id : undefined);
    openedThreadId = threadId;
    persistSession();
    const turn = async (message: string, limit: number): Promise<LintedReply> => {
      bridge?.setRun(currentRun);
      observingRun = activeRun;
      const reply: CodexReply = await client!.turn(message, limit);
      persistSession();
      saveCodexTools(db, currentRun, reply.items);
      const usage = codexReplyUsage(reply);
      reportedByRun.set(currentRun, usage);
      const totals = reply.extra.reduce((total, e) => ({ input: total.input + normalizedUsage(e.usage).input, output: total.output + e.usage.outputTokens,
        cacheRead: total.cacheRead + e.usage.cachedInputTokens, cacheWrite: total.cacheWrite + e.usage.cacheWriteInputTokens, cost: null }), normalizedUsage(reply.usage));
      const stored = scrub(reply.text);
      if (reg.codeReply && hasFixedCredential(reply.text)) throw new Error("The reply contains a credential and was refused.");
      finishRun(db, currentRun, { state: "done", tokens: totals, costUsd: null, model: reply.model,
        providerUsage: { ...reply.usage, modelProvider: reply.modelProvider, usageComplete: true }, summary: `Codex answered in ${reply.responses} model responses`, output: stored });
      activeRun = null;
      return { text: reg.codeReply ? reply.text : stored, usage, turns: reply.responses };
    };
    let reply = await turn(sessions === existing?.dir ? resume!.message : parts.stdin, Math.min(policy.maxTurns, reg.sandbox?.maxTurns ?? 1));
    const followup = async (message: string, limit: number, noTools = false): Promise<LintedReply | null> => {
      checkCallActive();
      const next = tryCodexRun(db, runInput(message), policy.maxConcurrent);
      if (next === null) return null;
      currentRun = next;
      activeRun = next; observingRun = null;
      persistSession();
      if (noTools) {
        // This is the original lint-only repair: no file/search/agent/MCP
        // permission. The official API has no per-turn tool mask, so flush and
        // genuinely resume the SAME persisted thread with those tools disabled.
        const state = client!.sessionState();
        await client!.close();
        const spent = [...reportedByRun.values()].reduce((total, usage) => total + [usage, ...(usage.extra ?? []).map(e => e.usage)]
          .reduce((n, u) => n + u.input + u.output + u.cacheRead + u.cacheWrite, 0), 0);
        const reserved = (db.prepare("SELECT token_budget FROM agent_runs WHERE id=?").get(next) as { token_budget: number }).token_budget;
        client = createClient(Math.min(reserved, tokenBudget - spent));
        client.restoreState(state);
        await client.initialize();
        await client.open(instructions, withoutCodexTools(config), threadId);
        persistSession();
      }
      return turn(message, limit);
    };
    if (checkTool && needsClippy(checkTool, reply.text)) {
      const fix = await followup(CHECK_REMINDER, Math.min(policy.maxTurns, reg.sandbox?.maxTurns ?? 1));
      if (fix) reply = { ...fix, usage: add(reply.usage, fix.usage) };
    }
    if (opts.session && sandboxed) {
      persistSession(); delete opts.session.resume;
    }
    if (!opts.lint) return reply;
    let problems: LintProblem[] | null = null;
    try { problems = await opts.lint(reply.text, "first"); } catch (error) { if (isHalt(error)) throw error; }
    if (problems === null) return reply;
    const originalProblems = problems;
    const full = async () => (await opts.lint!(reply.text, "fix")) ?? originalProblems;
    if (!problems.length) return { ...reply, problems };
    if (!reg.lint || !needsFixTurn(problems)) return { ...reply, problems: await full() };
    const fix = await followup(fixTurnMessage(problems), 1, true);
    if (!fix) return { ...reply, problems: await full() };
    const total = add(reply.usage, fix.usage), merged = mergeFixFields(reply.text, fix.text, problems);
    if (merged === null) return { ...reply, usage: total, problems: await full(), fixTurn: true };
    const after = await opts.lint(merged, "fix");
    return after === null ? { ...reply, usage: total, problems: await full(), fixTurn: true } : { text: merged, usage: total, problems: after, fixTurn: true };
  } catch (error) {
    error = client?.haltReason() ?? error;
    const observed = activeRun !== null && observingRun === activeRun ? client?.lastObserved() : null;
    if (observed?.hasReportedUsage) reportedByRun.set(currentRun, codexReplyUsage(observed));
    const partialUsage = [...reportedByRun.values()].reduce<Usage | undefined>((total, usage) => total ? add(total, usage) : usage, undefined);
    const totals = observed?.hasReportedUsage ? [observed.usage, ...observed.extra.map(x => x.usage)].reduce((total, usage) => ({ input: total.input + normalizedUsage(usage).input,
      output: total.output + usage.outputTokens, cacheRead: total.cacheRead + usage.cachedInputTokens, cacheWrite: total.cacheWrite + usage.cacheWriteInputTokens }),
      { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }) : undefined;
    if (observed) saveCodexTools(db, currentRun, observed.items);
    try { persistSession(); } catch { /* Keep the last valid private checkpoint, never synthesize resume state. */ }
    // A failed/capped call can contain useful genuine thread work even without
    // a completed reply. Retain its exclusive store and private DB reference.
    if (openedThreadId) kept = true;
    const capped = error instanceof CodexBudgetError || error instanceof AppServerFailure && error.code === "DEADLINE";
    if (activeRun !== null) finishRun(db, activeRun, { state: "failed", summary: capped ? "Codex bounded-policy stop; partial session retained" : "Codex call failed",
      error: error instanceof CodexBudgetError ? error.message : capped ? "The Codex time budget was exhausted; partial work was retained." : "The Codex call was refused, stopped or could not complete.",
      ...(totals && { tokens: totals }), ...(observed?.hasReportedUsage && { model: observed.model, providerUsage: { ...observed.usage, modelProvider: observed.modelProvider, usageComplete: false } }), costUsd: null });
    if (isHalt(error)) throw error;
    if (error instanceof CodexBudgetError) throw new CodexBudgetError(error.message, partialUsage);
    if (capped) throw new CodexBudgetError("The Codex time budget was exhausted; partial work and its session are retained.", partialUsage);
    if (partialUsage) throw new CodexUsageError("The Codex call could not complete; its reported usage and partial session were retained.", partialUsage);
    return null;
  } finally {
    await client?.close(); release?.(); bridge?.close(); opts.check?.close();
    if (sessions && !kept) rmSync(sessions, { recursive: true, force: true });
  }
}
