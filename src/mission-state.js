/** @param {string|string[]|unknown} value */
export function parseOptions(value) {
  const parts = (Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
    .flatMap(item => typeof item === 'string' ? item.split(/[,;\n]|\s+or\s+/i) : [])
  return parts.map(item => ({label:item.replace(/\s*\(recommended\)\s*$/i,'').trim(),recommended:/\(recommended\)\s*$/i.test(item)}))
    .filter(item => item.label).sort((a,b) => Number(b.recommended)-Number(a.recommended))
}
/** Silence means stale evidence, not a proven failure. @param {any} record */
export function taskFailure(record) {
  const d = record.data || {}
  if (d.status === 'failed') return true
  if (d.status !== 'stopped') return false
  const cause = String(d.failure_cause || d.error || '')
  if (cause.trim()) return true
  const step = String(d.step || '')
  if (/^\s*(?:rc|exit(?: code)?)\s*[=: ]\s*0\s*$/i.test(step)) return false
  return /\b(?:rc|exit(?: code)?)\s*[=: ]\s*[1-9]\d*\b|^(?:failed|failure|error)\b/i.test(step)
}

/** Missing, invalid and future evidence is unknown, never current.
 * @param {any} timestamp @param {number} limitMinutes @param {number} [now] */
export function evidenceFreshness(timestamp, limitMinutes, now=Date.now()) {
  const time=typeof timestamp==='string' && timestamp.trim() ? Date.parse(timestamp) : NaN
  if (!Number.isFinite(time) || time>now+300000) return {status:'missing',at:null,minutes:null}
  const minutes=Math.max(0,Math.floor((now-time)/60000))
  return {status:minutes>limitMinutes?'stale':'current',at:timestamp,minutes}
}

/** Use producer evidence, never a backfill's upload time. @param {any} record @param {number} [now] */
export function taskState(record, now=Date.now()) {
  const d=record.data || {}, failure=taskFailure(record)
  const candidates=[d.activity_updated,d.source_updated].filter(t=>evidenceFreshness(t,40,now).at)
  const explicitSource=d.origin==='backfill' || (d.status_source && !/cli|recorder/i.test(d.status_source))
  const at=candidates.sort((a,b)=>Date.parse(b)-Date.parse(a))[0] || (!explicitSource?record.updated:null)
  const evidence=evidenceFreshness(at,40,now)
  const state=failure?'failed':d.status==='closed'?'done':['running','waiting','done','stopped'].includes(d.status)?d.status:'unknown'
  return {state,failure,evidence}
}

/** @param {any[]} tasks */
export function taskCounts(tasks) {
  /** @type {Record<string,number>} */
  const counts={running:0,waiting:0,done:0,stopped:0,failed:0,unknown:0,stale:0,missing:0}
  for (const task of tasks) {
    const state=task.state
    if (Object.prototype.hasOwnProperty.call(counts,state)) counts[state]++
    if (task.evidence.status==='stale') counts.stale++
    if (task.evidence.status==='missing') counts.missing++
  }
  return counts
}

/** Summaries separate source evidence from successful API polling. @param {any[]} records @param {number} [now] */
export function sourceFreshness(records, now=Date.now()) {
  const groups=new Map()
  for (const record of records) {
    if (!['task','machine','service','spend'].includes(record.kind)) continue
    const d=record.data || {}, name=record.kind==='task'?'Tasks · '+(d.status_source||d.origin||'direct updates'):record.kind==='machine'?'Machine observations':record.kind==='service'?'Service checks':'Spend'
    const evidence=record.kind==='task'?taskState(record,now).evidence:evidenceFreshness(record.updated,record.kind==='machine'?5:record.kind==='service'?10:20,now)
    if (!groups.has(name)) groups.set(name,{name,total:0,current:0,stale:0,missing:0,latest:null,oldest:null})
    const group=groups.get(name)
    group.total++;group[evidence.status]++
    if (evidence.at) {
      if (!group.latest || Date.parse(evidence.at)>Date.parse(group.latest)) group.latest=evidence.at
      if (!group.oldest || Date.parse(evidence.at)<Date.parse(group.oldest)) group.oldest=evidence.at
    }
  }
  return [...groups.values()]
}

/** Current work and queue evidence are distinct from rolling utilization. @param {any} record @param {number} [now] */
export function machineTelemetry(record, now=Date.now()) {
  const d=record.data || {}, observation=evidenceFreshness(record.updated,5,now)
  const heartbeat=evidenceFreshness(d.runner_heartbeat||d.runner_updated,5,now)
  const state=observation.status!=='current'?observation.status:d.reachable===false?'offline':d.reachable===true?'online':'unknown'
  const rawJob=d.current_job??d.currentJob, job=typeof rawJob==='string'&&rawJob.trim()?rawJob.trim():null
  const rawQueue=d.queue_depth??d.queueDepth
  const queue=typeof rawQueue==='number'&&Number.isSafeInteger(rawQueue)&&rawQueue>=0?rawQueue:null
  return {state,observation,heartbeat,job,queue,jobCurrent:!!job&&observation.status==='current'&&heartbeat.status==='current',queueCurrent:queue!==null&&observation.status==='current'&&heartbeat.status==='current'}
}

/** @param {any} record @param {number} [now] */
export function serviceState(record, now=Date.now()) {
  const d=record.data || {}, evidence=evidenceFreshness(record.updated,10,now)
  const availability=d.availability || (d.status==='up'?'available':d.status==='waiting'?'gated':d.status==='down'?'unavailable':'unknown')
  const op=d.operational || {}, checked=evidenceFreshness(op.checked_at,10,now)
  const operational=evidence.status==='current'&&checked.status==='current'&&['healthy','degraded'].includes(op.status)?op.status:'unknown'
  return {evidence,availability:evidence.status==='current'?availability:'unknown',operational}
}
