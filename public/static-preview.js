// Public Pages preview: fixed synthetic fixtures, memory-only per page, no API calls.
export function createStaticPreview(){
  let serial=10,timer,onUpdate=()=>{},generation=0;
  const now=()=>new Date().toISOString(),uid=()=>`preview-${++serial}`,project={id:'synthetic-preview',title:'桂花树下的院子',invite:'static-no-invite',revision:2};
  const messages=[
    {id:'s1',author:'示例 · 阿禾',text:'小时候的院子很小，桂花树在左边。每到秋天，地上都是细碎的黄色花瓣。'},
    {id:'s2',author:'示例 · 小满',text:'树下有一张方木桌。门好像是绿色的。'},
    {id:'s3',author:'示例 · 阿禾',text:'我记得门是褪色的蓝色，也可能后来漆过。想留下 2002 年的秋天。'},
    {id:'s4',author:'示例 · 小满',text:'补充合成回忆：北侧还有一扇木窗。这条新回忆尚未反映在旧世界里。'}
  ].map((m,i)=>({...m,kind:'message',type:'message',sample:1,created_at:new Date(Date.UTC(2026,9,1,8,i)).toISOString()}));
  const data={title:project.title,description:'院子左侧是一棵桂花树，树下有方木桌。希望重现 2002 年的秋天。门的蓝色与绿色描述尚有分歧；尺寸和隐藏结构仍待补充。',facts:[{text:'桂花树在院子左边。',sourceIds:['s1'],certainty:'reported'},{text:'树下有一张方木桌。',sourceIds:['s2'],certainty:'reported'}],questions:[{text:'门的蓝 / 绿是不同年代，还是同一时期的分歧？',sourceIds:['s2','s3'],kind:'conflict'},{text:'院子大约多长、多宽？',sourceIds:[],kind:'gap'}],assumptions:['本页全部使用合成文字和固定程序院子；没有真实 AI、参考图或 World Labs 生成结果。']};
  const scenes=[{id:'d1',version:1,project_id:project.id,revision:1,mode:'example',data:structuredClone(data),evidence:structuredClone(messages.slice(0,3)),created_at:messages[2].created_at,approved_at:messages[2].created_at}];
  const jobs=[{id:'w1',version:1,scene_id:'d1',scene_version:1,scene_revision:1,provider:'example',status:'succeeded',created_at:messages[2].created_at,world:{kind:'local-courtyard',title:project.title,sceneId:'d1',geometry:{palette:'osmanthus',bounds:[-6,6,-5,5],tree:[-2.7,0,-1.3],table:[1.6,0,-1.3],door:[0,0,-4.9],start:[0,1.6,3.7]},provenance:'固定原创 WebGL 程序场景；非 AI / World Labs 生成，几何不会随聊天改变。'}}];
  const agentPosts=[],processed=new Set(),asked=new Set();let chatAgent={mode:'off',status:'off',mockUsed:0,mockLimit:10,realRemaining:0};
  const getState=()=>structuredClone({project,user:{id:'preview-owner',name:'合成体验者',role:'owner'},members:[{id:'preview-owner',name:'合成体验者',role:'owner'},{id:'synthetic-a',name:'示例阿禾',role:'member'},{id:'synthetic-b',name:'示例小满',role:'member'}],messages,photos:[],scene:scenes.at(-1),confirmed:scenes.findLast(s=>s.approved_at),scenes,jobs:[...jobs].reverse(),agentPosts,chatAgent,providers:{agent:{enabled:false},image:{enabled:false},world:{enabled:false}},references:[],draftBusy:false});
  function draft(mode){const scene={id:uid(),project_id:project.id,version:scenes.length+1,revision:project.revision,mode,data:{...structuredClone(data),description:messages.map(m=>`${m.author}：${m.text}`).join('\n')},evidence:structuredClone(messages),created_at:now(),approved_at:null};scenes.push(scene);return scene;}
  function schedule(){clearTimeout(timer);if(chatAgent.mode!=='mock')return;const token=generation;chatAgent.status='pending';timer=setTimeout(()=>{
    if(token!==generation||chatAgent.mode!=='mock')return;
    if(processed.has(project.revision)){chatAgent.status='idle';onUpdate();return;}
    if(chatAgent.mockUsed>=10){chatAgent={...chatAgent,mode:'off',status:'limited',last_error:'本页 10 次模拟整理已用完，刷新可重置合成体验。'};onUpdate();return;}
    processed.add(project.revision);chatAgent.mockUsed++;const scene=draft('mock');
    agentPosts.push({id:uid(),agent_mode:'mock',text:`示例助手已整理现有回忆，留下第 ${scene.version} 份描述。结果仅存在当前页面；没有真实 AI 或共享后端。`,sourceIds:[],created_at:now()});
    for(const q of data.questions)if(!asked.has(q.text)){asked.add(q.text);agentPosts.push({id:uid(),agent_mode:'mock',text:'模拟追问：'+q.text,sourceIds:q.sourceIds,created_at:now()});}
    chatAgent.status='idle';onUpdate();
  },1800);}
  async function api(path,input){
    if(path.startsWith('/api/session'))return {joined:true};
    if(path.startsWith('/api/state'))return getState();
    if(path.startsWith('/api/scenes/')){const scene=scenes.find(s=>s.id===path.split('/').at(-1));if(!scene)throw Error('示例描述不存在。');return structuredClone(scene);}
    if(path==='/api/agent/settings'){if(input.mode==='openai')throw Error('静态预览没有真实 AI 配置，不会回退为示例。');if(!['off','mock'].includes(input.mode))throw Error('未知模式。');generation++;clearTimeout(timer);chatAgent={...chatAgent,mode:input.mode,status:input.mode==='off'?'off':'pending',last_error:null};schedule();return chatAgent;}
    if(path==='/api/messages'){throw Error('公开预览不接收个人资料，请使用“补充一条合成回忆”。');}
    if(path==='/api/scene'){if(input.mode!=='example')throw Error('静态预览未连接真实 AI。');return {id:draft('example').id};}
    if(path==='/api/scene/edit')throw Error('公开预览只使用固定合成材料；描述编辑请在本地后端体验。');
    if(path==='/api/scene/confirm'){const s=scenes.at(-1);if(s.id!==input.sceneId||s.revision!==project.revision)throw Error('请先整理最新合成回忆。');s.approved_at=now();return {ok:true};}
    if(path==='/api/worlds'){const s=scenes.at(-1);if(input.provider!=='example')throw Error('静态预览没有 World Labs 接入。');if(s.id!==input.sceneId||!s.approved_at||s.revision!==project.revision)throw Error('请先确认最新示例描述。');let job=jobs.find(j=>j.scene_id===s.id);if(!job){job={...structuredClone(jobs[0]),id:uid(),version:jobs.length+1,scene_id:s.id,scene_version:s.version,scene_revision:s.revision,created_at:now()};job.world.sceneId=s.id;jobs.push(job);}return structuredClone(job);}
    throw Error('此功能需要本地后端；静态预览没有上传或外部 API。');
  }
  function addSynthetic(){const options=['合成补充：木窗在门的右边。','合成补充：院子大约宽 6 米，长 8 米。','合成补充：想保留方桌旁的小凳子。'];messages.push({id:uid(),author:'示例 · 体验者',type:'message',sample:1,text:options[(project.revision-2)%options.length],created_at:now()});project.revision++;schedule();onUpdate();}
  return {api,connect:fn=>{onUpdate=fn;},addSynthetic};
}
