# Actual FilmCraft runtime: source review and build contract

Inspected upstream commit: `d6e78890f19baba37b062319fb45a1f2408a3450`.
This concerns the actual Rust/egui FilmCraft editor. It does not substitute a
lesson, SVG exercise, preview-only player or a simplified editor.

## Required build target and tooling

The supported browser package is `apps/filmcraft-web` (`filmcraft-web`, cdylib),
compiled to `wasm32-unknown-unknown`. The workspace declares Rust 1.95 and edition
2024 in `Cargo.toml`. `apps/filmcraft-web/Cargo.toml` pins wasm-bindgen to
`=0.2.129`; its CLI must match that version exactly. Trunk is not used by this
application's documented web build.

`docs/web.md` and `xtask/src/main.rs::web` specify the actual build: release Cargo
build, wasm-bindgen with `--target web`, and the existing web assets. The IS4S
recipe `filmcraft-build.sh` uses those same commands with `--locked`, three Cargo
workers by default, and a shared Cargo target cache. It stages assets in an
exclusive versioned FilmCraft directory because the upstream xtask removes the
generic `<target>/web/dist` directory, which would conflict with another app's
concurrent asset stage. Source and lockfiles remain unchanged.

Network prerequisites are the standard Rust/crate distribution domains
(`static.rust-lang.org`, `index.crates.io`, `static.crates.io`) and HTTPS Git
access to pinned `storytold/craft-libs`, `storytold/egui`, and `storytold/winit`
revisions on `github.com`. No generation-provider credential or FilmCraft cloud
account is needed to build or run the local editor. FFmpeg is an optional
external test oracle and media-fixture generator, not the application's codec
runtime. `wasm-opt` is an optional upstream size optimization, not a required
functional feature.

## Actual browser architecture

`apps/filmcraft-web/src/lib.rs` uses the same `filmcraft_engine::Session` and
`filmcraft_ui_egui::FilmcraftApp` as the desktop app. Its browser adapters supply
file/Blob reads, downloaded writes, OPFS recovery, WebAudio AudioWorklet output,
WebCodecs decoding where supported, and a JavaScript control API. WebGPU is the
preferred display path; WebGL2 with the CPU compositor is the fallback. Startup
and fatal errors are reported by the real upstream `web/index.html` loader.

| Area | Source evidence and required validation |
| --- | --- |
| Editing, timeline, effects, colour, titles and captions | Shared engine and UI dependencies in `apps/filmcraft-web/Cargo.toml`. Must test actual commands, rendered output and saved project, not merely a loading canvas. |
| File import | `src/import.rs`, `src/fs.rs`, `src/api.rs`; local pickers/drop, File/Blob adapters and virtual file table. Browser smoke imports an MP4 and validates bin handling/collisions. |
| Video decoding | `src/webcodecs.rs` and the unchanged codec crates; WebCodecs is probed per configuration and source errors fall back to FilmCraft's decoder. Codec names in a README are not proof that every profile runs. |
| Playback and audio | `src/audio.rs`, `web/audio-worklet.js`; browser audio initially needs a user gesture. Verify video frames and actual audio behavior separately. |
| Export | Shared `filmcraft-export`, cooperative jobs and browser downloadable writes. The existing smoke exercises an H.264 export and its downloaded file. A successful browser build alone does not establish an export. |
| Save/reopen/recovery | Browser `.fcproj` open/save, virtual writes and OPFS (`src/recovery.rs`, `opfs.rs`). Verify both an explicit project round trip and recovery behavior. |
| Embedding | `packaging/web/README.md`, `src/host.rs`, `src/hostmode.rs`; same-origin iframe messages or same-document canvas events. Host mode must handle saves and dirty state, rather than discard them. |

## Platform differences and stale documentation

The web build is single-threaded: cooperative rendering and media work run on
the UI thread, and rayon runs inline. It is not a native multithreaded runtime.
Cross-origin isolation alone does not turn this build into a threaded build.

The statement in `docs/web.md` that render previews, proxies, Project Manager
and mask tracking are unsupported is stale at the inspected commit. Opening
the actual definitions shows a synchronous wasm branch:

- `crates/engine/src/proxies.rs:358`: `wait || cfg!(target_arch = "wasm32")`
- `crates/engine/src/project_manager.rs:249`: same branch executes `run()`
- `crates/engine/src/previews.rs:748` and `:862`: preview/audio jobs run in that branch
- `crates/engine/src/masks.rs:731`: tracking runs and polls in that branch

These operations therefore need runtime testing; they must not be declared
missing solely from the older documentation. Synchronous work can still block
the browser UI and can have virtual-filesystem or memory limits.

Confirmed differences include native hardware encode/decode APIs absent from
the browser package, and native filesystem media watching disabled by
`cfg(target_arch = "wasm32")` in `crates/engine/src/media_watch.rs`. The upstream
README and encoder implementation describe H.265 export as hardware-only, with
no software H.265 encoder; AV1 export is not implemented. H.264 is the software
delivery-codec path. The browser cannot be labelled as providing every native
hardware/device/filesystem capability.

