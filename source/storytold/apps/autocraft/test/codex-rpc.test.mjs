import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { AppServerRpc, AppServerFailure, normalizedUsage } from '../src/agents/codex/rpc.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
function channel(options = {}) {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
  const lines = []; let sent = '', stopped = 0;
  child.stdin.on('data', part => { sent += part.toString(); let split; while ((split = sent.indexOf('\n')) >= 0) {
    lines.push(JSON.parse(sent.slice(0, split))); sent = sent.slice(split + 1);
  } });
  const rpc = new AppServerRpc(child, { deadlineMs: 5000, ...options, stop() { stopped++; child.emit('close', 0); } });
  return { rpc, child, lines, stopped: () => stopped, write: value => child.stdout.write(JSON.stringify(value) + '\n') };
}
const failure = code => error => error instanceof AppServerFailure && error.code === code;

test('correlates concurrent responses and early notifications across split UTF-8 chunks', async () => {
  const seen = [], c = channel(); c.rpc.subscribe((method, params) => seen.push({ method, params }));
  try {
    const first = c.rpc.request('thread/start', { model: 'test-model' });
    const second = c.rpc.request('account/read', { refreshToken: false });
    const [one,two] = c.lines;
    const payload = Buffer.from(JSON.stringify({ method: 'item/completed', params: { text: 'Ã© real bytes' } }) + '\n' +
      JSON.stringify({ id: two.id, result: { order: 2 } }) + '\n' + JSON.stringify({ id: one.id, result: { order: 1 } }) + '\n');
    for (const byte of payload) c.child.stdout.write(Buffer.from([byte]));
    assert.deepEqual(await first, { order: 1 }); assert.deepEqual(await second, { order: 2 });
    assert.deepEqual(seen, [{ method: 'item/completed', params: { text: 'Ã© real bytes' } }]);
  } finally { await c.rpc.close(); }
  assert.equal(c.stopped(), 1);
});

test('external token refresh stays in memory; callback failures never serialize its diagnostic', async () => {
  const secret = 'synthetic-private-fixture-only'; let calls = 0;
  const c = channel({ onServerRequest: async ({ method, params }) => {
    assert.equal(method, 'account/chatgptAuthTokens/refresh'); assert.equal(params.previousAccountId, 'fixture-account');
    if (++calls === 2) throw Error(secret);
    return { accessToken: secret, chatgptAccountId: 'fixture-account' };
  } });
  try {
    c.write({ id: 'refresh-one', method: 'account/chatgptAuthTokens/refresh', params: { previousAccountId: 'fixture-account' } });
    await tick(); assert.equal(c.lines[0].result.accessToken, secret);
    c.write({ id: 'refresh-two', method: 'account/chatgptAuthTokens/refresh', params: { previousAccountId: 'fixture-account' } });
    await tick(); assert.equal(c.lines[1].error.code, -32000); assert(!JSON.stringify(c.lines[1]).includes(secret));
  } finally { await c.rpc.close(); }
});

test('missing approval handler refuses instead of accepting a permission or requesting user input', async () => {
  const c = channel();
  try {
    c.write({ id: 'approval', method: 'item/commandExecution/requestApproval', params: { command: 'fixture' } });
    await tick(); assert.equal(c.lines[0].id, 'approval'); assert.equal(c.lines[0].error.code, -32601);
    assert(!('result' in c.lines[0]));
  } finally { await c.rpc.close(); }
});

test('malformed protocol and provider error text are never returned in transport errors', async () => {
  for (const scenario of ['malformed', 'invalid-utf8', 'provider-error']) {
    const c = channel(), p = c.rpc.request('account/read', {}); const rejected = assert.rejects(p, error => {
      assert(failure('PROTOCOL')(error)); assert(!String(error).includes('synthetic-private')); return true;
    });
    if (scenario === 'malformed') c.child.stdout.write('synthetic-private diagnostic\n');
    else if (scenario === 'invalid-utf8') c.child.stdout.write(Buffer.from([0xff,10]));
    else c.write({ id: c.lines[0].id, error: { message: 'synthetic-private diagnostic' } });
    await rejected; await c.rpc.close(); assert.equal(c.stopped(), 1);
  }
});

