"""Run one Windows project updater inside an owned, non-breakaway process job."""
import argparse
import math
import os
import subprocess
import sys
import threading
import time


class WindowsJob:
    """Assign a suspended child before it executes; OS handle closure kills its tree.

    Uses the same Windows API contract as publish-autocraft-source.py. The unnamed
    job handle is never inherited, and no breakaway permission is enabled.
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

        self.c, self.Thread = c, Thread
        self.parent = None
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
            ('OpenProcess', w.HANDLE, [w.DWORD, w.BOOL, w.DWORD]),
            ('GetCurrentProcess', w.HANDLE, []),
            ('GetProcessTimes', w.BOOL, [w.HANDLE, *([c.POINTER(w.FILETIME)] * 4)]),
            ('WaitForSingleObject', w.DWORD, [w.HANDLE, w.DWORD]),
        ):
            function = getattr(k, name)
            function.restype, function.argtypes = result, args
        self.handle = k.CreateJobObjectW(None, None)
        if not self.handle:
            raise RuntimeError('Project process containment could not be created.')
        limits = Extended()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, without breakaway.
        if not k.SetInformationJobObject(self.handle, 9, c.byref(limits), c.sizeof(limits)):
            self.close()
            raise RuntimeError('Project process containment could not be configured.')
        # Task Scheduler may terminate the Node caller while this helper survives.
        # Hold a read-only handle to that exact parent, rather than polling a PID.
        self.parent = k.OpenProcess(0x100000 | 0x1000, False, os.getppid())
        try:
            if not self.parent:
                raise RuntimeError('Project caller lifetime could not be verified.')
            stamps = []
            for handle in (self.parent, k.GetCurrentProcess()):
                times = [w.FILETIME() for _ in range(4)]
                if not k.GetProcessTimes(handle, *[c.byref(value) for value in times]):
                    raise RuntimeError('Project caller lifetime could not be verified.')
                stamps.append((times[0].dwHighDateTime << 32) | times[0].dwLowDateTime)
            if stamps[0] > stamps[1] or self.parent_exited():
                raise RuntimeError('Project caller exited before containment started.')
        except BaseException:
            self.close()
            raise

    def parent_exited(self):
        return self.kernel.WaitForSingleObject(self.parent, 0) != 0x102  # WAIT_TIMEOUT

    def assign_and_resume(self, process):
        c, k = self.c, self.kernel
        if not k.AssignProcessToJobObject(self.handle, int(process._handle)):
            raise RuntimeError('Project process could not join its containment job.')
        snapshot = k.CreateToolhelp32Snapshot(4, 0)  # TH32CS_SNAPTHREAD
        if snapshot == c.c_void_p(-1).value:
            raise RuntimeError('Project process could not be resumed.')
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
            raise RuntimeError('Project process remained suspended.')
        finally:
            k.CloseHandle(snapshot)

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None
        if self.parent:
            self.kernel.CloseHandle(self.parent)
            self.parent = None


def run_command(command, *, timeout, max_output=1024 * 1024, env=None, cwd=None, input=None):
    """Return (child result, limit reason); never log command arguments or environment."""
    if os.name != 'nt':
        raise RuntimeError('Windows process containment is required.')
    if not command or not math.isfinite(timeout) or not 0 < timeout <= 86400 or not 0 < max_output <= 256 * 1024 * 1024:
        raise ValueError('A command and finite positive resource limits are required.')
    if input is not None and (not isinstance(input, bytes) or len(input) > 1024 * 1024):
        raise ValueError('Project input must be bounded bytes.')
    job = WindowsJob()
    process = None
    readers = []
    lock = threading.Lock()
    overflow = threading.Event()
    capture_error = threading.Event()
    writer = None
    output, errors, total = [], [], [0]
    reason = None
    deadline = time.monotonic() + timeout
    try:
        # CREATE_NO_WINDOW | CREATE_SUSPENDED. No child code runs before assignment.
        process = subprocess.Popen(command, stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, env=env, cwd=cwd, shell=False, creationflags=0x08000004)
        job.assign_and_resume(process)

        if input is not None:
            def write():
                try:
                    process.stdin.write(input)
                    process.stdin.flush()
                except (BrokenPipeError, OSError):
                    pass
                finally:
                    try:
                        process.stdin.close()
                    except OSError:
                        pass
            # The same finite command deadline also bounds a child that never reads.
            # Job closure closes its entire tree before this owned writer is joined.
            writer = threading.Thread(target=write, daemon=True)
            writer.start()

        def read(stream, target):
            try:
                while block := stream.read(65536):
                    with lock:
                        available = max(0, max_output - total[0])
                        if available:
                            target.append(block[:available])
                        total[0] += len(block)
                        if total[0] > max_output:
                            overflow.set()
            except OSError:
                capture_error.set()
            finally:
                stream.close()

        for stream, target in ((process.stdout, output), (process.stderr, errors)):
            thread = threading.Thread(target=read, args=(stream, target), daemon=True)
            thread.start()
            readers.append(thread)
        while process.poll() is None:
            if job.parent_exited():
                reason = 'parent-exited'
                break
            if overflow.is_set():
                reason = 'output-limit'
                break
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                reason = 'timeout'
                break
            try:
                process.wait(timeout=min(0.05, remaining))
            except subprocess.TimeoutExpired:
                pass
    finally:
        # Also handles descendants holding capture pipes after a normal parent exit.
        job.close()
        if process:
            if process.poll() is None:
                process.kill()  # Our exact still-suspended child if job assignment failed.
            process.wait(timeout=5)
        if writer:
            writer.join(timeout=5)
            if writer.is_alive():
                raise RuntimeError('Project input writer did not close.')
        for thread in readers:
            thread.join(timeout=5)
        if any(thread.is_alive() for thread in readers):
            raise RuntimeError('Project output capture did not close.')
        if capture_error.is_set():
            raise RuntimeError('Project output capture failed.')
        if process:
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream and not stream.closed:
                    stream.close()
    if overflow.is_set():
        reason = 'output-limit'
    return subprocess.CompletedProcess(command, process.returncode, b''.join(output), b''.join(errors)), reason


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeout', type=float, required=True)
    parser.add_argument('--max-output', type=int, default=1024 * 1024, help='Combined stdout/stderr byte limit.')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command or not math.isfinite(args.timeout) or not 0 < args.timeout <= 86400 or not 0 < args.max_output <= 256 * 1024 * 1024:
        parser.error('A command and finite positive resource limits are required.')
    try:
        result, reason = run_command(command, timeout=args.timeout, max_output=args.max_output)
    except (OSError, RuntimeError, ValueError):
        print('Project command could not be started or contained.', file=sys.stderr)
        return 126
    output, errors = result.stdout, result.stderr
    if reason:
        message = 'Project caller exited; its process tree was closed.' if reason == 'parent-exited' else 'Project command exceeded its ' + reason + '.'
        diagnostic = ('\n' + message + '\n').encode()[:args.max_output]
        budget = args.max_output - len(diagnostic)
        output = output[:budget]
        errors = errors[:max(0, budget - len(output))] + diagnostic
    try:
        sys.stdout.buffer.write(output)
        sys.stdout.buffer.flush()
        sys.stderr.buffer.write(errors)
        sys.stderr.buffer.flush()
    except OSError:
        return 127 if reason == 'parent-exited' else 126
    return 124 if reason == 'timeout' else 125 if reason == 'output-limit' else 127 if reason == 'parent-exited' else result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
