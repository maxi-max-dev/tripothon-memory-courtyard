import {createHash,randomUUID} from 'node:crypto';
import {gate,quotationScene,synthesizeScene} from './providers.mjs';
const DEBOUNCE_MS=1800,MOCK_LIMIT=10;
const stamp=()=>new Date().toISOString();
const normalized=text=>text.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'').toLowerCase();

// Explicit deterministic simulator. No model call, image recognition or claim of
// semantic understanding. The same scheduler also owns the gated real adapter.
export function simulateChatScene(title,evidence){
  const scene=quotationScene(title,evidence),messages=evidence.filter(e=>e.type==='message');
  const texts=messages.map(e=>e.text).join('\n');scene.questions=[];
  const blue=messages.filter(e=>/门[^。\n]{0,16}蓝/.test(e.text));
  const green=messages.filter(e=>/门[^。\n]{0,16}绿/.test(e.text));
  if(blue.length&&green.length)scene.questions.push({text:'模拟规则检测到“门”的蓝/绿描述：是不同年代，还是同一时期的分歧？请大家补充。',sourceIds:[...new Set([...blue,...green].map(e=>e.id))],kind:'conflict'});
  if(!/(19|20)\d{2}\s*年/.test(texts))scene.questions.push({text:'模拟核对：这次要重现哪一年或哪个时期？',sourceIds:[],kind:'gap'});
  if(!/(米|步|平方米|平米)/.test(texts))scene.questions.push({text:'模拟核对：房间或院子大约多长、多宽？不知道时也可以说清楚。',sourceIds:[],kind:'gap'});
  if(!scene.questions.length)scene.questions.push({text:'模拟核对：从入口看，最想保留的物件分别在什么位置？',sourceIds:[],kind:'gap'});
  scene.assumptions=['模拟调度结果：逐条引用材料，仅用固定关键词规则演示缺口与冲突追问，未调用真实 AI、未识别图片。','无法观察到的结构与没有来源的细节仍是推测。'];
  return scene;
}

