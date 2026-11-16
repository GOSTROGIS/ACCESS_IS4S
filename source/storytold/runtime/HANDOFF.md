# Full-application integration handoff

The required deliverable is the actual upstream applications with their
implemented functionality working through IS4S. Lessons, diagrams, source
inventories, static screenshots, mock dashboards and simplified editors do not
meet that requirement. Keep work on `main`. Do not describe incomplete native
or browser functionality as complete.

## Existing source and prepared work

- IS4S: `GOSTROGIS/ACCESS_IS4S`, branch `main`.
- Upstream organisation: <https://github.com/orgs/storytold/repositories>.
- The 82 source checkouts in this environment are under
  `/workspace/vendor-sources/storytold/`; pinned acquisition records are in
  `source/storytold/source-snapshot.json`.
- `app-targets.json` inventories 21 actual app/runtime targets and their
  upstream browser/native entry points. Remaining repositories supply
  libraries, infrastructure and research dependencies.
- `cadcraft-build.sh` and `filmcraft-build.sh` build actual upstream WASM
  packages. `import_releases.py` verifies and stages actual released packages.
- `native-host/` prepares a pinned LinuxServer Webtop/Selkies desktop runtime
  and a checksum/signature-verified native app installer. It has not been
  deployed or established as a complete application service.

## Evidence and open failures as of handoff

These are specific checks, not claims of full feature parity:

- Seventeen complete official browser distributions were downloaded with
  checksum/signature receipts. Original assets are retained under
  `/workspace/build/storytold/releases/`; staging and browser reports are under
  `/workspace/build/storytold/release-apps/`. Fifteen unchanged distributions
  rendered genuine application UI. Startup alone does not prove their tools
  work.
- CADCraft v0.20.1: its command catalogue lists 516 commands. Representative
  actual-engine checks passed for line/circle creation, undo/redo, DXF save and
  reopen, SVG/PNG/PDF output, and real toolbar Open/Save. Reports and screenshots
  are under `/workspace/build/storytold/cadcraft/release/qa/`. Native DWG and
  other native-only capabilities remain outside this WASM build.
- FilmCraft v0.20.1: the actual release and a locally compiled source build
  imported an H.264/AAC MP4, created a sequence, and played frames after a user
  gesture. H.264 export failed with `cannot build the 1-thread pool: operation
  not supported on this platform`. The dependency's Rayon pool creation needs
  a narrow WASM-compatible serial-path fix, followed by a real exported MP4
  checked using ffprobe and full decode. Do not claim video export works yet.
  Reports are under `/workspace/build/storytold/filmcraft/`.
- PhotoCraft v0.23.1 has an upstream snippet-path packaging defect. A separate
  candidate fixes it by adding a byte-identical snippet at the expected URL;
  all original assets remain unchanged. The candidate receipt is under
  `/workspace/build/storytold/release-candidates/photocraft/`.
- TextureCraft startup remained unverified in headless software rendering.
- AniCraft has no browser ZIP in its inspected latest release; a genuine
  source build is needed.
- Native/runtime gaps include SoundCraft browser recording, AniCraft browser
  video export, CADCraft DWG, Craft Anything's native inspection/agent/device
  workflows, launcher installation, AutoCraft's server/auth/runner, and
  Artcraft's native/provider services. Use the actual code and supplied matrix
  to confirm the exact gaps; some upstream docs are stale.

## Hosting and deployment requirements

The user is arranging their organisation's intranet. Discover its approved
container/VM platform, network route and authentication configuration through
the available environment and documents. Ask for a hostname/access method only
when missing. Never invent infrastructure or credentials, and keep secrets and
private organisational configuration out of this public repository.

Use real native services, a native companion, or an authenticated streamed
native desktop for functionality unavailable in WASM. Verify audio input and
output, GPU requirements, file upload/download, persistent documents, session
isolation, HTTPS/WebSockets, and organisational sign-in. A blank streamed
desktop is not a complete tool integration. Do not use a static mock build of
AutoCraft or replace real native work with fake results.

Retain complete source licences/attribution and replace excluded trademarks in
modified forks. Preserve every application feature and required worker/font/
model asset. Test functional workflows per tool, then deploy and verify the
actual intranet URLs. Finish the requested lessons and automatic update system
alongside the real tools; they are not substitutes for them.

Automatic updates must update the actual app runtimes, run functional tests,
preserve user files and allow rollback. The separate pending source/helper
updater is deliberately not scheduled and does not satisfy full application
updates by itself.
