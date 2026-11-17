import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const consultingRevision = /^[a-f0-9]{40}$/;
export const consultingRegistry = 'runtime-edition.json';

export function consultingEdition(root, revision) {
  if (revision === 'baseline') return root;
  if (!consultingRevision.test(revision)) throw Error('Invalid CONSULTING revision');
  return join(root, 'releases', revision);
}

export async function consultingState(root) {
  const file = join(root, consultingRegistry);
  const item = await lstat(file).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!item) return { schema: 1, active: 'baseline' };
  if (!item.isFile()) throw Error('Redirected CONSULTING runtime registry');
  const state = JSON.parse(await readFile(file, 'utf8'));
  if (state.schema !== 1 || typeof state.active !== 'string' ||
      (state.previous && typeof state.previous !== 'string') ||
      (state.hold && !consultingRevision.test(state.hold))) throw Error('Invalid CONSULTING runtime registry');
  consultingEdition(root, state.active);
  if (state.previous) consultingEdition(root, state.previous);
  return state;
}

export async function consultingPaths(root) {
  const { active } = await consultingState(root);
  const edition = consultingEdition(root, active);
  const site = join(edition, 'site');
  const mcp = join(edition, 'mcp');
  for (const path of [site, mcp]) {
    if (relative(path, await realpath(path)) || !(await lstat(path)).isDirectory()) {
      throw Error('Redirected CONSULTING runtime directory');
    }
  }
  return { revision: active, site, mcp };
}
