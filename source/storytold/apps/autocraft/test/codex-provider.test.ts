import assert from "node:assert/strict";
import { test } from "node:test";
import { addLogin } from "../src/access.ts";
import { connect } from "../src/db.ts";
import { add, saveUsage } from "../src/classify/run.ts";
import { finishRun, getRun, insertRun } from "../src/agents/runs.ts";
import { DEFAULT_MODEL_POLICY, modelPolicy, setModelPolicy, validateModelPolicy } from "../src/agents/codex/config.ts";
import { CODEX_BINARY_SHA256, CODEX_VERSION, currentNativeSession, parseTransport } from "../src/agents/codex/transport.ts";
import { codexSandbox } from "../src/agents/codex/sandbox.ts";
import { codexFeatures, codexMcpServers, saveCodexTools, withoutCodexTools } from "../src/agents/codex/run.ts";
import { reportedUsage } from "../src/agents/codex/client.ts";
import { setCallContext } from "../src/agents/call.ts";
import { tryCodexRun } from "../src/agents/codex/capacity.ts";
import { CodexBudgetError, CodexUsageError, promptBudgetPolicy, providerBudgetMode } from "../src/agents/codex/budget.ts";
import { NATIVE_ORIGINS, type Config } from "../src/dash/server/config.ts";
import { sha256hex, TokenBox } from "../src/dash/server/crypto.ts";
import { createSession, deleteSession } from "../src/dash/server/sessions.ts";
import { runModelStep, type ClaudeStep } from "../src/agents/step.ts";

const manifest = () => ({ schema: 1, product: "access", socket: "/private/provider/lease.sock", brokerPort: 43210,
  accountSha256: "a".repeat(64), binary: { path: "/providers/codex/codex", version: CODEX_VERSION, sha256: CODEX_BINARY_SHA256 } });
const run = (db: ReturnType<typeof connect>, provider: "claude" | "codex" = "codex") => insertRun(db, { jobId: null, step: "classify-new", stage: 2,
  promptId: "classify.haiku", promptVersion: "fixture", provider, model: provider === "codex" ? "gpt-6.2-sol" : "haiku", reasoningEffort: "medium", accountId: null, items: [], prompt: "fixture" });

test("explicit finite provider policy preserves Claude defaults and rejects malformed saved settings", () => {
  const db = connect(":memory:");
  try {
    assert.deepEqual(modelPolicy(db), DEFAULT_MODEL_POLICY);
    for (const value of [{ ...DEFAULT_MODEL_POLICY, maxTokens: Infinity }, { ...DEFAULT_MODEL_POLICY, maxConcurrent: 0 },
      { ...DEFAULT_MODEL_POLICY, model: "--execute command" }, { ...DEFAULT_MODEL_POLICY, reasoningEffort: "invented" },
      { ...DEFAULT_MODEL_POLICY, accessToken: "must-not-accept" }]) assert.throws(() => validateModelPolicy(value));
    setModelPolicy(db, { ...DEFAULT_MODEL_POLICY, provider: "codex" }, "fixture");
    assert.equal(modelPolicy(db).provider, "codex");
    db.prepare("UPDATE settings SET value='{}' WHERE key='model_provider_policy'").run();
    assert.throws(() => modelPolicy(db));
  } finally { db.close(); }
});

test("protected manifest requires its fixed product, pre-pinned account and exact signed binary", () => {
  assert.equal(parseTransport(manifest(), "access").binary.version, CODEX_VERSION);
  for (const value of [{ ...manifest(), product: "slipcurve" }, { ...manifest(), accountSha256: "" },
    { ...manifest(), socket: "/private/../lease.sock" }, { ...manifest(), brokerPort: 80 },
    { ...manifest(), binary: { ...manifest().binary, sha256: "0".repeat(64) } }, { ...manifest(), accessToken: "forbidden" }]) {
    assert.throws(() => parseTransport(value, "access"));
  }
});

