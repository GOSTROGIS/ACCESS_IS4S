// Worker side of the shared snapshot store: runs in the trusted worker process
// on the host. The build container only ever sees the copied target dir.
// The store is not trusted for content: snapshots are signed by a build worker
// (Ed25519) and verified here before they are unpacked into a warm dir.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, sign, verify } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { freeDiskGb, type WorkerConfig } from "./config.ts";
import { extractTar } from "./tarball.ts";
import { dirOf, locked, readRecord, storeWarm } from "./warm.ts";

type Remote = { commit: string; size: number; sha256: string; stored: number; bytes: number; signature: string };
type Say = (msg: string) => void;

const COMMIT = /^[0-9a-f]{7,64}$/;

let zstdOk: Promise<boolean> | undefined;
const hasZstd = () => (zstdOk ??= new Promise<boolean>((r) => execFile("zstd", ["--version"], (err) => r(!err))));

/** The signed statement: binds the snapshot bytes to the repo key, commit and main build time. */
const BLOB_SLACK = 1024 * 1024;
/** Passes bytes through and fails once more than `max` have gone by. */
export function byteCap(max: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _e, cb) {
      seen += chunk.length;
      if (seen > max) return cb(new Error("snapshot is larger than its record"));
      cb(null, chunk);
    },
  });
}

export const signedText = (key: string, r: Pick<Remote, "commit" | "sha256" | "stored" | "bytes">) => Buffer.from(`autocraft-warm-v1\n${key}\n${r.commit}\n${r.sha256}\n${r.stored}\n${r.bytes}`);

function validRemote(r: unknown): r is Remote {
  const o = r as Record<string, unknown>;
  const pos = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
  return typeof r === "object" && r !== null && typeof o.commit === "string" && COMMIT.test(o.commit) && typeof o.sha256 === "string" && /^[0-9a-f]{64}$/.test(o.sha256) && pos(o.size) && pos(o.bytes) && pos(o.stored) && typeof o.signature === "string";
}

function verified(cfg: WorkerConfig, key: string, r: Remote): boolean {
  for (const k of cfg.warmStore!.verifyKeys) {
    try {
      if (verify(null, signedText(key, r), k, Buffer.from(r.signature, "base64"))) return true;
    } catch {
      // An unreadable key file or a malformed signature counts as no match.
    }
  }
  return false;
}

const inflight = new Map<string, Promise<void>>();
// One download at a time per worker; the expected size of the running one counts against free disk.
let downloadChain: Promise<unknown> = Promise.resolve();
let reservedBytes = 0;

/**
 * Brings the local warm dir for `key` up to the store's snapshot when that one is newer. Concurrent
 * callers share one download. Never throws.
 */
export function downloadWarm(cfg: WorkerConfig, key: string, say: Say): Promise<void> {
  const s = cfg.warmStore;
  if (!s) return Promise.resolve();
  const running = inflight.get(key);
  if (running) return running;
  const p = (downloadChain = downloadChain.then(() => download(cfg, key, say)).catch(() => {})).then(() => {}).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function download(cfg: WorkerConfig, key: string, say: Say): Promise<void> {
  const s = cfg.warmStore!;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), s.timeoutSec * 1000);
  const procs: ChildProcess[] = [];
  ac.signal.addEventListener("abort", () => procs.forEach((c) => c.kill("SIGKILL")), { once: true });
  const tag = `${key}-${process.pid}-${Date.now()}`;
  const stage = join(cfg.warmDir, `.dl-${tag}`);
  const spool = join(cfg.warmDir, `.dl-${tag}.tar.zst`);
  let reserved = 0;
  let extracting: Promise<unknown> | undefined;
  try {
    if (!(await hasZstd())) return say("warm store: zstd is missing, download skipped");
    const auth = { authorization: `Bearer ${s.readKey}` };
    const head = await fetch(`${s.url}/store/${key}`, { headers: auth, signal: ac.signal, redirect: "error" });
    if (head.status === 404) return;
    if (!head.ok) return say(`warm store: lookup answered ${head.status}`);
    const rec: unknown = await head.json();
    if (!validRemote(rec)) return say("warm store: malformed record, skipped");
    if (!verified(cfg, key, rec)) return say("warm store: snapshot is unsigned or its signature is wrong, skipped");
    const newer = (cur: { commit: string; stored?: number } | null) => !cur || (cur.commit !== rec.commit && rec.stored > (cur.stored ?? 0));
    if (!newer(readRecord(cfg, key))) return;
    const cap = Math.min(rec.bytes, cfg.warmMaxGb * 1024 ** 3);
    if (rec.bytes > cfg.warmMaxGb * 1024 ** 3) return say("warm store: snapshot is larger than warmMaxGb, skipped");
    mkdirSync(cfg.warmDir, { recursive: true, mode: 0o700 });
    // Compressed spool plus unpacked tree.
    reserved = rec.bytes + rec.size;
    if (freeDiskGb(cfg.warmDir) * 1024 ** 3 - reservedBytes < reserved + cfg.limits.minFreeDiskGb * 1024 ** 3) return say("warm store: not enough free disk, skipped");
    reservedBytes += reserved;
    const res = await fetch(`${s.url}/store/${key}/blob`, { headers: auth, signal: ac.signal, redirect: "error" });
    if (!res.ok || !res.body) return say(`warm store: download answered ${res.status}`);
    // Nothing is unpacked until the whole blob has matched the signed sha256.
    const hash = createHash("sha256");
    const tap = new Transform({ transform(chunk: Buffer, _e, cb) { hash.update(chunk); cb(null, chunk); } });
    // A failing cap stream destroys the body stream, which cancels the fetch.
    await pipeline(Readable.fromWeb(res.body as never), byteCap(rec.size + BLOB_SLACK), tap, createWriteStream(spool, { mode: 0o600 }), { signal: ac.signal });
    if (hash.digest("hex") !== rec.sha256) throw new Error("sha256 mismatch");
    mkdirSync(stage, { recursive: true, mode: 0o700 });
    const zstd = spawn("zstd", ["-dc", spool], { stdio: ["ignore", "pipe", "ignore"] });
    procs.push(zstd);
    const exit = new Promise<number | null>((r) => zstd.on("close", (code) => r(code)));
    zstd.on("error", () => ac.abort());
    // Entry kinds, paths, links and mode bits are checked by the extractor; the unpacked size is capped at the signed size plus slack.
    extracting = extractTar(zstd.stdout as AsyncIterable<Buffer>, stage, { maxBytes: cap + cap / 10 + 64 * 1024 ** 2, maxEntries: 2_000_000 }, 0);
    await extracting;
    zstd.stdout!.resume();
    if ((await exit) !== 0) throw new Error("unpack failed");
    const swapped = await storeWarm(cfg, key, rec.commit, stage, { stored: rec.stored, replaceIf: newer });
    if (swapped) say(`warm store: downloaded snapshot of ${rec.commit.slice(0, 12)}`);
  } catch (e) {
    say(`warm store: download failed: ${ac.signal.aborted ? "timed out" : (e as Error).message}`);
  } finally {
    clearTimeout(timer);
    procs.forEach((c) => c.kill("SIGKILL"));
    await extracting?.catch(() => {});
    reservedBytes -= reserved;
    try {
      rmSync(stage, { recursive: true, force: true });
      rmSync(spool, { force: true });
    } catch {
      // cleanWarm removes leftovers at the next start.
    }
  }
}

