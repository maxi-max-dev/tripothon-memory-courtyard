import { ProviderError } from './providers.mjs';
export const RESERVE_CENTS = Object.freeze({agent:10,image:5,world:20});
// One persistent allowance per service, across all projects and restarts. Failure
// does not release it: an upstream timeout may still have incurred a charge.
export function paidLedger(db, env=process.env) {
  db.exec(`CREATE TABLE IF NOT EXISTS paid_requests(kind TEXT NOT NULL, request_key TEXT NOT NULL, status TEXT NOT NULL, result_id TEXT, reserve_cents INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(kind,request_key));`);
  return {
    find(kind,key){return db.prepare('SELECT * FROM paid_requests WHERE kind=? AND request_key=?').get(kind,key);},
    reserve(kind,key){
      db.exec('BEGIN IMMEDIATE');
      try {
        const prior=this.find(kind,key);
        if(prior)throw new ProviderError('这个操作已提交，不能重复调用。结果不确定时请先在供应商平台核对。','ALREADY_SUBMITTED',409);
        const limit=Number(env[`PAID_TEST_MAX_${kind.toUpperCase()}_CALLS`]||0),budget=Number(env.PAID_TEST_BUDGET_USD||0);
        const used=db.prepare('SELECT COUNT(*) AS n FROM paid_requests WHERE kind=?').get(kind).n;
        const reserved=db.prepare('SELECT COALESCE(SUM(reserve_cents),0) AS cents FROM paid_requests').get().cents;
        if(!Object.hasOwn(RESERVE_CENTS,kind)||!Number.isInteger(limit)||limit<1||limit>1||used>=limit)
          throw new ProviderError('本地试用调用次数已用完或未授权。不会自动增加额度。','CALL_LIMIT',409);
        if(!Number.isFinite(budget)||budget<=0||reserved+RESERVE_CENTS[kind]>Math.round(budget*100))
          throw new ProviderError('超出已设置的本地预估预算。','BUDGET_LIMIT',409);
        db.prepare('INSERT INTO paid_requests VALUES(?,?,?,NULL,?,?)').run(kind,key,'reserved',RESERVE_CENTS[kind],new Date().toISOString());
        db.exec('COMMIT');
      } catch(error){db.exec('ROLLBACK');throw error;}
    },
    finish(kind,key,status,resultId=null){db.prepare('UPDATE paid_requests SET status=?,result_id=? WHERE kind=? AND request_key=?').run(status,resultId,kind,key);},
    summary(){return db.prepare('SELECT kind,status,reserve_cents,created_at FROM paid_requests ORDER BY rowid').all();}
  };
}

export function pollPlan({attempts,startedAt,now=Date.now(),errorCode=null}) {
  if(attempts>=60||now-startedAt>=60*60*1000)return {status:'needs_review',delay:0,message:'轮询已到 60 次或 1 小时上限。请核对已有操作编号，不重新生成。'};
  if(errorCode&&!['OUTCOME_UNKNOWN','UPSTREAM_408','UPSTREAM_429','UPSTREAM_500','UPSTREAM_502','UPSTREAM_503','UPSTREAM_504'].includes(errorCode))
    return {status:'needs_review',delay:0,message:'查询失败，已停止自动查询。请在供应商平台核对已有任务，不会重复生成。'};
  return {status:'running',delay:errorCode?Math.min(60000,5000*2**Math.min(attempts,4)):15000,message:errorCode?'查询暂时失败，稍后只查询已有任务。':null};
}
