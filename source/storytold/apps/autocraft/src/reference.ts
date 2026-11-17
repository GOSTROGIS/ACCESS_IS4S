// Private per-repo reference documentation: plain-text pages, their images and the source PDF in `<data dir>/reference/<repo>/`, mounted
// read-only at /reference for the calls that judge reference-app behaviour. Operators import it with
// `autocraft reference import`; nothing in it is ever quoted, cited or posted.
import { execFileSync } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { audit } from "./dash/audit.ts";
import { connect, dbPath } from "./db.ts";
import { isTracked } from "./repos.ts";
import { isInstructionPath } from "./sandbox/instruction-paths.ts";

export class ReferenceError extends Error {}

export const MAX_BYTES = 1024 * 1024 * 1024;
const MAX_MEMBERS = 50_000;
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const EXTENSION = /\.(txt|md|pdf|png|jpe?g|gif|webp|svg)$/;

export const referenceRoot = (): string => join(dirname(dbPath()), "reference");

/** The host folder to mount for a repo, or undefined when none was imported. */
export function referenceDir(repo: string): string | undefined {
  if (!REPO_NAME.test(repo)) return undefined;
  const dir = join(referenceRoot(), repo);
  try {
    return statSync(dir).isDirectory() ? dir : undefined;
  } catch {
    return undefined;
  }
}

/** Lists the archive and refuses any member that is not a plain page, image or PDF file (or a directory) under the rules; returns the file count and byte total. */
function checkArchive(tarFile: string): { files: number; bytes: number } {
  let out: string;
  try {
    out = execFileSync("tar", ["-tvf", tarFile], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new ReferenceError("the input is not a readable tar archive");
  }
  let files = 0, bytes = 0, members = 0;
  for (const line of out.split("\n")) {
    if (!line) continue;
    if (++members > MAX_MEMBERS) throw new ReferenceError(`the archive has more than ${MAX_MEMBERS} members`);
    const m = /^([^\s])\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(.+)$/.exec(line);
    if (!m) throw new ReferenceError("unreadable archive listing");
    const [, type, size, rawName] = m as unknown as [string, string, string, string];
    if (type !== "-" && type !== "d") throw new ReferenceError("the archive may hold only plain files and directories");
    const name = rawName.replace(/^\.\//, "").replace(/\/$/, "");
    if (name === "" || name === ".") continue;
    if (isInstructionPath(name)) throw new ReferenceError("a name in the archive is not allowed");
    const parts = name.split("/");
    if (parts.length > (type === "d" ? 1 : 2) || !parts.every((p) => SEGMENT.test(p))) throw new ReferenceError("a name in the archive is not allowed");
    if (type === "-") {
      if (!EXTENSION.test(name)) throw new ReferenceError("only .txt, .md, .pdf and image (.png, .jpg, .gif, .webp, .svg) files are allowed");
      files++;
      bytes += Number(size);
      if (bytes > MAX_BYTES) throw new ReferenceError(`the files exceed ${MAX_BYTES} bytes`);
    }
  }
  if (files === 0) throw new ReferenceError("the archive holds no files");
  return { files, bytes };
}

/** Makes the extracted tree readable by the mount and removable (archive modes survive extraction for a non-root user), and refuses anything but plain files and directories. */
function checkTree(dir: string, depth = 0): void {
  chmodSync(dir, 0o755);
  for (const e of readdirSync(dir)) {
    const p = join(dir, e), st = lstatSync(p);
    if (st.isDirectory() && depth === 0) checkTree(p, 1);
    else if (st.isFile()) chmodSync(p, 0o644);
    else throw new ReferenceError("the extracted tree holds something other than plain files");
  }
}

/** Installs the archive as the repo's reference folder: extracted beside it, then renamed into place. */
export function importReference(db: DatabaseSync, by: string, repo: string, tarFile: string, replace = false): { files: number; bytes: number } {
  if (!REPO_NAME.test(repo) || !isTracked(db, repo)) throw new ReferenceError(`${repo} is not a tracked repo`);
  const root = referenceRoot(), target = join(root, repo);
  if (existsSync(target) && !replace) throw new ReferenceError(`${repo} already has reference documentation; use --replace`);
  const summary = checkArchive(tarFile);
  mkdirSync(root, { recursive: true });
  const staging = mkdtempSync(join(root, ".import-"));
  try {
    execFileSync("tar", ["-xf", tarFile, "-C", staging, "--no-same-owner", "--no-same-permissions"], { stdio: "ignore" });
    checkTree(staging);
    const old = existsSync(target) ? `${staging}-old` : undefined;
    if (old) renameSync(target, old);
    try {
      renameSync(staging, target);
    } catch (e) {
      if (old) renameSync(old, target);
      throw e;
    }
    // The new folder is live; a leftover old copy is only clutter.
    if (old) try { rmSync(old, { recursive: true, force: true }); } catch (e) { console.log(`could not remove the replaced reference folder ${old}: ${(e as Error).message}`); }
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    throw e;
  }
  audit(db, by, "reference-import", repo, { repo, ...summary });
  return summary;
}

export function listReferences(): { repo: string; files: number; bytes: number }[] {
  const root = referenceRoot();
  if (!existsSync(root)) return [];
  const rows: { repo: string; files: number; bytes: number }[] = [];
  for (const repo of readdirSync(root).sort()) {
    const dir = referenceDir(repo);
    if (!dir) continue;
    let files = 0, bytes = 0;
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else if (e.isFile()) { files++; bytes += statSync(join(d, e.name)).size; }
      }
    };
    walk(dir);
    rows.push({ repo, files, bytes });
  }
  return rows;
}

/** Streams stdin to `file`, refusing an archive larger than twice the file limit. */
async function saveStdin(file: string): Promise<void> {
  let n = 0;
  const cap = new Transform({
    transform(c: Buffer, _enc, done) {
      n += c.length;
      done(n > MAX_BYTES * 2 ? new ReferenceError("the archive on stdin is too large") : null, c);
    },
  });
  await pipeline(process.stdin, cap, createWriteStream(file));
}

const USAGE = "usage: autocraft reference import <repo> [--replace]   (tar stream of .txt/.md/.pdf and image files on stdin)\n       autocraft reference list";

export const commands = {
  reference: {
    summary: "Private reference documentation per repo: import <repo> [--replace] (tar on stdin), list",
    async run(args: string[]): Promise<void> {
      const [sub, ...rest] = args;
      try {
        if (sub === "list") {
          for (const r of listReferences()) console.log(`${r.repo.padEnd(28)} ${String(r.files).padStart(6)} files ${String(r.bytes).padStart(10)} bytes`);
        } else if (sub === "import" && rest[0] && rest.every((a, i) => i === 0 || a === "--replace")) {
          const tmp = mkdtempSync(join(dirname(dbPath()), ".reference-tar-"));
          try {
            const file = join(tmp, "in.tar");
            await saveStdin(file);
            const r = importReference(connect(), "cli", rest[0], file, rest.includes("--replace"));
            console.log(`imported ${r.files} files (${r.bytes} bytes) for ${rest[0]}`);
          } finally {
            rmSync(tmp, { recursive: true, force: true });
          }
        } else {
          console.error(USAGE);
          process.exit(1);
        }
      } catch (e) {
        if (!(e instanceof ReferenceError)) throw e;
        console.error(e.message);
        process.exit(1);
      }
    },
  },
};
