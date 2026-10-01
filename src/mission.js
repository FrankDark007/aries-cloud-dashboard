import { MISSION_HTML } from './mission-ui.js'
import { parseOptions } from './mission-state.js'
/** @param {Request} request @param {any} env @param {boolean|string} canRead */
export async function missionRequest(request, env, canRead) {
  const url = new URL(request.url)
  if (url.pathname === '/api/mission/answer' || url.pathname === '/api/mission/answers') return answerRequest(request,env,canRead)
  const post = url.hostname === 'aries-publish.flood.doctor' && url.pathname === '/api/mission/push'
  if (post) {
    if (request.method !== 'POST') return new Response('Method not allowed', {status:405})
    const token = request.headers.get('authorization') || ''
    /** @param {string} s */
    const hash = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
    const a = await hash(token), b = await hash('Bearer ' + env.MISSION_TOKEN)
    if (!env.MISSION_TOKEN || a.some((v,i)=>v!==b[i])) return new Response('Unauthorized',{status:401})
    const raw = await request.text()
    if (raw.length > 100000) return new Response('Too large',{status:413})
    let body
    try { body = JSON.parse(raw) } catch { return new Response('Invalid JSON',{status:400}) }
    const {kind,id,data} = body
    if(kind==='check' && id==='cloud'){await checkServices(env);return Response.json({ok:true,id,updated:new Date().toISOString()})}
    if (!['task','decision','machine','project','spend'].includes(kind) || typeof id !== 'string' || !/^[\w.-]{1,100}$/.test(id) || !data || typeof data !== 'object' || Array.isArray(data)) return new Response('Invalid record',{status:400})
    if(kind==='task' && !['running','done','stopped','failed','waiting'].includes(data.status)) return new Response('Invalid status',{status:400})
    const now = new Date().toISOString()
    // Compare within the upsert so concurrent CLI pushes cannot race a read-then-write guard.
    const result = await env.DB.prepare(`
      INSERT INTO mission_records(kind,id,data,updated) VALUES(?,?,?,?)
      ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated=excluded.updated
      WHERE NOT (
        excluded.kind='task'
        AND COALESCE(json_extract(excluded.data,'$.origin'),'backfill')='backfill'
        AND COALESCE(json_extract(mission_records.data,'$.origin'),
          CASE WHEN lower(COALESCE(json_extract(mission_records.data,'$.status_source'),'')) LIKE '%cli%'
            OR lower(COALESCE(json_extract(mission_records.data,'$.status_source'),'')) LIKE '%recorder%'
          THEN 'cli' ELSE 'backfill' END)='cli'
        AND COALESCE(julianday(json_extract(excluded.data,'$.source_updated')) > julianday(mission_records.updated),0)=0
      )`).bind(kind,id,JSON.stringify(data),now).run()
    if (result?.meta?.changes === 0) return Response.json({ok:true,id,skipped:'newer cli push'})
    return Response.json({ok:true,id,updated:now})
  }
  if (!canRead || url.hostname !== 'aries.flood.doctor') return new Response('Forbidden',{status:403})
  if (request.method !== 'GET') return new Response('Method not allowed',{status:405})
  if(url.pathname === '/mission') return new Response(MISSION_HTML,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}})
  const rows = await env.DB.prepare('SELECT kind,id,data,updated FROM mission_records').all()
  return Response.json({now:new Date().toISOString(),records:rows.results.map(/** @param {any} r */ r=>({...r,data:JSON.parse(r.data)}))},{headers:{'cache-control':'no-store'}})
}
/** @param {Request} request @param {any} env @param {boolean|string} actor */
async function answerRequest(request, env, actor) {
  const url = new URL(request.url)
  /** @param {any} body @param {number} [status] */
  const response = (body,status=200) => Response.json(body,{status,headers:{'cache-control':'no-store'}})
  if (url.hostname === 'aries-publish.flood.doctor' && url.pathname === '/api/mission/answers') {
    if (request.method !== 'POST') return response({error:'Method not allowed'},405)
    /** @param {string} value */
    const hash = async value => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))
    const a=await hash(request.headers.get('authorization')||''), b=await hash('Bearer '+env.MISSION_TOKEN)
    if (!env.MISSION_TOKEN || a.some((v,i)=>v!==b[i])) return response({error:'Unauthorized'},401)
    if (!(request.headers.get('content-type')||'').match(/^application\/json(?:\s*;|$)/i)) return response({error:'JSON required'},415)
    let body
    try { body=await request.json() } catch {return response({error:'Invalid JSON'},400)}
    if (!body || !['new','all'].includes(body.mode)) return response({error:'Invalid mode'},400)
    const by=body.by==null?'mission-poller':body.by
    if (typeof by!=='string' || !/^[\w.:@-]{1,160}$/.test(by)) return response({error:'Invalid session tag'},400)
    // One SQLite statement claims the entire pending set. No read-before-write race.
    const rows=body.mode==='new'
      ? await env.DB.prepare('UPDATE mission_answers SET received=?,received_by=? WHERE received IS NULL RETURNING id,card_id,kind,choice,text,created,author,received,received_by').bind(new Date().toISOString(),by).all()
      : await env.DB.prepare('SELECT id,card_id,kind,choice,text,created,author,received,received_by FROM mission_answers ORDER BY id').all()
    return response({answers:rows.results.map((/** @type {any} */ row)=>({...row,by:row.received_by})).sort((/** @type {any} */ a,/** @type {any} */ b)=>a.id-b.id)})
  }
  if (url.hostname !== 'aries.flood.doctor') return response({error:'Not found'},404)
  if (typeof actor !== 'string' || !actor) return response({error:'Unauthorized'},401)
  if (url.pathname === '/api/mission/answers') {
    if (request.method !== 'GET') return response({error:'Method not allowed'},405)
    const rows=await env.DB.prepare('SELECT id,card_id,kind,choice,text,created,received,received_by FROM mission_answers WHERE author=? ORDER BY id').bind(actor).all()
    return response({answers:rows.results})
  }
  if (request.method !== 'POST') return response({error:'Method not allowed'},405)
  if (request.headers.get('origin') !== url.origin) return response({error:'Origin does not match'},403)
  if (!(request.headers.get('content-type')||'').match(/^application\/json(?:\s*;|$)/i)) return response({error:'JSON required'},415)
  const raw=await request.text()
  if (raw.length>30000) return response({error:'Too large'},413)
  let body
  try {body=JSON.parse(raw)} catch {return response({error:'Invalid JSON'},400)}
  if (!body || typeof body.card_id!=='string' || !/^[\w.-]{1,100}$/.test(body.card_id) || !['choice','text'].includes(body.kind)) return response({error:'Invalid answer'},400)
  const card=await env.DB.prepare("SELECT kind,data FROM mission_records WHERE id=? AND kind IN ('decision','task') ORDER BY CASE kind WHEN 'decision' THEN 0 ELSE 1 END LIMIT 1").bind(body.card_id).first()
  if (!card) return response({error:'Card not found'},404)
  const data=JSON.parse(card.data)
  const now=new Date().toISOString()
  if (body.kind==='choice') {
    if (typeof body.choice!=='string' || !parseOptions(data.options).some(o=>o.label===body.choice)) return response({error:'Invalid choice'},400)
    const rows=await env.DB.prepare(`INSERT INTO mission_answers(card_id,kind,choice,created,author)
      VALUES(?,'choice',?,?,?) ON CONFLICT(card_id,author) WHERE kind='choice'
      DO UPDATE SET choice=excluded.choice,created=excluded.created WHERE mission_answers.received IS NULL
      RETURNING id,card_id,kind,choice,text,created,received,received_by`).bind(body.card_id,body.choice,now,actor).all()
    if (!rows.results.length) return response({error:'Received. Use Your instructions to change your choice.'},409)
    return response({answer:rows.results[0]})
  }
  if (typeof body.text!=='string' || !body.text.trim() || body.text.length>4000) return response({error:'Instructions must contain 1 to 4,000 characters'},400)
  if (body.request_id==null) body.request_id=crypto.randomUUID()
  if (typeof body.request_id!=='string' || !/^[\w-]{1,100}$/.test(body.request_id)) return response({error:'Invalid request id'},400)
  const rows=await env.DB.prepare(`INSERT INTO mission_answers(card_id,kind,text,created,author,request_id)
    VALUES(?,'text',?,?,?,?) ON CONFLICT(author,request_id) DO UPDATE SET request_id=excluded.request_id
    RETURNING id,card_id,kind,choice,text,created,received,received_by`).bind(body.card_id,body.text,now,actor,body.request_id).all()
  return response({answer:rows.results[0]})
}
/** @param {any} env */
export async function checkServices(env, cause='manual') {
  const targets = [
    ['engine.flood.doctor','https://engine.flood.doctor/health'],
    ['dashboard.restorationdoctors.com','https://dashboard.restorationdoctors.com/'],
    ['aries.flood.doctor','https://aries-publish.flood.doctor/healthz'],
    ['crm.flood.doctor','https://crm.flood.doctor/']
  ]
  await Promise.all(targets.map(async ([host,url])=>{
    const start=Date.now();
    /** @type {{status:string,ms:number,detail:string,checked_by?:string}} */
    let data
    /** @type {Record<string,string>} */
    const headers = host==='engine.flood.doctor' ? {'CF-Access-Client-Id':env.ENGINE_ACCESS_ID,'CF-Access-Client-Secret':env.ENGINE_ACCESS_SECRET} : {}
    try {
      const r=host==='aries.flood.doctor' && env.SELF ? await env.SELF.fetch('https://aries.flood.doctor/healthz') : host==='engine.flood.doctor' && env.ENGINE ? await env.ENGINE.fetch(url,{headers}) : await fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(10000)})
      const text=(await r.text()).slice(0,1000)
      const gate=r.status>=300&&r.status<400 || /cloudflare access|sign in.*cloudflare/i.test(text)
      data={status:gate?'waiting':r.ok?'up':'down',ms:Date.now()-start,detail:gate?'Login gate answered; service health unknown':host==='aries.flood.doctor'?'Worker health check · HTTP '+r.status:'HTTP '+r.status+(url.endsWith('/')?' · homepage response':' · health check')}
    } catch {data={status:'down',ms:Date.now()-start,detail:'No response'}}
    data.checked_by=cause
    await env.DB.prepare('INSERT INTO mission_records VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated=excluded.updated').bind('service',host,JSON.stringify(data),new Date().toISOString()).run()
  }))
}
