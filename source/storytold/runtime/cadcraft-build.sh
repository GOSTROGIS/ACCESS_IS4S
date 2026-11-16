#!/usr/bin/env bash
# Build the actual upstream CADCraft browser application, without changing its source.
# --cargo-only compiles the locked WASM binary while Trunk is being prepared.
# --package-only lets Trunk reuse a completed Cargo build and emit the static site.
set -euo pipefail

mode="${1:-all}"
case "$mode" in
  all|--cargo-only|--package-only) ;;
  *) printf '%s\n' 'Usage: cadcraft-build.sh [--cargo-only|--package-only]' >&2; exit 2 ;;
esac

source_root="${CADCRAFT_SOURCE_ROOT:-/workspace/vendor-sources/storytold/cadcraft}"
build_root="${CADCRAFT_BUILD_ROOT:-/workspace/build/storytold/cadcraft}"
export CARGO_HOME="${CARGO_HOME:-/workspace/.tools/rust/cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-/workspace/.tools/rust/rustup}"
export RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-1.95.0}"
export PATH="$CARGO_HOME/bin:$PATH"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/workspace/build/storytold/shared-target}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-3}"
export CARGO_NET_GIT_FETCH_WITH_CLI=true
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/workspace/.cache}"
export CRAFT_FONTS_DIR="${CRAFT_FONTS_DIR:-/workspace/vendor-sources/storytold/craft-fonts}"
export CRAFT_FONTS_REQUIRED=1

test -f "$source_root/apps/cadcraft-web/Cargo.toml"
test -f "$source_root/Cargo.lock"
command -v cargo >/dev/null
command -v rustc >/dev/null
mkdir -p "$build_root" "$CARGO_TARGET_DIR" "$XDG_CACHE_HOME"

# Verify the four font families the upstream build embeds on wasm. This also
# rejects Git LFS pointer files rather than packaging an incomplete font input.
python3 - "$CRAFT_FONTS_DIR" <<'PY'
import hashlib
from pathlib import Path
import sys
root = Path(sys.argv[1]).resolve()
for line in (root / 'fonts/manifest.txt').read_text().splitlines():
    if not line or line.startswith('#'):
        continue
    family, style, filename, scripts, licence, licence_file, expected, *_ = [part.strip() for part in line.split(' | ')]
    selected = (family == 'BIZ UDPGothic' and style == 'Regular') or any(script in scripts.split(',') for script in ['Arab', 'Geor']) or ('Thai' in scripts.split(',') and style == 'Regular')
    if not selected:
        continue
    path = (root / filename).resolve()
    path.relative_to(root)
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit(f'Font checksum does not match upstream manifest: {filename}')
    if not (root / licence_file).is_file():
        raise SystemExit(f'Missing font licence: {licence_file}')
PY

export CADCRAFT_BUILD_SHA="$(git -C "$source_root" rev-parse --verify 'HEAD^{commit}')"
export CADCRAFT_BUILD_DATE="$(date -u +%Y-%m-%d)"

if [[ "$mode" != '--package-only' ]]; then
  cd "$source_root"
  cargo build --locked --release --target wasm32-unknown-unknown -p cadcraft-web --jobs "$CARGO_BUILD_JOBS"
fi

if [[ "$mode" != '--cargo-only' ]]; then
  command -v trunk >/dev/null
  cd "$source_root/apps/cadcraft-web"
  # Upstream index.html requests wasm-opt z and weak references. Keep both;
  # do not substitute a reduced drawing model or remove application features.
  trunk build --locked --release --dist "$build_root/site" --public-url './'
  python3 - "$source_root" "$build_root/site" "$CRAFT_FONTS_DIR" <<'PY'
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
source, site, fonts = map(Path, sys.argv[1:])
assert (site / 'index.html').is_file(), 'Trunk did not emit index.html'
wasm = list(site.glob('*.wasm'))
assert wasm and all(path.stat().st_size > 8 for path in wasm), 'Trunk did not emit a WASM application'
assert any(site.glob('*.js')), 'Trunk did not emit the wasm-bindgen loader'
licences = site / 'licences'
licences.mkdir(exist_ok=True)
for name in ['LICENSE-MIT', 'LICENSE-APACHE', 'ATTRIBUTION.md', 'NOTICE']:
    path = source / name
    if path.is_file():
        shutil.copy2(path, licences / name)
for path in fonts.glob('fonts/*/OFL.txt'):
    shutil.copy2(path, licences / f'OFL-{path.parent.name}.txt')
files = {path.relative_to(site).as_posix(): {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(site.rglob('*')) if path.is_file() and path.name != 'build-provenance.json'}
record = {'application': 'CADCraft', 'source': 'https://github.com/storytold/cadcraft', 'commit': subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip(), 'build': 'upstream cadcraft-web via Cargo/Trunk; no application-source modifications', 'files': files}
(site / 'build-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print(f'CADCraft static application packaged at {site}')
PY
fi
