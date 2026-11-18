"""Private native access-lease transport; credentials remain memory-only.

This component is not installed. Its caller owns the registered SSH processes,
the managed AuthManager, and a bounded verifier of the current Linux native
operator session. The HTTP surface cannot register or change those identities.
"""
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import math
import queue
import re
import select
import socket
import threading
import time


PRODUCTS=frozenset({'access','slipcurve'})
PIN=re.compile(r'[a-f0-9]{64}\Z')
NONCE=re.compile(r'[A-Za-z0-9_-]{43}\Z')
ACCESS=re.compile(r'[A-Za-z0-9_.-]{32,32768}\Z')
ERROR=b'{"error":"Native provider authorization unavailable"}'


class Refused(RuntimeError):
    pass


class DeadlineReader(io.RawIOBase):
    """Every raw read shares one deadline, including request line and headers."""
    def __init__(self,raw,connection,deadline,stopping):
        super().__init__()
        self.raw=raw
        self.connection=connection
        self.deadline=deadline
        self.stopping=stopping

    def readable(self):
        return True

    def readinto(self,buffer):
        remaining=self.deadline-time.monotonic()
        if self.stopping.is_set() or remaining<=0:
            raise TimeoutError('Native request deadline exceeded')
        self.connection.settimeout(min(1,remaining))
        return self.raw.readinto(buffer)

    def close(self):
        try:
            self.raw.close()
        finally:
            super().close()


def _object(pairs):
    value={}
    for key,item in pairs:
        if key in value:
            raise Refused()
        value[key]=item
    return value


def _account(value):
    return isinstance(value,str) and 1<=len(value)<=256 and all(32<ord(c)<127 for c in value)


class LeaseBroker(ThreadingHTTPServer):
    """Loopback-only server with injected native boundaries, no HTTP enrollment.

    ``verify_session(product, session_sha256, deadline, cancelled)`` must inspect
    the current bound operator session and return exactly True. It receives a
    monotonic deadline and an Event, so an SSH implementation can stop its owned
    subprocess. ``auth.credential(pin, previous, deadline=..., cancelled_event=...)``
    is the deadline-aware AuthManager API. At most one call runs at a time; late
    results are discarded, never sent. An official refresh already running in the
    Windows AuthManager may finish in its own managed store after cancellation.
    """
    daemon_threads=True
    allow_reuse_address=False

    def __init__(self,peers,auth,account_pins,verify_session,*,budget_seconds=6,port=0):
        if set(account_pins)!=PRODUCTS or any(not isinstance(v,str) or not PIN.fullmatch(v) for v in account_pins.values()):
            raise ValueError('Both native provider account pins are required')
        if not callable(verify_session) or not math.isfinite(budget_seconds) or not .05<=budget_seconds<=6:
            raise ValueError('A bounded native-session verifier is required')
        self.peers=peers
        self.auth=auth
        self.account_pins=dict(account_pins)
        self.verify_session=verify_session
        self.budget_seconds=budget_seconds
        self._requests=threading.BoundedSemaphore(8)
        self._authorization=threading.BoundedSemaphore(1)
        self._nonce_lock=threading.Lock()
        self._nonces={}
        self._connection_lock=threading.Lock()
        self._connection_deadlines={}
        self._stopping=threading.Event()
        super().__init__(('127.0.0.1',port),LeaseHandler)

    def get_request(self):
        connection,address=super().get_request()
        connection.settimeout(1)
        if address[0]!='127.0.0.1':
            connection.close()
            raise OSError('Native loopback peer unavailable')
        return connection,address

    def process_request(self,request,client_address):
        deadline=time.monotonic()+self.budget_seconds
        if self._stopping.is_set() or not self._requests.acquire(blocking=False):
            self.shutdown_request(request)
            return
        with self._connection_lock:
            self._connection_deadlines[id(request)]=deadline
        try:
            super().process_request(request,client_address)
        except BaseException:
            with self._connection_lock:
                self._connection_deadlines.pop(id(request),None)
            self._requests.release()
            raise

    def process_request_thread(self,request,client_address):
        try:
            super().process_request_thread(request,client_address)
        finally:
            with self._connection_lock:
                self._connection_deadlines.pop(id(request),None)
            self._requests.release()

    def handle_error(self,*unused):
        # BaseHTTPServer's traceback can contain a request or native diagnostic.
        pass

    def server_close(self):
        self._stopping.set()
        super().server_close()

    def control(self,message):
        """Only the parent private process pipe may call this method."""
        if not isinstance(message,dict) or set(message)!={'action','product','pid'} or message['product'] not in PRODUCTS or type(message['pid'])is not int or message['pid']<1:
            raise Refused()
        if message['action']=='register':
            self.peers.register(message['product'],message['pid'])
        elif message['action']=='unregister':
            self.peers.unregister(message['product'],message['pid'])
        else:
            raise Refused()

    def serve_control(self,reader,writer):
        """Read fixed commands from the parent's private binary pipe until EOF."""
        try:
            while not self._stopping.is_set():
                line=reader.readline(4097)
                if not line:
                    return
                if len(line)>4096 or not line.endswith(b'\n'):
                    return
                try:
                    self.control(json.loads(line.decode('utf-8'),object_pairs_hook=_object))
                    result=b'{"ok":true}\n'
                except Exception:
                    result=b'{"ok":false}\n'
                writer.write(result)
                writer.flush()
        finally:
            self._stopping.set()
            self.shutdown()
            self.server_close()

    def claim(self,nonce,expires):
        with self._nonce_lock:
            now=time.time()*1000
            self._nonces={key:end for key,end in self._nonces.items() if end>now}
            if nonce in self._nonces or len(self._nonces)>=2048:
                raise Refused()
            self._nonces[nonce]=expires


