#!/usr/bin/env bash
# Build FilmCraft WASM from the selected upstream checkout or IS4S worktree.
# Usage: bash source/storytold/runtime/filmcraft-build.sh [SOURCE_CHECKOUT] [BUILD_ROOT]
# Install prerequisites separately: Rust 1.95.0 + wasm32 target and wasm-bindgen-cli 0.2.129.
set -euo pipefail

filmcraft_source="${1:-/workspace/vendor-sources/storytold/filmcraft}"
filmcraft_build="${2:-/workspace/build/storytold/filmcraft}"
filmcraft_toolchain="${FILMCRAFT_TOOLCHAIN:-1.95.0}"
filmcraft_profile="${FILMCRAFT_PROFILE:-release}"
case "$filmcraft_profile" in release) filmcraft_profile_dir=release ;; dev) filmcraft_profile_dir=debug ;; *) printf 'FILMCRAFT_PROFILE must be release or dev.\n' >&2; exit 2 ;; esac

export CARGO_HOME="${CARGO_HOME:-/workspace/.tools/rust/cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-/workspace/.tools/rust/rustup}"
export PATH="$CARGO_HOME/bin:$PATH"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/workspace/build/storytold/shared-target}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-3}"
export CARGO_NET_GIT_FETCH_WITH_CLI=true

test -f "$filmcraft_source/apps/filmcraft-web/Cargo.toml"
test -f "$filmcraft_source/Cargo.lock"
command -v cargo >/dev/null
command -v rustup >/dev/null
if ! command -v wasm-bindgen >/dev/null || [[ "$(wasm-bindgen --version)" != 'wasm-bindgen 0.2.129' ]]; then
  printf 'FilmCraft needs wasm-bindgen-cli exactly 0.2.129. Install with: cargo +%s install wasm-bindgen-cli --version 0.2.129 --locked\n' "$filmcraft_toolchain" >&2
  exit 2
fi
if ! rustup target list --installed --toolchain "$filmcraft_toolchain" | rg -qx wasm32-unknown-unknown; then
  printf 'Install the target with: rustup target add --toolchain %s wasm32-unknown-unknown\n' "$filmcraft_toolchain" >&2
  exit 2
fi

mkdir -p "$filmcraft_build"
filmcraft_source="$(cd "$filmcraft_source" && pwd)"
filmcraft_build="$(cd "$filmcraft_build" && pwd)"
filmcraft_commit="$(git -C "$filmcraft_source" rev-parse --verify HEAD^{commit})"
filmcraft_lock_before="$(sha256sum "$filmcraft_source/Cargo.lock" | cut -d' ' -f1)"

# No feature exclusions: compile the actual complete upstream web package. The explicit
# packaging-only mode reuses a completed build so another suite member may use Cargo's
# shared target lock while wasm-bindgen prepares this app's exclusive static directory.
if [[ "${FILMCRAFT_SKIP_BUILD:-0}" == 1 ]]; then
  test -f "$CARGO_TARGET_DIR/wasm32-unknown-unknown/$filmcraft_profile_dir/filmcraft_web.wasm"
  printf 'Packaging existing FilmCraft WASM; no Cargo build executed in this invocation.\n'
else
  (
    cd "$filmcraft_source"
    cargo +"$filmcraft_toolchain" build --locked --target wasm32-unknown-unknown -p filmcraft-web --profile "$filmcraft_profile"
  ) 2>&1 | tee "$filmcraft_build/build.log"
fi
test "$filmcraft_lock_before" = "$(sha256sum "$filmcraft_source/Cargo.lock" | cut -d' ' -f1)"

# Do not use the upstream xtask's shared <target>/web/dist: another Craft build may be
# preparing its assets concurrently. Glue and copied assets get a FilmCraft-only directory.
filmcraft_dist="$filmcraft_build/dist-$filmcraft_commit-$filmcraft_profile"
mkdir -p "$filmcraft_dist"
wasm-bindgen --target web --no-typescript --out-dir "$filmcraft_dist" "$CARGO_TARGET_DIR/wasm32-unknown-unknown/$filmcraft_profile_dir/filmcraft_web.wasm"

python3 - "$filmcraft_source" "$filmcraft_dist" "$filmcraft_commit" "$filmcraft_profile" <<'PY'
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys

source, dist = map(Path, sys.argv[1:3])
commit, profile = sys.argv[3:5]
# Match upstream xtask cache busting, including the u64 wrap of its FNV-1a hash.
build = 0xcbf29ce484222325
for name in ['filmcraft_web.js', 'filmcraft_web_bg.wasm']:
    for byte in (dist / name).read_bytes():
        build = ((build ^ byte) * 0x100000001b3) & 0xffffffffffffffff
build_hash = f'{build:016x}'
for path in (source / 'apps/filmcraft-web/web').iterdir():
    if not path.is_file():
        continue
    if path.name == 'index.html':
        (dist / path.name).write_text(path.read_text().replace('__FC_BUILD__', build_hash))
    else:
        shutil.copy2(path, dist / path.name)
licences = dist / 'licences/filmcraft'
licences.mkdir(parents=True, exist_ok=True)
for name in ['README.md', 'LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'COPYRIGHT', 'NOTICE', 'ATTRIBUTION.md']:
    path = source / name
    if path.is_file():
        shutil.copy2(path, licences / name)
for path in (source / 'assets/fonts').glob('OFL-*.txt'):
    shutil.copy2(path, licences / path.name)
app_icon_licence = source / 'assets/app-icon/LICENSE.txt'
if app_icon_licence.is_file():
    shutil.copy2(app_icon_licence, licences / 'app-icon-LICENSE.txt')
files = {}
for path in sorted(dist.rglob('*')):
    if path.is_file() and path.name != 'build-manifest.json':
        files[path.relative_to(dist).as_posix()] = {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
source_diff = subprocess.run(['git', '-C', str(source), 'diff', '--binary', 'HEAD'], check=True, capture_output=True).stdout
(dist / 'build-manifest.json').write_text(json.dumps({
    'application': 'FilmCraft', 'source': 'https://github.com/storytold/filmcraft',
    'commit': commit, 'profile': profile, 'package': 'filmcraft-web',
    'target': 'wasm32-unknown-unknown', 'wasmBindgen': '0.2.129',
    'features': 'Upstream web package defaults; no IS4S feature exclusions.',
    'sourceModified': bool(source_diff),
    'sourceDiffSha256': hashlib.sha256(source_diff).hexdigest() if source_diff else None,
    'cacheKey': build_hash, 'files': files,
    'status': 'Built source application; browser functionality requires separate runtime verification. No publication performed.',
}, indent=2) + '\n')
assert (dist / 'index.html').is_file()
assert (dist / 'audio-worklet.js').is_file()
assert (dist / 'filmcraft_web_bg.wasm').stat().st_size > 1024
print(f'FilmCraft static build prepared at {dist}')
PY
printf 'Build only: %s\nNo deployment or browser-functionality claim was made.\n' "$filmcraft_dist"
