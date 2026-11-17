import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const installed = resolve(process.argv[2]);
const workspace = mkdtempSync(join(resolve(process.argv[3]), 'rank-'));
const dbPath = join(workspace, 'rank.db');
const cli = join(installed, 'src/cli.ts');
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:AUTOCRAFT|CRAFT_AUTO|GH|GITHUB|ANTHROPIC|CLAUDE|JEV)_/.test(name)));
Object.assign(env, { AUTOCRAFT_DB: dbPath, AUTOCRAFT_RUNNER_LOGS: join(workspace,'logs'), AUTOCRAFT_LOCK_DIR: join(workspace,'locks'),
  AUTOCRAFT_WORKER_LISTEN:'127.0.0.1:0', AUTOCRAFT_HEALTH_LISTEN:'127.0.0.1:0', AUTOCRAFT_RUNNER_POLL_MS:'100' });
process.env.AUTOCRAFT_DB = dbPath;
const {connect} = await import(pathToFileURL(join(installed,'src/db.ts')));
const db = connect(dbPath);
let child;
try {
  db.exec("DELETE FROM tracked_repos; INSERT INTO tracked_repos (name, pipeline) VALUES ('local-proof',0)");
  const insert = db.prepare("INSERT INTO items (repo,number,kind,state,title,url,author,created_at,updated_at) VALUES ('local-proof',?,'issue','OPEN',?,'https://example.invalid/item','local-proof',datetime('now'),datetime('now'))");
  insert.run(1,'Review a document'); insert.run(2,'Prepare an agenda');
  const cliResult = execFileSync(process.execPath,[cli,'rank'],{cwd:installed,env,encoding:'utf8',timeout:120_000,windowsHide:true});
  assert.match(cliResult,/2 open items ranked/);
  let job = db.prepare("SELECT * FROM jobs WHERE step='rank' ORDER BY id DESC LIMIT 1").get();
  assert.equal(job.state,'done',job.error);
  assert.equal(db.prepare('SELECT count(*) AS n FROM item_rank').get().n,2);
  assert.match(readFileSync(job.log_path,'utf8'), /2 open items ranked/);
  db.exec('DELETE FROM item_rank');
  const queued = execFileSync(process.execPath,[cli,'runner','enqueue','rank'],{cwd:installed,env,encoding:'utf8',timeout:120_000,windowsHide:true});
  assert.match(queued,/queued|job/);
  child = spawn(process.execPath,[cli,'runner','serve'],{cwd:installed,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output=''; child.stdout.on('data',chunk=>{output+=chunk}); child.stderr.on('data',chunk=>{output+=chunk});
  for(let count=0; count<600; count+=1){
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
} finally {
  if(child && child.exitCode === null){ const exit=new Promise(done=>child.once('exit',done)); child.kill(); await exit; }
  db.close();
  rmSync(workspace,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
