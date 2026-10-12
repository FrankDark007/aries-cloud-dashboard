import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { evidenceFreshness, taskState, taskCounts, sourceFreshness, machineTelemetry, serviceState } from '../src/mission-state.js'
import { checkServices, serviceProbe } from '../src/mission.js'
import { MISSION_HTML } from '../src/mission-ui.js'

const now=Date.parse('2026-10-11T20:00:00Z'),fresh=new Date(now-60000).toISOString(),old=new Date(now-7200000).toISOString()
const record=(id,data,updated=fresh,kind='task')=>({kind,id,data,updated})

function view() {
  const elements=new Map()
  const element=id=>{if(!elements.has(id))elements.set(id,{id,value:'',innerHTML:'',textContent:'',style:{},focus(){},setSelectionRange(){}});return elements.get(id)}
  const document={activeElement:null,getElementById:element,querySelectorAll:()=>[]}
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  const context=vm.createContext({document,Date:Clock,Intl,sessionStorage:{},console,AbortSignal,crypto,navigator:{onLine:true}})
  const script=MISSION_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]
  vm.runInContext(script.slice(0,script.indexOf("document.addEventListener('input'")),context)
  const render=records=>{context.input=records;vm.runInContext('records=input;render()',context)}
  return {context,document,element,render}
}

test('stale and missing runs retain lifecycle, stopped success is separate from failure',()=>{
  const rows=[record('old',{status:'running',origin:'backfill',source_updated:old}),record('missing',{status:'running',origin:'backfill'}),record('stop',{status:'stopped',step:'rc=0'}),record('fail',{status:'stopped',step:'rc=2'}),record('wait',{status:'waiting'})]
  const states=rows.map(r=>taskState(r,now)),counts=taskCounts(states)
  assert.equal(counts.running,2);assert.equal(counts.failed,1);assert.equal(counts.stopped,1);assert.equal(counts.waiting,1)
  assert.equal(states[0].evidence.status,'stale');assert.equal(states[1].evidence.status,'missing')
  assert.equal(states[0].failure,false);assert.equal(states[1].failure,false)
})

test('top and section counts render the same stale running tasks and distinguish confirmed issues',()=>{
  const ui=view(),rows=Array.from({length:15},(_,i)=>record('C'+i,{status:'running',origin:'backfill',source_updated:old}))
  ui.render([...rows,record('P',{title:'Stage',tasks:rows.map(r=>r.id).join(',')},fresh,'project')])
  assert.match(ui.element('strip').innerHTML,/<b>15<\/b><span>reported running/)
  assert.match(ui.element('tasks').innerHTML,/15 running · 0 waiting/)
  assert.match(ui.element('strip').innerHTML,/<b>0<\/b><span>confirmed issues/)
  assert.match(ui.element('tasks').innerHTML,/Evidence stale/)
  assert.doesNotMatch(ui.element('tasks').innerHTML,/Stuck:|task stuck/)
})

test('missing and invalid timestamps never count current; recent polling cannot freshen backfill evidence',()=>{
  for(const value of [null,undefined,'','garbage','2099-01-01T00:00:00Z']) assert.equal(evidenceFreshness(value,5,now).status,'missing')
  const rows=[record('old',{status:'running',origin:'backfill',source_updated:old}),record('none',{status:'running',origin:'backfill'}),record('live',{status:'running',origin:'cli'})]
  const summary=sourceFreshness(rows,now),backfill=summary.find(s=>s.name==='Tasks · backfill')
  assert.equal(backfill.current,0);assert.equal(backfill.stale,1);assert.equal(backfill.missing,1)
  assert.equal(backfill.latest,old);assert.equal(backfill.oldest,old)
  assert.equal(summary.find(s=>s.name==='Tasks · cli').current,1)
})

test('fresh activity wins over old status evidence and latest/oldest report actual timestamps',()=>{
  const recent=record('recent',{status:'running',status_source:'progress log',source_updated:old,activity_updated:fresh})
  assert.equal(taskState(recent,now).evidence.at,fresh)
  const [summary]=sourceFreshness([recent,record('older',{status:'running',status_source:'progress log',source_updated:old})],now)
  assert.equal(summary.latest,fresh);assert.equal(summary.oldest,old)
})

test('machine rolling utilization and recorded chunk do not invent a current job or queue',()=>{
  const legacy=record('halo1',{reachable:true,busy:'80%',chunk:'Previous batch',runner_updated:old},fresh,'machine')
  const state=machineTelemetry(legacy,now)
  assert.equal(state.state,'online');assert.equal(state.job,null);assert.equal(state.queue,null)
  const ui=view();ui.render([legacy])
  assert.match(ui.element('mach').innerHTML,/Rolling busy/)
  assert.match(ui.element('mach').innerHTML,/Current job:<\/b> Unknown/)
  assert.match(ui.element('mach').innerHTML,/Queue depth:<\/b> Unknown/)
  assert.match(ui.element('mach').innerHTML,/Last recorded work:<\/b> Previous batch/)
  assert.equal(machineTelemetry(record('halo2',{},null,'machine'),now).state,'missing')
})

test('machine current work and zero queue require current heartbeat and observation',()=>{
  const row=record('halo1',{reachable:true,current_job:'Read documents',queue_depth:0,runner_heartbeat:fresh},fresh,'machine')
  let state=machineTelemetry(row,now)
  assert.equal(state.jobCurrent,true);assert.equal(state.queueCurrent,true);assert.equal(state.queue,0)
  row.data.runner_heartbeat=old;state=machineTelemetry(row,now)
  assert.equal(state.jobCurrent,false);assert.equal(state.queueCurrent,false)
  row.data.runner_heartbeat=fresh;row.updated=old;state=machineTelemetry(row,now)
  assert.equal(state.state,'stale');assert.equal(state.jobCurrent,false)
  row.updated=fresh;row.data.queue_depth='0';assert.equal(machineTelemetry(row,now).queue,null)
})

