// Local notebooks contain user input. They never drive the archived example worlds.
export const NOTEBOOK_KEY='return-there-notebooks-v1';
export const MAX_DESCRIPTION_LENGTH=180000; // 80 full source notes plus the project heading.
export const emptyNotebooks=()=>({schema:1,profile:'我',projects:[],exampleNotes:[],drafts:{},sceneDrafts:{}});
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const validId=value=>typeof value==='string'&&/^[a-z0-9-]{1,70}$/i.test(value);
const picture=value=>typeof value==='string'&&value.length<=330000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)?value:null;
export function createProject(store,{id,title,era,name},now=new Date().toISOString()){
  if(store.projects.length>=5)throw Error('这个浏览器最多保存 5 个地方。可以继续完善已有项目。');
  if(!validId(id)||store.projects.some(p=>p.id===id))throw Error('请重新建立项目。');
  if(!text(title,60)||!text(name,30))throw Error('请填写地方名称和你的称呼。');
  const next=structuredClone(store);next.profile=text(name,30);next.projects.push({id,title:text(title,60),era:text(era,60),createdAt:now,updatedAt:now,notes:[],revision:0,scene:null,versions:[]});return next;
}
export function addNote(store,id,{noteId,body,photo},now=new Date().toISOString()){
  const next=structuredClone(store),p=id==='example'?null:next.projects.find(p=>p.id===id);
  if(id!=='example'&&!p)throw Error('这个地方暂时找不到了，请返回首页。');
  const notes=p?p.notes:next.exampleNotes;
  if(!validId(noteId))throw Error('这条回忆暂时无法保存，请再试一次。');
  if(notes.some(n=>n.id===noteId))return next;
  if(notes.length>=80)throw Error('已保存 80 条回忆；请先整理现有内容。');
  const value=text(body,2000),image=picture(photo);
  if(!value)throw Error(photo?'给照片写一句说明，留下时间、位置或记得的细节。':'先写下一点回忆，再发送。');
  if(photo&&!image)throw Error('照片格式或大小不合适，请重新选择。');
  if(image&&[...next.exampleNotes,...next.projects.flatMap(p=>p.notes)].filter(n=>n.photo).length>=6)throw Error('本机演示最多保存 6 张照片。文字回忆仍可继续添加。');
  notes.push({id:noteId,name:next.profile,body:value,photo:image,createdAt:now});delete next.drafts[id];
  if(p){p.revision++;p.updatedAt=now;}return next;
}
export function organize(store,id,now=new Date().toISOString()){
  const next=structuredClone(store),p=next.projects.find(p=>p.id===id);if(!p?.notes.length)throw Error('先留下一条回忆，再整理场景。');
  p.scene={revision:p.revision,updatedAt:now,description:`${p.title}${p.era?'，'+p.era:''}。\n\n`+p.notes.map(n=>n.body).join('\n'),sourceIds:p.notes.map(n=>n.id),edited:false};delete next.sceneDrafts?.[id];return next;
}
export function editDescription(store,id,description){
  const next=structuredClone(store),p=next.projects.find(p=>p.id===id);
  if(!p?.scene||p.scene.revision!==p.revision)throw Error('有新回忆尚未整理，请先更新整理记录。');
  if(!text(description,MAX_DESCRIPTION_LENGTH))throw Error('描述不能为空。');p.scene.description=text(description,MAX_DESCRIPTION_LENGTH);p.scene.edited=true;delete next.sceneDrafts?.[id];return next;
}
export function confirmDescription(store,id,consent,now=new Date().toISOString()){
  const next=structuredClone(store),p=next.projects.find(p=>p.id===id);
  if(!p?.scene)throw Error('先整理并核对场景描述。');
  if(p.scene.revision!==p.revision)throw Error('有新回忆尚未整理，请更新后再确认。');
  if(typeof next.sceneDrafts?.[id]==='string'&&next.sceneDrafts[id]!==p.scene.description)throw Error('请先保存描述修改，再确认来源。');
  if(!consent)throw Error('请先勾选确认来源与推测。');
  const latest=p.versions.at(-1);if(latest?.revision===p.revision&&latest.description===p.scene.description)return next;
  if(p.versions.length>=80)throw Error('本机已保留 80 份确认记录，请先导出备份。');
  p.versions.push({number:p.versions.length+1,confirmedAt:now,revision:p.revision,description:p.scene.description,sources:p.notes.map(({id,name,body,photo})=>({id,name,body,hasPhoto:!!photo})),world:null});return next;
}
export function restoreNotebooks(raw){
  try{
    const v=JSON.parse(raw);if(v?.schema!==1||!Array.isArray(v.projects))throw Error('schema');
    const safe=emptyNotebooks();safe.profile=text(v.profile,30)||'我';
    const cleanNote=n=>validId(n?.id)&&text(n.body,2000)?{id:n.id,name:text(n.name,30)||'我',body:text(n.body,2000),photo:picture(n.photo),createdAt:text(n.createdAt,40)}:null;
    safe.exampleNotes=(Array.isArray(v.exampleNotes)?v.exampleNotes:[]).slice(0,80).map(cleanNote).filter(Boolean);
    for(const p of v.projects.slice(0,5)){
      if(!validId(p?.id)||!text(p.title,60)||safe.projects.some(x=>x.id===p.id))continue;
      const notes=(Array.isArray(p.notes)?p.notes:[]).slice(0,80).map(cleanNote).filter(Boolean),ids=new Set(notes.map(n=>n.id));
      const revision=notes.length;
      const scene=p.scene&&Array.isArray(p.scene.sourceIds)&&p.scene.sourceIds.every(id=>ids.has(id))?{revision:Math.min(revision,Math.max(0,Number(p.scene.revision)||0)),description:text(p.scene.description,MAX_DESCRIPTION_LENGTH),sourceIds:p.scene.sourceIds,edited:!!p.scene.edited,updatedAt:text(p.scene.updatedAt,40)}:null;
      const versions=(Array.isArray(p.versions)?p.versions:[]).slice(0,80).filter(s=>text(s?.description,MAX_DESCRIPTION_LENGTH)&&Array.isArray(s.sources)).map((s,i)=>({number:i+1,confirmedAt:text(s.confirmedAt,40),revision:Math.min(revision,Math.max(0,Number(s.revision)||0)),description:text(s.description,MAX_DESCRIPTION_LENGTH),sources:s.sources.filter(n=>ids.has(n.id)).map(n=>({id:n.id,name:text(n.name,30),body:text(n.body,2000),hasPhoto:!!n.hasPhoto})),world:null}));
      safe.projects.push({id:p.id,title:text(p.title,60),era:text(p.era,60),createdAt:text(p.createdAt,40),updatedAt:text(p.updatedAt,40),notes,revision,scene,versions});
    }
    if(v.drafts&&typeof v.drafts==='object')for(const id of ['example',...safe.projects.map(p=>p.id)])if(typeof v.drafts[id]==='string')safe.drafts[id]=v.drafts[id].slice(0,2000);
    if(v.sceneDrafts&&typeof v.sceneDrafts==='object')for(const p of safe.projects)if(p.scene&&typeof v.sceneDrafts[p.id]==='string')safe.sceneDrafts[p.id]=v.sceneDrafts[p.id].slice(0,MAX_DESCRIPTION_LENGTH);
    return safe;
  }catch{return emptyNotebooks();}
}
