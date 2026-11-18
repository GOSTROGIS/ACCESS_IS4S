import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {containedGit,ownedRepositories,synchronizeRepository} from './github-sync.mjs';

const exec=promisify(execFile);
const git=process.env.GITHUB_SYNC_TEST_GIT || 'git';
test('mirrors clone, fast-forward, preserve edits and divergence, and adopt an empty origin',async()=>{
  const scratch=await realpath(await mkdtemp(join(tmpdir(),'github-sync-test-')));
  try {
    const root=join(scratch,'mirrors'); const hooks=join(scratch,'hooks'); await mkdir(root); await mkdir(hooks);
    const config=join(scratch,'gitconfig'); await writeFile(config,'');
    const trace=join(scratch,'git-trace.jsonl');
    const environment={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:config,GIT_TERMINAL_PROMPT:'0',GIT_TRACE2_EVENT:trace};
    const syncCommands=async()=>(await readFile(trace,'utf8')).trim().split(/\r?\n/).map(line=>JSON.parse(line))
      .filter(event=>event.event==='start' && event.argv?.includes(`core.hooksPath=${hooks}`)).map(event=>event.argv);
    const run=async(args,cwd=scratch)=>(await exec(git,args,{cwd,env:environment,encoding:'utf8',windowsHide:true})).stdout.trim();
    const writer=join(scratch,'writer'); const origin=join(scratch,'origin.git');
    await run(['init','--initial-branch=main',writer]);
    await run(['config','user.name','Sync Test'],writer); await run(['config','user.email','sync@example.invalid'],writer);
    const commit=async(text)=>{await writeFile(join(writer,'sample.txt'),text);await run(['add','--','sample.txt'],writer);await run(['commit','-m','fixture'],writer);};
    await commit('one');await run(['clone','--bare',writer,origin]);
    const repo={name:'example',branch:'main',url:origin};
    const sync=()=>synchronizeRepository({git,root,repo,environment,hooks});
    assert.equal((await sync()).status,'cloned');
    const clonedCommands=await syncCommands();assert.ok(clonedCommands.length>0);
    for(const args of clonedCommands) {
      assert.ok(args.includes('http.lowSpeedLimit=1'),'real sync Git commands retain the proven one-byte HTTP threshold');
      assert.ok(args.includes('http.lowSpeedTime=120'),'real sync Git commands retain the proven 120-second HTTP window');
    }
    const local=join(root,'example');assert.equal(await readFile(join(local,'sample.txt'),'utf8'),'one');
    await commit('two');await run(['push',origin,'main'],writer);
    const advanced=await sync();
    assert.equal(advanced.status,'current',JSON.stringify(advanced));assert.equal(await readFile(join(local,'sample.txt'),'utf8'),'two');
    await run(['config','lfs.repositoryformatversion','0'],local);
    assert.equal((await sync()).status,'current');
    await run(['config','lfs.repositoryformatversion','1'],local);
    assert.deepEqual(await sync(),{name:'example',status:'local-config-requires-review',configuration:'lfs.repositoryformatversion'});
    await run(['config','lfs.repositoryformatversion','0'],local);
    for(const [key,value] of [['filter.untrusted.process','never-execute-this'],['lfs.url','https://unrelated.invalid/objects'],['remote.origin.vcs','never-execute-this'],['http.proxy','http://unrelated.invalid'],['http.sslverify','false']]) {
      await run(['config',key,value],local);
      assert.deepEqual(await sync(),{name:'example',status:'local-config-requires-review',configuration:key});
      await run(['config','--unset',key],local);
    }
    await writeFile(join(local,'sample.txt'),'user edit');
    assert.equal((await sync()).status,'local-edits');assert.equal(await readFile(join(local,'sample.txt'),'utf8'),'user edit');
    await writeFile(join(local,'sample.txt'),'two');
    await run(['switch','-c','user-branch'],local);assert.equal((await sync()).status,'different-branch');await run(['switch','main'],local);
    await run(['config','user.name','Sync Test'],local);await run(['config','user.email','sync@example.invalid'],local);
    await writeFile(join(local,'user.txt'),'local commit');await run(['add','--','user.txt'],local);await run(['commit','-m','local work'],local);
    const localHead=await run(['rev-parse','HEAD'],local);await commit('three');await run(['push',origin,'main'],writer);
    assert.equal((await sync()).status,'diverged');assert.equal(await run(['rev-parse','HEAD'],local),localHead);
    assert.equal(await readFile(join(local,'user.txt'),'utf8'),'local commit');
    const placedRepo={...repo,name:'placed'};
    assert.equal((await synchronizeRepository({git,root,repo:placedRepo,environment,hooks,placement:'Friendly App'})).status,'cloned');
    assert.equal(await readFile(join(scratch,'Friendly App','sample.txt'),'utf8'),'three');
    await assert.rejects(synchronizeRepository({git,root,repo:placedRepo,environment,hooks,placement:'../outside'}),/placement/);
    const empty=join(scratch,'empty.git');await run(['init','--bare','--initial-branch=main',empty]);
    const emptyRepo={name:'empty',branch:'main',url:empty};
    assert.equal((await synchronizeRepository({git,root,repo:emptyRepo,environment,hooks})).status,'empty');
    assert.equal((await synchronizeRepository({git,root,repo:emptyRepo,environment,hooks})).status,'empty');
    await run(['push',empty,'main'],writer);
    assert.equal((await synchronizeRepository({git,root,repo:emptyRepo,environment,hooks})).status,'current');
    assert.equal(await readFile(join(root,'empty','sample.txt'),'utf8'),'three');
    const seed=join(scratch,'seed');await run(['clone',origin,seed]);
    await run(['config','user.name','Sync Test'],seed);await run(['config','user.email','sync@example.invalid'],seed);
    await writeFile(join(seed,'unpublished.txt'),'private local work');await run(['add','--','unpublished.txt'],seed);await run(['commit','-m','unpublished'],seed);
    const unpublished=await run(['rev-parse','HEAD'],seed);
    const seededRepo={...repo,name:'seeded'};
    assert.equal((await synchronizeRepository({git,root,repo:seededRepo,environment,hooks,seed})).status,'cloned');
    const independent=join(root,'seeded');
    assert.equal(await readFile(join(independent,'sample.txt'),'utf8'),'three');
    await assert.rejects(readFile(join(independent,'unpublished.txt')));
    await assert.rejects(readFile(join(independent,'.git','objects','info','alternates')));
    await assert.rejects(run(['cat-file','-e',unpublished],independent));
    const commands=await syncCommands();const fetched=commands.filter(args=>args.includes('fetch'));
    assert.ok(fetched.length>0,'the actual fast-forward fixture executes Git fetch');
    assert.ok(fetched.every(args=>args.includes('--progress')),'only fetch explicitly forces bounded progress diagnostics');
    assert.ok(commands.filter(args=>!args.includes('fetch')).every(args=>!args.includes('--progress')),'clone, identity and local operations do not force progress');
  } finally {await rm(scratch,{recursive:true,force:true,maxRetries:5});}
});

