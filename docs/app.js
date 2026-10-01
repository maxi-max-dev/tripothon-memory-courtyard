import { createCourtyard } from './viewer.js';
import { loadSpzViewer } from './spz-viewer.js';
const isStatic=document.documentElement.dataset.preview==='static';
const preview=isStatic?(await import('./static-preview.js')).createStaticPreview():null;
let viewerAbort=null;
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search);
let projectId=params.get('project'),invite=params.get('invite'),state=null,viewer=null,eventStream=null,activeWorldId=null,loadedWorldId=null,exploring=false,toastTimer=null,refreshInFlight=null,refreshAgain=false,messageSignature='',sceneSignature='';
const time=value=>new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
function toast(text,error=false){$('toast').textContent=text;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function status(online){$('connection').classList.toggle('offline',!online);$('connection').querySelector('span').textContent=isStatic?'静态示例 · 无共享后端':online?'已同步 · 保存在本机':'连接中断 · 正在重连';}
async function api(path,body){
  if(preview)return preview.api(path,body);
  let response;try{response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});}catch{status(false);throw new Error('暂时连不上本地服务。你的输入仍保留，请恢复连接后重试。');}
  const result=await response.json();if(!response.ok)throw new Error(result.error||'操作没有完成，请重试。');return result;
}
async function busy(button,fn){if(button?.disabled)return;const old=button?.textContent;if(button){button.disabled=true;button.textContent='请稍候…';}try{await fn();}catch(e){toast(e.message,true);}finally{if(button){button.disabled=false;button.textContent=old;}if(state)renderActions();}}
function showModal(title,html){$('modal-title').textContent=title;$('modal-body').innerHTML=html;$('modal').showModal();}
function closeModal(){$('modal').close();}
$('close-modal').onclick=closeModal;
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
function tab(name){document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-selected',String(b.dataset.tab===name));});document.querySelectorAll('.work-grid>.panel').forEach(p=>p.classList.toggle('mobile-active',p.id===`${name}-panel`));}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));tab('chat');

async function initialize(){
  try{const session=await api(`/api/session?${new URLSearchParams({...(projectId?{project:projectId}:{}),...(invite?{invite}: {})})}`);status(true);
    if(session.joined){await refresh();connect();return;}
    $('welcome').hidden=false;
    if(session.user){$('name-input').value=session.user.name;$('name-input').readOnly=true;}
    if(session.project){$('join-heading').textContent='一起补全这个地方';$('join-description').textContent=`你受邀加入「${session.project.title}」。`;$('project-name-label').hidden=true;$('seed-label').hidden=true;$('join-submit').innerHTML='进入回忆空间 <span>→</span>';}
  }catch(error){$('fatal-message').textContent=error.message;$('fatal').hidden=false;}
}
$('reload-button').onclick=()=>location.reload();
$('join-form').onsubmit=async e=>{e.preventDefault();await busy($('join-submit'),async()=>{
  const result=await api(projectId?'/api/join':'/api/projects',projectId?{projectId,invite,name:$('name-input').value}:{name:$('name-input').value,title:$('title-input').value,seedExample:$('seed-input').checked});
  state=result;projectId=result.project.id;invite=result.project.invite;history.replaceState(null,'',`/?${new URLSearchParams({project:projectId,invite})}`);render();connect();
});};
async function refresh(){
  if(refreshInFlight){refreshAgain=true;return refreshInFlight;}
  refreshInFlight=(async()=>{do{refreshAgain=false;state=await api(`/api/state?project=${encodeURIComponent(projectId)}`);render();}while(refreshAgain);})().finally(()=>refreshInFlight=null);return refreshInFlight;
}
function connect(){if(preview){preview.connect(()=>refresh());return;}eventStream?.close();eventStream=new EventSource(`/api/events?project=${encodeURIComponent(projectId)}`);eventStream.addEventListener('connected',()=>{status(true);refresh().catch(()=>status(false));});eventStream.addEventListener('update',()=>refresh().catch(()=>status(false)));eventStream.onerror=()=>status(false);}
window.addEventListener('online',()=>{if(projectId)refresh().catch(()=>{});});
window.addEventListener('pagehide',()=>{eventStream?.close();viewer?.destroy();});

function render(){
  $('welcome').hidden=true;$('fatal').hidden=true;$('app').hidden=false;$('project-title').textContent=state.project.title;document.title=`${state.project.title} · Tripothon`;
  $('people').innerHTML=state.members.map((m,i)=>`<span class="avatar ${i%2?'peach':'green'}" title="${esc(m.name)}${m.role==='owner'?' · 发起人':''}">${esc([...m.name][0])}</span>`).join('')+`<span class="small">${state.members.length} 人一起记得</span>`;
  $('member-count').textContent=`${state.members.length} 位真实参与者`;
  const msgKey=state.messages.map(x=>x.id).join(',')+state.photos.map(x=>x.id).join(',')+(state.agentPosts||[]).map(x=>x.id).join(',');
  if(msgKey!==messageSignature){const box=$('messages'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<100;renderMessages();if(nearBottom||!messageSignature)box.scrollTop=box.scrollHeight;messageSignature=msgKey;}
  renderPhotos();renderScene();renderWorld();renderActions();renderAgent();
  $('conversation-note').textContent=`你是${state.user.name}${state.user.role==='owner'?' · 发起人':''}。消息与照片会同步给项目成员。`;
  if(isStatic){$('member-count').textContent='3 个合成角色 · 非真实在线成员';$('people').querySelector('.small').textContent='合成案例';$('conversation-note').textContent='只在当前页面内演示；刷新会重置，不跨浏览器或设备同步。';$('gallery-add').onclick=staticUploadNotice;$('edit-scene').hidden=true;$('invite-button').textContent='分享静态预览';}
}
function renderMessages(){
  const entries=[...state.messages.map(m=>({...m,kind:'message'})),...(state.agentPosts||[]).map(m=>({...m,kind:'agent',author:m.agent_mode==='mock'?'模拟助手 · 非 AI':'记忆助手'})),...state.photos.map(p=>({...p,kind:'photo',author:state.members.find(m=>m.id===p.user_id)?.name||'参与者'}))].sort((a,b)=>a.created_at.localeCompare(b.created_at));
  $('messages').innerHTML=entries.length?entries.map(m=>`<article class="message ${m.user_id===state.user.id?'own':''}" id="source-${esc(m.id)}"><span class="avatar ${m.user_id===state.user.id?'green':'peach'}">${esc([...(m.author||'友')].slice(m.sample?5:0)[0]||'忆')}</span><div class="message-body"><div class="message-meta"><span>${esc(m.author)}</span>${m.sample?'<span class="sample-label">合成示例</span>':''}<time>${time(m.created_at)}</time></div><div class="bubble">${m.kind==='photo'?`<button class="photo-thumb message-photo-button" data-photo="${esc(m.id)}" aria-label="查看 ${esc(m.name)}"><img src="./api/photos/${encodeURIComponent(m.id)}" alt="${esc(m.caption||m.name)}"></button>${esc(m.caption||m.name)}`:esc(m.text)}</div></div></article>`).join(''):'<p class="empty-copy">你记得的第一件事是什么？<br>从一段话开始吧。</p>';
  $('messages').querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>openPhoto(b.dataset.photo));
  for(const post of state.agentPosts||[]){const article=$(`source-${post.id}`);article?.classList.add('agent-message');const bubble=article?.querySelector('.bubble');if(bubble&&post.sourceIds?.length){const sources=document.createElement('div');sources.innerHTML=post.sourceIds.map(id=>`<button class="source-link" data-source="${esc(id)}">查看来源</button>`).join(' ');sources.querySelectorAll('button').forEach(b=>b.onclick=()=>openSource(b.dataset.source));bubble.append(sources);}}
}
function openSource(id){if(state.photos.some(p=>p.id===id)){openPhoto(id);return;}tab('chat');const message=$(`source-${id}`);message?.scrollIntoView({block:'center',behavior:'smooth'});message?.classList.add('highlight');setTimeout(()=>message?.classList.remove('highlight'),2500);}
function renderAgent(){
  const a=state.chatAgent||{mode:'off',status:'off',mockUsed:0,mockLimit:10},label={off:'已关闭',pending:'等待合并新消息',running:'正在整理',idle:'等待新回忆',blocked:'已阻塞',limited:'已达上限',needs_review:'结果待核对',completed_once:'本次真实整理已完成'};
  $('chat-agent-label').textContent=`群聊助手 · ${a.mode==='mock'?'模拟规则，非 AI':a.mode==='openai'?'真实 AI':label[a.status]||'已关闭'}`;
  $('chat-agent-status').textContent=a.last_error||(a.mode==='mock'?`${label[a.status]||a.status} · 已用 ${a.mockUsed}/${a.mockLimit} 次 · 静默 1.8 秒后整理`:a.mode==='openai'?'一次整理后自动暂停；不会生成图片或世界。':'由发起人开启；不会自动生成图片或世界。');
  $('agent-control').disabled=state.user.role!=='owner';
}
$('agent-control').onclick=()=>{
  const a=state.chatAgent;showModal('群聊助手设置',`<p class="modal-copy">开启后，连续新消息会合并到一次整理；相同资料不会并发重复处理。重复问题按文字去重。随时暂停，历史消息和世界会保留。</p><label class="small">处理方式<select id="agent-mode"><option value="off">关闭 / 暂停</option><option value="mock">模拟规则 · 非真实 AI · 不识别图片</option><option value="openai" ${state.providers.agent.enabled?'':'disabled'}>真实 AI · ${state.providers.agent.enabled?'单次测试，使用已授权额度':'未配置，明确阻塞'}</option></select></label><p class="modal-copy">模拟：静默 1.8 秒触发，每个项目最多 10 次（已用 ${a.mockUsed} 次）。<br>真实：发送本项目文字和最多 4 张照片；受全局付费账本限制，当前剩余 ${a.realRemaining} 次，一次完成后自动关闭。</p><label class="checkbox-label" id="agent-consent-row" hidden><input id="agent-consent" type="checkbox"><span>我确认把本项目资料发给 OpenAI，并使用已授权的 API 额度。</span></label><div class="scene-notice">群聊助手只保存待确认描述并提出问题。参考图与 World Labs 必须另行确认，聊天不会触发付费世界生成。</div><div class="modal-actions"><button id="save-agent" class="button primary">保存助手设置</button></div>`);
  $('agent-mode').value=a.mode;const update=()=>{const real=$('agent-mode').value==='openai';$('agent-consent-row').hidden=!real;$('save-agent').disabled=real&&!$('agent-consent').checked;};$('agent-mode').onchange=update;$('agent-consent').onchange=update;update();
  $('save-agent').onclick=()=>busy($('save-agent'),async()=>{await api('/api/agent/settings',{projectId,mode:$('agent-mode').value,consent:$('agent-consent').checked});closeModal();await refresh();toast('助手设置已保存。');});
};
function renderPhotos(){
  $('photo-count').textContent=`${state.photos.length} 张照片`;
  $('photo-gallery').innerHTML=state.photos.map(p=>`<button class="photo-thumb" data-photo="${esc(p.id)}" aria-label="查看 ${esc(p.name)}"><img src="./api/photos/${encodeURIComponent(p.id)}" alt="${esc(p.caption||p.name)}"><span>${esc(p.caption||p.name)}</span></button>`).join('')+`<button class="add-photo" id="gallery-add"><b>＋</b>添加照片</button>${state.photos.length?'':'<span class="photo-empty">没有照片也没关系。<br>用文字描述，让记忆先有形状。</span>'}`;
  $('photo-gallery').querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>openPhoto(b.dataset.photo));$('gallery-add').onclick=()=>$('photo-input').click();
}
function renderScene(){
  const scene=state.scene,key=JSON.stringify([scene?.id,scene?.approved_at,state.project.revision,state.references.map(x=>x.id)]);if(key===sceneSignature)return;sceneSignature=key;
  if(!scene){$('scene-content').innerHTML='<p class="empty-copy">每一处细节，都应有一个来处。<br>整理大家的回忆，确认细节，再一起走进去。</p>';return;}
  const stale=scene.revision!==state.project.revision;
  const label=scene.mode==='example'?'本地引用示例：逐条引用文字，未调用 AI，也未识别照片或判断冲突。':scene.mode==='mock'?'模拟助手 · 非真实 AI：引用原话，固定关键词演示追问，未识别照片。':scene.mode==='manual'?'发起人手动编辑：保留原始材料，引用未由 AI 重新核验。':'真实 AI 整理：来源引用已校验，内容仍需发起人确认。';
  const sources=scene.evidence;
  const sourceLinks=ids=>ids.map(id=>{const idx=sources.findIndex(x=>x.id===id);return `<button class="source-link" data-source="${esc(id)}">来源 ${idx+1}</button>`;}).join(' ');
  $('scene-content').innerHTML=`<div class="scene-notice">${stale?'有新回忆加入，请重新整理后确认。<br>':''}${label}</div><div class="scene-description">${esc(scene.data.description)}</div><div class="evidence-title">↳ 可追溯的细节 <span class="small">${scene.data.facts.length} 条</span></div>${scene.data.facts.map(f=>`<div class="fact"><span class="${f.certainty==='inferred'?'inferred':''}">${f.certainty==='inferred'?'[推测] ':''}${esc(f.text)}</span><span>${sourceLinks(f.sourceIds)}</span></div>`).join('')}<div class="evidence-title">? ${scene.mode==='example'?'示例核对清单':'待确认问题'}</div>${scene.data.questions.map(q=>`<div class="question">${q.kind==='conflict'?'分歧 · ':''}${esc(q.text)} ${sourceLinks(q.sourceIds)}</div>`).join('')}${scene.data.assumptions.map(a=>`<p class="assumption">＊ ${esc(a)}</p>`).join('')}${scene.approved_at?`<div class="evidence-title">✓ 已由发起人确认 · ${time(scene.approved_at)}</div><button class="button outline" id="reference-button" ${state.providers.image.enabled&&state.user.role==='owner'&&!stale?'':'disabled'}>生成参考图${state.providers.image.enabled?'':' · 未连接'}</button>`:''}${state.references.filter(r=>r.scene_id===scene.id).map(r=>`<div class="scene-notice">AI 参考图 · 基于口述的推测，非历史照片</div><img class="modal-photo" src="./api/references/${encodeURIComponent(r.id)}" alt="AI 生成的空间参考图，内容属于推测">`).join('')}`;
  $('scene-content').querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{const p=state.photos.find(p=>p.id===b.dataset.source);if(p){openPhoto(p.id);return;}tab('chat');const message=$(`source-${b.dataset.source}`);message?.scrollIntoView({block:'center',behavior:'smooth'});message?.classList.add('highlight');setTimeout(()=>message?.classList.remove('highlight'),2500);});
  if($('reference-button'))$('reference-button').onclick=()=>referenceDialog();
}
function renderActions(){
  if(!state)return;const scene=state.scene,stale=scene&&scene.revision!==state.project.revision,owner=state.user.role==='owner';
  $('scene-status').textContent=!scene?'等待整理':stale?'有新的回忆':scene.approved_at?'已确认':'待发起人确认';$('scene-status').classList.toggle('warn',!!stale);
  $('agent-status').textContent=state.providers.agent.enabled?'真实 AI 已配置 · 发送资料前需确认':'真实 AI 未连接 · 可查看引用示例';
  $('draft-button').disabled=state.draftBusy||!(state.messages.length+state.photos.length);$('draft-button').textContent=state.draftBusy?'正在整理…':scene?'更新引用示例':'预览整理示例';
  $('ai-button').disabled=!state.providers.agent.enabled||state.draftBusy;
  $('confirm-button').disabled=!owner||!scene||stale||!!scene.approved_at;
  $('confirm-button').innerHTML=scene?.approved_at&&!stale?'✓ 已确认描述':'确认这份描述 <span>→</span>';
  $('edit-scene').hidden=isStatic||!owner||!scene||stale;
  $('generate-button').disabled=!owner||!scene?.approved_at||stale;
  $('generation-hint').textContent=!owner?'发起人确认并生成后，所有参与者都能查看同一保存结果。':stale?'新增回忆会保留旧世界；请先更新并确认描述。':scene?.approved_at?'已确认。可保存本地示例；真实 World Labs 仍需接入。':'发起人确认描述后，可以保存并探索示例世界。';
  const active=state.jobs.find(j=>['queued','submitting','running','failed','needs_review'].includes(j.status));$('job-note').hidden=!active;
  if(active)$('job-note').textContent=active.error||'任务已保存，正在处理。关闭页面不会删除任务记录。';
}
function ensureViewer(){if(viewer)return;try{viewer=createCourtyard($('world-canvas'),()=>{$('viewer-fallback').hidden=false;toast('3D 暂时无法加载，已切换到示意图。',true);});$('viewer-fallback').hidden=true;}catch{$('viewer-fallback').hidden=false;$('explore-button').disabled=true;}}
function renderWorld(){
  const saved=state.jobs.filter(j=>j.status==='succeeded'&&j.world);
  const job=saved.find(j=>j.id===activeWorldId)||saved[0];if(job)activeWorldId=job.id;
  renderVersions(job);
  $('world-status').textContent=job?(job.provider==='example'?(isStatic?'本页示例 · 刷新重置':'本地示例 · 已保存'):'真实世界 · 已保存清单'):'尚未保存世界';
  $('world-caption').textContent=job?`${job.world.title||state.project.title} · ${time(job.created_at)} 保存`:'一座院子，等待大家一起补全';
  $('world-provenance').textContent=job?job.world.provenance:'原创程序示例，未由聊天或 World Labs 生成。';
  $('scene-label').textContent=job?(job.provider==='example'?'已保存的本地程序场景':'World Labs · SPZ 轻量预览'):'本地程序场景 · 预览';
  if(job?.id===loadedWorldId||(!job&&loadedWorldId==='preview'))return;
  viewerAbort?.abort();viewer?.destroy();viewer=null;
  // A fresh canvas also resets lost contexts and GL attribute state between renderers.
  const oldCanvas=$('world-canvas');oldCanvas.replaceWith(oldCanvas.cloneNode(false));
  loadedWorldId=job?.id||'preview';$('world-view').querySelector('.external-fallback')?.remove();
  $('viewer-fallback').querySelector('img').src='./courtyard.svg';$('world-canvas').hidden=false;
  if(!job||job.world.kind==='local-courtyard'){
    ensureViewer();viewer?.load(job?.world);$('world-overlay').hidden=exploring;$('world-control').hidden=exploring;$('explore-button').disabled=!viewer;
  }else{
    setExploring(false);$('world-overlay').hidden=true;$('world-control').hidden=true;$('viewer-fallback').hidden=false;
    const thumbnail=job.world.assets?.thumbnail_url;if(/^https:\/\//.test(thumbnail||''))$('viewer-fallback').querySelector('img').src=thumbnail;
    const marbleUrl=/^https:\/\/marble\.worldlabs\.ai\//.test(job.world.marbleUrl||'')?job.world.marbleUrl:null;
    const el=document.createElement('div');el.className='external-fallback';el.innerHTML=`<h3>正在打开已生成的空间</h3><p>首次读取并归档 SPZ；失败时保留缩略图与探索链接。</p>${marbleUrl?`<a href="${esc(marbleUrl)}" target="_blank" rel="noopener noreferrer">在 Marble 中探索 ↗</a>`:''}`;$('world-view').append(el);
    const controller=new AbortController();viewerAbort=controller;
    loadSpzViewer($('world-canvas'),`/api/worlds/${encodeURIComponent(job.id)}/splats`,{signal:controller.signal,onStatus:message=>{if(!controller.signal.aborted)$('scene-label').textContent=message;},onFailure:message=>{if(!controller.signal.aborted){$('viewer-fallback').hidden=false;toast(message,true);}}}).then(result=>{
      if(controller.signal.aborted){result.destroy();return;}viewer=result;el.remove();$('viewer-fallback').hidden=true;$('world-control').hidden=false;$('explore-button').disabled=false;
    }).catch(error=>{if(controller.signal.aborted)return;el.querySelector('h3').textContent='SPZ 暂时无法显示';el.querySelector('p').textContent=error.message;$('viewer-fallback').hidden=false;});
  }
}
function renderVersions(job){
  const s=state.scene,c=state.confirmed,r=state.project.revision;
  $('version-strip').innerHTML=[['现有资料',`r${r}`,`${state.messages.length} 条回忆 · ${state.photos.length} 张照片`],['最新描述',s?`D${s.version} · r${s.revision}`:'尚未整理',s?(s.revision!==r?`还有 ${r-s.revision} 次资料更新待整理`:s.approved_at?'已确认':'待发起人确认'):'等待资料整理'],['确认快照',c?`D${c.version} · r${c.revision}`:'尚未确认',c?'确认的是当时的描述与来源':'发起人核对后确认'],['正在查看',job?`W${job.version} ← D${job.scene_version}`:'程序场景预览',job?`基于 r${job.scene_revision} · ${job.provider==='example'?'固定示例':'World Labs'}`:'尚未生成或保存世界']].map(([label,value,note])=>`<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  let pending='尚未保存世界。当前是固定的原创程序院子预览。';
  if(job){const reasons=[];if(r!==job.scene_revision)reasons.push(`资料已到 r${r}，${r-job.scene_revision} 次更新尚未反映`);if(s&&s.id!==job.scene_id)reasons.push(`新描述 D${s.version}${s.approved_at?' 已确认，尚未生成它的世界':' 仍待确认'}`);pending=reasons.length?`仍显示 W${job.version}（D${job.scene_version} / r${job.scene_revision}）。${reasons.join('；')}。旧世界已保留。`:`W${job.version} 对应已确认 D${job.scene_version} / r${job.scene_revision}。${job.provider==='example'?'这是固定程序示例，几何不会随描述改变。':'新回忆和修改不会覆盖这个版本。'}`;}
  $('world-pending').textContent=pending;$('world-pending').parentElement.classList.toggle('pending',!!job&&(r!==job.scene_revision||s?.id!==job.scene_id));$('world-snapshot').hidden=!job;
  $('world-snapshot').onclick=()=>busy($('world-snapshot'),async()=>{const snapshot=await api(`/api/scenes/${encodeURIComponent(job.scene_id)}`);showModal(`W${job.version} 的确认快照 · D${job.scene_version} / r${job.scene_revision}`,`<p class="modal-copy">确认于 ${esc(new Date(snapshot.approved_at).toLocaleString('zh-CN'))}。这是该世界的历史来源，不代表最新描述。</p><div class="scene-description">${esc(snapshot.data.description)}</div><p class="small">保留 ${snapshot.evidence.length} 条原始材料；${snapshot.mode==='openai'?'真实 AI 整理':'示例或手动整理'}。</p>`);});
}
function setExploring(value){exploring=value;viewer?.setExploring(value);$('world-overlay').hidden=value;$('world-control').hidden=value;$('walk-controls').hidden=!value;$('explore-hint').hidden=!value;if(value)$('world-canvas').focus({preventScroll:true});}
$('explore-button').onclick=()=>setExploring(true);$('exit-explore').onclick=()=>setExploring(false);$('reset-view').onclick=()=>viewer?.reset();$('retry-viewer').onclick=()=>{loadedWorldId=null;renderWorld();toast('正在重新加载 3D。');};
document.querySelectorAll('[data-move]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);viewer?.move(b.dataset.move,true);});for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>viewer?.move(b.dataset.move,false));});

let pendingMessage=null;
$('message-form').onsubmit=async e=>{e.preventDefault();const input=$('message-input'),text=input.value.trim();if(!text)return;const button=e.currentTarget.querySelector('button[type=submit]');if(!pendingMessage||pendingMessage.text!==text)pendingMessage={text,clientId:crypto.randomUUID()};
  await busy(button,async()=>{await api('/api/messages',{projectId,...pendingMessage});if(input.value.trim()===text)input.value='';pendingMessage=null;await refresh();$('messages').scrollTop=$('messages').scrollHeight;});};
$('message-input').onkeydown=e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();$('message-form').requestSubmit();}};
$('upload-button').onclick=()=>$('photo-input').click();
$('photo-input').onchange=async()=>{const file=$('photo-input').files[0];$('photo-input').value='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('请选择 JPG、PNG 或 WebP；HEIC 请先导出为 JPG。',true);return;}if(file.size>8*1024*1024){toast('图片请控制在 8 MB 以内。',true);return;}
  try{const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const dataUrl=canvas.toDataURL('image/jpeg',.88); // strips EXIF metadata before local storage
    showModal('给这张照片留一点线索',`<img class="file-preview" src="${dataUrl}" alt="待上传的图片预览"><p class="modal-copy">照片只会先保存在这台 Mac，并共享给项目成员。请先使用非私人样例；不会自动发送给 AI。</p><label class="small">照片的年代、视角，或者你记得的细节<textarea id="photo-caption" class="modal-input" rows="3" maxlength="1000" placeholder="例如：2002 年秋天，从院门往里看……"></textarea></label><div class="modal-actions"><button id="save-photo" class="button primary">加入回忆</button></div>`);
    $('save-photo').onclick=()=>busy($('save-photo'),async()=>{await api('/api/photos',{projectId,name:file.name.slice(0,115),base64:dataUrl.split(',')[1],caption:$('photo-caption').value});closeModal();await refresh();toast('照片已保存，项目成员现在都能看到。');});
  }catch{toast('无法读取这张图片，请换一张 JPG 或 PNG。',true);}
};
function openPhoto(photoId){const p=state.photos.find(p=>p.id===photoId);if(!p)return;showModal('一张照片，一段回忆',`<img class="modal-photo" src="./api/photos/${encodeURIComponent(p.id)}" alt="${esc(p.caption||p.name)}"><p class="modal-copy">${esc(p.caption||'还没有文字线索。')}</p><p class="small">${esc(p.name)} · ${time(p.created_at)} · 用户提供的资料，未经过 AI 核验</p>`);}
$('invite-button').onclick=()=>{const url=`${location.origin}/?${new URLSearchParams({project:projectId,invite:state.project.invite})}`;showModal('邀请记得这里的人',`<p class="modal-copy">复制链接，在同一台 Mac 的另一个浏览器或无痕会话打开。每个人填写自己的称呼，就能一起补充回忆。</p><input id="invite-url" class="modal-input" value="${esc(url)}" readonly aria-label="邀请链接"><p class="small">本地演示最多 5 人。此 localhost 链接暂不能让外部手机或远程朋友访问。</p><div class="modal-actions"><button id="copy-invite" class="button primary">复制邀请链接</button></div>`);$('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('邀请链接已复制。');}catch{$('invite-url').select();toast('请手动复制选中的邀请链接。');}};};
$('draft-button').onclick=()=>busy($('draft-button'),async()=>{await api('/api/scene',{projectId,revision:state.project.revision,mode:'example'});await refresh();toast('引用示例已保存。未调用 AI。');});
$('ai-button').onclick=()=>{showModal('让 AI 整理大家的回忆',`<p class="modal-copy">将发送本项目的文字回忆与 ${state.photos.length} 张照片到已配置的 OpenAI 模型，用于整理有来源的描述、缺口与冲突。这会使用 API 额度。</p><label class="checkbox-label"><input id="ai-consent" type="checkbox"><span>我确认可以发送这些资料，并使用已授权的 API 额度。</span></label><div class="modal-actions"><button id="run-ai" class="button primary" disabled>开始 AI 整理</button></div>`);$('ai-consent').onchange=()=>$('run-ai').disabled=!$('ai-consent').checked;$('run-ai').onclick=()=>busy($('run-ai'),async()=>{const revision=state.project.revision;await api('/api/scene',{projectId,revision,mode:'openai',consent:true});closeModal();await refresh();toast('AI 整理已保存，请核对来源与待确认问题。');});};
$('edit-scene').onclick=()=>{const sceneId=state.scene.id;showModal('编辑这份场景描述',`<p class="modal-copy">保存为新的描述草稿。原有确认与世界会保留，新描述需重新确认。</p><textarea id="description-input" class="modal-input" rows="10" maxlength="16000">${esc(state.scene.data.description)}</textarea><div class="modal-actions"><button id="save-description" class="button primary">保存描述草稿</button></div>`);$('save-description').onclick=()=>busy($('save-description'),async()=>{await api('/api/scene/edit',{projectId,sceneId,description:$('description-input').value});closeModal();await refresh();toast('新描述草稿已保存。');});};
$('confirm-button').onclick=()=>{const sceneId=state.scene.id;showModal('这是我们记得的地方吗？',`<p class="modal-copy">确认的是这份描述与来源快照。未解决的细节继续保留为问题，不会变成历史事实。</p><div class="scene-notice">${['example','mock'].includes(state.scene.mode)?'当前为本地示例或模拟规则，未经过真实 AI 整理。':'请检查来源、空间关系与年代。'}</div>${state.scene.data.questions.map(q=>`<div class="question">${esc(q.text)}</div>`).join('')}<label class="checkbox-label"><input id="confirm-check" type="checkbox"><span>我已核对这份描述，接受保留上述待确认项与推测。</span></label><div class="modal-actions"><button id="confirm-scene-final" class="button primary" disabled>确认这份描述</button></div>`);$('confirm-check').onchange=()=>$('confirm-scene-final').disabled=!$('confirm-check').checked;$('confirm-scene-final').onclick=()=>busy($('confirm-scene-final'),async()=>{await api('/api/scene/confirm',{projectId,sceneId});closeModal();await refresh();toast('描述已确认，可以保存并探索世界了。');});};
function referenceDialog(){const sceneId=state.scene.id;showModal('制作一张空间参考图',`<p class="modal-copy">将把已确认的描述发送到 OpenAI 图片模型。这会使用 API 额度。生成图会标注为推测，不作为历史照片或事实来源。</p><label class="checkbox-label"><input id="image-consent" type="checkbox"><span>我确认使用已授权的 API 额度生成参考图。</span></label><div class="modal-actions"><button id="run-image" class="button primary" disabled>生成参考图</button></div>`);$('image-consent').onchange=()=>$('run-image').disabled=!$('image-consent').checked;$('run-image').onclick=()=>busy($('run-image'),async()=>{await api('/api/reference',{projectId,sceneId,consent:true});closeModal();await refresh();toast('参考图已保存，并标记为 AI 推测。');});}
$('generate-button').onclick=()=>{const sceneId=state.scene.id;showModal('给这个地方，一个入口',`<label class="small">世界生成方式<select id="world-provider"><option value="example">本地示例 · 不调用外部服务</option value="worldlabs" ${state.providers.world.enabled?'':'disabled'}>World Labs · ${state.providers.world.enabled?'真实生成，使用 API 额度':'未连接'}</option></select></label><div id="local-world-note" class="scene-notice">${isStatic?'仅在当前页面保存示例记录，刷新重置，不会共享到其他设备。':'保存原创固定院子场景，用来体验多人共享和探索。'}它不会根据聊天重建，不是 World Labs 的生成结果。</div><div id="real-world-options" hidden><p class="modal-copy">只选择同一个地方、同一目标年代的参考图，最多 4 张。不确定的视角不要强行指定。无图时将使用已确认的文字。</p>${state.photos.map(p=>`<label class="checkbox-label"><input class="world-photo" type="checkbox" value="${esc(p.id)}"><span>${esc(p.caption||p.name)}</span></label>`).join('')}${state.references.filter(r=>r.scene_id===sceneId).map(r=>`<label class="checkbox-label"><input class="world-photo" type="checkbox" value="${esc(r.id)}"><span>AI 空间参考图（推测）</span></label>`).join('')}<label class="checkbox-label"><input id="world-consent" type="checkbox"><span>我确认将描述与所选图片发送至 World Labs，并使用已授权额度。隐藏几何可能是想象。</span></label></div><div class="modal-actions"><button id="generate-final" class="button primary">保存示例世界并探索</button></div>`);
  const update=()=>{const real=$('world-provider').value==='worldlabs';$('real-world-options').hidden=!real;$('local-world-note').hidden=real;$('generate-final').textContent=real?'确认并调用 World Labs':'保存示例世界并探索';$('generate-final').disabled=real&&!$('world-consent').checked;};$('world-provider').onchange=update;$('world-consent').onchange=update;
  $('generate-final').onclick=()=>busy($('generate-final'),async()=>{const provider=$('world-provider').value;const job=await api('/api/worlds',{projectId,sceneId,provider,consent:provider==='worldlabs'&&$('world-consent').checked,photoIds:[...document.querySelectorAll('.world-photo:checked')].map(x=>x.value)});activeWorldId=job.id;closeModal();await refresh();tab('world');if(provider==='example'){toast(isStatic?'本页已保存新的示例记录；刷新会重置，不跨设备同步。':'示例世界已保存，所有参与者共享同一份记录。');setExploring(true);}else toast('真实生成任务已保存，将持续查询进度。');});
};
$('versions-button').onclick=()=>{showModal('已经留下的空间',state.jobs.length?`<p class="modal-copy">每份确认描述对应独立保存记录。添加回忆不会覆盖旧空间。</p>${state.jobs.map(j=>`<button class="world-history" data-world="${esc(j.id)}" ${j.status==='succeeded'?'':'disabled'}>W${j.version} · ${j.provider==='example'?'本地示例世界':'World Labs 世界'} ← D${j.scene_version} / r${j.scene_revision}<small>${new Date(j.created_at).toLocaleString('zh-CN')} · ${{succeeded:'已保存',running:'生成中',queued:'已排队',submitting:'提交中',failed:'失败',needs_review:'结果待核对'}[j.status]||j.status}</small></button>`).join('')}`:'<p class="modal-copy">还没有保存的世界。先确认描述，再保存第一个示例世界。</p>');$('modal-body').querySelectorAll('[data-world]').forEach(b=>b.onclick=()=>{activeWorldId=b.dataset.world;loadedWorldId=null;setExploring(false);renderWorld();closeModal();tab('world');});};
function providerDialog(){const p=state?.providers;showModal('真实功能与示例边界',`<div class="provider-row"><div>多人群聊与照片<small>独立浏览器身份 · 服务端同步 · SQLite 持久保存</small></div><span class="pill">真实运行</span></div><div class="provider-row"><div>记忆整理 Agent<small>${p?.agent.enabled?'已配置模型；发送资料前需确认':'未接入模型；引用示例仅逐条展示原话'}</small></div><span class="pill sand">${p?.agent.enabled?'已配置':'未连接'}</span></div><div class="provider-row"><div>AI 空间参考图<small>生成图会明确标为推测，不是历史照片</small></div><span class="pill sand">${p?.image.enabled?'已配置':'未连接'}</span></div><div class="provider-row"><div>World Labs<small>异步接口、SPZ 轻量查看与本机归档已实现；真实付费生成未验证</small></div><span class="pill sand">${p?.world.enabled?'已配置':'未连接'}</span></div><div class="provider-row"><div>本地院子<small>原创程序场景 · 可探索 · 可保存 · 不根据聊天重建</small></div><span class="pill sand">明确示例</span></div><p class="modal-copy">当前仅在本机运行，尚无公开体验地址。邀请链接只适用于本机其他浏览器；正式账号、远程访问与部署均未配置。</p>`);}
$('providers-button').onclick=providerDialog;$('footer-status').onclick=providerDialog;$('connection').onclick=()=>state?providerDialog():toast('本地 Demo，尚未连接外部 AI 或 World Labs。');
function staticUploadNotice(){toast('公开静态预览不接收照片或个人资料；请在本地后端使用上传功能。');}
if(isStatic){
  const banner=document.createElement('aside');banner.className='preview-banner';banner.innerHTML='<strong>公开静态预览 · 全部为合成示例</strong><span>可体验界面、模拟追问和程序院子。无真实多人同步、真实 AI 或 World Labs；改动仅在当前页面，刷新重置。</span><a href="./materials.html">查看视觉素材板 ↗</a>';document.querySelector('.topbar').after(banner);
  $('message-input').disabled=true;$('message-input').placeholder='此公开预览不接收个人资料，点击下方按钮加入合成回忆。';
  const submit=$('message-form').querySelector('button[type="submit"]');submit.type='button';submit.textContent='＋ 合成回忆';submit.setAttribute('aria-label','补充一条合成回忆');submit.className='button primary';submit.onclick=()=>preview.addSynthetic();$('message-form').onsubmit=e=>e.preventDefault();$('upload-button').onclick=staticUploadNotice;
  $('invite-button').onclick=()=>showModal('分享静态预览',`<p class="modal-copy">复制浏览器地址，可在其他电脑或手机打开同一份固定示例。每个页面独立运行；这不是多人项目邀请，不会同步你当前的进度。</p><input class="modal-input" readonly aria-label="静态预览地址" value="${esc(location.href.split('?')[0])}">`);
  const boundaries=()=>showModal('静态预览的真实边界','<p class="modal-copy">已提供：同一套界面、固定合成回忆、模拟助手调度、描述确认和版本流程、可探索的原创 WebGL 院子。</p><p class="modal-copy">没有提供：服务器、登录、跨设备多人同步、照片上传、真实模型、AI 参考图、World Labs 生成、持久保存。刷新即恢复示例。</p><p class="modal-copy">真正的 Node / SQLite 后端在独立本地工程中保留；尚未公开部署，也没有进行本轮付费 API 请求。</p>');
  $('providers-button').onclick=boundaries;$('footer-status').onclick=boundaries;$('connection').onclick=boundaries;
  document.querySelector('footer>span:last-child').replaceChildren(Object.assign(document.createElement('a'),{href:'./materials.html',textContent:'静态合成预览 · 查看视觉素材板 ↗'}));
}
initialize();
