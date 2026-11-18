#!/usr/bin/env python3
"""Verified AutoCraft Linux editions; private paths are supplied by the host."""
import argparse
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import time
import urllib.request

NAME = re.compile(r'[a-z0-9][a-z0-9._-]{0,95}')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def atomic_json(path, value):
    temp = path.with_suffix('.next')
    with temp.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temp, 0o600)
    os.replace(temp, path)
    descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def digest_tree(root):
    digest = hashlib.sha256()
    for directory, dirs, files in os.walk(root, followlinks=False):
        links = [name for name in dirs if (Path(directory) / name).is_symlink()]
        dirs[:] = sorted(name for name in dirs if name not in links)
        for name in sorted(files + links):
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            digest.update(relative.encode() + b'\0')
            if path.is_symlink():
                target = os.readlink(path)
                resolved = path.resolve(strict=True)
                if not resolved.is_relative_to(root.resolve()):
                    raise ValueError('Runtime symlink escapes its edition')
                digest.update(b'link\0' + target.encode() + b'\0')
            elif path.is_file():
                digest.update(b'file\0' + oct(path.stat().st_mode & 0o777).encode() + b'\0')
                with path.open('rb') as stream:
                    for block in iter(lambda: stream.read(1024 * 1024), b''):
                        digest.update(block)
                digest.update(b'\0')
            else:
                raise ValueError('Unsupported runtime entry')
    return digest.hexdigest()


def migration_inputs(root):
    database = root / 'src/db.ts'
    paths = {database, *root.joinpath('src').rglob('*.sql')}
    # db.ts performs backfills through these directly imported helpers too.
    for relative in re.findall(r'''from\s+["'](\./[^"']+)["']''', database.read_text()):
        path = (database.parent / relative).resolve(strict=True)
        if not path.is_relative_to(root.resolve()):
            raise ValueError('Migration helper escapes the runtime')
        paths.add(path)
    files = {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(paths)}
    digest = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'sha256': digest, 'files': files}


def verify_source(root, receipt):
    expected = receipt.get('files')
    if not isinstance(expected, dict) or not expected:
        raise ValueError('Verified source inventory is required')
    tree = {}
    for relative, entry in expected.items():
        if (not isinstance(relative, str) or not relative or relative.startswith('/') or
                re.search(r'[\\:\x00-\x1f\x7f]', relative) or
                any(part in ('', '.', '..', '.git', '.private') for part in relative.split('/'))):
            raise ValueError('Unsafe source inventory entry')
        if (not isinstance(entry, dict) or entry.get('mode') not in ('100644', '100755', '120000') or
                not isinstance(entry.get('bytes'), int) or isinstance(entry['bytes'], bool) or entry['bytes'] < 0 or
                not re.fullmatch(r'[a-f0-9]{64}', entry.get('sha256', ''))):
            raise ValueError('Invalid source inventory entry')
        path = root / relative
        if not path.resolve(strict=True).is_relative_to(root.resolve()):
            raise ValueError('Source entry escapes candidate')
        data = os.readlink(path).encode() if path.is_symlink() else path.read_bytes()
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError('Candidate differs from verified committed source')
        if (entry['mode'] == '120000') != path.is_symlink():
            raise ValueError('Source mode mismatch')
        if not path.is_symlink() and bool(path.stat().st_mode & 0o111) != (entry['mode'] == '100755'):
            raise ValueError('Source executable mode mismatch')
        cursor = tree
        parts = relative.split('/')
        for part in parts[:-1]:
            cursor = cursor.setdefault(part, {})
            if not isinstance(cursor, dict):
                raise ValueError('Source file and directory paths collide')
        if parts[-1] in cursor:
            raise ValueError('Source file and directory paths collide')
        cursor[parts[-1]] = (entry['mode'], hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).digest())

    def tree_hash(entries):
        payload = bytearray()
        for name, value in sorted(entries.items(), key=lambda item: item[0].encode() + (b'/' if isinstance(item[1], dict) else b'')):
            mode, object_id = ('40000', tree_hash(value)) if isinstance(value, dict) else value
            payload.extend(mode.encode() + b' ' + name.encode() + b'\0' + object_id)
        return hashlib.sha1(b'tree ' + str(len(payload)).encode() + b'\0' + payload).digest()

    # Installed dependencies and Vite's compiled output are separately frozen by
    # the full runtime digest. Everything else must belong to the Git source tree.
    generated = {'node_modules', 'web/node_modules', 'web/dist'}
    actual = set()
    for directory, dirs, files in os.walk(root, followlinks=False):
        kept = []
        for name in dirs:
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            if relative in generated:
                continue
            if path.is_symlink():
                actual.add(relative)
            else:
                kept.append(name)
        dirs[:] = kept
        actual.update((Path(directory) / name).relative_to(root).as_posix() for name in files)
    unlisted = actual - set(expected)
    if unlisted:
        raise ValueError('Runtime contains unlisted source entries')

    actual_tree = tree_hash(tree).hex()
    if actual_tree != receipt.get('source', {}).get('tree'):
        raise ValueError('Source inventory does not reconstruct the complete verified Git tree')
    return actual_tree


