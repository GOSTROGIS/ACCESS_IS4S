"""Stage an owned SLIPCURVE revision and select it at the next local launch."""

import argparse
from contextlib import contextmanager
from hashlib import file_digest, sha256
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
from tempfile import NamedTemporaryFile, TemporaryDirectory


HERE = Path(__file__).resolve().parent
ORIGIN = 'https://github.com/GOSTROGIS/SLIPCURVE.git'
BRANCH = 'refs/heads/main'
REGISTRY = 'active-release.json'
COMMIT = re.compile(r'[0-9a-f]{40}')
HASH = re.compile(r'[0-9a-f]{64}')
RELEASE_FOLDERS = ('client', 'deploy', 'server')
RELEASE_FILES = ('folder-serve.py', 'client-manifest.json')


def digest(path):
    with path.open('rb') as source:
        return file_digest(source, 'sha256').hexdigest()


def canonical(path):
    if path.resolve(strict=True) != path.absolute() or path.is_symlink() or path.is_junction():
        raise ValueError(f'Linked release path: {path.name}')
    return path


def read_json(path):
    return json.loads(canonical(path).read_text(encoding='utf-8'))


def client_release(root):
    release = read_json(root / 'client' / 'deployment.json')
    if not COMMIT.fullmatch(release['revision']) or release['workingTreeModified'] is not False:
        raise ValueError('Expected a clean, pinned SLIPCURVE release')
    return release


def release_tree(home, revision):
    if not COMMIT.fullmatch(revision):
        raise ValueError('Invalid release identifier')
    if client_release(home)['revision'] == revision:
        return home
    return canonical(home / 'releases' / revision)


def registry(home):
    file = home / REGISTRY
    if not file.exists() and not file.is_symlink():
        return {'schema': 1, 'current': {'revision': client_release(home)['revision']}}
    state = read_json(file)
    if state['schema'] != 1 or not COMMIT.fullmatch(state['current']['revision']):
        raise ValueError('Invalid SLIPCURVE release registry')
    return state


def package_digest(root):
    directories = [canonical(root / folder) for folder in RELEASE_FOLDERS]
    files = [root / name for name in RELEASE_FILES]
    for directory in directories:
        for path in directory.rglob('*'):
            canonical(path)
            if path.is_file():
                files.append(path)
    checksum = sha256()
    for path in sorted(files):
        file_hash = digest(canonical(path))
        checksum.update(f'{path.relative_to(root).as_posix()} {file_hash}\n'.encode())
    return checksum.hexdigest()


def verify_record(home, record):
    root = release_tree(home, record['revision'])
    if client_release(root)['revision'] != record['revision']:
        raise ValueError('Runtime revision does not match the registry')
    if record.get('treeSha256') and package_digest(root) != record['treeSha256']:
        raise ValueError(f"Runtime files changed for {record['revision']}")
    return root


def write_registry(home, state):
    file = home / REGISTRY
    with NamedTemporaryFile(mode='w', encoding='utf-8', prefix='.release-state-', dir=home, delete=False) as temporary:
        pending = Path(temporary.name)
        json.dump(state, temporary, indent=2)
        temporary.write('\n')
        temporary.flush()
        os.fsync(temporary.fileno())
    try:
        pending.replace(file)
    finally:
        pending.unlink(missing_ok=True)


@contextmanager
def locked(home):
    import msvcrt

    path = home / '.release.lock'
    if path.exists() or path.is_symlink():
        canonical(path)
    with path.open('a+b') as lock:
        if not lock.tell():
            lock.write(b'\0')
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise ValueError('Another SLIPCURVE update is in progress') from error
        try:
            yield
        finally:
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def run(args, *, env=None, stdin=None, input=None):
    result = subprocess.run([str(arg) for arg in args], env=env, stdin=stdin, encoding='utf-8', errors='replace',
                            input=input, capture_output=True, timeout=900)
    if result.returncode:
        details = ('\n'.join(part.strip() for part in (result.stdout, result.stderr) if part)).strip()[-20_000:]
        raise ValueError(f'{Path(args[0]).name} exited {result.returncode}: {details}')
    return result.stdout.strip()


def remote_main(git):
    env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'Never'}
    reply = run([git, 'ls-remote', '--exit-code', ORIGIN, BRANCH], env=env).split()
    if len(reply) != 2 or reply[1] != BRANCH or not COMMIT.fullmatch(reply[0]):
        raise ValueError('Cannot verify the owned origin main revision')
    return reply[0]


def local_git_environment():
    env = {key: value for key, value in os.environ.items() if key.upper() in
                {'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP'}}
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
               GIT_CONFIG_SYSTEM=os.devnull, GIT_ATTR_NOSYSTEM='1', GIT_TERMINAL_PROMPT='0')
    return env


