import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { consultingPaths } from './consulting-edition.mjs';

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const portArgument = portFlag < 0 ? '4183' : args[portFlag + 1];
const port = Number(portArgument);
if (!/^\d+$/.test(portArgument ?? '') || port < 1 || port > 65535) throw new Error('Invalid local port');

const bindAddress = '127.0.0.1';
const expectedHost = `${bindAddress}:${port}`;
const origin = `http://${expectedHost}`;
const mount = '/CONSULTING/';
const rootFlag = args.indexOf('--root');
const folder = rootFlag < 0 ? fileURLToPath(new URL('./CONSULTING/', import.meta.url)) : path.resolve(args[rootFlag + 1]);
const { site: root } = await consultingPaths(path.resolve(folder));

const mimeTypes = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.gz': 'application/gzip',
  '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
}));

function inside(location) {
  const relative = path.relative(root, location);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

const server = createServer(async (request, response) => {
  const reply = (status, message, headers = {}) => {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
    response.end(request.method === 'HEAD' ? undefined : message);
  };
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (request.headers.host !== expectedHost || (request.headers.origin && request.headers.origin !== origin)) {
    return reply(403, 'Forbidden');
  }
  if (!['GET', 'HEAD'].includes(request.method)) return reply(405, 'Method not allowed', { Allow: 'GET, HEAD' });

  const target = request.url ?? '';
  if (!target.startsWith('/') || target.startsWith('//')) return reply(400, 'Invalid request path');
  let pathname;
  try {
    pathname = decodeURIComponent(target.split('?')[0]);
  } catch {
    return reply(400, 'Invalid request path');
  }
  if (/[\0\\:]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) {
    return reply(403, 'Forbidden');
  }
  if (pathname === '/' || pathname === mount.slice(0, -1)) return reply(302, '', { Location: mount });
  if (!pathname.startsWith(mount)) return reply(404, 'Not found');

  try {
    let file = path.resolve(root, `.${pathname.slice(mount.length - 1)}`);
    if (!inside(file)) return reply(403, 'Forbidden');
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) return reply(302, '', { Location: `${encodeURI(pathname)}/` });
      file = path.join(file, 'index.html');
    }
    file = await realpath(file);
    if (!inside(file)) return reply(403, 'Forbidden');
    const info = await stat(file);
    if (!info.isFile()) return reply(404, 'Not found');
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream',
      'Content-Length': info.size,
    });
    if (request.method === 'HEAD') response.end();
    else await pipeline(createReadStream(file), response);
  } catch (error) {
    if (response.headersSent) response.destroy();
    else if (error.code === 'ENOENT' || error.code === 'ENOTDIR') reply(404, 'Not found');
    else if (error.code === 'EACCES' || error.code === 'EPERM') reply(403, 'Forbidden');
    else reply(500, 'Unable to serve this file');
  }
});

server.on('error', error => {
  console.error(`CONSULTING could not start on ${expectedHost} (${error.code}).`);
  process.exitCode = 1;
});

server.listen(port, bindAddress, () => {
  const url = `${origin}${mount}`;
  console.log(`Landbraid Consulting: ${url}`);
  console.log('Keep this window open while using the application. Ctrl+C stops it.');
  if (args.includes('--open')) {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, error => {
      if (error) console.error(`Open ${url} in your browser.`);
    });
  }
});
