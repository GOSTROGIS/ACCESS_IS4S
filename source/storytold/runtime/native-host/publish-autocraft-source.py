"""Export complete immutable owned AutoCraft source for the authenticated Linux installer."""
import argparse
import base64
from contextlib import contextmanager
from hashlib import sha256
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile
import threading
import time
import urllib.request

PRODUCTS = {
    'access': ('https://github.com/GOSTROGIS/ACCESS_IS4S.git', 'source/storytold/apps/autocraft'),
    'slipcurve': ('https://github.com/GOSTROGIS/SLIPCURVE.git', 'vendor/storytold/apps/autocraft'),
}
SHA = re.compile(r'[a-f0-9]{40}')


class WindowsJob:
    """A new suspended process joins our non-breakaway job before any of its code executes.

    https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
    """
    def __init__(self):
        import ctypes as c
        from ctypes import wintypes as w
        class Basic(c.Structure):
            _fields_ = [('process_time', c.c_int64), ('job_time', c.c_int64), ('flags', w.DWORD),
                ('minimum', c.c_size_t), ('maximum', c.c_size_t), ('processes', w.DWORD),
                ('affinity', c.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]
        class IO(c.Structure):
            _fields_ = [(name, c.c_uint64) for name in ('read_ops', 'write_ops', 'other_ops', 'read_bytes', 'write_bytes', 'other_bytes')]
        class Extended(c.Structure):
            _fields_ = [('basic', Basic), ('io', IO), ('process_memory', c.c_size_t), ('job_memory', c.c_size_t),
                ('peak_process', c.c_size_t), ('peak_job', c.c_size_t)]
        class Thread(c.Structure):
            _fields_ = [('size', w.DWORD), ('usage', w.DWORD), ('id', w.DWORD), ('owner', w.DWORD),
                ('base', w.LONG), ('delta', w.LONG), ('flags', w.DWORD)]
        self.c, self.w, self.Thread = c, w, Thread
        self.kernel = k = c.WinDLL('kernel32', use_last_error=True)
        for name, result, args in (
            ('CreateJobObjectW', w.HANDLE, [c.c_void_p, w.LPCWSTR]),
            ('SetInformationJobObject', w.BOOL, [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]),
            ('AssignProcessToJobObject', w.BOOL, [w.HANDLE, w.HANDLE]),
            ('CloseHandle', w.BOOL, [w.HANDLE]),
            ('CreateToolhelp32Snapshot', w.HANDLE, [w.DWORD, w.DWORD]),
            ('Thread32First', w.BOOL, [w.HANDLE, c.POINTER(Thread)]),
            ('Thread32Next', w.BOOL, [w.HANDLE, c.POINTER(Thread)]),
            ('OpenThread', w.HANDLE, [w.DWORD, w.BOOL, w.DWORD]),
            ('ResumeThread', w.DWORD, [w.HANDLE]),
        ):
            function = getattr(k, name)
            function.restype, function.argtypes = result, args
        self.handle = k.CreateJobObjectW(None, None)
        if not self.handle:
            raise ValueError('The owned source process could not be contained')
        limits = Extended()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway.
        if not k.SetInformationJobObject(self.handle, 9, c.byref(limits), c.sizeof(limits)):
            self.close()
            raise ValueError('The owned source process could not be contained')

    def assign_and_resume(self, process):
        c, k = self.c, self.kernel
        if not k.AssignProcessToJobObject(self.handle, int(process._handle)):
            raise ValueError('The owned source process could not join its containment job')
        snapshot = k.CreateToolhelp32Snapshot(4, 0)  # TH32CS_SNAPTHREAD
        if snapshot == c.c_void_p(-1).value:
            raise ValueError('The owned source process thread could not be opened')
        try:
            thread = self.Thread()
            thread.size = c.sizeof(thread)
            more = k.Thread32First(snapshot, c.byref(thread))
            while more:
                if thread.owner == process.pid:
                    handle = k.OpenThread(2, False, thread.id)  # THREAD_SUSPEND_RESUME
                    if handle:
                        try:
                            if k.ResumeThread(handle) == 1:
                                return
                        finally:
                            k.CloseHandle(handle)
                more = k.Thread32Next(snapshot, c.byref(thread))
            raise ValueError('The owned source process remained suspended')
        finally:
            k.CloseHandle(snapshot)

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


def run_bounded(args, *, env, cwd=None, input=None, timeout=900, max_output=32 * 1024 * 1024):
    """Bound output and time for this exact new process tree; never signal an existing process."""
    job = WindowsJob() if os.name == 'nt' else None
    process = None
    writer = None
    readers = []
    overflow = threading.Event()
    totals, output, errors = [0], [], []
    guard = threading.Lock()
    try:
        process = subprocess.Popen(args, env=env, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, creationflags=0x08000004 if job else 0, start_new_session=not job)
        if job:
            job.assign_and_resume(process)
        deadline = time.monotonic() + timeout
        def read(stream, target):
            try:
                while block := stream.read(65536):
                    with guard:
                        totals[0] += len(block)
                        if totals[0] > max_output:
                            overflow.set()
                        if not overflow.is_set():
                            target.append(block)
            finally:
                stream.close()
        for stream, target in ((process.stdout, output), (process.stderr, errors)):
            thread = threading.Thread(target=read, args=(stream, target), daemon=True)
            thread.start()
            readers.append(thread)
        def write():
            try:
                if input:
                    process.stdin.write(input)
                    process.stdin.flush()
            except (BrokenPipeError, OSError):
                pass
            finally:
                process.stdin.close()
        writer = threading.Thread(target=write, daemon=True)
        writer.start()
        while process.poll() is None:
            if overflow.is_set():
                raise ValueError('The owned source process exceeded its output limit')
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired('owned source process', timeout)
            try:
                process.wait(timeout=min(0.1, remaining))
            except subprocess.TimeoutExpired:
                pass
    finally:
        # Closing this unnamed job also closes descendants' inherited capture handles.
        if job:
            job.close()
        elif process:
            import signal
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if process:
            if process.poll() is None:
                process.kill()  # Only our freshly created, still-suspended process if assignment failed.
            process.wait(timeout=5)
        for reader in readers:
            reader.join(timeout=5)
        if writer:
            writer.join(timeout=5)
        if any(reader.is_alive() for reader in readers) or writer and writer.is_alive():
            raise ValueError('The owned source process capture did not close')
        if process:
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream and not stream.closed:
                    stream.close()
    if overflow.is_set():
        raise ValueError('The owned source process exceeded its output limit')
    return subprocess.CompletedProcess(args, process.returncode, b''.join(output), b''.join(errors))


def environment():
    allowed = {'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP'}
    result = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    result.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull,
                  GIT_TERMINAL_PROMPT='0', GIT_ATTR_NOSYSTEM='1', GIT_NO_LAZY_FETCH='1',
                  GIT_NO_REPLACE_OBJECTS='1')
    return result


