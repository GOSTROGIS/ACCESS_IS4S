# Actual Storytold application targets

`app-targets.json` records the supplied runtime architecture for all **21**
user-facing or maintainer applications in the acquired source collection:
17 Rust creative/analysis tools, ArtCraft, ArtCraft-X, AutoCraft and Craft
Launcher. The remaining repositories are supporting libraries, infrastructure
or research. They are not 61 more complete applications.

The inventory distinguishes source inspection, downloaded executable web
distributions, and functional verification. **This audit did not execute any
upstream application.** A source checkout, a loaded canvas, a lesson, a mock
dashboard or a source catalogue is not evidence that all tool features work.

## Prepared executable web distributions

### Acquire and stage the pinned releases

Run from the IS4S checkout with Node.js 22 or later, pnpm, curl and Python 3.12
or later. Set `RELEASE_CACHE`, `STAGED_APPS` and `HOSTING_CANDIDATES` to writable
directories outside the public checkout. Install the locked verifier and stage
the complete upstream packages:

```sh
pnpm --dir source/storytold/runtime install --frozen-lockfile --ignore-scripts
node source/storytold/runtime/acquire-web-releases.mjs "$RELEASE_CACHE"
python3 source/storytold/runtime/import_releases.py \
  --manifest "$RELEASE_CACHE/web-assets-manifest.json" \
  --output "$STAGED_APPS" --prepare-hosting-fixes \
  --candidate-output "$HOSTING_CANDIDATES"
```

The acquisition command checks the detached signature using the signer
fingerprint recorded in `app-targets.json`, then matches the application ZIP
against both the signed checksum and the checked-in SHA-256. It verifies
cached releases again on every run. An invalid release fails acquisition
before a new manifest is published. For PhotoCraft v0.23.1, use the path in
`hosting-fixes-report.json` to test the corrected distribution. Its extra
snippet is copied from the verified archive.

Run `verify-photocraft-browser.py` with the corrected app directory. The
test environment needs Playwright, Pillow and `psd-tools`. The test opens a
PNG in the real editor, paints on a separate layer, downloads and reopens a
PSD, and compares the independently decoded PNG exports. Use
`--chromium-executable` to select an installed browser if needed.

[Application labs](lessons.md) cover the PhotoCraft and CADCraft editing,
save/reopen and export workflows.

### Evidence from the handoff

Seventeen real upstream web ZIPs were downloaded from official GitHub stable
release pages into `/workspace/build/storytold/releases/`. Their corresponding
HTML, JavaScript, WebAssembly, fonts, models, workers and licence files were
extracted there without running them. Each archive is recorded with:

- the actual stable-release page and ZIP URL;
- the exact SHA-256 from the published `SHA256SUMS.txt` and the independently
  computed ZIP SHA-256;
- a successful detached-signature check on that manifest;
- the signing-key fingerprint, retained signature/checksum files and extracted
  entry point.

The signature check used the public key supplied by the **same official
release**. That establishes mathematical consistency with that key; its
fingerprint was not independently attested. TLS and checksum/signature
verification were not disabled or bypassed.

The acquisition receipt, including ready-to-serve `webRoot` paths, is
`/workspace/build/storytold/releases/web-assets-manifest.json`. The same
verified data is included per target in `app-targets.json`.

| App | Stable web artifact inspected | Source build entry | Full-native feature boundary |
| --- | --- | --- | --- |
| VectorCraft | 0.24.1, verified ZIP | `apps/vectorcraft-web` with Trunk | Browser/native parity still needs feature tests. |
| FilmCraft | 0.20.1, verified ZIP | `cargo xtask web` | Browser media/threads replace native implementations; codec/export paths need tests. |
| WordCraft | 0.18.1, verified ZIP | `apps/wordcraft-web` with Trunk | Browser pickers/downloads replace OS paths; test real roundtrips and review operations. |
| EffectCraft | 0.24.1, verified ZIP | `cargo xtask web` | Worker instances replace native/shared-memory threading; real rendering needs tests. |
| PhotoCraft | 0.23.1, verified ZIP | App and boot Trunk targets via `packaging/web/package.sh` | Use the packaged bootstrap/parts, not an incomplete copied wasm file. |
| FigCraft | 0.18.1, verified ZIP | `apps/figcraft-web` with Trunk | Joins live sessions; cannot host one. Remote HTTPS collaboration needs a secure WebSocket server. |
| PdfCraft | 0.21.1, verified ZIP | `apps/pdfcraft-web` with Trunk | Source builds need a separate OCR-model step. Native printing/Tesseract are not ordinary static-web services. |
| DesignCraft | 0.20.1, verified ZIP | `apps/designcraft-web` with Trunk | No native TCP control channel; inspected source version is newer than the stable bundle. |
| TextureCraft | 0.6.1, verified ZIP | `apps/texturecraft-web` with Trunk | Test actual model/paint/project/map operations; browser parity is not established here. |
| LightCraft | 0.21.1, verified ZIP | `cargo xtask web` | Origin-specific browser library, one owning tab; native folder services differ. |
| AniCraft | No ZIP in stable 0.2.1 | `scripts/build-web.sh` | Video export through ffmpeg, installing filesystem plug-ins and some native services are unavailable in the web target. |
| DeckCraft | 0.18.1, verified ZIP | `apps/deckcraft-web` with Trunk | Inspected source version is newer; test real PPTX, presentation/media and exports at the selected build. |
| CADCraft | 0.20.1, verified ZIP | `apps/cadcraft-web` with Trunk | Inspected source version is newer; verify actual drawing/file/plot features. |
| GridCraft | 0.19.1, verified ZIP | `apps/gridcraft-web` with Trunk | Test actual formula/XLSX/chart/export paths, not a sample-only sheet. |
| SoundCraft | 0.20.1, verified ZIP | `apps/soundcraft-web` with Trunk | Web recording and native TCP control are absent. Browser source does support real file imports and `.scraftz` downloads. |
| MaterialCraft | 0.4.1, verified ZIP | `apps/materialcraft-web` with Trunk | Test real graph evaluation/package/map export operations. |
| Craft Anything | 0.6.1, verified ZIP | `apps/craft-anything-web` with Trunk, Rust 1.97+ | The browser target is a small signature/native-header triage viewer. It explicitly does not open containers or code; desktop analysis, devices and AI reconstruction remain outside it. |
| ArtCraft | No standalone full web app supplied | `script/artcraft/unix_dev.sh` | React frontend calls native Tauri services and external generation providers. |
| ArtCraft-X | No standalone full web app supplied | `script/unix_dev.sh` | Experimental Tauri frontend needs Rust IPC and provider access. |
| AutoCraft | Real server required | `node src/cli.ts dash serve` plus runner | Static/dev mock builds intentionally use fixtures. Real operations require Node 24+, SQLite, sign-in, model accounts and a runner. |
| Craft Launcher | 0.19.2, verified ZIP | `apps/artcraft-launcher-web` with Trunk | Browser target is a release/download catalogue; native installation, update and launch require the native app. |

