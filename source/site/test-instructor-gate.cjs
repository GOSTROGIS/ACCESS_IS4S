'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../../brand/instructor-gate.js'), 'utf8');
const hashPattern = /var CODE_HASH = '[a-f0-9]{64}';/;
assert.ok(hashPattern.test(source), 'Expected one SHA-256 configuration');

function load(script, crypto) {
  const context = { window: { crypto }, document: {}, TextEncoder, Uint8Array, Promise };
  vm.runInNewContext(script, context);
  return context.window.ACCESSInstructorGate;
}

async function check(script, code) {
  for (const crypto of [webcrypto, undefined, { subtle: { digest: () => Promise.reject(new Error('Unavailable')) } }]) {
    const gate = load(script, crypto);
    assert.equal(await gate.checkCode(code), true, 'Expected code must unlock in every crypto mode');
    assert.equal(gate.isUnlocked(), false, 'Checking a code alone must not unlock the session');
    for (const invalid of ['', '1', '12', '1234', 'abc', ' 12', '１２３', null, undefined, 123]) {
      assert.equal(await gate.checkCode(invalid), false, 'Malformed code must not unlock');
    }
    const wrong = String((Number(code) + 1) % 1000).padStart(3, '0');
    assert.equal(await gate.checkCode(wrong), false, 'Wrong code must not unlock');
  }
}

(async () => {
  // Synthetic values exercise leading zeroes and all three hashing paths without
  // publishing the instructor code in the repository or test output.
  for (const code of ['007', '137', '999']) {
    const hash = createHash('sha256').update('access-is4s-instructor:' + code).digest('hex');
    await check(source.replace(hashPattern, `var CODE_HASH = '${hash}';`), code);
  }
  // Supply the expected code privately when validating a configuration change.
  const expected = process.env.IS4S_INSTRUCTOR_CODE;
  if (expected !== undefined) {
    assert.ok(/^\d{3}$/.test(expected), 'Expected code must contain exactly three digits');
    await check(source, expected);
    console.log('PASS: configured instructor code, incorrect and malformed codes, and all crypto modes');
  } else {
    console.log('PASS: synthetic instructor-code regression tests (configured-code check not requested)');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
