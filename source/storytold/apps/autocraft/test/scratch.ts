// Scratch space for test databases, checkouts and caches: one directory per test
// process (node --test runs each file in its own), removed when the process exits.
// It lives under ~/.cache, not /tmp: /tmp is a RAM disk shared by the whole box.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = join(homedir(), ".cache/autocraft-scratch");
mkdirSync(BASE, { recursive: true });
export const SCRATCH = mkdtempSync(join(BASE, "test-"));
process.on("exit", () => rmSync(SCRATCH, { recursive: true, force: true }));
