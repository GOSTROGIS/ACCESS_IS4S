import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import {randomBytes} from 'node:crypto';
import {createServer,request} from 'node:http';

const installed = resolve(process.argv[2]);
const product=process.argv[4]??'access';
assert.ok(['access','slipcurve'].includes(product));
const workspace = mkdtempSync(join(resolve(process.argv[3]), 'rank-'));
const dbPath = join(workspace, 'rank.db');
const cli = join(installed, 'src/cli.ts');
const allowed = new Set(['PATH', 'LANG', 'LC_ALL', 'TZ', 'USER', 'LOGNAME', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS']);
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => allowed.has(name)));
Object.assign(env, { AUTOCRAFT_DB: dbPath, AUTOCRAFT_RUNNER_LOGS: join(workspace,'logs'), AUTOCRAFT_LOCK_DIR: join(workspace,'locks'),
  AUTOCRAFT_WORKER_LISTEN:'127.0.0.1:0', AUTOCRAFT_HEALTH_LISTEN:'127.0.0.1:0', AUTOCRAFT_RUNNER_POLL_MS:'100' });
process.env.AUTOCRAFT_DB = dbPath;
const {connect} = await import(pathToFileURL(join(installed,'src/db.ts')));
const db = connect(dbPath);
let child;
async function dashboardGate(){
  const dist=join(installed,'web/dist');
  assert.ok(existsSync(join(dist,'index.html')),'Genuine frontend must be built before qualification');
  const {TokenBox}=await import(pathToFileURL(join(installed,'src/dash/server/crypto.ts')));
  const {createSession}=await import(pathToFileURL(join(installed,'src/dash/server/sessions.ts')));
  const {addLogin}=await import(pathToFileURL(join(installed,'src/access.ts')));
  const {createApp,defaultRoutes}=await import(pathToFileURL(join(installed,'src/dash/server/index.ts')));
  const {nativeSessionCookie}=await import(pathToFileURL(join(installed,'src/dash/server/native-signin.ts')));
  const host=product==='access'?'127.0.0.2:8993':'127.0.0.3:8994';
  const config={host:'127.0.0.1',port:product==='access'?8993:8994,baseUrl:`http://${host}`,dbPath,webDist:dist,devAuth:false,devPermsFile:null,devTokenTtlMs:null,trustProxy:false,imageCacheDir:null,secretsFile:null,
    secrets:{githubClientId:null,githubClientSecret:null,sessionKey:randomBytes(32).toString('hex'),app:null,nativeOwner:{product,login:'LocalGate',githubId:1}}};
  // Local session fixture checks the real HTTP/static renderer; live identity and
  // browser cookie verification are separate deployment gates, never bypassed.
  addLogin(db,'isolated-gate','LocalGate','operator',null,1);
  const sid=createSession(db,new TokenBox(config.secrets.sessionKey),'LocalGate',{access:'',refresh:null,expiresAt:null,refreshExpiresAt:null},'isolated frontend regression');
  const app=createApp({config,db,routes:await defaultRoutes()});
  const server=createServer((req,res)=>void app.handle(req,res));
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done)});
  const port=server.address().port;
  const get=(path,authenticated=true)=>new Promise((done,reject)=>{
    const req=request({host:'127.0.0.1',port,path,headers:{Host:host,...(authenticated?{Cookie:`${nativeSessionCookie(config)}=${sid}`}:{})}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>done({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))});req.once('error',reject);req.end();
  });
  try{
    assert.equal((await get('/api/me',false)).status,401);
    const page=await get('/');assert.equal(page.status,200);
    assert.deepEqual(page.body,readFileSync(join(dist,'index.html')));
    assert.match(page.headers['content-security-policy'],/script-src 'self'/);
    const urls=[...page.body.toString().matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(match=>match[1]);
    assert.ok(urls.some(url=>url.endsWith('.js'))&&urls.some(url=>url.endsWith('.css')));
    for(const url of urls){assert.ok(!url.includes('..'));const asset=await get(url);assert.equal(asset.status,200);assert.deepEqual(asset.body,readFileSync(join(dist,url.slice(1))))}
    const me=await get('/api/me');assert.equal(me.status,200);assert.equal(JSON.parse(me.body).login,'LocalGate');
    console.log('Real production HTTP handler served exact built dashboard HTML, JavaScript and CSS; isolated session/API and unauthenticated denial passed.');
  }finally{app.close();server.closeAllConnections();await new Promise(done=>server.close(done))}
}
try {
  db.exec("DELETE FROM tracked_repos; INSERT INTO tracked_repos (name, pipeline) VALUES ('local-proof',0)");
  const insert = db.prepare("INSERT INTO items (repo,number,kind,state,title,url,author,created_at,updated_at) VALUES ('local-proof',?,'issue','OPEN',?,'https://example.invalid/item','local-proof',datetime('now'),datetime('now'))");
  insert.run(1,'Review a document'); insert.run(2,'Prepare an agenda');
  const cliResult = execFileSync(process.execPath,[cli,'rank'],{cwd:installed,env,encoding:'utf8',timeout:30_000,windowsHide:true});
  assert.match(cliResult,/2 open items ranked/);
  let job = db.prepare("SELECT * FROM jobs WHERE step='rank' ORDER BY id DESC LIMIT 1").get();
  assert.equal(job.state,'done',job.error);
  assert.equal(db.prepare('SELECT count(*) AS n FROM item_rank').get().n,2);
  assert.match(readFileSync(job.log_path,'utf8'), /2 open items ranked/);
  db.exec('DELETE FROM item_rank');
  const queued = execFileSync(process.execPath,[cli,'runner','enqueue','rank'],{cwd:installed,env,encoding:'utf8',timeout:30_000,windowsHide:true});
  assert.match(queued,/queued|job/);
  child = spawn(process.execPath,[cli,'runner','serve'],{cwd:installed,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output=''; child.stdout.on('data',chunk=>{output+=chunk}); child.stderr.on('data',chunk=>{output+=chunk});
  for(let count=0; count<200; count+=1){
    job=db.prepare("SELECT * FROM jobs WHERE step='rank' ORDER BY id DESC LIMIT 1").get();
    if(job.state==='done') break;
    if(job.state==='failed' || child.exitCode !== null) throw Error(`${job.error}\n${output}`);
    await setTimeout(100);
  }
  assert.equal(job.state,'done',output);
  assert.match(job.summary,/2 open items ranked/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM item_rank').get().n,2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM token_usage').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM jobs').get().n,2);
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  assert.ok(readFileSync(job.log_path,'utf8').includes('2 open items ranked'));
  console.log('Actual CLI and queued rank jobs independently spawned, completed and persisted two local item ranks. No model calls were recorded. SQLite quick_check passed.');
  await dashboardGate();
  if (existsSync(join(installed,'test/native-signin.test.ts'))) {
    const suites=['native-signin','server','auth-hardening','github-app','vault','api','visibility'].map(name=>join(installed,`test/${name}.test.ts`));
    const result=execFileSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...suites],{cwd:installed,env,encoding:'utf8',timeout:120_000,maxBuffer:16*1024*1024,windowsHide:true});
    assert.match(result,/# fail 0/);
    assert.match(result,/# skipped 0/);
    console.log('Production native sign-in and existing OAuth/security/API/visibility regression suites passed on Linux.');
  }
} finally {
  if(child && child.exitCode === null){ const exit=new Promise(done=>child.once('exit',done)); child.kill(); await exit; }
  db.close();
  rmSync(workspace,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
