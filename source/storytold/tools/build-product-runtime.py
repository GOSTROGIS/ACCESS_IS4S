"""Build sealed product runtimes from committed owned source; private SDK settings stay external.

The first supported recipe is the complete Windows native/browser Word application. New recipes
must name their full upstream packages and real regression gates; unknown applications fail.
Use capture-inputs once with an external approved SDK definition (schema 1: environment, tools
with path, roots with path, versions, pythonDeps and chromium). It fingerprints every declared
input. Normal builds only validate that private receipt; they never refresh it or deploy files.
"""

import argparse
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import tomllib
import uuid
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from product_build_process import run_process

OWNERS = {
    'access': ('https://github.com/GOSTROGIS/ACCESS_IS4S.git', 'source/storytold/apps'),
    'slipcurve': ('https://github.com/GOSTROGIS/SLIPCURVE.git', 'vendor/storytold/apps'),
}
HEX40 = re.compile(r'^[0-9a-f]{40}$')
HEX64 = re.compile(r'^[0-9a-f]{64}$')
BASIC_ENV = {'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'OS'}
SDK_ENV = BASIC_ENV | {'CARGO_HOME', 'RUSTUP_HOME', 'CC', 'CXX', 'AR', 'RC_PATH', 'LIB', 'INCLUDE', 'LIBCLANG_PATH', 'CMAKE_GENERATOR'}


class BuildError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise BuildError(message)


def digest(path):
    h = hashlib.sha256()
    with io_path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def encode(value):
    return (json.dumps(value, indent=2, sort_keys=True) + '\n').encode()


def safe_relative(name):
    require(isinstance(name, str) and name and '\\' not in name and ':' not in name and '\0' not in name,
            'Unsafe relative filename')
    path = PurePosixPath(name)
    require(not path.is_absolute() and all(p not in {'', '.', '..'} and p.lower() != '.git' for p in name.split('/')),
            'Unsafe relative filename')
    require(all(not any(ord(c) < 32 for c in p) for p in path.parts), 'Control character in filename')
    require(all(p.rstrip(' .') == p and p.split('.')[0].upper() not in
                {'CON', 'PRN', 'AUX', 'NUL', *('COM'+str(i) for i in range(1, 10)), *('LPT'+str(i) for i in range(1, 10))}
                for p in path.parts), 'Filename cannot be represented safely on Windows')
    return path


def io_path(value):
    path = Path(value).absolute()
    text = str(path)
    if os.name == 'nt' and not text.startswith('\\\\?\\'):
        return Path('\\\\?\\UNC\\' + text[2:] if text.startswith('\\\\') else '\\\\?\\' + text)
    return path


def git_path(value):
    text = str(value)
    if os.name == 'nt' and text.startswith('\\\\?\\'):
        return '\\\\' + text[8:] if text.startswith('\\\\?\\UNC\\') else text[4:]
    return text


def within(parent, child):
    def resolved(value):
        text = str(Path(value).resolve())
        if os.name == 'nt':
            # resolve() may add the extended-path prefix only to a long child.
            # Normalize both representations after resolving links and SUBST drives.
            if text.startswith('\\\\?\\UNC\\'):
                text = '\\\\' + text[8:]
            elif text.startswith('\\\\?\\'):
                text = text[4:]
        return Path(text)
    try:
        resolved(child).relative_to(resolved(parent))
        return True
    except ValueError:
        return False


def basic_environment():
    return {k: v for k, v in os.environ.items() if k.upper() in BASIC_ENV}


def git_environment():
    env = basic_environment()
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull, GIT_TERMINAL_PROMPT='0',
               GIT_CONFIG_COUNT='4', GIT_CONFIG_KEY_0='core.longpaths', GIT_CONFIG_VALUE_0='true',
               GIT_CONFIG_KEY_1='credential.helper', GIT_CONFIG_VALUE_1='',
               GIT_CONFIG_KEY_2='core.fsmonitor', GIT_CONFIG_VALUE_2='false',
               GIT_CONFIG_KEY_3='core.hooksPath', GIT_CONFIG_VALUE_3=os.devnull)
    return env


def git(repo, *args):
    # Read-only source/object operations; never run repository hooks, external diffs or filters.
    completed = subprocess.run(['git', '-C', git_path(repo), *args], env=git_environment(), capture_output=True)
    require(completed.returncode == 0, 'Git source inspection failed: ' + args[0] + ': '
            + completed.stderr.decode(errors='replace').strip()[:1200])
    return completed.stdout


def source_record(repo, revision, product, application, enforce_origin=True):
    origin, base = OWNERS[product]
    if enforce_origin:
        actual = git(repo, 'remote', 'get-url', 'origin').decode().strip()
        require(actual.removesuffix('.git').lower() == origin.removesuffix('.git').lower(), 'Unexpected owned source origin')
    commit = git(repo, 'rev-parse', '--verify', revision + '^{commit}').decode().strip()
    require(HEX40.fullmatch(commit), 'Invalid source commit')
    # The user works on main. A historical main commit remains a valid pinned source.
    git(repo, 'merge-base', '--is-ancestor', commit, 'refs/heads/main')
    prefix = base + '/' + application
    tree = git(repo, 'rev-parse', commit + ':' + prefix).decode().strip()
    require(HEX40.fullmatch(tree), 'Invalid application tree')
    files = tree_files(repo, tree)
    return {'repository': origin, 'commit': commit, 'prefix': prefix, 'tree': tree, 'files': files}


