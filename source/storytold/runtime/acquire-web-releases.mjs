import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { createMessage, readKey, readSignature, verify } from 'openpgp';

const run = promisify(execFile);
const targetsFile = new URL('./app-targets.json', import.meta.url);
const assetLimit = 128 * 1024 * 1024;
const metadataLimit = 1024 * 1024;

function releaseFiles(target) {
  const pin = target.releaseArtifact;
  if (pin.name !== target.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.id) ||
      !/^v\d+\.\d+\.\d+$/.test(pin.tag) || !/^[0-9a-f]{64}$/.test(pin.sha256Expected) ||
      !/^[0-9A-F]{40}$/.test(pin.signingKeyFingerprint) ||
      !Number.isSafeInteger(pin.bytes) || pin.bytes <= 0 || pin.bytes > assetLimit) {
    throw new Error('Missing or invalid release pin');
  }
  const zip = basename(pin.zipUrl);
  const files = ['SHA256SUMS.txt', 'SHA256SUMS.txt.asc', 'release-signing-key.asc', zip];
  const base = `https://github.com/storytold/${target.id}/releases/download/${pin.tag}/`;
  const urls = [pin.checksumUrl, pin.signatureUrl, pin.keyUrl, pin.zipUrl];
  if (!/^[a-z0-9-]+-web-\d+\.\d+\.\d+\.zip$/.test(zip) ||
      urls.some((url, index) => url !== base + files[index])) {
    throw new Error('Unexpected upstream asset URL');
  }
  return { files, urls, zip };
}

export async function download(url, destination, maxBytes) {
  // Keep normal TLS validation and prevent release redirects to another protocol.
  await run('curl', ['--disable', '--fail', '--silent', '--show-error', '--location', '--max-redirs', '5',
    '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '20', '--max-time', '300',
    '--max-filesize', String(maxBytes), '--output', destination, url]);
  if ((await stat(destination)).size > maxBytes) throw new Error('Release asset exceeds its size limit');
}

export async function signedChecksum(directory, files, asset, fingerprint) {
  const [checksums, signature, key] = await Promise.all([
    readFile(join(directory, files[0])),
    readFile(join(directory, files[1]), 'utf8').then(armoredSignature => readSignature({ armoredSignature })),
    readFile(join(directory, files[2]), 'utf8').then(armoredKey => readKey({ armoredKey })),
  ]);
  const { signatures } = await verify({ message: await createMessage({ binary: checksums }), signature, verificationKeys: key });
  if (!signatures.length) throw new Error('Release manifest is unsigned');
  await Promise.all(signatures.map(result => result.verified));
  const signerMatches = signatures.some(result => key.getKeys(result.keyID).some(signer =>
    signer.getFingerprint().toUpperCase() === fingerprint));
  if (!signerMatches) throw new Error('Release manifest signer differs from the checked-in pin');

  const entries = checksums.toString('utf8').split(/\r?\n/).flatMap(line => {
    const entry = /^([a-f0-9]{64})\s+\*?(?:\.\/)?(\S+)\s*$/i.exec(line);
    return entry?.[2] === asset ? [entry[1].toLowerCase()] : [];
  });
  if (entries.length !== 1) throw new Error('Release manifest must sign exactly one checksum for the asset');
  return entries[0];
}

export async function verifyArchive(directory, files, zip, pin) {
  if (await signedChecksum(directory, files, zip, pin.signingKeyFingerprint) !== pin.sha256Expected) {
    throw new Error('Signed checksum differs from the checked-in ZIP pin');
  }

  const zipPath = join(directory, zip);
  if ((await stat(zipPath)).size !== pin.bytes) throw new Error('Downloaded ZIP size differs from the pin');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(zipPath)) hash.update(chunk);
  if (hash.digest('hex') !== pin.sha256Expected) throw new Error('Downloaded ZIP checksum differs from the pin');
}

async function acquire(target, directory) {
  const pin = target.releaseArtifact;
  const { files, urls, zip } = releaseFiles(target);
  const parent = join(directory, target.id);
  const release = join(parent, pin.tag);
  await mkdir(parent, { recursive: true });
  if (await stat(release).catch(error => { if (error.code !== 'ENOENT') throw error; })) {
    // Reverify cached releases before reusing their bytes.
    await verifyArchive(release, files, zip, pin);
  } else {
    const temporary = await mkdtemp(join(parent, '.acquire-'));
    try {
      for (const [index, url] of urls.entries()) {
        await download(url, join(temporary, files[index]), index === 3 ? pin.bytes : metadataLimit);
      }
      await verifyArchive(temporary, files, zip, pin);
      try {
        await rename(temporary, release);
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
        await verifyArchive(release, files, zip, pin);
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  console.log(`Verified ${target.id} ${pin.tag} ${pin.sha256Expected}`);
  return {
    name: target.id, tag: pin.tag, releaseUrl: pin.releaseUrl, zipUrl: pin.zipUrl,
    zipPath: join(release, zip), bytes: pin.bytes, sha256Expected: pin.sha256Expected,
    sha256Actual: pin.sha256Expected, signingKeyFingerprint: pin.signingKeyFingerprint,
    identityVerification: 'Verified the detached manifest signature against the checked-in signing fingerprint and ZIP SHA-256.',
    status: 'checksum-and-signature-verified',
  };
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { only: { type: 'string', multiple: true } } });
  if (positionals.length !== 1) throw new Error('Usage: node acquire-web-releases.mjs CACHE_DIRECTORY [--only APP_ID]');
  const directory = resolve(positionals[0]);
  const { targets } = JSON.parse(await readFile(targetsFile, 'utf8'));
  const selected = values.only ? targets.filter(target => values.only.includes(target.id)) : targets;
  if (values.only?.some(id => !selected.some(target => target.id === id))) throw new Error('Unknown application ID');
  const webTargets = selected.filter(target => target.releaseArtifact?.zipUrl);
  if (!webTargets.length) throw new Error('No pinned browser releases selected');
  const assets = [];
  for (let offset = 0; offset < webTargets.length; offset += 4) {
    const results = await Promise.allSettled(webTargets.slice(offset, offset + 4).map(target => acquire(target, directory)));
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        throw new Error(`${webTargets[offset + index].id}: ${result.reason.message}`);
      }
      assets.push(result.value);
    }
  }
  for (const target of selected.filter(target => !target.releaseArtifact?.zipUrl)) {
    assets.push({ name: target.id, status: 'no-pinned-web-zip', reason: 'Use the source build or native/service entry in app-targets.json.' });
  }
  const manifest = join(directory, 'web-assets-manifest.json');
  const temp = await mkdtemp(join(directory, '.manifest-'));
  try {
    await writeFile(join(temp, basename(manifest)), `${JSON.stringify({ assets }, null, 2)}\n`);
    await rename(join(temp, basename(manifest)), manifest);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  console.log(manifest);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
