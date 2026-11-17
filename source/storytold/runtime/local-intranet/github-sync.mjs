import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const run = promisify(execFile);
const validName = name => typeof name === 'string' && /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/.test(name);
const validPlacement = folder => typeof folder==='string' && /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}$/.test(folder) && folder.trim()===folder && !folder.endsWith('.');
const validBranch = name => typeof name==='string' && name.length>0 && !name.startsWith('-') && !/[~^:?*\[\]\\\x00-\x20\x7f]/.test(name) && !name.includes('..') && !name.includes('@{') && !name.endsWith('/');
const flags = hooks => ['-c', `core.hooksPath=${hooks}`, '-c', 'core.fsmonitor=false', '-c', 'core.symlinks=false', '-c', 'core.protectNTFS=true', '-c', 'core.longpaths=true', '-c', 'core.autocrlf=false', '-c', 'submodule.recurse=false', '-c', 'credential.helper='];

async function canonical(path) {
  if (relative(path, await realpath(path)) !== '') throw Error('A mirror path redirects outside its declared directory.');
  return path;
}

async function regularTree(directory) {
  await canonical(directory);
  for (const item of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,item.name);
    if(item.isDirectory()) await regularTree(path);
    else if(!item.isFile()) throw Error('Repository links require review before synchronization.');
  }
}

async function gitCredential(git) {
  return new Promise((accept, reject) => {
    const child = spawn(git, ['credential', 'fill'], {env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}, windowsHide:true, stdio:['pipe','pipe','ignore']});
    let body = '';
    child.stdout.on('data', chunk => { body += chunk; if(body.length > 32_768) child.kill(); });
    child.on('error', () => reject(Error('The existing Git credential helper could not start.')));
    child.on('close', code => {
      const credential = body.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
      if(code || !credential) reject(Error('The existing GitHub credential helper did not return usable authentication.'));
      else accept(credential);
    });
    child.stdin.end('protocol=https\nhost=github.com\n\n');
  });
}

async function api(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {redirect:'error',signal:AbortSignal.timeout(30_000),
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'ACCESS-Intranet-Repository-Sync'}});
  if(!response.ok) throw Error(`GitHub API returned HTTP ${response.status}.`);
  return response.json();
}

export async function ownedRepositories(owner, token) {
  if(!validName(owner)) throw Error('Invalid repository owner.');
  const identity = await api('/user',token);
  if(identity.login.toLowerCase() !== owner.toLowerCase()) throw Error('The authenticated GitHub account differs from the mirror owner.');
  const repos = [];
  for(let page=1;page<=100;page+=1){
    const batch=await api(`/user/repos?affiliation=owner&per_page=100&page=${page}`,token);
    if(!Array.isArray(batch)) throw Error('GitHub returned an invalid repository list.');
    for(const repo of batch){
      if(repo.owner?.login?.toLowerCase() !== owner.toLowerCase() || !validName(repo.name) || !validBranch(repo.default_branch)) throw Error('GitHub returned an unexpected repository identity.');
      repos.push({name:repo.name,branch:repo.default_branch,url:`https://github.com/${owner}/${repo.name}.git`});
    }
    if(batch.length<100) return repos;
  }
  throw Error('Repository pagination exceeded its bounded limit.');
}

