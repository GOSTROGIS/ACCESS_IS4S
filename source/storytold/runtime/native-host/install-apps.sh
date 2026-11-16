#!/usr/bin/env bash
# Run explicitly as the desktop user. No application is installed by compose alone.
# Default --check verifies release metadata only. --install downloads actual native
# releases and adds launchers; it never launches an app or claims feature readiness.
set -euo pipefail
exec python3 - "$@" <<'PY'
import argparse
from pathlib import Path
import hashlib
import json
import os
import platform
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed (exit {result.returncode}); no installed version was replaced')
    return result.stdout


def fetch(url, destination):
    # curl's normal certificate verification is retained; only HTTPS is allowed.
    command(['curl', '--disable', '--fail', '--silent', '--show-error', '--location',
             '--proto', '=https', '--proto-redir', '=https', '--tlsv1.2', '--max-time', '300',
             url, '--output', str(destination)])


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify_manifest(base, cache, expected_fingerprint):
    if not re.fullmatch(r'[A-F0-9]{40}', expected_fingerprint or ''):
        raise RuntimeError('Missing pinned signing fingerprint')
    for filename in ['SHA256SUMS.txt', 'SHA256SUMS.txt.asc', 'release-signing-key.asc']:
        fetch(f'{base}/{filename}', cache / filename)
    with tempfile.TemporaryDirectory(prefix='gpg-', dir=cache) as temporary:
        Path(temporary).chmod(0o700)
        gpg = ['gpg', '--no-options', '--homedir', temporary, '--batch', '--no-auto-key-retrieve']
        command([*gpg, '--import', str(cache / 'release-signing-key.asc')])
        status = command([*gpg, '--status-fd', '1',
                          '--verify', str(cache / 'SHA256SUMS.txt.asc'),
                          str(cache / 'SHA256SUMS.txt')])
        fingerprints = re.findall(r'^\[GNUPG:\] VALIDSIG ([A-F0-9]+)\s', status, flags=re.MULTILINE)
        if expected_fingerprint not in fingerprints:
            raise RuntimeError('Release checksum manifest did not match the pinned signing fingerprint')
    sums = {}
    for line in (cache / 'SHA256SUMS.txt').read_text().splitlines():
        match = re.fullmatch(r'([a-fA-F0-9]{64})\s+\*?(.+?)\s*', line)
        if match:
            sums[match.group(2).removeprefix('./')] = match.group(1).lower()
    return sums


def release_for(target):
    return target.get('nativeReleaseArtifact') or target.get('releaseArtifact') or {}


def include_notices(name, artifact, stage):
    notices = artifact.get('noticeSha256')
    if not notices:
        return
    commit = artifact.get('noticeCommit', '')
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise RuntimeError('Invalid notice source commit')
    destination = stage / 'upstream-notices'
    destination.mkdir()
    for filename, checksum in notices.items():
        if filename not in {'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE'}:
            raise RuntimeError('Unknown notice file name')
        path = destination / filename
        fetch(f'https://raw.githubusercontent.com/storytold/{name}/{commit}/{filename}', path)
        if sha256(path) != checksum:
            raise RuntimeError(f'{name}: upstream notice differs from the pinned file')


