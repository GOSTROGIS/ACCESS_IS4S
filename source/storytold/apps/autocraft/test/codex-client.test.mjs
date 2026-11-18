// Protocol component tests with explicitly synthetic channels. Actual Linux,
// provider identity, sandbox and model workflows require separate real gates.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { CodexClient } from '../src/agents/codex/client.ts';
import { DEFAULT_MODEL_POLICY } from '../src/agents/codex/config.ts';
import { CodexBudgetError } from '../src/agents/codex/budget.ts';

function fixture(options = {}) {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null });
  const sent = [], policy = { ...DEFAULT_MODEL_POLICY, provider: 'codex', ...options.policy };
  const account = 'synthetic-account', expiresAt = Math.floor(Date.now() / 1000) * 1000 + 3600000;
  const jwt = [Buffer.from('{"alg":"synthetic"}').toString('base64url'), Buffer.from(JSON.stringify({ exp: expiresAt / 1000, 'https://api.openai.com/auth': { chatgpt_account_id: account } })).toString('base64url'), 'fixture'].join('.');
  const reply = (id, result) => child.stdout.write(JSON.stringify({ id, result }) + '\n');
  const notify = (method, params) => child.stdout.write(JSON.stringify({ method, params }) + '\n');
  const usage = 'usage' in options ? options.usage : { inputTokens: 100, cachedInputTokens: 30, cacheWriteInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 10, totalTokens: 120 };
  const zero = { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 };
  const totals = new Map([['thread-one', options.baseline ?? zero]]);
  const report = (threadId, turnId, responseId) => {
    if (!options.cumulativeOnly) notify('rawResponse/completed', { threadId, turnId, responseId, usage, usageMetadata: null });
    if (usage) {
      const before = totals.get(threadId) ?? zero;
      const total = Object.fromEntries(Object.keys(zero).map(key => [key, before[key] + usage[key]]));
      if (options.negativeCumulative) Object.assign(total, zero);
      totals.set(threadId, total);
      notify('thread/tokenUsage/updated', { threadId, turnId, tokenUsage: { total, last: usage, modelContextWindow: null } });
      if (options.duplicateUsage) notify('thread/tokenUsage/updated', { threadId, turnId, tokenUsage: { total, last: usage, modelContextWindow: null } });
    }
  };
  let pending = '', catalogs = 0;
  child.stdin.on('data', part => {
    pending += part.toString();
    let split;
    while ((split = pending.indexOf('\n')) >= 0) {
      const message = JSON.parse(pending.slice(0, split)); pending = pending.slice(split + 1); sent.push(message);
      if (!message.method || !('id' in message)) continue;
      if (message.method === 'turn/interrupt') {
        reply(message.id, {});
        if (options.lateInterruptUsage) setTimeout(() => {
          report('thread-one', 'turn-one', 'response-late');
          notify('turn/completed', { threadId: 'thread-one', turn: { id: 'turn-one', status: 'interrupted', error: null } });
        }, 20);
      } else if (message.method === 'initialize') reply(message.id, {});
      else if (message.method === 'account/login/start') reply(message.id, { type: 'chatgptAuthTokens' });
      else if (message.method === 'model/list') reply(message.id, options.paginate && ++catalogs === 1 ? { data: [], nextCursor: 'next-page' } :
        { data: [{ id: policy.model, model: policy.model, supportedReasoningEfforts: [{ reasoningEffort: policy.reasoningEffort }] }], nextCursor: null });
      else if (message.method === 'thread/start' || message.method === 'thread/resume') {
        reply(message.id, { thread: { id: 'thread-one', historyMode: 'paginated' }, model: 'gpt-6.2-sol', modelProvider: 'openai', reasoningEffort: policy.reasoningEffort,
          approvalPolicy: 'never', cwd: '/work', sandbox: { type: 'readOnly', networkAccess: options.unsafeSandbox ?? false },
          ...(message.method === 'thread/resume' && { initialTurnsPage: { data: options.baseline ? [{ id: 'old-turn' }] : [] } }) });
        if (message.method === 'thread/resume' && options.baseline) notify('thread/tokenUsage/updated', { threadId: 'thread-one', turnId: 'old-turn',
          tokenUsage: { total: options.baseline, last: options.baseline, modelContextWindow: null } });
      }
      else if (message.method === 'turn/start') {
        notify('turn/started', { threadId: 'thread-one', turn: { id: 'turn-one' } });
        if (options.staleNoise) notify('rawResponse/completed', { threadId: 'thread-one', turnId: 'old-turn', responseId: 'old-response', usage, usageMetadata: null });
        if (options.childModel) {
          notify('item/started', { threadId: 'thread-one', turnId: 'turn-one', item: { id: 'child-created', type: 'subAgentActivity',
            kind: 'started', agentThreadId: 'thread-child', agentPath: 'workspace-search', model: 'gpt-child-actual', reasoningEffort: 'low' } });
          notify('turn/started', { threadId: 'thread-child', turn: { id: 'child-turn' } });
          report('thread-child', 'child-turn', 'child-response');
          notify('item/completed', { threadId: 'thread-child', turnId: 'child-turn', item: { id: 'child-answer', type: 'agentMessage', text: 'not the parent answer', phase: 'final_answer' } });
          const finishChild = () => notify('turn/completed', { threadId: 'thread-child', turn: { id: 'child-turn', status: 'completed', error: null } });
          if (options.delayedChildFinal) setTimeout(finishChild, 20); else finishChild();
        }
        if (options.unattachedChild) {
          notify('turn/started', { threadId: 'thread-old-child', turn: { id: 'unrelated-child-turn' } });
          report('thread-old-child', 'unrelated-child-turn', 'unrelated-child-response');
          notify('turn/completed', { threadId: 'thread-old-child', turn: { id: 'unrelated-child-turn', status: 'completed', error: null } });
        }
        report('thread-one', 'turn-one', 'response-one');
        if (options.reroute || options.staleReroute) {
          notify('model/rerouted', { threadId: 'thread-one', turnId: options.staleReroute ? 'old-turn' : 'turn-one',
            fromModel: 'gpt-6.2-sol', toModel: 'gpt-rerouted-actual', reason: 'highRiskCyberActivity' });
          if (!options.staleReroute) report('thread-one', 'turn-one', 'response-rerouted');
        }
        if (options.changedEffort) {
          notify('thread/settings/updated', { threadId: 'thread-one', threadSettings: { model: 'gpt-6.2-sol', effort: 'high' } });
          report('thread-one', 'turn-one', 'response-high');
        }
        const complete = () => {
          if (options.staleNoise) {
            notify('turn/started', { threadId: 'thread-one', turn: { id: 'old-turn' } });
            notify('turn/completed', { threadId: 'thread-one', turn: { id: 'old-turn', status: 'completed', error: null } });
          }
          const finishParent = () => {
            notify('item/completed', { threadId: 'thread-one', turnId: 'turn-one', item: { id: 'message-one', type: 'agentMessage', text: 'synthetic final fixture', phase: 'final_answer' } });
            notify('turn/completed', { threadId: 'thread-one', turn: { id: 'turn-one', status: 'completed', error: null } });
          };
          if (options.staleNoise) setTimeout(finishParent, 20); else finishParent();
        };
        if (options.stallAfterResponse) report('thread-one', 'turn-one', 'response-two');
        else if (options.delayedFinal) setTimeout(complete, 20);
        else complete();
        // Completion deliberately arrives before the response to turn/start.
        reply(message.id, { turn: { id: 'turn-one' } });
      } else throw Error('Unexpected synthetic protocol operation');
    }
  });
  child.stdin.once('finish', () => { child.exitCode = 0; child.emit('close', 0); });
  const client = new CodexClient({ binary: '/fixture/codex', node: '/fixture/node', sessionDir: '/fixture/session' }, policy,
    async () => ({ accessToken: jwt, chatgptAccountId: account, expiresAt }), createHash('sha256').update(account).digest('hex'), () => {}, undefined, () => child);
  return { client, sent, child, initialState: { schema: 1, threads: [{ threadId: 'thread-one', model: policy.model, total: options.baseline ?? zero }] } };
}

