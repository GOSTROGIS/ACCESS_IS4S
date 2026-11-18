"""Real Windows process-tree checks for the standalone project command launcher."""
import ctypes as c
from ctypes import wintypes as w
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest


LAUNCHER = Path(__file__).with_name('project-command.py')
HIDDEN = 0x08000000 if os.name == 'nt' else 0
TREE = r'''
from pathlib import Path
import ctypes as c
from ctypes import wintypes as w
import json,os,subprocess,sys,time
folder=Path(sys.argv[1]);kind=sys.argv[2]
k=c.WinDLL('kernel32',use_last_error=True)
k.GetCurrentProcess.restype=w.HANDLE
k.GetProcessTimes.argtypes=[w.HANDLE,*([c.POINTER(w.FILETIME)]*4)]
times=[w.FILETIME() for _ in range(4)]
assert k.GetProcessTimes(k.GetCurrentProcess(),*[c.byref(value) for value in times])
created=(times[0].dwHighDateTime<<32)|times[0].dwLowDateTime
if kind=='leaf':print('grandchild-output',flush=True)
(folder/(kind+'.json')).write_text(json.dumps({'pid':os.getpid(),'created':created}))
if kind=='leaf':
 time.sleep(60)
else:
 subprocess.Popen([sys.executable,__file__,str(folder),'leaf'],stdin=subprocess.DEVNULL,stdout=sys.stdout,stderr=sys.stderr,creationflags=0x08000000)
 while not (folder/'leaf.json').exists():time.sleep(.01)
 print('child-output',flush=True)
 print('child-error',file=sys.stderr,flush=True)
 while not (folder/'release').exists():time.sleep(.01)
 if kind=='exit':raise SystemExit(0)
 if kind=='flood':
  while True:os.write(1,b'x'*65536)
 time.sleep(60)
'''


class ExactProcess:
    """Keep the exact fresh process handle; never clean up by enumerated PID."""
    def __init__(self, record):
        self.k = k = c.WinDLL('kernel32', use_last_error=True)
        for name, result, args in (
            ('OpenProcess', w.HANDLE, [w.DWORD, w.BOOL, w.DWORD]),
            ('GetProcessTimes', w.BOOL, [w.HANDLE, *([c.POINTER(w.FILETIME)] * 4)]),
            ('WaitForSingleObject', w.DWORD, [w.HANDLE, w.DWORD]),
            ('TerminateProcess', w.BOOL, [w.HANDLE, w.UINT]),
            ('CloseHandle', w.BOOL, [w.HANDLE]),
        ):
            function = getattr(k, name)
            function.restype, function.argtypes = result, args
        self.handle = k.OpenProcess(0x100000 | 0x1000 | 1, False, record['pid'])
        if not self.handle:
            raise RuntimeError('Exact freshly created fixture process is missing')
        times = [w.FILETIME() for _ in range(4)]
        if not k.GetProcessTimes(self.handle, *[c.byref(value) for value in times]):
            k.CloseHandle(self.handle)
            raise RuntimeError('Fixture process creation stamp is unavailable')
        created = (times[0].dwHighDateTime << 32) | times[0].dwLowDateTime
        if created != record['created']:
            k.CloseHandle(self.handle)
            raise RuntimeError('Fixture process identity changed')

    def stopped(self, timeout_ms=10000):
        return self.k.WaitForSingleObject(self.handle, timeout_ms) == 0

    def close(self):
        # Failure cleanup is restricted to the already verified, held handle.
        if not self.stopped(0):
            self.k.TerminateProcess(self.handle, 99)
            self.stopped()
        self.k.CloseHandle(self.handle)


