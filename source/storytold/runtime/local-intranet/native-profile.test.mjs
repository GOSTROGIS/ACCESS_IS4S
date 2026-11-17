import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { nativeEnvironment, productNativeEnvironment } from './native-profile.mjs';
import { runtimeDigest } from './runtime-state.mjs';

test('native updates share the exact preserved portable PDF profile without changing the signed core', async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'native-profile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = { kind: 'native', id: 'pdfcraft', version: '0.21.1' };
  const old = join(root, 'Storytold/native/apps/pdfcraft/0.21.1');
  const next = join(root, 'Storytold/native/apps/pdfcraft/0.22.0');
  await mkdir(join(old, 'PdfCraftData'), { recursive: true });
  await mkdir(next, { recursive: true });
  await writeFile(join(old, 'pdfcraft.exe'), 'signed core');
  await writeFile(join(old, 'PdfCraftData/settings.ron'), 'original preferences');
  const original = await runtimeDigest(old, app);
  const options = { localAppData: join(root, 'private') };
  await nativeEnvironment(root, app, app.version, options);
  const profile = await realpath(join(old, 'PdfCraftData'));
  assert.equal(await readFile(join(profile, 'settings.ron'), 'utf8'), 'original preferences');
  await writeFile(join(profile, 'settings.ron'), 'edited preferences');
  await nativeEnvironment(root, app, '0.22.0', options);
  assert.equal(await realpath(join(next, 'PdfCraftData')), profile);
  assert.equal(await readFile(join(next, 'PdfCraftData/settings.ron'), 'utf8'), 'edited preferences');
  assert.equal(await runtimeDigest(old, app), original);
  await writeFile(join(old, 'pdfcraft.exe'), 'altered core');
  assert.notEqual(await runtimeDigest(old, app), original);
});

test('owned document runtimes retain separate persistent product profiles', async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'native-profile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = { localAppData: join(root, 'private') };
  const access = await productNativeEnvironment(root, 'access', 'wordcraft', options);
  const slip = await productNativeEnvironment(root, 'slipcurve', 'wordcraft', options);
  assert.notEqual(access.WORDCRAFT_PROFILE_DIR, slip.WORDCRAFT_PROFILE_DIR);
  await writeFile(join(access.WORDCRAFT_PROFILE_DIR, 'ui.json'), 'access preferences');
  await writeFile(join(slip.WORDCRAFT_PROFILE_DIR, 'ui.json'), 'slipcurve preferences');
  const reopened = await productNativeEnvironment(root, 'access', 'wordcraft', options);
  assert.equal(await readFile(join(reopened.WORDCRAFT_PROFILE_DIR, 'ui.json'), 'utf8'), 'access preferences');
  assert.equal(await readFile(join(slip.WORDCRAFT_PROFILE_DIR, 'ui.json'), 'utf8'), 'slipcurve preferences');
  await assert.rejects(productNativeEnvironment(root, '../other', 'wordcraft', options));
  await assert.rejects(productNativeEnvironment(root, 'access', '../wordcraft', options));
});
