import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('saved MOCK World Labs asset enforces membership, renders binary payload and archives once',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'tripothon-asset-mock-')),countFile=join(temp,'counts.txt');let child,base,cookie='';
  try{
    await new Promise((resolve,reject)=>{child=spawn(process.execPath,['--import','./tests/mock-provider.mjs','server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',DATA_DIR:temp,MOCK_COUNTS_FILE:countFile,MOCK_WORLD_OUTCOME:'success',ALLOW_PAID_PROVIDERS:'1',WORLDLABS_API_KEY:'synthetic-not-a-key',WORLDLABS_MODEL:'marble-1.0-draft',PAID_TEST_MAX_WORLD_CALLS:'1',PAID_TEST_BUDGET_USD:'.20'},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',d=>errors+=d);child.stdout.on('data',d=>{const m=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(m){base=m[0];resolve();}});child.once('exit',code=>{if(code)reject(Error(errors));});});
    const call=async(path,data)=>{const r=await fetch(base+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r.json();};
    const s=await call('/api/projects',{name:'合成资产验收',seedExample:true}),projectId=s.project.id;
    const {id:sceneId}=await call('/api/scene',{projectId,revision:1,mode:'example'});await call('/api/scene/confirm',{projectId,sceneId});
    const {id:jobId}=await call('/api/worlds',{projectId,sceneId,provider:'worldlabs',consent:true});
    let current;for(let i=0;i<30;i++){current=await call(`/api/state?project=${projectId}`);if(current.jobs[0].status==='succeeded')break;await new Promise(r=>setTimeout(r,10));}assert.equal(current.jobs[0].status,'succeeded');
    const endpoint=`${base}/api/worlds/${jobId}/splats`;assert.equal((await fetch(endpoint)).status,401);
    for(let i=0;i<2;i++){const response=await fetch(endpoint,{headers:{Cookie:cookie}});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.toString('ascii',0,4),'TSP1');const size=bytes.readUInt32LE(4),meta=JSON.parse(bytes.toString('utf8',8,8+size));assert.equal(meta.renderedPoints,100000);assert.match(meta.coordinateFrame,/marble/);}
    assert.equal((await readFile(join(temp,'world-assets',`${jobId}.spz`))).length,18143098);
    assert.deepEqual((await readFile(countFile,'utf8')).trim().split('\n'),['world','asset']);
  }finally{if(child&&child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});await rm(temp,{recursive:true,force:true});}
});
