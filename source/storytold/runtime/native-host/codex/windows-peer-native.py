"""Native loopback peer authentication using Windows kernel APIs, never a bearer registration route."""
import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import socket
import threading


class PeerError(RuntimeError):
    pass


class FILETIME(ctypes.Structure):
    _fields_ = [('low', wintypes.DWORD), ('high', wintypes.DWORD)]


class TOKEN_USER(ctypes.Structure):
    _fields_ = [('sid', ctypes.c_void_p), ('attributes', wintypes.DWORD)]


class TCP_ROW(ctypes.Structure):
    _fields_ = [(name, wintypes.DWORD) for name in ('state', 'local_address', 'local_port', 'remote_address', 'remote_port', 'pid')]


class WindowsPeers:
    def __init__(self, process_helper=None, executable=None):
        if os.name != 'nt':
            raise PeerError('Windows native peer authentication is unavailable')
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.security = ctypes.WinDLL('advapi32', use_last_error=True)
        self.network = ctypes.WinDLL('iphlpapi', use_last_error=True)
        self.kernel.GetCurrentProcess.argtypes = []
        self.kernel.GetCurrentProcess.restype = wintypes.HANDLE
        self.kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        self.kernel.OpenProcess.restype = wintypes.HANDLE
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.kernel.CloseHandle.restype = wintypes.BOOL
        self.kernel.GetProcessTimes.argtypes = [wintypes.HANDLE, *([ctypes.POINTER(FILETIME)] * 4)]
        self.kernel.GetProcessTimes.restype = wintypes.BOOL
        self.kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        self.kernel.GetExitCodeProcess.restype = wintypes.BOOL
        self.kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
        self.kernel.QueryFullProcessImageNameW.restype = wintypes.BOOL
        self.kernel.LocalFree.argtypes = [ctypes.c_void_p]
        self.kernel.LocalFree.restype = ctypes.c_void_p
        self.security.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
        self.security.OpenProcessToken.restype = wintypes.BOOL
        self.security.GetTokenInformation.argtypes = [wintypes.HANDLE, ctypes.c_uint, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
        self.security.GetTokenInformation.restype = wintypes.BOOL
        self.security.ConvertSidToStringSidW.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.LPWSTR)]
        self.security.ConvertSidToStringSidW.restype = wintypes.BOOL
        self.network.GetExtendedTcpTable.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), wintypes.BOOL, wintypes.ULONG, ctypes.c_uint, wintypes.ULONG]
        self.network.GetExtendedTcpTable.restype = wintypes.DWORD
        self.executable = self._path(executable or Path(os.environ['SYSTEMROOT']) / 'System32/OpenSSH/ssh.exe')
        self.owner_sid = self._sid(self.kernel.GetCurrentProcess())
        self.registered = {}
        self.pending = {}
        self.lock = threading.Lock()
        self.generation = 0

    @staticmethod
    def _path(value):
        return os.path.normcase(str(Path(value).resolve(strict=True)))

    def _sid(self, process):
        token = wintypes.HANDLE()
        if not self.security.OpenProcessToken(process, 0x0008, ctypes.byref(token)):
            raise PeerError('The native transport peer was not verified')
        try:
            size = wintypes.DWORD()
            self.security.GetTokenInformation(token, 1, None, 0, ctypes.byref(size))
            if not 1 <= size.value <= 65536:
                raise PeerError('The native transport peer was not verified')
            buffer = ctypes.create_string_buffer(size.value)
            if not self.security.GetTokenInformation(token, 1, buffer, len(buffer), ctypes.byref(size)):
                raise PeerError('The native transport peer was not verified')
            user = ctypes.cast(buffer, ctypes.POINTER(TOKEN_USER)).contents
            text = wintypes.LPWSTR()
            if not self.security.ConvertSidToStringSidW(user.sid, ctypes.byref(text)):
                raise PeerError('The native transport peer was not verified')
            try:
                return ctypes.wstring_at(text)
            finally:
                self.kernel.LocalFree(ctypes.cast(text, ctypes.c_void_p))
        finally:
            self.kernel.CloseHandle(token)

    def _query(self, pid):
        """Read a process through one handle, binding creation time, image and token owner to that process."""
        process = self.kernel.OpenProcess(0x1000, False, pid)
        if not process:
            raise PeerError('The native transport peer was not verified')
        try:
            created, exited, kernel, user = FILETIME(), FILETIME(), FILETIME(), FILETIME()
            if not self.kernel.GetProcessTimes(process, ctypes.byref(created), ctypes.byref(exited), ctypes.byref(kernel), ctypes.byref(user)):
                raise ValueError()
            size = wintypes.DWORD(32768)
            name = ctypes.create_unicode_buffer(size.value)
            if not self.kernel.QueryFullProcessImageNameW(process, 0, name, ctypes.byref(size)):
                raise ValueError()
            image, sid = self._path(name.value), self._sid(process)
            code = wintypes.DWORD()
            if image != self.executable or sid != self.owner_sid or not self.kernel.GetExitCodeProcess(process, ctypes.byref(code)) or code.value != 259:
                raise ValueError()
            return {'pid': pid, 'created': (created.high << 32) | created.low, 'executable': image, 'sid': sid}
        except Exception:
            raise PeerError('The native transport peer was not verified') from None
        finally:
            self.kernel.CloseHandle(process)

    def _connection_pid(self, client_port, server_port):
        size = wintypes.DWORD()
        loopback = int.from_bytes(socket.inet_aton('127.0.0.1'), 'little')
        for _ in range(5):
            if size.value > 16 * 1024 * 1024:
                raise PeerError('The native transport peer was not verified')
            buffer = ctypes.create_string_buffer(size.value) if size.value else None
            # AF_INET=2; TCP_TABLE_OWNER_PID_ALL=5. Filter the CLIENT direction only.
            status = self.network.GetExtendedTcpTable(buffer, ctypes.byref(size), False, 2, 5, 0)
            if status == 122:
                continue
            if status != 0 or buffer is None or size.value < 4:
                raise PeerError('The native transport peer was not verified')
            count = wintypes.DWORD.from_buffer(buffer).value
            if count > (size.value - 4) // ctypes.sizeof(TCP_ROW):
                raise PeerError('The native transport peer was not verified')
            matches = []
            for index in range(count):
                row = TCP_ROW.from_buffer(buffer, 4 + index * ctypes.sizeof(TCP_ROW))
                if (row.state == 5 and row.local_address == loopback and row.remote_address == loopback
                        and socket.ntohs(row.local_port & 65535) == client_port
                        and socket.ntohs(row.remote_port & 65535) == server_port):
                    matches.append(int(row.pid))
            if len(matches) != 1:
                raise PeerError('The native transport peer was not verified')
            return matches[0]
        raise PeerError('The native transport peer was not verified')

    def register(self, product, pid):
        # The parent's private process-control channel calls this; there is no HTTP registration.
        if not isinstance(product, str) or product not in {'access', 'slipcurve'} or type(pid) is not int or not 1 <= pid <= 0xffffffff:
            raise PeerError('Invalid native transport registration')
        with self.lock:
            if any(item['pid'] == pid for registry in (self.registered, self.pending) for other, item in registry.items() if other != product):
                raise PeerError('Products require separate native transport processes')
            self.generation += 1
            intent = {'pid': pid, 'generation': self.generation}
            self.pending[product] = intent
            self.registered.pop(product, None)
        try:
            identity = self._query(pid)
            with self.lock:
                if self.pending.get(product) != intent:
                    raise PeerError('The native transport registration was withdrawn')
                self.pending.pop(product)
                self.registered[product] = {**identity, 'generation': intent['generation']}
        except Exception:
            with self.lock:
                if self.pending.get(product) == intent:
                    self.pending.pop(product, None)
            raise PeerError('The native transport registration was not verified') from None

    def unregister(self, product, pid):
        if not isinstance(product, str) or product not in {'access', 'slipcurve'} or type(pid) is not int:
            return
        with self.lock:
            if self.registered.get(product, {}).get('pid') == pid:
                self.registered.pop(product, None)
            if self.pending.get(product, {}).get('pid') == pid:
                self.pending.pop(product, None)

    def accepts(self, product, client_port, server_port):
        if not isinstance(product, str) or product not in {'access', 'slipcurve'} or any(type(value) is not int or not 1 <= value <= 65535 for value in (client_port, server_port)) or client_port == server_port:
            return False
        with self.lock:
            expected = self.registered.get(product, {}).copy()
        if not expected:
            return False
        try:
            if self._connection_pid(client_port, server_port) != expected['pid']:
                return False
            observed = self._query(expected['pid'])
            if self._connection_pid(client_port, server_port) != expected['pid']:
                return False
            with self.lock:
                return (observed == {key: value for key, value in expected.items() if key != 'generation'}
                        and self.registered.get(product) == expected)
        except Exception:
            return False
