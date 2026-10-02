import {NOTEBOOK_KEY,emptyNotebooks,restoreNotebooks,createProject,addNote,organize,editDescription,confirmDescription} from './notebook-state.js';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'已保存';};
const empty=(title,body,action='')=>`<div class="empty-state"><span aria-hidden="true">✳</span><h3>${title}</h3><p>${body}</p>${action}</div>`;
let store=emptyNotebooks(),saved=true,activeId=null,tab='memories',photo=null,photoBusy=false,photoToken=0,draftTimer;
try{store=restoreNotebooks(localStorage.getItem(NOTEBOOK_KEY));}catch{saved=false;}
export function mountNotebook({notify,modal,closeModal,openExample}){
  function persist(next){
    try{const data=JSON.stringify(next);if(data.length>2200000)throw Error('quota');localStorage.setItem(NOTEBOOK_KEY,data);saved=true;}
    catch{saved=false;notify('浏览器未能保存。内容仍在当前页面，请导出回忆备份后再关闭。');}
    store=next;status();
  }
  function status(){for(const el of document.querySelectorAll('[data-local-save]'))el.textContent=saved?'已保存到这个浏览器':'尚未保存 · 请导出备份';}
  function run(fn){try{persist(fn());return true;}catch(e){notify(e.message);return false;}}
  function notesHTML(notes){return notes.map(n=>`<article class="message own-message"><span class="avatar">${esc(n.name.slice(0,1))}</span><div><div class="message-meta"><b>${esc(n.name)}</b><small>${stamp(n.createdAt)} · 仅本机</small></div>${n.photo?`<button class="photo-preview" data-photo="${n.id}" aria-label="查看照片"><img src="${n.photo}" alt="${esc(n.body)}"></button>`:''}<div class="bubble">${esc(n.body)}</div></div></article>`).join('');}
  function bindPhotos(root,notes){root.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>{const n=notes.find(n=>n.id===b.dataset.photo);modal('照片与说明',`<img class="full-photo" src="${n.photo}" alt="${esc(n.body)}"><p>${esc(n.body)}</p><p class="note">保存在这个浏览器，未发送到模型或服务器。</p>`);});}
  function exportNotes(project){
    const value=project?{format:'return-there-backup-v1',exportedAt:new Date().toISOString(),project}:{format:'return-there-backup-v1',exportedAt:new Date().toISOString(),exampleNotes:store.exampleNotes};
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=project?'回到那儿-回忆备份.json':'回到那儿-我的补充.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('已导出回忆、照片与确认记录。');
  }
  function home(){
    $('project-collection').innerHTML=`<div class="collection-heading"><div><span class="eyebrow">YOUR PLACES</span><h2>我的地方</h2><p>从一间房、一座院子开始，慢慢把回忆放回来。</p></div><button class="primary" id="new-place">＋ 新建地方</button></div><div class="project-cards">${store.projects.length?store.projects.map(p=>`<button class="place-card" data-project="${p.id}"><span class="place-cover">${p.notes.find(n=>n.photo)?`<img src="${p.notes.find(n=>n.photo).photo}" alt="">`:'<span aria-hidden="true">⌂</span>'}<span class="tag">本机草稿</span></span><span class="place-text"><strong>${esc(p.title)}</strong><small>${esc(p.era||'年代等待补充')} · ${p.notes.length} 条回忆</small><span>${p.versions.length?`${p.versions.length} 份确认记录 · 等待生成世界`:'继续一起记得'} <b>→</b></span></span></button>`).join(''):`<div class="first-place"><span aria-hidden="true">⌂</span><div><h3>下一处地方，留给你的回忆。</h3><p>先写下一段话，或添加一张照片。新项目仅保存在这个浏览器。</p><button class="text-button" id="first-place">建立我的第一个地方 →</button></div></div>`}</div>`;
    $('new-place').onclick=newProject;$('first-place')&&($('first-place').onclick=newProject);
    $('project-collection').querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>location.hash=`place/${b.dataset.project}/memories`);
  }
  function newProject(){
    modal('留下一个地方',`<form id="new-place-form" class="app-form"><p>不用从完整的记忆开始。给它一个名字，就有了可以慢慢补全的地方。</p><label>地方名称<input id="place-title" maxlength="60" placeholder="比如：外婆家的小院" required autofocus></label><label>大概是什么时候？<input id="place-era" maxlength="60" placeholder="比如：2005 年夏天（可以先不填）"></label><label>怎么称呼你<input id="place-name" maxlength="30" value="${esc(store.profile==='我'?'':store.profile)}" placeholder="你的称呼" required></label><p class="form-note">本机体验，无需账号。照片与文字不上传；新项目暂不调用世界生成。</p><button class="primary full" type="submit">建立这个地方 <span>→</span></button></form>`);
    $('new-place-form').onsubmit=e=>{e.preventDefault();const id=crypto.randomUUID();if(run(()=>createProject(store,{id,title:$('place-title').value,era:$('place-era').value,name:$('place-name').value}))){closeModal();home();location.hash=`place/${id}/memories`;notify('地方已建立。留下一点你记得的细节吧。');}};
  }
  function composerHTML(id){return `<form class="memory-composer" data-composer="${id}"><label for="note-${id}">${id==='example'?'写下我的补充':'写下你的回忆'}</label><textarea id="note-${id}" maxlength="2000" rows="3" placeholder="那时候，院子里还有……">${esc(store.drafts[id]||'')}</textarea><div class="attachment" hidden></div><div class="composer-bottom"><button type="button" class="attach-button">▧ 添加照片</button><small class="char-count">${(store.drafts[id]||'').length} / 2000</small><button type="submit" class="primary send-note" aria-label="发送回忆">发送 <span>↑</span></button></div><input class="photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden><p class="form-note">${id==='example'?'你的补充单独保存，不会改变已生成的示例世界。':'只保存在这个浏览器，尚未与其他人同步。'} <span>⌘ / Ctrl + Enter 发送</span><span data-local-save></span></p><p class="input-error" role="alert" hidden></p></form>`;}
  function bindComposer(id,after){
    const form=document.querySelector(`[data-composer="${id}"]`),input=form.querySelector('textarea'),file=form.querySelector('input[type=file]'),send=form.querySelector('.send-note'),attachment=form.querySelector('.attachment'),error=form.querySelector('.input-error');
    photo=null;photoBusy=false;photoToken++;send.disabled=!input.value.trim();
    const showError=message=>{error.textContent=message;error.hidden=false;};
    input.oninput=()=>{error.hidden=true;send.disabled=!input.value.trim()||photoBusy;form.querySelector('.char-count').textContent=`${input.value.length} / 2000`;store.drafts[id]=input.value;clearTimeout(draftTimer);draftTimer=setTimeout(()=>persist(store),250);};
    input.onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();form.requestSubmit();}};
    form.querySelector('.attach-button').onclick=()=>file.click();
    file.onchange=async()=>{
      const selected=file.files[0];if(!selected)return;const token=++photoToken;error.hidden=true;
      if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size>8*1024*1024){showError('请选择不超过 8 MB 的 JPG、PNG 或 WebP 照片。');file.value='';return;}
      photoBusy=true;send.disabled=true;attachment.hidden=false;attachment.textContent='正在整理照片…';
      try{const bitmap=await createImageBitmap(selected);const ratio=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let data=canvas.toDataURL('image/jpeg',.7);if(data.length>330000)data=canvas.toDataURL('image/jpeg',.4);if(data.length>330000)throw Error('照片细节较多，请选择较小的图片。');if(token!==photoToken)return;photo=data;attachment.innerHTML=`<img src="${data}" alt="待保存的照片"><span>照片已准备好<small>请在上方写一句说明</small></span><button type="button" aria-label="移除待发照片">×</button>`;attachment.querySelector('button').onclick=()=>{photo=null;attachment.hidden=true;file.value='';};}
      catch(e){photo=null;attachment.hidden=true;showError(e.message==='照片细节较多，请选择较小的图片。'?e.message:'这张照片暂时无法打开，请选择另一张。');}
      finally{if(token===photoToken){photoBusy=false;send.disabled=!input.value.trim();file.value='';}}
    };
    form.onsubmit=e=>{e.preventDefault();if(photoBusy)return;if(!input.value.trim()){showError('先写下一点回忆，或给照片补上一句说明。');return;}try{const next=addNote(store,id,{noteId:crypto.randomUUID(),body:input.value,photo});persist(next);photo=null;after();notify(saved?'回忆已保存。':'回忆暂存在页面，请导出备份。');}catch(e){showError(e.message);}};
  }
  function renderExample(){
    $('personal-notes').innerHTML=`${store.exampleNotes.length?`<div class="personal-heading"><strong>我的补充</strong><span>未纳入示例世界</span></div><div class="messages">${notesHTML(store.exampleNotes)}</div><button class="text-button" id="export-example">导出我的补充 ↗</button>`:''}${composerHTML('example')}`;
    bindComposer('example',renderExample);bindPhotos($('personal-notes'),store.exampleNotes);if($('export-example'))$('export-example').onclick=()=>exportNotes(null);status();
  }
  function route(id,nextTab='memories'){
    activeId=id;tab=['memories','scene','world','versions'].includes(nextTab)?nextTab:'memories';const p=store.projects.find(p=>p.id===id);
    if(!p){$('local-project').innerHTML=empty('这个地方暂时找不到了','可能是浏览器数据已清理，或链接来自另一台设备。','<a class="primary" href="#home">返回我的地方</a>');return;}
    $('local-project').innerHTML=`<div class="project-head"><div><span class="eyebrow">MY MEMORY SPACE / 本机回忆空间</span><h1>${esc(p.title)}</h1><p>${esc(p.era||'时间也可以慢慢记起来。')}</p></div><button id="local-members" class="member-button"><span class="avatar">${esc(store.profile.slice(0,1))}</span> ${esc(store.profile)} · 仅本机</button></div><nav class="chapters app-tabs" aria-label="项目导航">${[['memories','回忆'],['scene','场景描述'],['world','我们的世界'],['versions','版本记录']].map(([key,label])=>`<a href="#place/${id}/${key}" aria-current="${key===tab?'page':'false'}">${label}${key==='versions'&&p.versions.length?` <small>${p.versions.length}</small>`:''}</a>`).join('')}</nav><div class="case-bar"><span>本机项目 · 未连接在线 AI</span><span data-local-save></span><button id="export-place">导出备份 ↗</button></div><div id="local-content"></div>`;
    $('export-place').onclick=()=>exportNotes(p);$('local-members').onclick=()=>modal('一起记得的人',`<p class="dialog-copy">你以「${esc(store.profile)}」留下回忆。这个地方目前保存在当前浏览器。</p><p>远程邀请与多人同步尚未开放。现在可以先收集回忆、核对描述，并导出备份留存。</p><div class="dialog-actions"><button class="primary" id="export-member">导出这份回忆</button></div>`)||($('export-member').onclick=()=>exportNotes(p));
    const root=$('local-content');
    if(tab==='memories'){
      root.innerHTML=`<div class="memory-grid"><article class="card conversation"><div class="card-title"><span class="eyebrow">PIECES OF A PLACE</span><h2>从你记得的一点开始。</h2><p>${p.notes.length} 条回忆 · ${p.notes.filter(n=>n.photo).length} 张照片</p></div><div class="messages">${p.notes.length?notesHTML(p.notes):empty('第一句回忆，等你留下','门是什么颜色？窗外有什么？哪件小事，让你一直记得这里？')}</div>${composerHTML(id)}</article><aside class="card note-card"><span class="eyebrow">A LITTLE HELP</span><h2>记忆不需要完整。</h2><p class="note">可以从年代、位置、物件或光线说起。照片也需要一句说明，让别人知道你想留下什么。</p><div class="question"><span class="tag neutral">整理助手 · 示例模式</span><p>逐条保留你的原话，形成可编辑描述。暂不识图、不推断事实或自动判断冲突。</p></div><button class="primary full" id="organize-place" ${p.notes.length?'':'disabled'}>整理这些回忆 <span>→</span></button>${!p.notes.length?'<p class="note">留下第一条回忆后，就可以开始整理。</p>':''}</aside></div>`;
      bindComposer(id,()=>route(id,tab));bindPhotos(root,p.notes);$('organize-place').onclick=()=>{if(run(()=>organize(store,id))){location.hash=`place/${id}/scene`;notify('已逐条引用原话，请核对并编辑。');}};
    }else if(tab==='scene'){
      if(!p.scene){root.innerHTML=empty('先把回忆放在一起',p.notes.length?'已有回忆可以整理。每条原话会保留来源，之后由你编辑与确认。':'这个地方还没有回忆。先写一句话，或添加带说明的照片。',p.notes.length?'<button class="primary" id="make-scene">整理已有回忆 →</button>':`<a class="primary" href="#place/${id}/memories">去留下一条回忆 →</a>`);if($('make-scene'))$('make-scene').onclick=()=>{if(run(()=>organize(store,id)))route(id,'scene');};}
      else{
        const stale=p.scene.revision!==p.revision,latest=p.versions.at(-1),confirmed=latest?.revision===p.revision&&latest.description===p.scene.description;
        root.innerHTML=`<div class="review-grid"><article class="card scene-card"><div class="card-title"><span class="eyebrow">WORDS WITH SOURCES</span><h2>这是你记得的地方吗？</h2><p>示例整理只引用原话。可以手动编辑，照片内容尚未被识别。</p></div>${p.scene.sourceIds.map(id=>p.notes.find(n=>n.id===id)).filter(Boolean).map(n=>`<div class="fact"><p>${esc(n.body)}</p><button class="source" data-local-source="${n.id}">${esc(n.name)} · 查看原话 ↗</button></div>`).join('')}<div class="description-box"><label class="eyebrow" for="scene-editor">场景描述 · 可手动修改</label><textarea id="scene-editor" class="scene-editor" maxlength="10000" rows="8" ${stale?'disabled':''}>${esc(p.scene.description)}</textarea><button class="text-button" id="save-description" ${stale?'disabled':''}>保存描述修改</button><span id="editor-status" class="form-note"></span></div></article><aside class="card approval-card"><span class="tag ${stale?'amber':''}">${stale?'有新回忆待整理':confirmed?'这份描述已确认':'等待你的确认'}</span><h2>让想象有边界。</h2><p>${stale?'新增回忆尚未进入这份描述。更新整理后，再核对确认。':'请检查年代、布局和物件。无法确定的细节可以直接在描述里写明“待确认”。'}</p>${stale?'<button class="suggestion" id="update-scene">更新整理记录 →</button>':''}<label class="check"><input type="checkbox" id="local-consent" ${stale||confirmed?'disabled':''}><span>我已核对来源；未提供的信息仍待确认，不作为历史事实。</span></label><button id="confirm-local" class="primary full" disabled>${confirmed?'已保留确认记录':'确认并保存描述 →'}</button><p class="note">保存描述与来源快照。新项目的世界生成尚未开放，不会发起付费调用。</p>${confirmed?`<a class="quiet-link" href="#place/${id}/world">查看下一步 →</a>`:''}</aside></div>`;
        $('save-description').onclick=()=>{if(run(()=>editDescription(store,id,$('scene-editor').value))){route(id,'scene');notify('描述修改已保存，原有确认记录保持不变。');}};
        $('scene-editor').oninput=()=>{$('editor-status').textContent='有未保存修改';$('confirm-local').disabled=true;$('local-consent').checked=false;};
        $('local-consent').onchange=()=>{$('confirm-local').disabled=!$('local-consent').checked||$('scene-editor').value!==p.scene.description;};
        $('confirm-local').onclick=()=>{if(run(()=>confirmDescription(store,id,$('local-consent').checked))){location.hash=`place/${id}/world`;notify('确认描述与来源已保存。');}};
        if($('update-scene'))$('update-scene').onclick=()=>{modal('更新整理记录？','<p>将重新汇集全部回忆，替换当前可编辑描述。已经确认的版本会继续保留。</p><div class="dialog-actions"><button id="update-scene-confirm" class="primary">更新整理</button><button id="update-scene-cancel" class="text-button">先保留当前描述</button></div>');$('update-scene-confirm').onclick=()=>{if(run(()=>organize(store,id))){closeModal();route(id,'scene');}};$('update-scene-cancel').onclick=closeModal;};
        root.querySelectorAll('[data-local-source]').forEach(b=>b.onclick=()=>{const n=p.notes.find(n=>n.id===b.dataset.localSource);modal('回到这条回忆',`<span class="tag neutral">${esc(n.name)} · ${stamp(n.createdAt)}</span><blockquote>${esc(n.body)}</blockquote>${n.photo?`<img class="full-photo" src="${n.photo}" alt="这条回忆的照片">`:''}<p>这是你的原始材料。示例整理保留原话，不将生成画面作为事实来源。</p>`);});
      }
    }else if(tab==='world'){
      root.innerHTML=empty(p.versions.length?'描述留下了，世界还在等候。':'世界，从一份确认的回忆开始。',p.versions.length?'你的描述和来源已保存。这个演示暂不为新项目生成世界，可以继续补充回忆，或去探索已生成的桂花小院示例。':'先补充回忆、整理场景，并确认来源，再留下这个地方的第一份描述。',p.versions.length?'<button class="primary" id="visit-example">探索桂花小院示例 ↗</button>':`<a class="primary" href="#place/${id}/scene">去核对场景描述 →</a>`)+`<div class="next-actions"><a href="#place/${id}/memories">← 继续补充回忆</a><a href="#place/${id}/versions">查看确认记录 →</a></div>`;
      if($('visit-example'))$('visit-example').onclick=()=>openExample();
    }else{
      root.innerHTML=p.versions.length?`<div class="history-heading"><h2>每一次确认，都有来处。</h2><p>这些是独立保存的描述与来源，尚未关联生成世界。</p></div><div class="local-history">${[...p.versions].reverse().map(v=>`<article class="card"><span class="tag">第 ${v.number} 份确认记录</span><h3>${esc(p.title)}</h3><p>${esc(v.description)}</p><small>${stamp(v.confirmedAt)} · ${v.sources.length} 条来源 · 世界尚未生成</small><button class="text-button" data-local-version="${v.number}">查看当时的来源 ↗</button></article>`).join('')}</div>`:empty('这里会留下每一次确认','新的回忆来了，可以更新描述；旧版的文字与来源一直保留。',`<a class="primary" href="#place/${id}/scene">去核对描述 →</a>`);
      root.querySelectorAll('[data-local-version]').forEach(b=>b.onclick=()=>{const v=p.versions.find(v=>v.number===Number(b.dataset.localVersion));modal(`第 ${v.number} 份确认记录`,`<p>${esc(v.description)}</p><h3>当时的来源</h3>${v.sources.map(n=>`<blockquote>${esc(n.body)}<small>—— ${esc(n.name)}${n.hasPhoto?' · 附照片':''}</small></blockquote>`).join('')}<p class="note">后续补充不会改写这份记录。此版本尚未关联生成世界。</p>`);});
    }
    status();
  }
  function leave(){photoToken++;photo=null;photoBusy=false;clearTimeout(draftTimer);persist(store);}
  return {home,route,renderExample,newProject,leave,hasProject:id=>store.projects.some(p=>p.id===id)};
}