@unittest.skipUnless(os.name == 'nt', 'Windows Job Object integration requires Windows')
class ProcessContainment(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='project-command-test-')
        self.folder = Path(self.temporary.name)
        self.fixture = self.folder / 'tree.py'
        self.fixture.write_text(TREE, encoding='utf-8')
        self.handles = []
        self.launcher = None
        self.sentinel = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(60)'], creationflags=HIDDEN)

    def tearDown(self):
        if self.launcher:
            if self.launcher.poll() is None:
                self.launcher.kill()
            self.launcher.communicate(timeout=10)
        for handle in self.handles:
            handle.close()
        self.sentinel.terminate()
        self.sentinel.wait(timeout=10)
        self.temporary.cleanup()

    def start_tree(self, kind='sleep', timeout=2, max_output=1048576, relay=False):
        command = [sys.executable, str(LAUNCHER), '--timeout', str(timeout),
            '--max-output', str(max_output), '--', sys.executable, str(self.fixture), str(self.folder), kind]
        if relay:
            relay_file = self.folder / 'relay.py'
            relay_file.write_text('''
from pathlib import Path
import ctypes as c
from ctypes import wintypes as w
import json,subprocess,sys,time
process=subprocess.Popen(COMMAND,stdin=subprocess.DEVNULL,stdout=sys.stdout,stderr=sys.stderr,creationflags=0x08000000)
k=c.WinDLL('kernel32',use_last_error=True)
k.GetProcessTimes.argtypes=[w.HANDLE,*([c.POINTER(w.FILETIME)]*4)]
times=[w.FILETIME() for _ in range(4)]
assert k.GetProcessTimes(int(process._handle),*[c.byref(value) for value in times])
created=(times[0].dwHighDateTime<<32)|times[0].dwLowDateTime
Path(MARKER).write_text(json.dumps({'pid':process.pid,'created':created}))
time.sleep(60)
'''.replace('COMMAND', repr(command)).replace('MARKER', repr(str(self.folder / 'helper.json'))), encoding='utf-8')
            command = [sys.executable, str(relay_file)]
        self.launcher = subprocess.Popen(command,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=HIDDEN)
        deadline = time.monotonic() + 8
        for name in (('helper', kind, 'leaf') if relay else (kind, 'leaf')):
            marker = self.folder / (name + '.json')
            while not marker.exists():
                if time.monotonic() > deadline or self.launcher.poll() is not None:
                    raise AssertionError('Fixture tree did not become ready')
                time.sleep(.01)
            # File visibility can precede the tiny write becoming complete.
            while True:
                try:
                    record = json.loads(marker.read_text())
                    break
                except (ValueError, OSError):
                    if time.monotonic() > deadline:
                        raise
                    time.sleep(.01)
            self.handles.append(ExactProcess(record))

    def assert_tree_stopped_and_sentinel_alive(self):
        self.assertTrue(all(handle.stopped() for handle in self.handles))
        self.assertIsNone(self.sentinel.poll(), 'Unrelated sentinel was terminated')

    def test_timeout_closes_child_and_grandchild_only(self):
        started = time.monotonic()
        self.start_tree()
        output, error = self.launcher.communicate(timeout=10)
        self.assertEqual(self.launcher.returncode, 124)
        self.assertIn(b'child-output', output)
        self.assertIn(b'grandchild-output', output)
        self.assertIn(b'child-error', error)
        self.assertIn(b'Project command exceeded its timeout.', error)
        self.assertLess(time.monotonic() - started, 10)
        self.assert_tree_stopped_and_sentinel_alive()

    def test_abrupt_launcher_kill_closes_child_and_grandchild_only(self):
        self.start_tree(timeout=30)
        self.launcher.kill()  # Exact fresh Popen handle, not a PID search or process-name kill.
        self.launcher.communicate(timeout=10)
        self.assert_tree_stopped_and_sentinel_alive()

    def test_action_parent_death_closes_surviving_helper_and_its_tree(self):
        self.start_tree(timeout=30, relay=True)
        self.launcher.kill()  # Models stopping the Node task action, above our helper.
        self.launcher.communicate(timeout=10)
        self.assert_tree_stopped_and_sentinel_alive()

    def test_output_limit_closes_tree_and_bounds_combined_capture(self):
        self.start_tree(kind='flood', timeout=10, max_output=4096)
        (self.folder / 'release').touch()
        output, error = self.launcher.communicate(timeout=10)
        self.assertEqual(self.launcher.returncode, 125)
        self.assertLessEqual(len(output) + len(error), 4096)
        self.assertIn(b'Project command exceeded its output-limit.', error)
        self.assert_tree_stopped_and_sentinel_alive()

    def test_normal_parent_exit_closes_background_grandchild_and_drains_output(self):
        self.start_tree(kind='exit', timeout=10)
        (self.folder / 'release').touch()
        output, error = self.launcher.communicate(timeout=10)
        self.assertEqual(self.launcher.returncode, 0)
        self.assertIn(b'child-output', output)
        self.assertIn(b'grandchild-output', output)
        self.assertEqual(error, b'child-error\r\n')
        self.assert_tree_stopped_and_sentinel_alive()

    def test_nonzero_child_exit_and_binary_streams_are_preserved(self):
        result = subprocess.run([sys.executable, str(LAUNCHER), '--timeout', '5', '--', sys.executable,
            '-c', 'import os,sys;os.write(1,b"out\\x00\\xff");os.write(2,b"err\\x00\\xfe");sys.exit(7)'],
            capture_output=True, timeout=10, creationflags=HIDDEN)
        self.assertEqual(result.returncode, 7)
        self.assertEqual(result.stdout, b'out\x00\xff')
        self.assertEqual(result.stderr, b'err\x00\xfe')
        self.assertIsNone(self.sentinel.poll())

    def test_literal_arguments_do_not_pass_through_a_shell(self):
        arguments = ['two words', 'quote"inside', '$(literal)', '%PATH%', 'semi;colon']
        result = subprocess.run([sys.executable, str(LAUNCHER), '--timeout', '5', '--', sys.executable,
            '-c', 'import json,sys;print(json.dumps(sys.argv[1:]))', *arguments], capture_output=True,
            timeout=10, creationflags=HIDDEN)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), arguments)

    def test_child_stdin_is_eof(self):
        result = subprocess.run([sys.executable, str(LAUNCHER), '--timeout', '5', '--', sys.executable,
            '-c', 'import sys;print(len(sys.stdin.buffer.read()))'], input=b'synthetic-not-forwarded',
            capture_output=True, timeout=10, creationflags=HIDDEN)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), b'0')

    def test_default_one_mebibyte_output_cap_includes_diagnostic(self):
        result = subprocess.run([sys.executable, str(LAUNCHER), '--timeout', '5', '--', sys.executable,
            '-c', 'import os;os.write(2,b"x"*(2*1024*1024))'], capture_output=True, timeout=10, creationflags=HIDDEN)
        self.assertEqual(result.returncode, 125)
        self.assertLessEqual(len(result.stdout) + len(result.stderr), 1024 * 1024)
        self.assertIn(b'Project command exceeded its output-limit.', result.stderr)

    def test_invalid_resource_limits_are_rejected_before_child_start(self):
        marker = self.folder / 'must-not-run'
        code = 'from pathlib import Path;Path(' + repr(str(marker)) + ').touch()'
        for value in ('nan', 'inf', '0', '-1'):
            with self.subTest(timeout=value):
                result = subprocess.run([sys.executable, str(LAUNCHER), '--timeout', value,
                    '--', sys.executable, '-c', code], capture_output=True, timeout=10, creationflags=HIDDEN)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(marker.exists())

    def test_spawn_failure_does_not_log_executable_or_environment(self):
        sensitive = 'synthetic-private-command-marker'
        environment = dict(os.environ, PROJECT_TEST_SECRET=sensitive)
        result = subprocess.run([sys.executable, str(LAUNCHER), '--timeout', '5', '--',
            str(self.folder / sensitive)], env=environment, capture_output=True, timeout=10, creationflags=HIDDEN)
        self.assertEqual(result.returncode, 126)
        self.assertNotIn(sensitive.encode(), result.stderr)
        self.assertEqual(result.stdout, b'')


if __name__ == '__main__':
    unittest.main(verbosity=2)