for(const policy of [{name:'job deadline',timeoutMs:2000,lowSpeedTime:60,exitCode:124},{name:'libcurl low-speed limit',timeoutMs:10_000,lowSpeedTime:1,exitCode:128}]) test(`a genuine stalled Git HTTP transfer honors its ${policy.name} and closes the owned remote-helper socket`, {timeout:15_000}, async()=>{
  const scratch=await realpath(await mkdtemp(join(tmpdir(),'github-sync-stall-')));
  let connected,closed,socketError;
  const arrived=new Promise(resolve=>{connected=resolve});
  const ended=new Promise(resolve=>{closed=resolve});
  const server=createServer(socket=>{socket.on('data',()=>{});socket.on('error',error=>{socketError=error});socket.once('close',closed);connected();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const config=join(scratch,'config');await writeFile(config,'');
    const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:config,GIT_TERMINAL_PROMPT:'0'};
    delete env.INTRANET_GITHUB_CREDENTIAL;delete env.GIT_ASKPASS;
    const start=Date.now();
    const operation=containedGit({git,args:['-c','credential.helper=','-c','http.proxy=','-c','http.lowSpeedLimit=1','-c',`http.lowSpeedTime=${policy.lowSpeedTime}`,'ls-remote',`http://127.0.0.1:${server.address().port}/synthetic-fixture.git`],cwd:scratch,env,timeoutMs:policy.timeoutMs});
    await Promise.race([arrived,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Git did not open its fixture connection')),5000);timer.unref();})]);
    await assert.rejects(operation,error=>error.code===policy.exitCode && !error.message.includes('synthetic-fixture'));
    await Promise.race([ended,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('The owned Git remote helper survived its job deadline')),3000);timer.unref();})]);
    if(socketError && socketError.code!=='ECONNRESET') throw socketError;
    assert.ok(Date.now()-start<8000);
  } finally {await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true,maxRetries:5});}
});

test('a stalled existing credential helper is bounded and its synthetic credential never enters the error', {timeout:15_000}, async()=>{
  const scratch=await realpath(await mkdtemp(join(tmpdir(),'github-sync-credential-')));
  try {
    const python=process.env.GITHUB_SYNC_TEST_PYTHON;
    assert.ok(python,'Set the approved test Python path.');
    const config=join(scratch,'config'),helper=join(scratch,'credential.py');
    await writeFile(config,'');
    await writeFile(helper,'import sys,time\nsys.stdin.buffer.read()\nprint("username=synthetic\\npassword=SYNTHETIC-NOT-A-CREDENTIAL\\n",flush=True)\ntime.sleep(60)\n');
    const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
    const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:config,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'};
    await exec(git,['config','--file',config,'credential.helper',`!${quote(python.replaceAll('\\','/'))} ${quote(helper.replaceAll('\\','/'))}`],{env,windowsHide:true});
    await assert.rejects(containedGit({git,python,args:['credential','fill'],credential:true,timeoutMs:1500,maxOutput:32768,cwd:scratch,env}),error=>error.code===124 && !JSON.stringify(error).includes('SYNTHETIC-NOT-A-CREDENTIAL') && !error.message.includes('password='));
  } finally {await rm(scratch,{recursive:true,force:true,maxRetries:5});}
});

test('repository discovery refuses an oversized GitHub response without exposing its synthetic authorization',async()=>{
  const original=globalThis.fetch;let cancelled=false;
  try {
    globalThis.fetch=async url=>String(url).endsWith('/user')?Response.json({login:'synthetic-owner'}):new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4*1024*1024+1));},cancel(){cancelled=true}}));
    await assert.rejects(ownedRepositories('synthetic-owner','SYNTHETIC-NOT-A-CREDENTIAL'),error=>error.message==='GitHub API exceeded its response limit.' && !JSON.stringify(error).includes('SYNTHETIC-NOT-A-CREDENTIAL'));
    assert.ok(cancelled);
    cancelled=false;
    globalThis.fetch=async()=>new Response(new ReadableStream({cancel(){cancelled=true}}),{status:401});
    await assert.rejects(ownedRepositories('synthetic-owner','SYNTHETIC-NOT-A-CREDENTIAL'),/GitHub API returned HTTP 401/);
    assert.ok(cancelled,'HTTP error bodies are cancelled without reading or logging them');
  } finally {globalThis.fetch=original;}
});
