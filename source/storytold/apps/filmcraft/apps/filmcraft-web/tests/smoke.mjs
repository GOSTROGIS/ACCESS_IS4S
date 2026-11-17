// Browser smoke test of the FilmCraft web app over the Chrome DevTools Protocol.
// No npm dependencies (Node ≥ 22: global WebSocket and fetch).
//
//   cargo xtask web --serve 8765 &            # build + serve target/web/dist
//   node apps/filmcraft-web/tests/smoke.mjs --url http://127.0.0.1:8765/ --media clip.mp4 --out /tmp/fc-web
//
// Load and play the demo, import a 3-second H.264/AAC test clip at 24 fps, trim the sequence,
// download and reopen the project, and decode the exported MP4 with ffmpeg and ffprobe.
// `--media` must be reachable from the served editor. Prints a JSON report and exits non-zero
// on failure, including a Rust panic or uncaught exception in the browser console.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkImportBins } from "./import-bins.mjs";
import { checkImportCollision } from "./import-collision.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const url = arg("url", "http://127.0.0.1:8765/");
const out = arg("out", join(tmpdir(), "filmcraft-web-smoke"));
const media = arg("media", "web-test.mp4");
const chrome = arg("chrome", process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
const port = Number(arg("port", "9333"));
const headless = !process.argv.includes("--headed");
const ffmpeg = arg("ffmpeg", "ffmpeg");
const ffprobe = arg("ffprobe", "ffprobe");
mkdirSync(out, { recursive: true });
const downloads = mkdtempSync(join(out, "downloads-"));

const profile = mkdtempSync(join(tmpdir(), "fc-chrome-"));
const proc = spawn(chrome, [
  ...(headless ? ["--headless=new"] : []),
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--enable-unsafe-webgpu",
  "--autoplay-policy=no-user-gesture-required",
  "--window-size=1600,1000",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let nextId = 1;
const waiting = new Map();
const logs = [];

async function connect() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (m) => {
          const msg = JSON.parse(m.data);
          if (msg.id && waiting.has(msg.id)) {
            waiting.get(msg.id)(msg);
            waiting.delete(msg.id);
          } else if (msg.method === "Runtime.consoleAPICalled") {
            logs.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
          } else if (msg.method === "Runtime.exceptionThrown") {
            logs.push("EXCEPTION " + JSON.stringify(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
          }
        };
        return;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome did not start");
}

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => waiting.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))));
}

