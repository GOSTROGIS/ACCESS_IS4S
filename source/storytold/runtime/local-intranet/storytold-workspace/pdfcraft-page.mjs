const canvas = document.getElementById('pdfcraft');
const config = await (await fetch('editor.json', { cache: 'no-store' })).json();
for (const event of ['ready', 'save', 'dirty', 'failed']) {
  canvas.addEventListener(`pdfcraft:${event}`, message => {
    const detail = message.detail || {};
    const transfer = detail.bytes instanceof ArrayBuffer ? [detail.bytes] : [];
    parent.postMessage({ type: `pdfcraft:${event}`, ...detail }, location.origin, transfer);
  });
}
window.addEventListener('message', event => {
  if (event.source !== parent || event.origin !== location.origin || !['pdfcraft:open', 'pdfcraft:saved'].includes(event.data?.type)) return;
  const { type, ...detail } = event.data;
  canvas.dispatchEvent(new CustomEvent(type, { detail }));
});
const worker = document.createElement('meta');
worker.name = 'pdfcraft-ocr-worker';
worker.content = config.worker;
document.head.append(worker);
const { default: init } = await import(config.loader);
await init({ module_or_path: config.wasm });
