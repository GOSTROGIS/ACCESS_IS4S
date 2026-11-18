"""In-memory access leases from the genuine Windows Codex managed AuthManager.

Draft native transport component. It never starts login/logout or a model turn.
"""
import base64
from contextlib import contextmanager
from hashlib import sha256
import importlib.util
import json
import math
import os
from pathlib import Path
import queue
import re
import subprocess
import threading
import time


class ManagedAuthError(RuntimeError):
    pass


class ManagedAuthManager:
    def __init__(self, executable, executable_sha256, process_helper):
        executable=Path(executable)
        if os.name!='nt' or not executable.is_absolute() or executable.is_symlink() or not executable.is_file():
            raise ManagedAuthError('The approved Windows provider is unavailable')
        with executable.open('rb') as stream:
            if __import__('hashlib').file_digest(stream,'sha256').hexdigest()!=executable_sha256:
                raise ManagedAuthError('The approved Windows provider changed')
        spec=importlib.util.spec_from_file_location('codex_owned_process',process_helper)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.job=module.WindowsJob()
        self.process=None
        self.readers=[]
        self.replies=queue.Queue(maxsize=128)
        self.overflow=threading.Event()
        self.lock=threading.Lock()
        self.counter=0
        self.closed=False
        self.captured=0
        self.capture_lock=threading.Lock()
        allowed={'PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','CODEX_HOME'}
        # Preserve the user's existing managed profile reference; never create or substitute an auth home.
        environment={key:value for key,value in os.environ.items() if key.upper() in allowed}
        try:
            self.process=subprocess.Popen([str(executable),'app-server','--stdio'],stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=environment,creationflags=0x08000004)
            self.job.assign_and_resume(self.process)
            self.readers=[threading.Thread(target=self._read,args=(self.process.stdout,True),daemon=True),
                          threading.Thread(target=self._read,args=(self.process.stderr,False),daemon=True)]
            for reader in self.readers:
                reader.start()
            self._request('initialize',{'clientInfo':{'name':'autocraft_native_provider','title':None,'version':'0.1.0'},
                                       'capabilities':{'experimentalApi':True}})
            self._send({'method':'initialized','params':{}})
        except Exception:
            self.close()
            raise ManagedAuthError('The managed Windows provider could not start') from None

    def _read(self, stream, protocol):
        try:
            while not self.closed:
                line=stream.readline(1024*1024+1)
                if not line:
                    return
                with self.capture_lock:
                    self.captured+=len(line)
                    if len(line)>1024*1024 or self.captured>4*1024*1024:
                        self.overflow.set()
                        return
                if protocol:
                    try:
                        self.replies.put_nowait(json.loads(line))
                    except (ValueError,UnicodeError,queue.Full):
                        self.overflow.set()
                        return
        finally:
            stream.close()

    def _send(self,value):
        if self.closed or self.overflow.is_set() or not self.process or self.process.poll() is not None:
            raise ManagedAuthError('The managed provider is unavailable')
        try:
            self.process.stdin.write((json.dumps(value)+'\n').encode())
            self.process.stdin.flush()
        except (BrokenPipeError,OSError):
            raise ManagedAuthError('The managed provider transport closed') from None

    @staticmethod
    def _check_budget(deadline,cancelled_event=None):
        if time.monotonic()>=deadline or cancelled_event is not None and cancelled_event.is_set():
            raise ManagedAuthError('The managed provider authentication timed out')

    @contextmanager
    def _guard(self,deadline=None,cancelled_event=None):
        if deadline is None:
            deadline=time.monotonic()+40
        if type(deadline) not in (int,float) or not math.isfinite(deadline):
            raise ManagedAuthError('A finite managed authentication deadline is required')
        deadline=min(deadline,time.monotonic()+40)
        while True:
            self._check_budget(deadline,cancelled_event)
            if self.lock.acquire(timeout=min(.1,max(.001,deadline-time.monotonic()))):
                break
        try:
            self._check_budget(deadline,cancelled_event)
            yield deadline
        finally:
            self.lock.release()

    def _request(self,method,params,*,deadline=None,cancelled_event=None):
        deadline=min(deadline,time.monotonic()+40) if deadline is not None else time.monotonic()+40
        self._check_budget(deadline,cancelled_event)
        self.counter+=1
        number=self.counter
        self._send({'id':number,'method':method,'params':params})
        while time.monotonic()<deadline:
            self._check_budget(deadline,cancelled_event)
            if self.closed or self.overflow.is_set() or self.process.poll() is not None:
                raise ManagedAuthError('The managed provider transport closed')
            try:
                value=self.replies.get(timeout=min(.1,max(.01,deadline-time.monotonic())))
            except queue.Empty:
                continue
            if value.get('id')==number and ('result'in value or 'error'in value):
                self._check_budget(deadline,cancelled_event)
                if 'error'in value:
                    raise ManagedAuthError('The managed provider refused authentication')
                return value['result']
            if 'id'in value and 'method'in value:
                self._send({'id':value['id'],'error':{'code':-32601,'message':'Only managed credential inspection is supported'}})
        raise ManagedAuthError('The managed provider authentication timed out')

    @staticmethod
    def _lease(status,allow_expired=False):
        token=status.get('authToken')
        if status.get('authMethod')!='chatgpt' or not isinstance(token,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{32,32768}',token):
            raise ManagedAuthError('Sign in to the approved Windows provider')
        try:
            part=token.split('.')[1]
            claims=json.loads(base64.urlsafe_b64decode(part+'='*(-len(part)%4)))
            scoped=claims['https://api.openai.com/auth']
            account=scoped['chatgpt_account_id']
            expiry=claims['exp']
            if not isinstance(account,str) or not 1<=len(account)<=256 or type(expiry) not in (int,float) or not math.isfinite(expiry) or not allow_expired and expiry<=time.time():
                raise ValueError()
        except (ValueError,KeyError,IndexError,TypeError):
            raise ManagedAuthError('The managed provider has no valid access lease') from None
        result={'accessToken':token,'chatgptAccountId':account,'expiresAt':int(expiry*1000)}
        plan=scoped.get('chatgpt_plan_type')
        if isinstance(plan,str) and re.fullmatch(r'[A-Za-z0-9_-]{1,64}',plan):
            result['chatgptPlanType']=plan
        return result

    def identity(self):
        """Enrollment metadata only; no credentials or direct account identifier."""
        with self._guard() as deadline:
            lease=self._lease(self._request('getAuthStatus',{'includeToken':True,'refreshToken':False},deadline=deadline),allow_expired=True)
            return {'authMethod':'chatgpt','accountSha256':sha256(lease['chatgptAccountId'].encode()).hexdigest(),
                    'expiresAt':lease['expiresAt']}

    def credential(self,expected_account_sha256,previous_account_id=None,*,deadline=None,cancelled_event=None):
        if not re.fullmatch(r'[0-9a-f]{64}',expected_account_sha256 or ''):
            raise ManagedAuthError('The approved native provider account is not pinned')
        with self._guard(deadline,cancelled_event) as deadline:
            lease=self._lease(self._request('getAuthStatus',{'includeToken':True,'refreshToken':False},
                deadline=deadline,cancelled_event=cancelled_event),allow_expired=True)
            actual=sha256(lease['chatgptAccountId'].encode()).hexdigest()
            if actual!=expected_account_sha256 or previous_account_id is not None and previous_account_id!=lease['chatgptAccountId']:
                raise ManagedAuthError('The managed provider account changed')
            if lease['expiresAt']<=time.time()*1000+120000:
                # The official managed AuthManager owns refresh and its existing Windows store.
                self._request('account/read',{'refreshToken':True},deadline=deadline,cancelled_event=cancelled_event)
                lease=self._lease(self._request('getAuthStatus',{'includeToken':True,'refreshToken':False},
                    deadline=deadline,cancelled_event=cancelled_event))
                if sha256(lease['chatgptAccountId'].encode()).hexdigest()!=expected_account_sha256 or lease['expiresAt']<=time.time()*1000+30000:
                    raise ManagedAuthError('The managed provider could not renew its access lease')
            self._check_budget(deadline,cancelled_event)
            return lease

    def close(self):
        if self.closed:
            return
        self.closed=True
        self.job.close()
        if self.process:
            if self.process.poll() is None:
                self.process.kill()
            self.process.wait(timeout=10)
            self.process.stdin.close()
        for reader in self.readers:
            reader.join(timeout=5)

    def __enter__(self):
        return self

    def __exit__(self,*unused):
        self.close()
