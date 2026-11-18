"""Private draft: own the broker and separate authenticated SSH lease transports.

This module performs no work at import. No model is invoked. The explicit
configuration must already contain a protected, independently pinned provider.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import sys
import threading
import time
import uuid

HERE=Path(__file__).resolve().parent
PRODUCTS=('access','slipcurve')
BINARY_SHA='c3dea068c8794f1764051c1fd182ff0524352bbddf2f2638e72386b9b7b74368'
VERSION='0.167.0-alpha.4.1'


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def environment():
    allowed={'PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP',
             'USERPROFILE','LOCALAPPDATA','APPDATA','CODEX_HOME','PROGRAMDATA',
             'PROGRAMFILES','PROGRAMFILES(X86)','USERNAME','USERDOMAIN'}
    return {key:value for key,value in os.environ.items() if key.upper() in allowed}


def quote(value):
    return "'"+str(value).replace("'","'\\''")+"'"


def ssh_arguments(config):
    return [str(Path(os.environ['SYSTEMROOT'])/'System32/OpenSSH/ssh.exe'),'-F','NUL','-T',
            '-p',str(config['port']),'-i',config['key'],'-o','BatchMode=yes',
            '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+config['knownHosts'],
            '-o','ConnectTimeout=5','-o','IdentitiesOnly=yes','-o','IdentityAgent=none',
            '-o','AddKeysToAgent=no']


class OwnedChildren:
    """One parent-bound non-breakaway Windows job owns every newly launched child."""
    def __init__(self,helper):
        self.job=module('native_transport_job',helper).WindowsJob()
        self.children=[]
        self.closed=threading.Event()
        self.guard=threading.RLock()
        # Parent death must close the kernel job even while startup or a control
        # reply is blocked. The held handle binds the real caller, not its PID.
        def watch_parent():
            while not self.closed.wait(.1):
                with self.guard:
                    if not self.closed.is_set() and self.job.parent_exited():
                        self.closed.set()
                        self.job.close()
                        return
        self.watcher=threading.Thread(target=watch_parent,daemon=True)
        self.watcher.start()

    def start(self,args):
        with self.guard:
            if self.closed.is_set() or self.job.parent_exited():
                raise RuntimeError('The native transport caller exited')
            child=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,env=environment(),creationflags=0x08000004)
            self.children.append(child)
            try:
                self.job.assign_and_resume(child)
            except BaseException:
                child.kill()
                child.wait(timeout=5)
                raise
            return child

    def command(self,args,*,input=b'',timeout=10,limit=65536):
        child=self.start(args)
        output=[bytearray(),bytearray()]
        total=[0]
        lock=threading.Lock()
        overflow=threading.Event()
        def drain(stream,index):
            try:
                while part:=stream.read(4096):
                    with lock:
                        total[0]+=len(part)
                        if total[0]>limit:
                            overflow.set()
                        elif not overflow.is_set():
                            output[index].extend(part)
            finally:
                stream.close()
        readers=[threading.Thread(target=drain,args=(stream,index),daemon=True)
                 for index,stream in enumerate((child.stdout,child.stderr))]
        for reader in readers:
            reader.start()
        def write():
            try:
                child.stdin.write(input)
                child.stdin.flush()
            except (OSError,BrokenPipeError):
                pass
            finally:
                try:child.stdin.close()
                except OSError:pass
        writer=threading.Thread(target=write,daemon=True)
        writer.start()
        deadline=time.monotonic()+timeout
        try:
            while child.poll() is None:
                if overflow.is_set() or self.job.parent_exited() or time.monotonic()>=deadline:
                    raise RuntimeError('The bounded native transport operation closed')
                time.sleep(.02)
        finally:
            if child.poll() is None:
                child.kill()
            child.wait(timeout=5)
            for reader in readers:
                reader.join(timeout=5)
            writer.join(timeout=5)
        if overflow.is_set() or any(reader.is_alive() for reader in readers) or writer.is_alive():
            raise RuntimeError('The bounded native transport output closed')
        if child.returncode:
            error=RuntimeError('The authenticated native transport operation failed')
            # These bytes remain private in memory. A qualification harness may
            # retain them in its private workspace, never public errors or logs.
            error.returncode=child.returncode
            error.private_stderr=bytes(output[1])
            raise error
        return bytes(output[0])

    def close(self):
        with self.guard:
            self.closed.set()
            self.job.close()
        self.watcher.join(timeout=2)
        for child in self.children:
            try:
                child.wait(timeout=5)
            finally:
                for stream in (child.stdin,child.stdout,child.stderr):
                    if stream and not stream.closed:
                        stream.close()


class Protocol:
    """Bound the broker's metadata-only stdout and discard private stderr."""
    def __init__(self,child):
        self.child=child
        self.lines=queue.Queue(maxsize=16)
        self.failed=threading.Event()
        self.readers=[]
        self.total=0
        self.lock=threading.Lock()
        for stream,protocol in ((child.stdout,True),(child.stderr,False)):
            reader=threading.Thread(target=self.read,args=(stream,protocol),daemon=True)
            reader.start()
            self.readers.append(reader)

    def read(self,stream,protocol):
        try:
            while line:=stream.readline(65537):
                with self.lock:
                    self.total+=len(line)
                    if self.total>1048576 or len(line)>65536:
                        self.failed.set()
                        return
                if protocol:
                    try:
                        self.lines.put_nowait(json.loads(line))
                    except (ValueError,queue.Full):
                        self.failed.set()
                        return
        except (OSError,ValueError):
            self.failed.set()
        finally:
            stream.close()

    def receive(self,timeout):
        deadline=time.monotonic()+timeout
        while not self.failed.is_set() and self.child.poll() is None and time.monotonic()<deadline:
            try:
                return self.lines.get(timeout=.05)
            except queue.Empty:
                pass
        raise RuntimeError('The native provider control channel closed')

    def control(self,action,product,pid):
        value={'action':action,'product':product,'pid':pid}
        self.child.stdin.write((json.dumps(value)+'\n').encode())
        self.child.stdin.flush()
        if self.receive(5)!={'ok':True}:
            raise RuntimeError('The native SSH peer registration was refused')


