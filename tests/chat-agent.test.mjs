import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createChatAgent} from '../lib/chat-agent.mjs';
import {paidLedger} from '../lib/paid-ledger.mjs';
function fixture(notify=()=>{}){const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE projects(id TEXT,title TEXT,revision INTEGER);INSERT INTO projects VALUES('p','合成院子',1);CREATE TABLE scenes(id TEXT,project_id TEXT,revision INTEGER,mode TEXT,data TEXT,evidence TEXT,created_at TEXT,approved_by TEXT,approved_at TEXT);`);const ledger=paidLedger(db),agent=createChatAgent({db,ledger,evidenceFor:()=>[{id:'m1',type:'message',text:'合成回忆：门是蓝色。'}],notify,draftsInProgress:new Set(),env:{}});return {db,agent};}
async function until(fn){for(let i=0;i<30;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('scheduler timeout');}
test('mock cap is persisted and a restart does not reset ten consumed runs',async()=>{
  let {db,agent}=fixture();for(let r=0;r<10;r++)db.prepare("INSERT INTO chat_agent_runs VALUES(?,?,?,'mock','succeeded',NULL,NULL,'synthetic')").run(`r${r}`,'p',r+10);
  agent.configure('p','mock',false);db.exec('UPDATE chat_agent_settings SET next_at=0');await until(()=>agent.state('p').status==='limited');assert.equal(agent.state('p').mode,'off');assert.equal(db.prepare('SELECT COUNT(*) n FROM scenes').get().n,0);agent.stop();
  agent=createChatAgent({db,ledger:paidLedger(db),evidenceFor:()=>[],notify:()=>{},draftsInProgress:new Set(),env:{}});assert.equal(agent.state('p').mockUsed,10);agent.stop();db.close();
});
test('pause during processing suppresses its result and never creates a world',async()=>{
  let f;f=fixture(()=>{if(f?.agent.state('p').status==='running')f.agent.configure('p','off',false);});f.agent.configure('p','mock',false);f.db.exec('UPDATE chat_agent_settings SET next_at=0');
  await until(()=>f.db.prepare("SELECT 1 FROM chat_agent_runs WHERE status='superseded'").get());assert.equal(f.db.prepare('SELECT COUNT(*) n FROM scenes').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM agent_posts').get().n,0);assert.equal(f.agent.state('p').mode,'off');f.agent.stop();f.db.close();
});
