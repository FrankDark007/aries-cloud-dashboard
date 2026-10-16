// Frank, 10/04/2026: "the same customer / claim is currently being assigned several cards.
// consolidate the cards and list all open tasks for that claim under the same card."
// Aries opens a card per email thread, so one claim collects a card for every thread about
// it. The board groups open cards by the client and the claim or invoice number in the brief
// Aries writes for each card, plus shared thread IDs, property street addresses, and client
// surnames in cleaned titles. Grouping is only a view: every card keeps its own id, owner and
// actions, and nothing here changes what Aries published.

/** @typedef {{tokens: string[], first: string, last: string}} Person */
/** @typedef {{people: Person[], org: string, rollup: boolean}} Client */
import { canonicalIdentity, curateCardMetadata } from './card-data.js'

/** @typedef {{key: string, label: string, reason:string, reasons:string[], conflicts:Array<{card_id:number,field:string,message:string}>}} ClaimGroup */

// Never a client: us, the carriers, Aries' own placeholders. A card "for USAA" is about many
// claims at once, and grouping on it would pile unrelated claims into one card.
const NOT_A_CLIENT = new Set([
  'flood doctor', 'restoration doctor', 'va water damage', 'va water damage llc', 'galaxy construction',
  'usaa', 'allstate', 'travelers', 'state farm', 'chubb', 'erie', 'liberty mutual', 'nationwide',
  'sedgwick', 'frontline', 'auto owners', 'stripe', 'internal', 'unknown', 'unidentified matter',
  'multiple clients', 'various', 'none', 'n a', 'tbd',
])
const ORG_WORDS = /\b(condominium|condo|association|hoa|llc|inc|corp|corporation|company|insurance|law|office|group|management|properties|apartments|church|school|bank)\b/
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'commander', 'cdr', 'capt', 'captain', 'col', 'colonel', 'lt', 'sgt', 'rev', 'hon', 'jr', 'sr', 'ii', 'iii'])
const NICKNAMES = new Map([
  ['tom', 'thomas'], ['tommy', 'thomas'], ['mike', 'michael'], ['bob', 'robert'], ['bobby', 'robert'],
  ['rob', 'robert'], ['bill', 'william'], ['will', 'william'], ['jim', 'james'], ['jen', 'jennifer'],
  ['jenny', 'jennifer'], ['liz', 'elizabeth'], ['beth', 'elizabeth'], ['dave', 'david'], ['dan', 'daniel'],
  ['steve', 'steven'], ['kate', 'katherine'], ['katie', 'katherine'], ['sue', 'susan'], ['joe', 'joseph'],
  ['nick', 'nicholas'], ['matt', 'matthew'], ['tony', 'anthony'], ['andy', 'andrew'], ['rick', 'richard'],
  ['ben', 'benjamin'], ['sam', 'samuel'], ['pat', 'patrick'], ['chuck', 'charles'], ['charlie', 'charles'],
  ['ed', 'edward'], ['greg', 'gregory'], ['jeff', 'jeffrey'], ['jon', 'jonathan'], ['annie', 'anne'],
])

const TITLE_STOP = new Set([
  'card', 'cards', 'task', 'tasks', 'item', 'items', 'urgent', 'review', 'invoice', 'claim', 'estimate',
  'payment', 'call', 'reply', 'follow', 'followup', 'update', 'scope', 'work', 'water', 'damage',
  'flood', 'mitigation', 'restoration', 'lien', 'check', 'carrier', 'adjuster', 'supplement', 'final',
  'determination', 'status', 'action', 'needed', 'request', 'test', 'bad', 'good', 'new', 'old', 'open',
  'done', 'aries', 'petsmart', 'lumina', 'pilates', 'lead', 'keep', 'private', 'errand', 'last', 'known',
  'assignment', 'confirm', 'tomorrow', 'crew', 'chase', 'file', 'annual', 'fee', 'still', 'checked',
  'mistake', 'made', 'from', 'email', 'never', 'came', 'prep', 'reopened', 'mailed', 'driveway',
  'staining', 'oil', 'other', 'changed', 'instructions', 'secret', 'promotional', 'newsletter', 'routing',
  'authorisation', 'authorization', 'documents', 'Coverage', 'coverage', 'decision', 'ready',
])

