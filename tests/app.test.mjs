import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let child,base,temp,project,owner,friend,sceneId,jobId,photoId;
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=';
async function launch(){return new Promise((resolve,reject)=>{child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',DATA_DIR:temp,ALLOW_PAID_PROVIDERS:'0',OPENAI_API_KEY:'',WORLDLABS_API_KEY:''},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',d=>errors+=d);child.stdout.on('data',d=>{const match=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){base=match[0];resolve();}});child.once('exit',code=>{if(code)reject(Error(errors));});});}
async function stop(){if(child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});}
function client(){let cookie='';return async(path,input)=>{const res=await fetch(base+path,{method:input?'POST':'GET',headers:{...(input?{'Content-Type':'application/json'}:{}),Cookie:cookie},body:input?JSON.stringify(input):undefined});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];const type=res.headers.get('content-type')||'';const data=type.includes('application/json')?await res.json():new Uint8Array(await res.arrayBuffer());return {status:res.status,data,cookie};};}
before(async()=>{temp=await mkdtemp(join(tmpdir(),'tripothon-test-'));await launch();owner=client();friend=client();});
after(async()=>{await stop();await rm(temp,{recursive:true,force:true});});
test('first session creates real persistent membership, synthetic authors are not members',async()=>{
  const result=await owner('/api/projects',{name:'测试发起人',title:'合成测试院子',seedExample:true});assert.equal(result.status,201);project=result.data.project;assert.equal(result.data.members.length,1);assert.equal(result.data.messages.length,3);assert(result.data.messages.every(m=>m.sample===1));assert.equal(result.data.providers.world.enabled,false);
});
test('another cookie session joins the same project; invitation and membership are enforced',async()=>{
  assert.equal((await friend(`/api/state?project=${project.id}`)).status,401);
  assert.equal((await friend('/api/join',{name:'测试朋友',projectId:project.id,invite:'wrong'})).status,403);
  const result=await friend('/api/join',{name:'测试朋友',projectId:project.id,invite:project.invite});assert.equal(result.status,200);assert.equal(result.data.members.length,2);
});
test('messages synchronize, deduplicate retries, and notify an independent SSE connection',async()=>{
  const state=await friend(`/api/state?project=${project.id}`);const controller=new AbortController();const events=await fetch(`${base}/api/events?project=${project.id}`,{headers:{Cookie:state.cookie},signal:controller.signal});const reader=events.body.getReader();await reader.read();
  const data={projectId:project.id,text:'合成回忆：东侧有一扇木窗。',clientId:'retryable-message-1'};const a=await owner('/api/messages',data);const b=await owner('/api/messages',data);assert.equal(a.data.id,b.data.id);
  const chunk=await reader.read();assert.match(new TextDecoder().decode(chunk.value),/event: update/);controller.abort();
  const result=await friend(`/api/state?project=${project.id}`);assert.equal(result.data.messages.filter(m=>m.text===data.text).length,1);
});
test('photo bytes persist and are visible only to members',async()=>{
  const result=await friend('/api/photos',{projectId:project.id,name:'synthetic.png',base64:png,caption:'合成样例，非私人照片'});assert.equal(result.status,201);photoId=result.data.id;
  const read=await owner(`/api/photos/${photoId}`);assert.equal(read.status,200);assert.deepEqual(Buffer.from(read.data),Buffer.from(png,'base64'));
  assert.equal((await client()(`/api/photos/${photoId}`)).status,401);
  assert.equal((await friend('/api/photos',{projectId:project.id,name:'not.png',base64:Buffer.from('<script>').toString('base64')})).status,400);
});
test('draft citations are real; unconfigured AI reports a hard blocker',async()=>{
  const s=(await owner(`/api/state?project=${project.id}`)).data;
  assert.equal((await owner('/api/scene',{projectId:project.id,revision:s.project.revision,mode:'openai',consent:true})).status,503);
  const draft=await owner('/api/scene',{projectId:project.id,revision:s.project.revision,mode:'example'});assert.equal(draft.status,201);sceneId=draft.data.id;
  const updated=(await friend(`/api/state?project=${project.id}`)).data;assert.equal(updated.scene.mode,'example');assert(updated.scene.data.facts.some(f=>f.sourceIds.includes(photoId)));
});
test('only owner can confirm; new evidence invalidates old confirmation and drafting revision',async()=>{
  assert.equal((await friend('/api/scene/confirm',{projectId:project.id,sceneId})).status,403);
  const prior=(await owner(`/api/state?project=${project.id}`)).data.project.revision;
  await friend('/api/messages',{projectId:project.id,text:'补充合成回忆：目标年代为 2002 年。',clientId:'later'});
  assert.equal((await owner('/api/scene/confirm',{projectId:project.id,sceneId})).status,409);
  assert.equal((await owner('/api/scene',{projectId:project.id,revision:prior,mode:'example'})).status,409);
  const s=(await owner(`/api/state?project=${project.id}`)).data;sceneId=(await owner('/api/scene',{projectId:project.id,revision:s.project.revision,mode:'example'})).data.id;
  assert.equal((await owner('/api/scene/confirm',{projectId:project.id,sceneId})).status,200);
});
test('confirmed sample world is saved once and shared; real World Labs is blocked',async()=>{
  assert.equal((await owner('/api/worlds',{projectId:project.id,sceneId,provider:'worldlabs',consent:true})).status,503);
  assert.equal((await friend('/api/worlds',{projectId:project.id,sceneId,provider:'example'})).status,403);
  const job=await owner('/api/worlds',{projectId:project.id,sceneId,provider:'example'});assert.equal(job.status,202);jobId=job.data.id;
  const twice=await owner('/api/worlds',{projectId:project.id,sceneId,provider:'example'});assert.equal(twice.data.id,jobId);
  const s=(await friend(`/api/state?project=${project.id}`)).data;assert.equal(s.jobs.length,1);assert.equal(s.jobs[0].status,'succeeded');assert.equal(s.jobs[0].world.kind,'local-courtyard');
});
test('new text preserves saved world and rejects generation until new confirmation',async()=>{
  await friend('/api/messages',{projectId:project.id,text:'想把门的描述补充为蓝绿色。',clientId:'revision'});
  assert.equal((await owner('/api/worlds',{projectId:project.id,sceneId,provider:'example'})).status,409);
  const s=(await owner(`/api/state?project=${project.id}`)).data;assert.equal(s.jobs[0].id,jobId);assert.notEqual(s.scene.revision,s.project.revision);
});
test('restart preserves separate sessions, messages, photo bytes, confirmation and saved world',async()=>{
  await stop();await launch();const s=(await owner(`/api/state?project=${project.id}`)).data;
  assert.equal(s.members.length,2);assert.equal(s.photos[0].id,photoId);assert.equal(s.jobs[0].id,jobId);assert.equal(s.jobs[0].world.kind,'local-courtyard');assert(s.confirmed.approved_at);
  assert.equal((await friend(`/api/state?project=${project.id}`)).status,200);
});
test('cross-origin writes are denied and malformed requests do not expose stack traces',async()=>{
  const res=await fetch(base+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:'{}'});assert.equal(res.status,403);
  const bad=await fetch(base+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(bad.status,400);assert.equal('stack' in await bad.json(),false);
});
async function waitAgent(predicate){for(let i=0;i<35;i++){const s=(await owner(`/api/state?project=${project.id}`)).data;if(predicate(s))return s;await new Promise(r=>setTimeout(r,100));}throw Error('Agent did not reach expected state');}
test('only owner enables chat Agent; unconfigured real mode never falls back',async()=>{
  assert.equal((await friend('/api/agent/settings',{projectId:project.id,mode:'mock'})).status,403);
  assert.equal((await owner('/api/agent/settings',{projectId:project.id,mode:'openai',consent:true})).status,503);
  const s=(await owner(`/api/state?project=${project.id}`)).data;assert.equal(s.chatAgent.mode,'off');assert.equal(s.agentPosts.length,0);
});
test('burst messages debounce to one mock run, shared across independent sessions without self-triggering',async()=>{
  assert.equal((await owner('/api/agent/settings',{projectId:project.id,mode:'mock'})).status,200);
  await Promise.all([owner('/api/messages',{projectId:project.id,text:'合成补充：门是蓝色的。',clientId:'burst-a'}),friend('/api/messages',{projectId:project.id,text:'合成补充：门是绿色的。',clientId:'burst-b'})]);
  const before=(await owner(`/api/state?project=${project.id}`)).data;assert.equal(before.chatAgent.status,'pending');
  const s=await waitAgent(s=>s.chatAgent.status==='idle');assert.equal(s.chatAgent.mockUsed,1);assert.equal(s.scene.mode,'mock');assert.equal(s.scene.approved_at,null);assert.equal(s.project.revision,before.project.revision);assert(s.agentPosts.some(p=>p.question_key));assert(s.agentPosts.every(p=>p.agent_mode==='mock'));assert.equal(s.jobs[0].id,jobId);
  const other=(await friend(`/api/state?project=${project.id}`)).data;assert.deepEqual(other.agentPosts,s.agentPosts);assert.equal(other.scene.id,s.scene.id);assert(s.scenes.length>=2);assert.equal(s.jobs[0].scene_revision,s.confirmed.revision);assert(s.scene.version>s.jobs[0].scene_version);
});
test('repeated questions deduplicate across revisions; Agent posts never enter source evidence',async()=>{
  const before=(await owner(`/api/state?project=${project.id}`)).data,questionKeys=before.agentPosts.filter(p=>p.question_key).map(p=>p.question_key);
  await friend('/api/messages',{projectId:project.id,text:'合成补充：桂花在秋天开。',clientId:'another-revision'});
  const s=await waitAgent(s=>s.chatAgent.status==='idle'&&s.chatAgent.mockUsed===2);const afterKeys=s.agentPosts.filter(p=>p.question_key).map(p=>p.question_key);
  assert.equal(new Set(afterKeys).size,afterKeys.length);for(const key of questionKeys)assert.equal(afterKeys.filter(k=>k===key).length,1);
  assert(s.scene.evidence.every(e=>!s.agentPosts.some(p=>p.id===e.id)));assert.equal(s.project.revision,before.project.revision+1);assert.equal(s.jobs.length,before.jobs.length);
});
test('same revision is never repeated, pause cancels pending processing, confirmed history remains readable',async()=>{
  await owner('/api/agent/settings',{projectId:project.id,mode:'off'});await owner('/api/agent/settings',{projectId:project.id,mode:'mock'});
  const once=await waitAgent(s=>s.chatAgent.status==='idle');assert.equal(once.chatAgent.mockUsed,2);
  await friend('/api/messages',{projectId:project.id,text:'合成补充：待会儿再讨论窗户。',clientId:'paused'});
  await owner('/api/agent/settings',{projectId:project.id,mode:'off'});await new Promise(r=>setTimeout(r,2100));
  const paused=(await owner(`/api/state?project=${project.id}`)).data;assert.equal(paused.chatAgent.mockUsed,2);assert.equal(paused.chatAgent.mode,'off');assert(paused.scene.revision<paused.project.revision);
  const snapshot=await friend(`/api/scenes/${paused.jobs[0].scene_id}`);assert.equal(snapshot.status,200);assert(snapshot.data.approved_at);assert.equal((await client()(`/api/scenes/${paused.jobs[0].scene_id}`)).status,401);
});
