import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { consultingPaths } from './consulting-edition.mjs';
import { activeRuntime, runtimeTree, versionedWebApps } from './runtime-state.mjs';

const home = dirname(fileURLToPath(import.meta.url));
const address = '127.0.0.1';
const portalPort = 4180;
const portalFiles = new Set(['index.html', 'portal.css', 'portal.mjs']);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
};

function inside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

function response(res, status, body = '') {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(body);
}

function requestPath(url) {
  const raw = url.split('?', 1)[0];
  if (!raw.startsWith('/') || raw.startsWith('//')) throw new Error('Invalid request target');
  const path = decodeURIComponent(raw);
  const segments = path.split('/').slice(1);
  if (segments.some(segment => segment.startsWith('.') || /[\\:\u0000-\u001f\u007f<>|*?]/u.test(segment))) {
    throw new Error('Invalid path segment');
  }
  return { raw, segments: segments.filter(Boolean), trailing: path.endsWith('/') };
}

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !size) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  return { start, end };
}

async function fileResponse(req, res, root, segments, path, directoryRoot = false, boundary = home) {
  let target;
  let info;
  try {
    const realRoot = await realpath(root);
    if (!inside(boundary, realRoot) || relative(root, realRoot) !== '') return response(res, 404, 'File not found');
    const requested = join(realRoot, ...segments);
    target = await realpath(requested);
    if (!inside(realRoot, target) || relative(requested, target) !== '') return response(res, 404, 'File not found');
    info = await stat(target);
    if (info.isDirectory()) {
      if (!path.trailing && (segments.length || directoryRoot)) {
        const query = req.url.slice(path.raw.length);
        return res.writeHead(308, { Location: `${path.raw}/${query}` }).end();
      }
      const index = join(target, 'index.html');
      target = await realpath(index);
      if (!inside(realRoot, target) || relative(index, target) !== '') return response(res, 404, 'File not found');
      info = await stat(target);
    }
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code)) return response(res, 404, 'File not found');
    throw error;
  }
  if (!info.isFile()) return response(res, 404, 'File not found');

  const headers = {
    'Content-Type': types[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Accept-Ranges': 'bytes',
  };
  let range;
  if (req.headers.range) {
    range = byteRange(req.headers.range, info.size);
    if (!range) return res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
    headers['Content-Length'] = range.end - range.start + 1;
  }
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();
  const body = createReadStream(target, range);
  body.on('error', () => res.destroy());
  res.on('close', () => body.destroy());
  body.pipe(res);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function installedApps() {
  const { apps } = await readJson(join(home, 'installed-web.json'));
  const ports = new Set();
  const ids = new Set();
  for (const { id, version, port } of apps) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !/^v[0-9][a-z0-9.-]*$/.test(version) ||
        !Number.isInteger(port) || port < 4190 || port > 4299 || ports.has(port) || ids.has(id)) {
      throw new Error('Invalid or duplicate installed application mapping');
    }
    ports.add(port);
    ids.add(id);
  }
  return apps;
}

function server(port, serve) {
  const endpoint = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.headers.host !== `${address}:${port || endpoint.address().port}`) return response(res, 421, 'Use the intranet loopback URL');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return response(res, 405, 'Method not allowed');
    }
    let path;
    try { path = requestPath(req.url); } catch { return response(res, 400, 'Invalid path'); }
    try {
      await serve(req, res, path);
    } catch (error) {
      process.stderr.write(`Intranet read failed (${error.code || error.name})\n`);
      if (res.headersSent) res.destroy();
      else response(res, 500, 'Intranet read failed');
    }
  });
  return endpoint;
}

function json(req, res, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': bytes.length });
  return res.end(req.method === 'HEAD' ? undefined : bytes);
}

function listen(port, endpoint) {
  return new Promise((yes, no) => {
    endpoint.once('error', no);
    endpoint.listen(port, address, () => {
      endpoint.off('error', no);
      yes();
    });
  });
}

export async function serveCandidate(root, app) {
  const endpoint = editionServer(root, { ...app, port: 0 }, () => ({ version: app.version, retained: [] }), () => root);
  await listen(0, endpoint);
  return {
    url: `http://${address}:${endpoint.address().port}/`,
    close: async () => new Promise((resolve, reject) => endpoint.close(error => error ? reject(error) : resolve())),
  };
}

export function runtimeServer(home, app) {
  const target = { ...app, kind: 'web' };
  return editionServer(home, app, () => activeRuntime(home, target), version => runtimeTree(home, target, version));
}

