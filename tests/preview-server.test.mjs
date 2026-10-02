import{test}from'node:test';
import assert from'node:assert/strict';
import{spawn}from'node:child_process';
const root=new URL('../',import.meta.url);
async function withServer(fn){
 const child=spawn(process.execPath,['scripts/serve-preview.mjs'],{cwd:root,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 try{const base=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Preview start timeout')),6000);child.on('error',reject);child.on('exit',code=>reject(Error('Preview exited '+code)));child.stdout.on('data',chunk=>{text+=chunk;const m=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});await fn(base);}finally{child.kill('SIGTERM');}
}
test('portable preview serves entry point and ranged video; empty files do not terminate server',async()=>withServer(async base=>{
 let r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/回到那儿/);
 r=await fetch(base+'/walkthrough.mp4',{headers:{range:'bytes=0-31'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'video/mp4');assert.equal((await r.arrayBuffer()).byteLength,32);
 r=await fetch(base+'/.nojekyll');assert.equal(r.status,200);assert.equal(await r.text(),'');
 r=await fetch(base+'/demo-state.js');assert.equal(r.status,200);
}));
test('portable preview rejects traversal, writes and unsatisfiable byte ranges',async()=>withServer(async base=>{
 let r=await fetch(base+'/%2e%2e%2fREADME.md');assert.equal(r.status,403);
 r=await fetch(base+'/demo.html',{method:'POST'});assert.equal(r.status,405);
 r=await fetch(base+'/walkthrough.mp4',{headers:{range:'bytes=999999999-'}});assert.equal(r.status,416);
}));
