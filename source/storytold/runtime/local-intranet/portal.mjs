const browserList = document.getElementById('browser-apps');
const nativeList = document.getElementById('native-apps');
const status = document.getElementById('status');
const workspaces = new Set(['gridcraft', 'wordcraft']);

try {
  const response = await fetch('/applications.json');
  if (!response.ok) throw new Error('Application inventory unavailable');
  const { apps, native } = await response.json();
  for (const app of apps) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    const path = workspaces.has(app.id) ? 'access-workspace/' : app.id === 'texturecraft' ? '?webgl' : '';
    link.href = `http://127.0.0.1:${app.port}/${path}`;
    link.textContent = app.label;
    const version = document.createElement('small');
    version.textContent = app.version;
    link.append(version);
    item.append(link);
    browserList.append(item);
  }
  for (const app of native) {
    const item = document.createElement('li');
    item.className = 'desktop';
    item.textContent = app.label;
    const version = document.createElement('small');
    version.textContent = app.version;
    item.append(version);
    nativeList.append(item);
  }
  status.hidden = true;
} catch {
  status.textContent = 'The installed application list could not be read. Restart the intranet from its folder.';
}