Microphone recording is another concrete gap. Native
`apps/filmcraft/src/main.rs:342` installs a `CpalIn` input, but the browser crate
has no `getUserMedia`/`MediaStream` adapter and does not set
`session.voiceover.input`. `crates/engine/src/voiceover.rs:186` and `:199` default
an absent input to `SyntheticInput::clicks()`. A browser voice-over command can
therefore generate synthetic test audio instead of recording a microphone;
it must not be presented as verified microphone capture.

Media cache and OPFS limits in `docs/web.md` include a 384 MiB read cache and
background persistence of imported files up to 4 GiB. The same-document host
open contract has its own 512 MiB limit in `packaging/web/README.md`. Actual
large-media behavior remains a separate test requirement.

## Branding and redistribution

Open code is MIT OR Apache-2.0, but ArtCraft's wordmark is a separate trademark.
`crates/ui-egui/src/brand.rs` embeds `docs/brand/artcraft-logo[-white].png` and
paints it in the Import screen and About dialog. AGENTS.md's asset rule 8 says
forks/modified versions must remove those marks. A rebranded IS4S release needs
a narrow branding override before publication, in addition to its page title
and loader text. The FilmCraft favicon itself is recorded as original open
artwork in `web/favicon.png.attribution`.

The build recipe retains upstream licences, attribution records and bundled
font licence texts. It does not grant permission for excluded trademarks and
does not itself publish an artifact.

## Functional validation procedure

After a real build, serve its directory at the intended project URL prefix,
using `application/wasm` for `.wasm`. Run the real upstream browser smoke test:

```sh
node apps/filmcraft-web/tests/smoke.mjs \
  --url http://127.0.0.1:8765/ \
  --chrome /usr/bin/chromium \
  --media web-test.mp4 \
  --out /workspace/build/storytold/filmcraft/smoke
```

Prepare `web-test.mp4` with an approved synthetic test image/audio source (the
command is documented in upstream `docs/web.md`). The runner preserves failure
through its exit status and writes screenshots and `report.json`. Confirm those
files belong to the current build. Import, edit, save/reopen, playback/audio,
effects/captions and a playable exported media file need direct evidence before
declaring the runtime usable. Broader native platform parity remains separate.

## Measured runtime result and handoff state

The full source `filmcraft-web` package compiled successfully in release mode
with `--locked` and three workers (14 minutes 31 seconds). Exact bindgen
0.2.129 packaging completed at:

`/workspace/build/storytold/filmcraft/dist-d6e78890f19baba37b062319fb45a1f2408a3450-release`

The static artifact contains a 46 MiB WASM, real application glue/assets,
licence records and `build-manifest.json` with file checksums. Original source
and lockfile were not modified. The build script's explicit
`FILMCRAFT_SKIP_BUILD=1` mode was used to package that already-completed build
without waiting on another app's shared Cargo target lock.

Both the verified official FilmCraft v0.20.1 release and the freshly compiled
source application started in default Chromium with the WebGL/CPU fallback,
imported a real synthetic H.264/AAC MP4, created a real timeline sequence, and
advanced the playhead with rendered frames after a normal trusted canvas click
unlocked browser audio. This is actual editor execution, not a practice model.

**H.264 export failed in both artifacts.** The precise runtime error is:

`encode: invalid configuration: cannot build the 1-thread pool: operation not supported on this platform`

The root cause is pinned craft-libs commit
`82062077bba679ba5236e2d1a391f02d1533cbab`,
`crates/video/src/h264/encode/mod.rs:630`: the enabled `threads` feature always
constructs a Rayon thread pool, even when configured for one worker. Browser
wasm32 cannot create that OS thread. This is a demonstrated upstream runtime
defect; no usable exported MP4 or full native parity has been established.

`patches/filmcraft-wasm-encoder.patch` is a narrow proposed correction for that
exact dependency revision. It selects the encoder's existing serial branches
on wasm32 in `mod.rs`, `lookahead.rs` and `picture.rs`. It retains native
parallel branches and all encoder profiles, rate control and file outputs.
The patch passed `git apply --check` against the pinned source. **It has not
been applied, rebuilt or browser-verified.** No Cargo cache was modified.

To continue, copy the pinned craft-libs source to an isolated build overlay,
apply the patch there, and use a Cargo patch for the video package. Preserve
the Git source identity of `craft-media` dependencies when forming the local
overlay; otherwise Rust sees different local/Git media types. Create any
necessary updated lockfile only in a FilmCraft build fork, leaving the original
source and original lock untouched. Record the exact dependency revision and
patch hash, then rebuild and rerun import/playback/export. Require a nonempty
MP4, `ffprobe` identifying H.264 and an independent complete FFmpeg decode
before calling export fixed.

Runtime evidence is outside the checkout:

- `/workspace/build/storytold/filmcraft/release-runtime-check/report.json`
- `/workspace/build/storytold/filmcraft/source-runtime-check/report.json`
- corresponding screenshots and logs in the same build directories
- `/workspace/build/storytold/filmcraft/verify-release.py` (real-runtime test harness)

The first run without a trusted user gesture held the audio clock at zero;
the gesture-enabled reruns advanced the playhead and isolated the distinct
encoder failure. Project save/reopen was scheduled after the export gate and
was not executed once export failed. No artifact was deployed or published.