REMOTE=r'''
import hashlib,json,os,stat,sys,time
from pathlib import Path
root=Path(sys.argv[1]);generation=sys.argv[2];mode=sys.argv[3]
request=json.load(sys.stdin)
assert root.is_absolute() and len(generation)==32 and all(c in '0123456789abcdef' for c in generation)
def private(path,kind):
 path=Path(path)
 assert path.resolve(strict=True)==path
 for item in (path,*path.parents):
  s=item.lstat()
  assert not stat.S_ISLNK(s.st_mode) and s.st_uid in (0,os.getuid()) and not s.st_mode&0o022
  if item==path:
   assert s.st_uid==os.getuid() and not s.st_mode&0o077
   assert {'dir':stat.S_ISDIR,'file':stat.S_ISREG,'socket':stat.S_ISSOCK}[kind](s.st_mode)
  else: assert stat.S_ISDIR(s.st_mode)
 return path
base=Path(str(root)+'.runtime/providers/native')
parent=private(base.parent,'dir')
if not base.exists():base.mkdir(mode=0o700)
private(base,'dir')
owned=base/generation
if mode=='prepare':
 owned.mkdir(mode=0o700)
 private(owned,'dir')
 print(json.dumps({'ok':True}))
elif mode=='publish':
 private(owned,'dir')
 binary=private(Path(str(root)+'.runtime/providers/codex/0.167.0-alpha.4.1/codex'),'file')
 assert os.access(binary,os.X_OK) and hashlib.file_digest(binary.open('rb'),'sha256').hexdigest()==request['binarySha256']
 # This draft never takes over an existing native provider, including a stale
 # or dangling reference. Recovery requires a separate verified owner action.
 for product in ('access','slipcurve'):
  target=Path(str(root)+'.data')/product/'codex-transport.json'
  assert not os.path.lexists(target)
 manifests={}
 for product in ('access','slipcurve'):
  sock=owned/(product+'.sock')
  for attempt in range(50):
   if sock.exists():break
   time.sleep(.05)
  private(sock,'socket')
  data=private(Path(str(root)+'.data')/product,'dir')
  manifest={'schema':1,'product':product,'socket':str(sock),'brokerPort':request['brokerPort'],
   'accountSha256':request['accountSha256'],'binary':{'path':str(binary),'version':'0.167.0-alpha.4.1','sha256':request['binarySha256']}}
  assert len(str(sock))<=100
  target=data/'codex-transport.json'
  temporary=data/('.codex-transport-'+generation+'.next')
  fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'w') as stream:
   json.dump(manifest,stream);stream.write('\n');stream.flush();os.fsync(stream.fileno())
  # Atomic no-replace publication also closes the preflight/creation race.
  os.link(temporary,target)
  temporary.unlink()
  manifests[product]=str(target)
 print(json.dumps({'ok':True,'manifests':manifests}))
elif mode=='cleanup':
 private(owned,'dir')
 for product in ('access','slipcurve'):
  data=private(Path(str(root)+'.data')/product,'dir')
  target=data/'codex-transport.json';sock=owned/(product+'.sock')
  if target.exists():
   private(target,'file')
   value=json.loads(target.read_text())
   if value.get('socket')==str(sock):target.unlink()
  if sock.exists():private(sock,'socket').unlink()
 owned.rmdir()
 print(json.dumps({'ok':True}))
else:raise ValueError('Unknown private transport action')
'''


