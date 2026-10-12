import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'
import { SqliteD1 } from './sqlite-d1.js'

const envFor = db => ({DB:db, ALLOWED_EMAILS:'reviewer@example.test', PUBLISHER_TOKEN:'test-only',MISSION_TOKEN:'test-mission-only',STALE_AFTER_SECONDS:'300'})
function call(db,path,{body,auth=true,host='aries.flood.doctor',bearer}={}) {
  return worker.fetch(new Request('https://'+host+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{'Cf-Access-Authenticated-User-Email':'reviewer@example.test'}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body?{body:JSON.stringify(body)}:{})}),envFor(db),{})
}

test('operational health requires identity and separates stale data from worker availability',async()=>{
  const db=new SqliteD1()
  assert.deepEqual(await (await call(db,'/healthz',{auth:false})).json(),{ok:true})
  const missing=await (await call(db,'/healthz')).json()
  assert.equal(missing.operational.status,'degraded')
  assert.ok(missing.operational.sources.every(s=>s.status==='unknown'))
  const now=new Date().toISOString()
  for(const [table,column] of [['board_snapshot','snapshot_json'],['todo_catalogue','catalogue_json'],['worklist_snapshot','worklist_json']]) db.raw.prepare(`INSERT INTO ${table} VALUES(1,?,?)`).run('{"items":[]}',now)
  const healthy=await (await call(db,'/healthz',{auth:false,bearer:'test-mission-only',host:'aries-publish.flood.doctor'})).json()
  assert.equal(healthy.operational.status,'healthy')
  db.raw.exec("UPDATE board_snapshot SET published_at='2000-01-01T00:00:00Z'")
  const stale=await (await call(db,'/healthz')).json()
  assert.equal(stale.operational.status,'degraded')
  assert.equal(stale.operational.sources.find(s=>s.name==='board').status,'stale')
  db.close()
})

test('board validates the actual stored email subject and keeps structured evidence',async()=>{
  const db=new SqliteD1()
  const now=new Date().toISOString()
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:4342,title:'PetSmart promotional newsletter',assignee:'mark',identity:{claim_id:'CLAIM-42'},financials:[{type:'payment_issued',amount_minor:0,currency:'USD',source:'Carrier notice',date:'2026-10-10'}]}]}),now)
  db.raw.prepare('INSERT INTO board_threads VALUES(?,?,?)').run(4342,JSON.stringify({subject:'Work Authorisation routing',messages:[{body:'Review required'}]}),now)
  const result=await (await call(db,'/api/board')).json()
  const item=result.items[0]
  assert.ok(item.quality.issues.some(i=>i.code==='title_subject_mismatch'))
  assert.equal(item.financials[0].amount_minor,0)
  assert.equal(item.responsibility.owner,'mark')
  assert.equal(Object.hasOwn(item,'source_subject'),false)
  db.close()
})

test('retry endpoint requires teammate identity and explicit confirmation and records the actor',async()=>{
  const db=new SqliteD1()
  const now=new Date().toISOString()
  db.raw.prepare("INSERT INTO command_queue(operation,item_id,value,actor_email,state,created_at) VALUES('assign',81,'mark','original@example.test','failed',?)").run(now)
  assert.equal((await call(db,'/api/commands/1/retry',{auth:false,body:{confirm:true}})).status,403)
  assert.equal((await call(db,'/api/commands/1/retry',{body:{}})).status,400)
  const response=await call(db,'/api/commands/1/retry',{body:{confirm:true}})
  assert.equal(response.status,202)
  assert.equal((await response.json()).receipt.state,'queued')
  const history=db.raw.prepare("SELECT operation,actor_email,item_id,value FROM activity_log").get()
  assert.deepEqual({...history},{operation:'retry',actor_email:'reviewer@example.test',item_id:'81',value:'1'})
  assert.equal((await call(db,'/api/commands/1/retry',{body:{confirm:true}})).status,409)
  db.close()
})

