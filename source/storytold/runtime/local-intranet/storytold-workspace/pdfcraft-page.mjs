const canvas = document.getElementById('pdfcraft');
const config = await (await fetch('editor.json', { cache: 'no-store' })).json();
// Upstream resolves its OCR models relative to the HTML page. The embedded
// page lives in a sidecar directory; its pinned loader and models live together.
const runtime = new URL(config.loader, location.href);
const modelPaths = new Map(['text-detection.onnx', 'text-recognition.onnx'].map(name => [
  new URL(`models/${name}`, location.href).href, new URL(`models/${name}`, runtime).href,
]));
if (runtime.origin !== location.origin) throw Error('The PDF runtime must be installed on this origin.');
const fetchInstalled = window.fetch.bind(window);
window.fetch = (input, options) => {
  const address = input instanceof Request ? input.url : new URL(String(input), location.href).href;
  const target = modelPaths.get(address);
  return fetchInstalled(target ? input instanceof Request ? new Request(target, input) : target : input, options);
};
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
