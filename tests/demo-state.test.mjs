import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,transition,restoreState,describe,visibleMessages} from '../public/demo-state.js';
const ready=()=>transition(transition(initialState(),{type:'clarify'}),{type:'measure'});
test('case confirmation requires resolved gaps and explicit consent; world steps stay gated',()=>{
  const first=initialState();assert.equal(describe(first).questions.length,2);
  assert.throws(()=>transition(first,{type:'step',step:3}),/先核对/);
  assert.throws(()=>transition(first,{type:'confirm',version:1,consent:true}),/先补全/);
  assert.throws(()=>transition(ready(),{type:'confirm',version:1}),/勾选/);
  assert.throws(()=>transition(ready(),{type:'confirm',version:2,consent:true}),/先留下第一版/);
});
test('two versions keep independent source snapshots, old world and dates; double confirmation is idempotent',()=>{
  const one=transition(ready(),{type:'confirm',version:1,consent:true},'2026-10-01T00:00:00Z');
  const old=structuredClone(one.versions[0]);
  const pending=transition(one,{type:'bicycle'});assert.equal(pending.versions.length,1);assert.deepEqual(pending.versions[0],old);
  const two=transition(pending,{type:'confirm',version:2,consent:true},'2026-10-01T01:00:00Z');
  assert.deepEqual(two.versions[0],old);assert.equal(two.versions[1].sourceIds.includes('m6'),true);assert.equal(old.sourceIds.includes('m6'),false);
  assert.notEqual(two.versions[0].worldDirectory,two.versions[1].worldDirectory);
  assert.deepEqual(transition(two,{type:'confirm',version:2,consent:true}).versions,two.versions);
  assert.equal(transition(two,{type:'select',version:1}).activeVersion,1);assert.equal(one.bicycle,false);
});
test('restored progress preserves confirmed versions and pending additions, rejects forged assets and source text',()=>{
  let s=transition(ready(),{type:'start'});s=transition(s,{type:'confirm',version:1,consent:true},'2026-10-01T00:00:00Z');s=transition(s,{type:'bicycle'});s=transition(s,{type:'step',step:4});
  const restored=restoreState(JSON.stringify(s));assert.deepEqual(restored,s);
  s.versions[0].scene.description='<img src=x onerror=alert(1)>';s.versions[0].worldDirectory='https://attacker.invalid/';s.versions[0].sourceIds=['unknown'];
  const safe=restoreState(JSON.stringify(s));assert.equal(safe.versions[0].worldDirectory,'osmanthus-demo');assert.equal(safe.versions[0].sourceIds.includes('unknown'),false);assert.equal(safe.versions[0].scene.description.includes('<img'),false);
  assert.deepEqual(restoreState('{broken'),initialState());
});
test('each fact source exists in the visible synthetic evidence, with hidden future memories excluded',()=>{
  for(const s of[initialState(),ready(),transition(transition(ready(),{type:'confirm',version:1,consent:true}),{type:'bicycle'})]){
    const ids=new Set(visibleMessages(s).map(m=>m.id));for(const version of[1,2])for(const f of describe(s,version).facts)for(const id of f.sources)assert.ok(ids.has(id));
  }
  assert.equal(visibleMessages(initialState()).length,3);
  assert.throws(()=>transition(initialState(),{type:'bicycle'}),/先确认第一版/);
});
