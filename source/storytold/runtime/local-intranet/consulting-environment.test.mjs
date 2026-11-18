import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join } from 'node:path';
import test from 'node:test';
import { executionEnvironment } from './consulting-release.mjs';

test('isolated Python publication child resolves the exact running Node without an inherited Node PATH', () => {
  const requested = process.env.CONSULTING_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const python = execFileSync(requested, ['-I', '-B', '-c', 'import sys;print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  assert.ok(isAbsolute(python));
  const temporaryRoot = realpathSync(tmpdir());
  const folder = mkdtempSync(join(temporaryRoot, 'consulting-runtime-env-'));
  try {
    const base = executionEnvironment({ PATH: '' });
    const probe = 'import json,subprocess; p=subprocess.run(["node","-p","process.execPath"],capture_output=True,text=True,check=True);print(json.dumps(p.stdout.strip()))';
    assert.throws(() => execFileSync(python, ['-I', '-B', '-c', probe], { cwd: folder, env: { ...base, PATH: '' }, stdio: 'pipe', windowsHide: true }));
    const actual = JSON.parse(execFileSync(python, ['-I', '-B', '-c', probe], { cwd: folder, env: base, encoding: 'utf8', windowsHide: true }));
    assert.equal(actual.toLowerCase(), process.execPath.toLowerCase());
    assert.equal(base.PATH.split(delimiter)[0], dirname(process.execPath));
  } finally {
    const actual = realpathSync(folder);
    assert.equal(dirname(actual), temporaryRoot);
    assert.ok(basename(actual).startsWith('consulting-runtime-env-'));
    rmSync(actual, { recursive: true, force: true });
  }
});

test('runtime PATH binding preserves explicit tool paths without admitting unrelated secrets or injection variables', () => {
  const values = ['OPENAI_API_KEY', 'GH_TOKEN', 'NODE_OPTIONS', 'PYTHONPATH', 'GIT_CONFIG_COUNT'];
  const saved = new Map(values.map(name => [name, process.env[name]]));
  try {
    for (const name of values) process.env[name] = 'must-not-reach-project-commands';
    const extra = join(tmpdir(), 'explicit-approved-tool-bin');
    const environment = executionEnvironment({ PATH: extra });
    assert.deepEqual(environment.PATH.split(delimiter), [dirname(process.execPath), extra]);
    for (const name of values) assert.equal(environment[name], undefined);
  } finally {
    for (const [name, value] of saved) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
