import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeLogin, validateNativeHandoff } from './native-login.mjs';

test('native handoffs accept only the fixed product origin, path, one-use code and short expiry', () => {
  const now = Date.now(), code = 'a'.repeat(43);
  const valid = { url: `http://127.0.0.2:8993/auth/native#${code}`, expiresAt: new Date(now + 60000).toISOString() };
  assert.equal(validateNativeHandoff('access', valid, now), valid.url);
  assert.throws(() => validateNativeHandoff('slipcurve', valid, now));
  assert.throws(() => validateNativeHandoff('__proto__', valid, now));
  for (const url of [
    `http://127.0.0.1:8993/auth/native#${code}`, `http://127.0.0.3:8994/auth/native#${code}`,
    `https://outside.invalid/auth/native#${code}`, `http://user:secret@127.0.0.2:8993/auth/native#${code}`,
    `http://127.0.0.2:8993/other#${code}`, `http://127.0.0.2:8993/auth/native?return_to=https://outside.invalid#${code}`,
    'http://127.0.0.2:8993/auth/native#short',
  ]) assert.throws(() => validateNativeHandoff('access', { ...valid, url }, now));
  for (const expiresAt of [undefined, 'invalid', new Date(now).toISOString(), new Date(now + 66000).toISOString()]) {
    assert.throws(() => validateNativeHandoff('access', { ...valid, expiresAt }, now));
  }
});

test('unknown products and missing protected owner pins fail before any native credential lookup', async () => {
  const issue = async () => { throw Error('must not reach native issuer'); };
  await assert.rejects(nativeLogin({ product: 'unknown', configuration: {}, issue }), /Unknown native product/);
  await assert.rejects(nativeLogin({ product: 'access', configuration: {}, issue }), /protected native owner pin/);
});
