// Installed by the motion editor's own offline worker. Its cache includes the
// original WASM response, even though Pages stores the module as gzip bytes.
async function motionAsset(request) {
  const url = new URL(request.url);
  if (!url.pathname.endsWith('.wasm')) return fetch(request);
  url.pathname += '.gz.bin';
  const packed = await fetch(url, {cache:request.cache});
  if (!packed.ok || !packed.body) throw Error('Could not load the motion editor module.');
  return new Response(packed.body.pipeThrough(new DecompressionStream('gzip')), {
    headers:{'Content-Type':'application/wasm'}
  });
}
async function installMotionAssets(cache, paths) {
  await Promise.all(paths.map(async name => {
    const request = new Request(new URL(name, self.registration.scope), {cache:'reload'});
    const response = await motionAsset(request);
    if (!response.ok) throw Error('Could not install ' + name);
    await cache.put(request, response);
  }));
}
