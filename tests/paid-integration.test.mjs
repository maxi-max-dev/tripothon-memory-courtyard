import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('HTTP duplicate clicks and restart make at most one MOCK call per paid provider',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'tripothon-paid-mock-')),countFile=join(temp,'counts.txt');let child,base,cookie='';
  const launch=()=>new Promise((resolve,reject)=>{
    child=spawn(process.execPath,['--import','./tests/mock-provider.mjs','server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',DATA_DIR:temp,MOCK_COUNTS_FILE:countFile,ALLOW_PAID_PROVIDERS:'1',OPENAI_API_KEY:'synthetic-not-a-key',OPENAI_MODEL:'gpt-5.4-mini',OPENAI_IMAGE_MODEL:'gpt-image-1.5',WORLDLABS_API_KEY:'synthetic-not-a-key',WORLDLABS_MODEL:'marble-1.0-draft',PAID_TEST_MAX_AGENT_CALLS:'1',PAID_TEST_MAX_IMAGE_CALLS:'1',PAID_TEST_MAX_WORLD_CALLS:'1',PAID_TEST_BUDGET_USD:'.35'},stdio:['ignore','pipe','pipe']});
    let errors='';child.stderr.on('data',d=>errors+=d);child.stdout.on('data',d=>{const m=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(m){base=m[0];resolve();}});child.once('exit',code=>{if(code)reject(Error(errors));});
  });
  const stop=()=>new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});
  const call=async(path,data)=>{const response=await fetch(base+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};};
  try{
    await launch();const {body:s}=await call('/api/projects',{title:'仅模拟费用请求',name:'合成测试',seedExample:true}),projectId=s.project.id;
    const draft={projectId,revision:1,mode:'openai',consent:true},results=await Promise.all([call('/api/scene',draft),call('/api/scene',draft),call('/api/scene',draft)]);
    assert.equal(results.filter(x=>x.status===201).length,1);const sceneId=results.find(x=>x.status===201).body.id;assert.equal((await call('/api/scene',draft)).body.id,sceneId);
    await call('/api/scene/confirm',{projectId,sceneId});
    const image={projectId,sceneId,consent:true};const images=await Promise.all([call('/api/reference',image),call('/api/reference',image)]);assert.equal(images.filter(x=>x.status===201).length,1);
    const referenceId=images.find(x=>x.status===201).body.id;assert.equal((await call('/api/reference',image)).body.id,referenceId);
    const world={projectId,sceneId,provider:'worldlabs',photoIds:[],consent:true};const jobs=await Promise.all([call('/api/worlds',world),call('/api/worlds',world)]);assert.equal(jobs[0].body.id,jobs[1].body.id);
    let current;for(let i=0;i<30;i++){current=(await call(`/api/state?project=${projectId}`)).body;if(current.jobs[0].status==='needs_review')break;await new Promise(r=>setTimeout(r,10));}assert.equal(current.jobs[0].status,'needs_review');
    await stop();await launch();assert.equal((await call('/api/scene',draft)).body.id,sceneId);assert.equal((await call('/api/reference',image)).body.id,referenceId);assert.equal((await call('/api/worlds',world)).body.id,jobs[0].body.id);
    await call('/api/messages',{projectId,text:'添加新版本也不会重置额度',clientId:'new'});assert.equal((await call('/api/scene',{...draft,revision:2})).body.code,'CALL_LIMIT');
    assert.deepEqual((await readFile(countFile,'utf8')).trim().split('\n'),['agent','image','world']);
  }finally{if(child&&child.exitCode===null)await stop();await rm(temp,{recursive:true,force:true});}
});