def checkout(git, target, scratch, source_cache=None):
    if not COMMIT.fullmatch(target):
        raise ValueError('Invalid published source commit')
    repo = scratch / 'repository'
    env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'Never'}
    safe_env = local_git_environment()
    hooks = scratch / 'empty-hooks'
    hooks.mkdir()
    cache = None
    cached = False
    if source_cache:
        # Fetch only the authoritative published commit's reachable objects.
        # No source working files, alternate store or newer local refs are used.
        cache = Path(source_cache).resolve(strict=True)
        if run([git, '-C', cache, 'remote', 'get-url', 'origin'], env=safe_env) != ORIGIN:
            raise ValueError('The source cache is not the owned SLIPCURVE repository')
        entry = run([git, '-C', cache, 'cat-file', '--batch-check'], env=safe_env, input=target + '\n').split()
        if entry == [target, 'missing']:
            # The independent GitHub pull can legitimately lag the release
            # check. A cache miss never changes the authoritative source pin.
            cached = False
        elif len(entry) == 3 and entry[0] == target and entry[1] == 'commit' and entry[2].isdigit():
            cached = True
        else:
            raise ValueError('The source cache returned an invalid commit object')
    if cached:
        run([git, '-c', 'core.longpaths=true', 'init', '--quiet', repo], env=safe_env)
        safe = [git, '-C', repo, '-c', 'core.longpaths=true', '-c', 'core.hooksPath=' + str(hooks),
                '-c', 'core.fsmonitor=false', '-c', 'credential.helper=']
        run([*safe, 'fetch', '--quiet', '--no-tags', '--no-recurse-submodules', str(cache), target], env=safe_env)
        run([*safe, 'remote', 'add', 'origin', ORIGIN], env=safe_env)
    else:
        # Borrow existing objects only while cloning the owned origin. Git
        # dissociates the new repository; private working files/local commits
        # are never selected, and the source cache itself remains untouched.
        # Acquire complete objects while authentication is available: later
        # config-free checkout and full-source archiving must work offline.
        reference = ['--reference-if-able', str(cache), '--dissociate'] if cache else []
        run([git, '-c', 'core.longpaths=true', '-c', 'core.hooksPath=' + str(hooks), '-c', 'core.fsmonitor=false',
             'clone', '--no-checkout', '--no-tags', '--single-branch', '--branch', 'main',
             *reference, ORIGIN, repo], env=env)
    run([git, '-C', repo, 'config', 'core.hooksPath', str(hooks)], env=safe_env)
    run([git, '-C', repo, 'fsck', '--strict', '--connectivity-only', target], env=safe_env)
    # The client build does not compile the separate installed native/WASM
    # runtimes. Keep their full source in Git and the source archive, without
    # materializing tens of thousands of unrelated source files in each build.
    run([git, '-C', repo, 'sparse-checkout', 'set', '--no-cone', '/*', '!/vendor/storytold/apps/'], env=safe_env)
    run([git, '-C', repo, '-c', 'core.longpaths=true', '-c', 'core.autocrlf=false', 'checkout', '--detach', target], env=safe_env)
    if (run([git, '-C', repo, 'rev-parse', 'HEAD'], env=safe_env) != target or
            run([git, '-C', repo, 'status', '--porcelain'], env=safe_env)):
        raise ValueError('The detached checkout does not match the verified commit')
    return repo


def clean_env(git, node, profile):
    allowed = {'systemroot', 'systemdrive', 'windir', 'programfiles', 'programfiles(x86)',
               'programw6432', 'localappdata', 'path', 'pathext', 'comspec', 'playwright_browsers_path'}
    env = {key: value for key, value in os.environ.items() if key.lower() in allowed}
    env.update({name: str(profile) for name in ('TEMP', 'TMP', 'APPDATA', 'USERPROFILE')})
    env['npm_config_cache'] = str(profile / 'npm-cache')
    for key in tuple(env):
        if key.lower() == 'path':
            env['PATH'] = os.pathsep.join((str(git.parent), str(node.parent), env.pop(key)))
            break
    return env


def artifact_receipt(git, repo, revision, scratch):
    archive = scratch / 'source.tar'
    run([git, '-C', repo, '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', '-c', 'core.attributesFile=' + os.devnull,
         'archive', '--format=tar', '-o', archive, revision], env=local_git_environment())
    with archive.open('rb') as source:
        if run([git, 'get-tar-commit-id'], stdin=source) != revision:
            raise ValueError('Git archive does not identify the pinned source revision')
    return digest(archive)


