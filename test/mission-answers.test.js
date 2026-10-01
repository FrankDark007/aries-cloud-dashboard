import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker from '../src/index.js'
import { parseOptions, taskFailure } from '../src/mission-state.js'
import { MISSION_HTML } from '../src/mission-ui.js'

// Execute the actual SQL, including partial indexes and RETURNING, rather than simulate claims.
function fixture() {
  const db=new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0010_mission.sql',import.meta.url),'utf8'))
  db.exec(readFileSync(new URL('../migrations/0011_mission_answers.sql',import.meta.url),'utf8'))
  db.exec(readFileSync(new URL('../migrations/0012_mission_answers_by.sql',import.meta.url),'utf8'))
  db.prepare('INSERT INTO mission_records VALUES(?,?,?,?)').run('decision','TEST-C33',JSON.stringify({options:'Later,Review (recommended)'}),'2026-10-01T10:00:00Z')
  db.prepare('INSERT INTO mission_records VALUES(?,?,?,?)').run('task','TEST-task',JSON.stringify({status:'running'}),'2026-10-01T10:00:00Z')
  const env={MISSION_TOKEN:'TEST-only',ALLOWED_EMAILS:'frank@example.test',ALLOWED_EMAIL_DOMAINS:'flood.doctor',DB:{prepare(sql){return {values:[],bind(...values){this.values=values;return this},async all(){return {results:db.prepare(sql).all(...this.values)}},async first(){return db.prepare(sql).get(...this.values)}}}}}
  const call=(path,body,headers={},method=body===undefined?'GET':'POST',host='aries.flood.doctor')=>worker.fetch(new Request('https://'+host+path,{method,headers:{'Cf-Access-Authenticated-User-Email':'frank@example.test',Origin:'https://aries.flood.doctor','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{})
  const answer=(body,headers={})=>call('/api/mission/answer',{card_id:'TEST-C33',...body},headers)
  const poll=(mode,by='TEST-session')=>call('/api/mission/answers',{mode,by},{Authorization:'Bearer TEST-only'},'POST','aries-publish.flood.doctor')
  return {db,call,answer,poll}
}
for (const [name,value] of Object.entries({comma:'Later,Review (recommended)',or:'Later or Review (recommended)',semicolon:'Later;Review (recommended)',newline:'Later\nReview (recommended)',array:['Later','Review (recommended)']})) {
  test('options parse '+name+' and put recommendation first',()=>assert.deepEqual(parseOptions(value),[{label:'Review',recommended:true},{label:'Later',recommended:false}]))
}
test('options trim blanks and ignore non-string items',()=>assert.deepEqual(parseOptions([' ; ',' Review (Recommended) ',null,' Later ']),[{label:'Review',recommended:true},{label:'Later',recommended:false}]))
test('answer writes and reads refuse missing or disallowed Access identity',async()=>{
  const f=fixture()
  for(const email of ['', 'other@evil.test','x@flood.doctor.evil.test']) {
    assert.equal((await f.answer({kind:'choice',choice:'Later'},{'Cf-Access-Authenticated-User-Email':email})).status,401)
    assert.equal((await f.call('/api/mission/answers',undefined,{'Cf-Access-Authenticated-User-Email':email})).status,401)
  }
  assert.equal((await f.answer({kind:'choice',choice:'Later'},{'Cf-Access-Authenticated-User-Email':'staff@flood.doctor'})).status,200)
  assert.equal((await f.poll('all')).status,200)
  assert.equal((await f.call('/api/mission/answers',{mode:'new'},{Authorization:'Bearer wrong'},'POST','aries-publish.flood.doctor')).status,401)
})
test('writes enforce same origin, JSON, card pattern, existence, choice and length',async()=>{
  const f=fixture(),valid={kind:'choice',choice:'Later'}
  for(const origin of ['', 'https://evil.test','https://aries.flood.doctor.evil.test']) assert.equal((await f.answer(valid,{Origin:origin})).status,403)
  assert.equal((await f.answer(valid,{'Content-Type':'text/plain'})).status,415)
  for(const body of [{card_id:'../secret'}, {card_id:'missing'}, {card_id:'TEST-C33',choice:'invented'},{kind:'nope'},{kind:'text',text:'',request_id:'one'},{kind:'text',text:'x'.repeat(4001),request_id:'two'}]) assert.ok((await f.answer({...valid,...body})).status>=400)
  assert.equal((await f.answer({kind:'text',text:'x'.repeat(4000),request_id:'limit'})).status,200)
  assert.equal((await f.answer({card_id:'TEST-task',kind:'text',text:'TEST instruction',request_id:'task'})).status,200)
})
test('author and UTC timestamps are server stamped and reads show only own answers',async()=>{
  const f=fixture(),before=Date.now()
  const r=await (await f.answer({kind:'choice',choice:'Later',author:'attacker',created:'1900',received:'1900'})).json()
  assert.ok(Date.parse(r.answer.created)>=before)
  const row=f.db.prepare('SELECT * FROM mission_answers').get()
  assert.equal(row.author,'frank@example.test');assert.equal(row.received,null)
  assert.equal((await (await f.call('/api/mission/answers')).json()).answers.length,1)
  assert.equal((await (await f.call('/api/mission/answers',undefined,{'Cf-Access-Authenticated-User-Email':'staff@flood.doctor'})).json()).answers.length,0)
})
test('choice changes before receipt, locks after receipt, and text stays available',async()=>{
  const f=fixture()
  const first=await (await f.answer({kind:'choice',choice:'Later'})).json()
  const second=await (await f.answer({kind:'choice',choice:'Review'})).json()
  assert.equal(first.answer.id,second.answer.id)
  assert.equal(second.answer.choice,'Review')
  assert.equal((await (await f.poll('all')).json()).answers.length,1)
  assert.equal(f.db.prepare('SELECT received FROM mission_answers').get().received,null)
  assert.equal((await (await f.poll('new')).json()).answers[0].choice,'Review')
  assert.equal((await f.answer({kind:'choice',choice:'Later'})).status,409)
  assert.equal((await f.answer({kind:'text',text:'TEST: change my choice',request_id:'change'})).status,200)
})
test('two concurrent pollers atomically receive each answer once',async()=>{
  const f=fixture()
  await f.answer({kind:'choice',choice:'Later'})
  await f.answer({kind:'text',text:'TEST text',request_id:'text'})
  const replies=await Promise.all([f.poll('new'),f.poll('new')])
  const rows=(await Promise.all(replies.map(r=>r.json()))).flatMap(r=>r.answers)
  assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.id)).size,2)
  assert.deepEqual((await (await f.poll('new')).json()).answers,[])
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mission_answers WHERE received IS NOT NULL').get().n,2)
})
test('safe retries keep a text submission once after a lost response',async()=>{
  const f=fixture(),body={kind:'text',text:'TEST retry',request_id:'same-request'}
  const a=await (await f.answer(body)).json(),b=await (await f.answer(body)).json()
  assert.equal(a.answer.id,b.answer.id)
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mission_answers').get().n,1)
})
test('tile counts actual failures while stale runs and successful stops stay visible',()=>{
  const rows=[{data:{status:'running',step:'quiet for two days'}},{data:{status:'stopped',step:'rc=0'}},{data:{status:'failed',step:'down'}},{data:{status:'stopped',step:'rc=1'}},{data:{status:'stopped',failure_cause:'connection lost'}},{data:{status:'done',step:'old failure recovered'}},{data:{status:'waiting'}}]
  assert.equal(rows.filter(taskFailure).length,3)
  assert.match(MISSION_HTML,/stuck=tasks\.filter\(x=>x\.failure\)/)
  assert.match(MISSION_HTML,/svcBad=svc\.filter\(s=>s\.st==='down'\|\|s\.st==='stale'\)/)
})
test('Mission script parses and includes accessible card controls and retained drafts',()=>{
  const script=MISSION_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]
  assert.doesNotThrow(()=>new Function(script))
  for(const text of ['aria-pressed','Your instructions','aria-live="polite"','font:16px','min-height:48px','sessionStorage.missionDrafts','AbortSignal.timeout(20000)','Received. Use Your instructions'])assert.ok(MISSION_HTML.includes(text),text)
})