test('official client lifecycle preserves early completion, real provenance and exact cached usage', async () => {
  const f = fixture({ paginate: true });
  try {
    await f.client.initialize();
    await f.client.open('registered prompt system', { features: { multi_agent: false } });
    const result = await f.client.turn('registered prompt input', 1);
    assert.equal(result.text, 'synthetic final fixture'); assert.equal(result.model, 'gpt-6.2-sol'); assert.equal(result.modelProvider, 'openai');
    assert.equal(result.reasoningEffort, 'medium'); assert.equal(result.usage.cachedInputTokens, 30); assert.equal(result.responses, 1);
    const start = f.sent.find(x => x.method === 'thread/start');
    assert.equal(start.params.experimentalRawEvents, true); assert.equal(start.params.ephemeral, false);
    assert.equal(start.params.historyMode, 'paginated');
    assert.equal(start.params.config.cli_auth_credentials_store, 'ephemeral');
    assert.deepEqual(start.params.config.shell_environment_policy, { inherit: 'none', set: { PATH: '/opt/codex:/usr/bin', LANG: 'C.UTF-8' } });
    assert.equal(start.params.config.features.rollout_budget.enforce_limit, true);
    assert.equal(f.sent.filter(x => x.method === 'model/list').length, 2);
    const login = f.sent.find(x => x.method === 'account/login/start');
    assert.equal(login.params.type, 'chatgptAuthTokens'); assert.ok(!('refreshToken' in login.params));
  } finally { await f.client.close(); }
});

