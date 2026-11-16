# CADCraft runtime inspection

This records the real upstream application and platform boundaries, rather
than treating an instructional SVG or a tool inventory as the CAD program.

Inspected source: `storytold/cadcraft` commit
`16341b665fa358d6fa1847e4f2325b5a5b0ec037`, workspace version `0.21.0`.
The upstream `AGENTS.md`, `ROADMAP.md`, `docs/gaps.md`, web entry point and
file/host bridge code were inspected before build work.

## Actual browser entry and toolchain

- `apps/cadcraft-web` runs the same `cadcraft_ui_egui::CadApp` and drawing
  engine used by the desktop application, hosted by eframe's web runner.
- The package requires Rust `1.95`; the lockfile pins `wasm-bindgen 0.2.129`.
  The shared upstream release workflow pins Trunk `0.21.14`.
- The normal renderer uses WebGPU, with WebGL2 fallback. `?webgl` forces the
  latter; `?cpu` selects the app's CPU drawing canvas; `?sample` opens its
  synthetic sample drawing. These are upstream options, not replacement apps.
- Upstream Trunk configuration has `public_url = "./"`. The static bundle can
  live under the IS4S project URL and needs normal `.wasm` MIME handling and a
  secure browser context. It does not require SharedArrayBuffer isolation.
- The optional craft-fonts input is enabled by the build helper. The four
  families selected by the upstream wasm font builder have their manifest
  SHA256 values checked before building; their licences accompany packaging.

`cadcraft-build.sh` compiles the locked full web package into the external
build area and packages its real WASM loader/binary. It does not modify the
upstream checkout or deploy anything. `--cargo-only` and `--package-only`
allow toolchain preparation and packaging to be separated without pretending
that a Cargo check is a working web bundle.

## Functionality available in the web application

Source inspection establishes that the web app starts the shared command
registry and CAD UI, installs the real DXF reader/writer, raster decoder,
SVG/PNG/PDF plotting hook and drawing file-download hook. Browser File Open
and drag/drop read selected bytes instead of using operating-system paths.
The menu/command-line drafting, layers/properties, dimensions and export
features use the same application engine rather than an IS4S approximation.

`apps/cadcraft-web/src/api.rs` installs `window.cadcraft`, the upstream page
command API. Its promise-based `request`, `execute`, `commands`, `docInspect`,
`uiInspect` and `screenshot` functions reach the application's actual command
queue. This gives browser validation a way to create a drawing, inspect its
entities and exercise the same engine that the visible UI uses. The app also
provides same-origin iframe or page host bridges for opening bytes and saving
them through a host. An ordinary unhosted page downloads saved files.

## Native/browser differences that remain real

| Area | Browser behavior | Evidence |
| --- | --- | --- |
| DWG | DWG reading and writing are unavailable. The shared `craft-dwg` bridge compiles explicit wasm stubs that return “DWG files can't be opened/written in the web build yet; save as DXF”. The picker offering `.dwg` is not proof of a working DWG decoder. | `craft-libs/crates/dwg/build.rs`, `src/lib.rs` (`no_dwg_bridge`); `docs/gaps.md` FF12 |
| Drawing autosave/recovery | Native drawing autosave is not provided in the web build. Preferences and validated panel placement are stored, which is distinct from saving the drawing. | `apps/cadcraft-web/src/main.rs::Shell::save`; `docs/gaps.md` F4 |
| Filesystem paths | The browser opens supplied file bytes and downloads exports. Commands that require local paths report that paths are unavailable. | `apps/cadcraft-web/src/upload.rs`, `download.rs`; `crates/engine/src/cmd/file.rs` wasm branches |
| Native services | OS windows, a local TCP control listener, native updater checks, and a CLI/MCP process are not served by a static WASM page. The browser has the page command/host APIs instead. | web services setup; `crates/ui-egui/src/updates_ui.rs`; native-only cfg branches |
| Fonts | The browser cannot enumerate a user's system fonts. The upstream-selected craft-fonts subset and own drafting font are embedded. | `crates/fonts/build.rs`; `crates/ui-egui/src/theme.rs` |

These differences mean the existing upstream web build cannot honestly be
described as every native CADCraft function in a static page. Restoring a
missing native capability would require a separately validated port or server
service, not a renamed button or a lesson link.

The upstream application itself is marked pre-alpha. Its documented gaps
include lossy DWG round trips on native builds, approximate some-curve
geometry, incomplete 3D modeling and incomplete production workflows. Building
the full CADCraft application does not establish AutoCAD feature parity.

## Validation status

Source inspection and the selected craft-font SHA256 checks are complete.
The current-source `0.21.0` Cargo build was started with Rust 1.95.0, the locked
dependency graph and the complete upstream web entry. It waited for the shared
artifact-directory lock and then began compiling the real drawing/format/UI
crates. Compilation and packaging are still in progress at this point in the
record; no current-source success is claimed.

The official released browser application **v0.20.1** was independently obtained
and checked against the publisher's `SHA256SUMS.txt`:

```
cadcraft-web-0.20.1.zip
300e870c50b66d371055915ba95e3ddbfd4c45431466d5214743b5dcab95a0e1
```

Its zip is 11,420,690 bytes and its actual WASM binary is 30,882,789 bytes. This
is the upstream release application, not the later `0.21.0` source build.

Chromium validation of this real release under a nested project URL passed:

- The generated WASM loader started the actual CAD UI with WebGL2, with no
  JavaScript page errors. The upstream command catalogue reported 516 entries.
- Real `line` and `circle` engine commands increased the drawing entity count
  from zero to two; Undo removed one entity and Redo restored it.
- Exported DXF bytes were reopened by the application, retaining both entities.
- SVG (6,664 bytes), PNG (45,198 bytes) and PDF (1,714 bytes) exports had the
  expected actual format signatures. The PNG was visually inspected and showed
  the drawn geometry.
- Actual toolbar interaction also passed: after the first app frame, clicking
  Open triggered the browser file picker, opening the exported DXF retained both
  entities, and clicking Save downloaded `drawing.dxf` (18,724 bytes). The UI
  check waits for the app's `uiInspect` reply and painted frames before clicking;
  loader removal alone happens before the first usable canvas frame.
- Desktop UI and drawing screenshots were inspected. At a 390-pixel-wide phone
  viewport the upstream desktop-style panels and menus are clipped; a successful
  engine test does not establish a fully usable phone layout.

The temporary validation script is `/tmp/cadcraft-runtime-check.py`, with results
and screenshots retained under `/workspace/build/storytold/cadcraft/release/qa/`.
No native application, production drawing, DWG round trip, or all-516-command
coverage is claimed by these checks.