function editionServer(home, app, readActive, resolveTree) {
  return server(app.port, async (req, res, path) => {
    const active = await readActive();
    let { version } = active;
    let { segments } = path;
    let edition = false;
    if (versionedWebApps.has(app.id)) {
      if (segments[0] === '_edition') {
        edition = true;
        version = segments[1];
        segments = segments.slice(2);
      } else if (!segments.length || ['index.html', 'access-workspace', 'access-workspace/index.html'].includes(segments.join('/'))) {
        const directory = segments.join('/') === 'access-workspace' && !path.trailing ? '/' : '';
        const targetPath = `/_edition/${version}${path.raw}${directory}${req.url.slice(path.raw.length)}`;
        return res.writeHead(307, { Location: targetPath }).end();
      } else if (req.headers.referer) {
        // Older builds can request assets from the origin root. Use the edition
        // of the same-origin page that requested them when it is available.
        try {
          const referer = new URL(req.headers.referer);
          const match = /^\/_edition\/([^/]+)\//.exec(referer.pathname);
          if (referer.origin === `http://${req.headers.host}` && match) version = match[1];
        } catch {
          // Ignore a malformed Referer on a direct asset request.
        }
      }
      if (version !== active.version && !active.retained.includes(version)) return response(res, 404, 'Runtime version not found');
      res.setHeader('Referrer-Policy', 'same-origin');
    }
    res.setHeader('X-Intranet-Runtime', version);
    return fileResponse(req, res, resolveTree(version), segments, path, edition, home);
  });
}

async function existingPortal(url, installation) {
  try {
    const response = await fetch(`${url}health.json`, { signal: AbortSignal.timeout(1000) });
    return response.ok && (await response.json()).installation === installation;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (!process.argv.includes('--open') || process.platform !== 'win32') return;
  const opener = spawn(join(process.env.SystemRoot, 'System32', 'rundll32.exe'), ['url.dll,FileProtocolHandler', url], {
    stdio: 'ignore', detached: true, windowsHide: true,
  });
  opener.on('error', () => console.log(`Open ${url} in your browser.`));
  opener.unref();
}

async function startSlipcurve() {
  if (!process.argv.includes('--start-slipcurve')) return;
  try {
    const probe = await fetch('http://127.0.0.1:4184/server-account.html', { signal: AbortSignal.timeout(1000) });
    if (probe.ok) return;
  } catch {
    // The installed service has not started yet.
  }
  const root = join(home, 'SLIPCURVE');
  const entry = join(root, 'serve.py');
  if (!(await stat(entry).catch(() => null))?.isFile()) return;
  const child = spawn(join(root, 'runtime', 'python.exe'), ['-I', '-B', entry, '--port', '4184'], {
    cwd: root, stdio: 'inherit', windowsHide: true,
  });
  child.on('error', error => console.error(`SLIPCURVE could not start (${error.code || error.name})`));
  const stop = () => { if (child.exitCode === null) child.kill(); };
  process.once('exit', stop);
  child.once('exit', () => process.off('exit', stop));
}

async function main() {
  const apps = await installedApps();
  const consulting = await consultingPaths(join(home, 'CONSULTING')).catch(error => {
    if (error.code !== 'ENOENT') console.error(`CONSULTING release unavailable (${error.code || error.name})`);
    return null;
  });
  const url = `http://${address}:${portalPort}/`;
  const installation = createHash('sha256').update(home).update(JSON.stringify(apps)).digest('hex');
  if (await existingPortal(url, installation)) {
    console.log(`Intranet is already running at ${url}`);
    openBrowser(url);
    return;
  }
  const services = new Map([[portalPort, server(portalPort, async (req, res, path) => {
    const [first, ...remaining] = path.segments;
    if (first === 'applications.json' && !remaining.length) {
      let native = [];
      try {
        const manifest = await readJson(join(home, 'Storytold', 'native', 'native-apps.json'));
        native = await Promise.all(manifest.apps.map(async ({ id, label, version, status }) => ({
          id, label, version: (await activeRuntime(home, { kind: 'native', id, version })).version, status,
        })));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const active = await Promise.all(apps.map(async app => ({
        ...app, version: (await activeRuntime(home, { ...app, kind: 'web' })).version,
      })));
      return json(req, res, { apps: active, native });
    }
    if (first === 'health.json' && !remaining.length) {
      return json(req, res, { service: 'access-is4s-folder-intranet', installation, apps: apps.length,
        consultingRevision: consulting?.revision ?? null });
    }
    if (first === 'ACCESS_IS4S') return fileResponse(req, res, join(home, 'ACCESS_IS4S'), remaining, path, true);
    if (first === 'CONSULTING' && consulting) return fileResponse(req, res, consulting.site, remaining, path, true);
    if (first === 'CONSULTING') return response(res, 503, 'CONSULTING release unavailable');
    if (!first || (!remaining.length && portalFiles.has(first))) {
      res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      return fileResponse(req, res, home, [first ?? 'index.html'], path);
    }
    return response(res, 404, 'File not found');
  })]]);
  for (const app of apps) services.set(app.port, runtimeServer(home, app));
  try {
    for (const [port, endpoint] of services) await listen(port, endpoint);
  } catch (error) {
    for (const endpoint of services.values()) endpoint.close();
    throw error;
  }

  await startSlipcurve();
  console.log(`Intranet is ready at ${url}`);
  openBrowser(url);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(`Could not start the intranet: ${error.message}`);
    process.exitCode = 1;
  });
}
