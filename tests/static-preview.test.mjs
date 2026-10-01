import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStaticPreview} from '../public/static-preview.js';
test('static preview only accepts synthetic additions, keeps old snapshots, blocks real modes and isolates pages',async()=>{
  const a=createStaticPreview(),b=createStaticPreview();const before=await a.api('/api/state');
  assert.equal(before.project.revision,2);assert.equal(before.jobs[0].scene_revision,1);
  await assert.rejects(a.api('/api/messages',{text:'private input'}),/不接收个人资料/);
  await assert.rejects(a.api('/api/agent/settings',{mode:'openai'}),/不会回退/);
  await assert.rejects(a.api('/api/worlds',{provider:'worldlabs'}),/没有 World Labs/);
  a.addSynthetic();const changed=await a.api('/api/state');assert.equal(changed.project.revision,3);assert.equal((await b.api('/api/state')).project.revision,2);
  const draft=await a.api('/api/scene',{mode:'example'});await a.api('/api/scene/confirm',{sceneId:draft.id});
  const world=await a.api('/api/worlds',{sceneId:draft.id,provider:'example'});assert.equal(world.version,2);assert.equal(world.scene_revision,3);
  const again=await a.api('/api/worlds',{sceneId:draft.id,provider:'example'});assert.equal(again.id,world.id);
  const after=await a.api('/api/state');assert.equal(after.jobs.length,2);assert.deepEqual(after.jobs[1],before.jobs[0]);assert.deepEqual((await a.api('/api/scenes/d1')).evidence,before.scene.evidence);
});