test("provider sandbox preserves real app-server and MCP capabilities without mounting native auth or lease transport", () => {
  const spec = { binary: "/verified/codex", node: "/verified/node", sessionDir: "/private/session-one", checkout: "/private/checkout",
    shared: [{ name: "OWN", dir: "/private/own" }], mounts: [{ host: "/trusted/item-tools", path: "/app/item-tools" }] };
  const command = codexSandbox(spec);
  assert.deepEqual(command.env, { PATH: "/opt/codex:/usr/bin", LANG: "C.UTF-8" });
  assert.equal(command.args[command.args.indexOf(spec.node) + 1], "/opt/codex/node");
  assert.ok(command.args.includes('shell_environment_policy.set.PATH="/opt/codex:/usr/bin"'));
  assert.ok(command.args.includes("--unshare-all") && command.args.includes("--die-with-parent"));
  assert.ok(command.args.includes('cli_auth_credentials_store="ephemeral"') && command.args.includes('approval_policy="never"'));
  assert.equal(command.args.at(-1), "app-server");
  assert.ok(!command.args.some(x => /lease\.sock|mirror\.db|nativeOwner|accessToken/.test(x)));
  for (const path of ["/proc/1/fd", "/home/auth", "/tmp/private", "/a/../escape"]) assert.throws(() => codexSandbox({ ...spec, mounts: [{ host: "/fixture", path }] }));
  const servers = codexMcpServers({ build: { command: "/usr/bin/node", args: ["/app/check-tool/main.ts"], env: { CHECK_TOOL_URL: "http://127.0.0.1:1234/" } } }, 600000);
  assert.equal((servers.build as { tool_timeout_sec: number }).tool_timeout_sec, 600);
  assert.throws(() => codexMcpServers({ unsafe: { command: "node", args: [], env: {}, unrecognized: true } }, 600000));
  const declared = codexFeatures(true, true);
  assert.equal(declared.shell_tool, true); assert.equal(declared.view_image, true); assert.equal(declared.multi_agent, true);
  assert.equal(declared.js_repl, false); assert.equal(declared.code_mode, false); assert.equal(declared.browser_use, false);
  const repair = withoutCodexTools({ mcp_servers: servers, features: declared });
  assert.equal((repair.features as Record<string, boolean>).shell_tool, false);
  assert.equal((repair.features as Record<string, boolean>).multi_agent_v2, false);
  assert.equal((repair.agents as { enabled: boolean }).enabled, false);
  assert.equal(((repair.mcp_servers as Record<string, { enabled: boolean }>).build!).enabled, false);
});

test("registered MCP Node commands use the dedicated provider mount without rewriting other commands or arguments", () => {
  const args = ["/app/item-tools/main.ts", "/usr/bin/node"];
  const env = { ITEM_TOOL_URL: "http://127.0.0.1:1234/" };
  const servers = codexMcpServers({ item: { command: "/usr/bin/node", args, env },
    other: { command: "/trusted/other-command", args: ["/usr/bin/node"], env: {} } }, 60_000) as Record<string, { command: string; args: string[]; env: Record<string, string> }>;
  assert.equal(servers.item!.command, "/opt/codex/node");
  assert.deepEqual(servers.item!.args, args); assert.deepEqual(servers.item!.env, env);
  assert.equal(servers.other!.command, "/trusted/other-command");
  assert.deepEqual(servers.other!.args, ["/usr/bin/node"]);
});

test("actual provider and reasoning remain truthful for historical, unknown and Codex rows", () => {
  const db = connect(":memory:");
  try {
    const old = run(db, "claude"), codex = run(db), raw = { inputTokens: 100, cachedInputTokens: 30, cacheWriteInputTokens: 10, outputTokens: 20, reasoningOutputTokens: 15, totalTokens: 120, modelProvider: "openai" };
    finishRun(db, codex, { state: "done", model: "gpt-6.2-sol-actual", tokens: { input: 60, output: 20, cacheRead: 30, cacheWrite: 10 }, costUsd: null, providerUsage: raw });
    const value = getRun(db, codex);
    assert.equal(value.provider, "codex"); assert.equal(value.model, "gpt-6.2-sol-actual"); assert.equal(value.reasoningEffort, "medium");
    assert.deepEqual(value.providerUsage, raw); assert.equal(value.costUsd, null);
    assert.equal(getRun(db, old).provider, "claude");
    db.prepare("UPDATE agent_runs SET provider='future-provider' WHERE id=?").run(old);
    assert.equal(getRun(db, old).provider, "unknown");
    const serialized = JSON.stringify(value);
    assert.ok(!serialized.includes("accessToken") && !serialized.includes("lease.sock"));
  } finally { db.close(); }
});

