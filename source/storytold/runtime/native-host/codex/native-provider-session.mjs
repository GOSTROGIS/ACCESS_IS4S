/** Private draft: inspect the current real native operator session without emitting credentials. */
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const digest = value => createHash('sha256').update(value).digest('hex');
const products = new Set(['access', 'slipcurve']);
const sha = /^[a-f0-9]{64}$/;

export async function nativeProviderSession({ product, runtimeRoot, dataRoot, bridge, expectedSessionSha256 }, inherited = process.env) {
  if (process.platform !== 'linux' || !products.has(product) || !isAbsolute(bridge || '') ||
      expectedSessionSha256 !== undefined && (typeof expectedSessionSha256 !== 'string' || !sha.test(expectedSessionSha256))) {
    throw Error('The current native operator session is unavailable.');
  }
  const entry = await lstat(bridge);
  if (!entry.isFile() || entry.isSymbolicLink() || await realpath(bridge) !== resolve(bridge) ||
      entry.uid !== process.getuid() || entry.mode & 0o077) throw Error('The native session adapter is unavailable.');
  const { nativeGhEnvironment } = await import(pathToFileURL(bridge));
  // This existing adapter verifies the real production binding, product, owner,
  // operator role, expiry, sealed token and private data placement. No CLI starts.
  const environment = await nativeGhEnvironment({ product, runtimeRoot, dataRoot }, inherited);
  delete environment.GH_TOKEN;
  const runtime = await realpath(runtimeRoot);
  const { loadConfig } = await import(pathToFileURL(join(runtime, 'src/dash/server/config.ts')));
  const { nativeOwner } = await import(pathToFileURL(join(runtime, 'src/dash/server/native-signin.ts')));
  const pin = nativeOwner(loadConfig(inherited));
  const db = new DatabaseSync(inherited.AUTOCRAFT_DB, { readOnly: true });
  try {
    const row = db.prepare(`SELECT s.id_hash,s.login,a.role,a.github_id
      FROM settings b JOIN sessions s ON s.id_hash=b.value JOIN access a ON a.login=s.login
      WHERE b.key=?`).get('native_cli_session.' + product);
    if (!row || !sha.test(row.id_hash) || pin?.product !== product || row.role !== 'operator' ||
        row.github_id !== pin.githubId || row.login.toLowerCase() !== pin.login.toLowerCase() ||
        expectedSessionSha256 !== undefined && row.id_hash !== expectedSessionSha256) {
      throw Error('The current native operator session changed.');
    }
    // A logout or session replacement during inspection must fail the same real
    // adapter check before any authorization receipt leaves this process.
    const finalEnvironment = await nativeGhEnvironment({ product, runtimeRoot, dataRoot }, inherited);
    delete finalEnvironment.GH_TOKEN;
    const current = db.prepare('SELECT value FROM settings WHERE key=?').get('native_cli_session.' + product);
    if (current?.value !== row.id_hash) throw Error('The current native operator session changed.');
    return { authorized: true, product, sessionSha256: row.id_hash, githubId: row.github_id,
      loginSha256: digest(row.login.toLowerCase()), verifiedAt: Date.now() };
  } finally {
    db.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 8 || args[0] !== '--product' || args[2] !== '--runtime-root' ||
      args[4] !== '--data-root' || args[6] !== '--bridge') throw Error('Invalid fixed native session probe.');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 4096) throw Error('Invalid native session request.');
    chunks.push(chunk);
  }
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).some(key => key !== 'expectedSessionSha256')) throw Error('Invalid native session request.');
  const proof = await nativeProviderSession({ product: args[1], runtimeRoot: args[3], dataRoot: args[5], bridge: args[7],
    expectedSessionSha256: request.expectedSessionSha256 });
  process.stdout.write(JSON.stringify(proof) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  process.stderr.write('The current verified native operator session is required.\n');
  process.exitCode = 1;
});
