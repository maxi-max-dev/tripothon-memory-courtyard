// Explicit fault injection tests; passing these does not certify every remote GPU.
import {chromium} from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4318/',dir='evidence/viewer-diagnostics';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[],errors=[],external=[];
let saved;
async function context(options={}){
  const c=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce',...options});
  await c.route('**/*',r=>{const u=r.request().url();if(!u.startsWith(base)&&!u.startsWith('data:')){external.push(u);return r.abort();}return r.continue();});
  c.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(18000);});return c;
}
async function diagnosis(p){return p.locator('#diagnostic-text').textContent();}
async function ready(p){await p.waitForFunction(()=>document.querySelector('#diagnostic-text')?.textContent.includes('状态：首帧已绘制'),null,{timeout:60000});assert.equal(await p.locator('#world').isVisible(),true);}
try{
  const c=await context(),p=await c.newPage();await p.goto(base);
  for(const selector of ['#start-demo','#clarify','#measure','#review-scene'])await p.locator(selector).click();
  await p.locator('#consent-one').check();await p.locator('#confirm-one').click();saved=await c.storageState();
  await p.locator('#enter-world').click();await ready(p);assert.match(await diagnosis(p),/首帧绘制：通过/);
  await p.screenshot({path:dir+'/normal-world-one.png'});
  await p.locator('#exit-world').click();await p.locator('#enter-world').click();await ready(p);
  results.push({scenario:'actual world one, clear quality, exit and re-enter',result:'ready'});
  await p.locator('#exit-world').click();await p.locator('#next-version').click();await p.locator('#add-bicycle').click();await p.locator('#consent-two').check();await p.locator('#confirm-two').click();await p.locator('#enter-world').click();await ready(p);
  await p.screenshot({path:dir+'/normal-world-two.png'});results.push({scenario:'actual world two, clear quality',result:'ready'});
  await p.evaluate(()=>document.querySelector('#world').getContext('webgl').getExtension('WEBGL_lose_context').loseContext());
  await p.locator('#world-failure').waitFor();assert.match(await diagnosis(p),/CONTEXT_LOST/);assert.equal(await p.locator('#try-light').isVisible(),true);
  await p.locator('#try-light').click();await ready(p);assert.match(await diagnosis(p),/画质：轻量/);results.push({scenario:'injected context loss, explicit light retry restores rendering',result:'CONTEXT_LOST → ready'});
  await c.close();

  const faults=[
    {name:'no WebGL',code:'WEBGL_UNAVAILABLE',pre:true,inject:()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...a){return kind==='webgl'?null:original.call(this,kind,...a);};}},
    {name:'missing instancing',code:'INSTANCING_UNAVAILABLE',pre:true,inject:()=>{const original=WebGLRenderingContext.prototype.getExtension;WebGLRenderingContext.prototype.getExtension=function(name){return name==='ANGLE_instanced_arrays'?null:original.call(this,name);};}},
    {name:'no Worker interface',code:'WORKER_UNAVAILABLE',pre:true,inject:()=>{window.Worker=undefined;}},
    {name:'Worker constructor denied',code:'WORKER_START_FAILED',pre:true,inject:()=>{window.Worker=class{constructor(){throw new DOMException('private URL or user text','SecurityError');}};}},
    {name:'Worker starts but no handshake',code:'WORKER_TIMEOUT',pre:true,inject:()=>{window.Worker=class{postMessage(){}terminate(){}};}},
    {name:'world HTTP 503',code:'ASSET_HTTP',pattern:'**/*.tsp',route:r=>r.fulfill({status:503,body:'unavailable'})},
    {name:'world network blocked',code:'ASSET_NETWORK',pattern:'**/*.tsp',route:r=>r.abort()},
    {name:'world malformed payload',code:'ASSET_INVALID',pattern:'**/*.tsp',route:r=>r.fulfill({status:200,body:'not a world'})},
    {name:'manifest HTTP 404',code:'MANIFEST_HTTP',pattern:'**/worlds/*/manifest.json',route:r=>r.fulfill({status:404,body:'missing'})},
    {name:'vertex shader rejection',code:'VERTEX_SHADER_FAILED',inject:()=>{const original=WebGLRenderingContext.prototype.getShaderParameter;WebGLRenderingContext.prototype.getShaderParameter=function(s,n){return n===this.COMPILE_STATUS?false:original.call(this,s,n);};}},
    {name:'program link rejection',code:'PROGRAM_LINK_FAILED',inject:()=>{const original=WebGLRenderingContext.prototype.getProgramParameter;WebGLRenderingContext.prototype.getProgramParameter=function(s,n){return n===this.LINK_STATUS?false:original.call(this,s,n);};}}
  ];
  for(const fault of faults){
    const c=await context({storageState:saved}),p=await c.newPage(),requests=[];p.on('request',r=>{if(r.url().endsWith('.tsp'))requests.push(r.url());});
    if(fault.inject)await c.addInitScript(fault.inject);if(fault.route)await c.route(fault.pattern,fault.route);
    await p.goto(base+'#courtyard/world');await p.locator('#enter-world').click();await p.locator('#world-failure').waitFor({timeout:30000});
    const d=await diagnosis(p);assert.match(d,new RegExp(fault.code));assert.doesNotMatch(d,/private URL|user text/);
    assert.equal(await p.locator('#world').isVisible(),false);assert.equal(await p.locator('#failure-panorama').isVisible(),true);
    if(fault.pre)assert.equal(requests.length,0);if(fault.code==='ASSET_HTTP')assert.match(d,/世界文件 HTTP：503/);
    await p.locator('#world-diagnostics summary').click();
    if(fault.code==='WEBGL_UNAVAILABLE'){
      await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await p.screenshot({path:dir+'/unsupported-mobile.png',fullPage:true});
      const popupPromise=c.waitForEvent('page');await p.locator('#failure-panorama').click();const popup=await popupPromise;await popup.waitForLoadState();await popup.waitForFunction(()=>document.images[0]?.naturalWidth===4608);
      await popup.close();await p.locator('#retry-world').click();await p.locator('#world-failure').waitFor();assert.match(await diagnosis(p),/WEBGL_UNAVAILABLE/);
    }
    if(fault.code==='ASSET_HTTP'){await c.unroute(fault.pattern,fault.route);await p.locator('#retry-world').click();await ready(p);}
    results.push({scenario:'injected '+fault.name,code:fault.code,modelRequests:requests.length,diagnostic:d});await c.close();
  }
  {
    const c=await context({storageState:saved}),p=await c.newPage();let release;const gate=new Promise(r=>release=r);
    await c.route('**/*.tsp',async r=>{await gate;await r.abort().catch(()=>{});});await p.goto(base+'#courtyard/world');await p.locator('#enter-world').click();
    await p.waitForFunction(()=>document.querySelector('#diagnostic-text').textContent.includes('阶段：下载世界文件'));await p.locator('#home-link').click();release();await p.waitForTimeout(250);
    assert.equal(await p.locator('#landing').isVisible(),true);assert.equal(await p.locator('#world-failure').isVisible(),false);results.push({scenario:'navigate away during model download',result:'canceled without stale failure'});await c.close();
  }
  {
    const c=await context(),p=await c.newPage();await p.goto(base+'generated-world.html');await p.locator('#enter').click();await ready(p);await p.locator('#show-cover').click();await p.locator('#enter').click();await ready(p);
    results.push({scenario:'standalone viewer and re-entry',result:'ready'});await c.close();
    const restricted=await context({viewport:{width:390,height:844}});await restricted.addInitScript(faults[0].inject);const q=await restricted.newPage();await q.goto(base+'generated-world.html');await q.locator('#enter').click();await q.locator('#retry').waitFor();assert.match(await diagnosis(q),/WEBGL_UNAVAILABLE/);assert.equal(await q.locator('#failure-panorama').isVisible(),true);
    assert.equal(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);results.push({scenario:'standalone viewer injected WebGL restriction',result:'WEBGL_UNAVAILABLE'});await restricted.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const report={base,environment:'Mac Chrome headless with explicitly enabled SwiftShader; fault cases are injected, not evidence of the cloud root cause',checks:results,errors,unexpectedRequests:external};await writeFile(dir+'/browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:results.length,errors,unexpectedRequests:external}));
}finally{await browser.close();}