test('stdout line, total bytes and stderr are bounded even without a newline', async () => {
  for (const scenario of ['line', 'total', 'stderr']) {
    const c = channel({ maxLineBytes: 256, maxReceivedBytes: 300, maxStderrBytes: 32 });
    const p = c.rpc.request('account/read', {}), rejected = assert.rejects(p, failure('OUTPUT_LIMIT'));
    if (scenario === 'stderr') c.child.stderr.write(Buffer.alloc(33, 97));
    else if (scenario === 'line') c.child.stdout.write(Buffer.alloc(257, 97));
    else { for (let i=0;i<20;i++) c.write({ method: 'progress', params: {} }); }
    await rejected; await c.rpc.close(); assert.equal(c.stopped(), 1);
  }
});

test('request timeout cancels every pending request and stops contained work once', async () => {
  const c = channel(); const first = c.rpc.request('thread/start', {}, 15), second = c.rpc.request('account/read', {}, 1000);
  await Promise.all([assert.rejects(first, failure('DEADLINE')), assert.rejects(second, failure('DEADLINE'))]);
  await c.rpc.close(); assert.equal(c.stopped(), 1);
  await assert.rejects(c.rpc.request('thread/start', {}), failure('DEADLINE'));
});

test('total deadline bounds a silent server and late refresh does not write after close', async () => {
  let finish, signal;
  const c = channel({ deadlineMs: 20, onServerRequest: (_request, value) => { signal = value; return new Promise(resolve => { finish = resolve; }); } });
  const p = c.rpc.request('thread/start', {}, 1000), rejected = assert.rejects(p, failure('DEADLINE'));
  c.write({ id: 'refresh', method: 'account/chatgptAuthTokens/refresh', params: {} });
  await rejected; assert.equal(signal.aborted, true); finish({ accessToken: 'synthetic-private-fixture-only' }); await tick();
  assert.equal(c.lines.length, 1); await c.rpc.close(); assert.equal(c.stopped(), 1);
});

test('expired refresh request returns a generic refusal within the official refresh window', async () => {
  const c = channel({ serverRequestTimeoutMs: 15, onServerRequest: () => new Promise(() => {}) });
  try {
    c.write({ id: 'expired-refresh', method: 'account/chatgptAuthTokens/refresh', params: {} });
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(c.lines[0].error.code, -32000);
  } finally { await c.rpc.close(); }
});

test('duplicate concurrent server IDs are refused and child errors stop every pending request', async () => {
  for (const scenario of ['duplicate', 'exit']) {
    const c = channel({ onServerRequest: () => new Promise(() => {}) });
    const p = c.rpc.request('thread/start', {}), rejected = assert.rejects(p, failure(scenario === 'duplicate' ? 'PROTOCOL' : 'PROCESS_EXIT'));
    if (scenario === 'duplicate') {
      c.write({ id: 'same', method: 'account/chatgptAuthTokens/refresh', params: {} });
      c.write({ id: 'same', method: 'account/chatgptAuthTokens/refresh', params: {} });
    } else c.child.emit('error', Error('synthetic-private-diagnostic'));
    await rejected; await c.rpc.close(); assert.equal(c.stopped(), 1);
  }
});

test('usage buckets retain real cached/write/reasoning semantics and unknown cost stays null', () => {
  const raw = { inputTokens: 100, cachedInputTokens: 40, cacheWriteInputTokens: 10, outputTokens: 20, reasoningOutputTokens: 15 };
  assert.deepEqual(normalizedUsage(raw), { input: 50, cacheRead: 40, cacheWrite: 10, output: 20, cost: null });
  for (const change of [{ cachedInputTokens: 101 }, { outputTokens: 10 }, { inputTokens: NaN }, { cacheWriteInputTokens: undefined }]) {
    assert.throws(() => normalizedUsage({ ...raw, ...change }));
  }
});

test('invalid configuration cannot turn a protocol or refresh bound into an unlimited wait', () => {
  for (const options of [{deadlineMs:Infinity}, {maxLineBytes:Infinity}, {maxReceivedBytes:NaN}, {maxStderrBytes:0}, {serverRequestTimeoutMs:9000}]) {
    assert.throws(() => channel(options), /finite|Finite|eight seconds/);
  }
});
