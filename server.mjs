import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProviderError, gate, providerStatus, quotationScene, synthesizeScene, generateReference, worldProvider } from './lib/providers.mjs';

import { decodeSpz, encodeViewerPayload } from './lib/spz.mjs';
import { worldPayload } from './lib/world-assets.mjs';
import { paidLedger, pollPlan } from './lib/paid-ledger.mjs';
import { createChatAgent } from './lib/chat-agent.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.DATA_DIR || join(root, 'data'));
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 'tripothon.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,title TEXT NOT NULL,invite TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS members(project_id TEXT REFERENCES projects(id),user_id TEXT REFERENCES users(id),role TEXT NOT NULL,PRIMARY KEY(project_id,user_id));
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),user_id TEXT,author TEXT,text TEXT NOT NULL,sample INTEGER NOT NULL DEFAULT 0,client_id TEXT,created_at TEXT NOT NULL,UNIQUE(project_id,user_id,client_id));
 CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),user_id TEXT,name TEXT,mime TEXT,bytes BLOB,caption TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS scenes(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),revision INTEGER NOT NULL,mode TEXT NOT NULL,data TEXT NOT NULL,evidence TEXT NOT NULL,created_at TEXT NOT NULL,approved_by TEXT,approved_at TEXT);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),scene_id TEXT REFERENCES scenes(id),provider TEXT NOT NULL,status TEXT NOT NULL,operation_id TEXT,world TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(scene_id,provider));
 CREATE TABLE IF NOT EXISTS reference_images(id TEXT PRIMARY KEY,scene_id TEXT REFERENCES scenes(id),project_id TEXT REFERENCES projects(id),bytes BLOB,mime TEXT,created_at TEXT NOT NULL);