test('homepage, minimal health JSON, Access, stale checks and operational evidence stay distinct',()=>{
  for(const text of ['<html>Home</html>','{"ok":true}','{"status":"healthy"}']) {
    const probe=serviceProbe(200,text,now)
    assert.equal(probe.availability,'available');assert.equal(probe.operational.status,'unknown')
  }
  assert.equal(serviceProbe(302,'',now).availability,'gated')
  assert.equal(serviceProbe(403,'',now).operational.status,'unknown')
  const payload={operational:{status:'healthy',checked_at:fresh,sources:[{name:'inbox',status:'current',last_evidence_at:fresh}],queue:{pending:0,failed:0}}}
  assert.equal(serviceProbe(200,JSON.stringify(payload),now).operational.status,'healthy')
  payload.operational.sources[0].last_evidence_at=null
  assert.equal(serviceProbe(200,JSON.stringify(payload),now).operational.status,'unknown')
  payload.operational.status='degraded'
  assert.equal(serviceProbe(200,JSON.stringify(payload),now).operational.status,'degraded')
  payload.operational.checked_at=old
  assert.equal(serviceProbe(200,JSON.stringify(payload),now).operational.status,'unknown')
  assert.equal(serviceState(record('aries',{status:'up',operational:{status:'healthy',checked_at:fresh}},null,'service'),now).operational,'unknown')
})

test('healthy service claims require source timestamps within their own cadence and never in the future',()=>{
  const probe=(last_evidence_at,after_seconds,checked_at=fresh)=>serviceProbe(200,JSON.stringify({operational:{status:'healthy',checked_at,sources:[{name:'inbox',status:'current',last_evidence_at,...(after_seconds===undefined?{}:{after_seconds})}]}}),now).operational.status
  assert.equal(probe(fresh),'healthy')
  assert.equal(probe(old),'unknown')
  assert.equal(probe(new Date(now-600001).toISOString()),'unknown')
  assert.equal(probe(new Date(now+1000).toISOString()),'unknown')
  assert.equal(probe(new Date(now+3600000).toISOString()),'unknown')
  assert.equal(probe(fresh,30),'unknown')
  assert.equal(probe(fresh,60),'healthy')
  assert.equal(probe(new Date(now-60001).toISOString(),60),'unknown')
  assert.equal(probe(old,7200),'healthy')
  for (const invalid of [null,0,-1,'600']) assert.equal(probe(fresh,invalid),'unknown')
  assert.equal(probe(fresh,600,new Date(now+1000).toISOString()),'unknown')
  assert.equal(probe(fresh,600,new Date(now-600001).toISOString()),'unknown')
})

test('service probes retain authenticated bindings and make GET-only checks',async t=>{
  const calls=[],saved=[]
  const response=()=>Response.json({ok:true})
  t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return response()})
  const env={MISSION_TOKEN:'fixture-token',ENGINE_ACCESS_ID:'fixture-id',ENGINE_ACCESS_SECRET:'fixture-secret',SELF:{async fetch(url,init){calls.push({url,init});return response()}},ENGINE:{async fetch(url,init){calls.push({url,init});return response()}},DB:{prepare(){return {bind(...args){saved.push(args);return this},async run(){return {}}}}}}
  await checkServices(env,'test')
  assert.equal(calls.length,4);assert.equal(saved.length,4)
  assert.ok(calls.every(c=>(c.init.method||'GET')==='GET'))
  assert.equal(calls.find(c=>c.url==='https://aries.flood.doctor/healthz').init.headers.Authorization,'Bearer fixture-token')
  assert.equal(calls.find(c=>c.url.includes('engine.')).init.headers['CF-Access-Client-Id'],'fixture-id')
  assert.ok(saved.every(args=>JSON.parse(args[2]).operational.status==='unknown'))
})

test('Needs you opens the exact raw todo id and refresh preserves task drafts and focus',async()=>{
  const ui=view(),id='claim/42 & review',task=record('C1',{status:'running',title:'Task'})
  let focused=0,selection
  const input=ui.element('instruction-C1');Object.assign(input,{tagName:'TEXTAREA',selectionStart:2,selectionEnd:5,focus(){focused++},setSelectionRange(...args){selection=args}})
  ui.document.activeElement=input
  vm.runInContext("drafts.set('C1','Keep this instruction');open.add('C1')",ui.context)
  ui.context.fetch=async path=>Response.json(path==='/api/todos'?{items:[{id,text:'Review exact item',assignee:'Frank',due:'2026-10-11'}]}:path==='/api/mission'?{records:[task]}:{answers:[]})
  await vm.runInContext('refresh()',ui.context)
  assert.match(ui.element('decisions').innerHTML,/href="\/\?view=todos&amp;task=claim%2F42%20%26%20review"/)
  assert.doesNotMatch(ui.element('decisions').innerHTML,/task=Todo-/)
  assert.match(ui.element('tasks').innerHTML,/Keep this instruction/)
  assert.match(ui.element('tasks').innerHTML,/data-id="C1" open/)
  assert.equal(focused,1);assert.deepEqual(selection,[2,5])
  assert.match(ui.element('fresh').textContent,/API fetched/)
})