test("Codex cached tokens are partitioned once, unknown cost stays null and token rows use the actual model", () => {
  const db = connect(":memory:");
  try {
    assert.deepEqual(reportedUsage({ inputTokens: 100, cachedInputTokens: 30, cacheWriteInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 10, totalTokens: 120 }).totalTokens, 120);
    assert.throws(() => reportedUsage({ inputTokens: 100, cachedInputTokens: 101, cacheWriteInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 10, totalTokens: 120 }));
    assert.throws(() => reportedUsage({ inputTokens: 100, cachedInputTokens: 30, cacheWriteInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 10, totalTokens: 120, accessToken: "must-not-persist" }));
    const usage = add({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }, { provider: "codex", model: "gpt-6.2-sol", input: 70, output: 20, cacheRead: 30, cacheWrite: 0, cost: null });
    assert.equal(usage.cost, null); assert.equal(usage.model, "gpt-6.2-sol");
    saveUsage(db, "fixture", "primary", "classify", "haiku", 1, usage, "2026-01-01", "2026-01-01");
    assert.equal(db.prepare("SELECT model FROM token_usage WHERE run_id='fixture'").get()!.model, "gpt-6.2-sol");
    assert.equal(db.prepare("SELECT cost_usd FROM token_usage WHERE run_id='fixture'").get()!.cost_usd, null);
    assert.equal(add({ input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0.2 }, { input: 2, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0.3 }).cost, 0.5);
  } finally { db.close(); }
});

test("only the bound current native owner operator session authorizes a lease; logout has no older-session fallback", () => {
  const db = connect(":memory:");
  const config: Config = { host: "127.0.0.1", port: 8993, baseUrl: NATIVE_ORIGINS.access, dbPath: "unused", webDist: "unused", devAuth: false,
    devPermsFile: null, devTokenTtlMs: null, trustProxy: false, imageCacheDir: null, secretsFile: null,
    secrets: { githubClientId: null, githubClientSecret: null, sessionKey: "fixture-session-key-" + "s".repeat(40), app: null, nativeOwner: { product: "access", login: "FixtureOwner", githubId: 42 } } };
  try {
    addLogin(db, "fixture-install", "FixtureOwner", "operator", null, 42);
    const box = new TokenBox(config.secrets.sessionKey), tokens = { access: "fixture-github-credential-not-real", refresh: null, expiresAt: null, refreshExpiresAt: null };
    createSession(db, box, "FixtureOwner", tokens, "older fixture");
    const selected = createSession(db, box, "FixtureOwner", tokens, "current fixture"), hash = sha256hex(selected);
    db.prepare("INSERT INTO settings(key,value) VALUES ('native_cli_session.access',?)").run(hash);
    assert.equal(currentNativeSession(db, config, "access"), hash);
    assert.throws(() => currentNativeSession(db, config, "slipcurve"));
    db.prepare("UPDATE access SET role='viewer' WHERE login='FixtureOwner'").run(); assert.throws(() => currentNativeSession(db, config, "access"));
    db.prepare("UPDATE access SET role='operator' WHERE login='FixtureOwner'").run();
    deleteSession(db, selected); assert.throws(() => currentNativeSession(db, config, "access"));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get()!.n, 1);
  } finally { db.close(); }
});

