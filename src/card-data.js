/**
 * Read-only metadata at the publisher boundary. These fields describe evidence, never
 * decide whether a claim was paid or silently replace a task's original brief.
 */

/** @param {unknown} value @returns {Record<string, any>} */
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
/** @param {unknown} value @param {number} [max] @returns {string|null} */
function text(value, max = 240) {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null
}
/** @param {unknown} value */
export function canonicalIdentity(value) {
  const written = text(value, 160)
  return written ? written.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '') || null : null
}
/** @param {unknown} value @returns {number|null} */
function cardId(value) { return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null }
/** @param {unknown} value */
function isoDate(value) {
  const written = text(value, 40)
  if (!written || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(written) || !Number.isFinite(Date.parse(written))) return null
  return new Date(written).toISOString().slice(0, 10) === written.slice(0, 10) ? written : null
}

const MONEY_TYPES = new Set(['invoice_total', 'estimate_total', 'outstanding_balance', 'payment_issued',
  'payment_received', 'contractor_paid', 'claimed_cumulative_payment', 'credit', 'refund'])
const ID_FIELDS = ['claim_id', 'client_id', 'invoice_id']
const SUBJECT_STOP = new Set(['re', 'fw', 'fwd', 'the', 'and', 'for', 'from', 'with', 'your', 'this', 'that',
  'please', 'reply', 'send', 'sent', 'email', 'update', 'follow', 'followup', 'needs', 'need', 'about', 'regarding',
  'task', 'action', 'required', 'request', 'requested'])
/** @param {string} value */
function subjectWords(value) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(word => !SUBJECT_STOP.has(word)) || [])
}

/**
 * Normalise only structured publisher facts. All legacy card properties remain with
 * the caller. Issues survive a publish/read round trip because the raw email evidence
 * may intentionally not be stored in the public snapshot.
 * @param {unknown} value
 */
