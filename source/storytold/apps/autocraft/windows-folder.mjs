import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { windowsSecretAcl } from './src/dash/server/windows-secret-acl.ts';
import { preparePrivateDirectory, privateDirectory } from './folder-state.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const privateDir = privateDirectory();
const defaultSecrets = join(privateDir, 'secrets.json');
const callback = 'http://127.0.0.1:8993';
const [mode, ...args] = process.argv.slice(2);

try {
  await preparePrivateDirectory(root, privateDir);
  if (mode === 'protect') {
    windowsSecretAcl('ProtectDirectory', privateDir);
    console.log(privateDir);
  } else if (mode === 'private-dir') {
    console.log(privateDir);
  } else {
    windowsSecretAcl('CheckDirectory', privateDir);
    const env = {
      ...process.env,
      AUTOCRAFT_BASE_URL: callback,
      AUTOCRAFT_LISTEN: '127.0.0.1:8993',
      AUTOCRAFT_DEV_AUTH: '0',
      AUTOCRAFT_TRUST_PROXY: '0',
      AUTOCRAFT_DB: process.env.AUTOCRAFT_DB || join(privateDir, 'mirror.db'),
      AUTOCRAFT_SECRETS_FILE: process.env.AUTOCRAFT_SECRETS_FILE || defaultSecrets,
      AUTOCRAFT_LOCK_DIR: process.env.AUTOCRAFT_LOCK_DIR || join(privateDir, 'locks'),
      AUTOCRAFT_RUNNER_LOGS: process.env.AUTOCRAFT_RUNNER_LOGS || join(privateDir, 'logs'),
    };
    const command = mode === 'dashboard' ? ['dash', 'serve'] : args;
    const child = spawn(process.execPath, [join(root, 'src', 'cli.ts'), ...command], { cwd: root, env, stdio: 'inherit' });
    child.on('error', () => { process.exitCode = 1; console.error('Could not start AutoCraft.'); });
    child.on('exit', (code) => { process.exitCode = code ?? 1; });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