test("genuine Codex MCP tool metadata links the original check rows without synthetic Claude stream events", () => {
  const db = connect(":memory:");
  try {
    const id = run(db), check = Number(db.prepare("INSERT INTO model_checks(run_id,step,repo,number,head,command,started_at) VALUES (?,'fixup','OWN',1,'h','clippy','t')").run(id).lastInsertRowid);
    saveCodexTools(db, id, [{ type: "mcpToolCall", id: "real-item-id", server: "build", tool: "check", arguments: { command: "clippy", patch: "fixture diff" }, status: "completed", result: { content: [] }, error: null }]);
    const value = getRun(db, id);
    assert.equal(value.tools[0]!.tool, "mcp__build__check"); assert.equal(value.tools[0]!.check!.id, check);
  } finally { db.close(); }
});

test("job-wide token reservations cannot be overbooked and failed unknown usage never becomes zero budget", () => {
  const db = connect(":memory:");
  const input = { promptId: "classify.haiku", promptVersion: "fixture", provider: "codex" as const, model: "gpt-6.2-sol", items: [], prompt: "fixture" };
  try {
    setModelPolicy(db, { ...DEFAULT_MODEL_POLICY, provider: "codex", maxTokens: 1000, maxJobTokens: 1500, maxConcurrent: 3 }, "fixture");
    setCallContext({ jobId: 71, step: "classify-new", stage: 2, cancelled: () => false });
    const first = tryCodexRun(db, input, 3)!, second = tryCodexRun(db, input, 3)!;
    assert.equal(db.prepare("SELECT token_budget FROM agent_runs WHERE id=?").get(first)!.token_budget, 1000);
    assert.equal(db.prepare("SELECT token_budget FROM agent_runs WHERE id=?").get(second)!.token_budget, 500);
    assert.throws(() => tryCodexRun(db, input, 3), CodexBudgetError);
    finishRun(db, first, { state: "done", tokens: { input: 200, output: 100, cacheRead: 0, cacheWrite: 0 }, providerUsage: { inputTokens: 200, outputTokens: 100,
      cachedInputTokens: 0, cacheWriteInputTokens: 0, reasoningOutputTokens: 50, totalTokens: 300, modelProvider: "openai" } });
    finishRun(db, second, { state: "failed" });
    const third = tryCodexRun(db, input, 3)!;
    assert.equal(db.prepare("SELECT token_budget FROM agent_runs WHERE id=?").get(third)!.token_budget, 700);
    assert.throws(() => tryCodexRun(db, input, 3), CodexBudgetError);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM agent_runs").get()!.n, 3);
  } finally { setCallContext(null); db.close(); }
});

test("unknown-priced dollar stages require an explicit token policy while Claude keeps dollar accounting", () => {
  const db = connect(":memory:");
  try {
    assert.equal(providerBudgetMode(db, "security"), "usd");
    setModelPolicy(db, { ...DEFAULT_MODEL_POLICY, provider: "codex" }, "fixture");
    assert.throws(() => promptBudgetPolicy(db, "security.model"), CodexBudgetError);
    assert.throws(() => promptBudgetPolicy(db, "discord.search"), /requires dollar pricing/);
    assert.doesNotThrow(() => promptBudgetPolicy(db, "classify.haiku"));
    setModelPolicy(db, { ...DEFAULT_MODEL_POLICY, provider: "codex", unknownCostPolicy: "bounded-tokens" }, "fixture");
    assert.equal(providerBudgetMode(db, "security"), "tokens");
  } finally { db.close(); }
});

