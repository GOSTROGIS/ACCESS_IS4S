/** Compatibility-reader edition: preserve future rows while new Codex jobs remain unavailable. */
export const CODEX_EXECUTION_READY = false;
export const CODEX_UNAVAILABLE = "Codex jobs are not available in this application version; queued work is preserved.";
import type { DatabaseSync } from "node:sqlite";
import { modelPolicy } from "./config.ts";

export const codexExecutionUnavailable = (db: DatabaseSync, models: string[]): string | null =>
  !CODEX_EXECUTION_READY && modelPolicy(db).provider === "codex" && models.some(model => model !== "jev") ? CODEX_UNAVAILABLE : null;
