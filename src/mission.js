import { MISSION_HTML } from './mission-ui.js'
/** @param {Request} request @param {any} env @param {boolean} canRead */
export async function missionRequest(request, env, canRead) {
  const url = new URL(request.url)
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
    await env.DB.prepare('INSERT INTO mission_records(kind,id,data,updated) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated=excluded.updated').bind(kind,id,JSON.stringify(data),now).run()
    return Response.json({ok:true,id,updated:now})
  }
  if (!canRead || url.hostname !== 'aries.flood.doctor') return new Response('Forbidden',{status:403})
  if (request.method !== 'GET') return new Response('Method not allowed',{status:405})
  if(url.pathname === '/mission') return new Response(MISSION_HTML,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}})
  const rows = await env.DB.prepare('SELECT kind,id,data,updated FROM mission_records').all()
  return Response.json({now:new Date().toISOString(),records:rows.results.map(/** @param {any} r */ r=>({...r,data:JSON.parse(r.data)}))},{headers:{'cache-control':'no-store'}})
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