test("capped model steps save exact partial usage once and preserve the failure instead of returning a partial success", async () => {
  const db = connect(":memory:");
  const step: ClaudeStep<string, string> = { provider: "claude", id: "classify.haiku", attempts: 3, parse: () => null };
  const usage = { provider: "codex" as const, model: "gpt-actual", input: 60, output: 20, cacheRead: 30, cacheWrite: 0, cost: null,
    extra: [{ model: "gpt-child", usage: { input: 5, output: 7, cacheRead: 0, cacheWrite: 0, cost: null } }] };
  let calls = 0;
  try {
    await assert.rejects(runModelStep(db, step, "fixture", { usage: { run: "partial", agent: "a", stage: "classify", skipWhen: x => !x.ok },
      ask: async () => { if (++calls === 1) return { text: "unparseable", usage }; throw new CodexBudgetError("fixture cap", usage); } }),
    (error: unknown) => error instanceof CodexBudgetError && error.usage?.input === 120 && error.usage.cost === null);
    const rows = db.prepare("SELECT model,input_tokens,output_tokens,cost_usd FROM token_usage WHERE run_id='partial' ORDER BY model").all();
    assert.deepEqual(rows.map(x => ({ ...x })), [{ model: "gpt-actual", input_tokens: 120, output_tokens: 40, cost_usd: null },
      { model: "gpt-child", input_tokens: 10, output_tokens: 14, cost_usd: null }]);
    assert.equal(calls, 2);
    await assert.rejects(runModelStep(db, step, "fixture", { usage: { run: "unreported", agent: "a", stage: "classify", withoutUsage: true },
      ask: async () => { throw new CodexBudgetError(); } }), CodexBudgetError);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM token_usage WHERE run_id='unreported'").get()!.n, 0);
  } finally { db.close(); }
});

test("keeping earlier usage preserves actual subagent rows across a resumed step", async () => {
  const db = connect(":memory:");
  const step: ClaudeStep<string, string> = { provider: "claude", id: "classify.haiku", attempts: 1, parse: text => ({ value: text }) };
  const usage = { provider: "codex" as const, model: "gpt-actual", input: 60, output: 20, cacheRead: 30, cacheWrite: 0, cost: null,
    extra: [{ model: "gpt-child", usage: { input: 5, output: 7, cacheRead: 0, cacheWrite: 0, cost: null } }] };
  try {
    const opts = { usage: { run: "retained", agent: "primary", stage: "classify", keepEarlier: true }, ask: async () => ({ text: "fixture", usage }) };
    await runModelStep(db, step, "fixture", opts);
    await runModelStep(db, step, "fixture", opts);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM token_usage WHERE run_id='retained'").get()!.n, 4);
    assert.equal(db.prepare("SELECT SUM(input_tokens) n FROM token_usage WHERE run_id='retained' AND model='gpt-child'").get()!.n, 10);
  } finally { db.close(); }
});

test("changing provider between retries preserves priced earlier usage without relabelling it as Codex", async () => {
  const db = connect(":memory:");
  const step: ClaudeStep<string, string> = { provider: "claude", id: "classify.haiku", attempts: 2, parse: () => null };
  let calls = 0;
  try {
    await assert.rejects(runModelStep(db, step, "fixture", { usage: { run: "changed", agent: "a", stage: "classify" }, ask: async () => {
      calls++; setModelPolicy(db, { ...DEFAULT_MODEL_POLICY, provider: "codex" }, "fixture");
      return { text: "unparseable", usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0.25 } };
    } }), /provider changed/);
    assert.equal(calls, 1);
    assert.deepEqual({ ...db.prepare("SELECT model,input_tokens,cost_usd FROM token_usage WHERE run_id='changed'").get()! },
      { model: "haiku", input_tokens: 10, cost_usd: 0.25 });
  } finally { db.close(); }
});

test("ordinary failed calls retain registered retries and exact reported spend even when no valid answer follows", async () => {
  const db = connect(":memory:");
  const step: ClaudeStep<string, string> = { provider: "claude", id: "classify.haiku", attempts: 2, parse: () => null };
  let calls = 0;
  try {
    const result = await runModelStep(db, step, "fixture", { usage: { run: "failed", agent: "a", stage: "classify", skipWhen: x => !x.ok }, ask: async () => {
      calls++; throw new CodexUsageError("fixture provider failure", { provider: "codex", model: "gpt-actual", input: 10, output: 2, cacheRead: 3, cacheWrite: 0, cost: null });
    } });
    assert.equal(result.ok, false); assert.equal(calls, 2);
    assert.deepEqual({ ...db.prepare("SELECT model,input_tokens,output_tokens,cost_usd FROM token_usage WHERE run_id='failed'").get()! },
      { model: "gpt-actual", input_tokens: 20, output_tokens: 4, cost_usd: null });
  } finally { db.close(); }
});