export async function synchronizeRepository({git,root,repo,environment,hooks,seed,placement}) {
  if(!validName(repo.name) || !validBranch(repo.branch)) throw Error('Invalid repository name or default branch.');
  if(placement && !validPlacement(placement)) throw Error('Invalid repository placement.');
  const parent=placement?await canonical(dirname(root)):root;
  const target=join(parent,placement||repo.name);
  const command = (args,cwd=root,authenticate=['clone','fetch','ls-remote'].includes(args[0])) => {
    const env = {...environment};
    if(!authenticate) {
      delete env.INTRANET_GITHUB_CREDENTIAL;
      delete env.GIT_ASKPASS;
    }
    return run(git,[...flags(hooks),...args],{cwd,env,encoding:'utf8',timeout:1_800_000,maxBuffer:2*1024*1024,windowsHide:true});
  };
  let exists=true;
  try { await canonical(target); } catch(error) { if(error.code==='ENOENT') exists=false; else throw error; }
  if(!exists){
    const stage=join(root,`.clone-${randomUUID()}`);
    try {
      const refs=await command(['ls-remote',repo.url,`refs/heads/${repo.branch}`]);
      const remoteCommit=refs.stdout.trim().split(/\s+/)[0];
      if(refs.stdout.trim() && !/^[0-9a-f]{40,64}$/.test(remoteCommit)) throw Error('Invalid remote commit.');
      let seeded=false;
      const candidates=Array.isArray(seed)?seed:seed?[seed]:[];
      if(remoteCommit && candidates.length) {
        const stores=[];
        for(const candidate of candidates) {
          await canonical(candidate);
          await canonical(join(candidate,'.git'));
          const common=(await command(['rev-parse','--path-format=absolute','--git-common-dir'],candidate)).stdout.trim();
          stores.push(await canonical(join(common,'objects')));
        }
        await command(['init','--initial-branch',repo.branch,stage],root,false);
        await writeFile(join(stage,'.git','objects','info','alternates'),stores.join('\n')+'\n',{flag:'wx'});
        const present=await command(['cat-file','-e',`${remoteCommit}^{commit}`],stage).then(()=>true,()=>false);
        if(present) {
          // The new stage contains only the authoritative owned remote commit.
          // No seed working files or unpublished descendant commits are used.
          await command(['remote','add','origin',repo.url],stage);
          await command(['config','remote.origin.tagOpt','--no-tags'],stage);
          await command(['config',`branch.${repo.branch}.remote`,'origin'],stage);
          await command(['config',`branch.${repo.branch}.merge`,`refs/heads/${repo.branch}`],stage);
          await command(['update-ref',`refs/heads/${repo.branch}`,remoteCommit],stage);
          await command(['update-ref',`refs/remotes/origin/${repo.branch}`,remoteCommit],stage);
          await command(['checkout','--quiet','--force',repo.branch],stage);
          await command(['repack','-a'],stage);
          await rm(join(await canonical(join(stage,'.git')),'objects','info','alternates'));
          await command(['fsck','--connectivity-only'],stage);
          seeded=true;
        } else {
          await canonical(stage);
          await rm(stage,{recursive:true,force:true,maxRetries:3});
        }
      }
      const args=['clone','--no-local','--no-tags','--no-recurse-submodules','--depth=1','--single-branch'];
      if(refs.stdout.trim()) args.push('--branch',repo.branch);
      else args.push('--no-checkout');
      if(!seeded) await command([...args,repo.url,stage]);
      await canonical(stage);
      await canonical(join(stage,'.git'));
      if(!refs.stdout.trim()) await command(['symbolic-ref','HEAD',`refs/heads/${repo.branch}`],stage);
      const commit=refs.stdout.trim()?(await command(['rev-parse','HEAD'],stage)).stdout.trim():null;
      await rename(stage,target);
      return {name:repo.name,status:refs.stdout.trim()?'cloned':'empty',branch:repo.branch,...(commit?{commit}:{})};
    } finally {
      try { await canonical(stage); await rm(stage,{recursive:true,force:true,maxRetries:3}); }
      catch(error) { if(error.code!=='ENOENT') throw error; }
    }
  }
  await canonical(join(target,'.git'));
  await regularTree(target);
  const localConfig=(await command(['config','--local','--no-includes','--null','--list'],target)).stdout;
  const core=new Set(['core.repositoryformatversion','core.filemode','core.bare','core.logallrefupdates','core.symlinks','core.ignorecase','core.protectntfs','core.longpaths','core.autocrlf']);
  for(const item of localConfig.split('\0').filter(Boolean)) {
    const newline=item.indexOf('\n');
    const key=item.slice(0,newline).toLowerCase();
    const value=item.slice(newline+1);
    const branchRemote=/^branch\..+\.remote$/.test(key) && value==='origin';
    const branchMerge=/^branch\..+\.merge$/.test(key) && value.startsWith('refs/heads/') && validBranch(value.slice(11));
    const originUrl=key==='remote.origin.url' && value===repo.url;
    const originTags=key==='remote.origin.tagopt' && value==='--no-tags';
    const originFetch=key==='remote.origin.fetch' && /^\+refs\/heads\/(?:\*|[^\s:]+):refs\/remotes\/origin\/(?:\*|[^\s:]+)$/.test(value);
    const lfsFormat=key==='lfs.repositoryformatversion' && value==='0';
    if(!core.has(key) && !branchRemote && !branchMerge && !originUrl && !originTags && !originFetch && !lfsFormat && !['user.name','user.email'].includes(key)) {
      return {name:repo.name,status:'local-config-requires-review',configuration:key};
    }
  }
  if(relative(target,(await command(['rev-parse','--show-toplevel'],target)).stdout.trim()) !== '' ||
      relative(join(target,'.git'),(await command(['rev-parse','--path-format=absolute','--git-common-dir'],target)).stdout.trim()) !== '') {
    return {name:repo.name,status:'redirected-repository'};
  }
  const origin=(await command(['remote','get-url','origin'],target)).stdout.trim();
  if(origin !== repo.url) return {name:repo.name,status:'origin-conflict'};
  const branch=(await command(['symbolic-ref','--quiet','--short','HEAD'],target).catch(()=>({stdout:''}))).stdout.trim();
  if(branch !== repo.branch) return {name:repo.name,status:'different-branch',branch};
  if((await command(['status','--porcelain=v1','--untracked-files=normal'],target)).stdout) return {name:repo.name,status:'local-edits',branch};
  if(!(await command(['ls-remote','origin',`refs/heads/${repo.branch}`],target)).stdout.trim()) return {name:repo.name,status:'empty',branch};
  await command(['fetch','--no-tags','--no-recurse-submodules','origin',`+refs/heads/${repo.branch}:refs/remotes/origin/${repo.branch}`],target).catch(error => {
    if(error.code===128) throw Error('Git fetch could not verify the owned default branch.'); throw error;
  });
  try {
    await command(['merge','--ff-only','--no-edit','--no-stat',`refs/remotes/origin/${repo.branch}`],target);
  } catch { return {name:repo.name,status:'diverged',branch}; }
  const commit=(await command(['rev-parse','HEAD'],target)).stdout.trim();
  if(!/^[0-9a-f]{40,64}$/.test(commit)) throw Error('Git returned an invalid commit identifier.');
  return {name:repo.name,status:'current',branch,commit};
}

