import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installedVariants, slipcurveFilmVariant, validateVariants } from './intranet.mjs';

test('only the pinned owner variant, fixed port and original API identity are permitted', () => {
  const manifest = { schema: 1, apps: [{ ...slipcurveFilmVariant }] };
  assert.deepEqual(validateVariants(manifest), manifest.apps);
  for (const patch of [{ port: 4191 }, { port: 80 }, { id: '../private' }, { sourceApplication: 'other' },
    { version: 'v0.20.2' }, { artifactSha256: '0'.repeat(64) }, { extra: 'unknown' }]) {
    assert.throws(() => validateVariants({ schema: 1, apps: [{ ...slipcurveFilmVariant, ...patch }] }));
  }
  for (const manifest of [null, {}, { schema: 2, apps: [slipcurveFilmVariant] }, { schema: 1, apps: [] },
    { schema: 1, apps: [slipcurveFilmVariant, slipcurveFilmVariant] }]) assert.throws(() => validateVariants(manifest));
});

test('absent optional variant registry preserves normal hosting; present invalid data is refused', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'intranet-variant-test-')));
  try {
    assert.deepEqual(await installedVariants(root), []);
    await writeFile(join(root, 'installed-variants.json'), '{"schema":1,"apps":[]}');
    await assert.rejects(installedVariants(root), /Invalid installed variant mapping/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
