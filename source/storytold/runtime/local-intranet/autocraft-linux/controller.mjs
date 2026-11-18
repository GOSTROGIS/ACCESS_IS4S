import {spawn, spawnSync} from 'node:child_process';
import {existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync, closeSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {freemem} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

export const PRODUCTS=Object.freeze({access:{host:'127.0.0.2',port:8993,worker:8981},slipcurve:{host:'127.0.0.3',port:8994,worker:8982}});
const here=dirname(fileURLToPath(import.meta.url));
const ps=join(process.env.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const ssh=join(process.env.SystemRoot??'C:\\Windows','System32/OpenSSH/ssh.exe');
const psQuote=value=>"'"+String(value).replaceAll("'","''")+"'";
export const posixQuote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
export function hostEnvironment(){
 const allowed=['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','PROGRAMFILES','PROGRAMFILES(X86)','COMSPEC','USERNAME','USERDOMAIN'];
 return Object.fromEntries(allowed.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
}

export function execute(exe,args,{input,timeout=30000}={}){
 return new Promise((accept,reject)=>{
  const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe'],env:hostEnvironment()});
  let out='',err='';let overflow=false,timedOut=false;
  child.stdout.on('data',part=>{out+=part;if(out.length>1024*1024){overflow=true;child.kill()}});
  child.stderr.on('data',part=>{err+=part;if(err.length>65536){overflow=true;child.kill()}});
  let finished=false;
  const finish=code=>{if(finished)return;finished=true;clearTimeout(timer);child.stdout.destroy();child.stderr.destroy();accept({code,out,err,overflow,timedOut})};
  const timer=setTimeout(()=>{timedOut=true;child.kill();setTimeout(()=>finish(null),1000).unref()},timeout);timer.unref();
  child.once('error',()=>{clearTimeout(timer);reject(new Error('Required local transport executable could not start'))});
  child.once('close',finish);
  // Start-Process can leave inherited pipe handles in the long-lived QEMU
  // descendant after its PowerShell launcher exits. Drain briefly, then use the
  // actual launcher's exit code instead of waiting for the guest to shut down.
  child.once('exit',code=>{clearTimeout(timer);setTimeout(()=>finish(code),200)});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}

function regular(path){
 if(typeof path!=='string'||!isAbsolute(path)||/[\r\n\0]/.test(path))throw new Error('Invalid private runtime reference');
 const entry=lstatSync(path);if(!entry.isFile()||entry.isSymbolicLink())throw new Error('Private runtime reference must be a regular file');
 return realpathSync(path);
}

async function protectedConfig(path){
 const script=`$ErrorActionPreference='Stop';$p=${psQuote(path)};$acl=[System.IO.File]::GetAccessControl($p);$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;$ok=$owner -eq $sid;foreach($r in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -notin @($sid,'S-1-5-18','S-1-5-32-544')){$ok=$false}};if($ok){exit 0}else{exit 1}`;
 const result=await execute(ps,['-NoProfile','-NonInteractive','-Command',script]);
 if(result.code!==0)throw new Error('Private AutoCraft configuration permissions require the owning account');
}

export async function loadConfiguration(explicit){
 const path=regular(explicit??configurationLocation());
 await protectedConfig(path);
 const value=JSON.parse(readFileSync(path,'utf8'));
 if(!/^[a-z_][a-z0-9_-]*$/.test(value.user)||!Number.isInteger(value.port)||value.port<1024||value.port>65535||!/^\/[a-zA-Z0-9._/-]+$/.test(value.root)||/\/\.\.?(\/|$)/.test(value.root))throw new Error('Invalid private Linux connection settings');
 value.key=regular(value.key);value.knownHosts=regular(value.knownHosts);
 value.guestLauncher=regular(value.guestLauncher);value.guestExecutable=regular(value.guestExecutable);
 if(basename(value.guestExecutable).toLowerCase()!=='qemu-system-x86_64.exe'||!isAbsolute(value.guestPid)||/[\r\n\0]/.test(value.guestPid))throw new Error('Invalid approved guest launcher reference');
 return {...value,configurationFile:path,statusFile:join(dirname(path),'status.json'),lockFile:join(dirname(path),'supervisor.lock')};
}

export function configurationLocation(){
 return privateConfigurationLocation(join(here,'../native-profile-location.json'),resolve(here,'../..'));
}

export function privateConfigurationLocation(reference,installation){
 const pointer=regular(reference);
 const value=JSON.parse(readFileSync(pointer,'utf8'));
 if(value.schema!==1||!isAbsolute(value.directory))throw new Error('Invalid private profile location');
 const within=relative(installation,resolve(value.directory));
 if(!(within==='..'||within.startsWith('..'+sep)||isAbsolute(within)))throw new Error('Private configuration must remain outside the synced installation');
 return join(value.directory,'autocraft-linux','connection.json');
}

export function sshArguments(config){
 return ['-F','NUL','-T','-p',String(config.port),'-i',config.key,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${config.knownHosts}`,'-o','ConnectTimeout=5','-o','IdentitiesOnly=yes','-o','IdentityAgent=none','-o','AddKeysToAgent=no'];
}

export async function guestCommand(config,command,input,timeout=30000){
 const result=await execute(ssh,[...sshArguments(config),`${config.user}@127.0.0.1`,command],{input,timeout});
 return checkedTransportResult(result);
}

export function checkedTransportResult(result){
 const kind=result.timedOut?'TIMEOUT':result.overflow?'OUTPUT_LIMIT':result.code!==0?'EXIT':null;
 if(kind){
  const message=kind==='TIMEOUT'?'Authenticated Linux runtime command exceeded its time limit':kind==='OUTPUT_LIMIT'?'Authenticated Linux runtime command exceeded its output limit':'Authenticated Linux runtime command failed';
  // Transport stderr/stdout can contain private paths or credentials. Only classify the failure.
  throw Object.assign(new Error(message),{code:`AUTOCRAFT_LINUX_${kind}`,exitCode:result.code});
 }
 return result.out;
}

async function guestAlive(config){
 try{await guestCommand(config,'true',undefined,8000);return true}catch{return false}
}

async function ownedGuestExists(config){
 if(!existsSync(config.guestPid))return false;
 const pid=Number(readFileSync(config.guestPid,'utf8').trim());
 if(!Number.isInteger(pid)||pid<1)throw new Error('Invalid private guest process record');
 const script=`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}';if(-not $p){exit 1};if($p.ExecutablePath -eq ${psQuote(config.guestExecutable)}){exit 0};exit 2`;
 const result=await execute(ps,['-NoProfile','-NonInteractive','-Command',script]);
 if(result.code===2)throw new Error('Guest process record belongs to another executable');
 return result.code===0;
}

async function bootGuest(config){
 if(await guestAlive(config))return;
 const existing=await ownedGuestExists(config);
 writeStatus(config,existing?'waiting-for-ssh':'launching-guest');
 if(!existing){
  if(freemem()<384*1024*1024)throw new Error('Insufficient available memory for the bounded Linux guest');
  // The approved launcher owns a background QEMU process. Its inherited handles
  // must not make controller readiness wait for the lifetime of that guest.
  const log=openSync(join(dirname(config.configurationFile),'guest-launcher.log'),'w');
  const launcher=spawn(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',config.guestLauncher],{windowsHide:true,stdio:['ignore',log,log],env:hostEnvironment()});
  closeSync(log);
  launcher.once('error',()=>{});launcher.unref();
 }
 for(let n=0;n<45;n++){if(await guestAlive(config))return;await delay(2000)}
 throw new Error('Linux guest did not become ready');
}

function writeStatus(config,state){
 writeFileSync(config.statusFile,JSON.stringify({state,updatedAt:new Date().toISOString(),products:Object.keys(PRODUCTS)})+'\n');
}

function acquire(config){
 try{const fd=openSync(config.lockFile,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);return true}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  const pid=Number(readFileSync(config.lockFile,'utf8').trim());
  if(!Number.isInteger(pid)||pid<1)throw new Error('Invalid private supervisor lock');
  try{process.kill(pid,0);return false}catch(error){if(error.code!=='ESRCH')return false}
  unlinkSync(config.lockFile);return acquire(config);
 }
}

async function productReady(product){
 const target=PRODUCTS[product];
 try{const result=await fetch(`http://${target.host}:${target.port}/readyz`,{signal:AbortSignal.timeout(1500),redirect:'error'});return result.status===200}catch{return false}
}

async function supervise(config){
 if(!acquire(config))return;
 let stopping=false,tunnel;
 const stop=()=>{stopping=true;tunnel?.kill()};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{
  while(!stopping){
   try{
    writeStatus(config,'starting');await bootGuest(config);
    await guestCommand(config,'systemctl --user start autocraft-intranet-access-runner.service autocraft-intranet-slipcurve-runner.service');
    const forward=Object.values(PRODUCTS).flatMap(item=>['-L',`${item.host}:${item.port}:127.0.0.1:${item.port}`]);
    tunnel=spawn(ssh,[...sshArguments(config),'-N','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',...forward,`${config.user}@127.0.0.1`],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:hostEnvironment()});
    tunnel.stderr.resume();
    writeStatus(config,'connected');
    await new Promise(done=>{tunnel.once('close',done);tunnel.once('error',done)});
   }catch{writeStatus(config,'retrying')}
   if(!stopping)await delay(5000);
  }
 }finally{writeStatus(config,'stopped');unlinkSync(config.lockFile)}
}

export async function ensureReady(config,product){
 if(!PRODUCTS[product])throw new Error('Unknown AutoCraft product');
 if(await productReady(product))return;
 const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'supervise','--configuration',config.configurationFile],{detached:true,windowsHide:true,stdio:'ignore',env:hostEnvironment()});child.unref();
 for(let n=0;n<90;n++){if(await productReady(product))return;await delay(1000)}
 throw new Error('Production AutoCraft dashboard is not ready');
}

export async function issueGuest(config,product,payload){
 if(!PRODUCTS[product])throw new Error('Unknown AutoCraft product');
 const env=`${config.root}.data/${product}/runtime.env`;
 const app=`${config.root}.runtime/${product}/current`;
 const command=`set -eu; set -a; . ${posixQuote(env)}; set +a; cd ${posixQuote(app)}; exec /opt/node/bin/node src/dash/server/native-issue.ts --product ${product}`;
 const output=await guestCommand(config,command,JSON.stringify(payload),20000);
 const result=JSON.parse(output);
 const expected=`http://${PRODUCTS[product].host}:${PRODUCTS[product].port}`;
 if(typeof result.url!=='string'||new URL(result.url).origin!==expected||typeof result.expiresAt!=='string')throw new Error('Invalid native sign-in handoff');
 return result;
}

async function main(){
 const args=process.argv.slice(2),command=args.shift();
 const option=name=>{const at=args.indexOf(name);return at<0?undefined:args[at+1]};
 const product=option('--product')??'access';if(!PRODUCTS[product])throw new Error('Unknown AutoCraft product');
 const config=await loadConfiguration(option('--configuration'));
 if(command==='supervise'){await supervise(config);return}
 if(command==='status'){
  console.log(JSON.stringify({guestReachable:await guestAlive(config),accessReady:await productReady('access'),slipcurveReady:await productReady('slipcurve')}));return;
 }
 if(command==='start'){await ensureReady(config,product);console.log('AutoCraft is ready');return}
 if(command==='login'){
  await ensureReady(config,product);
  const {nativeLogin}=await import(pathToFileURL(join(here,'native-login.mjs')));
  await nativeLogin({product,configuration:config,issue:payload=>issueGuest(config,product,payload)});return;
 }
 throw new Error('Use start, status or login with --product access|slipcurve');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 try{
  const at=process.argv.indexOf('--configuration');
  const path=regular(at<0?configurationLocation():process.argv[at+1]);
  const message=/^(Invalid|Private|Unknown|Required|Approved|Insufficient|Linux|Authenticated|Production)/.test(error.message)?error.message:'Runtime configuration or startup failed';
  writeFileSync(join(dirname(path),'last-error.json'),JSON.stringify({code:error.code??error.name,message,at:new Date().toISOString()})+'\n');
 }catch{}
 console.error('AutoCraft Linux action failed. Check the private runtime status and production configuration.');process.exitCode=1;
});