async function mirror(root,git,owner,seedRoot,placements) {
  const token=await gitCredential(git);
  const repos=await ownedRepositories(owner,token);
  const scratch=await mkdtemp(join(tmpdir(),'intranet-github-'));
  try {
    const hooks=join(scratch,'hooks'); await mkdir(hooks);
    const config=join(scratch,'gitconfig'); await writeFile(config,'');
    const helper=join(scratch,'askpass.cjs');
    await writeFile(helper,"process.stdout.write(process.argv.slice(2).join(' ').toLowerCase().includes('username')?'x-access-token':process.env.INTRANET_GITHUB_CREDENTIAL);\n");
    const askpass=join(scratch,'askpass.cmd');
    await writeFile(askpass,`@\"${process.execPath}\" \"${helper}\" %*\r\n`);
    const inherited=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/^(?:GIT_|GCM_|NODE_OPTIONS$|BASH_ENV$|ENV$)/i.test(name)));
    const environment={...inherited,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:config,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',GIT_ASKPASS:askpass,INTRANET_GITHUB_CREDENTIAL:token};
    const results=[];
    const seeds=new Map();
    if(seedRoot) {
      for(const entry of await readdir(seedRoot,{withFileTypes:true})) {
        if(!entry.isDirectory()) continue;
        const candidate=join(seedRoot,entry.name);
        try {
          await canonical(candidate);
          await canonical(join(candidate,'.git'));
          const origin=await run(git,[...flags(hooks),'-C',candidate,'config','--local','--no-includes','--get','remote.origin.url'],{env:{...environment,INTRANET_GITHUB_CREDENTIAL:'',GIT_ASKPASS:''},encoding:'utf8',windowsHide:true});
          if(repos.some(repo=>repo.url===origin.stdout.trim())) {
            const matches=seeds.get(origin.stdout.trim())||[];
            matches.push(candidate);
            seeds.set(origin.stdout.trim(),matches);
          }
        } catch { /* only a matching existing Git object store can seed a clone */ }
      }
    }
    async function synchronize(repo) {
      let result;
      try {
        result=await synchronizeRepository({git,root,repo,environment,hooks,seed:seeds.get(repo.url),placement:Object.hasOwn(placements,repo.name)?placements[repo.name]:undefined});
      }
      catch { result={name:repo.name,status:'failed'}; }
      console.log(`${result.name}: ${result.status}`);
      return result;
    }
    let next=0;
    async function worker() {
      while(next<repos.length) {
        const index=next;
        next+=1;
        results[index]=await synchronize(repos[index]);
      }
    }
    await Promise.all([worker(),worker()]);
    const report={schema:1,owner,checkedAt:new Date().toISOString(),repositories:results};
    const file=join(root,'sync-status.json');
    const pending=join(root,`.sync-status-${randomUUID()}.tmp`);
    await writeFile(pending,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    await rename(pending,file);
    if(results.some(item=>!['current','cloned','empty'].includes(item.status))) process.exitCode=1;
    console.log(`Checked ${results.length} owned repositories.`);
  } finally { await rm(scratch,{recursive:true,force:true,maxRetries:3}); }
}

async function main(){
  const {values}=parseArgs({options:{root:{type:'string'},git:{type:'string'},owner:{type:'string',default:'GOSTROGIS'},'seed-root':{type:'string'},placements:{type:'string'}}});
  if(!values.root || !values.git || !validName(values.owner)) throw Error('Supply --root, --git and the owner account.');
  const root=resolve(values.root); await mkdir(root,{recursive:true}); await canonical(root);
  const git=await canonical(resolve(values.git));
  const placements=values.placements?JSON.parse(await readFile(await canonical(resolve(values.placements)),'utf8')):{};
  if(!placements || Array.isArray(placements) || typeof placements!=='object' ||
      Object.entries(placements).some(([name,folder])=>!validName(name)||!validPlacement(folder)) ||
      new Set(Object.values(placements).map(folder=>folder.toLowerCase())).size !== Object.keys(placements).length) throw Error('Invalid or duplicate repository placements.');
  const identity=createHash('sha256').update(root.toLowerCase()).digest('hex');
  const lock=createServer(socket=>socket.destroy());
  const address=process.platform==='win32'?`\\\\.\\pipe\\intranet-github-${identity}`:join(tmpdir(),`intranet-github-${identity}.sock`);
  await new Promise((accept,reject)=>{lock.once('error',reject);lock.listen(address,accept)});
  try { await mirror(root,git,values.owner,values['seed-root']?await canonical(resolve(values['seed-root'])):undefined,placements); } finally { await new Promise(done=>lock.close(done)); }
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(()=>{console.error('Repository sync could not finish. Existing mirrors and local changes are preserved.');process.exitCode=1});
