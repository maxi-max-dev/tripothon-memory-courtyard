// Fixed, explicitly synthetic case. No model calls and no personal input.
export const STORAGE_KEY='return-there-demo-v1';
export const CASE_MESSAGES=[
  {id:'m1',name:'阿禾',initial:'禾',time:'周一 19:12',text:'想回到 2002 年的秋天。院子左边是桂花树，风一吹，地上都是小小的黄花。'},
  {id:'m2',name:'小满',initial:'满',time:'周二 08:30',text:'树下有张方木桌，还有两把竹凳。我记得门好像是绿色的。'},
  {id:'m3',name:'莉莉',initial:'莉',time:'周二 21:05',text:'我记得那年门是褪色的蓝色，右边有木窗和几盆花。也许后来重新刷过漆？'},
  {id:'m4',name:'小满',initial:'满',time:'周三 09:20',text:'想起来了！绿色是 2008 年以后刷的。我们要留下的 2002 年，门还是蓝色。'},
  {id:'m5',name:'阿禾',initial:'禾',time:'周三 18:40',text:'院子大概长 8 米、宽 6 米。桌上常有搪瓷杯和一盘毛豆，都是下午的光。'},
  {id:'m6',name:'小满',initial:'满',time:'后来的一条回忆',text:'还漏了一样：蓝门右边、盆栽旁边，靠墙停着一辆红色的小自行车。把它也留下吧。'}
];
export const WORLD_CATALOG={
  1:{title:'桂花又开了',subtitle:'第一版 · 树、方桌与蓝门',directory:'osmanthus-demo',change:'最初确认的院子'},
  2:{title:'还有那辆红色单车',subtitle:'第二版 · 加入新的回忆',directory:'osmanthus-revision',change:'蓝门右侧加入红色小自行车'}
};
export function initialState(){return {schema:1,started:false,step:1,clarified:false,measured:false,bicycle:false,versions:[],activeVersion:1};}
export function visibleMessages(state){return CASE_MESSAGES.filter((m,i)=>i<3||i===3&&state.clarified||i===4&&state.measured||i===5&&state.bicycle);}
export function describe(state,version=1){
  const facts=[{text:'2002 年秋天，院子左侧有一棵桂花树。',sources:['m1']},{text:'树下有方木桌和两把竹凳。',sources:['m2']},{text:'木窗与盆栽在右侧。',sources:['m3']}];
  if(state.clarified)facts.push({text:'蓝门属于 2002 年；绿色是 2008 年后的记忆。',sources:['m2','m3','m4']});
  if(state.measured)facts.push({text:'院子约长 8 米、宽 6 米；桌上有搪瓷杯与毛豆。',sources:['m5']});
  if(version===2&&state.bicycle)facts.push({text:'蓝门右侧，盆栽旁靠墙停着红色小自行车。',sources:['m6']});
  return {title:'桂花树下的院子 · 2002',facts,
    questions:[...(!state.clarified?[{text:'蓝门和绿门，是不同年代的记忆吗？',sources:['m2','m3'],kind:'conflict'}]:[]),...(!state.measured?[{text:'院子大约有多大？桌上有什么？',sources:[],kind:'gap'}]:[])],
    assumptions:['建筑样式、墙面与树叶的具体纹理由模型补全。','口述尺寸是估计；未看见的结构不能当作历史证据。','本例没有旧照片；所有回忆是编写的合成案例。'],
    description:`2002 年秋天，江南一座约 8 × 6 米的小院。左侧桂花树下摆着方木桌和两把竹凳，桌上是搪瓷杯与毛豆。正前方是褪色的蓝门，右侧有木窗与盆栽，温暖的下午阳光落进院子。${version===2?'蓝门右侧的盆栽旁，靠墙停着一辆红色小自行车。':''}`};
}
export function transition(previous,action,now=new Date().toISOString()){
  const s=structuredClone(previous);
  if(action.type==='start'){s.started=true;s.step=1;}
  else if(action.type==='clarify'){s.clarified=true;}
  else if(action.type==='measure'){s.measured=true;}
  else if(action.type==='bicycle'){if(!s.versions.length)throw Error('请先确认第一版。');s.bicycle=true;}
  else if(action.type==='step'){
    if(![1,2,3,4].includes(action.step))throw Error('未知章节。');
    if(action.step>=3&&!s.versions.length)throw Error('先核对并确认院子的描述。');
    s.step=action.step;
  }else if(action.type==='confirm'){
    const n=action.version;
    if(n!==1&&n!==2)throw Error('本案例只有两个已保存世界。');
    if(!s.clarified||!s.measured)throw Error('先补全年代和尺寸。');
    if(n===2&&(!s.bicycle||!s.versions.some(v=>v.version===1)))throw Error('先留下第一版，再补充自行车回忆。');
    if(!action.consent)throw Error('请先核对并勾选确认。');
    if(!s.versions.some(v=>v.version===n))s.versions.push({version:n,confirmedAt:now,scene:describe(s,n),sourceIds:visibleMessages(s).filter(m=>n===2||m.id!=='m6').map(m=>m.id),worldDirectory:WORLD_CATALOG[n].directory});
    s.activeVersion=n;s.step=3;
  }else if(action.type==='select'){
    if(!s.versions.some(v=>v.version===action.version))throw Error('这份版本尚未确认。');
    s.activeVersion=action.version;s.step=3;
  }else throw Error('未知操作。');
  return s;
}
export function restoreState(raw){
  try{
    const value=JSON.parse(raw);if(value?.schema!==1)throw Error('schema');
    let s=initialState();if(value.started)s=transition(s,{type:'start'});
    if(value.clarified)s=transition(s,{type:'clarify'});if(value.measured)s=transition(s,{type:'measure'});
    for(const n of[1,2]){const saved=value.versions?.find(v=>v.version===n);if(!saved)continue;
      if(n===2)s=transition(s,{type:'bicycle'});
      s=transition(s,{type:'confirm',version:n,consent:true},typeof saved.confirmedAt==='string'?saved.confirmedAt:new Date().toISOString());
    }
    if(value.bicycle&&s.versions.length)s=transition(s,{type:'bicycle'});
    if(s.versions.some(v=>v.version===value.activeVersion))s.activeVersion=value.activeVersion;
    if([1,2,3,4].includes(value.step)&&(value.step<3||s.versions.length))s.step=value.step;
    return s;
  }catch{return initialState();}
}