test('source client refuses a weakened inner sandbox before any generation', async () => {
  const f = fixture({ unsafeSandbox: true });
  try {
    await f.client.initialize();
    await assert.rejects(f.client.open('fixture', {}));
    assert.ok(!f.sent.some(x => x.method === 'turn/start'));
  } finally { await f.client.close(); }
});

test('persisted threadId resume uses the supported API without invented history or path fields', async () => {
  const f = fixture();
  try {
    f.client.restoreState(f.initialState);
    await f.client.initialize(); await f.client.open('fixture', {}, 'thread-one');
    const resume = f.sent.find(x => x.method === 'thread/resume');
    assert.equal(resume.params.threadId, 'thread-one'); assert.ok(!('history' in resume.params) && !('path' in resume.params));
  } finally { await f.client.close(); }
});

test('supported resume uses actual cumulative deltas once without rebilling historical tokens or requiring unavailable raw events', async () => {
  const baseline = { inputTokens: 1000, cachedInputTokens: 300, cacheWriteInputTokens: 0, outputTokens: 200, reasoningOutputTokens: 100, totalTokens: 1200 };
  const f = fixture({ baseline, cumulativeOnly: true, duplicateUsage: true, childModel: true });
  try {
    f.client.restoreState(f.initialState);
    await f.client.initialize(); await f.client.open('fixture', {}, 'thread-one');
    const result = await f.client.turn('fixture', 2);
    assert.equal(result.usage.totalTokens, 120); assert.equal(result.responses, 2);
    assert.equal(result.extra[0].model, 'gpt-child-actual'); assert.equal(result.extra[0].usage.totalTokens, 120);
    assert.equal(f.client.sessionState().threads.find(x => x.threadId === 'thread-one').total.totalTokens, 1320);
    assert.equal(f.sent.find(x => x.method === 'thread/resume').params.excludeTurns, true);
    assert.equal(f.sent.find(x => x.method === 'thread/resume').params.initialTurnsPage.limit, 1);
  } finally { await f.client.close(); }
});

test('nonmonotonic resumed usage fails within the RPC lifecycle even if a synthetic child never closes', async () => {
  const baseline = { inputTokens: 1000, cachedInputTokens: 300, cacheWriteInputTokens: 0, outputTokens: 200, reasoningOutputTokens: 100, totalTokens: 1200 };
  const f = fixture({ baseline, cumulativeOnly: true, negativeCumulative: true });
  try {
    f.client.restoreState(f.initialState);
    await f.client.initialize(); await f.client.open('fixture', {}, 'thread-one');
    await assert.rejects(f.client.turn('fixture', 2));
  } finally { await f.client.close(); }
});

test('late notifications from an older turn cannot be billed again in the new turn', async () => {
  const f = fixture({ staleNoise: true });
  try {
    await f.client.initialize(); await f.client.open('fixture', {});
    const result = await f.client.turn('fixture', 1);
    assert.equal(result.responses, 1); assert.equal(result.usage.totalTokens, 120);
  } finally { await f.client.close(); }
});

test('response overrun interrupts incomplete work, rejects success and preserves every reported partial token', async () => {
  const f = fixture({ stallAfterResponse: true });
  try {
    await f.client.initialize(); await f.client.open('fixture', {});
    await assert.rejects(f.client.turn('fixture', 1), CodexBudgetError);
    assert.ok(f.sent.some(x => x.method === 'turn/interrupt'));
    assert.equal(f.client.lastObserved().usage.totalTokens, 240);
    assert.equal(f.client.lastObserved().text, '');
  } finally { await f.client.close(); }
});

test('a legitimate final answer in a later packet is not mistaken for a response-cap failure', async () => {
  const f = fixture({ delayedFinal: true });
  try {
    await f.client.initialize(); await f.client.open('fixture', {});
    const result = await f.client.turn('fixture', 1);
    assert.equal(result.text, 'synthetic final fixture'); assert.equal(result.responses, 1);
  } finally { await f.client.close(); }
});

