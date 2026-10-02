import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cleanDiagnostics,diagnosticText,viewerError,explainViewerFailure,loadWorldManifest} from '../public/viewer-diagnostics.js';
import {parseViewerPayload} from '../public/spz-viewer.js';

test('viewer diagnostics expose only allowlisted nonidentifying fields',()=>{
  const raw={stage:'download',quality:'clear',manifestHTTP:200,assetHTTP:503,webgl1:true,instancing:false,workerAPI:true,bytesLoaded:512,url:'https://private.invalid/token',message:'secret user text',gpu:'private driver',userAgent:'private UA'};
  const text=diagnosticText(raw),d=cleanDiagnostics(raw);
  assert.equal(d.assetHTTP,503);assert.equal(d.webgl1,true);
  for(const key of ['url','message','gpu','userAgent'])assert.equal(Object.hasOwn(d,key),false);
  assert.doesNotMatch(text,/private|secret|https/);
  assert.equal(cleanDiagnostics({stage:'private',code:'private',assetHTTP:999,bytesLoaded:-1,webgl1:'yes'}).stage,'idle');
});

test('visible failure explanation never displays raw errors or URLs',()=>{
  const result=explainViewerFailure(new Error('private URL and user text'),{stage:'worker-start',workerAPI:true});
  assert.equal(result.code,'UNKNOWN');assert.equal(result.diagnostic.stage,'worker-start');
  assert.doesNotMatch(JSON.stringify(result),/private URL|user text/);
  const unsupported=explainViewerFailure(viewerError('WEBGL_UNAVAILABLE',{webgl1:false}));
  assert.equal(unsupported.canTryLight,false);assert.equal(unsupported.retryLabel,'重新检测支持');
  assert.equal(explainViewerFailure(viewerError('GPU_MEMORY')).canTryLight,true);
});

test('manifest loader distinguishes HTTP, malformed data and network failures',async t=>{
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  globalThis.fetch=async()=>new Response('',{status:503});
  await assert.rejects(loadWorldManifest('local'),e=>e.code==='MANIFEST_HTTP'&&e.diagnostic.manifestHTTP===503);
  globalThis.fetch=async()=>new Response('<html>not JSON</html>');
  await assert.rejects(loadWorldManifest('local'),{code:'MANIFEST_INVALID'});
  globalThis.fetch=async()=>{throw Error('private URL')};
  await assert.rejects(loadWorldManifest('local'),e=>e.code==='MANIFEST_NETWORK'&&!e.message.includes('private'));
  const abort=new AbortController();abort.abort(viewerError('LOAD_TIMEOUT',{stage:'manifest'}));
  await assert.rejects(loadWorldManifest('local',{signal:abort.signal}),{code:'LOAD_TIMEOUT'});
});

test('actual archived world payload validates and truncated or invalid data fails',async()=>{
  const file=await readFile(new URL('../public/worlds/osmanthus-demo/world.tsp',import.meta.url));
  const bytes=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),{meta,records}=parseViewerPayload(bytes);
  assert.equal(meta.renderedPoints,98304);assert.equal(records.length,meta.renderedPoints*14);
  for(const invalid of [new ArrayBuffer(0),new ArrayBuffer(16),bytes.slice(0,-4)])assert.throws(()=>parseViewerPayload(invalid),{code:'ASSET_INVALID'});
  const bad=bytes.slice(0),offset=records.byteOffset;new DataView(bad).setFloat32(offset,NaN,true);
  assert.throws(()=>parseViewerPayload(bad),{code:'ASSET_INVALID'});
});
