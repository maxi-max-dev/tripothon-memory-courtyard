import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyNotebooks,createProject,addNote,organize,editDescription,confirmDescription,restoreNotebooks} from '../public/notebook-state.js';
const created=()=>createProject(emptyNotebooks(),{id:'place-one',title:'外婆的院子',era:'2005 年',name:'小林'},'2026-10-02T00:00:00Z');
const contributed=()=>addNote(created(),'place-one',{noteId:'note-one',body:'门边放着一盆薄荷。'},'2026-10-02T01:00:00Z');
test('local project requires identity and title; duplicate contribution is idempotent',()=>{
  assert.throws(()=>createProject(emptyNotebooks(),{id:'one',title:' ',name:'小林'}),/填写/);
  const s=contributed();assert.equal(s.projects[0].notes.length,1);
  assert.deepEqual(addNote(s,'place-one',{noteId:'note-one',body:'另一句话'}),s);
  assert.throws(()=>addNote(s,'missing',{noteId:'n',body:'test'}),/找不到/);
  assert.throws(()=>addNote(s,'place-one',{noteId:'n',body:' '}),/先写/);
});
test('new evidence blocks stale confirmation; old snapshot and sources remain immutable',()=>{
  let s=organize(contributed(),'place-one');assert.throws(()=>confirmDescription(s,'place-one',false),/勾选/);
  s=confirmDescription(s,'place-one',true,'2026-10-02T02:00:00Z');const old=structuredClone(s.projects[0].versions[0]);
  assert.equal(old.world,null);assert.equal(confirmDescription(s,'place-one',true).projects[0].versions.length,1);
  s=addNote(s,'place-one',{noteId:'note-two',body:'薄荷旁还有一张竹椅。'});
  assert.throws(()=>confirmDescription(s,'place-one',true),/新回忆/);
  assert.throws(()=>editDescription(s,'place-one','new'),/新回忆/);
  s=organize(s,'place-one');s=editDescription(s,'place-one','2005 年。薄荷旁的竹椅，颜色待确认。');s=confirmDescription(s,'place-one',true);
  assert.deepEqual(s.projects[0].versions[0],old);assert.equal(s.projects[0].versions.length,2);
  assert.equal(s.projects[0].versions[1].sources.length,2);assert.equal(s.projects[0].versions[1].world,null);
});
test('notebooks restore text and drafts, sanitize external images and world bindings',()=>{
  let s=confirmDescription(organize(contributed(),'place-one'),'place-one',true);s.drafts['place-one']='还没发出的句子';
  assert.deepEqual(restoreNotebooks(JSON.stringify(s)),s);
  s.projects[0].notes[0].photo='https://attacker.invalid/track';s.projects[0].versions[0].world='osmanthus-demo';
  const safe=restoreNotebooks(JSON.stringify(s));assert.equal(safe.projects[0].notes[0].photo,null);assert.equal(safe.projects[0].versions[0].world,null);
  assert.deepEqual(restoreNotebooks('{broken'),emptyNotebooks());
});
test('personal example notes stay separate from project evidence and archived worlds',()=>{
  const before=contributed(),after=addNote(before,'example',{noteId:'personal-one',body:'我记得一口井。'});
  assert.deepEqual(after.projects,before.projects);assert.equal(after.exampleNotes.length,1);
  assert.throws(()=>addNote(after,'example',{noteId:'bad-photo',body:'图',photo:'data:image/svg+xml,<script>'}),/照片格式/);
});