export function curateCardMetadata(value) {
  const source = record(value)
  const brief = record(source.brief)
  const upstreamIdentity = record(source.identity)
  const evidence = record(source.source_context || source.evidence)
  const evidenceIdentity = record(evidence.identity)
  const summaryIdentity = record(brief.identity)
  /** @type {Array<{code:string,message:string}>} */
  const issues = []
  /** @param {string} code @param {string} message */
  const issue = (code, message) => {
    if (!issues.some(entry => entry.code === code && entry.message === message) && issues.length < 40) issues.push({ code, message })
  }
  for (const existing of Array.isArray(source.quality?.issues) ? source.quality.issues.slice(0, 40) : []) {
    const code = text(existing?.code, 80)
    const message = text(existing?.message, 400)
    if (code && message) issue(code, message)
  }

  /** @type {Record<string, string|null>} */
  const identity = {}
  for (const field of ID_FIELDS) {
    const candidates = [upstreamIdentity[field], source[field], evidenceIdentity[field], summaryIdentity[field], brief[field]]
      .map(value => text(value, 160)).filter(value => value !== null)
    identity[field] = candidates[0] || null
    if (new Set(candidates.map(canonicalIdentity)).size > 1) issue(`conflicting_${field}`, `The source and summary contain different ${field.replace('_', ' ')} values. Review the original evidence.`)
  }
  const sourceClient = text(evidence.client, 240)
  const summaryClient = text(brief.client, 240)
  if (sourceClient && summaryClient && canonicalIdentity(sourceClient) !== canonicalIdentity(summaryClient)) {
    issue('client_mismatch', 'The source client and summary client differ. Confirm the identity before acting.')
  }
  const sourceClaim = text(evidence.claim, 160)
  const summaryClaim = text(brief.claim, 160)
  if (sourceClaim && summaryClaim && canonicalIdentity(sourceClaim) !== canonicalIdentity(summaryClaim)) {
    issue('claim_mismatch', 'The source claim and summary claim differ. Confirm the claim number before acting.')
  }
  const subject = text(source.email_subject || source.source_subject || evidence.subject || source.email?.subject, 500)
  const title = text(source.title, 500)
  if (subject && title) {
    const left = subjectWords(subject)
    const right = subjectWords(title)
    if (left.size >= 2 && right.size >= 2 && ![...left].some(word => right.has(word))) {
      issue('title_subject_mismatch', 'The title and source email subject share no identifying words. Review them for a possible summary mismatch.')
    }
  }

  const suppliedResponsibility = record(source.responsibility)
  const suppliedProvenance = record(suppliedResponsibility.provenance)
  const nextPrefix = text(brief.next_step, 500)?.match(/^([A-Za-z][A-Za-z .'-]{0,60}):\s+\S/)
  const hasCardOwner = Object.hasOwn(source, 'assignee') || Object.hasOwn(source, 'owner')
  const ownerFromCard = Object.hasOwn(source, 'assignee') ? text(source.assignee) : text(source.owner)
  const owner = hasCardOwner ? ownerFromCard : text(suppliedResponsibility.owner)
  const nextActor = text(suppliedResponsibility.next_actor) || text(brief.next_actor) || (nextPrefix ? nextPrefix[1].trim() : null)
  const waitingOn = text(suppliedResponsibility.waiting_on) || text(brief.waiting_on)
  const responsibility = {
    owner,
    next_actor: nextActor,
    waiting_on: waitingOn,
    provenance: {
      owner: ownerFromCard ? (text(source.assignee) ? 'card.assignee' : 'card.owner') : owner ? text(suppliedProvenance.owner) || 'publisher.responsibility' : null,
      next_actor: nextActor ? text(suppliedProvenance.next_actor) || (text(suppliedResponsibility.next_actor) ? 'publisher.responsibility' : text(brief.next_actor) ? 'brief.next_actor' : 'brief.next_step_prefix') : null,
      waiting_on: waitingOn ? text(suppliedProvenance.waiting_on) || (text(suppliedResponsibility.waiting_on) ? 'publisher.responsibility' : 'brief.waiting_on') : null,
    },
  }

  /** @type {Array<{amount_minor:number,currency:string,type:string,source:string,date:string|null}>} */
  const financials = []
  const suppliedMoney = source.financials ?? brief.financials
  if (suppliedMoney !== undefined && !Array.isArray(suppliedMoney)) issue('invalid_financials', 'Structured financial evidence must be a list.')
  for (const raw of Array.isArray(suppliedMoney) ? suppliedMoney.slice(0, 30) : []) {
    const entry = record(raw)
    const type = text(entry.type, 60)
    const currency = text(entry.currency, 3)?.toUpperCase()
    const evidenceSource = text(entry.source, 500)
    if (!Number.isSafeInteger(entry.amount_minor) || !type || !MONEY_TYPES.has(type) || !currency || !/^[A-Z]{3}$/.test(currency) || !evidenceSource) {
      issue('invalid_financial_entry', 'A financial entry lacks a valid minor-unit amount, type, currency or evidence source. No total has been inferred.')
      continue
    }
    const date = isoDate(entry.date)
    if (entry.date != null && !date) issue('invalid_financial_date', 'A financial evidence date is invalid and needs review.')
    financials.push({ amount_minor: entry.amount_minor, currency, type, source: evidenceSource, date })
  }

  const rawRelationships = record(source.relationships)
  const ownId = cardId(source.id)
  if (rawRelationships.supersedes != null && !Array.isArray(rawRelationships.supersedes)) issue('invalid_relationship', 'The supersedes relationship must be a list of card references.')
  if (rawRelationships.suggestions != null && !Array.isArray(rawRelationships.suggestions)) issue('invalid_relationship', 'Relationship suggestions must be a list and require review.')
  /** @param {unknown} value */
  const relatedId = value => {
    const id = cardId(value)
    if (value != null && (id === null || id === ownId)) {
      issue('invalid_relationship', 'A relationship has an invalid card reference or points to this same card.')
      return null
    }
    return id
  }
  const supersedes = [...new Set((Array.isArray(rawRelationships.supersedes) ? rawRelationships.supersedes.slice(0, 100) : []).map(relatedId).filter(id => id !== null))]
  const relationships = {
    supersedes,
    superseded_by: relatedId(rawRelationships.superseded_by),
    duplicate_of: relatedId(rawRelationships.duplicate_of),
    suggestions: (Array.isArray(rawRelationships.suggestions) ? rawRelationships.suggestions.slice(0, 30) : []).flatMap(raw => {
      const suggestion = record(raw)
      const id = relatedId(suggestion.card_id)
      const reason = text(suggestion.reason, 400)
      return id && reason && ['duplicate', 'supersedes'].includes(suggestion.type) ? [{ type: String(suggestion.type), card_id: id, reason }] : []
    }),
  }
  if (relationships.superseded_by && supersedes.includes(relationships.superseded_by)) issue('relationship_cycle', 'Two cards cannot supersede each other. Review the relationship history.')
  const evidencePresent = ID_FIELDS.some(field => identity[field]) || Boolean(sourceClient || sourceClaim || subject) || financials.length > 0
  return {
    identity,
    quality: { status: issues.length ? 'review' : evidencePresent ? 'clear' : 'unverified', issues },
    responsibility,
    financials,
    relationships,
  }
}

/**
 * Enrich copies after pending-command overlays so responsibility follows the current
 * owner. Relationship cycles are warnings only, never an instruction to hide history.
 * @param {Array<Record<string, any>>} items
 * @returns {Array<Record<string, any> & ReturnType<typeof curateCardMetadata>>}
 */
export function enrichBoardItems(items) {
  const enriched = items.map(item => /** @type {Record<string, any> & ReturnType<typeof curateCardMetadata>} */ ({ ...item, ...curateCardMetadata(item) }))
  const byId = new Map(enriched.map(item => [item.id, item]))
  /** @type {Map<number,Set<number>>} */
  const links = new Map(enriched.map(item => [item.id, new Set([item.relationships.superseded_by, item.relationships.duplicate_of].filter(id => id !== null))]))
  for (const item of enriched) for (const previous of item.relationships.supersedes) links.get(previous)?.add(item.id)
  for (const item of enriched) {
    const visited = new Set()
    const pending = [...(links.get(item.id) || [])]
    let cycle = false
    while (pending.length) {
      const linked = pending.pop()
      if (linked === item.id) { cycle = true; break }
      if (linked === undefined || visited.has(linked) || !byId.has(linked)) continue
      visited.add(linked)
      pending.push(...(links.get(linked) || []))
    }
    if (cycle) {
      if (!item.quality.issues.some(issue => issue.code === 'relationship_cycle')) item.quality.issues.push({ code: 'relationship_cycle', message: 'The card relationships contain a cycle. Review the history before consolidating.' })
      item.quality.status = 'review'
    }
  }
  return enriched
}
