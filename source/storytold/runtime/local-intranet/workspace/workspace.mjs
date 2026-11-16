const editors = {
  gridcraft: {
    label: 'GridCraft', extension: '.xlsx', initialName: 'Workbook.xlsx', newParams: {},
    fileTypes: ['.xlsx', '.xlsm', '.xls', '.xlsb', '.ods', '.csv', '.tsv', '.json'],
    exportTypes: ['.xlsx', '.csv', '.tsv', '.json', '.html', '.pdf'],
  },
  wordcraft: {
    label: 'WordCraft', extension: '.docx', initialName: 'Document.docx', newParams: { template: 'blank' },
    fileTypes: ['.docx', '.docm', '.doc', '.odt', '.rtf', '.txt', '.md', '.html', '.tex', '.xml'],
    exportTypes: ['.docx', '.docm', '.odt', '.rtf', '.txt', '.md', '.html', '.tex', '.xml', '.pdf', '.png'],
  },
};
const maxBytes = 512 * 1024 * 1024;
const frame = document.getElementById('editor');
const status = document.getElementById('status');
const input = document.getElementById('file');
const filename = document.getElementById('filename');
const newButton = document.getElementById('new');
const openButton = document.getElementById('open');
const saveButton = document.getElementById('save');
const controls = [newButton, openButton, saveButton, filename];

function safeName(value, extensions, fallback) {
  if (typeof value !== 'string') return fallback;
  const basename = value.split(/[\\/]/u).at(-1).trim();
  const dot = basename.lastIndexOf('.');
  const extension = dot > 0 ? basename.slice(dot).toLowerCase() : '';
  if (!extensions.includes(extension)) return fallback;
  let stem = basename.slice(0, dot)
    .replace(/[<>:"|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, '_')
    .replace(/^[. ]+|[. ]+$/gu, '');
  stem = [...stem].slice(0, 100).join('').replace(/[. ]+$/gu, '');
  if (!stem) return fallback;
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(stem)) stem = `_${stem}`;
  return stem + extension;
}

function download(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  try { link.click(); } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function decodedFile(base64) {
  if (typeof base64 !== 'string' || !base64.length || base64.length > Math.ceil(maxBytes / 3) * 4) {
    throw new Error('The editor returned an invalid or oversized file.');
  }
  const binary = atob(base64);
  if (!binary.length || binary.length > maxBytes) throw new Error('The editor returned an invalid or oversized file.');
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function start() {
  const response = await fetch('editor.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Editor configuration is missing.');
  const { application } = await response.json();
  if (!Object.hasOwn(editors, application)) throw new Error('Editor configuration is invalid.');
  const editor = editors[application];
  const type = name => `${application}:${name}`;
  let ready = false;
  let dirty = false;
  let busy = false;
  let downloads = 0;

  function updateControls() {
    for (const control of controls) control.disabled = !ready || busy;
  }
  function send(message, transfer = []) {
    frame.contentWindow.postMessage(message, location.origin, transfer);
  }
  function mayReplace() {
    return !dirty || window.confirm('Discard unsaved changes in the current file?');
  }
  async function perform(action) {
    if (!ready || busy) return;
    busy = true;
    updateControls();
    try {
      await action();
    } catch (error) {
      status.textContent = `Editor could not complete the action. ${error.message}`;
    } finally {
      busy = false;
      updateControls();
    }
  }

  document.title = `${editor.label} | ACCESS IS4S`;
  document.getElementById('title').textContent = editor.label;
  saveButton.textContent = `Save ${editor.extension.slice(1).toUpperCase()} copy`;
  frame.title = `${editor.label} editor`;
  filename.value = editor.initialName;
  input.accept = editor.fileTypes.join(',');
  const startupTimer = setTimeout(() => {
    if (!ready) status.textContent = `${editor.label} is taking longer to start. Check browser graphics support if this persists.`;
  }, 30_000);

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === type('ready') && message.version === '1') {
      clearTimeout(startupTimer);
      ready = true;
      updateControls();
      status.textContent = 'Ready. Create a file or open one from this computer.';
    } else if (message.type === type('failed')) {
      clearTimeout(startupTimer);
      ready = false;
      updateControls();
      status.textContent = `${editor.label} could not start. ${String(message.error ?? '').slice(0, 240)}`;
    } else if (ready && message.type === type('dirty') && typeof message.dirty === 'boolean') {
      dirty = message.dirty;
      if (dirty && !busy) status.textContent = 'Unsaved changes.';
    } else if (ready && message.type === type('save')) {
      const bytes = message.bytes;
      if (!(bytes instanceof ArrayBuffer || bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > maxBytes) {
        status.textContent = 'The editor returned an invalid or oversized file.';
        return;
      }
      const name = safeName(message.name, editor.exportTypes, editor.initialName);
      download(name, bytes);
      downloads += 1;
      send({ type: type('saved'), name: message.name });
      if (message.saveAs) filename.value = name;
      status.textContent = `Download requested for ${name}.`;
    }
  });
  window.addEventListener('beforeunload', event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  newButton.addEventListener('click', () => perform(async () => {
    if (!mayReplace()) return;
    await frame.contentWindow[application].execute('file.new', editor.newParams);
    filename.value = editor.initialName;
    status.textContent = 'New file opened.';
    frame.focus();
  }));
  openButton.addEventListener('click', () => { if (mayReplace()) input.click(); });
  input.addEventListener('change', () => perform(async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const name = safeName(file.name, editor.fileTypes, null);
    if (!name || file.size < 1 || file.size > maxBytes) {
      status.textContent = 'Choose a supported file smaller than 512 MiB.';
      return;
    }
    const bytes = await file.arrayBuffer();
    send({ type: type('open'), name, bytes }, [bytes]);
    filename.value = name;
    status.textContent = `Sent ${name} to ${editor.label}.`;
    frame.focus();
  }));
  saveButton.addEventListener('click', () => perform(async () => {
    const format = editor.extension;
    const requested = filename.value.trim() || editor.initialName;
    const stem = requested.replace(/\.[a-z0-9]+$/iu, '');
    const path = safeName(`${stem}${format}`, [format], editor.initialName);
    const previous = downloads;
    status.textContent = `Preparing ${path}…`;
    const commands = frame.contentWindow[application];
    if (application === 'gridcraft') {
      const { base64 } = await commands.execute('file.saveBytes', { format: 'xlsx' });
      download(path, decodedFile(base64));
      downloads += 1;
      status.textContent = `Download requested for ${path}.`;
    } else {
      await commands.execute('file.save', { path });
    }
    filename.value = path;
    if (downloads === previous) status.textContent = 'Waiting for the editor to return the file…';
  }));

  frame.src = '../?host=parent';
}

start().catch(error => { status.textContent = error.message; });
