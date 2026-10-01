import test from 'node:test';
import assert from 'node:assert/strict';
import { quotationScene, validateScene, synthesizeScene, generateReference, buildWorldRequest, worldProvider, providerStatus } from '../lib/providers.mjs';
const evidence=[{id:'message-1',type:'message',author:'合成测试',text:'门是蓝色的。'}];
const env={ALLOW_PAID_PROVIDERS:'1',OPENAI_API_KEY:'synthetic-test-key',OPENAI_MODEL:'gpt-5.4-mini',OPENAI_IMAGE_MODEL:'gpt-image-1.5',WORLDLABS_MODEL:'marble-1.0-draft',WORLDLABS_API_KEY:'synthetic-world-key'};
const reply=data=>({ok:true,json:async()=>data});
test('paid providers are disabled by default, even with a key',()=>{
  assert.equal(providerStatus({...env,ALLOW_PAID_PROVIDERS:'0'}).agent.enabled,false);
  assert.equal(providerStatus({}).world.enabled,false);
});
test('quotation example preserves literal sources and declares limitations',()=>{
  const scene=quotationScene('测试院子',evidence);assert.deepEqual(scene.facts[0].sourceIds,['message-1']);assert.match(scene.description,/门是蓝色的/);assert.match(scene.assumptions[0],/未进行 AI/);
});
test('model claims require real source identifiers or an inference label',()=>{
  const scene=quotationScene('院子',evidence);assert.equal(validateScene(scene,evidence),scene);
  scene.facts[0].sourceIds=['invented'];assert.throws(()=>validateScene(scene,evidence),/来源/);
  scene.facts[0].sourceIds=[];assert.throws(()=>validateScene(scene,evidence),/来源/);
  scene.facts[0].certainty='inferred';assert.equal(validateScene(scene,evidence),scene);
});
test('Responses adapter uses schema, explicit photo IDs, no provider storage; no real network',async()=>{
  let sent;const scene=quotationScene('院子',evidence);
  const result=await synthesizeScene({title:'院子',evidence,photos:[{id:'photo-1',mime:'image/png',base64:'AA=='}],consent:true},{env,fetcher:async(url,options)=>{sent={url,...JSON.parse(options.body)};return reply({output:[{content:[{type:'output_text',text:JSON.stringify(scene)}]}]});}});
  assert.deepEqual(result,scene);assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.input[0].content[2].type,'input_image');assert.match(sent.input[0].content[1].text,/photo-1/);
});
test('missing consent and disabled credentials never invoke fetch',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error();};
  await assert.rejects(synthesizeScene({evidence,consent:false},{env,fetcher}),/确认/);
  await assert.rejects(generateReference({description:'x',consent:true},{env:{},fetcher}),/尚未启用/);assert.equal(calls,0);
});
test('multi-image request preserves unknown azimuth and private permission',()=>{
  const request=buildWorldRequest({title:'庭院',description:'秋天',media:[{id:'a'},{id:'b',azimuth:90}]});
  assert.equal(request.world_prompt.type,'multi-image');assert.equal('azimuth' in request.world_prompt.multi_image_prompt[0],false);assert.equal(request.world_prompt.multi_image_prompt[1].azimuth,90);assert.equal(request.permission.public,false);
  assert.equal(buildWorldRequest({title:'x',description:'y'}).world_prompt.type,'text');
});
test('World Labs upload → generation → poll supports documented media_asset_id',async()=>{
  const calls=[];const provider=worldProvider({env,fetcher:async(url,options)=>{calls.push({url,options});if(url.endsWith('prepare_upload'))return reply({media_asset:{media_asset_id:'media-1'},upload_info:{upload_url:'https://upload.example.test/image',upload_method:'PUT',required_headers:{'X-Test':'yes'}}});if(url.includes('upload.example.test'))return {ok:true};if(url.endsWith('worlds:generate'))return reply({operation_id:'op-1',done:false});return reply({done:true,response:{id:'world-1'}});}});
  const media=await provider.upload({extension:'png',bytes:Buffer.from('synthetic')},true);assert.equal(media.id,'media-1');const op=await provider.start({title:'院子',description:'测试',media:[media]},true);assert.equal(op.operation_id,'op-1');await provider.poll(op.operation_id);
  assert.equal(calls[1].options.method,'PUT');assert.equal('WLT-Api-Key' in calls[1].options.headers,false);assert.equal(JSON.parse(calls[2].options.body).world_prompt.image_prompt.media_asset_id,'media-1');
});
test('unknown network outcomes are surfaced without automatic POST retries',async()=>{
  let calls=0;const provider=worldProvider({env,fetcher:async()=>{calls++;throw Error('private upstream data');}});
  await assert.rejects(provider.start({title:'x',description:'y'},true),error=>error.code==='OUTCOME_UNKNOWN'&&!error.message.includes('private'));assert.equal(calls,1);
});