class NativeProvider:
    def __init__(self,applications,configuration):
        broker=module('native_transport_broker',HERE/'windows-provider-broker.py')
        self.apps,self.config,self.process=broker.load_configuration(applications,configuration)
        self.configuration=Path(configuration)
        self.children=OwnedChildren(self.apps/'tools/runtime-update/local-intranet/project-command.py')
        self.generation=uuid.uuid4().hex
        self.tunnels={}
        self.broker=None
        self.protocol=None
        self.prepared=False
        self.manifests={}

    def remote(self,action,payload):
        config=self.config
        command='python3 -c '+quote(REMOTE)+' '+quote(config['root'])+' '+quote(self.generation)+' '+quote(action)
        raw=self.children.command([*ssh_arguments(config),config['user']+'@127.0.0.1',command],
            input=json.dumps(payload).encode(),timeout=20)
        value=json.loads(raw)
        if not isinstance(value,dict) or value.get('ok')is not True:
            raise RuntimeError('The private Linux provider placement failed')
        return value

    def start(self):
        try:
            self.broker=self.children.start([sys.executable,'-I','-B',str(HERE/'windows-provider-broker.py'),
                '--applications',str(self.apps),'--configuration',str(self.configuration)])
            self.protocol=Protocol(self.broker)
            ready=self.protocol.receive(45)
            if not isinstance(ready,dict) or set(ready)!={'ready','schema','port'} or ready['ready']is not True or ready['schema']!=1 or type(ready['port'])is not int or not 1024<=ready['port']<=65535:
                raise RuntimeError('The native provider broker did not become ready')
            self.port=ready['port']
            self.remote('prepare',{})
            self.prepared=True
            for product in PRODUCTS:
                socket=self.config['root']+'.runtime/providers/native/'+self.generation+'/'+product+'.sock'
                if len(socket)>100:
                    raise RuntimeError('The protected native socket path is too long')
                args=[*ssh_arguments(self.config),'-N','-o','ExitOnForwardFailure=yes',
                    '-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',
                    '-o','StreamLocalBindMask=0177','-o','StreamLocalBindUnlink=no',
                    '-R',socket+':127.0.0.1:'+str(self.port),self.config['user']+'@127.0.0.1']
                child=self.children.start(args)
                # SSH emits no public output. Consume bounded private diagnostics.
                channel=Protocol(child)
                self.tunnels[product]=(child,channel)
                self.protocol.control('register',product,child.pid)
            self.manifests=self.remote('publish',{'brokerPort':self.port,
                'accountSha256':self.config['codexProvider']['accountSha256'],'binarySha256':BINARY_SHA})['manifests']
            if not self.healthy():
                raise RuntimeError('The authenticated native transport closed during startup')
            return self
        except BaseException:
            self.close()
            raise

    def healthy(self):
        return not self.children.job.parent_exited() and self.broker.poll()is None and not self.protocol.failed.is_set() and all(child.poll()is None and not channel.failed.is_set() for child,channel in self.tunnels.values())

    def close(self):
        if self.protocol and self.broker.poll()is None:
            for product,(child,_) in self.tunnels.items():
                try:self.protocol.control('unregister',product,child.pid)
                except Exception:pass
            try:self.broker.stdin.close()
            except OSError:pass
        for child,_ in self.tunnels.values():
            if child.poll()is None:
                child.kill()
            child.wait(timeout=5)
        if self.prepared and not self.children.job.parent_exited():
            try:self.remote('cleanup',{})
            except Exception:pass
            self.prepared=False
        self.children.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--applications',type=Path,required=True)
    parser.add_argument('--configuration',type=Path,required=True)
    args=parser.parse_args()
    provider=NativeProvider(args.applications,args.configuration)
    try:
        provider.start()
        print(json.dumps({'ready':True,'schema':1,'products':list(PRODUCTS)}),flush=True)
        stop=threading.Event()
        def control():
            # No public enrollment or command surface: EOF closes every lease.
            sys.stdin.buffer.read(1)
            stop.set()
        threading.Thread(target=control,daemon=True).start()
        while not stop.wait(.1):
            if not provider.healthy():
                raise RuntimeError('The authenticated native transport closed')
    finally:
        provider.close()


if __name__=='__main__':
    try:main()
    except Exception:
        sys.stderr.write('The approved native provider transport is unavailable.\n')
        sys.exit(1)
