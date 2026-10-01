import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,zstdCompressSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {decodeSpz,encodeViewerPayload} from '../lib/spz.mjs';
import {checkedAssetUrl,boundedAsset} from '../lib/world-assets.mjs';
function fixture(version=2){
  const header=Buffer.alloc(version===4?32:16);header.write('NGSP');header.writeUInt32LE(version,4);header.writeUInt32LE(1,8);header[13]=12;
  const pos=Buffer.alloc(9);[1,2,-3].forEach((n,i)=>pos.writeIntLE(n*4096,i*3,3));
  const rot=Buffer.alloc(version>=3?4:3,128);if(version>=3)rot.writeUInt32LE(3*2**30);
  const streams=[pos,Buffer.from([255]),Buffer.from([128,128,128]),Buffer.from([160,160,160]),rot];
  if(version<4)return gzipSync(Buffer.concat([header,...streams]));
  header[15]=streams.length;header.writeUInt32LE(32,16);const toc=Buffer.alloc(streams.length*16),compressed=streams.map((s,i)=>{const c=zstdCompressSync(s);toc.writeBigUInt64LE(BigInt(c.length),i*16);toc.writeBigUInt64LE(BigInt(s.length),i*16+8);return c;});return Buffer.concat([header,toc,...compressed]);
}
test('real MIT SPZ sample decodes finite centers/scales/rotations within point cap',()=>{
  const d=decodeSpz(readFileSync(new URL('../public/samples/hornedlizard.spz',import.meta.url)),{maxPoints:1000});
  assert.equal(d.meta.version,2);assert.equal(d.meta.sourcePoints,786233);assert.equal(d.records.length,14000);assert(d.records.every(Number.isFinite));
  for(let i=0;i<d.records.length;i+=14){assert(d.records[i+3]>0);assert(Math.abs(Math.hypot(...d.records.subarray(i+6,i+10))-1)<1e-6);}
});
test('gzip v2/v3 and Zstd v4 match documented positions, scales, alpha and quaternion',()=>{
  for(const version of [2,3,4]){const d=decodeSpz(fixture(version));assert.deepEqual([...d.records.slice(0,6)],[1,2,-3,1,1,1]);assert.equal(d.records[13],1);if(version>=3)assert.deepEqual([...d.records.slice(6,10)],[0,0,0,1]);}
});
test('Marble metric and 180-degree axis transforms apply to center, size and orientation',()=>{
  const d=decodeSpz(fixture(3),{semantics:{metric_scale_factor:2,ground_plane_offset:.5},marble:true});
  assert.deepEqual([...d.records.slice(0,6)],[2,-3.5,6,2,2,2]);assert.equal(Math.abs(d.records[6]),1);assert.equal(Math.abs(d.records[9]),0);
  const payload=encodeViewerPayload(d);assert.equal(payload.toString('ascii',0,4),'TSP1');const n=payload.readUInt32LE(4);assert.equal(JSON.parse(payload.toString('utf8',8,8+n)).sourcePoints,1);
});
test('invalid, oversized, truncated and unsupported SPZ fails closed',()=>{
  assert.throws(()=>decodeSpz(Buffer.alloc(16)),/SPZ/);assert.throws(()=>decodeSpz(fixture(4).subarray(0,75)),/SPZ/);
  const bad=fixture(4);bad[14]=2;assert.throws(()=>decodeSpz(bad),/扩展/);
  assert.throws(()=>decodeSpz(fixture(),{semantics:{metric_scale_factor:-1,ground_plane_offset:0}}),/尺度/);
});
test('saved-asset downloads restrict hosts, size, redirects and never send provider keys',async()=>{
  for(const bad of ['http://storage.googleapis.com/x','https://worldlabs.ai.evil.test/x','https://localhost/x','https://a@cdn.worldlabs.ai/x'])assert.throws(()=>checkedAssetUrl(bad));
  let options;const payload=await boundedAsset('https://cdn.worldlabs.ai/x',async(url,o)=>{options=o;return new Response(Buffer.from('test'));});assert.equal(payload.toString(),'test');assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);
  await assert.rejects(boundedAsset('https://cdn.worldlabs.ai/x',async()=>new Response('x',{headers:{'content-length':String(65*1024*1024)}})),/64 MB/);
});
