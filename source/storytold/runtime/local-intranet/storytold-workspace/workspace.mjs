const frame = document.getElementById('editor');
const status = document.getElementById('status');
const access = new URLSearchParams(location.search).get('parent') === 'access';
const parentOrigin = access ? 'http://127.0.0.1:4180' : 'http://127.0.0.1:4184';
const maximumBytes = 512 * 1024 * 1024;
const hosted = new Set(['cadcraft', 'deckcraft', 'figcraft', 'gridcraft', 'wordcraft', 'pdfcraft']);
const formats = { cadcraft: 'dxf', deckcraft: 'pptx', figcraft: 'figcraft', gridcraft: 'xlsx', wordcraft: 'docx', pdfcraft: 'pdf' };
let app;
let ready = false;
let name;
function tell(type, extra = {}, transfer = []) {
  window.parent.postMessage({ type: `slipcurve-editor:${type}`, application: app.id, ...extra }, parentOrigin, transfer);
}
function exported(filename, value) {
  const bytes = value instanceof Uint8Array ? value.slice().buffer : value;
  if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > maximumBytes) throw Error('The editor returned an invalid or oversized file.');
  tell('save', { name: filename || name || 'Document', bytes }, [bytes]);
}
async function action(message) {
  const api = frame.contentWindow[app.id];
  if (message.type === 'slipcurve-editor:open') {
    if (!hosted.has(app.id)) throw Error('Use this application’s File Open command to select the project download.');
    if (!(message.bytes instanceof ArrayBuffer) || !message.bytes.byteLength || message.bytes.byteLength > maximumBytes) throw Error('Invalid project file.');
    name = message.name;
    frame.contentWindow.postMessage({ type: `${app.id}:open`, name, bytes: message.bytes }, location.origin, [message.bytes]);
  } else if (message.type === 'slipcurve-editor:new') {
    if (!hosted.has(app.id)) throw Error('Use the application’s New command.');
    const command = app.id === 'cadcraft' ? 'new' : app.id === 'pdfcraft' ? 'create.blank' : 'file.new';
    await api.execute(command, app.id === 'wordcraft' ? { template: 'blank' } : {});
    name = `Untitled.${formats[app.id]}`;
  } else if (message.type === 'slipcurve-editor:save') {
    if (!hosted.has(app.id)) throw Error('Use the application’s Save or Export command.');
    if (app.id === 'gridcraft') {
      const result = await api.execute('file.saveBytes', { format: 'xlsx' });
      if (typeof result.base64 !== 'string' || result.base64.length > maximumBytes * 4 / 3 + 4) throw Error('Invalid workbook export.');
      exported((name || 'Workbook.xlsx').replace(/\.[^.]+$/, '.xlsx'), Uint8Array.from(atob(result.base64), character => character.charCodeAt(0)));
    } else if (app.id === 'deckcraft') {
      const result = await api.execute('file.saveBytes', { format: 'pptx' });
      if (typeof result.data !== 'string' || result.data.length > maximumBytes * 4 / 3 + 4) throw Error('Invalid presentation export.');
      exported((name || 'Presentation.pptx').replace(/\.[^.]+$/, '.pptx'), Uint8Array.from(atob(result.data), character => character.charCodeAt(0)));
    } else if (app.id === 'pdfcraft') {
      await api.execute('file.save');
    } else if (app.id === 'figcraft') {
      await api.request('ui.menu.invoke', { id: 'file.save' });
    } else {
      await api.execute(app.id === 'cadcraft' ? 'qsave' : 'file.save', { path: name || `Untitled.${formats[app.id]}` });
    }
  } else if (message.type === 'slipcurve-editor:saved') {
    frame.contentWindow.postMessage({ type: `${app.id}:saved`, name: message.name }, location.origin);
  }
}
async function start() {
  if (window.parent === window) throw Error('Open this editor from the application workspace.');
  const response = await fetch('editor.json', { cache: 'no-store' });
  if (!response.ok) throw Error('Installed editor mapping unavailable.');
  app = await response.json();
  document.title = `${app.label} | ${access ? 'ACCESS IS4S' : 'Slipcurve'}`;
  frame.title = app.label;
  window.addEventListener('message', event => {
    if (event.origin === parentOrigin && event.source === window.parent && event.data?.application === app.id && ready) {
      void action(event.data).catch(error => tell('error', { error: error.message }));
      return;
    }
    if (event.source !== frame.contentWindow || event.origin !== location.origin || !event.data || typeof event.data !== 'object') return;
    const message = event.data;
    if (message.type === `${app.id}:ready`) {
      ready = true;
      status.hidden = true;
      tell('ready');
    } else if (message.type === `${app.id}:dirty`) {
      tell('dirty', { dirty: message.dirty === true });
    } else if (message.type === `${app.id}:save`) {
      try { exported(message.name, message.bytes); } catch (error) { tell('error', { error: error.message }); }
    } else if (message.type === `${app.id}:failed`) {
      tell('error', { error: String(message.error).slice(0, 400) });
    }
  });
  frame.addEventListener('load', () => {
    frame.hidden = false;
    if (hosted.has(app.id)) return;
    status.hidden = true;
    ready = true;
    tell('ready');
    // Upstream apps using normal browser downloads keep that behavior. A copy
    // of each generated Blob is handed to the project before its URL is revoked.
    const window = frame.contentWindow;
    const click = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        void window.fetch(this.href).then(response => response.arrayBuffer()).then(bytes => exported(this.download, bytes))
          .catch(error => tell('error', { error: error.message }));
      }
      return click.call(this);
    };
  });
  frame.src = app.id === 'pdfcraft' ? 'pdfcraft.html?control' : app.entry + (app.entry.includes('?') ? '&' : '?') + (hosted.has(app.id) ? 'host=parent&control' : app.id === 'texturecraft' ? 'webgl' : '');
}
start().catch(error => { status.textContent = error.message; if (app) tell('error', { error: error.message }); });
