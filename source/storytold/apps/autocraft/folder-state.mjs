import { createHash, randomUUID } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { windowsSecretAcl } from './src/dash/server/windows-secret-acl.ts';

const receiptName = 'legacy-import.json';
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

export function privateDirectory(env = process.env) {
  if (!env.AUTOCRAFT_PRIVATE_DIR && !env.LOCALAPPDATA) throw Error('LOCALAPPDATA or AUTOCRAFT_PRIVATE_DIR is required for AutoCraft private data.');
  let ancestor = resolve(env.AUTOCRAFT_PRIVATE_DIR || join(env.LOCALAPPDATA, 'ACCESS', 'Intranet', 'AutoCraft'));
  const suffix = [];
  while (!existsSync(ancestor)) {
    suffix.unshift(basename(ancestor));
    const parent = dirname(ancestor);
    if (parent === ancestor) throw Error('AutoCraft private storage needs an existing local ancestor.');
    ancestor = parent;
  }
  return join(realpathSync.native(ancestor),...suffix);
}

function inventory(root) {
  if (realpathSync.native(root).toLowerCase() !== resolve(root).toLowerCase()) throw Error('Private data may not use a linked directory.');
  const files = {};
  function visit(directory, prefix = '') {
    if (realpathSync.native(directory).toLowerCase() !== resolve(directory).toLowerCase()) throw Error('Private data may not use linked directories.');
    for (const entry of readdirSync(directory, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      const relative = prefix + entry.name;
      if (entry.isDirectory()) visit(path, relative + '/');
      else if (entry.isFile()) files[relative] = sha256(path);
      else throw Error('Private data may contain only regular files and directories.');
    }
  }
  visit(root);
  return files;
}

function createProtected(directory) {
  mkdirSync(directory, {recursive:true});
  windowsSecretAcl('ProtectDirectory', directory);
}

function persistentInventory(directory) {
  const files = inventory(directory);
  const databases = Object.keys(files).filter(file=>file.endsWith('.db'));
  return Object.fromEntries(Object.entries(files).filter(([file]) => {
    if (databases.some(database => file === database + '-shm')) return false;
    if (databases.some(database => file === database + '-wal')) return statSync(join(directory, file)).size > 0;
    return true;
  }));
}

export async function preparePrivateDirectory(root, target = privateDirectory()) {
  const legacy = join(root, '.private');
  if (!existsSync(legacy) || resolve(legacy).toLowerCase() === resolve(target).toLowerCase()) {
    if (!existsSync(target)) createProtected(target);
    windowsSecretAcl('CheckDirectory', target);
    return target;
  }
  windowsSecretAcl('CheckDirectory', legacy);
  const source = persistentInventory(legacy);
  if (existsSync(target)) {
    windowsSecretAcl('CheckDirectory', target);
    const receipt = join(target, receiptName);
    if (existsSync(receipt) && JSON.stringify(JSON.parse(readFileSync(receipt,'utf8')).source) === JSON.stringify(source)) return target;
  }
  const stage = join(dirname(target), `.autocraft-import-${randomUUID()}`);
  createProtected(stage);
  const sqlite = Object.keys(source).filter(file => file.endsWith('.db'));
  for (const [relative, hash] of Object.entries(source)) {
    if (sqlite.some(database => relative === database || relative === database+'-wal' || relative === database+'-shm')) continue;
    const destination = join(stage, relative);
    mkdirSync(dirname(destination), {recursive:true});
    copyFileSync(join(legacy,relative), destination, constants.COPYFILE_EXCL);
    if (sha256(destination) !== hash) throw Error('Private file import verification failed.');
  }
  for (const relative of sqlite) {
    const destination = join(stage, relative);
    mkdirSync(dirname(destination), {recursive:true});
    const database = new DatabaseSync(join(legacy,relative), {readOnly:true});
    try { await backup(database, destination); } finally { database.close(); }
    const imported = new DatabaseSync(destination,{readOnly:true});
    try {
      if (imported.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw Error('Imported SQLite data failed integrity checking.');
    } finally { imported.close(); }
  }
  if (JSON.stringify(persistentInventory(legacy)) !== JSON.stringify(source)) throw Error('Legacy data changed during import. Start again with its writers stopped.');
  writeFileSync(join(stage,receiptName), JSON.stringify({schema:1,source})+'\n',{flag:'wx'});
  windowsSecretAcl('CheckDirectory', stage);
  if (existsSync(target)) {
    const staged = inventory(stage);
    const existing = inventory(target);
    if (Object.entries(existing).some(([relative,hash])=>staged[relative] !== hash)) {
      throw Error('The private data destination already contains different files. Both copies have been preserved.');
    }
    for (const relative of Object.keys(staged).filter(file=>file !== receiptName)) {
      const destination = join(target,relative);
      if (!existsSync(destination)) {
        mkdirSync(dirname(destination),{recursive:true});
        copyFileSync(join(stage,relative),destination,constants.COPYFILE_EXCL);
      }
    }
    copyFileSync(join(stage,receiptName),join(target,receiptName),constants.COPYFILE_EXCL);
  } else {
    renameSync(stage,target);
  }
  return target;
}
