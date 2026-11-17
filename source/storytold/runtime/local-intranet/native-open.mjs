import { spawn } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeRuntime, runtimeTree } from './runtime-state.mjs';
import { nativeEnvironment } from './native-profile.mjs';

const root = dirname(fileURLToPath(import.meta.url));
try {
  const uri = new URL(process.argv[2]);
  const id = uri.pathname.slice(1);
  if (uri.protocol !== 'slipcurve-app:' || uri.hostname !== 'open' || uri.username || uri.password || uri.port ||
      uri.search || uri.hash || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || process.argv.length !== 3) throw Error('Invalid application link');
  if (id === 'autocraft') {
    const program = join(process.env.SystemRoot, 'System32', 'rundll32.exe');
    const child = spawn(program, ['url.dll,FileProtocolHandler', 'http://127.0.0.1:8993/'], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } else {
    const { apps } = JSON.parse(await readFile(join(root, 'Storytold/native/native-apps.json'), 'utf8'));
    const app = apps.find(app => app.id === id);
    if (!app) throw Error('Application is not installed');
    const native = join(root, 'Storytold/native');
    const original = join(native, app.executable);
    if (relative(native, original).startsWith('..') || relative(original, await realpath(original))) throw Error('Redirected executable');
    const active = await activeRuntime(root, { ...app, kind: 'native' });
    const executable = active.version === app.version ? original : join(runtimeTree(root, { ...app, kind: 'native' }, active.version), original.split(/[\\/]/).at(-1));
    const env = await nativeEnvironment(root, app, active.version);
    const child = spawn(executable, [], { cwd: dirname(executable), env, detached: true, stdio: 'ignore' });
    await new Promise((accept, reject) => { child.once('spawn', accept); child.once('error', reject); });
    child.unref();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