export function createChatAgent({db,ledger,evidenceFor,notify,draftsInProgress,env=process.env}){
  db.exec(`CREATE TABLE IF NOT EXISTS chat_agent_settings(project_id TEXT PRIMARY KEY,mode TEXT NOT NULL,consent INTEGER NOT NULL DEFAULT 0,generation INTEGER NOT NULL DEFAULT 0,next_at INTEGER,status TEXT NOT NULL,last_error TEXT,last_scene_id TEXT);
    CREATE TABLE IF NOT EXISTS chat_agent_runs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,revision INTEGER NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,scene_id TEXT,error TEXT,created_at TEXT NOT NULL,UNIQUE(project_id,revision,mode));
    CREATE TABLE IF NOT EXISTS agent_posts(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,run_id TEXT NOT NULL,text TEXT NOT NULL,source_ids TEXT NOT NULL,agent_mode TEXT NOT NULL,question_key TEXT,created_at TEXT NOT NULL,UNIQUE(project_id,agent_mode,question_key));`);
  // A restart is never permission to repeat a request with an uncertain outcome.
  db.exec("UPDATE chat_agent_runs SET status='needs_review',error='服务重启，处理中结果待核对；不重新提交。' WHERE status='running'");
  db.exec("UPDATE chat_agent_settings SET mode='off',next_at=NULL,status='needs_review',last_error='助手运行时服务重启，已暂停；请核对记录。' WHERE status='running'");
  const one=(sql,...p)=>db.prepare(sql).get(...p),run=(sql,...p)=>db.prepare(sql).run(...p);
  function state(projectId){
    const config=one('SELECT * FROM chat_agent_settings WHERE project_id=?',projectId)||{mode:'off',status:'off',next_at:null,last_error:null};
    const mockUsed=one("SELECT COUNT(*) n FROM chat_agent_runs WHERE project_id=? AND mode='mock'",projectId).n;
    const realUsed=one("SELECT COUNT(*) n FROM paid_requests WHERE kind='agent'").n;
    return {...config,debounceMs:DEBOUNCE_MS,mockUsed,mockLimit:MOCK_LIMIT,realRemaining:Math.max(0,Math.min(1,Number(env.PAID_TEST_MAX_AGENT_CALLS)||0)-realUsed)};
  }
  function configure(projectId,mode,consent){
    if(!['off','mock','openai'].includes(mode))throw Object.assign(new Error('未知助手模式。'),{status:400});
    if(mode==='openai')gate('agent',env,consent);
    run(`INSERT INTO chat_agent_settings VALUES(?,?,?,1,?,?,NULL,NULL) ON CONFLICT(project_id) DO UPDATE SET mode=excluded.mode,consent=excluded.consent,generation=generation+1,next_at=excluded.next_at,status=excluded.status,last_error=NULL`,projectId,mode,consent===true?1:0,mode==='off'?null:Date.now()+DEBOUNCE_MS,mode==='off'?'off':'pending');
    notify(projectId);return state(projectId);
  }
  function schedule(projectId){
    run("UPDATE chat_agent_settings SET next_at=?,status='pending',last_error=NULL WHERE project_id=? AND mode!='off'",Date.now()+DEBOUNCE_MS,projectId);notify(projectId);
  }
  function post(projectId,runId,mode,text,sourceIds=[],questionKey=null){
    run('INSERT OR IGNORE INTO agent_posts VALUES(?,?,?,?,?,?,?,?)',randomUUID(),projectId,runId,text,JSON.stringify(sourceIds),mode,questionKey,stamp());
  }
  async function execute(config){
    const projectId=config.project_id;if(draftsInProgress.has(projectId))return;
    const project=one('SELECT * FROM projects WHERE id=?',projectId);if(!project)return;
    const prior=one('SELECT * FROM chat_agent_runs WHERE project_id=? AND revision=? AND mode=?',projectId,project.revision,config.mode);
    if(prior){run("UPDATE chat_agent_settings SET next_at=NULL,status=?,last_error=? WHERE project_id=?",prior.status==='succeeded'?'idle':'needs_review',prior.error,projectId);notify(projectId);return;}
    if(config.mode==='mock'&&state(projectId).mockUsed>=MOCK_LIMIT){run("UPDATE chat_agent_settings SET mode='off',next_at=NULL,status='limited',last_error='本项目 10 次模拟整理已用完。' WHERE project_id=?",projectId);notify(projectId);return;}
    const evidence=evidenceFor(projectId);if(!evidence.length){run("UPDATE chat_agent_settings SET next_at=NULL,status='idle' WHERE project_id=?",projectId);notify(projectId);return;}
    draftsInProgress.add(projectId);const runId=randomUUID(),key=`${projectId}:${project.revision}`;let reserved=false;
    run('INSERT INTO chat_agent_runs VALUES(?,?,?,?,?,NULL,NULL,?)',runId,projectId,project.revision,config.mode,'running',stamp());
    run("UPDATE chat_agent_settings SET next_at=NULL,status='running' WHERE project_id=?",projectId);notify(projectId);
    try{
      let data,sceneId;
      if(config.mode==='mock'){await new Promise(resolve=>setTimeout(resolve,80));data=simulateChatScene(project.title,evidence);}
      else{
        gate('agent',env,config.consent===1);
        const saved=ledger.find('agent',key);
        if(saved?.status==='succeeded'&&saved.result_id){const row=one('SELECT * FROM scenes WHERE id=?',saved.result_id);data=JSON.parse(row.data);sceneId=row.id;}
        else{
          const photos=db.prepare('SELECT id,mime,bytes FROM photos WHERE project_id=?').all(projectId).map(p=>({id:p.id,mime:p.mime,base64:Buffer.from(p.bytes).toString('base64')}));
          if(photos.length>4||Buffer.byteLength(JSON.stringify({title:project.title,evidence}))>16000)throw Object.assign(new Error('真实整理的小测试上限是 4 张图片、16 KB 文字，请精简后由发起人重新启用。'),{code:'INPUT_LIMIT'});
          ledger.reserve('agent',key);reserved=true;
          data=await synthesizeScene({title:project.title,evidence,photos,consent:true},{env});
        }
      }
      const current=one('SELECT * FROM chat_agent_settings WHERE project_id=?',projectId);
      const revision=one('SELECT revision FROM projects WHERE id=?',projectId).revision;
      if(current.mode!==config.mode||current.generation!==config.generation||revision!==project.revision){
        run("UPDATE chat_agent_runs SET status='superseded',error='暂停、模式变化或新回忆使本次结果过期，未发布。' WHERE id=?",runId);
        if(reserved)ledger.finish('agent',key,'completed_stale');
        if(current.mode!=='off')schedule(projectId);return;
      }
      db.exec('BEGIN IMMEDIATE');
      try{
        if(!sceneId){sceneId=randomUUID();run('INSERT INTO scenes VALUES(?,?,?,?,?,?,?,NULL,NULL)',sceneId,projectId,project.revision,config.mode==='mock'?'mock':'openai',JSON.stringify(data),JSON.stringify(evidence),stamp());}
        const label=config.mode==='mock'?'模拟助手（非真实 AI）':'记忆助手';
        post(projectId,runId,config.mode,`${label}已整理资料 r${project.revision}，保存为待确认描述。${config.mode==='mock'?'仅用规则演示，未识图。':''}请查看场景描述和来源；不会自动生成世界。`);
        for(const q of data.questions.slice(0,3)){const fingerprint=createHash('sha256').update(normalized(q.text)).digest('hex');post(projectId,runId,config.mode,q.text,q.sourceIds,fingerprint);}
        run("UPDATE chat_agent_runs SET status='succeeded',scene_id=? WHERE id=?",sceneId,runId);
        run("UPDATE chat_agent_settings SET mode=?,next_at=NULL,status=?,last_error=NULL,last_scene_id=? WHERE project_id=?",config.mode==='openai'?'off':'mock',config.mode==='openai'?'completed_once':'idle',sceneId,projectId);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      if(reserved)ledger.finish('agent',key,'succeeded',sceneId);
    }catch(error){
      if(reserved)ledger.finish('agent',key,'needs_review');
      const message=error.status||error.code?error.message:'助手处理未完成，已暂停。请核对记录后再决定。';
      run("UPDATE chat_agent_runs SET status='blocked',error=? WHERE id=?",message,runId);
      run("UPDATE chat_agent_settings SET mode='off',next_at=NULL,status='blocked',last_error=? WHERE project_id=?",message,projectId);
    }finally{draftsInProgress.delete(projectId);notify(projectId);}
  }
  const timer=setInterval(()=>{for(const config of db.prepare("SELECT * FROM chat_agent_settings WHERE mode!='off' AND next_at IS NOT NULL AND next_at<=?").all(Date.now()))void execute(config).catch(()=>{draftsInProgress.delete(config.project_id);});},250);timer.unref();
  return {state,configure,schedule,stop:()=>clearInterval(timer)};
}