const DIR_MAP = new Map([
  ['north', 'n'], ['n', 'n'],
  ['south', 's'], ['s', 's'],
  ['east', 'e'], ['e', 'e'],
  ['west', 'w'], ['w', 'w'],
])

const SUFFIX_MAP = new Map([
  ['street', 'st'], ['st', 'st'],
  ['avenue', 'ave'], ['ave', 'ave'],
  ['road', 'rd'], ['rd', 'rd'],
  ['drive', 'dr'], ['dr', 'dr'],
  ['lane', 'ln'], ['ln', 'ln'],
  ['court', 'ct'], ['ct', 'ct'],
  ['boulevard', 'blvd'], ['blvd', 'blvd'],
  ['way', 'way'],
  ['place', 'pl'], ['pl', 'pl'],
  ['terrace', 'ter'], ['ter', 'ter'],
  ['circle', 'cir'], ['cir', 'cir'],
  ['parkway', 'pkwy'], ['pkwy', 'pkwy'],
  ['highway', 'hwy'], ['hwy', 'hwy'],
  ['trail', 'trl'], ['trl', 'trl'],
])

const STREET_STOP = new Set(['in', 'to', 'on', 'at', 'of', 'for', 'by', 'the', 'and', 'or', 'day', 'days', 'week'])

/** @param {string} first */
function canonicalFirst(first) {
  return NICKNAMES.get(first) || first
}

/**
 * Two first names that can be the same person: equal, a nickname, an initial, or one the
 * start of the other ("chris" and "christopher").
 * @param {string} left
 * @param {string} right
 */
function sameFirst(left, right) {
  const a = canonicalFirst(left)
  const b = canonicalFirst(right)
  if (a === b) return true
  if (a.length === 1 || b.length === 1) return a[0] === b[0]
  return Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))
}

/** @param {string} text */
function plain(text) {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * Strip reply/forward prefixes and leading bracket tags from an email subject or card title.
 * @param {unknown} text
 * @returns {string}
 */
export function cleanSubject(text) {
  let title = String(text || '').trim()
  for (let pass = 0; pass < 8; pass += 1) {
    const lower = title.toLowerCase()
    const prefix = ['re:', 'fw:', 'fwd:'].find((word) => lower.indexOf(word) === 0)
    const close = title.indexOf(']')
    if (prefix) title = title.slice(prefix.length).trim()
    else if (title.charAt(0) === '[' && close > 0 && close < 26) title = title.slice(close + 1).trim()
    else break
  }
  return title || String(text || '').trim()
}

/**
 * Extract normalized property street addresses (e.g., "1306 s poe st") and their display form
 * from a cleaned title.
 * @param {unknown} value
 * @returns {Array<{key: string, label: string}>}
 */
export function extractStreetAddresses(value) {
  if (typeof value !== 'string' || !value.trim()) return []
  const cleaned = cleanSubject(value)
  const regex = /\b(\d{1,6})\s+(?:(north|south|east|west|n|s|e|w)\.?\s+)?([a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+){0,2}?)\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way|place|pl|terrace|ter|circle|cir|parkway|pkwy|highway|hwy|trail|trl)\b/gi
  /** @type {Array<{key: string, label: string}>} */
  const results = []
  const seen = new Set()
  let match
  while ((match = regex.exec(cleaned)) !== null) {
    const number = match[1]
    const rawDir = match[2] ? plain(match[2].replace(/\./g, '')) : ''
    const dir = rawDir ? (DIR_MAP.get(rawDir) || rawDir) : ''
    const rawStreet = plain(match[3]).trim().replace(/\s+/g, ' ')
    const streetTokens = rawStreet.split(' ').filter(Boolean)
    if (!streetTokens.length || streetTokens.some((tok) => STREET_STOP.has(tok))) continue
    const rawSuffix = plain(match[4].replace(/\./g, ''))
    const suffix = SUFFIX_MAP.get(rawSuffix) || rawSuffix
    const key = [number, dir, rawStreet, suffix].filter(Boolean).join(' ')
    if (seen.has(key)) continue
    seen.add(key)
    const displayDir = dir ? dir.toUpperCase() : ''
    const displayStreet = streetTokens.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    const displaySuffix = suffix.charAt(0).toUpperCase() + suffix.slice(1)
    const label = [number, displayDir, displayStreet, displaySuffix].filter(Boolean).join(' ')
    results.push({ key, label })
  }
  return results
}

