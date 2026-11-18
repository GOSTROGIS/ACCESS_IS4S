"""Private draft native broker launcher; fixed configuration, private stdin control.

Nothing is installed by this script. It never enrolls or changes an account.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import threading


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def load_configuration(applications,configuration):
    if os.name!='nt':
        raise ValueError('The native Windows provider is unavailable')
    apps=Path(applications).resolve(strict=True)
    configuration=Path(configuration)
    if not apps.is_dir() or Path(applications).is_symlink() or configuration.is_symlink():
        raise ValueError('The native runtime references are unavailable')
    here=Path(__file__).resolve().parent
    helper=apps/'tools/autocraft-linux/publish-autocraft-source.py'
    process=module('native_broker_process',helper)
    controller=(apps/'tools/autocraft-linux/controller.mjs').as_uri()
    code='const {loadConfiguration}=await import('+json.dumps(controller)+');process.stdout.write(JSON.stringify(await loadConfiguration(process.argv[1])));'
    allowed={'PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA'}
    env={key:value for key,value in os.environ.items() if key.upper() in allowed}
    result=process.run_bounded([str(apps/'tools/node.exe'),'--input-type=module','-e',code,str(configuration)],
                               env=env,timeout=25,max_output=65536)
    if result.returncode:
        raise ValueError('The protected native configuration is unavailable')
    config=json.loads(result.stdout)
    provider=config.get('codexProvider')
    if not isinstance(provider,dict) or set(provider)!={'executable','executableSha256','accountSha256'} or any(
        not isinstance(provider[key],str) or not re.fullmatch(r'[a-f0-9]{64}',provider[key])
        for key in ['executableSha256','accountSha256']):
        raise ValueError('The approved managed provider is not pinned')
    return apps,config,process


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--applications',type=Path,required=True)
    parser.add_argument('--configuration',type=Path,required=True)
    args=parser.parse_args()
    apps,config,process=load_configuration(args.applications,args.configuration)
    here=Path(__file__).resolve().parent
    provider=config['codexProvider']
    helper=apps/'tools/autocraft-linux/publish-autocraft-source.py'
    auth_module=module('native_broker_auth',here/'windows-auth-manager.py')
    peer_module=module('native_broker_peers',here/'windows-peer-native.py')
    session_module=module('native_broker_session',here/'native-session-verifier.py')
    broker_module=module('native_broker_http',here/'windows-lease-broker.py')
    peers=peer_module.WindowsPeers()
    verify=session_module.NativeSessionVerifier(config,process.run_bounded)
    # Only the existing official managed account is inspected. No login/logout,
    # provider environment token, refresh credential, or account pin is imported.
    with auth_module.ManagedAuthManager(provider['executable'],provider['executableSha256'],helper) as auth:
        if auth.identity()['accountSha256']!=provider['accountSha256']:
            raise ValueError('The managed provider account changed')
        server=broker_module.LeaseBroker(peers,auth,{key:provider['accountSha256'] for key in ['access','slipcurve']},verify)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            sys.stdout.buffer.write((json.dumps({'ready':True,'schema':1,'port':server.server_port})+'\n').encode())
            sys.stdout.buffer.flush()
            server.serve_control(sys.stdin.buffer,sys.stdout.buffer)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__=='__main__':
    try:
        main()
    except Exception:
        # Protocol errors and native diagnostics must not disclose private data.
        sys.stderr.write('The approved native provider broker is unavailable.\n')
        sys.exit(1)