test('authenticated publisher can claim and acknowledge through the HTTP contract',async()=>{
  const db=new SqliteD1()
  await call(db,'/api/action',{body:{operation:'assign',id:81,value:'mark'}})
  const opts={auth:false,host:'aries-publish.flood.doctor',bearer:'test-only'}
  const claim=await call(db,'/api/sync/commands',{...opts,body:{limit:1,lease_seconds:30}})
  assert.equal(claim.status,200)
  const [command]=(await claim.json()).commands
  assert.equal(command.attempt,1)
  assert.equal((await call(db,'/api/sync/commands/1/ack',{...opts,body:{status:'applied',lease_token:'wrong'}})).status,409)
  assert.equal((await call(db,'/api/sync/commands/1/ack',{...opts,body:{status:'applied',lease_token:command.lease_token}})).status,200)
  db.close()
})

test('bulk previews reject changed cards atomically without recording rejected actions',async()=>{
  const db=new SqliteD1()
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:81,title:'Review claim',assignee:'frank',status:'open'}]}),'2026-01-01T00:00:00Z')
  const payload={operation:'assign',id:81,value:'mark',expected:{command_id:0,assignee:'frank',due:'',status:'open'}}
  const batch=db.batch.bind(db)
  db.batch=async statements=>{
    db.raw.prepare("INSERT INTO command_queue(operation,item_id,value,actor_email,created_at) VALUES('assign',81,'dan','other@example.test',?)").run(new Date().toISOString())
    db.batch=batch
    return batch(statements)
  }
  assert.equal((await call(db,'/api/action',{body:payload})).status,409)
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM command_queue').get().n,1)
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n,0)
  assert.equal((await call(db,'/api/action',{body:payload})).status,409)
  const board=await (await call(db,'/api/board')).json()
  assert.equal(board.items[0].assignee,'dan')
  const fresh={...payload,expected:{...payload.expected,command_id:1,assignee:'dan'}}
  assert.equal((await call(db,'/api/action',{body:fresh})).status,202)
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n,1)
  db.close()
})

test('applied assignment remains visible until a newer source snapshot arrives',async()=>{
  const db=new SqliteD1()
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:81,title:'Review claim',assignee:'frank'}]}),'2026-01-01T00:00:00Z')
  db.raw.prepare("INSERT INTO command_queue(operation,item_id,value,actor_email,state,created_at,acked_at) VALUES('assign',81,'mark','reviewer@example.test','applied',?,?)").run('2026-10-01T00:00:00Z','2026-10-01T00:01:00Z')
  let board=await (await call(db,'/api/board')).json()
  assert.equal(board.items[0].assignee,'mark')
  assert.equal(board.items[0].responsibility.owner,'mark')
  assert.equal(board.items[0].pending,false)
  db.raw.exec("UPDATE board_snapshot SET published_at='2026-10-02T00:00:00Z'")
  board=await (await call(db,'/api/board')).json()
  assert.equal(board.items[0].assignee,'frank')
  db.close()
})

test('bulk preview is rejected when its prior command fails before the insert',async()=>{
  const db=new SqliteD1()
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:81,title:'Review claim',assignee:'frank',status:'open'}]}),'2026-01-01T00:00:00Z')
  db.raw.exec("INSERT INTO command_queue(operation,item_id,value,actor_email,created_at) VALUES('assign',81,'mark','reviewer@example.test','2026-10-01T00:00:00Z')")
  const batch=db.batch.bind(db)
  db.batch=async statements=>{
    db.raw.exec("UPDATE command_queue SET state='failed' WHERE id=1")
    db.batch=batch
    return batch(statements)
  }
  const payload={operation:'assign',id:81,value:'steve',expected:{command_id:1,assignee:'mark',due:'',status:'open'}}
  assert.equal((await call(db,'/api/action',{body:payload})).status,409)
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM command_queue').get().n,1)
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM activity_log').get().n,0)
  db.close()
})

test('prepared output and document links are bounded and preserve only safe typed links',async()=>{
  const db=new SqliteD1(),now=new Date().toISOString()
  const attachments=[{filename:'Safe PDF',href:'https://example.test/report.pdf'},{name:'Unsafe',url:'javascript:alert(1)'},{name:'Credentials',url:'https://name:password@example.test/file'}]
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:81,title:'Claim documents',attachments,prep:{status:'ready',at:now,output:'x'.repeat(7000),attachments}}]}),now)
  const board=await (await call(db,'/api/board')).json()
  assert.equal(board.items[0].prep.output.length,6000)
  assert.deepEqual(board.items[0].attachments,[{name:'Safe PDF',url:'https://example.test/report.pdf'}])
  assert.deepEqual(board.items[0].prep.attachments,board.items[0].attachments)
  db.close()
})
