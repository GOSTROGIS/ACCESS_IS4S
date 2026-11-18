"""Bound compiler/gate process trees to the lifetime of their build supervisor.

Windows uses the documented creation-time JOB_LIST attribute, with no breakaway flags and
KILL_ON_JOB_CLOSE. A compiler cannot spawn before job assignment, and killing the supervisor
also closes the last job handle. HANDLE_LIST exposes only its NUL input and private log.
https://learn.microsoft.com/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute
https://learn.microsoft.com/windows/win32/procthread/job-objects
"""

import os
from pathlib import Path
import signal
import subprocess


def run_process(command, cwd, env, log, timeout=21600):
    command = list(map(str, command))
    if os.name != 'nt':
        # Production recipe support is explicitly Windows-only. Keep local fixture processes
        # scoped on POSIX too; native Linux recipes need their own qualified containment gate.
        with Path(log).open('wb') as output:
            child = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                     stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                return child.wait(timeout=timeout)
            finally:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()
    return _windows(command, cwd, env, log, timeout)


def _windows(command, cwd, env, log, timeout):
    import ctypes as c
    from ctypes import wintypes as w
    import msvcrt

    class Basic(c.Structure):
        _fields_ = [('process_time', c.c_int64), ('job_time', c.c_int64), ('flags', w.DWORD),
                    ('minimum', c.c_size_t), ('maximum', c.c_size_t), ('active', w.DWORD),
                    ('affinity', c.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]

    class Io(c.Structure):
        _fields_ = [(name, c.c_uint64) for name in ['read_ops', 'write_ops', 'other_ops', 'read_bytes', 'write_bytes', 'other_bytes']]

    class Extended(c.Structure):
        _fields_ = [('basic', Basic), ('io', Io), ('process_memory', c.c_size_t), ('job_memory', c.c_size_t),
                    ('peak_process', c.c_size_t), ('peak_job', c.c_size_t)]

    class Startup(c.Structure):
        _fields_ = [('cb', w.DWORD), ('reserved', w.LPWSTR), ('desktop', w.LPWSTR), ('title', w.LPWSTR),
                    ('x', w.DWORD), ('y', w.DWORD), ('width', w.DWORD), ('height', w.DWORD),
                    ('columns', w.DWORD), ('rows', w.DWORD), ('fill', w.DWORD), ('flags', w.DWORD),
                    ('show', w.WORD), ('reserved_size', w.WORD), ('reserved_data', c.c_void_p),
                    ('stdin', w.HANDLE), ('stdout', w.HANDLE), ('stderr', w.HANDLE)]

    class StartupEx(c.Structure):
        _fields_ = [('startup', Startup), ('attributes', c.c_void_p)]

    class Process(c.Structure):
        _fields_ = [('process', w.HANDLE), ('thread', w.HANDLE), ('pid', w.DWORD), ('tid', w.DWORD)]

    kernel = c.WinDLL('kernel32', use_last_error=True)
    signatures = {
        'CreateJobObjectW': ([c.c_void_p, w.LPCWSTR], w.HANDLE),
        'SetInformationJobObject': ([w.HANDLE, c.c_int, c.c_void_p, w.DWORD], w.BOOL),
        'InitializeProcThreadAttributeList': ([c.c_void_p, w.DWORD, w.DWORD, c.POINTER(c.c_size_t)], w.BOOL),
        'UpdateProcThreadAttribute': ([c.c_void_p, w.DWORD, c.c_size_t, c.c_void_p, c.c_size_t, c.c_void_p, c.c_void_p], w.BOOL),
        'DeleteProcThreadAttributeList': ([c.c_void_p], None),
        'CreateProcessW': ([w.LPCWSTR, w.LPWSTR, c.c_void_p, c.c_void_p, w.BOOL, w.DWORD,
                            c.c_void_p, w.LPCWSTR, c.c_void_p, c.POINTER(Process)], w.BOOL),
        'WaitForSingleObject': ([w.HANDLE, w.DWORD], w.DWORD),
        'GetExitCodeProcess': ([w.HANDLE, c.POINTER(w.DWORD)], w.BOOL),
        'CloseHandle': ([w.HANDLE], w.BOOL),
    }
    for name, (arguments, result) in signatures.items():
        getattr(kernel, name).argtypes = arguments
        getattr(kernel, name).restype = result

    def check(ok):
        if not ok:
            raise c.WinError(c.get_last_error())

    if not 0 < timeout <= 21600:
        raise ValueError('Build step timeout must be between zero and six hours')
    if not Path(command[0]).is_absolute():
        raise ValueError('A contained build step requires an explicit executable path')
    if any('\0' in key + value or '=' in key for key, value in env.items()):
        raise ValueError('Invalid child environment block')
    if len({key.casefold() for key in env}) != len(env):
        raise ValueError('Ambiguous Windows environment block')
    job = kernel.CreateJobObjectW(None, None)
    check(job)
    attributes = None
    process = Process()
    attribute_initialized = False
    try:
        limits = Extended()
        limits.basic.flags = 0x00002000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway.
        check(kernel.SetInformationJobObject(job, 9, c.byref(limits), c.sizeof(limits)))
        size = c.c_size_t()
        kernel.InitializeProcThreadAttributeList(None, 2, 0, c.byref(size))
        attributes = c.create_string_buffer(size.value)
        check(kernel.InitializeProcThreadAttributeList(attributes, 2, 0, c.byref(size)))
        attribute_initialized = True
        jobs = (w.HANDLE * 1)(job)
        check(kernel.UpdateProcThreadAttribute(attributes, 0, 0x0002000D, jobs, c.sizeof(jobs), None, None))
        with Path(log).open('wb') as output, open(os.devnull, 'rb') as null:
            handles = [msvcrt.get_osfhandle(null.fileno()), msvcrt.get_osfhandle(output.fileno())]
            prior = [os.get_handle_inheritable(handle) for handle in handles]
            try:
                for handle in handles:
                    os.set_handle_inheritable(handle, True)
                inherit = (w.HANDLE * len(handles))(*handles)
                check(kernel.UpdateProcThreadAttribute(attributes, 0, 0x00020002, inherit, c.sizeof(inherit), None, None))
                startup = StartupEx()
                startup.startup.cb = c.sizeof(startup)
                startup.startup.flags = 0x00000100  # STARTF_USESTDHANDLES.
                startup.startup.stdin, startup.startup.stdout, startup.startup.stderr = handles[0], handles[1], handles[1]
                startup.attributes = c.cast(attributes, c.c_void_p)
                block = c.create_unicode_buffer('\0'.join(key + '=' + value for key, value in sorted(env.items(), key=lambda item: item[0].casefold())) + '\0\0')
                text = c.create_unicode_buffer(subprocess.list2cmdline(command))
                flags = 0x08000000 | 0x00000400 | 0x00080000  # NO_WINDOW | UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT.
                check(kernel.CreateProcessW(command[0], text, None, None, True, flags, block,
                                            str(Path(cwd).absolute()), c.byref(startup), c.byref(process)))
            finally:
                for handle, original in zip(handles, prior):
                    os.set_handle_inheritable(handle, original)
            kernel.CloseHandle(process.thread)
            process.thread = None
            result = kernel.WaitForSingleObject(process.process, int(timeout * 1000))
            if result == 0x00000102:
                raise subprocess.TimeoutExpired(command, timeout)
            check(result == 0)
            code = w.DWORD()
            check(kernel.GetExitCodeProcess(process.process, c.byref(code)))
            return code.value
    finally:
        # Creation-time job assignment also covers immediate grandchildren. The job handle
        # is never inherited; supervisor death or any exception kills only this owned tree.
        kernel.CloseHandle(job)
        if process.process:
            kernel.WaitForSingleObject(process.process, 10000)
            kernel.CloseHandle(process.process)
        if process.thread:
            kernel.CloseHandle(process.thread)
        if attributes is not None and attribute_initialized:
            kernel.DeleteProcThreadAttributeList(attributes)