def git_command(git, repo, *args):
    return [str(git), '-C', str(repo), '-c', 'core.longpaths=true', '-c', 'core.fsmonitor=false',
            '-c', 'core.hooksPath=' + os.devnull, '-c', 'credential.helper=', '-c', 'gc.auto=0',
            '-c', 'maintenance.auto=false', '-c', 'protocol.allow=never',
            '-c', 'protocol.https.allow=always', '-c', 'http.sslVerify=true',
            '-c', 'http.followRedirects=false', '-c', 'http.proxy=', *map(str, args)]


def run(git, repo, *args, network_env=None, input=None):
    result = run_bounded(git_command(git, repo, *args), env=network_env or environment(), input=input, timeout=900)
    if result.returncode:
        raise ValueError('The approved Git source operation failed')
    return result.stdout


def safe_name(name):
    path = PurePosixPath(name)
    return (bool(name) and not path.is_absolute() and all(part not in ('', '.', '..') for part in name.split('/'))
            and not re.search(r'[\\:\x00-\x1f\x7f]', name))


def cache_objects(repo):
    """Borrow only content-addressed object bytes; never read the cache's Git configuration."""
    repo = Path(repo).resolve(strict=True)
    for candidate in (repo / '.git' / 'objects', repo / 'objects'):
        if candidate.is_dir():
            return candidate.resolve(strict=True)
    return None