test('receipt records winning session and all and own reads retain it',async()=>{
  const f=fixture();await f.answer({kind:'choice',choice:'Later'})
  const replies=await Promise.all([f.poll('new','TEST-one'),f.poll('new','TEST-two')])
  const rows=(await Promise.all(replies.map(r=>r.json()))).flatMap(r=>r.answers)
  assert.equal(rows.length,1);assert.ok(['TEST-one','TEST-two'].includes(rows[0].by))
  assert.equal(rows[0].received_by,rows[0].by);assert.ok(rows[0].received)
  assert.equal((await (await f.poll('all')).json()).answers[0].by,rows[0].by)
  assert.equal((await (await f.call('/api/mission/answers')).json()).answers[0].received_by,rows[0].by)
  assert.equal((await f.poll('new','bad\ncontext')).status,400)
})

test('answer states use Eastern clocks, warn at exactly 15 minutes, and clear on receipt',()=>{
  const script=MISSION_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]
  const start=script.indexOf('function answerStatus('),end=script.indexOf('let records=',start)
  const render=new Function('esc','mins',script.slice(start,end)+';return answerStatus')
  const now=Date.parse('2026-10-01T15:35:00Z')
  const status=render(x=>String(x).replace(/</g,'&lt;'),s=>Math.floor((now-Date.parse(s))/60000))
  const a={created:'2026-10-01T15:21:00Z'}
  assert.equal(status(a),'Sent 11:21 AM, waiting for a session')
  a.created='2026-10-01T15:20:00Z'
  assert.match(status(a),/class="w warn".*Not read yet, sent 15 minutes ago. No session has picked it up./)
  a.created='2026-10-01T15:19:00Z';assert.match(status(a),/sent 16 minutes ago/)
  a.received='2026-10-01T15:35:00Z';a.received_by='TEST-session'
  assert.equal(status(a),'Received by <code class="session-tag">TEST-session</code> at 11:35 AM ET')
  assert.doesNotMatch(status(a),/warn|Not read/)
  a.received_by='<script>';assert.match(status(a),/&lt;script>/)
})