Exact source entry paths, build commands, source commits, runtime requirements,
documented gaps and suggested feature-acceptance cases are in the JSON.
Official product pages are identified separately from working demo URLs. No
public running-demo URL was found in the inspected README/hosting docs, and
none was invented. A downloadable web ZIP is not a hosted demo.

## Source and release versions are different evidence

DesignCraft, DeckCraft and CADCraft sources inspected here are ahead of their
latest stable web releases. A release ZIP cannot be described as containing
every feature or fix on source `main`. Source-build receipts must identify the
commit and actual produced files separately from these downloaded releases.

Craft Anything's packaging prose describes more analysis than its actual
`apps/craft-anything-web/src/main.rs` and `triage.rs` implement. The inventory
uses the narrower code evidence: native-header/signature triage, SHA-256 and
entropy. Likewise, SoundCraft's lack of **native** file dialogs must not be
misread as absence of all browser file operations: its web source wires a
browser file picker and bundle downloads.

## Hosting and integration plan

1. Serve each verified web distribution at its own versioned path, preserving
   all same-build files and licences. Use its relative-URL entry point. An
   IS4S shell may embed the real app, or the documented module/host bridge may
   mount it directly. A shell must expose actual load failures instead of
   treating a placeholder canvas as readiness.
2. Where supplied, use the **same-origin** `?host=parent` bridge for genuine
   open/save/dirty messages. Validate origin, sender, file type and size, and
   test exported data. The protocol differs by app; inspect that app's hosting
   document instead of assuming one message schema fits every tool.
3. For required native-only operations, run the real native app or implement a
   deliberately scoped, authenticated native/server companion. AutoCraft needs
   its actual backend and runner; ArtCraft/ArtCraft-X need real native IPC and
   provider connections; FigCraft collaboration needs its real server; the
   native launcher needs OS installation/update services. None of these become
   available merely by copying `index.html` to GitHub Pages.
4. Run the target's feature cases against the **actual application** and its
   saved/exported artifacts. The JSON records these cases as unrun, not passed.
   Complete native parity can be claimed only after the requested native-only
   cases also work through the chosen deployment architecture.

GitHub Pages serves static artifacts and HTTPS. It does not execute Node/Rust
servers, Tauri IPC, SQLite, provider credentials, native ffmpeg, persistent
workers or native app installation. It also does not apply Netlify `_headers`
or Apache `.htaccess` rules. Current inspected web distributions generally say
they do **not** require SharedArrayBuffer isolation headers; a future threaded
build must be checked again. Browser graphics/clipboard/storage permissions
and file downloads still need appropriate iframe permissions and user actions.

The 17 downloaded bundles expand to **706.7 MiB**, before the existing IS4S
site. The largest file is VectorCraft's approximately **97.5 MiB** module.
Measure the aggregate site against GitHub Pages' 1 GiB site limit and Git's
100 MiB individual-file limit before publishing all bundles in one site. Fonts,
models and worker files cannot be omitted while claiming their functionality.

The native launcher also supplies an actual local-build mirror mechanism:

```sh
cargo xtask local sync
cargo xtask local serve --sync-every 1h
```

Its README explains `--every-commit`, per-app builds and the `local-mirror`
feature. That is a native service/build workflow, not a static-page updater.
It has not been executed by this inventory audit.