/**
 * Normalize a card's thread_id or source_url into a canonical thread key when available.
 * @param {Record<string, any>} item
 * @returns {string|null}
 */
export function extractThreadKey(item) {
  if (!item || typeof item !== 'object') return null
  if (typeof item.thread_id === 'string' && item.thread_id.trim()) {
    const raw = item.thread_id.trim().toLowerCase().replace(/^(?:thread|msg|message)[_:-]/, '')
    if (raw.length >= 4) return `thread:${raw}`
  }
  if (typeof item.source_url === 'string' && item.source_url.trim()) {
    const rawUrl = item.source_url.trim()
    const hashMatch = /#(?:all|inbox|sent|starred|imp|trash|spam|drafts|label\/[^/]+|search\/[^/]+)\/([A-Za-z0-9_-]{8,64})$/i.exec(rawUrl)
    if (hashMatch) return `thread:${hashMatch[1].toLowerCase()}`
    const paramMatch = /[?&](?:th|thread_id|message_id)=([A-Za-z0-9_-]{8,64})/i.exec(rawUrl)
    if (paramMatch) return `thread:${paramMatch[1].toLowerCase()}`
    try {
      const parsed = new URL(rawUrl)
      const tail = parsed.pathname.split('/').filter(Boolean).at(-1) || ''
      if (/^[0-9a-f]{12,32}$/i.test(tail)) return `thread:${tail.toLowerCase()}`
      const normalized = `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`.toLowerCase()
      if (normalized.length > 12) return `url:${normalized}`
    } catch {
      return `url:${rawUrl.toLowerCase()}`
    }
  }
  return null
}

/**
 * One name as written, "Robert Badgett" or "Badgett, Robert" or "West-Crews".
 * @param {string} raw
 * @returns {Person|null}
 */