def check_manifest(projection, revision, manifest_file=None):
    manifest_file = manifest_file or projection.with_name(projection.name + '.manifest.json')
    manifest = read_json(manifest_file)
    metadata = read_json(projection / 'deployment.json')
    if (metadata['revision'] != revision or metadata['workingTreeModified'] is not False or
            metadata['clientManifestSha256'] != manifest['manifestSha256'] or
            not manifest['projectionEligible'] or manifest['projectionBlockers'] or not manifest['files']):
        raise ValueError('Projection metadata does not match the pinned, verified source')
    paths = set()
    for row in manifest['files']:
        name = PurePosixPath(row['path'])
        if name.is_absolute() or '..' in name.parts or any(c in row['path'] for c in '\\:'):
            raise ValueError('Unsafe projected file name')
        path = canonical(projection.joinpath(*name.parts))
        if path.stat().st_size != row['bytes'] or digest(path) != row['sha256']:
            raise ValueError(f'Projection content mismatch: {name}')
        paths.add(name.as_posix())
    return manifest_file, paths, manifest['manifestSha256']


def verify_client(home, current):
    root = verify_record(home, current)
    _, paths, digest_value = check_manifest(root / 'client', current['revision'], root / 'client-manifest.json')
    print(f"SLIPCURVE {current['revision']} verified {len(paths)} installed client files, manifest {digest_value}.")


def build(home, git, repo, revision, stage, scratch, env, node, npm):
    archive_hash = artifact_receipt(git, repo, revision, scratch)
    run([node, npm, 'ci', '--prefix', repo / 'app', '--no-audit', '--no-fund'], env=env)
    app = [node, npm, '--prefix', repo / 'app', 'run']
    # Run all three upstream check scripts with a larger Vitest budget on the
    # Windows folder host, where PDF and canvas tests exceeded five seconds.
    for check in (['typecheck'], ['test', '--', '--pool=threads', '--maxWorkers=1', '--testTimeout=30000'], ['build']):
        print(run([*app, *check], env=env), flush=True)
    target = stage / 'client'
    run([sys.executable, '-I', '-B', repo / 'tools' / 'pages-deploy.py', '--output', target], env=env)
    manifest, paths, client_hash = check_manifest(target, revision)
    if not HASH.fullmatch(client_hash):
        raise ValueError('Invalid client manifest digest')
    assemble(home, repo, stage, manifest, paths)
    manifest.unlink()
    return {'revision': revision, 'sourceArchiveSha256': archive_hash, 'clientManifestSha256': client_hash,
            'treeSha256': package_digest(stage)}


