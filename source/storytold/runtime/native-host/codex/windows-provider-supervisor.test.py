"""Real Windows ownership checks; no guest, credentials or model calls."""
import ctypes
from ctypes import wintypes
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('supervision',HERE/'windows-provider-supervisor.py')
supervision=importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervision)
assert os.name=='nt', 'Run the actual Windows ownership gate on Windows'
apps=Path(os.environ['AUTOCRAFT_TEST_APPLICATIONS']).resolve(strict=True)
helper=apps/'tools/runtime-update/local-intranet/project-command.py'
node=apps/'tools/node.exe'
kernel=ctypes.WinDLL('kernel32',use_last_error=True)
kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
kernel.OpenProcess.restype=wintypes.HANDLE
kernel.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD]
kernel.WaitForSingleObject.restype=wintypes.DWORD
kernel.CloseHandle.argtypes=[wintypes.HANDLE]
kernel.CloseHandle.restype=wintypes.BOOL

def read_handle(pid):
    value=kernel.OpenProcess(0x100000,False,pid)
    assert value,'The exact owned process could not be observed'
    return value

def exited(handle,timeout=5000):
    return kernel.WaitForSingleObject(handle,timeout)==0

checks=[]
children=supervision.OwnedChildren(helper)
sentinel=subprocess.Popen([str(node),'-e','setInterval(()=>{},1000)'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=0x08000000)
try:
    literal='$(not-executed) `not-executed` & untouched'
    value=children.command([str(node),'-e','process.stdout.write(JSON.stringify(process.argv.slice(1)))',literal])
    assert json.loads(value)==[literal]
    checks.append('literal-argv-no-shell')
    previous=os.environ.get('GITHUB_TOKEN')
    os.environ['GITHUB_TOKEN']='test-only-rejected-environment-value'
    try:
        value=children.command([str(node),'-e','process.stdout.write(JSON.stringify({leak:"GITHUB_TOKEN" in process.env}))'])
        assert json.loads(value)=={'leak':False}
    finally:
        if previous is None:os.environ.pop('GITHUB_TOKEN',None)
        else:os.environ['GITHUB_TOKEN']=previous
    checks.append('ambient-credential-environment-excluded')
    for args,options,label in [
      ([str(node),'-e','process.stdout.write("x".repeat(4096));setInterval(()=>{},1000)'],{'limit':128},'finite-output-bound'),
      ([str(node),'-e','setInterval(()=>{},1000)'],{'timeout':.2},'finite-command-deadline')]:
        try:children.command(args,**options)
        except RuntimeError:pass
        else:raise AssertionError(label+' was not enforced')
        assert children.children[-1].poll()is not None
        checks.append(label)
    background=children.start([str(node),'-e','setInterval(()=>{},1000)'])
    handle=read_handle(background.pid)
    try:
        children.close()
        assert exited(handle)
    finally:kernel.CloseHandle(handle)
    checks.append('normal-close-terminates-exact-owned-transport')
    assert sentinel.poll()is None
    checks.append('unrelated-process-preserved')
finally:
    children.close()
    sentinel.terminate()
    sentinel.wait(timeout=5)

# A genuine process killed while it owns the job cannot leave either a child or
# a grandchild behind. The observer holds read-only handles before that death.
program=r'''
import importlib.util,json,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('supervision',sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
owned=module.OwnedChildren(Path(sys.argv[2]))
code='const {spawn}=require("node:child_process"); const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore",windowsHide:true});process.stdout.write(JSON.stringify({pid:process.pid,descendant:child.pid})+"\\n");setInterval(()=>{},1000)'
child=owned.start([sys.argv[3],'-e',code])
print(child.stdout.readline().decode().strip(),flush=True)
while True:time.sleep(.1)
'''
owner=subprocess.Popen([sys.executable,'-I','-B','-c',program,str(HERE/'windows-provider-supervisor.py'),str(helper),str(node)],
    stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=0x08000000)
handles=[]
try:
    # stdout is a single fixed receipt from our own fixture, never a provider.
    import threading,queue
    lines=queue.Queue(maxsize=1)
    thread=threading.Thread(target=lambda:lines.put(owner.stdout.readline()),daemon=True)
    thread.start()
    value=json.loads(lines.get(timeout=15))
    assert set(value)=={'pid','descendant'}
    handles=[read_handle(value[key]) for key in ['pid','descendant']]
    owner.kill()
    owner.wait(timeout=5)
    assert all(exited(handle) for handle in handles)
    checks.append('abrupt-owner-death-terminates-child-and-grandchild')
finally:
    if owner.poll()is None:owner.kill()
    owner.wait(timeout=5)
    for handle in handles:kernel.CloseHandle(handle)
    owner.stdout.close();owner.stderr.close()

# A tunnel wait failure must not skip the actual Job Object close. Use an
# uninitialized NativeProvider only to avoid configuration or provider access;
# its close method and the owned process containment are the real production
# implementations. The injected failure is limited to the tunnel wait method.
owned=supervision.OwnedChildren(helper)
unrelated=subprocess.Popen([str(node),'-e','setInterval(()=>{},1000)'],
    stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=0x08000000)
handles=[]
try:
    grandchild_code='process.stdout.write("ready\\n");setInterval(()=>{},1000)'
    tree_code=('const {spawn}=require("node:child_process");'
        'const child=spawn(process.execPath,["-e",'+json.dumps(grandchild_code)+'],{stdio:["ignore","pipe","ignore"],windowsHide:true});'
        'child.stdout.once("data",()=>process.stdout.write(JSON.stringify({pid:process.pid,descendant:child.pid})+'+json.dumps('\n')+'));'
        'setInterval(()=>{},1000)')
    child=owned.start([str(node),'-e',tree_code])
    lines=queue.Queue(maxsize=1)
    threading.Thread(target=lambda:lines.put(child.stdout.readline()),daemon=True).start()
    value=json.loads(lines.get(timeout=15))
    assert set(value)=={'pid','descendant'}
    handles=[read_handle(value[key]) for key in ['pid','descendant']]
    failing_tunnel=owned.start([str(node),'-e','setInterval(()=>{},1000)'])

    class WaitFailure:
        pid=failing_tunnel.pid
        def poll(self):return failing_tunnel.poll()
        def kill(self):return failing_tunnel.kill()
        def wait(self,timeout):raise subprocess.TimeoutExpired('synthetic-owned-tunnel',timeout)

    provider=object.__new__(supervision.NativeProvider)
    provider.children=owned
    provider.protocol=None
    provider.broker=None
    provider.prepared=False
    # Failure on the first tunnel must still terminate the next actual tunnel
    # and its already-running descendant through unconditional job closure.
    provider.tunnels={'access':(WaitFailure(),None),'slipcurve':(child,None)}
    propagated=False
    try:provider.close()
    except subprocess.TimeoutExpired:propagated=True
    result={'schema':1,'injectedTunnelWaitFailurePropagated':propagated,
        'actualJobClosed':owned.job.handle is None,
        'ownedChildExited':exited(handles[0],2000),
        'ownedGrandchildExited':exited(handles[1],2000),
        'unrelatedProcessPreserved':unrelated.poll()is None,
        'guestOperations':0,'credentialAccess':False,'modelCalls':0}
    assert result['injectedTunnelWaitFailurePropagated']
    assert result['actualJobClosed'], 'Tunnel wait failure skipped the unconditional Job Object close'
    assert result['ownedChildExited'] and result['ownedGrandchildExited']
    assert result['unrelatedProcessPreserved']
    checks.append('tunnel-wait-failure-still-closes-owned-child-and-grandchild')
finally:
    owned.close()
    for handle in handles:kernel.CloseHandle(handle)
    unrelated.terminate()
    unrelated.wait(timeout=5)

report={'ok':True,'checks':checks,'passed':len(checks),'failed':0,'guestOperations':0,'credentialAccess':False,'modelCalls':0}
print(json.dumps(report))
