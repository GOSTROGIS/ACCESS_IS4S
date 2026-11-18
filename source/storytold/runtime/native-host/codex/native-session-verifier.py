"""Private draft host callback for the actual bound Linux native session probe.

No production install or guest operation is performed by importing this module.
The caller supplies the already validated owner-only connection configuration,
the owned Windows process helper and fixed immutable native owner metadata.
"""
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import time


class NativeSessionVerifier:
    def __init__(self,configuration,run_bounded):
        self.configuration=dict(configuration)
        self.run=run_bounded
        value=self.configuration
        if not re.fullmatch(r'[a-z_][a-z0-9_-]*',value.get('user','')) or not re.fullmatch(r'/[A-Za-z0-9._/-]+',value.get('root','')):
            raise ValueError('The approved Linux connection is unavailable')
        if any(part in {'.','..'} for part in value['root'].split('/')) or type(value.get('port'))is not int or not 1024<=value['port']<=65535:
            raise ValueError('The approved Linux connection is unavailable')
        pin=value.get('nativeOwner',{})
        if not isinstance(pin.get('login'),str) or not re.fullmatch(r'[A-Za-z0-9-]{1,39}',pin['login']) or type(pin.get('githubId'))is not int or pin['githubId']<1:
            raise ValueError('The protected native owner pin is unavailable')
        for name in ['key','knownHosts']:
            path=Path(value[name])
            if not path.is_absolute() or not path.is_file() or path.is_symlink():
                raise ValueError('The approved Linux identity reference is unavailable')
        self.ssh=Path(os.environ['SYSTEMROOT'])/'System32/OpenSSH/ssh.exe'
        if not self.ssh.is_file():
            raise ValueError('The approved Linux transport is unavailable')

    @staticmethod
    def quote(value):
        return "'"+str(value).replace("'","'\\''")+"'"

    def inspect(self,product,expected_session,deadline,cancelled):
        self.last_check={'phase':'input'}
        if product not in {'access','slipcurve'} or expected_session is not None and not re.fullmatch(r'[a-f0-9]{64}',expected_session):
            return None
        remaining=deadline-time.monotonic()
        self.last_check={'phase':'deadline'}
        if cancelled.is_set() or remaining<=0:
            return None
        value=self.configuration
        root=value['root']
        probe=f'{root}.runtime/tools/native-provider-session.mjs'
        bridge=f'{root}.runtime/tools/linux-gh.mjs'
        runtime=f'{root}.runtime/{product}/current'
        data=f'{root}.data/{product}'
        command=f'set -eu; set -a; . {self.quote(data+"/runtime.env")}; set +a; exec /usr/bin/timeout --kill-after=1s 4s /opt/node/bin/node {self.quote(probe)} --product {product} --runtime-root {self.quote(runtime)} --data-root {self.quote(data)} --bridge {self.quote(bridge)}'
        args=[str(self.ssh),'-F','NUL','-T','-p',str(value['port']),'-i',value['key'],
              '-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+value['knownHosts'],
              '-o','ConnectTimeout=5','-o','IdentitiesOnly=yes','-o','IdentityAgent=none','-o','AddKeysToAgent=no',
              value['user']+'@127.0.0.1',command]
        allowed={'PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA',
                 'PROGRAMDATA','PROGRAMFILES','PROGRAMFILES(X86)','USERNAME','USERDOMAIN'}
        environment={key:item for key,item in os.environ.items() if key.upper() in allowed}
        try:
            result=self.run(args,env=environment,timeout=min(remaining,5),max_output=8192,
                            input=json.dumps({'expectedSessionSha256':expected_session} if expected_session else {}).encode())
            self.last_check={'phase':'remote-exit','exitCode':result.returncode,'stdoutBytes':len(result.stdout),'stderrBytes':len(result.stderr)}
            self.private_stderr=result.stderr
            if result.returncode or cancelled.is_set() or time.monotonic()>=deadline:
                return None
            proof=json.loads(result.stdout)
            pin=value['nativeOwner']
            self.last_check={'phase':'shape'}
            if not isinstance(proof,dict) or set(proof)!={'authorized','product','sessionSha256','githubId','loginSha256','verifiedAt'} or proof['authorized']is not True or proof['product']!=product:
                return None
            self.last_check={'phase':'identity'}
            if proof['githubId']!=pin['githubId'] or proof['loginSha256']!=sha256(pin['login'].lower().encode()).hexdigest() or not re.fullmatch(r'[a-f0-9]{64}',proof['sessionSha256']):
                return None
            self.last_check={'phase':'session-and-clock'}
            if expected_session is not None and proof['sessionSha256']!=expected_session or type(proof['verifiedAt'])is not int:
                return None
            self.last_check={'phase':'clock','driftMs':round(time.time()*1000-proof['verifiedAt'])}
            if abs(self.last_check['driftMs'])>5000:return None
            self.last_check={'phase':'authorized'}
            return proof
        except Exception as error:
            self.last_check={**self.last_check,'exception':type(error).__name__}
            # Captured child diagnostics remain private; never copy them to HTTP/errors.
            return None

    def __call__(self,product,session_sha256,deadline,cancelled):
        return self.inspect(product,session_sha256,deadline,cancelled) is not None
