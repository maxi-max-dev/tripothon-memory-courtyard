import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {paidLedger,pollPlan} from '../lib/paid-ledger.mjs';
const env={PAID_TEST_MAX_AGENT_CALLS:'1',PAID_TEST_MAX_IMAGE_CALLS:'1',PAID_TEST_MAX_WORLD_CALLS:'1',PAID_TEST_BUDGET_USD:'.35'};
test('paid allowance defaults to zero, rejects invalid limits and insufficient budget',()=>{
  for(const config of [{},{...env,PAID_TEST_MAX_AGENT_CALLS:'2'},{...env,PAID_TEST_BUDGET_USD:'.01'}]){const db=new DatabaseSync(':memory:');assert.throws(()=>paidLedger(db,config).reserve('agent','scene'));db.close();}
});
test('duplicate clicks, different projects and restart cannot repeat charged requests',()=>{
  const folder=mkdtempSync(join(tmpdir(),'tripothon-ledger-')),file=join(folder,'test.sqlite');let db=new DatabaseSync(file),ledger=paidLedger(db,env);
  for(const kind of ['agent','image','world']){ledger.reserve(kind,kind+'-1');assert.throws(()=>ledger.reserve(kind,kind+'-1'),e=>e.code==='ALREADY_SUBMITTED');ledger.finish(kind,kind+'-1','needs_review');assert.throws(()=>ledger.reserve(kind,'another-project'),e=>e.code==='CALL_LIMIT');}
  db.close();db=new DatabaseSync(file);ledger=paidLedger(db,env);assert.equal(ledger.summary().length,3);assert.throws(()=>ledger.reserve('world','new-scene'),e=>e.code==='CALL_LIMIT');db.close();rmSync(folder,{recursive:true});
});
test('successful call result is recoverable without invoking a second provider request',()=>{
  const db=new DatabaseSync(':memory:'),ledger=paidLedger(db,env);ledger.reserve('image','scene');ledger.finish('image','scene','succeeded','image-id');assert.equal(ledger.find('image','scene').result_id,'image-id');assert.throws(()=>ledger.reserve('image','scene'));db.close();
});
test('polling backs off on transient failures, stops on auth/schema error, age or attempts',()=>{
  const startedAt=1000,now=2000;
  assert.equal(pollPlan({attempts:2,startedAt,now,errorCode:'UPSTREAM_429'}).delay,20000);
  assert.equal(pollPlan({attempts:7,startedAt,now,errorCode:'OUTCOME_UNKNOWN'}).delay,60000);
  assert.equal(pollPlan({attempts:2,startedAt,now}).message,null);
  for(const input of [{attempts:60,startedAt,now},{attempts:1,startedAt,now:3601000},{attempts:2,startedAt,now,errorCode:'UPSTREAM_401'},{attempts:2,startedAt,now,errorCode:'INVALID_RESPONSE'}])assert.equal(pollPlan(input).status,'needs_review');
});