/** Packs the warm dir into `file` (tar | zstd). Throws when either tool fails. */
async function pack(dir: string, file: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new Error("aborted");
  const tar = spawn("tar", ["-C", dir, "-cf", "-", "."], { stdio: ["ignore", "pipe", "ignore"] });
  const zstd = spawn("zstd", ["-T0", "-3", "-q", "-f", "-o", file], { stdio: ["pipe", "ignore", "ignore"] });
  const kill = () => [tar, zstd].forEach((c) => c.kill("SIGKILL"));
  signal.addEventListener("abort", kill, { once: true });
  try {
    tar.stdout!.pipe(zstd.stdin!);
    const codes = await Promise.all([tar, zstd].map((c) => new Promise<number | null>((r, j) => { c.on("close", r); c.on("error", j); })));
    if (codes.some((c) => c !== 0)) throw new Error(`tar/zstd exited ${codes.join("/")}`);
  } finally {
    kill();
  }
}

/** Uploads the local warm dir for `key` (just stored by a trusted main build). Never throws. */
export async function uploadWarm(cfg: WorkerConfig, key: string, commit: string, say: Say): Promise<void> {
  const s = cfg.warmStore;
  if (!s?.writeKey || !s.signKey) return;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), s.timeoutSec * 1000);
  const spool = join(cfg.warmDir, `.up-${key}-${process.pid}-${Date.now()}.tar.zst`);
  const snap = join(cfg.warmDir, `.up-${key}-${process.pid}-${Date.now()}`);
  try {
    if (!(await hasZstd())) return say("warm store: zstd is missing, upload skipped");
    // Under the lock only a hard-link copy is made (cheap); packing runs on the copy, so use tasks are not held up.
    const rec = await locked(key, async () => {
      const cur = readRecord(cfg, key);
      if (!cur || cur.commit !== commit) return null;
      await new Promise<void>((resolve, reject) => execFile("cp", ["-al", dirOf(cfg, key), snap], (err) => (err ? reject(err) : resolve())));
      return cur;
    });
    if (!rec) return say("warm store: local warm dir changed, upload skipped");
    await pack(snap, spool, ac.signal);
    const h = createHash("sha256");
    await pipeline(createReadStream(spool), h);
    const sha256 = h.digest("hex");
    const meta = { commit, sha256, stored: rec.stored ?? Date.now(), bytes: rec.bytes };
    const signature = sign(null, signedText(key, meta), s.signKey).toString("base64");
    const q = new URLSearchParams({ commit, sha256, stored: String(meta.stored), bytes: String(meta.bytes), signature });
    const res = await fetch(`${s.url}/store/${key}?${q}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${s.writeKey}`, "content-type": "application/zstd", "content-length": String(statSync(spool).size) },
      body: Readable.toWeb(createReadStream(spool)) as never,
      duplex: "half",
      redirect: "error",
      signal: ac.signal,
    } as RequestInit);
    say(res.ok ? `warm store: uploaded snapshot of ${commit.slice(0, 12)}` : `warm store: upload answered ${res.status}`);
  } catch (e) {
    say(`warm store: upload failed: ${ac.signal.aborted ? "timed out" : (e as Error).message}`);
  } finally {
    clearTimeout(timer);
    try {
      rmSync(spool, { force: true });
      rmSync(snap, { recursive: true, force: true });
    } catch {
      // cleanWarm removes leftovers at the next start.
    }
  }
}
