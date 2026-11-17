import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consultingPaths } from './consulting-edition.mjs';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--offline')) throw Error('Use --offline to disable live sources');
const root = resolve(fileURLToPath(new URL('./CONSULTING/', import.meta.url)));
const { site, mcp } = await consultingPaths(root);
const child = spawn(process.execPath, [join(mcp, 'server.mjs'), '--local', '--root', site, ...args], { stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.once('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
