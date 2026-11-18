import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {execute,hostEnvironment,posixQuote,privateConfigurationLocation,PRODUCTS,sshArguments} from './controller.mjs';

test('strict SSH ignores ambient configuration and agents while preserving explicit references',()=>{
 const args=sshArguments({port:4222,key:'C:\\fixture directory\\identity',knownHosts:'C:\\fixture directory\\known-hosts'});
 assert.deepEqual(args.slice(0,2),['-F','NUL']);
 for(const option of ['BatchMode=yes','StrictHostKeyChecking=yes','IdentitiesOnly=yes','IdentityAgent=none','AddKeysToAgent=no'])assert.ok(args.includes(option));
 assert.equal(args[args.indexOf('-i')+1],'C:\\fixture directory\\identity');
 assert.ok(args.includes('UserKnownHostsFile=C:\\fixture directory\\known-hosts'));
 assert.deepEqual(Object.keys(PRODUCTS),['access','slipcurve']);
 assert.equal(PRODUCTS.access.host,'127.0.0.2');assert.equal(PRODUCTS.slipcurve.host,'127.0.0.3');
});

test('remote shell quoting retains apostrophes and shell metacharacters as literal data',()=>{
 assert.equal(posixQuote("a'b"),"'a'\\''b'");
 assert.equal(posixQuote('$(touch forbidden); x'),"'$(touch forbidden); x'");
});

test('a completed launcher does not wait indefinitely on a grandchild holding its output pipes',async()=>{
 const code="const {spawn}=require('node:child_process');process.stdout.write('started');spawn(process.execPath,['-e','setTimeout(()=>{},2000)'],{stdio:['ignore',process.stdout,process.stderr]});process.exit(0)";
 const begin=Date.now();const result=await execute(process.execPath,['-e',code],{timeout:1500});
 assert.equal(result.code,0);assert.equal(result.out,'started');assert.ok(Date.now()-begin<1400);
});

test('transport children do not inherit Git, Node injection or provider credentials',()=>{
 const keys=['GIT_CONFIG_COUNT','GITHUB_TOKEN','CLAUDE_CODE_OAUTH_TOKEN','ANTHROPIC_API_KEY','NODE_OPTIONS'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{for(const key of keys)process.env[key]='fixture';const env=hostEnvironment();for(const key of keys)assert.equal(env[key],undefined);assert.equal(env.SystemRoot,process.env.SystemRoot)}
 finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}}
});

test('canonical private configuration discovery is read-only and rejects installed or relative locations',()=>{
 const base=realpathSync(tmpdir());const scratch=realpathSync(mkdtempSync(join(base,'autocraft-config-test-')));
 try{
  const installed=join(scratch,'installation');mkdirSync(installed);
  const pointer=join(installed,'location.json');const outside=join(scratch,'private');
  writeFileSync(pointer,JSON.stringify({schema:1,directory:outside})+'\n');
  const bytes=readFileSync(pointer);
  assert.equal(privateConfigurationLocation(pointer,installed),join(outside,'autocraft-linux','connection.json'));
  assert.deepEqual(readFileSync(pointer),bytes);
  writeFileSync(pointer,JSON.stringify({schema:1,directory:join(installed,'private')}));
  assert.throws(()=>privateConfigurationLocation(pointer,installed),/outside/);
  writeFileSync(pointer,JSON.stringify({schema:1,directory:join(installed,'..private')}));
  assert.throws(()=>privateConfigurationLocation(pointer,installed),/outside/);
  writeFileSync(pointer,JSON.stringify({schema:1,directory:'relative-private'}));
  assert.throws(()=>privateConfigurationLocation(pointer,installed),/Invalid/);
  writeFileSync(pointer,JSON.stringify({schema:2,directory:outside}));
  assert.throws(()=>privateConfigurationLocation(pointer,installed),/Invalid/);
 }finally{assert.equal(dirname(scratch),base);assert.ok(basename(scratch).startsWith('autocraft-config-test-'));rmSync(scratch,{recursive:true,force:true})}
});