def database_state(path, equivalent_eol_metadata=False):
    database = sqlite3.connect('file:' + str(path) + '?mode=ro', uri=True)
    try:
        if database.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('Private database integrity check failed')
        schema = database.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").fetchall()
        if equivalent_eol_metadata:
            schema = [(kind, name, table, sql.replace('\r\n', '\n') if sql else sql) for kind, name, table, sql in schema]
        rows = {}
        encode = lambda value: {'blob': value.hex()} if isinstance(value, bytes) else value
        for kind, name, _, _ in schema:
            if kind == 'table':
                quoted = '"' + name.replace('"', '""') + '"'
                query = 'SELECT * FROM ' + quoted
                if equivalent_eol_metadata and name == 'settings':
                    query += " WHERE key <> 'schema_stamp'"
                values = [[encode(value) for value in row] for row in database.execute(query)]
                rows[name] = sorted(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in values)
        serialized = json.dumps({'schema': schema, 'rows': rows}, sort_keys=True, separators=(',', ':')).encode()
        return hashlib.sha256(serialized).hexdigest()
    finally:
        database.close()


class Runtime:
    def __init__(self, args):
        self.root = Path(args.runtime_root).resolve()
        self.data = Path(args.data_root).resolve()
        self.node = str(Path(args.node).resolve(strict=True))
        self.gate = Path(args.gate).resolve(strict=True)
        self.pnpm = self.root.parent / 'tools/pnpm/11.28.10/bin/pnpm.cjs'
        self.units_list = tuple('autocraft-intranet-' + args.instance + '-' + kind + '.service'
            for kind in ('runner', 'dashboard'))
        self.worker_port = args.worker_port
        self.instance = args.instance
        self.dashboard = (8993, '127.0.0.2:8993') if args.instance == 'access' else (8994, '127.0.0.3:8994')
        self.http = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        if self.root == self.data or self.data.is_relative_to(self.root):
            raise ValueError('User data must remain outside immutable runtime editions')
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        (self.root / 'editions').mkdir(mode=0o700, exist_ok=True)
        (self.root / 'receipts').mkdir(mode=0o700, exist_ok=True)
        self.data.mkdir(mode=0o700, parents=True, exist_ok=True)

    @contextlib.contextmanager
    def lease(self):
        with (self.root / 'update.lock').open('a') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX)
            yield

    def edition(self, name):
        if not NAME.fullmatch(name):
            raise ValueError('Invalid edition identifier')
        return self.root / 'editions' / name

    def receipt(self, name):
        self.edition(name)
        return self.root / 'receipts' / (name + '.json')

    def pending(self, name):
        self.edition(name)
        return self.root / 'receipts' / (name + '.pending.json')

    def current(self):
        path = self.root / 'current'
        if not path.exists():
            if path.is_symlink():
                raise ValueError('Active edition selector has a missing target')
            return None
        if not path.is_symlink() or path.resolve().parent != (self.root / 'editions'):
            raise ValueError('Invalid active edition selector')
        return path.resolve().name

    def verify(self, name):
        receipt = json.loads(self.receipt(name).read_text())
        if receipt.get('qualified') is not True or receipt.get('edition') != name:
            raise ValueError('Edition has no qualified receipt')
        actual = digest_tree(self.edition(name))
        if actual != receipt['treeSha256']:
            raise ValueError('Runtime core digest mismatch')
        return receipt

    def check(self, name):
        self.verify(name)
        self.regression(name)
        self.verify(name)
        return {'edition': name, 'coreVerified': True, 'functionalGate': 'passed'}

    def phase(self, label, args, *, env, cwd=None, timeout=600):
        if not re.fullmatch(r'[a-z0-9-]{1,48}', label):
            raise ValueError('Invalid build phase')
        directory = self.data / 'build-diagnostics'
        directory.mkdir(mode=0o700, exist_ok=True)
        if directory.is_symlink() or directory.resolve() != directory:
            raise ValueError('Private build diagnostics may not be redirected')
        run = Path(tempfile.mkdtemp(prefix=label + '-', dir=directory))
        started = time.monotonic()
        result = {'phase': label, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'exitCode': None, 'timedOut': False, 'outputLimit': False, 'processGroupContained': True}
        process = None
        saved_signals = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGHUP)}

        def interrupted(signum, _frame):
            result['interruptedSignal'] = signum
            raise SystemExit(128 + signum)

        for sig in saved_signals:
            signal.signal(sig, interrupted)
        with (run / 'stdout.log').open('xb') as out, (run / 'stderr.log').open('xb') as err:
            os.chmod(out.name, 0o600)
            os.chmod(err.name, 0o600)
            try:
                process = subprocess.Popen(args, cwd=cwd, env=env, stdout=out, stderr=err, start_new_session=True)
                while process.poll() is None:
                    if time.monotonic() - started >= timeout:
                        result['timedOut'] = True
                        break
                    if out.tell() > 16 * 1024 * 1024 or err.tell() > 16 * 1024 * 1024:
                        result['outputLimit'] = True
                        break
                    time.sleep(0.1)
            except OSError as error:
                result['spawnError'] = error.errno
            finally:
                for sig in saved_signals:
                    signal.signal(sig, signal.SIG_IGN)
                if process is not None:
                    # This new session owns only this build and its descendants, never app services.
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        pass
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    result['exitCode'] = process.wait()
                result['elapsedSeconds'] = round(time.monotonic() - started, 3)
                atomic_json(run / 'result.json', result)
                atomic_json(directory / 'last-result.json', result)
                for sig, handler in saved_signals.items():
                    signal.signal(sig, handler)
        if result.get('spawnError') is not None or result['timedOut'] or result['outputLimit'] or result['exitCode'] != 0:
            kind = 'time limit' if result['timedOut'] else 'output limit' if result['outputLimit'] else 'exit ' + str(result['exitCode'])
            raise RuntimeError('Linux build phase ' + label + ' failed: ' + kind + '; private diagnostics retained')
        return subprocess.CompletedProcess(args, result['exitCode'],
            (run / 'stdout.log').read_text(errors='replace'), (run / 'stderr.log').read_text(errors='replace'))

    def source_receipt(self, path):
        receipt = json.loads(Path(path).read_text())
        source = receipt.get('source', {})
        files = receipt.get('files')
        if not isinstance(source, dict) or not isinstance(files, dict) or not files:
            raise ValueError('Invalid fresh source receipt inventory')
        for relative, entry in files.items():
            if (not isinstance(relative, str) or not relative or relative.startswith('/') or
                    re.search(r'[\\:\x00-\x1f\x7f]', relative) or
                    any(part in ('', '.', '..', '.git', '.private') for part in relative.split('/')) or
                    not isinstance(entry, dict) or entry.get('mode') not in ('100644', '100755', '120000') or
                    not isinstance(entry.get('bytes'), int) or isinstance(entry['bytes'], bool) or entry['bytes'] < 0 or
                    not re.fullmatch(r'[a-f0-9]{64}', entry.get('sha256', ''))):
                raise ValueError('Invalid fresh source receipt entry')
        repository = 'https://github.com/GOSTROGIS/' + ('ACCESS_IS4S' if self.instance == 'access' else 'SLIPCURVE') + '.git'
        prefix = 'source/storytold/apps/autocraft' if self.instance == 'access' else 'vendor/storytold/apps/autocraft'
        if (receipt.get('schema') != 1 or receipt.get('product') != self.instance or receipt.get('application') != 'autocraft' or
                source.get('repository') != repository or source.get('prefix') != prefix or
                not re.fullmatch(r'[a-f0-9]{40}', source.get('commit', '')) or
                not re.fullmatch(r'[a-f0-9]{40}', source.get('tree', '')) or
                not re.fullmatch(r'[a-f0-9]{64}', receipt.get('archiveSha256', '')) or
                not receipt.get('files', {}).get('src/cli.ts') or
                not any(name.startswith('web/src/') for name in receipt.get('files', {}))):
            raise ValueError('Fresh source receipt does not match the fixed product')
        return receipt

    def match_source(self, path):
        fresh = self.source_receipt(path)
        checked = fresh['source']['commit']
        state = json.loads((self.root / 'selection.json').read_text())
        names = list(dict.fromkeys(name for name in (self.current(), state.get('previous')) if name))
        for name in names:
            receipt = json.loads(self.receipt(name).read_text())
            if receipt.get('qualified') is not True or receipt.get('edition') != name:
                raise ValueError('Source matching requires an existing qualified edition')
            if (receipt.get('sourceRepository') != fresh['source']['repository'] or
                    receipt.get('sourcePrefix') != fresh['source']['prefix'] or
                    receipt.get('sourceTree') != fresh['source']['tree']):
                continue
            original = self.verify(name)
            verify_source(self.edition(name), fresh)
            return {'matched': True, 'checkedSourceRef': checked, 'qualified': original}
        return {'matched': False, 'checkedSourceRef': checked}

    def regression(self, name):
        allowed = ('PATH', 'LANG', 'LC_ALL', 'TZ', 'USER', 'LOGNAME', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS')
        env = {key: os.environ[key] for key in allowed if key in os.environ}
        env['PATH'] = str(Path(self.node).parent) + ':/usr/local/bin:/usr/bin:/bin'
        scratch = self.root / 'gate-work'
        scratch.mkdir(mode=0o700, exist_ok=True)
        result = self.phase('functional-gate', [self.node, str(self.gate), str(self.edition(name)), str(scratch), self.instance], env=env, timeout=120)
        if result.returncode:
            raise RuntimeError('Actual Linux rank/queue regression failed: ' + result.stderr[-1500:])
        print(result.stdout.strip(), flush=True)

    def dependencies(self, final):
        if (final / 'node_modules').is_dir():
            return
        current = self.current()
        package_files = ('package.json', 'web/package.json', 'pnpm-lock.yaml', 'web/pnpm-lock.yaml', 'pnpm-workspace.yaml')
        if current:
            self.verify(current)
            previous = self.edition(current)
            if all((previous / name).is_file() and (final / name).is_file()
                and (previous / name).read_bytes() == (final / name).read_bytes() for name in package_files):
                for name in ('node_modules', 'web/node_modules'):
                    if (previous / name).is_dir():
                        shutil.copytree(previous / name, final / name, symlinks=True)
                return
        package = json.loads((final / 'package.json').read_text())
        if package.get('packageManager') != 'pnpm@11.28.10':
            raise ValueError('Unqualified package-manager version')
        env = {key: os.environ[key] for key in ('LANG', 'LC_ALL', 'TZ', 'USER', 'LOGNAME') if key in os.environ}
        env['PATH'] = str(Path(self.node).parent) + ':/usr/local/bin:/usr/bin:/bin'
        env['CI'] = '1'
        result = self.phase('production-dependencies', [self.node, str(self.pnpm), 'install', '--prod', '--frozen-lockfile'], cwd=final, env=env, timeout=600)
        if result.returncode:
            raise RuntimeError('Frozen Linux production dependency installation failed')

    def frontend(self, final):
        """Build the complete HTTP-backed dashboard from this candidate's source."""
        if not self.pnpm.is_file():
            raise ValueError('The verified pinned pnpm runtime is not installed')
        env = {key: os.environ[key] for key in ('LANG', 'LC_ALL', 'TZ', 'USER', 'LOGNAME') if key in os.environ}
        env.update(PATH=str(Path(self.node).parent) + ':/usr/local/bin:/usr/bin:/bin', CI='1',
            NODE_OPTIONS='--max-old-space-size=512', VITE_MOCK='0')
        package = json.loads((final / 'web/package.json').read_text())
        if package.get('packageManager') != 'pnpm@11.28.10' or not (final / 'web/pnpm-lock.yaml').is_file():
            raise ValueError('The full pinned dashboard package and frozen lock are required')
        version = self.phase('package-manager-version', [self.node, str(self.pnpm), '--version'], env=env, timeout=30)
        if version.stdout.strip() != '11.28.10':
            raise ValueError('Pinned package manager mismatch')
        for directory in (final, final / 'web'):
            label = 'root-build-dependencies' if directory == final else 'web-build-dependencies'
            result = self.phase(label, [self.node, str(self.pnpm), 'install', '--frozen-lockfile', '--child-concurrency=1', '--network-concurrency=4'], cwd=directory, env=env, timeout=600)
            if result.returncode:
                raise RuntimeError('Frozen dashboard build dependency installation failed: ' + result.stderr[-1200:])
        # Rebuild even when a source payload includes a prior output directory.
        shutil.rmtree(final / 'web/dist', ignore_errors=True)
        result = self.phase('frontend-build', [self.node, str(self.pnpm), 'run', 'build'], cwd=final / 'web', env=env, timeout=600)
        if result.returncode:
            raise RuntimeError('Genuine production dashboard build failed: ' + (result.stdout + result.stderr)[-2000:])
        index = final / 'web/dist/index.html'
        if not index.is_file() or not list((final / 'web/dist/assets').glob('*.js')):
            raise ValueError('Dashboard build did not produce its real executable frontend')
        # Every generated frontend byte is included in the subsequent core digest.
        print('Genuine frozen production dashboard built with VITE_MOCK=0.', flush=True)

    def stage(self, args):
        if not re.fullmatch(r'[a-f0-9]{40}', args.source_ref):
            raise ValueError('A full verified Git source commit is required')
        self.current()  # A broken active pointer must never become a visible unqualified directory.
        final = self.edition(args.edition)
        if self.receipt(args.edition).exists():
            raise ValueError('Edition already exists')
        if final.exists():
            if args.edition == self.current():
                raise ValueError('Cannot replace the selected runtime edition')
            if not args.replace_unqualified or self.current() == args.edition or final.is_symlink() or final.resolve().parent != self.root / 'editions':
                raise ValueError('An unqualified candidate already exists; preserve or explicitly replace it')
            quarantine = self.root / 'rejected'
            quarantine.mkdir(mode=0o700, exist_ok=True)
            rejected = args.edition + '-' + str(time.time_ns())
            final.rename(quarantine / rejected)
            if self.pending(args.edition).exists():
                self.pending(args.edition).rename(quarantine / (rejected + '.pending.json'))
        final.mkdir(mode=0o700)
        archive_hash = None
        source_receipt = None
        if args.archive:
            archive = Path(args.archive).resolve(strict=True)
            if not re.fullmatch(r'[a-f0-9]{64}', args.sha256 or ''):
                raise ValueError('An independently verified archive SHA-256 is required')
            h = hashlib.sha256()
            with archive.open('rb') as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    h.update(block)
            archive_hash = h.hexdigest()
            if archive_hash != args.sha256:
                raise ValueError('Candidate archive SHA-256 mismatch')
            if not args.source_receipt:
                raise ValueError('A host-verified source receipt is required')
            source_receipt = json.loads(Path(args.source_receipt).read_text())
            expected_repository = 'https://github.com/GOSTROGIS/' + ('ACCESS_IS4S' if self.instance == 'access' else 'SLIPCURVE') + '.git'
            expected_prefix = 'source/storytold/apps/autocraft' if self.instance == 'access' else 'vendor/storytold/apps/autocraft'
            source = source_receipt.get('source', {})
            if (source_receipt.get('schema') != 1 or source_receipt.get('product') != self.instance or
                source_receipt.get('application') != 'autocraft' or source_receipt.get('archiveSha256') != archive_hash or
                source.get('commit') != args.source_ref or not re.fullmatch(r'[a-f0-9]{40}', source.get('tree', '')) or
                source.get('repository') != expected_repository or source.get('prefix') != expected_prefix):
                raise ValueError('Source receipt does not match this product and trusted payload')
            with tarfile.open(archive) as archive_file:
                members = set()
                for member in archive_file.getmembers():
                    if '.private' in Path(member.name).parts or '.git' in Path(member.name).parts:
                        raise ValueError('Candidate must exclude credentials, user data and Git internals')
                    if member.isfile() or member.issym():
                        name = Path(member.name).as_posix()
                        if name in members:
                            raise ValueError('Duplicate source archive entry')
                        members.add(name)
                if members != set(source_receipt['files']):
                    raise ValueError('Archive differs from the verified source inventory')
                archive_file.extractall(final, filter='data')
            verify_source(final, source_receipt)
        else:
            source = Path(args.source).resolve(strict=True)
            if final.is_relative_to(source):
                raise ValueError('Candidate destination must not be inside source')
            shutil.copytree(source, final, symlinks=True, dirs_exist_ok=True,
                ignore=shutil.ignore_patterns('.private', '.git', '.env', '.env.*'))
        if not (final / 'src/cli.ts').is_file():
            raise ValueError('Candidate must contain the genuine CLI')
        self.dependencies(final)
        if not (final / 'node_modules').is_dir():
            raise ValueError('Candidate has no installed Linux dependencies')
        self.frontend(final)
        if source_receipt:
            verify_source(final, source_receipt)
        core = digest_tree(final)
        receipt = {'edition': args.edition, 'sourceRef': args.source_ref, 'archiveSha256': archive_hash,
            'treeSha256': core, 'qualified': False, 'frontendBuilt': True}
        receipt['migrationInputs'] = migration_inputs(final)
        if source_receipt:
            receipt.update(sourceTree=source_receipt['source']['tree'], sourceRepository=source_receipt['source']['repository'],
                sourcePrefix=source_receipt['source']['prefix'])
        atomic_json(self.pending(args.edition), receipt)
        return self.qualify(args.edition)

    def qualify(self, name):
        if self.receipt(name).exists():
            raise ValueError('Edition is already qualified')
        receipt = json.loads(self.pending(name).read_text())
        if receipt.get('edition') != name or receipt.get('qualified') is not False or receipt.get('frontendBuilt') is not True:
            raise ValueError('Candidate has no completed frozen-build checkpoint')
        if not re.fullmatch(r'[a-f0-9]{40}', receipt.get('sourceRef', '')):
            raise ValueError('Candidate has no verified source commit')
        core = digest_tree(self.edition(name))
        if core != receipt['treeSha256']:
            raise ValueError('Built candidate changed before qualification')
        self.regression(name)
        if core != digest_tree(self.edition(name)):
            raise ValueError('Regression mutated installed runtime core')
        receipt['qualified'] = True
        receipt['qualifiedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        atomic_json(self.receipt(name), receipt)
        self.pending(name).unlink()
        return receipt

    def active_units(self):
        return [unit for unit in self.units_list if any(subprocess.run(['systemctl', '--user', query, '--quiet', unit],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0 for query in ('is-active', 'is-enabled'))]

    def units(self, action, units):
        if units:
            subprocess.run(['systemctl', '--user', action, *units], check=True, timeout=60)

    def ready(self, dashboard=False):
        url = 'http://127.0.0.1:' + str(self.dashboard[0] if dashboard else self.worker_port) + '/readyz'
        request = urllib.request.Request(url, headers={'Host': self.dashboard[1]} if dashboard else {})
        for _ in range(60):
            try:
                with self.http.open(request, timeout=1) as response:
                    if response.status == 200:
                        return
            except OSError:
                pass
            time.sleep(0.25)
        raise RuntimeError('Runner readiness failed after activation')

    def select(self, name):
        temporary = self.root / 'current.next'
        temporary.unlink(missing_ok=True)
        temporary.symlink_to('editions/' + name, target_is_directory=True)
        os.replace(temporary, self.root / 'current')

    def migration_proof_path(self, old, new):
        return self.data / 'migration-proofs' / (old['treeSha256'] + '-' + new['treeSha256'] + '.json')

    def bootstrap(self, name):
        previous = self.current()
        if not previous:
            return self.activate(name)
        if previous == name:
            return {'current': name, 'changed': False}
        old, new = self.verify(previous), self.verify(name)
        original = self.data / 'mirror.db'
        check = sqlite3.connect('file:' + str(original) + '?mode=ro', uri=True)
        try:
            if check.execute("SELECT count(*) FROM jobs WHERE state='running'").fetchone()[0]:
                raise ValueError('Wait for real jobs to finish before bootstrap compatibility proof')
        finally:
            check.close()
        units = self.active_units()
        self.units('stop', units)
        complete = False
        try:
            backups = self.data / 'backups'
            backups.mkdir(mode=0o700, exist_ok=True)
            backup = backups / ('bootstrap-' + str(time.time_ns()) + '.sqlite')
            descriptor = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.close(descriptor)
            source = sqlite3.connect('file:' + str(original) + '?mode=ro', uri=True)
            destination = sqlite3.connect(backup)
            try:
                source.backup(destination)
            finally:
                destination.close()
                source.close()
            before = database_state(backup)
            previous_inputs = migration_inputs(self.edition(previous))
            candidate_inputs = migration_inputs(self.edition(name))
            equivalent_eol = (previous_inputs['files'].keys() == candidate_inputs['files'].keys() and
                all((self.edition(previous) / relative).read_bytes().replace(b'\r\n', b'\n') ==
                    (self.edition(name) / relative).read_bytes().replace(b'\r\n', b'\n') for relative in previous_inputs['files']))
            candidate_expected = database_state(backup, equivalent_eol_metadata=equivalent_eol)
            with tempfile.TemporaryDirectory(prefix='compatibility-', dir=backups) as folder:
                working = Path(folder) / 'copy.sqlite'
                shutil.copyfile(backup, working)
                working.chmod(0o600)
                code = "import {pathToFileURL} from 'node:url';const {connect}=await import(pathToFileURL(process.argv[1]+'/src/db.ts'));const d=connect();if(d.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('integrity');d.close();"
                env = {'PATH': str(Path(self.node).parent) + ':/usr/bin:/bin', 'AUTOCRAFT_DB': str(working), 'LANG': 'C.UTF-8'}
                for edition in (name, previous):
                    result = subprocess.run([self.node, '--input-type=module', '-e', code, str(self.edition(edition))],
                        env=env, capture_output=True, text=True, timeout=120)
                    expected = candidate_expected if edition == name else before
                    actual = database_state(working, equivalent_eol_metadata=equivalent_eol and edition == name)
                    if result.returncode or actual != expected:
                        raise ValueError('Actual candidate/previous database round trip changed original schema or rows')
            if database_state(original) != before:
                raise ValueError('Live private database changed during compatibility proof')
            proof = {'previousCoreSha256': old['treeSha256'], 'candidateCoreSha256': new['treeSha256'],
                'previousSourceRef': old['sourceRef'], 'candidateSourceRef': new['sourceRef'],
                'previousMigrationSha256': migration_inputs(self.edition(previous))['sha256'],
                'candidateMigrationSha256': migration_inputs(self.edition(name))['sha256'],
                'databaseStateSha256': before, 'backupSha256': hashlib.sha256(backup.read_bytes()).hexdigest(),
                'actualCandidateAndPreviousConnectPassed': True, 'equivalentEolMigrationInputs': equivalent_eol,
                'candidateOriginalDataPreserved': True, 'exactOriginalSchemaAndRowsRestored': True}
            path = self.migration_proof_path(old, new)
            path.parent.mkdir(mode=0o700, exist_ok=True)
            atomic_json(path, proof)
            result = self.activate(name)
            result['privateCompatibilityProofSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
            complete = True
            return result
        finally:
            if not complete:
                self.units('start', units)

    def activate(self, name, rollback=False):
        state_path = self.root / 'selection.json'
        state = json.loads(state_path.read_text()) if state_path.is_file() else {}
        if state.get('updatesHeld') and not rollback:
            raise ValueError('Automatic updates are held after rollback; explicitly resume updates first')
        self.verify(name)
        previous = self.current()
        migration_policy = 'initial-install'
        if previous == name:
            return {'current': name, 'changed': False}
        if previous:
            old, new = self.verify(previous), self.verify(name)
            old_inputs, new_inputs = migration_inputs(self.edition(previous)), migration_inputs(self.edition(name))
            migration_policy = 'unchanged-inputs'
            if old_inputs != new_inputs:
                path = self.migration_proof_path(old, new)
                if not path.is_file() or path.is_symlink() or path.stat().st_mode & 0o777 != 0o600:
                    raise ValueError('Migration inputs changed; activation requires a migration and rollback compatibility gate')
                proof = json.loads(path.read_text())
                if (proof.get('previousCoreSha256') != old['treeSha256'] or proof.get('candidateCoreSha256') != new['treeSha256'] or
                    proof.get('previousSourceRef') != old['sourceRef'] or proof.get('candidateSourceRef') != new['sourceRef'] or
                    proof.get('previousMigrationSha256') != old_inputs['sha256'] or proof.get('candidateMigrationSha256') != new_inputs['sha256'] or
                    proof.get('actualCandidateAndPreviousConnectPassed') is not True or
                    proof.get('databaseStateSha256') != database_state(self.data / 'mirror.db')):
                    raise ValueError('Private compatibility proof does not match this exact runtime pair and database')
                migration_policy = 'proven-pair'
        units = self.active_units()
        self.units('stop', units)
        try:
            self.select(name)
            self.units('start', units)
            if self.units_list[0] in units:
                self.ready()
            if self.units_list[1] in units:
                self.ready(dashboard=True)
        except BaseException:
            self.units('stop', units)
            if previous:
                self.select(previous)
                self.units('start', units)
                if self.units_list[0] in units:
                    self.ready()
                if self.units_list[1] in units:
                    self.ready(dashboard=True)
            else:
                (self.root / 'current').unlink(missing_ok=True)
            raise
        state = {'current': name, 'previous': previous, 'updatesHeld': rollback}
        state['migrationGuard'] = migration_policy
        if rollback:
            state['rolledBackFrom'] = previous
            state['heldAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        atomic_json(self.root / 'selection.json', state)
        return state

    def install_services(self, dashboard):
        current = self.current()
        if not current:
            raise ValueError('A qualified runtime edition must be selected first')
        self.verify(current)
        env = self.data / 'runtime.env'
        if not env.is_file() or env.is_symlink() or env.stat().st_mode & 0o777 != 0o600:
            raise ValueError('A private mode-0600 instance environment is required')
        for path in (self.root, self.data, Path(self.node)):
            if any(character in str(path) for character in ('\n', '\r', '%', '"', '\\')):
                raise ValueError('Unsupported systemd runtime path')
        directory = Path.home() / '.config/systemd/user'
        directory.mkdir(parents=True, exist_ok=True)
        for kind, command in (('runner', 'runner serve'), ('dashboard', 'dash serve')):
            unit = next(name for name in self.units_list if name.endswith('-' + kind + '.service'))
            content = f'''[Unit]
Description=AutoCraft isolated {kind}
After=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
WorkingDirectory={self.root}/current
ExecStart={self.node} {self.root}/current/src/cli.ts {command}
EnvironmentFile={env}
Environment=PATH={Path(self.node).parent}:/usr/local/bin:/usr/bin:/bin
UMask=0077
Restart=on-failure
RestartSec=5
KillMode=mixed
TimeoutStopSec=30
MemoryHigh=384M
MemoryMax=512M
CPUQuota=50%
TasksMax=128

[Install]
WantedBy=default.target
'''
            (directory / unit).write_text(content)
        subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
        subprocess.run(['sudo', '-n', 'loginctl', 'enable-linger', str(os.getuid())], check=True)
        chosen = self.units_list if dashboard else self.units_list[:1]
        subprocess.run(['systemctl', '--user', 'enable', '--now', *chosen], check=True, timeout=60, capture_output=True)
        self.ready()
        if dashboard:
            self.ready(dashboard=True)
        return {'services': list(chosen), 'ready': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-root', required=True)
    parser.add_argument('--data-root', required=True)
    parser.add_argument('--node', default='/opt/node/bin/node')
    parser.add_argument('--gate', required=True)
    parser.add_argument('--instance', choices=('access', 'slipcurve'), required=True)
    parser.add_argument('--worker-port', type=int, required=True)
    commands = parser.add_subparsers(dest='command', required=True)
    stage = commands.add_parser('stage')
    stage.add_argument('--edition', required=True)
    source = stage.add_mutually_exclusive_group(required=True)
    source.add_argument('--source')
    source.add_argument('--archive')
    stage.add_argument('--sha256')
    stage.add_argument('--source-receipt')
    stage.add_argument('--source-ref', required=True)
    stage.add_argument('--replace-unqualified', action='store_true')
    for command in ('activate', 'verify', 'qualify', 'check', 'bootstrap'):
        commands.add_parser(command).add_argument('--edition', required=True)
    commands.add_parser('match-source').add_argument('--source-receipt', required=True)
    commands.add_parser('diagnostics')
    commands.add_parser('rollback')
    commands.add_parser('status')
    commands.add_parser('resume-updates')
    commands.add_parser('install-services').add_argument('--dashboard', action='store_true')
    args = parser.parse_args()
    if args.worker_port != (8981 if args.instance == 'access' else 8982):
        raise ValueError('Unapproved worker port')
    runtime = Runtime(args)
    with runtime.lease():
        if args.command == 'stage':
            result = runtime.stage(args)
        elif args.command == 'activate':
            result = runtime.activate(args.edition)
        elif args.command == 'match-source':
            result = runtime.match_source(args.source_receipt)
        elif args.command == 'diagnostics':
            path = runtime.data / 'build-diagnostics/last-result.json'
            result = json.loads(path.read_text()) if path.is_file() else {'phase': None}
        elif args.command == 'rollback':
            previous = json.loads((runtime.root / 'selection.json').read_text()).get('previous')
            if not previous:
                raise ValueError('No prior qualified edition is retained')
            result = runtime.activate(previous, rollback=True)
        elif args.command == 'verify':
            result = runtime.verify(args.edition)
        elif args.command == 'qualify':
            result = runtime.qualify(args.edition)
        elif args.command == 'check':
            result = runtime.check(args.edition)
        elif args.command == 'bootstrap':
            result = runtime.bootstrap(args.edition)
        elif args.command == 'install-services':
            result = runtime.install_services(args.dashboard)
        elif args.command == 'resume-updates':
            path = runtime.root / 'selection.json'
            state = json.loads(path.read_text())
            state['updatesHeld'] = False
            state.pop('rolledBackFrom', None)
            state.pop('heldAt', None)
            atomic_json(path, state)
            result = state
        else:
            selected = runtime.current()
            path = runtime.root / 'selection.json'
            state = json.loads(path.read_text()) if path.is_file() else {}
            result = {'current': selected, 'previous': state.get('previous'),
                'updatesHeld': bool(state.get('updatesHeld')), 'verified': bool(selected and runtime.verify(selected)),
                'migrationGuard': {'policy': 'unchanged-inputs', 'currentInputsSha256': migration_inputs(runtime.edition(selected))['sha256'] if selected else None}}
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