`);
const ledger=paidLedger(db);
db.exec('CREATE TABLE IF NOT EXISTS job_polls(job_id TEXT PRIMARY KEY,attempts INTEGER NOT NULL,next_at INTEGER NOT NULL,started_at INTEGER NOT NULL)');
let samplePayload;const assetLoads=new Map();
const one = (sql,...p) => db.prepare(sql).get(...p);
const all = (sql,...p) => db.prepare(sql).all(...p);
const run = (sql,...p) => db.prepare(sql).run(...p);
const id = () => randomUUID();
const now = () => new Date().toISOString();
const fail = (status,message,code='INVALID_REQUEST') => { throw Object.assign(new Error(message),{status,code}); };
const parse = value => value ? JSON.parse(value) : null;
const events = new Map();
const activeJobs = new Set();
const draftsInProgress = new Set();
const referencesInProgress = new Set();
function notify(project) { for (const res of events.get(project) || []) res.write(`event: update\ndata: ${JSON.stringify({ time: now() })}\n\n`); }
function change(project) { run('UPDATE projects SET revision=revision+1 WHERE id=?',project); notify(project); }
function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const value=fn(); db.exec('COMMIT'); return value; } catch(e) { db.exec('ROLLBACK'); throw e; } }
function userFor(req) {
  const token = /(?:^|; )tripothon_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  return token ? one('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=?',createHash('sha256').update(token).digest('hex')) : null;
}
function setUser(req,res,name) {
  const existing=userFor(req); if(existing) return existing;
  const user={id:id(),name:validText(name,'称呼',30)};
  const token=randomBytes(32).toString('hex');
  run('INSERT INTO users VALUES(?,?)',user.id,user.name);
  run('INSERT INTO sessions VALUES(?,?)',createHash('sha256').update(token).digest('hex'),user.id);
  res.setHeader('Set-Cookie',`tripothon_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`);
  return user;
}
function member(req,projectId,owner=false) {
  const user=userFor(req); if(!user) fail(401,'请先填写称呼，进入这个回忆空间。');
  const membership=one('SELECT * FROM members WHERE project_id=? AND user_id=?',projectId,user.id);
  if(!membership) fail(403,'你还没有加入这个项目。');
  if(owner && membership.role!=='owner') fail(403,'只有发起人可以确认描述和生成世界。');
  return {...user,role:membership.role};
}
function validText(value,label,max=4000) { if(typeof value!=='string'||!value.trim()||value.length>max) fail(400,`${label}不能为空，且不能超过 ${max} 字。`); return value.trim(); }
function sceneRow(row) { return row ? {...row,data:parse(row.data),evidence:parse(row.evidence)} : null; }
function jobRow(row) { return row ? {...row,world:parse(row.world)} : null; }
function state(projectId,user) {
  const project=one('SELECT * FROM projects WHERE id=?',projectId);
  const members=all('SELECT u.id,u.name,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY m.rowid',projectId);
  const scene=sceneRow(one('SELECT * FROM scenes WHERE project_id=? ORDER BY rowid DESC LIMIT 1',projectId));
  const confirmed=sceneRow(one('SELECT * FROM scenes WHERE project_id=? AND approved_at IS NOT NULL ORDER BY rowid DESC LIMIT 1',projectId));
  const scenes=all('SELECT id,revision,mode,approved_at,created_at FROM scenes WHERE project_id=? ORDER BY rowid',projectId).map((s,i)=>({...s,version:i+1}));
  const version=id=>scenes.find(s=>s.id===id)?.version;
  if(scene)scene.version=version(scene.id);if(confirmed)confirmed.version=version(confirmed.id);
  const jobs=all('SELECT * FROM jobs WHERE project_id=? ORDER BY rowid',projectId).map((j,i)=>({...jobRow(j),version:i+1,scene_version:version(j.scene_id),scene_revision:scenes.find(s=>s.id===j.scene_id)?.revision})).reverse();
  return {project,user:{...user,role:members.find(x=>x.id===user.id)?.role},members,
    messages:all('SELECT * FROM messages WHERE project_id=? ORDER BY rowid',projectId),
    photos:all('SELECT id,name,caption,mime,user_id,created_at FROM photos WHERE project_id=? ORDER BY rowid',projectId),
    scene,confirmed,scenes,jobs,chatAgent:chatAgent.state(projectId),
    agentPosts:all('SELECT * FROM agent_posts WHERE project_id=? ORDER BY rowid',projectId).map(p=>({...p,sourceIds:parse(p.source_ids)})),
    references:all('SELECT id,scene_id,created_at FROM reference_images WHERE project_id=? ORDER BY rowid DESC',projectId),
    providers:providerStatus(),paidUsage:ledger.summary(),draftBusy:draftsInProgress.has(projectId)};
}
function evidenceFor(projectId) {
  const messages=all('SELECT * FROM messages WHERE project_id=? ORDER BY rowid',projectId).map(x=>({id:x.id,type:'message',author:x.author,text:x.text,sample:!!x.sample}));
  const photos=all('SELECT id,name,caption FROM photos WHERE project_id=? ORDER BY rowid',projectId).map(x=>({...x,type:'photo'}));
  return [...messages,...photos];
}
const chatAgent=createChatAgent({db,ledger,evidenceFor,notify,draftsInProgress});
function photoFormat(bytes) {
  if(bytes.length>8*1024*1024) fail(413,'图片请控制在 8 MB 以内。');
  if(bytes.length>=24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if(bytes.length>=12 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  if(bytes.length>=16 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') return 'image/webp';
  fail(400,'请选择有效的 JPG、PNG 或 WebP 图片。');
}
async function body(req) {
  if(!(req.headers['content-type']||'').startsWith('application/json')) fail(415,'请求格式需为 JSON。');
  let size=0, chunks=[]; for await(const chunk of req) { size+=chunk.length; if(size>12*1024*1024) fail(413,'上传内容过大。'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { fail(400,'请求内容不是有效的 JSON。'); }
}
function respond(res,status,value) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value)); }
function updateJob(jobId,fields) {
  const allowed=['status','operation_id','world','error'];
  const entries=Object.entries(fields).filter(([key])=>allowed.includes(key));
  run(`UPDATE jobs SET ${entries.map(([k])=>`${k}=?`).join(',')},updated_at=? WHERE id=?`,...entries.map(([,v])=>v),now(),jobId);
  notify(one('SELECT project_id FROM jobs WHERE id=?',jobId).project_id);
}
function syntheticWorld(scene) {
  return {kind:'local-courtyard',schemaVersion:1,title:scene.data.title,sceneId:scene.id,savedAt:now(),
    provenance:'固定的原创程序场景，用于验证探索与保存；未根据聊天重建，非 AI / World Labs 生成。',
    geometry:{palette:'osmanthus',bounds:[-6,6,-5,5],tree:[-2.7,0,-1.3],table:[1.6,0,-1.3],door:[0,0,-4.9],start:[0,1.6,3.7]},
    sourceDescription:scene.data.description};
}
async function finishOperation(job,operation,provider) {
  if(operation.error) throw new ProviderError('World Labs 生成失败。请查看供应商任务后再尝试新版本。','GENERATION_FAILED',502);
  if(!operation.done) return false;
  let world=operation.response;
  if(world?.world) world=world.world;
  const worldId=world?.id || world?.world_id || operation.metadata?.world_id;
  if(!worldId) throw new ProviderError('生成任务未返回世界编号。','INVALID_RESPONSE',502);
  world=await provider.get(worldId);
  updateJob(job.id,{status:'succeeded',error:null,world:JSON.stringify({kind:'worldlabs',worldId,assets:world.assets||{},marbleUrl:world.world_marble_url||null,model:world.model,savedAt:now(),provenance:'World Labs API 生成。首次查看时归档 SPZ；轻量预览省略高阶球谐，没有碰撞体。'})});
  ledger.finish('world',job.scene_id,'succeeded',job.id);
  return true;
}
async function executeJob(jobId,selectedIds=[],consent=false) {
  if(activeJobs.has(jobId)) return;
  activeJobs.add(jobId);
  const job=one('SELECT * FROM jobs WHERE id=?',jobId);
  try {
    const scene=sceneRow(one('SELECT * FROM scenes WHERE id=?',job.scene_id));
    if(job.provider==='example') { updateJob(jobId,{status:'succeeded',world:JSON.stringify(syntheticWorld(scene))}); return; }
    const provider=worldProvider();
    if(!job.operation_id) {
      updateJob(jobId,{status:'submitting'});
      const media=[];
      for(const photoId of selectedIds) {
        const p=one('SELECT * FROM photos WHERE id=? AND project_id=?',photoId,job.project_id);
        const ref=one('SELECT * FROM reference_images WHERE id=? AND project_id=? AND scene_id=?',photoId,job.project_id,job.scene_id);
        const source=p||ref;
        if(!source) fail(400,'所选图片不属于这个项目或确认版本。');
        media.push(await provider.upload({bytes:source.bytes,extension:source.mime==='image/jpeg'?'jpg':source.mime.split('/')[1]},consent));
      }
      const op=await provider.start({title:scene.data.title,description:scene.data.description,media},consent);
      if(!op.operation_id) throw new ProviderError('生成请求没有返回任务编号，结果需要人工核对。','OUTCOME_UNKNOWN',502);
      updateJob(jobId,{status:'running',operation_id:op.operation_id});
      run('INSERT OR IGNORE INTO job_polls VALUES(?,0,?,?)',jobId,Date.now()+15000,Date.now());
      await finishOperation(job,op,provider);
    } else {
      let poll=one('SELECT * FROM job_polls WHERE job_id=?',jobId);
      if(!poll){run('INSERT INTO job_polls VALUES(?,0,0,?)',jobId,Date.parse(job.created_at));poll=one('SELECT * FROM job_polls WHERE job_id=?',jobId);}
      const plan=pollPlan({attempts:poll.attempts,startedAt:poll.started_at});
      if(plan.status==='needs_review'){updateJob(jobId,{status:plan.status,error:plan.message});return;}
      run('UPDATE job_polls SET attempts=attempts+1,next_at=? WHERE job_id=?',Date.now()+plan.delay,jobId);
      const op=await provider.poll(job.operation_id);
      if(!await finishOperation(job,op,provider))updateJob(jobId,{status:'running',error:null});
    }
  } catch(error) {
    // Never automatically repeat a potentially billable POST after an uncertain outcome.
    const current=one('SELECT * FROM jobs WHERE id=?',jobId);
    if(current.operation_id && error.code!=='GENERATION_FAILED') {
      const poll=one('SELECT * FROM job_polls WHERE job_id=?',jobId);
      const plan=pollPlan({attempts:poll?.attempts||0,startedAt:poll?.started_at||Date.parse(job.created_at),errorCode:error.code||'INVALID_RESPONSE'});
      run('UPDATE job_polls SET next_at=? WHERE job_id=?',Date.now()+plan.delay,jobId);
      updateJob(jobId,{status:plan.status,error:plan.message});
    } else {
      const status=['OUTCOME_UNKNOWN','INVALID_RESPONSE'].includes(error.code)?'needs_review':'failed';
      updateJob(jobId,{status,error:error.status?error.message:'生成任务失败，未自动重试。'});
      ledger.finish('world',job.scene_id,status,jobId);
    }
  } finally {activeJobs.delete(jobId);}
}

const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try {
    const host=req.headers.host||'';
    if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) fail(403,'此演示仅允许本机访问。');
    if(req.headers.origin && req.headers.origin!==`http://${host}`) fail(403,'请求来源不匹配。');
    const url=new URL(req.url,`http://${host}`), path=url.pathname;
    if(req.method==='GET' && path==='/api/health') return respond(res,200,{ok:true,persistence:'sqlite',providers:providerStatus()});
    if(req.method==='GET' && path==='/api/samples/hornedlizard/splats') {
      samplePayload ||= encodeViewerPayload(decodeSpz(readFileSync(join(root,'public/samples/hornedlizard.spz'))));
      res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'public, max-age=3600'});return res.end(samplePayload);
    }
    if(req.method==='GET' && /^\/api\/worlds\/[^/]+\/splats$/.test(path)) {
      const job=jobRow(one('SELECT * FROM jobs WHERE id=?',path.split('/')[3]));if(!job)fail(404,'世界不存在。');member(req,job.project_id);
      if(job.status!=='succeeded'||job.world?.kind!=='worldlabs')fail(409,'世界还没有可查看的 SPZ 资产。');
      if(!assetLoads.has(job.id))assetLoads.set(job.id,worldPayload(job,dataDir));
      try{const payload=await assetLoads.get(job.id);res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'private, max-age=3600'});return res.end(payload);}
      catch(error){fail(422,error.message,'ASSET_UNAVAILABLE');}finally{assetLoads.delete(job.id);}
    }
    if(req.method==='GET' && path==='/api/session') {
      const user=userFor(req), projectId=url.searchParams.get('project'), invite=url.searchParams.get('invite');
      const project=projectId?one('SELECT * FROM projects WHERE id=?',projectId):null;
      if(projectId&&!project) fail(404,'这个项目不存在。请检查邀请链接。');
      const membership=project&&user&&one('SELECT role FROM members WHERE project_id=? AND user_id=?',projectId,user.id);
      if(project&&!membership&&invite!==project.invite) fail(403,'邀请链接不完整或已失效。');
      return respond(res,200,{user,joined:!!membership,project:project?{id:project.id,title:project.title}:null});
    }
    if(req.method==='POST' && path==='/api/projects') {
      const input=await body(req),title=validText(input.title||'桂花树下的院子','项目名称',60);
      const projectId=id(),invite=randomBytes(18).toString('base64url');
      const user=transaction(()=>{
        const u=setUser(req,res,input.name);
        run('INSERT INTO projects VALUES(?,?,?,0,?)',projectId,title,invite,now());
        run('INSERT INTO members VALUES(?,?,?)',projectId,u.id,'owner');
        if(input.seedExample===true) {
          for(const [author,text] of [['示例 · 阿禾','小时候的院子很小，桂花树在左边。每到秋天，地上都是细碎的黄色花瓣。'],['示例 · 小满','树下有一张方木桌，下午我们会在这里剥毛豆。门好像是绿色的。'],['示例 · 阿禾','我记得门是褪色的蓝色，也可能是后来重新漆过。想留下的是 2002 年的那个秋天。']])
            run('INSERT INTO messages VALUES(?,?,?,?,?,1,?,?)',id(),projectId,null,author,text,id(),now());
          run('UPDATE projects SET revision=1 WHERE id=?',projectId);
        }
        return u;
      });
      return respond(res,201,state(projectId,user));
    }
    if(req.method==='POST' && path==='/api/join') {
      const input=await body(req),project=one('SELECT * FROM projects WHERE id=?',input.projectId);
      if(!project||project.invite!==input.invite) fail(403,'邀请链接不完整或已失效。');
      const user=transaction(()=>{
        const existing=userFor(req);
        if(existing&&one('SELECT 1 FROM members WHERE project_id=? AND user_id=?',project.id,existing.id)) return existing;
        if(one('SELECT COUNT(*) AS n FROM members WHERE project_id=?',project.id).n>=5) fail(409,'这个 Demo 最多支持 5 位参与者。');
        const u=setUser(req,res,input.name);run('INSERT INTO members VALUES(?,?,?)',project.id,u.id,'member');return u;
      });notify(project.id);return respond(res,200,state(project.id,user));
    }
    if(req.method==='GET' && path==='/api/state') {const user=member(req,url.searchParams.get('project'));return respond(res,200,state(url.searchParams.get('project'),user));}
    if(req.method==='POST' && path==='/api/agent/settings') {
      const input=await body(req);member(req,input.projectId,true);
      return respond(res,200,chatAgent.configure(input.projectId,input.mode,input.consent));
    }
    if(req.method==='GET' && path.startsWith('/api/scenes/')) {
      const scene=sceneRow(one('SELECT * FROM scenes WHERE id=?',path.split('/').pop()));if(!scene)fail(404,'描述快照不存在。');member(req,scene.project_id);return respond(res,200,scene);
    }
    if(req.method==='GET' && path==='/api/events') {
      const projectId=url.searchParams.get('project');member(req,projectId);
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('event: connected\ndata: {}\n\n');
      if(!events.has(projectId)) events.set(projectId,new Set());events.get(projectId).add(res);
      const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);
      req.on('close',()=>{clearInterval(timer);events.get(projectId)?.delete(res);});return;
    }
    if(req.method==='POST' && path==='/api/messages') {
      const input=await body(req),user=member(req,input.projectId),text=validText(input.text,'回忆',4000),clientId=validText(input.clientId,'消息编号',80);
      const prior=one('SELECT id FROM messages WHERE project_id=? AND user_id=? AND client_id=?',input.projectId,user.id,clientId);
      if(prior)return respond(res,200,{id:prior.id});
      if(one('SELECT COUNT(*) AS n FROM messages WHERE project_id=?',input.projectId).n>=200) fail(409,'当前 Demo 已达到 200 条回忆上限。');
      const messageId=id();transaction(()=>{run('INSERT INTO messages VALUES(?,?,?,?,?,0,?,?)',messageId,input.projectId,user.id,user.name,text,clientId,now());run('UPDATE projects SET revision=revision+1 WHERE id=?',input.projectId);});chatAgent.schedule(input.projectId);return respond(res,201,{id:messageId});
    }
    if(req.method==='POST' && path==='/api/photos') {
      const input=await body(req),user=member(req,input.projectId),name=validText(input.name,'图片名称',120);
      if(one('SELECT COUNT(*) AS n FROM photos WHERE project_id=?',input.projectId).n>=12) fail(409,'当前 Demo 最多保存 12 张图片。');
      if(typeof input.base64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64))fail(400,'图片数据无效。');
      const bytes=Buffer.from(input.base64,'base64'),mime=photoFormat(bytes),photoId=id();
      const caption=typeof input.caption==='string'?input.caption.trim().slice(0,1000):'';
      transaction(()=>{run('INSERT INTO photos VALUES(?,?,?,?,?,?,?,?)',photoId,input.projectId,user.id,name,mime,bytes,caption,now());run('UPDATE projects SET revision=revision+1 WHERE id=?',input.projectId);});
      chatAgent.schedule(input.projectId);return respond(res,201,{id:photoId});
    }
    if(req.method==='GET' && (path.startsWith('/api/photos/')||path.startsWith('/api/references/'))) {
      const table=path.startsWith('/api/photos/')?'photos':'reference_images';
      const photo=one(`SELECT * FROM ${table} WHERE id=?`,path.split('/').pop());if(!photo)fail(404,'图片未找到。');member(req,photo.project_id);
      res.writeHead(200,{'Content-Type':photo.mime,'Cache-Control':'private, max-age=3600'});return res.end(photo.bytes);
    }
    if(req.method==='POST' && path==='/api/scene') {
      const input=await body(req);member(req,input.projectId);
      if(!['example','openai'].includes(input.mode)) fail(400,'请选择示例整理或真实 AI。');
      const project=one('SELECT * FROM projects WHERE id=?',input.projectId);
      if(project.revision!==input.revision)fail(409,'已有新的回忆，请刷新后整理。');
      if(draftsInProgress.has(project.id))fail(409,'正在整理这个项目，请稍候。');
      if(input.mode==='openai') {
        gate('agent',process.env,input.consent);
        const previous=ledger.find('agent',`${project.id}:${project.revision}`);
        if(previous?.status==='succeeded'&&previous.result_id)return respond(res,200,{id:previous.result_id});
      }
      draftsInProgress.add(project.id);notify(project.id);
      try {
        const evidence=evidenceFor(project.id);if(!evidence.length)fail(400,'请先留下文字回忆或图片。');
        const photos=input.mode==='openai'?all('SELECT id,mime,bytes FROM photos WHERE project_id=?',project.id).map(x=>({id:x.id,mime:x.mime,base64:Buffer.from(x.bytes).toString('base64')})):[];
        if(input.mode==='openai')ledger.reserve('agent',`${project.id}:${project.revision}`);
        const data=input.mode==='example'?quotationScene(project.title,evidence):await synthesizeScene({title:project.title,evidence,photos,consent:input.consent});
        if(one('SELECT revision FROM projects WHERE id=?',project.id).revision!==project.revision)fail(409,'整理时收到新回忆，请重新整理最新内容。');
        const sceneId=id();run('INSERT INTO scenes VALUES(?,?,?,?,?,?,?,NULL,NULL)',sceneId,project.id,project.revision,input.mode,JSON.stringify(data),JSON.stringify(evidence),now());
        if(input.mode==='openai')ledger.finish('agent',`${project.id}:${project.revision}`,'succeeded',sceneId);
        return respond(res,201,{id:sceneId});
      } catch(error){if(input.mode==='openai'&&error.code!=='ALREADY_SUBMITTED')ledger.finish('agent',`${project.id}:${project.revision}`,'needs_review');throw error;} finally {draftsInProgress.delete(project.id);notify(project.id);}
    }
    if(req.method==='POST' && path==='/api/scene/edit') {
      const input=await body(req);member(req,input.projectId,true);
      const prior=sceneRow(one('SELECT * FROM scenes WHERE id=? AND project_id=?',input.sceneId,input.projectId));if(!prior)fail(404,'场景不存在。');
      const current=one('SELECT revision FROM projects WHERE id=?',input.projectId);if(current.revision!==prior.revision)fail(409,'请先整理新增回忆，再编辑描述。');
      const latest=one('SELECT id FROM scenes WHERE project_id=? ORDER BY rowid DESC LIMIT 1',input.projectId);if(latest.id!==prior.id)fail(409,'描述已被更新，请刷新。');
      const data={...prior.data,description:validText(input.description,'描述',16000),assumptions:[...prior.data.assumptions,'描述经发起人手动编辑，引用列表仅保留原始材料，未由 AI 再核验。']};
      const sceneId=id();run('INSERT INTO scenes VALUES(?,?,?,?,?,?,?,NULL,NULL)',sceneId,input.projectId,prior.revision,'manual',JSON.stringify(data),JSON.stringify(prior.evidence),now());notify(input.projectId);return respond(res,201,{id:sceneId});
    }
    if(req.method==='POST' && path==='/api/scene/confirm') {
      const input=await body(req),user=member(req,input.projectId,true);
      transaction(()=>{
        const scene=one('SELECT * FROM scenes WHERE id=? AND project_id=?',input.sceneId,input.projectId),project=one('SELECT revision FROM projects WHERE id=?',input.projectId);
        const latest=one('SELECT id FROM scenes WHERE project_id=? ORDER BY rowid DESC LIMIT 1',input.projectId);
        if(!scene||latest?.id!==scene.id||scene.revision!==project.revision)fail(409,'内容已更新，请确认最新版本。');
        if(!scene.approved_at)run('UPDATE scenes SET approved_by=?,approved_at=? WHERE id=?',user.id,now(),scene.id);
      });notify(input.projectId);return respond(res,200,{ok:true});
    }
    if(req.method==='POST' && path==='/api/reference') {
      const input=await body(req);member(req,input.projectId,true);
      const scene=sceneRow(one('SELECT * FROM scenes WHERE id=? AND project_id=?',input.sceneId,input.projectId));
      if(!scene?.approved_at||scene.revision!==one('SELECT revision FROM projects WHERE id=?',input.projectId).revision) fail(409,'请先确认最新描述。');
      const existing=one('SELECT id FROM reference_images WHERE scene_id=?',scene.id);if(existing)return respond(res,200,existing);
      gate('image',process.env,input.consent);
      if(referencesInProgress.has(scene.id))fail(409,'参考图正在生成。');referencesInProgress.add(scene.id);
      try{ledger.reserve('image',scene.id);const bytes=await generateReference({description:scene.data.description,consent:input.consent});const refId=id();
        run('INSERT INTO reference_images VALUES(?,?,?,?,?,?)',refId,scene.id,input.projectId,bytes,photoFormat(bytes),now());ledger.finish('image',scene.id,'succeeded',refId);notify(input.projectId);return respond(res,201,{id:refId});
      }catch(error){if(error.code!=='ALREADY_SUBMITTED')ledger.finish('image',scene.id,'needs_review');throw error;}finally{referencesInProgress.delete(scene.id);}
    }
    if(req.method==='POST' && path==='/api/worlds') {
      const input=await body(req);member(req,input.projectId,true);
      if(!['example','worldlabs'].includes(input.provider))fail(400,'未知世界生成服务。');
      const scene=sceneRow(one('SELECT * FROM scenes WHERE id=? AND project_id=?',input.sceneId,input.projectId));
      const latest=one('SELECT id FROM scenes WHERE project_id=? ORDER BY rowid DESC LIMIT 1',input.projectId);
      if(!scene?.approved_at||latest?.id!==scene.id||scene.revision!==one('SELECT revision FROM projects WHERE id=?',input.projectId).revision)fail(409,'请先由发起人确认最新的描述。');
      if(input.provider==='worldlabs'&&(!providerStatus().world.enabled||input.consent!==true))fail(503,'World Labs 未启用，或尚未确认资料发送与费用。','PROVIDER_BLOCKED');
      const selected=Array.isArray(input.photoIds)?input.photoIds:[];
      if(selected.length>4||new Set(selected).size!==selected.length)fail(400,'此 Demo 请最多选择 4 张不重复的同场景参考图。');
      for(const p of selected)if(!one('SELECT 1 FROM photos WHERE id=? AND project_id=?',p,input.projectId)&&!one('SELECT 1 FROM reference_images WHERE id=? AND project_id=? AND scene_id=?',p,input.projectId,scene.id))fail(400,'图片来源不属于当前项目或确认版本。');
      const existing=one('SELECT * FROM jobs WHERE scene_id=? AND provider=?',scene.id,input.provider);
      if(existing)return respond(res,200,jobRow(existing));
      if(input.provider==='worldlabs')ledger.reserve('world',scene.id);
      const jobId=id();run('INSERT INTO jobs VALUES(?,?,?,?,?,NULL,NULL,NULL,?,?)',jobId,input.projectId,scene.id,input.provider,'queued',now(),now());
      notify(input.projectId);respond(res,202,{id:jobId,status:'queued'});void executeJob(jobId,selected,input.consent);return;
    }
    if(path.startsWith('/api/'))fail(404,'接口不存在。');
    if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'方法不支持。');
    const requested=path==='/'?'/index.html':decodeURIComponent(path);
    const file=resolve(root,'public',`.${requested}`);
    if(!file.startsWith(join(root,'public')+'/')||!existsSync(file))fail(404,'页面未找到。');
    const content=readFileSync(file);
    const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[extname(file)]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
  }catch(error){if(!res.headersSent)respond(res,error.status||500,{error:error.status?error.message:'本地服务暂时出错，请重试。',code:error.code||'INTERNAL_ERROR'});else res.end();}
});

// Recover only queryable operations. Never resubmit unknown billable requests.
run("UPDATE jobs SET status='needs_review',error='服务重启前的提交结果不确定。请在供应商平台核对，不自动重复收费。' WHERE provider='worldlabs' AND status IN ('queued','submitting') AND operation_id IS NULL");
for(const job of all("SELECT id FROM jobs WHERE provider='example' AND status='queued'"))void executeJob(job.id);
const polling=setInterval(()=>{for(const job of all("SELECT j.id FROM jobs j LEFT JOIN job_polls p ON p.job_id=j.id WHERE j.provider='worldlabs' AND j.status='running' AND j.operation_id IS NOT NULL AND (p.next_at IS NULL OR p.next_at<=strftime('%s','now')*1000)"))void executeJob(job.id);},5000);
polling.unref();
const port=Number(process.env.PORT||4317),bind=process.env.HOST||'127.0.0.1';
if(!['127.0.0.1','localhost'].includes(bind))throw new Error('This demo is restricted to loopback.');
server.listen(port,bind,()=>console.log(`Tripothon local demo: http://${bind}:${server.address().port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(polling);chatAgent.stop();for(const group of events.values())for(const res of group)res.end();server.close(()=>{db.close();process.exit(0);});});
