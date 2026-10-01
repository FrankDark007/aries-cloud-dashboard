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