def tree_files(repo, tree):
    files = {}
    for item in git(repo, 'ls-tree', '-r', '-z', tree).split(b'\0'):
        if not item:
            continue
        head, raw = item.split(b'\t', 1)
        mode, kind, blob = head.decode().split()
        name = raw.decode('utf-8')
        safe_relative(name)
        require(kind == 'blob' and mode in {'100644', '100755', '120000'}, 'Unsupported application tree entry')
        files[name] = {'mode': mode, 'blob': blob}
    require(files, 'Application tree is empty')
    return files


def file_blob(path, mode):
    path = io_path(path)
    if mode == '120000':
        require(path.is_symlink(), 'Source symlink mode was lost')
        data = os.readlink(path).encode()
    else:
        require(path.is_file() and not path.is_symlink(), 'Missing or redirected source file')
        data = path.read_bytes()
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def filesystem_files(folder, git_metadata=False):
    folder = io_path(folder)
    names = set()
    for directory, dirs, files in os.walk(folder, followlinks=False):
        base = Path(directory)
        if base == folder and git_metadata:
            dirs[:] = [name for name in dirs if name != '.git']
        for name in list(dirs):
            path = base / name
            if path.is_symlink():
                names.add(path.relative_to(folder).as_posix())
                dirs.remove(name)
        for name in files:
            if base == folder and git_metadata and name == '.git':
                continue
            names.add((base / name).relative_to(folder).as_posix())
    return names


def verify_source(folder, record, git_metadata=False, windows_git_link_targets=False):
    expected = record['files']
    folder = io_path(folder)
    actual = filesystem_files(folder, git_metadata)
    if git_metadata and '.cargo-ok' in actual and '.cargo-ok' not in expected:
        marker = folder / '.cargo-ok'
        require(not marker.is_symlink() and marker.stat().st_size <= 4096, 'Invalid Cargo checkout marker')
        content = marker.read_text().strip()
        require(not content or json.loads(content) == {'v': 1}, 'Unexpected Cargo checkout metadata')
        actual.remove('.cargo-ok')
    require(actual == set(expected), 'Source export has missing or additional files')
    represented_links = []
    for name, entry in expected.items():
        mode = entry['mode']
        if entry['mode'] == '120000':
            path = folder / name
            if path.is_symlink():
                target = os.readlink(path)
            else:
                require(os.name == 'nt' and windows_git_link_targets and path.is_file(), 'Source symlink mode was lost')
                # Git core.symlinks=false stores the exact link-text blob in a small
                # ordinary file, while retaining mode120000 in its verified index.
                # https://git-scm.com/docs/git-config#Documentation/git-config.txt-coresymlinks
                target = path.read_text(encoding='utf-8')
                mode = '100644'
                represented_links.append(name)
            require(not Path(target).is_absolute() and within(folder, path.parent / target), 'Source symlink escapes its tree')
        require(file_blob(folder / name, mode) == entry['blob'], 'Source file differs from committed bytes: ' + name)
        if os.name != 'nt' and entry['mode'] in {'100644', '100755'}:
            require(bool((folder / name).stat().st_mode & 0o111) == (entry['mode'] == '100755'), 'Source executable mode differs: ' + name)
    return {'windowsGitLinkTargets': represented_links}


def prepare_source_index(repo, folder, record):
    # Upstream's asset gate deliberately requires a real Git index. Populate it
    # from the verified application tree, without add/checkout filters or fake files.
    require(os.name != 'nt' or len(str(Path(folder).absolute())) <= 180,
            'Windows Git build scratch needs a short path (at most 180 characters); use a caller-owned short scratch or SUBST mapping')
    metadata = io_path(folder) / '.git'
    config = b'[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n\tlogallrefupdates = false\n\tautocrlf = false\n'
    object_directory = git(repo, 'rev-parse', '--path-format=absolute', '--git-path', 'objects').decode().strip()
    require('\n' not in object_directory and '\r' not in object_directory, 'Unsupported Git object directory')
    object_path = str(Path(object_directory).resolve())
    if os.name == 'nt' and object_path.startswith('\\\\?\\'):
        object_path = '\\\\' + object_path[8:] if object_path.startswith('\\\\?\\UNC\\') else object_path[4:]
    alternate = (Path(object_path).as_posix() + '\n').encode()
    marker = {'schema': 1, 'repository': record['repository'], 'prefix': record['prefix'], 'tree': record['tree']}
    if metadata.exists():
        require(metadata.is_dir() and not metadata.is_symlink() and within(folder, metadata),
                'Foreign source Git metadata was preserved')
        require((metadata / 'product-source.json').is_file()
                and json.loads((metadata / 'product-source.json').read_text()) == marker,
                'Foreign source Git metadata was preserved')
        require((metadata / 'config').read_bytes() == config
                and (metadata / 'HEAD').read_bytes() == b'ref: refs/heads/main\n'
                and (metadata / 'objects/info/alternates').read_bytes() == alternate,
                'Private source Git metadata changed')
        require(git(folder, 'write-tree').decode().strip() == record['tree'], 'Private source index differs from the pinned tree')
        return
    git(folder, 'init', '-b', 'main')
    (metadata / 'config').write_bytes(config)
    (metadata / 'objects/info/alternates').write_bytes(alternate)
    git(folder, 'read-tree', record['tree'])
    require(git(folder, 'write-tree').decode().strip() == record['tree'], 'Source index initialization changed the pinned tree')
    (metadata / 'product-source.json').write_bytes(encode(marker))