def assemble(home, repo, stage, manifest, paths):
    target = stage / 'client'
    # The Pages wrapper's marker is not part of the WSGI client allowlist.
    (target / '.nojekyll').unlink(missing_ok=True)
    for name in ('server-account.html', 'server-account.js'):
        shutil.copy2(canonical(home / 'client' / name), target / name)
        paths.add(name)
    shutil.copy2(manifest, stage / 'client-manifest.json')
    shutil.copy2(canonical(home / 'folder-serve.py'), stage / 'folder-serve.py')
    (stage / 'deploy').mkdir()
    for name in ('static_entry.py', 'wsgi_entry.py', 'readiness.py', 'client_projection.py', 'Caddyfile'):
        shutil.copy2(canonical(repo / 'deploy' / name), stage / 'deploy' / name)
    paths.update(('index.html', 'deployment.json'))
    (stage / 'deploy' / 'client-allowlist.txt').write_text('\n'.join(sorted(paths)) + '\n', encoding='utf-8')
    (stage / 'server').mkdir()
    for name in ('mcserver', 'schema'):
        shutil.copytree(canonical(repo / 'server' / name), stage / 'server' / name,
                        symlinks=True, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for name in ('identityctl.py', 'API.md', 'IDENTITY.md'):
        shutil.copy2(canonical(repo / 'server' / name), stage / 'server' / name)


def sqlite_compatible(current, stage):
    # SQLite tenant migrations run as users open their workspaces. An automatic
    # release must not migrate the live store beyond the previous runtime.
    relative = Path('server/mcserver/tenantdb.py')
    if canonical(current / relative).read_text(encoding='utf-8') != canonical(stage / relative).read_text(encoding='utf-8'):
        raise ValueError('SQLite migration implementation changed. This release needs a migration and rollback review.')


def promote(home, state, git, repo, revision, scratch, dependencies, chrome, node, npm):
    previous_root = verify_record(home, state['current'])
    previous = {**state['current'], 'treeSha256': package_digest(previous_root)}
    run([git, '-C', repo, 'merge-base', '--is-ancestor', previous['revision'], revision])
    profile = scratch / 'profile'
    profile.mkdir()
    env = clean_env(git, node, profile)
    if chrome:
        env['SLIPCURVE_GATE_CHROME'] = str(chrome)
    retained = state.get('previous', {})
    reuse = retained.get('revision') == revision
    if reuse:
        # Rollback retains the complete qualification receipt. Rebuilding this
        # same commit can produce different generated bytes, so validate and
        # re-gate the exact installed package instead of replacing its files.
        fields = ('sourceArchiveSha256', 'clientManifestSha256', 'treeSha256')
        if any(not isinstance(retained.get(field), str) or not HASH.fullmatch(retained[field]) for field in fields):
            raise ValueError('The retained release has no complete qualified receipt')
        receipt = dict(retained)
        stage = verify_record(home, receipt)
        _, _, client_hash = check_manifest(stage / 'client', revision, stage / 'client-manifest.json')
        if client_hash != receipt['clientManifestSha256']:
            raise ValueError('The retained client does not match its qualified receipt')
    else:
        stage = scratch / 'stage'
        stage.mkdir()
        receipt = build(home, git, repo, revision, stage, scratch, env, node, npm)
    sqlite_compatible(previous_root, stage)
    # Use the genuine browser and WSGI/SQLite workflows against a disposable store.
    gate = HERE / 'verify-slipcurve-release.py'
    # Chrome nests GPU cache names beneath Playwright's profile. Keep those
    # temporary names apart from the much deeper Git/build staging directory.
    with TemporaryDirectory(prefix='scb-', ignore_cleanup_errors=True) as browser_home:
        browser_env = {**env, **dict.fromkeys(('APPDATA', 'USERPROFILE', 'TEMP', 'TMP'), browser_home)}
        result = run([sys.executable, '-X', 'utf8', '-I', '-B', gate, stage, repo, scratch, dependencies, home.parent], env=browser_env)
    print(result)
    if package_digest(stage) != receipt['treeSha256']:
        raise ValueError('Staged application changed during verification')
    editions = canonical(home / 'releases')
    target = editions / revision
    if not reuse:
        if target.exists() or target.is_symlink():
            if package_digest(canonical(target)) != receipt['treeSha256']:
                raise ValueError('Conflicting installed files for this SLIPCURVE revision')
        else:
            stage.rename(target)
    write_registry(home, {'schema': 1, 'current': receipt, 'previous': previous})
    print(f'Verified and selected SLIPCURVE {revision} for its next start.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('update', 'verify', 'status', 'rollback', 'resume'))
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--git', type=Path)
    parser.add_argument('--python-deps', type=Path)
    parser.add_argument('--chrome', type=Path)
    parser.add_argument('--npm-cli', type=Path)
    parser.add_argument('--source-cache', type=Path)
    args = parser.parse_args()
    home = canonical(args.root.absolute())
    if args.mode == 'status':
        print(json.dumps(registry(home), indent=2))
        return
    if args.mode == 'verify':
        verify_client(home, registry(home)['current'])
        return
    with locked(home):
        state = registry(home)
        if args.mode == 'rollback':
            previous = state['previous']
            verify_record(home, previous)
            write_registry(home, {'schema': 1, 'current': previous, 'previous': state['current'],
                                  'hold': state['current']['revision']})
            print(f"Selected previous SLIPCURVE {previous['revision']} for its next start.")
        elif args.mode == 'resume':
            state.pop('hold', None)
            write_registry(home, state)
        else:
            if state.get('hold'):
                print(f"SLIPCURVE update held after rollback from {state['hold']}.")
                return
            git = args.git or shutil.which('git')
            if not git:
                raise ValueError('Locate the existing approved Git executable with --git')
            git = Path(git).resolve(strict=True)
            revision = remote_main(git)
            if revision == state['current']['revision']:
                verify_client(home, state['current'])
                print(f'SLIPCURVE current at owned origin main {revision}.')
                return
            if not args.python_deps or not args.npm_cli:
                raise ValueError('The verified Node/npm and browser test dependencies are required to promote a release')
            node = canonical(home.parent / 'tools' / 'node.exe')
            npm = canonical(args.npm_cli.absolute())
            editions = home / 'releases'
            editions.mkdir(exist_ok=True)
            canonical(editions)
            with TemporaryDirectory(prefix='.slipcurve-stage-', dir=editions, ignore_cleanup_errors=True) as directory:
                scratch = Path(directory)
                repo = checkout(git, revision, scratch, args.source_cache)
                promote(home, state, git, repo, revision, scratch, args.python_deps.resolve(strict=True), args.chrome, node, npm)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(f'SLIPCURVE release refused: {error}', file=sys.stderr)
        raise SystemExit(1)
