import { cp, lstat, mkdir, readFile, readdir, realpath, rename, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

const configuration = {
  filmcraft: ['FILMCRAFT_DATA_DIR', 'data'],
  effectcraft: ['EFFECTCRAFT_CONFIG_DIR', 'EffectCraftData'],
  vectorcraft: ['VECTORCRAFT_CONFIG_DIR', 'VectorCraftData'],
  lightcraft: ['LIGHTCRAFT_CONFIG_DIR', 'LightCraftData'],
  soundcraft: ['SOUNDCRAFT_CONFIG_DIR', 'SoundCraftData'],
  designcraft: ['DESIGNCRAFT_CONFIG_DIR', 'DesignCraftData'],
  photocraft: ['PHOTOCRAFT_CONFIG_DIR', 'PhotoCraftData'],
  figcraft: ['FIGCRAFT_CONFIG_DIR', 'config'],
  'craft-anything': ['CRAFT_ANYTHING_CONFIG_DIR', 'CraftAnythingData'],
  pdfcraft: [null, 'PdfCraftData'],
};

export function mutableDirectories(id) {
  return configuration[id] ? [configuration[id][1]] : [];
}

async function present(path) {
  return lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
}

// Desktop app containers can redirect LocalAppData. Resolve the existing OS
// ancestor before creating a profile, and retain that physical location for
// subsequent launches from Explorer or the scheduled updater.
async function privateRoot(root, localAppData, remember) {
  const pointer = join(root, 'tools/native-profile-location.json');
  if (remember && await present(pointer)) {
    if (relative(pointer, await realpath(pointer))) throw Error('Private profile location is redirected');
    const value = JSON.parse(await readFile(pointer, 'utf8'));
    if (value.schema !== 1 || !isAbsolute(value.directory)) throw Error('Invalid private profile location');
    const location = resolve(value.directory);
    const within = relative(root, location);
    if (!within || (!within.startsWith('..') && !isAbsolute(within))) throw Error('Profiles must remain outside the synced installation');
    return location;
  }
  let ancestor = join(localAppData, 'ACCESS', 'Intranet', 'Storytold');
  const suffix = [];
  while (!await present(ancestor)) {
    suffix.unshift(basename(ancestor));
    const parent = dirname(ancestor);
    if (parent === ancestor) throw Error('Private profiles need an existing local ancestor');
    ancestor = parent;
  }
  const location = join(await realpath(ancestor), ...suffix);
  if (remember) {
    await mkdir(join(root, 'tools'), { recursive: true });
    await writeFile(pointer, JSON.stringify({ schema: 1, directory: location }) + '\n', { flag: 'wx' });
  }
  return location;
}

async function mergePreserving(source, destination) {
  const item = await present(source);
  if (!item) return;
  if (relative(source, await realpath(source))) throw Error('Legacy profile is redirected');
  await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
}

async function equalProfile(source, destination) {
  const names = (await readdir(source)).sort();
  if (JSON.stringify(names) !== JSON.stringify((await readdir(destination)).sort())) return false;
  for (const name of names) {
    const old = join(source, name), saved = join(destination, name);
    const item = await lstat(old), copy = await lstat(saved);
    if (item.isDirectory() && copy.isDirectory()) {
      if (!await equalProfile(old, saved)) return false;
    } else if (!item.isFile() || !copy.isFile() || !(await readFile(old)).equals(await readFile(saved))) return false;
  }
  return true;
}

export async function nativeEnvironment(root, app, version, options = {}) {
  const localAppData = options.localAppData ?? process.env.LOCALAPPDATA;
  const env = { ...process.env };
  const settings = configuration[app.id];
  if (settings) {
    if (!localAppData) throw Error('Windows local application data directory is unavailable');
    const base = join(await privateRoot(root, localAppData, options.localAppData === undefined), app.id);
    await mkdir(base, { recursive: true });
    if (relative(base, await realpath(base))) throw Error('Private application profile is redirected');
    const profile = join(base, 'profile');
    const marker = join(base, 'migration.json');
    const baseline = join(root, 'Storytold/native/apps', app.id, app.version, settings[1]);
    if (!(await present(marker))) {
      if (await present(profile)) {
        if (!await present(baseline) || !await equalProfile(baseline, profile)) throw Error('Conflicting application profile copies were preserved for review');
      } else if (await present(baseline)) await mergePreserving(baseline, profile);
      else await mkdir(profile);
      await writeFile(marker, JSON.stringify({ schema: 1, baseline: app.version, copied: !!(await present(baseline)) }) + '\n', { flag: 'wx' });
    }
    if (relative(profile, await realpath(profile))) throw Error('Private application profile points outside its configured directory');
    if (settings[0]) env[settings[0]] = profile;
    else {
      const portable = join(root, 'Storytold/native/apps', app.id, version, settings[1]);
      const item = await present(portable);
      if (item?.isSymbolicLink()) {
        if (relative(profile, await realpath(portable))) throw Error('Portable application profile points at an unexpected directory');
      } else if (!item) {
        await symlink(profile, portable, 'junction');
      } else {
        if (!item.isDirectory() || !await equalProfile(portable, profile)) throw Error('Portable profile changed before migration. Both copies were preserved');
        const backup = join(base, `legacy-${version}`);
        if (await present(backup)) throw Error('A prior portable profile backup already exists');
        if (relative(portable, await realpath(portable))) throw Error('Portable profile is redirected');
        await rename(portable, backup);
        await symlink(profile, portable, 'junction');
      }
    }
  }
  if (app.id === 'anicraft') env.ANICRAFT_FFMPEG = join(root, 'Storytold/native/dependencies/ffmpeg/9.0.2/bin/ffmpeg.exe');
  if (app.id === 'artcraftx') env.ARTCRAFTX_DATA_DIR = join(root, 'Storytold/native/Projects/ArtCraft-X');
  return env;
}
