// Artifacts returned by workers: files under one directory, metadata in
// build_artifacts. The bytes are untrusted. Their type comes from sniffing
// them, only a few kinds are accepted, and nothing here ever executes or
// renders them.
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { dbPath } from "../db.ts";
import { envVar } from "../env.ts";

export const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
export const MAX_TASK_ARTIFACT_BYTES = 200 * 1024 * 1024;
export const MAX_ARTIFACTS_PER_TASK = 100;
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** AUTOCRAFT_ARTIFACT_DIR, else `artifacts` beside the database. */
export function artifactDir(): string {
  return resolve(envVar("ARTIFACT_DIR") ?? join(dirname(dbPath()), "artifacts"));
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The type of an artifact from its bytes, or null when it is not an allowed kind:
 * PNG, JSON, JUnit XML (a `<testsuite>` or `<testsuites>` root) or other UTF-8 text.
 * The allowed kinds are the only ones the dashboard offers for download.
 */
export function sniff(data: Buffer): "image/png" | "application/json" | "application/xml" | "text/plain" | null {
  if (data.length >= PNG.length && data.subarray(0, PNG.length).equals(PNG)) return "image/png";
  if (data.includes(0)) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return null;
  }
  const head = text.trimStart();
  if (head.startsWith("{") || head.startsWith("[")) {
    try {
      JSON.parse(text);
      return "application/json";
    } catch { /* plain text that looks like JSON */ }
  }
  if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<testsuites?[\s>]/.test(head)) return "application/xml";
  return "text/plain";
}

/** The file for an artifact: a hash of the name, so the name never reaches the file system. */
const fileFor = (taskId: number, name: string): string => join(String(taskId), createHash("sha256").update(name).digest("hex").slice(0, 32));

export function absolute(rel: string): string | null {
  const root = artifactDir();
  const full = resolve(root, rel);
  return full.startsWith(root + sep) ? full : null;
}

export function tempPath(taskId: number): string {
  const dir = join(artifactDir(), String(taskId));
  mkdirSync(dir, { recursive: true });
  return join(dir, `.upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

export class ArtifactError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Checks an uploaded temp file and files it under the task; removes the temp file when refused. */
export function storeArtifact(db: DatabaseSync, taskId: number, name: string, tmp: string): { bytes: number; contentType: string } {
  try {
    if (!NAME_RE.test(name)) throw new ArtifactError(400, "artifact names are 1 to 100 letters, digits, dots, underscores or hyphens");
    const bytes = statSync(tmp).size;
    if (bytes === 0) throw new ArtifactError(400, "the artifact is empty");
    const t = db.prepare("SELECT artifact_bytes FROM build_tasks WHERE id = ?").get(taskId) as { artifact_bytes: number } | undefined;
    if (!t) throw new ArtifactError(404, "no such task");
    const old = db.prepare("SELECT bytes FROM build_artifacts WHERE task_id = ? AND name = ?").get(taskId, name) as { bytes: number } | undefined;
    const count = (db.prepare("SELECT COUNT(*) AS n FROM build_artifacts WHERE task_id = ?").get(taskId) as { n: number }).n;
    if (!old && count >= MAX_ARTIFACTS_PER_TASK) throw new ArtifactError(413, `at most ${MAX_ARTIFACTS_PER_TASK} artifacts per task`);
    if (t.artifact_bytes - (old?.bytes ?? 0) + bytes > MAX_TASK_ARTIFACT_BYTES) throw new ArtifactError(413, "the task's artifacts would exceed 200 MB");
    const type = sniff(readFileSync(tmp));
    if (!type) throw new ArtifactError(415, "only PNG, JSON, JUnit XML and UTF-8 text artifacts are accepted");
    const rel = fileFor(taskId, name);
    renameSync(tmp, join(artifactDir(), rel));
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT OR REPLACE INTO build_artifacts (task_id, name, bytes, content_type, file) VALUES (?, ?, ?, ?, ?)").run(taskId, name, bytes, type, rel);
      db.prepare("UPDATE build_tasks SET artifact_bytes = artifact_bytes - ? + ? WHERE id = ?").run(old?.bytes ?? 0, bytes, taskId);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { bytes, contentType: type };
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch { /* already moved or gone */ }
    throw e;
  }
}

/** Deletes the artifact files and rows of tasks. */
export function removeArtifacts(db: DatabaseSync, taskIds: number[]): void {
  for (const id of taskIds) {
    db.prepare("DELETE FROM build_artifacts WHERE task_id = ?").run(id);
    db.prepare("UPDATE build_tasks SET artifact_bytes = 0 WHERE id = ?").run(id);
    const dir = absolute(String(id));
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}