def acquire_source(git, cache, product, network, network_env=None):
    """All network operations happen in a new template-free, configuration-free bare repository."""
    origin, _ = PRODUCTS[product]
    network = Path(network).absolute()
    if network.exists() or network.is_symlink() or network.parent.resolve(strict=True) != network.parent:
        raise ValueError('The source transport requires a new canonical temporary repository')
    run(git, network.parent, 'init', '--bare', '--template=', network)
    objects = cache_objects(cache)
    if objects:
        # An alternate does not import config, hooks, refs, replace refs, or working files.
        # Git reads this machine format literally; Windows text-mode CRLF would become part of the path.
        (network / 'objects' / 'info' / 'alternates').write_bytes((objects.as_posix() + '\n').encode('utf-8'))
    run(git, network, 'remote', 'add', 'origin', origin)
    observed = run(git, network, 'ls-remote', '--exit-code', origin, 'refs/heads/main', network_env=network_env).decode().split()
    if len(observed) != 2 or observed[1] != 'refs/heads/main' or not SHA.fullmatch(observed[0]):
        raise ValueError('The owned GitHub main branch could not be verified')
    revision = observed[0]
    if not complete_application(git, network, revision, product):
        # A broken cached graph can otherwise convince fetch that a missing blob is already present.
        # Only the new transport's alternate pointer is removed; the user's cache remains untouched.
        (network / 'objects' / 'info' / 'alternates').unlink(missing_ok=True)
        run(git, network, 'fetch', '--depth=1', '--no-tags', '--no-recurse-submodules', origin, revision, network_env=network_env)
    return revision


def complete_application(git, repo, revision, product):
    """A cache is optional; an incomplete target requires a real fixed-origin fetch."""
    try:
        run(git, repo, 'cat-file', '-e', revision + '^{commit}')
        tree = run(git, repo, 'rev-parse', revision + ':' + PRODUCTS[product][1]).decode().strip()
        if not SHA.fullmatch(tree):
            return False
        ids = []
        for item in run(git, repo, 'ls-tree', '-rz', tree).split(b'\0'):
            if item:
                header, _ = item.split(b'\t', 1)
                _, kind, oid = header.split()
                if kind != b'blob' or not SHA.fullmatch(oid.decode('ascii')):
                    return False
                ids.append(oid)
        if not ids:
            return False
        checks = run(git, repo, 'cat-file', '--batch-check', input=b'\n'.join(ids) + b'\n').splitlines()
        return len(checks) == len(ids) and all(len(row.split()) == 3 and row.split()[1] == b'blob' for row in checks)
    except (ValueError, UnicodeError):
        return False


