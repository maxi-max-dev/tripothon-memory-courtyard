import {CASE_MESSAGES,WORLD_CATALOG,STORAGE_KEY,initialState,visibleMessages,describe,transition,restoreState} from './demo-state.js';
import {loadSpzViewer} from './spz-viewer.js';
import {mountNotebook} from './notebook.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=initialState(),storageWorks=true,viewer=null,controller=null,epoch=0,loading=false,shownVersion=null,toastTimer,highQuality=window.innerWidth>=900;
try{state=restoreState(localStorage.getItem(STORAGE_KEY));}catch{storageWorks=false;}
let currentPage='home';
const routeNames=['memories','scene','world','versions'];
const baseFor=n=>`./worlds/${WORLD_CATALOG[n].directory}/`;
const sources=ids=>ids.map(id=>{const m=CASE_MESSAGES.find(m=>m.id===id);return `<button class="source" data-source="${id}">${esc(m.name)} · 原话 ↗</button>`;}).join('');
function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));storageWorks=true;}catch{storageWorks=false;}}
function act(action,{scroll=false}={}){try{state=transition(state,action);persist();if(['start','step','select','confirm'].includes(action.type)){const hash='#courtyard/'+routeNames[state.step-1];if(location.hash!==hash)history.pushState(null,'',hash);currentPage='case';}render();if(scroll)$('experience').scrollIntoView({block:'start',behavior:'smooth'});}catch(e){notify(e.message);}}
function modal(title,body){$('dialog-title').textContent=title;$('dialog-body').innerHTML=body;$('dialog').showModal();}
$('close-dialog').onclick=()=>$('dialog').close();
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}});
function openSource(id){const m=CASE_MESSAGES.find(m=>m.id===id);if(!m)return;modal('回到那句话',`<p class="dialog-copy"><span class="tag neutral">合成案例 · ${esc(m.name)} · ${esc(m.time)}</span></p><blockquote>${esc(m.text)}</blockquote><p>这是本次 Demo 编写的口述材料，不是实际访谈或历史档案。场景描述引用这条材料；模型生成的画面不会反过来成为来源。</p>`);}
document.addEventListener('click',e=>{const b=e.target.closest('[data-source]');if(b)openSource(b.dataset.source);});
function render(){
  $('landing').hidden=currentPage!=='home';$('experience').hidden=currentPage!=='case';$('local-project').hidden=currentPage!=='local';$('app-breadcrumb').hidden=currentPage==='home';
  $('home-link').setAttribute('aria-current',currentPage==='home'?'page':'false');
  notebook.home();
  $('start-demo').textContent=state.versions.length?'继续上次的回忆 ↗':'一起回到那儿 ↗';
  $('save-status').textContent=storageWorks?'进度已保存在这个浏览器':'浏览器未允许保存；关闭后需重新体验';
  document.querySelectorAll('[data-step]').forEach(b=>{b.disabled=false;b.setAttribute('aria-current',Number(b.dataset.step)===state.step?'step':'false');});
  for(let i=1;i<=4;i++)$(`chapter-${i}`).hidden=state.step!==i;
  $('messages').innerHTML=visibleMessages(state).map(m=>`<article class="message"><span class="avatar">${m.initial}</span><div><div class="message-meta"><span>${m.name}</span><small>${m.time} · 合成回忆</small></div><div class="bubble">${esc(m.text)}</div>${m.id==='m4'?'<div class="message-tag"><span class="tag">年代分歧已澄清</span></div>':m.id==='m5'?'<div class="message-tag"><span class="tag">尺寸与细节已补充</span></div>':''}</div></article>`).join('');
  for(const [id,key]of[['clarify','clarified'],['measure','measured']]){$(id).disabled=state[key];$(id).querySelector('b').textContent=state[key]?'✓':'＋';}
  const scene=describe(state);
  $('questions').innerHTML=scene.questions.length?scene.questions.map(q=>`<div class="question"><span class="tag amber">${q.kind==='conflict'?'记忆有分歧':'缺少细节'}</span><strong>${q.text}</strong><div>${sources(q.sources)}</div></div>`).join(''):'<div class="question"><span class="tag">关键缺口已补全</span><p>2002 年的蓝门、8 × 6 米的小院。现在可以核对完整描述了。</p></div>';
  $('facts').innerHTML=scene.facts.map(f=>`<div class="fact"><p>${f.text}</p><div>${sources(f.sources)}</div></div>`).join('');
  $('assumptions').innerHTML=scene.assumptions.map(a=>`<li>${a}</li>`).join('');
  $('description').textContent=scene.questions.length?'已有桂花树、方木桌与木窗的线索。先补全年代和尺寸，再核对完整的空间描述。':scene.description;
  $('review-status').textContent=scene.questions.length?`还有 ${scene.questions.length} 处信息待核对。先保留分歧，别让模型替大家做决定。`:'关键缺口已补全。请逐条核对来源，确认之后，描述与来源会一起留下。';
  $('review-missing').innerHTML=scene.questions.length?'<button class="suggestion" id="back-to-memories">回到群聊补充信息 <b>←</b></button>':'';
  if($('back-to-memories'))$('back-to-memories').onclick=()=>act({type:'step',step:1},{scroll:true});
  $('confirm-one').disabled=!!scene.questions.length||!$('consent-one').checked;
  $('revision-detail').hidden=!state.bicycle;$('add-bicycle').disabled=state.bicycle;$('add-bicycle').textContent=state.bicycle?'这条回忆已加入 ✓':'加入这条合成回忆 ＋';
  $('confirm-two').disabled=!state.bicycle||!$('consent-two').checked;
  $('version-history').innerHTML=state.versions.map(v=>`<button class="history-item" data-version="${v.version}"><img src="${baseFor(v.version)}thumbnail.webp" alt="第${v.version}版生成结果"><span><strong>${v.version===1?'第一版 · 桂花又开了':'第二版 · 红色小自行车'}</strong><small>${v.version===1?'最初的确认快照 · 始终保留':'新增一条回忆 · 独立生成结果'}</small></span><span>↗</span></button>`).join('');
  $('version-history').querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>act({type:'select',version:Number(b.dataset.version)},{scroll:true}));
  $('world-switch').innerHTML=state.versions.map(v=>`<button data-version="${v.version}" aria-pressed="${state.activeVersion===v.version}">${v.version===1?'第一版':'第二版'}</button>`).join('');
  $('world-switch').querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>act({type:'select',version:Number(b.dataset.version)}));
  if(state.step===3&&currentPage==='case'){if(shownVersion!==state.activeVersion)prepareWorld();}
  else{stopWorld();shownVersion=null;}
  if(currentPage==='case'&&state.step===1&&!$('personal-notes').querySelector('textarea'))notebook.renderExample();
  $('next-version').textContent=state.versions.length===2?'查看两版的保存记录 →':'补上一条新回忆 →';
}
function stopWorld(){epoch++;controller?.abort();controller=null;viewer?.destroy();viewer=null;loading=false;}
function toolsReady(ready){for(const id of['world-tools','move-controls','world-hint'])$(id).hidden=!ready;}
function prepareWorld(){
  stopWorld();shownVersion=state.activeVersion;const world=WORLD_CATALOG[shownVersion],base=baseFor(shownVersion);
  $('world-title').textContent=world.title+'。';$('world-edition').textContent=world.subtitle+' · 已保存';
  $('world-cover').src=base+'thumbnail.webp';$('world-cover').hidden=false;$('world').hidden=true;$('world-shade').hidden=false;$('world-entry').hidden=false;$('world-failure').hidden=true;toolsReady(false);
  $('world-entry-title').innerHTML=shownVersion===1?'风一吹，<br>又像是那个下午。':'原来，<br>它一直停在那里。';
  $('world-entry-kicker').textContent=shownVersion===1?'秋日 · 江南小院':'新补充的回忆 · 红色小自行车';
  $('world-badge').textContent='World Labs · 真实生成 · 已保存';$('enter-world').textContent='走进院子 ↗';$('enter-world').disabled=false;
  $('world-size').textContent=highQuality?'清晰版约 12 MB · 可切换轻量版':'轻量版约 6 MB · 从已保存的文件打开';$('panorama-link').href=base+'panorama.png';$('world-status').textContent=shownVersion===1?'已保存的生成结果，反复浏览不再收费。':'第二版为重新生成；除新增自行车外，其他空间细节也可能变化。';
}
function failWorld(){stopWorld();toolsReady(false);$('world').hidden=true;$('world-cover').hidden=false;$('world-shade').hidden=false;$('world-entry').hidden=true;$('world-failure').hidden=false;$('world-badge').textContent='备用画面仍然可用';$('world-status').textContent='加载失败不会触发重新生成，也不会扣费。';}
async function enterWorld(){
  if(loading)return;stopWorld();loading=true;const token=epoch;controller=new AbortController();const currentController=controller,signal=controller.signal;const timeout=setTimeout(()=>currentController.abort(new Error('timeout')),45000);toolsReady(false);$('world').hidden=true;$('world-cover').hidden=false;$('world-shade').hidden=false;$('world-entry').hidden=false;
  $('enter-world').disabled=true;$('enter-world').textContent='正在打开院子…';$('world-failure').hidden=true;
  $('world-status').textContent='正在读取已保存的世界文件…';
  try{
    const base=baseFor(state.activeVersion),response=await fetch(base+'manifest.json',{signal});if(!response.ok)throw Error('manifest');const manifest=await response.json();
    if(token!==epoch)return;const old=$('world');old.replaceWith(old.cloneNode(false));
    const loaded=await loadSpzViewer($('world'),base+(highQuality&&manifest.viewerHighQualityFile?'world-hq.tsp':'world.tsp'),{signal,startPose:manifest.startPose,onFailure:()=>{if(token===epoch)failWorld();}});
    if(token!==epoch){loaded.destroy();return;}viewer=loaded;loading=false;$('world').hidden=false;$('world-cover').hidden=true;$('world-shade').hidden=true;$('world-entry').hidden=true;toolsReady(true);viewer.setExploring(true);
    $('world-badge').textContent='正在探索 · 已保存的真实世界';$('quality-toggle').textContent=highQuality?'切换轻量版':'清晰画质 · 约 12 MB';$('world-status').textContent=(highQuality?'清晰':'轻量')+' 3D 已载入 · 拖动环顾、方向按钮移动 · 浏览不调用生成接口';$('world-stage').scrollIntoView({block:'center',behavior:'smooth'});
  }catch(e){if(token===epoch)failWorld();}finally{clearTimeout(timeout);}
}
$('start-demo').onclick=()=>openCase();
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const step=Number(b.dataset.step);if(step>=3&&!state.versions.length){modal(step===3?'世界还在等待你的确认':'每一次确认，都会留下记录','<p class="dialog-copy">先核对场景里的来源与分歧，确认后就可以打开桂花小院。旧版会始终保留。</p><div class="dialog-actions"><button class="primary" id="go-review">去核对场景描述 →</button></div>');$('go-review').onclick=()=>{$('dialog').close();act({type:'step',step:2},{scroll:true});};return;}act({type:'step',step},{scroll:true});});
$('clarify').onclick=()=>{act({type:'clarify'});notify('蓝门属于 2002 年。原有分歧和补充来源都已保留。');};
$('measure').onclick=()=>{act({type:'measure'});notify('尺寸与桌上物件已补充到案例记录。');};
$('review-scene').onclick=()=>act({type:'step',step:2},{scroll:true});
$('consent-one').onchange=render;$('consent-two').onchange=render;
$('confirm-one').onclick=()=>act({type:'confirm',version:1,consent:$('consent-one').checked},{scroll:true});
$('confirm-two').onclick=()=>act({type:'confirm',version:2,consent:$('consent-two').checked},{scroll:true});
$('exit-world').onclick=()=>{prepareWorld();notify('已退出探索。这个世界与确认记录都已保留。');};$('world-back').onclick=()=>act({type:'step',step:2},{scroll:true});
$('enter-world').onclick=enterWorld;$('retry-world').onclick=enterWorld;$('reset-view').onclick=()=>viewer?.reset();
$('quality-toggle').onclick=()=>{highQuality=!highQuality;$('world-size').textContent=highQuality?'清晰版约 12 MB · 正在读取已保存文件':'轻量版约 6 MB · 正在读取已保存文件';enterWorld();};
$('show-panorama').onclick=()=>{stopWorld();toolsReady(false);$('world').hidden=true;$('world-cover').src=baseFor(state.activeVersion)+'panorama.png';$('world-cover').hidden=false;$('world-shade').hidden=false;$('world-entry').hidden=false;$('enter-world').disabled=false;$('enter-world').textContent='再次走进院子 ↗';$('world-badge').textContent='已保存的全景 · 可反复查看';$('world-status').textContent='全景来自这份真实生成结果。需要移动探索时，可重新打开 3D。';};
for(const b of document.querySelectorAll('[data-move]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);viewer?.move(b.dataset.move,true);});for(const name of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,()=>viewer?.move(b.dataset.move,false));}
$('next-version').onclick=()=>act({type:'step',step:4},{scroll:true});$('add-bicycle').onclick=()=>{act({type:'bicycle'});notify('新回忆已加入，第一版保持原样。');};
$('snapshot').onclick=()=>{const v=state.versions.find(v=>v.version===state.activeVersion);modal(`第 ${v.version} 版的确认快照`,`<p class="dialog-copy"><span class="tag">描述与来源一同保留</span></p><p>${v.scene.description}</p><p>${sources(v.sourceIds)}</p><p class="note">你在此浏览器的确认时间：${esc(new Date(v.confirmedAt).toLocaleString('zh-CN'))}。世界已提前生成；这条记录说明本次案例确认对应哪份世界，不伪造实时生成时间。</p>`);};
$('about').onclick=()=>modal('回到那儿 · 使用说明',`<p class="dialog-copy">把散落在几个人心里的旧地方，放回一个可以走进去的世界。</p><ul class="capability-list"><li>先体验桂花小院<small>三位示例人物的回忆、Agent 预设整理、来源核对与两个 World Labs 真实世界。浏览使用保存的世界文件，不发起新的生成。</small></li><li>也可以留下自己的地方<small>建立本机项目，添加文字和照片，逐条引用原话形成可编辑描述，确认后保留版本。照片不上传，整理不识图或判断冲突。</small></li><li>新增内容和旧版分开保留<small>你的补充不会改变示例世界；新项目的确认记录不关联示例世界。全新世界生成、在线 Agent 和远程多人同步尚未开放。</small></li><li>关闭页面后，还可以回来<small>草稿、照片和确认记录保存在当前浏览器。清理浏览器数据会移除它们；可以导出回忆备份。换设备不会自动同步。</small></li><li>3D 打不开时<small>可以切换轻量画质、重试，或打开真实生成全景。示例世界的隐藏结构属于模型想象，不是历史还原证据。</small></li></ul><p><a class="quiet-link" href="./submission.html">查看作品介绍与演示材料 →</a></p>`);
$('example-members').onclick=()=>modal('一起记得的人',`<p class="dialog-copy">这个小院的回忆由三位虚构人物组成，用来演示异步协作。这里没有伪造在线状态。</p>${[['禾','阿禾','记得桂花树与院子尺寸'],['满','小满','记得方桌、门的年代与自行车'],['莉','莉莉','记得蓝门、木窗和盆栽']].map(([i,n,d])=>`<div class="record-row"><span><span class="avatar">${i}</span>${n}</span><small>${d}</small></div>`).join('')}<p>你可以在「我的补充」里留下文字与照片，它们仅保存在本机，暂不纳入这两个示例世界。</p>`);
$('reset-demo').onclick=()=>{modal('从第一句回忆重新开始？','<p class="dialog-copy">重置的是这个浏览器里的合成案例进度。两个已保存的世界文件与多人后端数据都会保留。</p><div class="dialog-actions"><button id="do-reset" class="primary">重新体验案例</button><button id="cancel-reset" class="text-button">保留当前进度</button></div>');$('cancel-reset').onclick=()=>$('dialog').close();$('do-reset').onclick=()=>{state=initialState();state.started=true;$('consent-one').checked=false;$('consent-two').checked=false;persist();$('dialog').close();render();$('experience').scrollIntoView({behavior:'smooth'});};};
function openCase(){currentPage='case';if(!state.started)act({type:'start'},{scroll:true});else{location.hash='courtyard/'+routeNames[state.step-1];render();$('experience').scrollIntoView({block:'start',behavior:'smooth'});}}
const notebook=mountNotebook({notify,modal,closeModal:()=>$('dialog').close(),openExample:openCase});
$('new-project-top').onclick=notebook.newProject;$('new-project-hero').onclick=notebook.newProject;
function route(){
  notebook.leave();$('personal-notes').innerHTML='';const [kind,id,tab]=location.hash.slice(1).split('/');
  if(kind==='courtyard'){currentPage='case';state.started=true;const step=routeNames.indexOf(id)+1;if(step>0&&(step<3||state.versions.length))state.step=step;else if(step>=3)state.step=2;persist();render();}
  else if(kind==='place'){currentPage='local';render();notebook.route(id,tab);}
  else{currentPage='home';render();}
  window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('hashchange',route);
window.addEventListener('pagehide',()=>{stopWorld();notebook.leave();});
route();
