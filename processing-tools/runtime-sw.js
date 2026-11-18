'use strict';
// An installed editor requests its original WASM URL. Expand only this site's
// own packed modules. Documents and external requests never pass through here.
const scope = new URL(self.registration.scope);
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== scope.origin ||
      !url.pathname.startsWith(scope.pathname + 'apps/') || !url.pathname.endsWith('.wasm')) return;
  event.respondWith((async () => {
    url.pathname += '.gz.bin';
    const packed = await fetch(url);
    if (!packed.ok || !packed.body) return new Response('Editor module unavailable.', {status:502});
    return new Response(packed.body.pipeThrough(new DecompressionStream('gzip')), {
      headers:{'Content-Type':'application/wasm','X-Content-Type-Options':'nosniff'}
    });
  })());
});