test('interruption retains late genuinely reported usage without declaring the capped call successful', async () => {
  const f = fixture({ stallAfterResponse: true, lateInterruptUsage: true });
  try {
    await f.client.initialize(); await f.client.open('fixture', {});
    await assert.rejects(f.client.turn('fixture', 1), CodexBudgetError);
    assert.equal(f.client.lastObserved().usage.totalTokens, 360);
    assert.equal(f.client.lastObserved().responses, 3);
  } finally { await f.client.close(); }
});

test('resolved child model usage is separate and child text cannot become the parent final answer', async () => {
  const f = fixture({ childModel: true, delayedChildFinal: true });
  try {
    await f.client.initialize(); await f.client.open('fixture', {});
    const result = await f.client.turn('fixture', 2);
    assert.equal(result.text, 'synthetic final fixture');
    assert.deepEqual(result.extra.map(x => [x.model, x.usage.totalTokens]), [['gpt-child-actual', 120]]);
    assert.equal(result.usage.totalTokens, 120);
    assert.deepEqual(result.servedModels, [{ model: 'gpt-child-actual', reasoningEfforts: ['low'] }, { model: 'gpt-6.2-sol', reasoningEfforts: ['medium'] }]);
  } finally { await f.client.close(); }
});

test('observed over-budget usage is retained without accepting a completed over-budget answer', async () => {
  const f = fixture({ policy: { maxTokens: 256 }, usage: { inputTokens: 500, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 100, reasoningOutputTokens: 10, totalTokens: 600 } });
  try {
    await f.client.initialize(); await f.client.open('fixture', {});
    await assert.rejects(f.client.turn('fixture', 2), CodexBudgetError);
    assert.equal(f.client.lastObserved().usage.totalTokens, 600);
  } finally { await f.client.close(); }
});

test('unreported usage cannot be accepted as a completed zero-token response', async () => {
  const f = fixture({ usage: null });
  try {
    await f.client.initialize(); await f.client.open('fixture', {});
    await assert.rejects(f.client.turn('fixture', 1), CodexBudgetError);
    assert.equal(f.client.lastObserved().hasReportedUsage, false);
  } finally { await f.client.close(); }
});


test('actual reroute reports both contributing models and leaves the unreported routed effort unknown', async () => {
  const f = fixture({ reroute: true });
  try {
    await f.client.initialize(); await f.client.open('fixture', {});
    const result = await f.client.turn('fixture', 2);
    assert.equal(result.model, 'gpt-rerouted-actual');
    assert.equal(result.reasoningEffort, null);
    assert.deepEqual(result.servedModels, [{ model: 'gpt-6.2-sol', reasoningEfforts: ['medium'] }, { model: 'gpt-rerouted-actual', reasoningEfforts: [null] }]);
  } finally { await f.client.close(); }
});

test('reasoning changes retain each actually reported effort instead of the requested initial setting', async () => {
  const f = fixture({ changedEffort: true });
  try {
    await f.client.initialize(); await f.client.open('fixture', {});
    const result = await f.client.turn('fixture', 2);
    assert.equal(result.reasoningEffort, null);
    assert.deepEqual(result.servedModels, [{ model: 'gpt-6.2-sol', reasoningEfforts: ['medium', 'high'] }]);
  } finally { await f.client.close(); }
});

test('a late old-turn reroute cannot corrupt the active turn model or serving receipt', async () => {
  const f = fixture({ staleReroute: true });
  try {
    await f.client.initialize(); await f.client.open('fixture', {});
    const result = await f.client.turn('fixture', 1);
    assert.equal(result.model, 'gpt-6.2-sol');
    assert.deepEqual(result.servedModels, [{ model: 'gpt-6.2-sol', reasoningEfforts: ['medium'] }]);
  } finally { await f.client.close(); }
});

test('an old child in persisted state contributes nothing unless the active parent actually invokes it', async () => {
  const f = fixture({ unattachedChild: true });
  try {
    await f.client.initialize();
    f.client.restoreState({ schema: 1, threads: [{ threadId: 'thread-old-child', model: 'gpt-old-child', total: { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 } }] });
    await f.client.open('fixture', {});
    const result = await f.client.turn('fixture', 1);
    assert.equal(result.responses, 1);
    assert.deepEqual(result.extra, []);
    assert.deepEqual(result.servedModels, [{ model: 'gpt-6.2-sol', reasoningEfforts: ['medium'] }]);
  } finally { await f.client.close(); }
});