function person(raw) {
  const words = raw.replace(/['’.]/g, '').split(/\s+/).filter((word) => word && !TITLES.has(word))
  if (!words.length) return null
  if (words.length === 1) {
    // A surname alone. A hyphenated one keeps both halves so it can match "Aidan West Crews".
    const tokens = words[0].split('-').filter(Boolean)
    return tokens.length && tokens.join('').length >= 2 ? { tokens, first: '', last: tokens[tokens.length - 1] } : null
  }
  const tokens = words.flatMap((word) => word.split('-')).filter(Boolean)
  const last = tokens[tokens.length - 1]
  // "Adrian W": an initial cannot anchor a surname match.
  if (last.length < 2) return null
  return { tokens, first: tokens[0], last }
}

/**
 * The people a brief's client line names. More than two means a roll-up card ("Mechanic's
 * liens recorded: Gray + 7 VA files"), which must not pull every one of those claims together.
 * @param {unknown} value
 * @param {Set<string>} staff
 * @returns {Client|null}
 */
export function parseClient(value, staff = new Set()) {
  if (typeof value !== 'string') return null
  const text = plain(value).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text || /\d/.test(text)) return null
  const flat = text.replace(/[^a-z]+/g, ' ').trim()
  if (!flat || NOT_A_CLIENT.has(flat) || staff.has(flat)) return null
  if (ORG_WORDS.test(flat)) return { people: [], org: flat, rollup: false }

  /** @type {string[]} */
  const parts = []
  for (const chunk of text.split(/\s*(?:&|\+|\/|;|\band\b)\s*/)) {
    if (!chunk) continue
    const pieces = chunk.split(/\s*,\s*/).filter(Boolean)
    // "Pickering, Linda" is one person written surname first; "Gray, Morera, Musser" is three.
    if (pieces.length === 2 && !pieces[0].includes(' ') && pieces[1].split(' ').length <= 2) {
      parts.push(`${pieces[1]} ${pieces[0]}`)
    } else {
      parts.push(...pieces)
    }
  }
  /** @type {Person[]} */
  let people = parts.map(person).filter((entry) => entry !== null)
  // "Robert and Elizabeth Badgett": a lone first name takes the surname that closes the list.
  const closing = people[people.length - 1]
  if (people.length > 1 && closing && closing.first) {
    people = people.map((entry) => entry.first || entry === closing ? entry : {
      tokens: [...entry.tokens, closing.last], first: entry.tokens[0], last: closing.last,
    })
  }
  people = people.filter((entry) => entry.first || !staff.has(entry.tokens.join(' ')))
  if (!people.length) return null
  return { people, org: '', rollup: people.length > 2 }
}

/**
 * Extract a client candidate from a cleaned card title when brief.client is empty, e.g.
 * "Malik: Travelers final determination" or "Badgett - roof tarp" or "King, 1306 S Poe St".
 * @param {unknown} rawTitle
 * @param {Set<string>} staff
 * @returns {{client: Client, label: string}|null}
 */
function parseTitleClientPrefix(rawTitle, staff) {
  const cleaned = cleanSubject(rawTitle)
  if (!cleaned) return null
  const prefixMatch = /^([A-Za-z][A-Za-z .'-]{1,42}?)(?:\s*[:—–-]\s+|\s*,\s+\d)/.exec(cleaned)
  if (!prefixMatch) return null
  const candidate = prefixMatch[1].trim()
  const words = plain(candidate).split(/\s+/).filter(Boolean)
  if (!words.length || words.length > 4) return null
  if (words.some((w) => TITLE_STOP.has(w) || NOT_A_CLIENT.has(w) || staff.has(w))) return null
  const parsed = parseClient(candidate, staff)
  if (!parsed || parsed.rollup || parsed.org) return null
  if (parsed.people.some((who) => TITLE_STOP.has(who.last) || (who.first && TITLE_STOP.has(who.first)))) return null
  return { client: parsed, label: candidate }
}

/**
 * The claim and invoice numbers in a brief's claim line, as bare digits and letters, so
 * "USAA 021792489-801" and "021792489801" agree. Short ones are left out: four digits are
 * as likely a street number as a claim.
 * @param {unknown} value
 * @returns {string[]}
 */
export function claimNumbers(value) {
  if (typeof value !== 'string') return []
  const found = plain(value).match(/[a-z0-9_-]*\d[a-z0-9_-]*/g) || []
  return [...new Set(found
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter((token) => token.length >= 5 && (token.match(/\d/g) || []).length >= 4))]
}

/** @param {Person} whole @param {Person} tail */
function endsWith(whole, tail) {
  if (tail.tokens.length > whole.tokens.length) return false
  const offset = whole.tokens.length - tail.tokens.length
  return tail.tokens.every((token, index) => whole.tokens[offset + index] === token)
}

/**
 * Groups open cards that belong to the same claim. Returns a group for every card that shares
 * its claim with at least one other open card; a card alone on its claim gets none.
 * @param {Array<Record<string, any>>} items
 * @param {{staff?: Iterable<string>}} [options]
 * @returns {Map<number, ClaimGroup>}
 */
export function claimGroups(items, options = {}) {
  return claimGroupDetails(items, options).groups
}

/**
 * Exposes attempted grouping conflicts even for cards left on their own. A name match
 * cannot bridge two different explicit identities through a third, unidentified card.
 * @param {Array<Record<string, any>>} items
 * @param {{staff?: Iterable<string>}} [options]
 */
export function claimGroupDetails(items, options = {}) {
  const staff = new Set([...(options.staff || [])].map((name) => plain(String(name)).trim()).filter(Boolean))
  const open = items.filter((item) => item && item.status !== 'done' && Number.isSafeInteger(item.id)).sort((a, b) => a.id - b.id)
  const metadata = new Map(open.map(item => [item.id, curateCardMetadata(item)]))
  const components = new Map(open.map(item => [item.id, {
    ids: new Map(['claim_id', 'client_id', 'invoice_id'].map(field => {
      const id = canonicalIdentity(metadata.get(item.id)?.identity[field])
      return [field, new Set(id ? [id] : [])]
    })),
    contradictory: Boolean(metadata.get(item.id)?.quality.issues.some(issue => issue.code.startsWith('conflicting_'))),
  }]))
  /** @type {Map<number, Array<{card_id:number,field:string,message:string}>>} */
  const conflicts = new Map()
  /** @type {Map<number, Set<string>>} */
  const reasons = new Map(open.map(item => [item.id, new Set()]))
  /** @type {Map<number, number>} */
  const parent = new Map(open.map((item) => [item.id, item.id]))
  /** @param {number} id @returns {number} */
  const find = (id) => {
    let root = id
    while (parent.get(root) !== root) root = /** @type {number} */ (parent.get(root))
    parent.set(id, root)
    return root
  }
  /** @param {number} root @param {string} field */
  const values = (root, field) => components.get(root)?.ids.get(field) || new Set()
  /** @param {number} left @param {number} right @param {string} reason */
  const join = (left, right, reason) => {
    const a = find(left)
    const b = find(right)
    if (a === b) return
    for (const field of ['claim_id', 'client_id', 'invoice_id']) {
      // Multiple invoices can legitimately belong to one explicit claim.
      if (field === 'invoice_id' && [...values(a, 'claim_id')].some(id => values(b, 'claim_id').has(id))) continue
      const av = values(a, field)
      const bv = values(b, field)
      if (av.size && bv.size && new Set([...av, ...bv]).size > 1) {
        for (const [id, other] of [[left, right], [right, left]]) {
          const entries = conflicts.get(id) || []
          if (!entries.some(entry => entry.card_id === other && entry.field === field)) entries.push({ card_id: other, field, message: `Not grouped: conflicting ${field.replace('_', ' ')} values.` })
          conflicts.set(id, entries)
        }
        return
      }
    }
    // A contradictory card must not spread its uncertain identity into another group.
    if (components.get(a)?.contradictory || components.get(b)?.contradictory) return
    const kept = Math.min(a, b)
    const removed = Math.max(a, b)
    for (const field of ['claim_id', 'client_id', 'invoice_id']) for (const id of values(removed, field)) values(kept, field).add(id)
    parent.set(removed, kept)
    reasons.get(left)?.add(reason)
    reasons.get(right)?.add(reason)
  }

  /** @type {Map<number, Client|null>} */
  const clients = new Map()
  /** @type {Map<number, string>} */
  const clientLabels = new Map()
  /** @type {Map<string, number[]>} */
  const byNumber = new Map()
  /** @type {Map<string, number[]>} */
  const byOrg = new Map()
  /** @type {Map<string, Array<{id: number, who: Person}>>} */
  const named = new Map()
  /** @type {Array<{id: number, who: Person}>} */
  const surnameOnly = []
  /** @type {Map<string, number[]>} */
  const byIdentity = new Map()
  /** @type {Map<string, number[]>} */
  const byThread = new Map()
  /** @type {Map<string, number[]>} */
  const byAddress = new Map()
  /** @type {Map<number, Array<{key: string, label: string}>>} */
  const cardAddresses = new Map()

  for (const item of open) {
    const brief = item.brief && typeof item.brief === 'object' ? item.brief : {}
    for (const field of ['claim_id', 'invoice_id', 'client_id']) {
      const id = canonicalIdentity(metadata.get(item.id)?.identity[field])
      if (id) byIdentity.set(`${field}:${id}`, [...(byIdentity.get(`${field}:${id}`) || []), item.id])
    }
    for (const number of claimNumbers(brief.claim)) {
      byNumber.set(number, [...(byNumber.get(number) || []), item.id])
    }
    const threadKey = extractThreadKey(item)
    if (threadKey) {
      byThread.set(threadKey, [...(byThread.get(threadKey) || []), item.id])
    }
    const addresses = [
      ...extractStreetAddresses(item.title),
      ...extractStreetAddresses(brief.title),
    ]
    if (addresses.length) {
      cardAddresses.set(item.id, addresses)
      const uniqueKeys = new Set(addresses.map((a) => a.key))
      for (const addrKey of uniqueKeys) {
        byAddress.set(addrKey, [...(byAddress.get(addrKey) || []), item.id])
      }
    }

    let client = parseClient(brief.client, staff)
    let writtenClient = typeof brief.client === 'string' ? brief.client.replace(/\s+/g, ' ').trim() : ''
    if (!client) {
      const fromTitle = parseTitleClientPrefix(brief.title || item.title, staff)
      if (fromTitle) {
        client = fromTitle.client
        writtenClient = fromTitle.label
      }
    }
    clients.set(item.id, client)
    if (writtenClient) clientLabels.set(item.id, writtenClient)
    if (!client || client.rollup) continue
    if (client.org) byOrg.set(client.org, [...(byOrg.get(client.org) || []), item.id])
    for (const who of client.people) {
      if (who.first) named.set(who.last, [...(named.get(who.last) || []), { id: item.id, who }])
      else surnameOnly.push({ id: item.id, who })
    }
  }

  for (const [identity, ids] of byIdentity) {
    for (let i = 0; i < ids.length; i += 1) for (const id of ids.slice(i + 1)) join(ids[i], id, `Matching explicit ${identity.split(':')[0].replace('_', ' ')}`)
  }
  for (const ids of byThread.values()) {
    for (let i = 0; i < ids.length; i += 1) for (const id of ids.slice(i + 1)) join(ids[i], id, 'Matching source email thread')
  }
  for (const ids of byNumber.values()) {
    for (let i = 0; i < ids.length; i += 1) for (const id of ids.slice(i + 1)) join(ids[i], id, 'Matching claim or invoice number in the brief')
  }
  for (const ids of byAddress.values()) {
    for (let i = 0; i < ids.length; i += 1) for (const id of ids.slice(i + 1)) join(ids[i], id, 'Matching property street address in title')
  }
  for (const ids of byOrg.values()) {
    for (let i = 0; i < ids.length; i += 1) for (const id of ids.slice(i + 1)) join(ids[i], id, 'Matching organisation name, identity not confirmed')
  }
  for (const entries of named.values()) {
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        if (sameFirst(entries[i].who.first, entries[j].who.first)) join(entries[i].id, entries[j].id, 'Matching client name, identity not confirmed')
      }
    }
  }
  // A surname alone joins the full names it ends, but only when they are all one person.
  // "Brown" next to Naa Brown and Sarah Brown could be either, so it stays on its own.
  /** @type {Map<string, number[]>} */
  const loneSurnames = new Map()
  for (const { id, who } of surnameOnly) {
    const matches = (named.get(who.last) || []).filter((entry) => endsWith(entry.who, who))
    const onePerson = matches.every((left) => matches.every((right) => sameFirst(left.who.first, right.who.first)))
    if (!onePerson) continue
    for (const match of matches) join(id, match.id, 'Unambiguous client surname, identity not confirmed')
    const key = who.tokens.join(' ')
    loneSurnames.set(key, [...(loneSurnames.get(key) || []), id])
  }
  for (const ids of loneSurnames.values()) {
    for (let i = 0; i < ids.length; i += 1) for (const id of ids.slice(i + 1)) join(ids[i], id, 'Matching client surname, identity not confirmed')
  }

  // Cards with an empty brief.client whose cleaned title mentions an unambiguous known client surname
  for (const item of open) {
    if (clients.get(item.id)) continue
    const cleaned = plain(cleanSubject(item.brief?.title || item.title))
    const words = cleaned.match(/[a-z]{4,}/g) || []
    for (const word of words) {
      if (TITLE_STOP.has(word) || NOT_A_CLIENT.has(word) || staff.has(word)) continue
      const matches = named.get(word) || []
      const loneIds = loneSurnames.get(word) || []
      if (!matches.length && !loneIds.length) continue
      const onePerson = matches.every((left) => matches.every((right) => sameFirst(left.who.first, right.who.first)))
      if (!onePerson) continue
      for (const match of matches) join(item.id, match.id, 'Matching client surname in title')
      for (const otherId of loneIds) join(item.id, otherId, 'Matching client surname in title')
    }
  }

  /** @type {Map<number, Array<Record<string, any>>>} */
  const members = new Map()
  for (const item of open) {
    const root = find(item.id)
    members.set(root, [...(members.get(root) || []), item])
  }
  /** @type {Map<number, ClaimGroup>} */
  const groups = new Map()
  for (const [root, group] of members) {
    if (group.length < 2) continue
    let key = ''
    for (const field of ['claim_id', 'invoice_id', 'client_id']) {
      const ids = values(root, field)
      if (ids.size === 1) { key = `${field}:${[...ids][0]}`; break }
    }
    if (!key) {
      const numbers = [...new Set(group.flatMap(item => claimNumbers(item.brief?.claim)))].sort()
      const names = group.flatMap(item => {
        const client = clients.get(item.id)
        return client?.org ? [client.org] : (client?.people || []).map(who => `${who.last}:${canonicalFirst(who.first)}`)
      }).sort()
      const addrs = [...new Set(group.flatMap(item => (cardAddresses.get(item.id) || []).map(a => a.key)))].sort()
      const threads = [...new Set(group.map(item => extractThreadKey(item)).filter(Boolean))].sort()
      key = numbers.length
        ? `claim-number:${numbers[0]}`
        : names.length
        ? `client-name:${names[0]}`
        : addrs.length
        ? `address:${addrs[0]}`
        : threads.length
        ? `${threads[0]}`
        : `claim-${root}`
    }
    const groupReasons = [...new Set(group.flatMap(item => [...(reasons.get(item.id) || [])]))]
    const entry = {
      key,
      label: groupLabel(group, clients, clientLabels, cardAddresses),
      reason: groupReasons[0] || 'Shared identity',
      reasons: groupReasons,
      conflicts: group.flatMap(item => conflicts.get(item.id) || []),
    }
    for (const item of group) groups.set(item.id, entry)
  }
  return { groups, conflicts }
}

/**
 * The name on the claim card: the client line most cards use, then the one naming the most
 * people, then the shortest. A claim held together only by its number or street address is called by it.
 * @param {Array<Record<string, any>>} group
 * @param {Map<number, Client|null>} clients
 * @param {Map<number, string>} clientLabels
 * @param {Map<number, Array<{key: string, label: string}>>} cardAddresses
 */
function groupLabel(group, clients, clientLabels, cardAddresses) {
  /** @type {Map<string, {count: number, people: number}>} */
  const names = new Map()
  for (const item of group) {
    const client = clients.get(item.id)
    if (!client || client.rollup) continue
    const written = clientLabels.get(item.id) || String(item.brief?.client || '').replace(/\s+/g, ' ').trim()
    if (!written) continue
    const seen = names.get(written) || { count: 0, people: client.people.filter((who) => who.first).length }
    seen.count += 1
    names.set(written, seen)
  }
  const ranked = [...names.entries()].sort((left, right) =>
    (right[1].count - left[1].count) || (right[1].people - left[1].people) || (left[0].length - right[0].length))
  if (ranked.length) return ranked[0][0]
  const claim = group.map((item) => item.brief && item.brief.claim).find((value) => typeof value === 'string' && value.trim())
  if (claim) return /^(invoice|claim)\b/i.test(claim.trim()) ? claim.trim() : `Claim ${claim.trim()}`
  for (const item of group) {
    const addrs = cardAddresses.get(item.id)
    if (addrs && addrs.length) return addrs[0].label
  }
  return 'Same claim'
}
