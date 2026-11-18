export async function enableRuntimes() {
  if (!navigator.serviceWorker || typeof DecompressionStream !== 'function') {
    throw Error('Processing Tools requires a browser with service workers and gzip decompression over HTTPS.');
  }
  const expected = new URL('runtime-sw.js', import.meta.url);
  const controlling = () => navigator.serviceWorker.controller?.scriptURL === expected.href;
  await navigator.serviceWorker.register(expected, {scope:'./'});
  if (controlling()) return;
  await new Promise((resolve, reject) => {
    const check = () => {
      if (!controlling()) return;
      clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', check);
      resolve();
    };
    const timeout = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', check);
      reject(Error('The browser could not start Processing Tools. Allow site storage and reload this page.'));
    }, 20000);
    navigator.serviceWorker.addEventListener('controllerchange', check);
    check();
  });
}