def install(target, architecture, root, cache_root, apply):
    name = target['id']
    artifact = release_for(target)
    tag = artifact.get('tag') or ''
    version_tag = tag.removeprefix('artcraft-') if name == 'artcraft' else tag
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) or not re.fullmatch(r'v?\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?', version_tag):
        raise RuntimeError(f'{name}: no supported pinned native release is recorded')
    base = f'https://github.com/storytold/{name}/releases/download/{tag}'
    cache = cache_root / name / tag
    cache.mkdir(parents=True, exist_ok=True)
    fingerprint = artifact.get('signingKeyFingerprint')
    sums = verify_manifest(base, cache, fingerprint)
    program = 'artcraft-launcher' if name == 'craft-launcher' else name
    suffix = f'-linux-{architecture}.tar.gz'
    filename = f'{program}-{version_tag.removeprefix("v")}{suffix}'
    if filename not in sums:
        candidates = [entry for entry in sums if entry.endswith(suffix)
                      and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]+', entry)
                      and not entry.startswith((f'{program}-cli-', f'{program}-server-'))]
        if len(candidates) != 1:
            raise RuntimeError(f'{name}: expected one published native Linux {architecture} app tarball; found {len(candidates)}')
        filename = candidates[0]
    expected = sums[filename]
    hashes = artifact.get('sha256ByArchitecture')
    if hashes and hashes.get(architecture) != expected:
        raise RuntimeError(f'{name}: signed archive checksum differs from the pinned architecture digest')
    print(f'{name}: signed manifest identifies {filename} SHA256={expected}', flush=True)
    if not apply:
        return
    if sys.version_info < (3, 12):
        raise RuntimeError('Native extraction needs Python 3.12+ with the data extraction filter')
    if shutil.disk_usage(root).free < 3 * 1024 ** 3:
        raise RuntimeError('Fewer than 3 GiB remain; another native installation was not started')
    archive = cache / filename
    if archive.exists():
        if sha256(archive) != expected:
            raise RuntimeError(f'{name}: existing archive fails the official checksum; it was preserved and not used')
    else:
        partial = cache / (filename + '.partial')
        fetch(f'{base}/{filename}', partial)
        if sha256(partial) != expected:
            raise RuntimeError(f'{name}: downloaded archive fails the official checksum; partial file was not used')
        partial.rename(archive)
    version_root = root / name / tag
    if version_root.exists():
        print(f'{name}: existing version directory preserved; not overwriting it', flush=True)
        return
    version_root.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.install-', dir=version_root.parent) as temporary:
        stage = Path(temporary) / 'app'
        stage.mkdir()
        with tarfile.open(archive, 'r:gz') as package:
            members = package.getmembers()
            if sum(member.size for member in members) > 4 * 1024 ** 3:
                raise RuntimeError('Unexpected archive expansion; extraction refused')
            package.extractall(stage, filter='data')
        binaries = [p for p in stage.rglob(program)
                    if p.is_file() and p.parent.name == 'bin' and os.access(p, os.X_OK)]
        if len(binaries) != 1:
            raise RuntimeError(f'{name}: native executable was not found unambiguously; installation refused')
        executable_relative = binaries[0].relative_to(stage)
        include_notices(name, artifact, stage)
        (stage / 'is4s-install-receipt.json').write_text(json.dumps({
            'repository': name, 'tag': tag, 'archive': filename,
            'sha256Expected': expected, 'sha256Actual': sha256(archive),
            'checksumManifest': base + '/SHA256SUMS.txt',
            'signingKeyFingerprint': fingerprint,
            'signatureScope': 'Signed checksum manifest matched the repository-pinned fingerprint',
            'executable': str(executable_relative),
            'runtimeValidation': 'Not launched or feature-tested by installer',
        }, indent=2) + '\n')
        stage.rename(version_root)
    binary = version_root / executable_relative
    local_bin = Path('/config/.local/bin')
    applications = Path('/config/.local/share/applications')
    local_bin.mkdir(parents=True, exist_ok=True)
    applications.mkdir(parents=True, exist_ok=True)
    launcher = local_bin / f'is4s-{name}'
    # The binary is an actual verified native release, not a simulated web app.
    launcher.write_text('#!/usr/bin/env bash\nexec ' + shlex.quote(str(binary)) + ' "$@"\n')
    launcher.chmod(0o755)
    entry = applications / f'is4s-{name}.desktop'
    entry.write_text('[Desktop Entry]\nType=Application\n'
                     f'Name={target.get("id", name)}\n'
                     f'Exec={json.dumps(str(launcher))}\n'
                     'Terminal=false\nCategories=Graphics;Education;\n')
    print(f'{name}: installed {binary}; launch and test it before marking the tool ready', flush=True)


def main():
    parser = argparse.ArgumentParser(description='Inspect or install pinned genuine native Storytold Linux apps.')
    parser.add_argument('--app', action='append', default=[], help='Exact repository id; repeat for several apps')
    parser.add_argument('--all', action='store_true', help='All targets with a pinned release record, excluding service-only apps')
    parser.add_argument('--install', action='store_true', help='Download and install real native binaries; default is metadata check only')
    parser.add_argument('--check', action='store_true', help='Explicitly select the default metadata-only check')
    parser.add_argument('--targets', type=Path, default=Path(os.environ.get('IS4S_APP_TARGETS', '/opt/is4s/app-targets.json')))
    parser.add_argument('--root', type=Path, default=Path(os.environ.get('IS4S_APPS_DIR', '/config/is4s-apps')))
    parser.add_argument('--cache', type=Path, default=Path('/config/.cache/is4s-native-releases'))
    args = parser.parse_args()
    if args.install and args.check:
        parser.error('Choose --install or --check, not both')
    if not args.app and not args.all:
        parser.error('Choose at least one --app or --all')
    for program in ['curl', 'gpg']:
        if not shutil.which(program):
            parser.error(f'{program} is required; install it from the host distribution before running')
    architecture = {'x86_64': 'x86_64', 'amd64': 'x86_64', 'aarch64': 'aarch64', 'arm64': 'aarch64'}.get(platform.machine().lower())
    if not architecture:
        parser.error('Only actual x86_64 or aarch64 Linux release targets are supported')
    targets = {item['id']: item for item in json.loads(args.targets.read_text())['targets']}
    chosen = [name for name, target in targets.items() if release_for(target).get('tag')] if args.all else args.app
    args.root.mkdir(parents=True, exist_ok=True)
    args.cache.mkdir(parents=True, exist_ok=True)
    failed = []
    for name in chosen:
        try:
            if name not in targets:
                raise RuntimeError(f'Unknown application id: {name}')
            install(targets[name], architecture, args.root, args.cache, args.install)
        except Exception as error:
            failed.append(name)
            print(f'{name}: BLOCKED: {error}', file=sys.stderr, flush=True)
    print(f'{len(chosen) - len(failed)}/{len(chosen)} release operations completed. '
          'Application feature readiness has not been established.', flush=True)
    return bool(failed)


raise SystemExit(main())
PY
