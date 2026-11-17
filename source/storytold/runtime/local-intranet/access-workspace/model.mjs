export const MAX_BYTES = 512 * 1024 * 1024;
export const APPLICATIONS = [
  ['vectorcraft', 'ACCESS Vector Drawing', 'Shapes, paths, text and illustrations', 4190],
  ['filmcraft', 'ACCESS Video Editor', 'Edit clips, sequences and video', 4191],
  ['effectcraft', 'ACCESS Motion Effects', 'Compositing and animated effects', 4192],
  ['photocraft', 'ACCESS Image Editor', 'Edit images, layers and photographs', 4193],
  ['lightcraft', 'ACCESS Photo Development', 'Develop and adjust photographs', 4194],
  ['cadcraft', 'ACCESS Technical Drawing', 'Plans, dimensions and CAD drawings', 4195, 'dxf'],
  ['gridcraft', 'ACCESS Spreadsheets', 'Tables, formulas and workbooks', 4196, 'xlsx'],
  ['wordcraft', 'ACCESS Documents', 'Write, format and edit documents', 4197, 'docx'],
  ['pdfcraft', 'ACCESS PDF Editor', 'Read, annotate and edit PDF files', 4198, 'pdf'],
  ['designcraft', 'ACCESS Page Design', 'Create layouts and publications', 4199],
  ['deckcraft', 'ACCESS Presentations', 'Create and present slide decks', 4200, 'pptx'],
  ['soundcraft', 'ACCESS Audio Editor', 'Record, edit and arrange audio', 4201],
  ['figcraft', 'ACCESS Interface Design', 'Create interface designs and prototypes', 4202, 'figcraft'],
  ['texturecraft', 'ACCESS Texture Studio', 'Create procedural textures', 4203],
  ['materialcraft', 'ACCESS Material Studio', 'Create and edit materials', 4204],
  ['craft-anything', 'ACCESS Creative Assistant', 'Provider-connected creative tools', 4205],
  ['craft-launcher', 'ACCESS Application Launcher', 'Manage creative applications', 4206],
  ['artcraft', 'ACCESS Generative Studio', 'Native provider-connected creative studio'],
  ['artcraftx', 'ACCESS Generative Studio Advanced', 'Native advanced generation workflows'],
  ['anicraft', 'ACCESS Animation Studio', 'Native animation and rendering'],
  ['autocraft', 'ACCESS Automation', 'Local automation runner and provider setup'],
].map(([id, label, description, port, extension]) => Object.freeze({ id, label, description, port, extension }));
export const byId = new Map(APPLICATIONS.map(app => [app.id, app]));

export const SKILLS = {
  reading: { label: 'Reading', apps: ['pdfcraft', 'wordcraft', 'soundcraft'] },
  writing: { label: 'Writing', apps: ['wordcraft', 'pdfcraft', 'designcraft', 'deckcraft'] },
  numeracy: { label: 'Numeracy', apps: ['gridcraft', 'cadcraft'] },
  digital: { label: 'Digital', apps: APPLICATIONS.map(app => app.id) },
  'problem-solving': { label: 'Problem solving', apps: ['cadcraft', 'gridcraft', 'figcraft', 'autocraft'] },
  communication: { label: 'Communication', apps: ['deckcraft', 'filmcraft', 'wordcraft', 'soundcraft'] },
  collaboration: { label: 'Collaboration', apps: ['figcraft', 'wordcraft', 'gridcraft', 'deckcraft'] },
  adaptability: { label: 'Adaptability', apps: ['wordcraft', 'gridcraft', 'craft-launcher', 'craft-anything'] },
  'creativity-innovation': { label: 'Creativity and innovation', apps: ['vectorcraft', 'effectcraft', 'photocraft', 'designcraft', 'texturecraft', 'materialcraft', 'artcraft', 'artcraftx', 'anicraft'] },
};

export function safeName(value, fallback = 'Document') {
  if (typeof value !== 'string') return fallback;
  let name = value.split(/[\\/]/u).at(-1).trim()
    .replace(/[<>:"|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, '_')
    .replace(/^[. ]+|[. ]+$/gu, '');
  name = [...name].slice(0, 180).join('').replace(/[. ]+$/gu, '');
  if (!name) return fallback;
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(name)) name = `_${name}`;
  return name;
}

export function title(value, fallback = 'My project') {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, 120) || fallback;
}

export function editorUrl(app, installed) {
  if (!app || !app.port || installed?.id !== app.id || installed.port !== app.port) throw Error('The installed browser editor does not match its approved route.');
  return `http://127.0.0.1:${app.port}/slipcurve-workspace/?parent=access`;
}

export function nativeUrl(id) {
  if (!byId.has(id)) throw Error('Unknown application.');
  return `slipcurve-app://open/${id}`;
}

export function checkBytes(bytes) {
  if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > MAX_BYTES) throw Error('Choose a nonempty file of at most 512 MiB.');
  return bytes;
}

export async function sha256(bytes) {
  checkBytes(bytes);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function documentRecord({ id = crypto.randomUUID(), projectId, application, name, bytes, created = Date.now() }) {
  if (!byId.has(application) || typeof projectId !== 'string' || !projectId || typeof id !== 'string' || !id) throw Error('Invalid project document.');
  const copy = checkBytes(bytes).slice(0);
  return { id, projectId, application, name: safeName(name), bytes: copy, size: copy.byteLength, sha256: await sha256(copy), created, updated: Date.now() };
}

export async function verifyDocument(record) {
  if (!record || !byId.has(record.application) || typeof record.projectId !== 'string' || !record.projectId ||
      typeof record.id !== 'string' || !record.id || record.name !== safeName(record.name) ||
      !Number.isSafeInteger(record.size) || record.size !== checkBytes(record.bytes).byteLength ||
      !/^[a-f0-9]{64}$/u.test(record.sha256) || await sha256(record.bytes) !== record.sha256) throw Error('The saved document failed its size or SHA-256 check. Import a trusted backup.');
  return record;
}

export function acceptedMessage(event, frameWindow, app) {
  return Boolean(app?.port && event.source === frameWindow && event.origin === `http://127.0.0.1:${app.port}` &&
    event.data && typeof event.data === 'object' && event.data.application === app.id &&
    ['ready', 'dirty', 'save', 'error'].some(type => event.data.type === `slipcurve-editor:${type}`));
}
