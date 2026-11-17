// Removing directories a build step wrote to. A step runs as the worker's own uid (userns keep-id), so it can
// leave a directory with mode 000 that a plain recursive remove cannot list. The walk gives every directory
// back owner rwx first, without following links, then removes the tree.
import { chmodSync, lstatSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

function openUp(dir: string): void {
  let st;
  try {
    st = lstatSync(dir);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;
  try {
    if ((st.mode & 0o700) !== 0o700) chmodSync(dir, (st.mode & 0o7777) | 0o700);
  } catch { /* not ours: the remove below reports it */ }
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const n of names) openUp(join(dir, n));
}

/** Removes `path` and everything below it, also directories a step left unreadable. Throws when that still fails. */
export function removeTree(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
    return;
  } catch { /* fall through */ }
  openUp(path);
  rmSync(path, { recursive: true, force: true });
}

/** Prefix of task dirs that could not be removed; renamed so they never collide with a new task's dir. */
export const STUCK_PREFIX = "stuck-";

/**
 * Removes a task's work dir and never throws. When the dir cannot be removed it is renamed to `stuck-<name>-<random>`
 * next to it (retried at every worker start). Returns null on success, else what happened for the log.
 */
export function discardDir(path: string): string | null {
  try {
    removeTree(path);
    return null;
  } catch (e) {
    const msg = (e as Error).message;
    const parked = join(dirname(path), `${STUCK_PREFIX}${basename(path)}-${randomBytes(4).toString("hex")}`);
    try {
      renameSync(path, parked);
      return `could not remove ${basename(path)} (${msg}); moved to ${basename(parked)}`;
    } catch (e2) {
      return `could not remove ${basename(path)} (${msg}) nor move it (${(e2 as Error).message})`;
    }
  }
}