@contextmanager
def network_credentials(git, product):
    """Existing native GitHub identity, confined to fixed-origin HTTPS child memory."""
    if os.name != 'nt':
        yield None
        return
    git = Path(git).resolve(strict=True)
    manager = next((git.parent.parent / architecture / 'bin/git-credential-manager.exe'
        for architecture in ('ucrt64', 'mingw64')
        if (git.parent.parent / architecture / 'bin/git-credential-manager.exe').is_file()), None)
    if manager is None:
        raise ValueError('The approved native Git Credential Manager is unavailable')
    keys = {'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
            'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'USERNAME', 'USERDOMAIN'}
    env = {key: value for key, value in os.environ.items() if key.upper() in keys}
    env.update(GCM_INTERACTIVE='false', GCM_TRACE='false', GCM_TRACE_SECRETS='false',
               GCM_TRACE_MSAUTH='false', GCM_DEBUG='false', GIT_TERMINAL_PROMPT='0')
    path_key = next((key for key in env if key.upper() == 'PATH'), 'PATH')
    env[path_key] = str(git.parent) + os.pathsep + str(manager.parent) + os.pathsep + env.get(path_key, '')
    access = ''
    try:
        with tempfile.TemporaryDirectory(prefix='autocraft-native-source-auth-') as cwd:
            result = run_bounded([str(manager), 'get'], input=b'protocol=https\nhost=github.com\n\n',
                cwd=Path(cwd).resolve(strict=True), env=env, timeout=30, max_output=32768)
        if result.returncode or len(result.stdout) > 32768:
            raise ValueError('The existing native GitHub sign-in is unavailable')
        values = dict(line.split('=', 1) for line in result.stdout.decode('utf-8').splitlines() if '=' in line)
        access = values.pop('password', '')
        result = None
        values.clear()
        if not re.fullmatch(r'[\x21-\x7e]{20,4096}', access):
            raise ValueError('The existing native GitHub sign-in is unavailable')
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
        def api(path):
            request = urllib.request.Request('https://api.github.com' + path,
                headers={'Authorization': 'Bearer ' + access, 'Accept': 'application/vnd.github+json',
                    'User-Agent': 'ACCESS-AutoCraft-Source-Publisher', 'X-GitHub-Api-Version': '2022-11-28'})
            with opener.open(request, timeout=15) as response:
                return json.loads(response.read(1024 * 1024))
        owner = api('/user')
        repository = PRODUCTS[product][0].removeprefix('https://github.com/').removesuffix('.git')
        project = api('/repos/' + repository)
        if str(owner.get('login', '')).lower() != 'gostrogis' or not isinstance(owner.get('id'), int) or owner['id'] <= 0 or \
            project.get('owner', {}).get('id') != owner['id'] or project.get('permissions', {}).get('admin') is not True:
            raise ValueError('The existing native identity does not administer the approved owned source')
        child = environment()
        child.update(GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='http.https://github.com/.extraheader',
            GIT_CONFIG_VALUE_0='Authorization: Basic ' + base64.b64encode(('x-access-token:' + access).encode()).decode())
        try:
            yield child
        finally:
            child.clear()
    finally:
        access = ''


def build_candidate(git, repo, product, revision, destination):
    if product not in PRODUCTS or not SHA.fullmatch(revision):
        raise ValueError('Invalid product or published source pin')
    repo = Path(repo).resolve(strict=True)
    origin, prefix = PRODUCTS[product]
    if run(git, repo, 'remote', 'get-url', 'origin').decode().strip() != origin:
        raise ValueError('The source cache is not the approved owned repository')
    if run(git, repo, 'rev-parse', '--verify', revision + '^{commit}').decode().strip() != revision:
        raise ValueError('The published source commit is missing')
    commit = run(git, repo, 'cat-file', 'commit', revision)
    verify_object('commit', revision, commit)
    root_tree = commit.split(b'\n', 1)[0].removeprefix(b'tree ').decode('ascii')
    tree = root_tree
    for part in prefix.split('/'):
        entries = read_tree(git, repo, tree)
        match = next((oid for mode, oid, name in entries if mode == '40000' and name == part), None)
        if match is None:
            raise ValueError('The published application tree is missing')
        tree = match
    if not SHA.fullmatch(tree):
        raise ValueError('Invalid owned application tree')
    rows = []
    def walk(oid, parent=''):
        for mode, object_id, child in read_tree(git, repo, oid):
            name = parent + child
            if not safe_name(name):
                raise ValueError('Unsupported or unsafe application source entry')
            if mode == '40000':
                walk(object_id, name + '/')
            elif mode in ('100644', '100755'):
                rows.append((mode, object_id, name))
            else:
                raise ValueError('Unsupported or unsafe application source entry')
    walk(tree)
    if not rows:
        raise ValueError('The application source is empty')
    destination = Path(destination).absolute()
    parent = destination.parent.resolve(strict=True)
    if parent != destination.parent or destination.exists() or destination.is_symlink():
        raise ValueError('Use a new candidate directory beneath a canonical existing parent')
    destination.mkdir()
    source = destination / 'source'
    source.mkdir()
    stamp = int(run(git, repo, 'show', '-s', '--format=%ct', revision).strip())
    files, locks = {}, {}
    archive = destination / 'source.tar'
    proc = subprocess.Popen(git_command(git, repo, 'cat-file', '--batch'), env=environment(),
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        with tarfile.open(archive, 'w', format=tarfile.PAX_FORMAT) as output:
            for mode, object_id, name in rows:
                proc.stdin.write((object_id + '\n').encode('ascii'))
                proc.stdin.flush()
                answer = proc.stdout.readline().decode('ascii').strip().split()
                if len(answer) != 3 or answer[:2] != [object_id, 'blob']:
                    raise ValueError('Git did not return the pinned source object')
                size = int(answer[2])
                data = proc.stdout.read(size)
                if len(data) != size or proc.stdout.read(1) != b'\n':
                    raise ValueError('Incomplete source object')
                verify_object('blob', object_id, data)
                path = source.joinpath(*name.split('/'))
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                pin = {'bytes': size, 'sha256': sha256(data).hexdigest(), 'mode': mode}
                files[name] = pin
                if name in ('package.json', 'pnpm-lock.yaml'):
                    locks[name] = pin['sha256']
                info = tarfile.TarInfo(name)
                info.size, info.mtime, info.mode = size, stamp, int(mode[-3:], 8)
                output.addfile(info, io.BytesIO(data))
        proc.stdin.close()
        if proc.wait(timeout=30) != 0:
            raise ValueError('Source object export failed')
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        for stream in (proc.stdin, proc.stdout, proc.stderr):
            stream.close()
    if set(locks) != {'package.json', 'pnpm-lock.yaml'}:
        raise ValueError('The full application package and frozen dependency lock are required')
    with archive.open('rb') as stream:
        import hashlib
        archive_hash = hashlib.file_digest(stream, 'sha256').hexdigest()
    receipt = {'schema': 1, 'product': product, 'application': 'autocraft',
               'source': {'repository': origin, 'commit': revision, 'prefix': prefix, 'tree': tree},
               'archiveSha256': archive_hash, 'locks': locks, 'files': files,
               'qualification': 'Source bytes verified; Linux dependency, application and authentication gates are still required.'}
    (destination / 'source-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    return receipt


def verify_object(kind, object_id, data):
    import hashlib
    actual = hashlib.sha1(kind.encode('ascii') + b' ' + str(len(data)).encode('ascii') + b'\0' + data).hexdigest()
    if actual != object_id:
        raise ValueError('Pinned Git object content is corrupt')


def read_tree(git, repo, object_id):
    data = run(git, repo, 'cat-file', 'tree', object_id)
    verify_object('tree', object_id, data)
    entries, cursor = [], 0
    while cursor < len(data):
        zero = data.index(b'\0', cursor)
        mode, name = data[cursor:zero].split(b' ', 1)
        cursor = zero + 21
        raw_id = data[zero + 1:cursor]
        if len(raw_id) != 20:
            raise ValueError('Incomplete pinned Git tree')
        entries.append((mode.decode('ascii'), raw_id.hex(), name.decode('utf-8')))
    return entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--product', choices=PRODUCTS, required=True)
    parser.add_argument('--git', type=Path, required=True)
    parser.add_argument('--source-cache', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='autocraft-owned-source-') as temporary:
        network = Path(temporary).resolve(strict=True) / 'network.git'
        with network_credentials(args.git, args.product) as credentials:
            revision = acquire_source(args.git, args.source_cache, args.product, network, credentials)
        receipt = build_candidate(args.git, network, args.product, revision, args.output)
    print(json.dumps({key: receipt[key] for key in ('product', 'source', 'archiveSha256')}))


if __name__ == '__main__':
    main()
