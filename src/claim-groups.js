// Frank, 10/04/2026: "the same customer / claim is currently being assigned several cards.
// consolidate the cards and list all open tasks for that claim under the same card."
// Aries opens a card per email thread, so one claim collects a card for every thread about
// it. The board groups open cards by the client and the claim or invoice number in the brief
// Aries writes for each card. Grouping is only a view: every card keeps its own id, owner and
// actions, and nothing here changes what Aries published.

/** @typedef {{tokens: string[], first: string, last: string}} Person */
/** @typedef {{people: Person[], org: string, rollup: boolean}} Client */
/** @typedef {{key: string, label: string}} ClaimGroup */

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
  const staff = new Set([...(options.staff || [])].map((name) => plain(String(name)).trim()).filter(Boolean))
  const open = items.filter((item) => item && item.status !== 'done' && Number.isSafeInteger(item.id))
  /** @type {Map<number, number>} */
  const parent = new Map(open.map((item) => [item.id, item.id]))
  /** @param {number} id @returns {number} */
  const find = (id) => {
    let root = id
    while (parent.get(root) !== root) root = /** @type {number} */ (parent.get(root))
    parent.set(id, root)
    return root
  }
  /** @param {number} left @param {number} right */
  const join = (left, right) => {
    const a = find(left)
    const b = find(right)
    if (a !== b) parent.set(Math.max(a, b), Math.min(a, b))
  }

  /** @type {Map<number, Client|null>} */
  const clients = new Map()
  /** @type {Map<string, number[]>} */
  const byNumber = new Map()
  /** @type {Map<string, number[]>} */
  const byOrg = new Map()
  /** @type {Map<string, Array<{id: number, who: Person}>>} */
  const named = new Map()
  /** @type {Array<{id: number, who: Person}>} */
  const surnameOnly = []

  for (const item of open) {
    const brief = item.brief && typeof item.brief === 'object' ? item.brief : {}
    for (const number of claimNumbers(brief.claim)) {
      byNumber.set(number, [...(byNumber.get(number) || []), item.id])
    }
    const client = parseClient(brief.client, staff)
    clients.set(item.id, client)
    if (!client || client.rollup) continue
    if (client.org) byOrg.set(client.org, [...(byOrg.get(client.org) || []), item.id])
    for (const who of client.people) {
      if (who.first) named.set(who.last, [...(named.get(who.last) || []), { id: item.id, who }])
      else surnameOnly.push({ id: item.id, who })
    }
  }

  for (const ids of [...byNumber.values(), ...byOrg.values()]) {
    for (const id of ids.slice(1)) join(ids[0], id)
  }
  for (const entries of named.values()) {
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        if (sameFirst(entries[i].who.first, entries[j].who.first)) join(entries[i].id, entries[j].id)
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
    for (const match of matches) join(id, match.id)
    const key = who.tokens.join(' ')
    loneSurnames.set(key, [...(loneSurnames.get(key) || []), id])
  }
  for (const ids of loneSurnames.values()) {
    for (const id of ids.slice(1)) join(ids[0], id)
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
    const entry = { key: `claim-${root}`, label: groupLabel(group, clients) }
    for (const item of group) groups.set(item.id, entry)
  }
  return groups
}

/**
 * The name on the claim card: the client line most cards use, then the one naming the most
 * people, then the shortest. A claim held together only by its number is called by it.
 * @param {Array<Record<string, any>>} group
 * @param {Map<number, Client|null>} clients
 */
function groupLabel(group, clients) {
  /** @type {Map<string, {count: number, people: number}>} */
  const names = new Map()
  for (const item of group) {
    const client = clients.get(item.id)
    if (!client || client.rollup) continue
    const written = String(item.brief.client).replace(/\s+/g, ' ').trim()
    const seen = names.get(written) || { count: 0, people: client.people.filter((who) => who.first).length }
    seen.count += 1
    names.set(written, seen)
  }
  const ranked = [...names.entries()].sort((left, right) =>
    (right[1].count - left[1].count) || (right[1].people - left[1].people) || (left[0].length - right[0].length))
  if (ranked.length) return ranked[0][0]
  const claim = group.map((item) => item.brief && item.brief.claim).find((value) => typeof value === 'string' && value.trim())
  if (!claim) return 'Same claim'
  return /^(invoice|claim)\b/i.test(claim.trim()) ? claim.trim() : `Claim ${claim.trim()}`
}
