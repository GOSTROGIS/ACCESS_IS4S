// The host directory that holds the session store of one sandboxed call.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkoutRoot } from "./checkout.ts";

/**
 * The host directory that holds the session store of one sandboxed call, bound over the sandbox's
 * `projects` directory (the sandbox's own config directory is a tmpfs, gone when the call ends).
 * One directory per call under the checkout root's parent (the app's cache), never shared; the caller removes it.
 */
export function sessionRoot(): string { return join(dirname(checkoutRoot()), "sessions"); }

export function sessionStore(): string {
  const root = sessionRoot();
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, "call-"));
}

/** Removes session stores older than `maxAgeMs` (a crash leaves one behind; a live call is far younger). */
export function pruneSessionStores(maxAgeMs: number, now = Date.now()): number {
  const root = sessionRoot();
  let n = 0;
  if (!existsSync(root)) return 0;
  for (const d of readdirSync(root)) {
    if (!d.startsWith("call-")) continue;
    const p = join(root, d);
    try {
      if (now - statSync(p).mtimeMs > maxAgeMs) { rmSync(p, { recursive: true, force: true }); n++; }
    } catch { /* gone already */ }
  }
  return n;
}
