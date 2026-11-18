import { APPLICATIONS, SKILLS, acceptedMessage, browserApplication, byId, checkBytes, editorUrl, nativeUrl, safeName } from './model.mjs';
import { openProjects } from './store.mjs';

const $ = id => document.getElementById(id);
const frame = $('editor');
const query = new URLSearchParams(location.search);
const publicBase = document.documentElement.dataset.distribution === 'pages' ? new URL('./', location.href) : null;
const skill = Object.hasOwn(SKILLS, query.get('skill')) ? query.get('skill') : 'digital';
const context = SKILLS[skill];
let store, project, application, installed, currentDocument, pendingDocument;
let ready = false, dirty = false, busy = false;
let browserApps = new Map(), nativeApps = new Map(), records = [];

function status(message, error = false) {
  $('status').textContent = message;
  $('status').dataset.error = String(error);
}
function buttons() {
  const bridge = Boolean(application?.extension && ready && !busy);
  for (const id of ['new', 'open', 'save']) $(id).disabled = !bridge || !project;
  $('application').disabled = busy || !store;
  $('project').disabled = busy || !store;
  $('create-project').disabled = busy || !store;
  $('import').disabled = busy || !project || !application;
  const selected = Boolean($('documents').value);
  for (const id of ['reopen', 'download', 'remove']) $(id).disabled = busy || !selected;
}
async function run(action) {
  if (busy) return;
  busy = true;
  buttons();
  try { await action(); } catch (error) {
    status(error.name === 'QuotaExceededError' ? 'Browser storage is full. Use the application’s Download or Export command to keep a file backup.' : error.message, true);
  } finally { busy = false; buttons(); }
}
function mayReplace() {
  return !(dirty || (ready && application && !application.extension)) || window.confirm('Leave the current editor? Save or export any changes you want to keep first.');
}
function send(type, extra = {}, transfer = []) {
  if (!ready || !application?.port) throw Error('The browser editor is not ready.');
  frame.contentWindow.postMessage({ type: `slipcurve-editor:${type}`, application: application.id, ...extra }, new URL(editorUrl(application, installed, publicBase)).origin, transfer);
}
function download(record) {
  const url = URL.createObjectURL(new Blob([checkBytes(record.bytes)], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName(record.name);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
function option(value, label) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  return item;
}
async function projects(selected) {
  const all = await store.projects();
  $('project').replaceChildren(...all.map(item => option(item.id, item.name)));
  project = all.find(item => item.id === selected) || all[0];
  if (project) $('project').value = project.id;
}
async function documents(selected) {
  records = project ? await store.documents(project.id) : [];
  $('documents').replaceChildren(...records.map(item => option(item.id, `${safeName(item.name)} · ${byId.get(item.application)?.label || 'Unknown application'}`)));
  if (selected && records.some(item => item.id === selected)) $('documents').value = selected;
  else $('documents').selectedIndex = -1;
  $('document-info').textContent = `${records.length} saved file${records.length === 1 ? '' : 's'} in this project.`;
  buttons();
}
async function selectedDocument() {
  const record = await store.load($('documents').value);
  if (record.projectId !== project.id) throw Error('The document does not belong to the selected project.');
  return record;
}
function describe(record) {
  $('document-info').textContent = `${record.name} · ${record.size.toLocaleString()} bytes · saved ${new Date(record.updated).toLocaleString()}`;
}
function showEditor(id, opening) {
  const base = byId.get(id);
  const next = browserApps.has(id) ? browserApplication(base, browserApps.get(id), publicBase) : base;
  if (!next) throw Error('Choose an available application.');
  application = next;
  installed = browserApps.get(id);
  currentDocument = null;
  pendingDocument = opening;
  ready = false;
  dirty = false;
  $('application').value = id;
  $('editor-title').textContent = next.label;
  $('description').textContent = next.description;
  const desktopLink = nativeApps.has(id) || Boolean(publicBase && !base.port);
  $('native').hidden = !desktopLink;
  $('native').href = nativeUrl(id, nativeApps.get(id));
  $('native-note').textContent = desktopLink ? 'Requires the ACCESS desktop installation on this computer. Add saved files to your project with the file chooser.' : '';
  $('workflow').textContent = next.extension ? 'Use the application’s full controls. The toolbar can open files and save the editable document into your ACCESS project.' : 'Use the application’s own New, Open, Save and Export controls. Browser downloads are also copied into your ACCESS project. To reopen a project copy, download it and select it with the application’s Open command.';
  // Keep the adapter's startup and error text visible while its application
  // initializes. Readiness still controls all document toolbar operations.
  frame.hidden = !installed;
  $('empty').hidden = Boolean(installed);
  if (installed) {
    frame.title = next.label;
    frame.src = editorUrl(next, installed, publicBase);
    status(`Starting ${next.label}…`);
  } else {
    frame.removeAttribute('src');
    $('empty').replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = next.label;
    const text = document.createElement('p');
    text.textContent = desktopLink
      ? 'Choose “Open desktop application” to start this tool. Use the file chooser to bring the result back into your project.'
      : 'The application inventory has no runtime available for this tool.';
    $('empty').append(heading, text);
    status(desktopLink ? 'This application runs on your computer through ACCESS.' : 'No runtime is listed for this application.');
    if (opening) {
      currentDocument = opening;
      download(opening);
      status(`Downloaded ${opening.name}. Open it in the desktop application.`);
    }
  }
  buttons();
}
async function openRecord(record) {
  if (application?.id !== record.application || !ready) {
    showEditor(record.application, record);
    return;
  }
  currentDocument = record;
  if (application.extension) {
    const bytes = record.bytes.slice(0);
    send('open', { name: record.name, bytes }, [bytes]);
    if (application.id === 'pdfcraft') { ready = false; buttons(); }
    status(`Opening ${record.name}…`);
  } else {
    download(record);
    status(`Downloaded ${record.name}. Use the application’s Open command to select this file.`);
  }
  dirty = false;
}

window.addEventListener('message', event => {
  if (!acceptedMessage(event, frame.contentWindow, application, publicBase)) return;
  const message = event.data;
  if (message.type === 'slipcurve-editor:ready') {
    ready = true;
    frame.hidden = false;
    $('empty').hidden = true;
    status(`${application.label} is ready. Save or export a document to keep it with this project.`);
    buttons();
    if (pendingDocument) {
      const record = pendingDocument;
      pendingDocument = null;
      void run(() => openRecord(record));
    }
  } else if (message.type === 'slipcurve-editor:dirty') {
    dirty = message.dirty === true;
    if (dirty) status('The editor has changes. Save to project when you are ready.');
  } else if (message.type === 'slipcurve-editor:error') {
    status(typeof message.error === 'string' ? message.error.slice(0, 400) : 'The editor could not complete that action.', true);
  } else if (message.type === 'slipcurve-editor:save') {
    if (busy) { status('Another project operation is in progress. Save or export again when it finishes.', true); return; }
    void run(async () => {
      if (!project) throw Error('Create or select a project before saving.');
      const name = safeName(message.name, `Document${application.extension ? '.' + application.extension : ''}`);
      const same = currentDocument?.application === application.id && currentDocument.projectId === project.id && currentDocument.name === name;
      const saved = await store.save({ id: same ? currentDocument.id : undefined, created: same ? currentDocument.created : undefined,
        projectId: project.id, application: application.id, name, bytes: checkBytes(message.bytes) });
      currentDocument = saved;
      dirty = false;
      send('saved', { name: saved.name });
      await documents(saved.id);
      describe(saved);
      status(`Saved ${saved.name} to ${project.name}. Download a backup when you finish.`);
    });
  }
});
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
$('application').addEventListener('change', () => {
  if (!mayReplace()) { $('application').value = application.id; return; }
  void run(async () => showEditor($('application').value));
});
$('project').addEventListener('change', () => {
  const id = $('project').value;
  if (!mayReplace()) { $('project').value = project.id; return; }
  void run(async () => { await projects(id); currentDocument = null; await documents(); status(`Selected project ${project.name}. Future saves will be kept here.`); });
});
$('project-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!mayReplace()) return;
  void run(async () => {
    const saved = await store.createProject($('project-name').value, skill);
    await projects(saved.id);
    await documents();
    currentDocument = null;
    $('project-name').value = '';
    status(`Created ${project.name}. Editor saves will be kept in this project.`);
  });
});
$('documents').addEventListener('change', () => { buttons(); void run(async () => describe(await selectedDocument())); });
$('download').addEventListener('click', () => void run(async () => { const record = await selectedDocument(); download(record); status(`Downloaded ${record.name}.`); }));
$('remove').addEventListener('click', () => void run(async () => {
  const record = await selectedDocument();
  if (!window.confirm(`Remove the browser project copy of ${record.name}? Download a backup first if you need it.`)) return;
  await store.remove(record.id);
  if (currentDocument?.id === record.id) currentDocument = null;
  await documents();
  status(`Removed the browser copy of ${record.name}.`);
}));
$('reopen').addEventListener('click', () => { if (mayReplace()) void run(async () => { await openRecord(await selectedDocument()); }); });
$('import').addEventListener('change', () => {
  const file = $('import').files[0];
  if (!file) return;
  void run(async () => {
    if (!file.size || file.size > 512 * 1024 * 1024) throw Error('Choose a nonempty file of at most 512 MiB.');
    const saved = await store.save({ projectId: project.id, application: application.id, name: file.name, bytes: await file.arrayBuffer() });
    await documents(saved.id);
    describe(saved);
    status(`Added ${saved.name}. Use Reopen to continue in ${application.label}.`);
  }).finally(() => { $('import').value = ''; });
});
$('new').addEventListener('click', () => {
  if (!mayReplace()) return;
  void run(async () => { currentDocument = null; send('new'); dirty = true; status('Creating a document in the full editor. Save to project when you are ready.'); });
});
$('open').addEventListener('click', () => { if (mayReplace()) $('open-file').click(); });
$('open-file').addEventListener('change', () => {
  const file = $('open-file').files[0];
  if (!file) return;
  void run(async () => {
    if (!file.size || file.size > 512 * 1024 * 1024) throw Error('Choose a nonempty file of at most 512 MiB.');
    const saved = await store.save({ projectId: project.id, application: application.id, name: file.name, bytes: await file.arrayBuffer() });
    await documents(saved.id);
    await openRecord(saved);
  }).finally(() => { $('open-file').value = ''; });
});
$('save').addEventListener('click', () => void run(async () => { send('save'); status('Requesting the editable file from the application…'); }));
$('tools-tab').addEventListener('click', event => event.preventDefault());

async function start() {
  $('context').textContent = `${context.label}: create a file, practise the skill, and keep your work.`;
  $('lesson').href = `/ACCESS_IS4S/skills/${skill}/`;
  $('lesson').textContent = `${context.label} lessons`;
  $('tools-tab').href = location.pathname + location.search;
  if (publicBase) {
    const {enableRuntimes} = await import(new URL('enable-runtimes.mjs', publicBase).href);
    await enableRuntimes();
  }
  const response = await fetch(publicBase ? new URL('applications.json', publicBase) : '/applications.json', { cache: 'no-store' });
  if (!response.ok) throw Error('The application list could not be loaded.');
  const manifest = await response.json();
  if (!Array.isArray(manifest.apps) || !Array.isArray(manifest.native)) throw Error('The installed application inventory is invalid.');
  for (const row of manifest.apps) {
    const app = byId.get(row.id);
    if (!app || browserApps.has(row.id)) throw Error('Unexpected browser application in the installed inventory.');
    editorUrl(app, row, publicBase);
    browserApps.set(row.id, row);
  }
  for (const row of manifest.native) { if (byId.has(row.id)) nativeApps.set(row.id, row); }
  if (manifest.products !== undefined && !Array.isArray(manifest.products)) throw Error('The installed product inventory is invalid.');
  for (const row of manifest.products || []) {
    if (row.product !== 'access') continue;
    const app = byId.get(row.sourceApplication);
    if (!app) throw Error('Unknown owned product application.');
    if (row.kind === 'web') { browserApplication(app, row); browserApps.set(app.id, row); }
    else if (row.kind === 'native') { nativeUrl(app.id, row); nativeApps.set(app.id, row); }
    else throw Error('Unknown owned runtime type.');
  }
  if (manifest.automations !== undefined && !Array.isArray(manifest.automations)) throw Error('The installed automation inventory is invalid.');
  for (const row of manifest.automations || []) {
    if (row.product !== 'access') continue;
    if (nativeApps.has('autocraft') || row.id !== 'access-autocraft' || row.sourceApplication !== 'autocraft' ||
        row.kind !== 'service' || row.origin !== 'http://127.0.0.2:8993') throw Error('Unexpected installed automation.');
    nativeApps.set('autocraft', row);
  }
  const preferred = APPLICATIONS.filter(app => context.apps.includes(app.id));
  const other = APPLICATIONS.filter(app => !context.apps.includes(app.id));
  for (const [label, apps] of [['For this skill', preferred], ['Other ACCESS applications', other]]) {
    if (!apps.length) continue;
    const group = document.createElement('optgroup');
    group.label = label;
    group.append(...apps.map(app => option(app.id, app.label)));
    $('application').append(group);
  }
  store = await openProjects();
  await projects();
  if (!project) { project = await store.createProject(`${context.label} project`, skill); await projects(project.id); }
  await documents();
  // Ask for persistence where the browser supports it; a refusal does not
  // change the download-backup requirement shown next to project storage.
  void navigator.storage?.persist?.().catch(() => false);
  const selected = byId.has(query.get('app')) ? query.get('app') : preferred[0].id;
  showEditor(selected);
}
start().catch(error => { status(error.message, true); buttons(); });