def export_source(repo, folder, record, source_repository=False):
    folder = io_path(folder)
    if folder.exists():
        verify_source(folder, record, git_metadata=source_repository)
        if source_repository:
            prepare_source_index(repo, folder, record)
        return
    folder.mkdir(parents=True)
    entries = list(record['files'].items())
    process = subprocess.Popen(['git', '-C', str(repo), 'cat-file', '--batch'], env=git_environment(),
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for name, entry in entries:
            process.stdin.write((entry['blob'] + '\n').encode())
            process.stdin.flush()
            header = process.stdout.readline().decode().split()
            require(len(header) == 3 and header[0] == entry['blob'] and header[1] == 'blob', 'Git blob read failed')
            data = process.stdout.read(int(header[2]))
            require(process.stdout.read(1) == b'\n', 'Incomplete Git blob')
            path = folder / name
            path.parent.mkdir(parents=True, exist_ok=True)
            if entry['mode'] == '120000':
                target = data.decode('utf-8')
                require(not Path(target).is_absolute() and within(folder, path.parent / target), 'Source symlink escapes its tree')
                try:
                    path.symlink_to(target)
                except OSError as error:
                    raise BuildError('This original source needs filesystem symlink support; no flattening was performed') from error
            else:
                path.write_bytes(data)
                if entry['mode'] == '100755':
                    path.chmod(path.stat().st_mode | 0o111)
        process.stdin.close()
        require(process.wait() == 0, 'Git blob export failed')
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait()
        for pipe in [process.stdin, process.stdout, process.stderr]:
            if pipe is not None and not pipe.closed:
                pipe.close()
    verify_source(folder, record)
    if source_repository:
        prepare_source_index(repo, folder, record)


def verify_brand(source, product):
    source = io_path(source)
    info = json.loads((source / '.fork-brand.json').read_text())
    require(info.get('schema') == 1 and info.get('product') == product, 'Wrong product branding receipt')
    require(info.get('files'), 'Branding receipt is empty')
    for name, entry in info['files'].items():
        safe_relative(name)
        require(digest(source / name) == entry['sha256'], 'Branding receipt mismatch: ' + name)
    return info['label']


def diagnostic_exclusions(name, entry, tools):
    """One known browser output is not a code input; no filename globs are accepted."""
    declared = entry.get('nonInputDiagnostics', {})
    require(isinstance(declared, dict), 'Invalid SDK diagnostic declaration')
    if not declared:
        return set()
    require(name == 'qa-browser-runtime'
            and declared == {'debug.log': {'type': 'chromium-diagnostic-log'}},
            'Unsupported SDK diagnostic exclusion')
    browser = tools.get('chromium', {})
    require(isinstance(browser.get('path'), str), 'Browser diagnostic has no pinned browser tool')
    executable = io_path(browser['path'])
    base = io_path(entry.get('path', ''))
    require(executable.name.lower() == 'chrome-headless-shell.exe' and executable.parent.resolve() == base.resolve(),
            'Browser diagnostic is outside the pinned browser tool root')
    require('debug.log' not in entry.get('files', {}), 'Browser diagnostic cannot also be a pinned input')
    diagnostic = base / 'debug.log'
    require(not diagnostic.is_symlink() and (not diagnostic.exists() or diagnostic.is_file()),
            'Browser diagnostic must be an ordinary file')
    return {'debug.log'}


def private_settings(path, repo, recipe, kind):
    require(not within(repo, path), 'Private SDK settings must stay outside the public repository')
    config = json.loads(path.read_text())
    require(config.get('schema') == 1, 'Unsupported private toolchain settings')
    env = basic_environment()
    for key, value in config.get('environment', {}).items():
        allowed = key.upper() in SDK_ENV or re.fullmatch(r'CARGO_TARGET_[A-Z0-9_]+_LINKER', key)
        require(allowed and isinstance(value, str), 'Unsupported private SDK environment setting')
        env[key] = value
    tools = config.get('tools', {})
    # The browser recipe also runs upstream's complete native CI before its WASM
    # build, so both artifact kinds need the pinned Windows compiler and SDK.
    required = ['cargo', 'rustc', 'clang-cl', 'lld-link', 'llvm-rc'] + (['wasm-bindgen'] if kind == 'web' else [])
    if recipe.get('qaInputs'):
        required += ['python'] + (['chromium'] if kind == 'web' else [])
    require(all(name in tools for name in required), 'Required compiler tool was not pinned')
    for name in tools:
        tool = tools.get(name, {})
        require(isinstance(tool.get('path'), str) and HEX64.fullmatch(tool.get('sha256', '')), 'Unpinned tool: ' + name)
        require(not within(repo, tool['path']) and digest(tool['path']) == tool['sha256'], 'Tool input checksum mismatch: ' + name)
    require(all(name in config.get('roots', {}) for name in recipe[kind]['requiredInputRoots']), 'Required toolchain root was not pinned')
    for name in config.get('roots', {}):
        entry = config.get('roots', {}).get(name, {})
        base = io_path(entry.get('path', ''))
        expected = entry.get('files', {})
        diagnostics = diagnostic_exclusions(name, entry, tools)
        require(base.is_absolute() and expected and not within(repo, base), 'Missing private toolchain input root: ' + name)
        actual = {p.relative_to(base).as_posix() for p in base.rglob('*') if p.is_file() or p.is_symlink()}
        actual -= diagnostics
        require(actual == set(expected), 'Toolchain input root changed: ' + name)
        for relative, checksum in expected.items():
            safe_relative(relative)
            candidate = base / relative
            require(not candidate.is_symlink() and isinstance(checksum, str) and HEX64.fullmatch(checksum) and digest(candidate) == checksum,
                    'Toolchain input checksum mismatch: ' + name + '/' + relative)
    require(config.get('versions') == recipe['nativeToolVersions'], 'Native SDK/compiler version receipt differs from recipe')
    if recipe.get('qaInputs'):
        qa = recipe['qaInputs']
        roots = config['roots']
        require(Path(config['pythonDeps']).resolve() == Path(roots[qa['pythonDepsRoot']]['path']).resolve(),
                'Python gate dependencies are outside their pinned input root')
        require(within(roots[qa['pythonRuntimeRoot']]['path'], tools['python']['path']),
                'Python gate interpreter is outside its pinned runtime root')
        if kind == 'web':
            require(Path(config['chromium']).resolve() == Path(tools['chromium']['path']).resolve()
                    and within(roots[qa['browserRoot']]['path'], config['chromium']),
                    'Browser gate executable is outside its pinned runtime root')
    env.update(git_environment())
    # Restore explicitly approved compiler paths after the credential-free Git environment.
    env.update(config.get('environment', {}))
    env.update(CARGO_BUILD_JOBS='1', CMAKE_BUILD_PARALLEL_LEVEL='1', RUST_TEST_THREADS='1',
               CARGO_NET_GIT_FETCH_WITH_CLI='true')
    env['CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS'] = recipe['native']['rustFlags']
    return config, env


def capture_settings(definition, destination, repo):
    require(not within(repo, definition) and not within(repo, destination), 'SDK references must remain outside source control')
    require(not destination.exists(), 'Existing pinned SDK receipt was preserved; use a new explicit destination')
    config = json.loads(definition.read_text())
    require(config.get('schema') == 1 and config.get('tools') and config.get('roots'), 'Invalid approved SDK definition')
    for key, value in config.get('environment', {}).items():
        require(isinstance(value, str) and (key.upper() in SDK_ENV or re.fullmatch(r'CARGO_TARGET_[A-Z0-9_]+_LINKER', key)),
                'Unsupported private SDK environment setting')
    for entry in config['tools'].values():
        path = io_path(entry['path'])
        require(path.is_absolute() and path.is_file() and not path.is_symlink() and not within(repo, path), 'Invalid private tool path')
        require('sha256' not in entry, 'Definition already contains a pin; refreshing pins requires a fresh explicit definition')
        entry['sha256'] = digest(path)
    for name, entry in config['roots'].items():
        path = io_path(entry['path'])
        require(path.is_absolute() and path.is_dir() and len(path.resolve().parts) > 2 and not path.is_symlink()
                and not within(repo, path), 'Invalid private toolchain root')
        require('files' not in entry, 'Definition already contains root pins')
        diagnostics = diagnostic_exclusions(name, entry, config['tools'])
        entries = {}
        for candidate in sorted(path.rglob('*')):
            require(not candidate.is_symlink(), 'Toolchain roots must not contain redirected entries')
            if candidate.is_file():
                name = candidate.relative_to(path).as_posix()
                safe_relative(name)
                if name in diagnostics:
                    continue
                entries[name] = digest(candidate)
        require(entries, 'Toolchain root is empty')
        entry['files'] = entries
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as stream:
        stream.write(encode(config))
    return {'ok': True, 'action': 'capture-inputs', 'tools': len(config['tools']),
            'inputFiles': sum(len(root['files']) for root in config['roots'].values()), 'receiptSha256': digest(destination)}


def run_step(command, cwd, env, log, capture=False, timeout=21600):
    errors = log.with_name(log.name + '.stderr.log') if capture else None
    try:
        code = run_process(command, cwd, env, log, timeout, stderr_log=errors)
    except subprocess.TimeoutExpired as error:
        raise BuildError('Required command exceeded its deadline; its owned process tree was closed: ' + log.name) from error
    require(code == 0, 'Required command failed; see private log ' + log.name)
    return log.read_bytes() if capture else {'exitCode': 0, 'logSha256': digest(log)}


def cargo_target_binding(cache, product, application, source):
    require(product in OWNERS and re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', application), 'Unknown Cargo cache identity')
    # Local packages can embed CARGO_MANIFEST_DIR. Never reuse a driver or local
    # crate compiled at another product/source root, even when its bytes match.
    canonical = os.path.normcase(git_path(Path(source).resolve(strict=True)))
    root_hash = hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    namespace = product + '/' + application + '/' + root_hash
    cache = Path(cache).absolute()
    resolved_cache = cache.resolve()
    require(not cache.exists() or cache.is_dir(), 'Declared Cargo cache root is not a directory')
    target = cache
    for part in ['sources', product, application, root_hash]:
        target /= part
        try:
            entry = target.lstat()
        except FileNotFoundError:
            continue
        require(not target.is_symlink() and not getattr(entry, 'st_file_attributes', 0) & 0x400,
                'Namespaced Cargo cache contains a redirected component')
        require(target.is_dir(), 'Namespaced Cargo cache contains a non-directory component')
    resolved_target = target.resolve()
    require(resolved_target != resolved_cache and within(resolved_cache, resolved_target), 'Namespaced Cargo cache escapes the declared root')
    return target, {
        'namespace': namespace, 'sourceRootSha256': root_hash, 'canonicalSourceRoot': canonical,
        'canonicalCacheRoot': str(resolved_cache), 'canonicalTargetRoot': str(resolved_target),
    }


def verify_input(repo, commit):
    require(HEX40.fullmatch(commit), 'Build input is not pinned to a complete Git commit')
    require(git(repo, 'rev-parse', 'HEAD').decode().strip() == commit, 'Build input is at a different commit')
    tree = git(repo, 'rev-parse', commit + '^{tree}').decode().strip()
    require(git(repo, 'write-tree').decode().strip() == tree, 'Git dependency index modes or blobs differ from the pinned tree')
    # git status honors skip-worktree/assume-unchanged and ignores build-script extras.
    # Compare every file to raw Git blobs, bypassing those index hints entirely.
    folder = Path(repo).absolute()
    if os.name == 'nt' and not str(folder).startswith('\\\\?\\'):
        spelling = str(folder)
        folder = Path('\\\\?\\UNC\\' + spelling[2:] if spelling.startswith('\\\\') else '\\\\?\\' + spelling)
    link_targets = os.name == 'nt' and git(repo, 'config', '--bool', '--default', 'true', '--get', 'core.symlinks').strip() == b'false'
    representation = verify_source(folder, {'files': tree_files(repo, tree)}, git_metadata=True, windows_git_link_targets=link_targets)
    return {'commit': commit, 'tree': tree, **representation}


def dependency_receipt(metadata, lock, env, source_root=None):
    locked = {(p['name'], p['version'], p.get('source')): p for p in lock['package']}
    checked_git, result = {}, []
    for package in metadata['packages']:
        origin = package.get('source')
        if not origin:
            if source_root is not None:
                require(within(source_root, package['manifest_path']), 'Undeclared external path dependency')
            continue
        pinned = locked.get((package['name'], package['version'], origin))
        require(pinned is not None, 'Resolved dependency is absent from Cargo.lock')
        base = Path(package['manifest_path']).parent
        if origin.startswith('git+'):
            commit = origin.rsplit('#', 1)[-1]
            require(HEX40.fullmatch(commit), 'Unlocked Git dependency')
            top = git(base, 'rev-parse', '--show-toplevel').decode().strip()
            require(within(top, base), 'Git dependency manifest is outside its verified source tree')
            if top not in checked_git:
                checked_git[top] = verify_input(top, commit)
            result.append({'name': package['name'], 'version': package['version'], 'source': origin, 'commit': commit})
        else:
            checksum = pinned.get('checksum', '')
            require(origin.startswith('registry+') and HEX64.fullmatch(checksum), 'Unpinned registry dependency')
            archive = base.parents[2] / 'cache' / base.parent.name / (package['name'] + '-' + package['version'] + '.crate')
            require(archive.is_file() and digest(archive) == checksum, 'Registry archive checksum mismatch: ' + package['name'])
            # Read the verified archive rather than trusting a mutable cache checksum sidecar.
            archived_files = {}
            with tarfile.open(archive, 'r:gz') as container:
                for member in container:
                    if member.isdir():
                        continue
                    require(member.isfile(), 'Unsupported registry archive entry')
                    pieces = member.name.split('/', 1)
                    require(len(pieces) == 2 and pieces[0] == base.name, 'Unexpected registry archive prefix')
                    name = str(safe_relative(pieces[1]))
                    path = base / name
                    require(path.is_file() and not path.is_symlink() and within(base, path),
                            'Missing or redirected registry source: ' + package['name'] + '/' + name)
                    stream = container.extractfile(member)
                    h = hashlib.sha256()
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        h.update(chunk)
                    archived_files[name] = h.hexdigest()
                    require(digest(path) == archived_files[name], 'Unpacked dependency was modified: ' + package['name'] + '/' + name)
            actual_files = filesystem_files(base)
            for name in ['.cargo-ok', '.cargo-checksum.json']:
                if name in actual_files and name not in archived_files:
                    candidate = base / name
                    require(candidate.is_file() and not candidate.is_symlink(), 'Redirected Cargo registry metadata')
                    if name == '.cargo-ok':
                        require(candidate.stat().st_size <= 4096, 'Oversized Cargo registry marker')
                        content = candidate.read_text().strip()
                        require(not content or json.loads(content) == {'v': 1}, 'Unexpected Cargo registry marker')
                    else:
                        require(candidate.stat().st_size <= 16 * 1024 * 1024, 'Oversized Cargo checksum metadata')
                        sidecar = json.loads(candidate.read_text())
                        require(sidecar.get('package') == checksum and sidecar.get('files') == archived_files,
                                'Cargo checksum sidecar differs from the verified archive')
                    actual_files.remove(name)
            require(actual_files == set(archived_files), 'Untracked registry source files were preserved and refused: ' + package['name'])
            result.append({'name': package['name'], 'version': package['version'], 'source': origin, 'checksum': checksum})
    return {'packages': result, 'resolvedPackages': len(metadata['packages']), 'gitTreesVerified': len(checked_git),
            'gitInputs': list(checked_git.values())}


def verify_package(folder, expected=None, archive=None):
    folder = io_path(folder)
    require(folder.is_dir() and not folder.is_symlink(), 'Runtime package is missing or redirected')
    manifest_file = folder / 'build-manifest.json'
    require(not manifest_file.is_symlink(), 'Manifest is redirected')
    manifest = json.loads(manifest_file.read_text())
    require(manifest.get('schema') == 1 and isinstance(manifest.get('files'), dict), 'Unsupported runtime receipt')
    for key, value in (expected or {}).items():
        require(manifest.get(key) == value, 'Existing version has conflicting ' + key)
    names = set(manifest['files']) | {'build-manifest.json'}
    actual = {p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file() or p.is_symlink()}
    require(actual == names, 'Runtime has missing or additional files')
    for name, entry in manifest['files'].items():
        safe_relative(name)
        path = folder / name
        require(not path.is_symlink() and within(folder, path), 'Redirected runtime payload')
        require(path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'], 'Runtime payload checksum mismatch: ' + name)
    require(manifest['entry'] in manifest['files'], 'Missing runtime entry point')
    if archive is not None:
        with zipfile.ZipFile(archive) as package:
            require(len(package.namelist()) == len(names) and set(package.namelist()) == names, 'ZIP entries differ from sealed payload')
            require(package.testzip() is None, 'ZIP CRC verification failed')
            for name in names:
                require(hashlib.sha256(package.read(name)).hexdigest() == digest(folder / name), 'ZIP differs from sealed payload')
    return manifest


def notices(source, folder, fonts):
    for name in ['README.md', 'LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md', 'COPYRIGHT']:
        if (source / name).is_file():
            shutil.copyfile(source / name, folder / name)
    shutil.copyfile(source / 'docs/brand/LICENSE-brand.txt', folder / 'LICENSE-brand.txt')
    for writer_name in ['craft-docx', 'craft-rtf', 'craft-latex', 'craft-odf']:
        writer = source / 'vendor' / writer_name
        if writer.is_dir():
            preserved = folder / writer_name
            preserved.mkdir()
            for name in ['README.md', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md', 'upstream-source.json', 'owned-changes.json']:
                require((writer / name).is_file(), 'Vendored writer notice/provenance is missing: ' + writer_name + '/' + name)
                shutil.copyfile(writer / name, preserved / name)
    local = folder / 'font-licences'
    local.mkdir()
    for path in (source / 'assets/fonts').glob('*.txt'):
        shutil.copyfile(path, local / path.name)
    for path in (fonts / 'fonts').glob('*/OFL.txt'):
        shutil.copyfile(path, folder / ('OFL-' + path.parent.name + '.txt'))


def assemble(source, target_dir, folder, kind, recipe, config, fonts, env, logs):
    target = recipe[kind]['target']
    binary = target_dir / target / 'release'
    if kind == 'native':
        for name in recipe[kind]['outputs']:
            require((binary / name).is_file(), 'Required complete native output missing: ' + name)
            shutil.copyfile(binary / name, folder / name)
        notices(source, folder, fonts)
    else:
        bindgen = config['tools']['wasm-bindgen']['path']
        version = run_step([bindgen, '--version'], source, env, logs / 'wasm-bindgen-version.log', capture=True).decode().strip()
        require(version == 'wasm-bindgen ' + recipe[kind]['wasmBindgen'], 'Wrong wasm-bindgen version')
        run_step([bindgen, '--target', 'web', '--no-typescript', '--out-dir', folder, binary / recipe[kind]['wasmArtifact']],
                 source, env, logs / 'wasm-bindgen.log')
        html = (source / recipe[kind]['index']).read_text()
        require(html.count('data-trunk rel="icon"') == html.count('data-trunk rel="rust"') == 1, 'Unsupported upstream web entry directives')
        html = re.sub(r'<link data-trunk rel="icon"[^>]+/>', '<link rel="icon" href="./wordcraft.ico" />', html)
        html = re.sub(r'<link data-trunk rel="rust"[^>]+/>', '', html)
        html = html.replace('</body>', '<script type="module" src="./wordcraft-loader.js"></script>\n</body>')
        (folder / 'index.html').write_text(html, encoding='utf-8', newline='\n')
        (folder / 'wordcraft-loader.js').write_text('import init from "./wordcraft-web.js";\nawait init();\n', newline='\n')
        shutil.copyfile(source / recipe[kind]['icon'], folder / 'wordcraft.ico')
        licences = folder / 'licences'
        licences.mkdir()
        notices(source, licences, fonts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['plan', 'verify', 'capture-inputs', 'build'])
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--revision', default='main')
    parser.add_argument('--product', choices=OWNERS, required=True)
    parser.add_argument('--application', default='wordcraft')
    parser.add_argument('--kind', choices=['native', 'web'], required=True)
    parser.add_argument('--scratch', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--source-root', type=Path)
    parser.add_argument('--target-dir', type=Path)
    parser.add_argument('--private-settings', type=Path)
    parser.add_argument('--private-definition', type=Path)
    parser.add_argument('--fonts', type=Path)
    parser.add_argument('--i18n', type=Path)
    args = parser.parse_args()
    recipe_path = Path(__file__).with_name('product-build-recipes') / (args.application + '.json')
    require(args.application == 'wordcraft' and recipe_path.is_file(), 'Application has no verified complete build recipe')
    recipe = json.loads(recipe_path.read_text())
    repo = args.repository.absolute()
    require(not within(repo, args.scratch) and not within(repo, args.output), 'Build scratch and artifacts must stay outside the repository')
    if args.action == 'capture-inputs':
        require(args.private_definition and args.private_settings, 'Capture needs an external approved definition and a new private receipt path')
        print(json.dumps(capture_settings(args.private_definition, args.private_settings, repo)))
        return
    record = source_record(repo, args.revision, args.product, args.application)
    source = args.source_root or args.scratch / 'sources' / args.product / args.application / record['tree']
    require(within(args.scratch, source), 'Source scratch must remain inside the selected private scratch root')
    args.scratch.mkdir(parents=True, exist_ok=True)
    export_source(repo, source, record, source_repository=True)
    label = verify_brand(source, args.product)
    cargo_manifest = tomllib.loads((source / 'Cargo.toml').read_text())
    version = 'v' + cargo_manifest['workspace']['package']['version'] + '-' + args.product + '-' + record['tree'][:8]
    identity = args.product + '-' + args.application
    final = args.output / identity / version / args.kind
    archive = args.output / (identity + '-' + version + '-' + args.kind + '.zip')
    expected = {'product': args.product, 'application': args.application, 'kind': args.kind, 'version': version,
                'entry': recipe[args.kind]['entry'], 'dependencyLockSha256': digest(source / 'Cargo.lock')}
    if args.action in {'plan', 'verify'}:
        source_info = {k: v for k, v in record.items() if k != 'files'}
        provenance = {'source': source_info}
        if args.action == 'verify':
            manifest = verify_package(final, expected, archive)
            require(manifest['source']['repository'] == record['repository'] and manifest['source']['prefix'] == record['prefix']
                    and manifest['source']['tree'] == record['tree'], 'Existing artifact source differs')
            provenance = {'source': manifest['source'], 'currentValidatedInput': source_info}
        print(json.dumps({'ok': True, 'action': args.action, 'id': identity, 'version': version,
                          **provenance, 'sourceFiles': len(record['files']),
                          'kind': args.kind, 'upstreamGate': recipe['upstreamGate'], 'integrityOnly': args.action == 'verify'}))
        return
    require(sys.platform == recipe['host'], 'This verified recipe currently requires a Windows build host')
    require(args.private_settings and args.fonts and args.i18n, 'Build requires external pinned SDK settings, fonts and i18n inputs')
    config, env = private_settings(args.private_settings, repo, recipe, args.kind)
    font_commit = recipe['inputs']['fonts']['commit']
    i18n_commit = (source / recipe['inputs']['i18n']['pinFile']).read_text().strip()
    verify_input(args.fonts, font_commit)
    verify_input(args.i18n, i18n_commit)
    target_cache = args.target_dir or args.scratch / 'target'
    require(not within(repo, target_cache), 'Cargo output must stay outside source control')
    target_dir, cache_binding = cargo_target_binding(target_cache, args.product, args.application, source)
    require(within(target_cache, target_dir) and not within(repo, target_dir) and not within(source, target_dir),
            'Resolved Cargo target must stay inside the declared cache and outside repository/source trees')
    profile = args.scratch / 'profiles' / identity
    profile.mkdir(parents=True, exist_ok=True)
    env.update(CARGO_TARGET_DIR=str(target_dir), CARGO_BUILD_TARGET=recipe['native']['target'],
               CRAFT_FONTS_DIR=str(args.fonts), CRAFT_FONTS_REQUIRED='1', CRAFT_I18N_DIR=str(args.i18n), CRAFT_I18N_REQUIRED='1',
               WORDCRAFT_REQUIRE_WINRES='1', WORDCRAFT_BUILD_SHA=record['commit'], WORDCRAFT_BUILD_DATE=date.today().isoformat(),
               WORDCRAFT_PROFILE_DIR=str(profile), APPDATA=str(profile), USERPROFILE=str(profile),
               XDG_CONFIG_HOME=str(profile), XDG_DATA_HOME=str(profile))
    logs = args.scratch / 'logs' / (identity + '-' + args.kind + '-' + uuid.uuid4().hex)
    logs.mkdir(parents=True)
    (logs / 'cargo-cache-binding.json').write_bytes(encode(cache_binding))
    cargo = [config['tools']['cargo']['path'], '+' + recipe['toolchain']]
    for name in ['cargo', 'rustc']:
        tool = config['tools'][name]['path']
        output = run_step([tool, '+' + recipe['toolchain'], '--version'], source, env, logs / (name + '-version.log'), capture=True).decode()
        require(output.startswith(name + ' ' + recipe['rustVersion'] + ' '), 'Unexpected pinned Rust toolchain version')
    if recipe.get('nativeToolVersions'):
        llvm = recipe['nativeToolVersions']['llvm']
        source_commit = recipe['nativeToolVersions']['llvmSource']
        for tool, prefix in [('clang-cl', 'clang version '), ('lld-link', 'LLD ')]:
            output = run_step([config['tools'][tool]['path'], '--version'], source, env, logs / (tool + '-version.log'), capture=True).decode()
            require(output.startswith(prefix + llvm) and source_commit in output, 'Unexpected pinned LLVM compiler/linker version')
    # Metadata resolves locked sources without executing their build scripts. Validate
    # complete dependency trees before the first upstream command can compile them.
    metadata = json.loads(run_step(cargo + ['metadata', '--locked', '--format-version', '1'], source, env, logs / 'cargo-metadata.json', capture=True))
    dependencies = dependency_receipt(metadata, tomllib.loads((source / 'Cargo.lock').read_text()), env, source)
    (logs / 'dependency-receipt.json').write_bytes(encode(dependencies))
    gates = {'upstream': run_step(cargo + recipe['upstreamGate'], source, env, logs / 'upstream-ci.log')}
    verify_source(source, record, git_metadata=True)
    prepare_source_index(repo, source, record)
    require(dependency_receipt(metadata, tomllib.loads((source / 'Cargo.lock').read_text()), env, source) == dependencies,
            'Dependency inputs changed during the upstream gate')
    source_info = {k: v for k, v in record.items() if k != 'files'}
    if final.exists():
        manifest = verify_package(final, expected, archive)
        require(manifest['source']['repository'] == record['repository'] and manifest['source']['prefix'] == record['prefix']
                and manifest['source']['tree'] == record['tree'], 'Existing package has conflicting source')
        require(manifest.get('buildInputs', {}).get('privateToolchainReceiptSha256') == digest(args.private_settings)
                and manifest.get('buildInputs', {}).get('recipeSha256') == digest(recipe_path),
                'Existing version was built with different or unrecorded inputs; it was preserved and not relabeled')
        stage = final
        reused = True
    else:
        require(not archive.exists(), 'Conflicting existing archive was preserved')
        build = ['build', '--locked', '--release', '--target', recipe[args.kind]['target'], '--jobs', '1']
        for package in recipe[args.kind]['packages']:
            build += ['-p', package]
        gates['build'] = run_step(cargo + build, source, env, logs / 'build.log')
        verify_source(source, record, git_metadata=True)
        prepare_source_index(repo, source, record)
        require(dependency_receipt(metadata, tomllib.loads((source / 'Cargo.lock').read_text()), env, source) == dependencies,
                'Dependency inputs changed during compilation')
        stage = args.output / ('.staging-' + uuid.uuid4().hex)
        stage.mkdir(parents=True)
        assemble(source, target_dir, stage, args.kind, recipe, config, args.fonts, env, logs)
        files = {p.relative_to(stage).as_posix(): {'bytes': p.stat().st_size, 'sha256': digest(p)} for p in sorted(stage.rglob('*')) if p.is_file()}
        manifest = {'schema': 1, **expected, 'source': source_info, 'files': files,
                    'buildInputs': {'rust': recipe['toolchain'], 'target': recipe[args.kind]['target'], 'features': recipe['features'],
                                    'craftFonts': font_commit, 'craftI18n': i18n_commit, 'privateToolchainReceiptSha256': digest(args.private_settings),
                                    'dependencyReceiptSha256': digest(logs / 'dependency-receipt.json'), 'recipeSha256': digest(recipe_path),
                                    'builderSha256': digest(__file__),
                                    'processContainmentSha256': digest(Path(__file__).with_name('product_build_process.py')),
                                    'functionalGateSha256': digest(Path(__file__).with_name(recipe['functionalGate'])),
                                    'cargoCacheNamespace': cache_binding['namespace'],
                                    'cargoSourceRootSha256': cache_binding['sourceRootSha256'],
                                    'commandBaselineSha256': digest(recipe_path.with_name('wordcraft-commands.json'))}}
        (stage / 'build-manifest.json').write_bytes(encode(manifest))
        reused = False
    verifier = Path(__file__).with_name(recipe['functionalGate'])
    shim = 'import os,runpy,sys;sys.path.insert(0,sys.argv.pop(1));p=sys.argv.pop(1);sys.path.insert(0,os.path.dirname(p));sys.argv[0]=p;runpy.run_path(p,run_name="__main__")'
    gate = [config['tools']['python']['path'], '-I', '-B', '-c', shim, config['pythonDeps'], verifier, '--kind', args.kind, '--package', stage,
            '--output', logs / 'functional', '--label', label]
    if args.kind == 'web':
        gate += ['--chromium', config['chromium']]
    gates['functional'] = run_step(gate, source, env, logs / 'functional.log')
    verify_package(stage, expected)
    verify_source(source, record, git_metadata=True)
    prepare_source_index(repo, source, record)
    if not reused:
        temporary_zip = args.output / ('.package-' + uuid.uuid4().hex + '.zip')
        with zipfile.ZipFile(temporary_zip, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as package:
            for path in sorted(stage.rglob('*')):
                if path.is_file():
                    info = zipfile.ZipInfo(path.relative_to(stage).as_posix(), (1980, 1, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100644 << 16
                    with path.open('rb') as input_stream, package.open(info, 'w') as target_stream:
                        shutil.copyfileobj(input_stream, target_stream, 1024 * 1024)
        verify_package(stage, expected, temporary_zip)
        require(not final.exists() and not archive.exists(), 'Concurrent runtime publication detected; previous versions preserved')
        final.parent.mkdir(parents=True, exist_ok=True)
        stage.rename(final)
        temporary_zip.rename(archive)
    report = {'ok': True, 'id': identity, 'kind': args.kind, 'version': version, 'source': manifest['source'],
              'currentValidatedInput': source_info, 'reusedSealedVersion': reused,
              'cargoCacheBinding': cache_binding,
              'artifactSha256': digest(archive), 'manifestSha256': digest(final / 'build-manifest.json'), 'gates': gates,
              'sourceFiles': len(record['files']), 'payloadFiles': len(manifest['files']), 'automaticDeploymentPerformed': False}
    (logs / 'build-receipt.json').write_bytes(encode(report))
    print(json.dumps(report))


if __name__ == '__main__':
    try:
        main()
    except (BuildError, OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, tarfile.TarError) as error:
        print('Build refused: ' + str(error), file=sys.stderr)
        sys.exit(1)