class LeaseHandler(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    server_version='NativeProvider'
    sys_version=''
    rbufsize=0

    def setup(self):
        # Admission starts the clock before this handler thread or any HTTP
        # parser runs. A drip of header bytes cannot renew its socket timeout.
        with self.server._connection_lock:
            self.deadline=self.server._connection_deadlines[id(self.request)]
        super().setup()
        self.rfile=DeadlineReader(self.rfile,self.connection,self.deadline,self.server._stopping)

    def log_message(self,*unused):
        pass

    def log_error(self,*unused):
        pass

    def _reply(self,status,body=ERROR,*,deadline=None):
        self.close_connection=True
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Pragma','no-cache')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Connection','close')
        self.end_headers()
        if deadline is None:
            self.wfile.write(body)
            self.wfile.flush()
        else:
            # An unresponsive or disconnected peer cannot keep a credential
            # write alive beyond the request's monotonic authorization budget.
            previous=self.connection.gettimeout()
            self.connection.setblocking(False)
            try:
                remaining=memoryview(body)
                while remaining:
                    if not self._alive(deadline):
                        raise Refused()
                    _,writable,_=select.select([],[self.connection],[],min(.01,max(0,deadline-time.monotonic())))
                    if writable and self._alive(deadline):
                        try:
                            sent=self.connection.send(remaining)
                        except BlockingIOError:
                            continue
                        if sent<=0:
                            raise Refused()
                        remaining=remaining[sent:]
            finally:
                self.connection.settimeout(previous)

    def send_error(self,code,message=None,explain=None):
        self._reply(400)

    def handle_expect_100(self):
        self._reply(403)
        return False

    def do_GET(self):
        self._reply(405)

    do_HEAD=do_GET
    do_PUT=do_GET
    do_DELETE=do_GET
    do_OPTIONS=do_GET
    do_PATCH=do_GET

    def _alive(self,deadline):
        if self.server._stopping.is_set() or time.monotonic()>=deadline:
            return False
        try:
            readable,_,_=select.select([self.connection],[],[],0)
            # There is no pipelining: any bytes after the one body, or EOF, close
            # this single-use credential connection before a lease can be sent.
            return not readable
        except (OSError,ValueError):
            return False

    def _peer(self,product):
        return self.server.peers.accepts(product,self.client_address[1],self.server.server_port) is True

    def _parse(self,deadline):
        product=self.path.removeprefix('/v1/lease/')
        if self.path!='/v1/lease/'+product or product not in PRODUCTS:
            raise Refused()
        expected=f'127.0.0.1:{self.server.server_port}'
        for name in ['Host','Content-Length','Content-Type']:
            if len(self.headers.get_all(name,[]))!=1:
                raise Refused()
        if self.headers['Host']!=expected or self.headers['Content-Type']!='application/json' or any(self.headers.get_all(name) for name in ['Origin','Transfer-Encoding','Expect','Authorization','Cookie']):
            raise Refused()
        length=self.headers['Content-Length']
        if not re.fullmatch(r'[1-9][0-9]{0,3}',length) or int(length)>4096:
            raise Refused()
        # SocketIO.read may return a short fragment without EOF. Bound the whole
        # body by its finite length and the original request deadline, while
        # preserving the one-second inactivity timeout on each socket read.
        raw=bytearray()
        while len(raw)<int(length):
            remaining=deadline-time.monotonic()
            if remaining<=0:
                raise Refused()
            self.connection.settimeout(min(1,remaining))
            part=self.rfile.read(int(length)-len(raw))
            if not part:
                raise Refused()
            raw.extend(part)
        value=json.loads(raw.decode('utf-8'),object_pairs_hook=_object)
        required={'product','requestId','expiresAt','sessionSha256'}
        if not isinstance(value,dict) or not required.issubset(value) or not set(value).issubset(required|{'previousChatgptAccountId'}):
            raise Refused()
        now=time.time()*1000
        if value['product']!=product or not isinstance(value['requestId'],str) or not NONCE.fullmatch(value['requestId']) or not isinstance(value['sessionSha256'],str) or not PIN.fullmatch(value['sessionSha256']):
            raise Refused()
        if type(value['expiresAt'])is not int or not now<value['expiresAt']<=now+15000:
            raise Refused()
        if 'previousChatgptAccountId'in value and not _account(value['previousChatgptAccountId']):
            raise Refused()
        return product,value

    def _lease(self,product,request,deadline,cancelled):
        previous=request.get('previousChatgptAccountId')
        lease=self.server.auth.credential(self.server.account_pins[product],previous,deadline=deadline,cancelled_event=cancelled)
        required={'accessToken','chatgptAccountId','expiresAt'}
        if not isinstance(lease,dict) or not required.issubset(lease) or not set(lease).issubset(required|{'chatgptPlanType'}):
            raise Refused()
        if not isinstance(lease['accessToken'],str) or not ACCESS.fullmatch(lease['accessToken']) or not _account(lease['chatgptAccountId']):
            raise Refused()
        if sha256(lease['chatgptAccountId'].encode()).hexdigest()!=self.server.account_pins[product] or previous is not None and previous!=lease['chatgptAccountId']:
            raise Refused()
        if type(lease['expiresAt'])is not int or lease['expiresAt']<=time.time()*1000+30000:
            raise Refused()
        if 'chatgptPlanType'in lease and (not isinstance(lease['chatgptPlanType'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',lease['chatgptPlanType'])):
            raise Refused()
        return {key:lease[key] for key in lease}

    def do_POST(self):
        deadline=self.deadline
        cancelled=threading.Event()
        operation=None
        try:
            product,request=self._parse(deadline)
            deadline=min(deadline,time.monotonic()+(request['expiresAt']-time.time()*1000)/1000)
            if not self._alive(deadline) or not self._peer(product):
                raise Refused()
            self.server.claim(request['requestId'],request['expiresAt'])
            if not self.server._authorization.acquire(blocking=False):
                self._reply(503)
                return
            operation=queue.Queue(maxsize=1)
            def authorize():
                lease=None
                try:
                    if cancelled.is_set() or self.server.verify_session(product,request['sessionSha256'],deadline,cancelled) is not True:
                        raise Refused()
                    lease=self._lease(product,request,deadline,cancelled)
                    if cancelled.is_set() or time.monotonic()>=deadline or self.server.verify_session(product,request['sessionSha256'],deadline,cancelled) is not True:
                        raise Refused()
                    if cancelled.is_set() or time.monotonic()>=deadline:
                        raise Refused()
                    operation.put_nowait(lease)
                    lease=None
                except BaseException:
                    if not cancelled.is_set():
                        operation.put_nowait(False)
                finally:
                    if lease:
                        lease.clear()
                    self.server._authorization.release()
            threading.Thread(target=authorize,daemon=True).start()
            while self._alive(deadline):
                try:
                    value=operation.get(timeout=min(.02,max(.001,deadline-time.monotonic())))
                except queue.Empty:
                    continue
                if not value or not self._alive(deadline) or not self._peer(product) or not self._alive(deadline):
                    if isinstance(value,dict):
                        value.clear()
                    raise Refused()
                try:
                    payload=json.dumps(value,separators=(',',':')).encode()
                    if not self._alive(deadline):
                        raise Refused()
                    self._reply(200,payload,deadline=deadline)
                finally:
                    value.clear()
                return
            raise Refused()
        except (Refused,ValueError,UnicodeError,OSError,OverflowError):
            if not self.server._stopping.is_set() and time.monotonic()<deadline:
                try:
                    self._reply(403)
                except OSError:
                    pass
        finally:
            cancelled.set()
            self.close_connection=True
            if operation is not None:
                try:
                    leftover=operation.get_nowait()
                    if isinstance(leftover,dict):
                        leftover.clear()
                except queue.Empty:
                    pass
