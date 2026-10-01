// Explicit TEST-only harness: installed Worker code, synthetic allowed Access identity, live D1.
import assert from 'node:assert/strict'
import worker from '../src/index.js'
const account=process.env.C34_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN
if(!account||!token)throw Error('Required environment is missing')
const query=async(sql,params=[])=>{
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/33888fc5-0e13-413a-8a51-5b0cc365703b/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params})})
  const body=await response.json();if(!body.success)throw Error('D1 query failed')
  return body.result[0]
}
const env={ALLOWED_EMAILS:'frank@example.test',DB:{prepare(sql){return{values:[],bind(...values){this.values=values;return this},async all(){return query(sql,this.values)},async first(){return (await query(sql,this.values)).results[0]},async run(){return query(sql,this.values)}}}}}
const call=(path,body)=>worker.fetch(new Request('https://aries.flood.doctor'+path,{method:body?'POST':'GET',headers:{'Cf-Access-Authenticated-User-Email':'frank@example.test','Origin':'https://aries.flood.doctor','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{})
const action=process.argv[2]
if(action==='post'){
 const r=await call('/api/mission/answer',{card_id:'TEST-C34',kind:'text',text:'TEST C34: A. Keep my Mission instructions across sessions.',request_id:'TEST-C34-proof'})
 const j=await r.json();assert.equal(r.status,200);assert.equal(j.answer.card_id,'TEST-C34');console.log(JSON.stringify({method:'Worker test harness with synthetic TEST Access identity and live D1',...j}))
}else if(action==='read'){
 const records=await (await call('/api/mission')).json(),answers=await (await call('/api/mission/answers')).json()
 console.log(JSON.stringify({records:records.records.filter(r=>r.id==='TEST-C34'),answers:answers.answers.filter(r=>r.card_id==='TEST-C34')}))
}else if(action==='cleanup'){
 await query("DELETE FROM mission_answers WHERE card_id='TEST-C34'")
 await query("DELETE FROM mission_records WHERE id='TEST-C34'")
 const results=await query("SELECT (SELECT COUNT(*) FROM mission_answers WHERE card_id='TEST-C34') answers,(SELECT COUNT(*) FROM mission_records WHERE id='TEST-C34') cards")
 assert.deepEqual(results.results,[{answers:0,cards:0}]);console.log(JSON.stringify(results.results[0]))
}else throw Error('TEST action required')