async function js(expr, timeout = 120000) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, timeout });
  if (r.exceptionDetails) throw new Error(`${expr}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const p = join(out, `${name}.png`);
  writeFileSync(p, Buffer.from(r.data, "base64"));
  return p;
}

async function until(expr, ms = 60000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await js(expr)) return Date.now() - t0;
    await sleep(step);
  }
  throw new Error(`timeout waiting for ${expr}`);
}

async function savedDownload(name) {
  const path = join(downloads, name);
  for (let i = 0; i < 100; i++) {
    if (existsSync(path) && statSync(path).size > 0) return path;
    await sleep(100);
  }
  throw new Error(`No completed browser download for ${name}`);
}

function verifyExport(path, sequence) {
  const probe = JSON.parse(execFileSync(ffprobe, [
    "-v", "error", "-count_frames", "-show_entries",
    "format=duration:stream=codec_type,codec_name,duration,nb_read_frames,width,height",
    "-of", "json", path,
  ], { encoding: "utf8", timeout: 60000 }));
  const video = probe.streams.find(stream => stream.codec_type === "video");
  const audio = probe.streams.find(stream => stream.codec_type === "audio");
  assert.equal(video?.codec_name, "h264");
  assert.equal(audio?.codec_name, "aac");
  assert.equal(Number(video.nb_read_frames), sequence.durationFrames);
  assert.ok(Math.abs(Number(probe.format.duration) - sequence.duration / 254016000000) < 0.15, "Unexpected MP4 duration");
  execFileSync(ffmpeg, ["-v", "error", "-xerror", "-i", path, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], { timeout: 60000 });
  const pixels = execFileSync(ffmpeg, ["-v", "error", "-xerror", "-i", path, "-map", "0:v:0", "-vf", "scale=32:18", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"], { timeout: 60000 });
  const frameBytes = 32 * 18;
  assert.equal(pixels.length, sequence.durationFrames * frameBytes);
  const firstFrame = pixels.subarray(0, frameBytes);
  assert.ok(Math.max(...firstFrame) - Math.min(...firstFrame) > 32, "The decoded video has no visible test pattern");
  assert.notDeepEqual(firstFrame, pixels.subarray(-frameBytes), "The decoded test pattern did not move");
  const pcm = execFileSync(ffmpeg, ["-v", "error", "-xerror", "-i", path, "-map", "0:a:0", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"], { timeout: 60000 });
  let energy = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
  const audioRms = Math.sqrt(energy / (pcm.length / 2));
  assert.ok(audioRms > 100, "The decoded audio is silent");
  return { video, audio, duration: Number(probe.format.duration), audioRms };
}

const report = { url, steps: {} };
try {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  const t0 = Date.now();
  await send("Page.navigate", { url });
  await until("!!(window.filmcraftLoad && (window.filmcraftLoad.readyMs || window.filmcraftLoad.error))", 120000);
  report.load = await js("window.filmcraftLoad");
  report.load.wallMs = Date.now() - t0;
  if (report.load.error) throw new Error(report.load.error);
  report.resources = await js("performance.getEntriesByType('resource').filter(e => /wasm|\\.js/.test(e.name)).map(e => ({name: e.name.split('/').pop(), kB: Math.round(e.transferSize / 1024), ms: Math.round(e.duration)}))");
  report.info = await js("filmcraft.info()");
  // let the UI settle (fonts, first frames)
  await sleep(1500);
  report.steps.demo = { screenshot: await shot("01-demo"), inspect: await js("filmcraft.inspect().then(i => ({window: i.window, activeSequence: i.activeSequence, fps: i.fps}))") };

  // play 2 seconds
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 820, y: 400, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 820, y: 400, button: "left", clickCount: 1 });
  await js("filmcraft.request('ui.playback', {action: 'play'})");
  await sleep(2000);
  const pb = await js("filmcraft.inspect().then(i => ({playhead: i.playhead, playback: i.playback, fps: i.fps}))");
  report.steps.play = { ...pb, screenshot: await shot("02-playing") };
  await js("filmcraft.request('ui.playback', {action: 'stop'})");

  // import generated media
  await js('filmcraft.execute("file.newProject", {name: "IS4S regression"})');
  const imp = await js(`filmcraft.importUrl(${JSON.stringify(media)})`);
  report.steps.import = imp;
  if (!imp.items || imp.items.length === 0) throw new Error("import failed: " + JSON.stringify(imp));
  const item = imp.items[0];
  // a sequence from the clip, then look at its first frames
  report.steps.sequence = await js(`filmcraft.execute("file.newSequence", {fromItem: ${item}, name: "Web import"})`).catch((e) => ({ error: String(e) }));
  const sequence = report.steps.sequence.sequence;
  assert.ok(Number.isInteger(sequence), JSON.stringify(report.steps.sequence));
  const inspectSequence = () => js(`filmcraft.execute("sequence.inspect", {item: ${sequence}})`);
  const original = await inspectSequence();
  const [clip] = original.video.flatMap(track => track.items);
  assert.ok(clip, "The imported sequence has no video clip");
  const trimFrames = 12;
  await js(`filmcraft.execute("timeline.trim", {clip: ${clip.clip}, edge: "out", mode: "regular", deltaFrames: -${trimFrames}})`);
  const edited = await inspectSequence();
  assert.equal(edited.durationFrames, original.durationFrames - trimFrames);
  const projectName = "is4s-roundtrip.fcproj";
  await js(`filmcraft.execute("file.saveAs", {path: "/projects/${projectName}"})`);
  const projectPath = await savedDownload(projectName);
  const savedProject = readFileSync(projectPath);
  await js('filmcraft.execute("file.newProject", {name: "Empty before reopening"})');
  await js(`filmcraft.openProject(new File([Uint8Array.from(atob(${JSON.stringify(savedProject.toString("base64"))}), c => c.charCodeAt(0))], "${projectName}"))`);
  const reopened = await inspectSequence();
  assert.equal(reopened.durationFrames, edited.durationFrames);
  assert.deepEqual(reopened.video, edited.video);
  assert.deepEqual(reopened.audio, edited.audio);
  report.steps.roundTrip = { originalFrames: original.durationFrames, editedFrames: edited.durationFrames, reopenedFrames: reopened.durationFrames, projectBytes: savedProject.length };
  await sleep(1500);
  await js("filmcraft.request('ui.playback', {action: 'play'})");
  await sleep(1500);
  report.steps.importPlay = { ...(await js("filmcraft.inspect().then(i => ({playhead: i.playhead, playback: i.playback}))")), screenshot: await shot("03-imported") };
  await js("filmcraft.request('ui.playback', {action: 'stop'})");
  assert.ok(report.steps.importPlay.playhead > 0 && report.steps.importPlay.playback.shown > 0, "Imported playback did not advance");

  // export H.264 (stepped job; the file is offered as a download)
  const ex = await js(`filmcraft.execute("file.exportMedia", {format: "h264", path: "/exports/web-export.mp4", bitrateKbps: 4000})`);
  const te = Date.now();
  await until(`filmcraft.execute("jobs.list").then(js => js.some(j => j.id === ${ex.job} && j.finished))`, 300000, 250);
  report.steps.export = { job: ex.job, ms: Date.now() - te, jobs: await js("filmcraft.execute('jobs.list')"), files: await js("filmcraft.files()") };
  const job = report.steps.export.jobs.find(job => job.id === ex.job);
  assert.ok(job?.result && !job.result.error, JSON.stringify(job));
  assert.deepEqual(job.offlineMedia, [], "Export rendered offline media");
  report.steps.export.decode = verifyExport(await savedDownload("web-export.mp4"), edited);
  report.steps.export.downloads = readdirSync(downloads).filter((f) => !f.endsWith(".crdownload")).map((f) => ({ f, bytes: statSync(join(downloads, f)).size }));
  report.steps.export.screenshot = await shot("04-exported");

  // every top-level mode and a tiny window: these used to panic (temp_dir in Export mode, a dock
  // clamp below 40 points) and freeze the canvas
  for (const mode of ["import", "export", "edit"]) {
    await js(`filmcraft.request('ui.set', {mode: ${JSON.stringify(mode)}})`);
    await sleep(500);
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 120, height: 80, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false });
  await sleep(500);
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  report.steps.modes = { screenshot: await shot("05-modes") };
  report.steps.importBins = await checkImportBins({evaluate: js, media});
  if (!report.steps.importBins.ok) throw new Error("import bin regression: " + JSON.stringify(report.steps.importBins.gates));
  report.steps.importCollision = await checkImportCollision({
    evaluate: js,
    url,
    navigate: async (nextUrl) => {
      await send("Page.navigate", { url: nextUrl });
      await until("!!(window.filmcraftLoad && (window.filmcraftLoad.readyMs || window.filmcraftLoad.error))", 120000);
      const load = await js("window.filmcraftLoad");
      if (load.error) throw new Error(load.error);
    },
  });
  if (!report.steps.importCollision.ok) throw new Error("import collision regression: " + JSON.stringify(report.steps.importCollision.gates));
  // still alive? (a panicked app never answers)
  await Promise.race([js("filmcraft.inspect().then(() => true)"), sleep(5000).then(() => { throw new Error("app stopped answering"); })]);
  const fatal = logs.filter((l) => /panicked at|RuntimeError|EXCEPTION/.test(l));
  if (fatal.length) throw new Error("panic / uncaught exception:\n" + fatal.join("\n").slice(0, 4000));
  if (await js("window.filmcraftLoad.fatal || null")) throw new Error("fatal overlay shown");
  report.ok = true;
} catch (e) {
  report.ok = false;
  report.error = String(e && e.stack || e);
  try { report.failScreenshot = await shot("99-failure"); } catch {}
}
report.console = logs.slice(-60);
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
try { ws && ws.close(); } catch {}
proc.kill();
process.exit(report.ok ? 0 : 1);
