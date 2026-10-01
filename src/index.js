import { APP_HTML } from './ui.js'
import { CARD_HTML } from './card-ui.js'
import { missionRequest, checkServices } from './mission.js'

/**
 * @typedef {object} BoardItem
 * @property {number} id
 * @property {string} title
 * @property {string} [summary]
 * @property {string} [assignee]
 * @property {number|string} [priority]
 * @property {string} [status]
 * @property {string} [due]
 * @property {string} [kind]
 * @property {string} [note]
 * @property {string} [updated]
 */
/** @typedef {{items: BoardItem[]}} BoardSnapshot */
/** @typedef {{snapshot_json: string, published_at: string}} SnapshotRow */
/** @typedef {Record<string, unknown>} JsonObject */
/** @typedef {{items: JsonObject[]}} TodoCatalogue */
/** @typedef {{catalogue_json: string, published_at: string}} TodoCatalogueRow */
/** @typedef {{id: number, operation: string, item_id: number, actor_email: string, created_at: string, state: string, acked_at: string|null}} CompletionCommand */
/** @typedef {{key: string, name: string, email: string, past_emails: string[]}} TeamMember */

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
const UI_PATHS = new Set(['/', '/card', '/api/card', '/api/card/done', '/api/board', '/api/action', '/api/todos', '/api/todo/action', '/api/worklist', '/api/thread'])
// Served only to ACTIVITY_OWNER_EMAILS; every other identity gets the same 404 as a path
// that does not exist, so staff never learn the log is there.
const ACTIVITY_PATHS = new Set(['/activity', '/api/activity'])
// The User settings tab reads and writes the roster here, under the same owner-only rule.
const TEAM_PATH = '/api/team'
const ACTIVITY_LIMIT = 1000
// More than this many of one action by one person inside the window is flagged as a burst.
const BURST_COUNT = 20
const BURST_WINDOW_MS = 10 * 60 * 1000
const SYNC_PATH = /^\/api\/sync\/(?:snapshot|worklist|threads|team|commands(?:\/\d+\/ack)?|todos\/(?:catalogue|operations|state))$/
const MAX_ITEMS = 1000
const MAX_SNAPSHOT_BYTES = 1_800_000
const MAX_TODO_BYTES = 1_800_000
const MAX_OPERATION_BATCH = 100
const MAX_OPERATION_BYTES = 512_000
const TASK_ID_PATTERN = /^task-[0-9a-f]{14}$/
const EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/
const TODO_STRING_LIMITS = Object.freeze({
  text: 1000,
  details: 4000,
  client: 240,
  actionType: 120,
  notificationDate: 80,
  date: 80,
  due: 80,
  sourceUrl: 2048,
  sourceMessageId: 240,
  sourceAccount: 240,
  assignee: 160,
  who: 160,
  section: 160,
})
const TODO_EDIT_FIELDS = new Set([...Object.keys(TODO_STRING_LIMITS), 'sourceRevision', 'upstreamIds'])
const TODO_OPERATIONS = new Set(['toggle', 'assign', 'add', 'edit', 'attach', 'detach', 'snooze', 'archive', 'delete'])
const TODO_SNAPSHOT_FIELDS = new Set([
  'id', 'text', 'details', 'client', 'actionType', 'notificationDate', 'sourceUrl',
  'due', 'assignee', 'attachments', 'sourceRevision', 'historyVisible',
])
// The people on the board. Frank, 09/29/2026: "if i want to change mark's name to Mike, I dont
// have a way to do that right now. If mark changes his email address, I want to be able to
// update it." They live in D1 (team_users, migration 0007) and Frank edits them on the User
// settings tab. A person's key is what cards are assigned to and never changes, so renaming
// Mark keeps every card he owns. This list is only the fallback while the table is empty.
const DEFAULT_TEAM = Object.freeze([
  { key: 'frank', name: 'Frank', email: 'frankd@flooddoctorva.com' },
  { key: 'mark', name: 'Mark', email: 'mark@flood.doctor' },
  { key: 'steve', name: 'Steve', email: 'steve@restorationdoctors.com' },
  { key: 'shayan', name: 'Shayan', email: 'shyon@restorationdoctors.com' },
  { key: 'katherine', name: 'Katherine', email: 'katherine@restorationdoctors.com' },
])
// Aries only emails company addresses, and Access only signs in these three domains, so a
// person's address has to be on one of them.
const TEAM_DOMAINS = Object.freeze(['flood.doctor', 'flooddoctorva.com', 'restorationdoctors.com'])
// Keys a new person never gets: Aries itself, and mailboxes Aries already knows by these names
// (team.json on Aries keys Shayan as "shyon").
const RESERVED_KEYS = Object.freeze(['aries', 'shyon', 'office', 'admin', 'info', 'billing', 'personal'])
const TEAM_KEY = /^[a-z][a-z0-9]{1,23}$/
const TEAM_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
const TEAM_NAME = /^\p{L}[\p{L}\p{M} .'-]*$/u
const TEAM_NAME_LIMIT = 40
const TEAM_EMAIL_LIMIT = 120
const MAX_TEAM = 30
const MAX_PAST_EMAILS = 10
// Frank signs in with an address that is not his company one.
const SIGN_IN_ALIASES = Object.freeze({ 'darakhshan.farough@gmail.com': 'frank' })
// Who may change the To-Do list, by key, so a changed email keeps working.
const TODO_ACTOR_KEYS = Object.freeze(['frank', 'mark'])
// Mailboxes that show up in card history but are not people on the roster.
const OTHER_NAMES = Object.freeze({
  'aries@flood.doctor': 'Aries',
  'info@restorationdoctors.com': 'Office',
  'dave@flooddoctorva.com': 'Dave',
})
const STRING_LIMITS = Object.freeze({
  title: 240,
  summary: 2000,
  assignee: 120,
  status: 80,
  due: 80,
  kind: 80,
  note: 2000,
  updated: 120,
  // The Gmail permalink for the message a row came from. Read-only: the UI opens it,
  // the worker never fetches it.
  source_url: 2048,
  snoozed_until: 80,
  // The day the card was opened (YYYY-MM-DD), so a card can say how long it has been waiting.
  created: 40,
  // When someone marked the card urgent (ISO time); absent when it is not urgent.
  urgent: 40,
})
// The per-card brief Aries writes from the card's email thread (bin/card-brief.py): what the
// task needs, who is waiting, what to do next. Frank, 09/29/2026: "I never know what each task
// needs or who was last to work on that task or what I should do about it." The shape is frozen
// in docs/requirements-2026-09-29-better-cards.md; Aries validates the same limits before it
// publishes.
const BRIEF_STRING_LIMITS = Object.freeze({
  // A short title Aries writes from the thread ("Malik: Travelers final determination, $40,859"),
  // because a third of the cards were titled with a raw email subject. Optional: '' until the
  // card's brief is next written, and the board cleans the subject meanwhile.
  title: 100,
  needs: 400,
  next_step: 300,
  waiting_on: 160,
  client: 160,
  claim: 80,
  amount: 40,
  deadline_note: 160,
  phone: 40,
})
const BRIEF_ACTIONS = Object.freeze(['reply', 'call', 'invoice', 'payment', 'review', 'decide', 'wait', 'file', 'close'])
// A brief's owner_hint is a roster key or '' (checked against the roster when it is curated).
const DEFAULT_BRIEF_OWNERS = new Set([...DEFAULT_TEAM.map((member) => member.key), ''])
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
// What Aries is doing on a card, from bin/assign_notify.py and the owner-task queue: the prep
// for its owner (`prep`), or the card itself when Aries owns it (`aries_task`).
const TASK_STATES = Object.freeze(['queued', 'running', 'ready', 'failed', 'timed_out', 'interrupted', 'cancelled'])
// The same, as the To-Do catalogue carries it for a task made from a card.
const TODO_ARIES_PREP = Object.freeze(['queued', 'running', 'ready', 'failed'])
const HISTORY_DAYS = 120
const HISTORY_PER_CARD = 10
const MAX_NOTES = 20
// `useful` / `not_useful` are the thumbs on a card. They change nothing about the task; they
// are how the team tells Aries whether an email of that shape should have become a card at
// all, so the next inbox sweep stops repeating a mistake. Neither takes an argument -- the
// card already identifies the sender, and the sender is what gets learned.
// `nudge` asks the card's owner for an update: Aries emails them and copies whoever asked.
// Its value is the owner's name at the time, which is what the card history shows.
// `prep` keeps the card with its teammate and has Aries do the prep work for them (Frank,
// 09/29/2026: "assign a task to a teamate, and also assign it to aries so that aries can do some
// prep work for that teamate"). Its value is the teammate the prep is for; migration 0008.
// `urgent` ('on' or 'off') flags a card: it goes to the top and Aries emails whoever must act
// (Frank, 09/29/2026: "it appears at the top and it nudges the teamates that must do something
// asap"). Migration 0008 too.
const BOARD_OPERATIONS = Object.freeze([
  'done', 'reopen', 'note', 'assign', 'snooze', 'reorder', 'delete', 'useful', 'not_useful', 'nudge', 'prep',
  'urgent',
])
const MAX_WORKLIST_ITEMS = 1000
const MAX_THREADS = 60
const MAX_THREAD_MESSAGES = 20
const THREAD_STRING_LIMITS = Object.freeze({ from: 300, to: 300, date: 300, subject: 300, body: 4000 })
const WORKLIST_STRING_LIMITS = Object.freeze({
  text: 2000,
  who: 160,
  due: 80,
  section: 160,
})

/**
 * @param {unknown} body
 * @param {number} [status]
 * @param {Record<string, string>} [headers]
 * @returns {Response}
 */
function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'cache-control': 'no-store' },
  })
}

function appHtml(html = APP_HTML) {
  return new Response(html, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    },
  })
}

function forbidden() {
  return json({ error: 'Forbidden' }, 403)
}

function unauthorized() {
  return json({ error: 'Unauthorized' }, 401, {
    'www-authenticate': 'Bearer',
  })
}

/** @param {string} message */
function badRequest(message) {
  return json({ error: message }, 400)
}

/** @param {string} allowed */
function methodNotAllowed(allowed) {
  return json({ error: 'Method not allowed' }, 405, { allow: allowed })
}

function unsupportedMediaType() {
  return json({ error: 'Content-Type must be application/json' }, 415)
}

/** @param {string} [message] */
function missing(message = 'Not found') {
  return json({ error: message }, 404)
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {string|null}
 */
function allowedEmail(request, env) {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return null
  // Staff are admitted by company domain; ALLOWED_EMAILS remains for individuals outside
  // one (Frank's own gmail). Access is the gate that proves the identity — this is the
  // worker's independent second check, so it must accept exactly the same population.
  const domains = typeof env.ALLOWED_EMAIL_DOMAINS === 'string'
    ? env.ALLOWED_EMAIL_DOMAINS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
    : []
  if (domains.length) {
    const at = email.lastIndexOf('@')
    const domain = at === -1 ? '' : email.slice(at + 1).toLowerCase()
    if (domain && domains.includes(domain)) return email
  }
  if (typeof env.ALLOWED_EMAILS !== 'string') return null
  const allowed = env.ALLOWED_EMAILS.split(',').map((value) => value.trim())
  return allowed.includes(email) ? email : null
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {boolean}
 */
function isActivityOwner(request, env) {
  const email = (request.headers.get('Cf-Access-Authenticated-User-Email') || '').trim().toLowerCase()
  if (!email || typeof env.ACTIVITY_OWNER_EMAILS !== 'string') return false
  return env.ACTIVITY_OWNER_EMAILS.split(',').map((value) => value.trim().toLowerCase()).includes(email)
}

/**
 * Where a write came from. Access puts the real client address in CF-Connecting-IP.
 * @param {Request} request
 */
function requestOrigin(request) {
  const cf = /** @type {{country?: string}|undefined} */ (/** @type {any} */ (request).cf)
  return {
    ip: request.headers.get('CF-Connecting-IP') || null,
    country: cf && typeof cf.country === 'string' ? cf.country : null,
    userAgent: (request.headers.get('User-Agent') || '').slice(0, 300) || null,
  }
}

/**
 * One audit row. The card title is resolved inside D1 from the published board or To-Do
 * catalogue, so the worker never parses a 1.8 MB snapshot per click.
 * @param {Env} env
 * @param {Request} request
 * @param {{at: string, actorEmail: string, source: 'board'|'todo', operation: string, itemId: string, value: string|null}} entry
 */
function activityStatement(env, request, entry) {
  const origin = requestOrigin(request)
  return env.DB.prepare(`
    INSERT INTO activity_log (
      at, actor_email, source, operation, item_id, value, title, ip, country, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, COALESCE(
      (SELECT json_extract(j.value, '$.title')
         FROM board_snapshot b, json_each(b.snapshot_json, '$.items') j
        WHERE ? = 'board' AND CAST(json_extract(j.value, '$.id') AS TEXT) = ? LIMIT 1),
      (SELECT json_extract(j.value, '$.text')
         FROM todo_catalogue c, json_each(c.catalogue_json, '$.items') j
        WHERE ? = 'todo' AND json_extract(j.value, '$.id') = ? LIMIT 1)
    ), ?, ?, ?)
  `).bind(
    entry.at, entry.actorEmail, entry.source, entry.operation, entry.itemId, entry.value,
    entry.source, entry.itemId, entry.source, entry.itemId,
    origin.ip, origin.country, origin.userAgent,
  )
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {Promise<boolean>}
 */
async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index]
  }
  return difference === 0
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<boolean>}
 */
async function validPublisher(request, env) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token || typeof env.PUBLISHER_TOKEN !== 'string' || !env.PUBLISHER_TOKEN) {
    return false
  }
  return constantTimeEqual(token, env.PUBLISHER_TOKEN)
}

/**
 * @param {Request} request
 * @returns {Promise<unknown>}
 */
async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/** @param {Request} request */
function hasJsonContentType(request) {
  const contentType = request.headers.get('content-type') || ''
  return contentType.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

/**
 * @param {unknown} item
 * @returns {BoardItem|null}
 */
/**
 * A card's note history. Refused outright rather than trimmed: a publisher that starts sending
 * something unexpected here should fail loudly, not have it quietly reshaped on the way in.
 * @param {unknown} value
 * @returns {Array<{at: string, by: string, text: string}>|null}
 */
function curateNotes(value) {
  if (!Array.isArray(value) || value.length > MAX_NOTES) return null
  const notes = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const source = /** @type {Record<string, unknown>} */ (entry)
    const text = typeof source.text === 'string' ? source.text : ''
    const at = typeof source.at === 'string' ? source.at : ''
    // An unattributed note is expected -- rows written before notes had authors carry one --
    // so an empty author is valid and the UI says so plainly rather than inventing a name.
    const by = source.by === undefined || source.by === null ? '' : source.by
    if (typeof by !== 'string') return null
    if (!text.trim() || text.length > STRING_LIMITS.note) return null
    if (at.length > 80 || by.length > 160) return null
    notes.push({ at, by, text })
  }
  return notes
}

/**
 * One email event inside a brief: who wrote the latest message on one side of the thread.
 * @param {unknown} value
 * @returns {{by: string, at: string, what: string}|null|undefined} undefined when invalid
 */
function curateBriefEmail(value) {
  if (value === null || value === undefined) return null
  if (!isObject(value)) return undefined
  const source = /** @type {Record<string, unknown>} */ (value)
  const by = boundedString(source.by, 160, false)
  const what = boundedString(source.what ?? '', 200)
  if (by === null || what === null || !validTimestamp(source.at)) return undefined
  return { by, at: /** @type {string} */ (source.at), what }
}

/**
 * The brief on one card. Returns null for anything off-contract: the card then shows without
 * its brief, and the publisher is told how many were dropped, instead of one bad brief
 * rejecting the whole board and leaving everybody looking at a stale snapshot.
 * @param {unknown} value
 * @param {Set<string>} owners roster keys plus '' for no hint
 */
function curateBrief(value, owners) {
  if (!isObject(value)) return null
  const source = /** @type {Record<string, unknown>} */ (value)
  /** @type {Record<string, unknown>} */
  const brief = {}
  for (const [field, limit] of Object.entries(BRIEF_STRING_LIMITS)) {
    const text = boundedString(source[field] ?? '', limit)
    if (text === null) return null
    brief[field] = text
  }
  if (!brief.title) delete brief.title
  if (!BRIEF_ACTIONS.includes(/** @type {string} */ (source.action))) return null
  brief.action = source.action
  const owner = source.owner_hint ?? ''
  if (typeof owner !== 'string' || !owners.has(owner)) return null
  brief.owner_hint = owner
  for (const field of ['waiting_since', 'deadline']) {
    const day = source[field] ?? ''
    if (typeof day !== 'string' || (day && (!ISO_DAY.test(day) || !Number.isFinite(Date.parse(day))))) return null
    brief[field] = day
  }
  if (typeof (source.counsel_only ?? false) !== 'boolean') return null
  brief.counsel_only = source.counsel_only === true
  for (const field of ['last_ours', 'last_theirs']) {
    const email = curateBriefEmail(source[field])
    if (email === undefined) return null
    brief[field] = email
  }
  const messages = source.messages ?? 0
  if (!Number.isSafeInteger(messages) || /** @type {number} */ (messages) < 0 || /** @type {number} */ (messages) > 500) return null
  brief.messages = messages
  if (!validTimestamp(source.generated_at)) return null
  brief.generated_at = source.generated_at
  return brief
}

/**
 * One Aries task on a card. Null when off-contract, which drops only this field.
 * @param {unknown} value
 * @param {Set<string>} owners
 */
function curateTaskState(value, owners) {
  if (!isObject(value)) return null
  const source = /** @type {Record<string, unknown>} */ (value)
  if (!TASK_STATES.includes(/** @type {string} */ (source.status)) || !validTimestamp(source.at)) return null
  /** @type {Record<string, unknown>} */
  const state = { status: source.status, at: source.at }
  if (source.finished_at !== undefined && source.finished_at !== null) {
    if (!validTimestamp(source.finished_at)) return null
    state.finished_at = source.finished_at
  }
  if (source.for !== undefined && source.for !== null) {
    if (typeof source.for !== 'string' || !owners.has(source.for)) return null
    state.for = source.for
  }
  return state
}

/**
 * @param {unknown} item
 * @param {{briefsDropped: number}} [tally]
 * @param {Set<string>} [owners] roster keys a brief may hint, plus ''
 */
function curateItem(item, tally, owners = DEFAULT_BRIEF_OWNERS) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const source = /** @type {Record<string, unknown>} */ (item)
  if (!Number.isSafeInteger(source.id) || /** @type {number} */ (source.id) <= 0) return null
  if (typeof source.title !== 'string') return null
  const title = source.title.trim()
  if (!title || title.length > STRING_LIMITS.title) return null
  if (typeof source.kind === 'string' && source.kind.trim().toLowerCase() === 'personal') return null

  /** @type {Record<string, string|number>} */
  const curated = { id: /** @type {number} */ (source.id), title }
  for (const [field, limit] of Object.entries(STRING_LIMITS)) {
    if (field === 'title' || source[field] === undefined || source[field] === null) continue
    if (typeof source[field] !== 'string' || source[field].length > limit) return null
    curated[field] = source[field]
  }
  if (source.priority !== undefined && source.priority !== null) {
    const validNumber = typeof source.priority === 'number' && Number.isFinite(source.priority)
    const validString = typeof source.priority === 'string' && source.priority.length <= 64
    if (!validNumber && !validString) return null
    curated.priority = /** @type {number|string} */ (source.priority)
  }
  // The note history. A card used to carry one note string that each new note overwrote, with
  // no author and no time, so it could say something without saying who said it. Three
  // surfaces write to this board, which makes an unattributed note close to useless.
  if (source.notes !== undefined && source.notes !== null) {
    const notes = curateNotes(source.notes)
    if (!notes) return null
    if (notes.length) curated.notes = notes
  }
  if (source.brief !== undefined && source.brief !== null) {
    const brief = curateBrief(source.brief, owners)
    if (brief) /** @type {Record<string, unknown>} */ (curated).brief = brief
    else if (tally) tally.briefsDropped += 1
  }
  for (const field of ['prep', 'aries_task']) {
    if (source[field] === undefined || source[field] === null) continue
    const state = curateTaskState(source[field], owners)
    if (state) /** @type {Record<string, unknown>} */ (curated)[field] = state
  }
  return /** @type {BoardItem} */ (curated)
}

/**
 * @param {unknown} payload
 * @param {{briefsDropped: number}} [tally]
 * @param {Set<string>} [owners] roster keys a brief may hint, plus ''
 * @returns {BoardSnapshot|null}
 */
function curateSnapshot(payload, tally, owners = DEFAULT_BRIEF_OWNERS) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const source = /** @type {Record<string, unknown>} */ (payload)
  if (!Array.isArray(source.items) || source.items.length > MAX_ITEMS) return null
  /** @type {BoardItem[]} */
  const items = []
  const ids = new Set()
  for (const item of source.items) {
    const curated = curateItem(item, tally, owners)
    if (!curated || ids.has(curated.id)) return null
    ids.add(curated.id)
    items.push(curated)
  }
  return { items }
}

/** @param {unknown} value */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {JsonObject} value
 * @param {string[]} keys
 */
function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

/** @param {unknown} value */
function validTimestamp(value) {
  return typeof value === 'string' && value.length <= 80 && Number.isFinite(Date.parse(value))
}

/**
 * @param {unknown} value
 * @param {number} limit
 * @param {boolean} [allowEmpty]
 */
function boundedString(value, limit, allowEmpty = true) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if ((!allowEmpty && !trimmed) || trimmed.length > limit) return null
  return trimmed
}

/** @param {unknown} value */
function curateUpstreamIds(value) {
  if (!Array.isArray(value) || value.length > 50) return null
  /** @type {string[]} */
  const curated = []
  const seen = new Set()
  for (const item of value) {
    const id = boundedString(item, 240, false)
    if (id === null || seen.has(id)) return null
    seen.add(id)
    curated.push(id)
  }
  return curated
}

/**
 * @param {unknown} item
 * @returns {JsonObject|null}
 */
function curateTodoItem(item) {
  if (!isObject(item)) return null
  const source = /** @type {JsonObject} */ (item)
  if (typeof source.id !== 'string' || !TASK_ID_PATTERN.test(source.id)) return null
  const text = boundedString(source.text, TODO_STRING_LIMITS.text, false)
  if (text === null || typeof source.seedDone !== 'boolean') return null

  const privateMarker = source.personal === true || source.private === true
    || ['kind', 'scope', 'visibility', 'category'].some((field) => {
      const value = source[field]
      return typeof value === 'string' && ['personal', 'private'].includes(value.trim().toLowerCase())
    })
  if (privateMarker) return null

  /** @type {JsonObject} */
  const curated = { id: source.id, text, seedDone: source.seedDone }
  for (const [field, limit] of Object.entries(TODO_STRING_LIMITS)) {
    if (field === 'text' || source[field] === undefined || source[field] === null) continue
    const value = boundedString(source[field], limit)
    if (value === null) return null
    curated[field] = value
  }
  if (source.sourceRevision !== undefined && source.sourceRevision !== null) {
    const revisionIsNumber = typeof source.sourceRevision === 'number' && Number.isSafeInteger(source.sourceRevision)
    const revisionIsString = boundedString(source.sourceRevision, 240, false) !== null
    if (!revisionIsNumber && !revisionIsString) return null
    curated.sourceRevision = revisionIsNumber
      ? source.sourceRevision
      : /** @type {string} */ (source.sourceRevision).trim()
  }
  if (source.upstreamIds !== undefined && source.upstreamIds !== null) {
    const upstreamIds = curateUpstreamIds(source.upstreamIds)
    if (!upstreamIds) return null
    curated.upstreamIds = upstreamIds
  }
  // Carried from the card the task was made from: urgent sorts it to the top, and ariesPrep says
  // what Aries is doing for its owner. Anything else in either field is ignored, not refused.
  if (source.urgent === true) curated.urgent = true
  if (typeof source.ariesPrep === 'string' && TODO_ARIES_PREP.includes(source.ariesPrep)) curated.ariesPrep = source.ariesPrep
  if (curated.ariesPrep && typeof source.ariesPrepFor === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(source.ariesPrepFor)) {
    curated.ariesPrepFor = source.ariesPrepFor
  }
  // The newest change to any source card: a To-Do check-off or owner older than it has been
  // overtaken by the board, and the board wins (replayTodos).
  if (validTimestamp(source.sourceUpdatedAt)) curated.sourceUpdatedAt = source.sourceUpdatedAt
  return curated
}

/**
 * @param {unknown} payload
 * @param {boolean} [allowEmpty]
 * @returns {TodoCatalogue|null}
 */
function curateTodoCatalogue(payload, allowEmpty = false) {
  if (!isObject(payload)) return null
  const source = /** @type {JsonObject} */ (payload)
  if (!hasExactKeys(source, ['items'])) return null
  if (!Array.isArray(source.items) || (!allowEmpty && source.items.length === 0) || source.items.length > MAX_ITEMS) return null
  /** @type {JsonObject[]} */
  const items = []
  const ids = new Set()
  for (const item of source.items) {
    const curated = curateTodoItem(item)
    const id = curated?.id
    if (!curated || typeof id !== 'string' || ids.has(id)) return null
    ids.add(id)
    items.push(curated)
  }
  return { items }
}

/**
 * @param {JsonObject} changes
 * @returns {JsonObject|null}
 */
function curateEditChanges(changes) {
  const keys = Object.keys(changes)
  if (!keys.length || keys.some((key) => !TODO_EDIT_FIELDS.has(key))) return null
  /** @type {JsonObject} */
  const curated = {}
  for (const key of keys) {
    if (key === 'upstreamIds') {
      const ids = curateUpstreamIds(changes[key])
      if (!ids) return null
      curated[key] = ids
    } else if (key === 'sourceRevision') {
      const value = changes[key]
      const isNumber = typeof value === 'number' && Number.isSafeInteger(value)
      const isString = boundedString(value, 240, false) !== null
      if (!isNumber && !isString) return null
      curated[key] = isNumber ? value : /** @type {string} */ (value).trim()
    } else {
      const limit = /** @type {Record<string, number>} */ (TODO_STRING_LIMITS)[key]
      const value = boundedString(changes[key], limit, key !== 'text')
      if (value === null) return null
      curated[key] = value
    }
  }
  return curated
}

/** @param {unknown} value */
function curateAttachment(value) {
  if (!isObject(value)) return null
  const source = /** @type {JsonObject} */ (value)
  const allowed = new Set(['id', 'kind', 'name', 'url', 'storageName', 'size', 'mime', 'sha256', 'addedBy', 'addedAt'])
  if (Object.keys(source).some((key) => !allowed.has(key))) return null
  const id = boundedString(source.id, 160, false)
  const name = boundedString(source.name, 500, false)
  if (id === null || name === null || !/^[A-Za-z0-9._-]+$/.test(id)) return null
  if (source.kind === 'link') {
    const url = boundedString(source.url, 2048, false)
    try {
      if (url === null || new URL(url).protocol !== 'https:') return null
    } catch {
      return null
    }
    return { id, kind: 'link', name, url }
  }
  if (source.kind !== 'file') return null
  const storageName = boundedString(source.storageName, 80, false)
  const mime = boundedString(source.mime, 240, false)
  const sha256 = boundedString(source.sha256, 64, false)
  const size = source.size
  if (storageName === null || !/^todo-[0-9a-f]{32}$/.test(storageName)
      || mime === null || sha256 === null || !/^[0-9a-f]{64}$/.test(sha256)
      || !Number.isSafeInteger(size) || /** @type {number} */ (size) < 0
      || /** @type {number} */ (size) > 20 * 1024 * 1024) return null
  /** @type {JsonObject} */
  const curated = { id, kind: 'file', name, storageName, size, mime, sha256 }
  if (source.addedBy !== undefined && source.addedBy !== null) {
    const addedBy = boundedString(source.addedBy, 160, false)
    if (addedBy === null) return null
    curated.addedBy = addedBy
  }
  if (source.addedAt !== undefined && source.addedAt !== null) {
    if (typeof source.addedAt !== 'number' || !Number.isFinite(source.addedAt) || source.addedAt < 0) return null
    curated.addedAt = source.addedAt
  }
  return curated
}

/** @param {unknown} value @param {number} limit */
function curateAttachments(value, limit) {
  if (!Array.isArray(value) || value.length === 0 || value.length > limit) return null
  const attachments = value.map(curateAttachment)
  if (attachments.some((attachment) => !attachment)) return null
  const ids = attachments.map((attachment) => attachment?.id)
  return ids.length === new Set(ids).size ? /** @type {JsonObject[]} */ (attachments) : null
}

/** @param {unknown} value @param {string} itemId */
function curateToggleSnapshot(value, itemId) {
  if (!isObject(value)) return null
  const source = /** @type {JsonObject} */ (value)
  if (Object.keys(source).some((key) => !TODO_SNAPSHOT_FIELDS.has(key)) || source.id !== itemId) return null
  const text = boundedString(source.text, TODO_STRING_LIMITS.text, false)
  if (text === null) return null
  /** @type {JsonObject} */
  const snapshot = { id: itemId, text }
  for (const field of ['details', 'client', 'actionType', 'notificationDate', 'sourceUrl', 'due', 'assignee']) {
    const value = source[field]
    if (value === undefined) continue
    if (value === null) {
      snapshot[field] = null
      continue
    }
    const limit = /** @type {Record<string, number>} */ (TODO_STRING_LIMITS)[field]
    const bounded = boundedString(value, limit)
    if (bounded === null) return null
    snapshot[field] = bounded
  }
  if (source.attachments !== undefined) {
    if (!Array.isArray(source.attachments) || source.attachments.length > 6) return null
    if (source.attachments.length === 0) snapshot.attachments = []
    else {
      const attachments = curateAttachments(source.attachments, 6)
      if (!attachments) return null
      snapshot.attachments = attachments
    }
  }
  if (source.sourceRevision !== undefined && source.sourceRevision !== null) {
    const isNumber = typeof source.sourceRevision === 'number' && Number.isSafeInteger(source.sourceRevision)
    const isString = boundedString(source.sourceRevision, 240, false) !== null
    if (!isNumber && !isString) return null
    snapshot.sourceRevision = isNumber ? source.sourceRevision : /** @type {string} */ (source.sourceRevision).trim()
  }
  if (source.historyVisible !== undefined) {
    if (typeof source.historyVisible !== 'boolean') return null
    snapshot.historyVisible = source.historyVisible
  }
  return snapshot
}

/**
 * @param {string} operation
 * @param {unknown} payload
 * @param {string} itemId
 * @returns {JsonObject|null}
 */
function curateOperationPayload(operation, payload, itemId) {
  if (!isObject(payload)) return null
  const source = /** @type {JsonObject} */ (payload)
  if (operation === 'toggle') {
    const allowed = new Set(['done', 'sourceRevision', 'item'])
    if (Object.keys(source).some((key) => !allowed.has(key)) || typeof source.done !== 'boolean') return null
    /** @type {JsonObject} */
    const curated = { done: source.done }
    if (source.sourceRevision !== undefined && source.sourceRevision !== null) {
      const isNumber = typeof source.sourceRevision === 'number' && Number.isSafeInteger(source.sourceRevision)
      const isString = boundedString(source.sourceRevision, 240, false) !== null
      if (!isNumber && !isString) return null
      curated.sourceRevision = isNumber ? source.sourceRevision : /** @type {string} */ (source.sourceRevision).trim()
    }
    if (source.item !== undefined) {
      const snapshot = curateToggleSnapshot(source.item, itemId)
      if (!snapshot) return null
      curated.item = snapshot
    }
    return curated
  }
  if (operation === 'assign') {
    const assignee = boundedString(source.assignee, TODO_STRING_LIMITS.assignee)
    return hasExactKeys(source, ['assignee']) && assignee !== null ? { assignee } : null
  }
  if (operation === 'add') {
    const item = curateTodoItem(source.item)
    return hasExactKeys(source, ['item']) && item?.id === itemId ? { item } : null
  }
  if (operation === 'edit') {
    const changes = isObject(source.changes) ? curateEditChanges(/** @type {JsonObject} */ (source.changes)) : null
    return hasExactKeys(source, ['changes']) && changes ? { changes } : null
  }
  if (operation === 'attach') {
    const attachments = hasExactKeys(source, ['attachments']) ? curateAttachments(source.attachments, 6) : null
    return attachments ? { attachments } : null
  }
  if (operation === 'detach') {
    if (!hasExactKeys(source, ['attachmentIds']) || !Array.isArray(source.attachmentIds)
        || source.attachmentIds.length === 0 || source.attachmentIds.length > 12) return null
    const attachmentIds = source.attachmentIds.map((value) => boundedString(value, 160, false))
    if (attachmentIds.some((value) => value === null) || attachmentIds.length !== new Set(attachmentIds).size) return null
    return { attachmentIds }
  }
  if (operation === 'snooze') {
    return hasExactKeys(source, ['until']) && validTimestamp(source.until) ? { until: source.until } : null
  }
  if (operation === 'archive') {
    return hasExactKeys(source, ['archived']) && typeof source.archived === 'boolean' ? { archived: source.archived } : null
  }
  if (operation === 'delete') return hasExactKeys(source, []) ? {} : null
  return null
}

/**
 * @param {unknown} value
 * @param {{email: string, name: string}|null} actor
 * @returns {JsonObject|null}
 */
function curateOperation(value, actor = null) {
  if (!isObject(value)) return null
  const source = /** @type {JsonObject} */ (value)
  const keys = actor
    ? ['event_id', 'item_id', 'operation', 'payload', 'client_ts']
    : ['event_id', 'item_id', 'operation', 'payload', 'actor_email', 'actor_name', 'client_ts']
  if (!hasExactKeys(source, keys)) return null
  if (typeof source.event_id !== 'string' || !EVENT_ID_PATTERN.test(source.event_id)) return null
  if (typeof source.item_id !== 'string' || !TASK_ID_PATTERN.test(source.item_id)) return null
  if (typeof source.operation !== 'string' || !TODO_OPERATIONS.has(source.operation)) return null
  if (!validTimestamp(source.client_ts)) return null
  const payload = curateOperationPayload(source.operation, source.payload, source.item_id)
  if (!payload) return null

  const actorEmail = actor ? actor.email : boundedString(source.actor_email, 254, false)
  const actorName = actor ? actor.name : boundedString(source.actor_name, 120, false)
  if (actorEmail === null || actorName === null || !actorEmail.includes('@')) return null
  return {
    event_id: source.event_id,
    item_id: source.item_id,
    operation: source.operation,
    payload,
    actor_email: actorEmail,
    actor_name: actorName,
    client_ts: source.client_ts,
  }
}

/** @param {Env} env */
function staleAfterSeconds(env) {
  const parsed = Number.parseInt(env.STALE_AFTER_SECONDS || '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 300
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function publishSnapshot(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const tally = { briefsDropped: 0 }
  const snapshot = curateSnapshot(await readJson(request), tally, briefOwners(await loadTeam(env)))
  if (!snapshot) return badRequest('Invalid snapshot')
  const snapshotJson = JSON.stringify(snapshot)
  if (new TextEncoder().encode(snapshotJson).byteLength > MAX_SNAPSHOT_BYTES) {
    return badRequest('Snapshot too large')
  }
  const publishedAt = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO board_snapshot (singleton_id, snapshot_json, published_at)
    VALUES (1, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET
      snapshot_json = excluded.snapshot_json,
      published_at = excluded.published_at
  `).bind(snapshotJson, publishedAt).run()
  return json({
    ok: true,
    published_at: publishedAt,
    item_count: snapshot.items.length,
    briefs_dropped: tally.briefsDropped,
  })
}

/**
 * The source email conversation behind a board row. Published by Aries because only the
 * domain service account can read every mailbox; the point is that a teammate can read a
 * thread that lives in someone else's inbox and decide whether to take the work.
 * @param {unknown} payload
 * @returns {{threads: JsonObject[]}|null}
 */
function curateThreads(payload) {
  if (!isObject(payload)) return null
  const source = /** @type {Record<string, unknown>} */ (payload)
  if (!Array.isArray(source.threads) || source.threads.length > MAX_THREADS) return null
  /** @type {JsonObject[]} */
  const threads = []
  const seen = new Set()
  for (const raw of source.threads) {
    if (!isObject(raw)) return null
    const thread = /** @type {Record<string, unknown>} */ (raw)
    if (!Number.isSafeInteger(thread.item_id) || /** @type {number} */ (thread.item_id) <= 0) return null
    if (seen.has(thread.item_id)) return null
    if (!Array.isArray(thread.messages) || !thread.messages.length) return null
    if (thread.messages.length > MAX_THREAD_MESSAGES) return null
    /** @type {JsonObject[]} */
    const messages = []
    for (const rawMessage of thread.messages) {
      if (!isObject(rawMessage)) return null
      const message = /** @type {Record<string, unknown>} */ (rawMessage)
      /** @type {JsonObject} */
      const curated = {}
      for (const [field, limit] of Object.entries(THREAD_STRING_LIMITS)) {
        const value = message[field]
        if (value === undefined || value === null) continue
        if (typeof value !== 'string' || value.length > limit) return null
        curated[field] = value
      }
      curated.truncated = message.truncated === true
      messages.push(curated)
    }
    const subject = typeof thread.subject === 'string' ? thread.subject.slice(0, THREAD_STRING_LIMITS.subject) : ''
    const mailbox = typeof thread.mailbox === 'string' ? thread.mailbox.slice(0, 240) : ''
    seen.add(thread.item_id)
    threads.push({ item_id: thread.item_id, subject, mailbox, messages })
  }
  return { threads }
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function publishThreads(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const curated = curateThreads(await readJson(request))
  if (!curated) return badRequest('Invalid threads')
  const publishedAt = new Date().toISOString()
  // Replaced wholesale: a row that leaves the board must not leave its email behind.
  const statements = [env.DB.prepare('DELETE FROM board_threads')]
  for (const thread of curated.threads) {
    statements.push(env.DB.prepare(`
      INSERT INTO board_threads (item_id, thread_json, published_at) VALUES (?, ?, ?)
    `).bind(thread.item_id, JSON.stringify(thread), publishedAt))
  }
  await env.DB.batch(statements)
  return json({ ok: true, published_at: publishedAt, thread_count: curated.threads.length })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function getThread(request, env, url) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const raw = url.searchParams.get('id')
  if (!raw || !/^\d+$/.test(raw)) return badRequest('Invalid item id')
  const itemId = Number(raw)
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return badRequest('Invalid item id')
  const row = await env.DB.prepare(`
    SELECT thread_json, published_at FROM board_threads WHERE item_id = ?
  `).bind(itemId).first()
  if (!row) return json({ error: 'No source email for this item' }, 404)
  let thread
  try {
    thread = JSON.parse(/** @type {string} */ (row.thread_json))
  } catch {
    return json({ error: 'Thread unavailable' }, 503)
  }
  return json({ ...thread, published_at: row.published_at })
}

/**
 * Aries' raw working list. Read-only on the web: rows carry no actions, so the only thing
 * that can go wrong is showing something private — which is why a personal row is refused
 * here as well as being filtered on Aries.
 * @param {unknown} payload
 * @returns {{items: JsonObject[]}|null}
 */
function curateWorklist(payload) {
  if (!isObject(payload)) return null
  const source = /** @type {Record<string, unknown>} */ (payload)
  if (!Array.isArray(source.items) || source.items.length > MAX_WORKLIST_ITEMS) return null
  /** @type {JsonObject[]} */
  const items = []
  const ids = new Set()
  for (const raw of source.items) {
    if (!isObject(raw)) return null
    const item = /** @type {Record<string, unknown>} */ (raw)
    if (!Number.isSafeInteger(item.id) || /** @type {number} */ (item.id) < 0) return null
    if (ids.has(item.id)) return null
    if (item.personal === true) return null
    if (typeof item.text !== 'string') return null
    const text = item.text.trim()
    if (!text || text.length > WORKLIST_STRING_LIMITS.text) return null
    /** @type {JsonObject} */
    const curated = { id: /** @type {number} */ (item.id), text, done: item.done === true }
    for (const [field, limit] of Object.entries(WORKLIST_STRING_LIMITS)) {
      if (field === 'text' || item[field] === undefined || item[field] === null) continue
      if (typeof item[field] !== 'string' || item[field].length > limit) return null
      curated[field] = item[field]
    }
    ids.add(item.id)
    items.push(curated)
  }
  return { items }
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function publishWorklist(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const worklist = curateWorklist(await readJson(request))
  if (!worklist) return badRequest('Invalid worklist')
  const worklistJson = JSON.stringify(worklist)
  if (new TextEncoder().encode(worklistJson).byteLength > MAX_SNAPSHOT_BYTES) {
    return badRequest('Worklist too large')
  }
  const publishedAt = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO worklist_snapshot (singleton_id, worklist_json, published_at)
    VALUES (1, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET
      worklist_json = excluded.worklist_json,
      published_at = excluded.published_at
  `).bind(worklistJson, publishedAt).run()
  return json({ ok: true, published_at: publishedAt, item_count: worklist.items.length })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function getWorklist(request, env) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const row = await env.DB.prepare(`
    SELECT worklist_json, published_at
    FROM worklist_snapshot
    WHERE singleton_id = 1
  `).first()
  const threshold = staleAfterSeconds(env)
  if (!row) {
    return json({
      items: [],
      published_at: null,
      stale: { is_stale: true, age_seconds: null, after_seconds: threshold },
    })
  }
  /** @type {{items: JsonObject[]}|null} */
  let worklist = null
  try {
    worklist = curateWorklist(JSON.parse(/** @type {string} */ (row.worklist_json)))
  } catch {
    return json({ error: 'Worklist unavailable' }, 503)
  }
  if (!worklist) return json({ error: 'Worklist unavailable' }, 503)
  const publishedMillis = Date.parse(/** @type {string} */ (row.published_at))
  const ageSeconds = Number.isFinite(publishedMillis)
    ? Math.max(0, Math.floor((Date.now() - publishedMillis) / 1000))
    : null
  return json({
    items: worklist.items,
    published_at: row.published_at,
    stale: {
      is_stale: ageSeconds === null || ageSeconds > threshold,
      age_seconds: ageSeconds,
      after_seconds: threshold,
    },
  })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function publishTodoCatalogue(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const catalogue = curateTodoCatalogue(await readJson(request))
  if (!catalogue) return badRequest('Invalid todo catalogue')
  const catalogueJson = JSON.stringify(catalogue)
  if (new TextEncoder().encode(catalogueJson).byteLength > MAX_TODO_BYTES) {
    return badRequest('Todo catalogue too large')
  }
  const publishedAt = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO todo_catalogue (singleton_id, catalogue_json, published_at)
    VALUES (1, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET
      catalogue_json = excluded.catalogue_json,
      published_at = excluded.published_at
  `).bind(catalogueJson, publishedAt).run()
  return json({ ok: true, published_at: publishedAt, item_count: catalogue.items.length })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
/**
 * Overlay still-queued teammate commands onto the last published snapshot.
 *
 * The queue is the authority for anything clicked since that publish: Aries has not seen it
 * yet, so the snapshot still describes the old state. Without this, a card checked off
 * seconds ago came back fully lit on the very next poll and Done read as a broken button.
 * Applied in id order, so the last write wins.
 *
 * @param {any[]} items
 * @param {any[]} commands
 * @returns {any[]}
 */
function applyPendingCommands(items, commands) {
  if (!commands.length) return items
  const byId = new Map()
  const order = []
  for (const item of items) {
    const copy = { ...item }
    byId.set(copy.id, copy)
    order.push(copy.id)
  }
  const dropped = new Set()
  for (const command of commands) {
    const item = byId.get(command.item_id)
    if (!item) continue
    if (command.operation === 'done') {
      item.status = 'done'
      item.pending = true
    } else if (command.operation === 'reopen') {
      item.status = 'open'
      item.pending = true
    } else if (command.operation === 'delete' || command.operation === 'not_useful') {
      dropped.add(command.item_id)
    } else if (command.operation === 'assign') {
      item.assignee = command.value || ''
      item.pending = true
    } else if (command.operation === 'snooze') {
      item.due = command.value || item.due
      item.status = 'snoozed'
      item.pending = true
    } else if (command.operation === 'urgent') {
      if (command.value === 'on') item.urgent = command.created_at
      else delete item.urgent
      item.pending = true
    } else if (command.operation === 'note' && command.note) {
      const notes = Array.isArray(item.notes) ? item.notes.slice() : []
      notes.push({
        text: command.note,
        by: command.actor_email || '',
        at: command.created_at || '',
        pending: true,
      })
      item.notes = notes
      item.note = command.note
      item.pending = true
    }
  }
  return order.filter((id) => !dropped.has(id)).map((id) => byId.get(id))
}

/**
 * The roster, in board order. DEFAULT_TEAM stands in only while the table is empty.
 * @param {Env} env
 * @returns {Promise<TeamMember[]>}
 */
async function loadTeam(env) {
  const rows = await env.DB.prepare(`
    SELECT key, name, email, past_emails
    FROM team_users
    ORDER BY position, key
  `).all()
  /** @type {TeamMember[]} */
  const team = []
  for (const row of rows.results || []) {
    /** @type {unknown} */
    let past = []
    try {
      past = JSON.parse(String(row.past_emails || '[]'))
    } catch {
      past = []
    }
    team.push({
      key: String(row.key),
      name: String(row.name),
      email: String(row.email),
      past_emails: Array.isArray(past) ? past.filter((value) => typeof value === 'string') : [],
    })
  }
  return team.length ? team : DEFAULT_TEAM.map((member) => ({ ...member, past_emails: [] }))
}

/** @param {TeamMember[]} team */
function briefOwners(team) {
  return new Set([...team.map((member) => member.key), ''])
}

/**
 * Every name the board knows, by roster key and by address. Old addresses first, so an
 * address that moved to someone else names its current owner.
 * @param {TeamMember[]} team
 * @returns {Map<string, string>}
 */
function teamNames(team) {
  /** @type {Map<string, string>} */
  const names = new Map(Object.entries(OTHER_NAMES))
  for (const member of team) {
    for (const address of member.past_emails) names.set(address, member.name)
  }
  for (const member of team) {
    names.set(member.key, member.name)
    names.set(member.email, member.name)
  }
  for (const [address, key] of Object.entries(SIGN_IN_ALIASES)) {
    const member = team.find((candidate) => candidate.key === key)
    if (member) names.set(address, member.name)
  }
  return names
}

/**
 * The roster entry a signed-in address belongs to: its current address, then an old one.
 * @param {TeamMember[]} team
 * @param {string} email
 */
function memberFor(team, email) {
  const address = String(email || '').trim().toLowerCase()
  const aliased = /** @type {Record<string, string>} */ (SIGN_IN_ALIASES)[address]
  if (aliased) return team.find((member) => member.key === aliased) || null
  return team.find((member) => member.email === address)
    || team.find((member) => member.past_emails.includes(address))
    || null
}

/**
 * A key for a new person, from their name: first name, then first and last, then numbered.
 * @param {string} name
 * @param {TeamMember[]} team
 */
function newTeamKey(name, team) {
  const taken = new Set([...team.map((member) => member.key), ...RESERVED_KEYS])
  const words = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean)
  /** @param {string} value */
  const clean = (value) => value.replace(/^[^a-z]+/, '').slice(0, 24)
  const candidates = [clean(words[0] || ''), clean(words.slice(0, 2).join('')), clean(words.join(''))]
  for (const candidate of candidates) {
    if (TEAM_KEY.test(candidate) && !taken.has(candidate)) return candidate
  }
  const base = (candidates.find((candidate) => TEAM_KEY.test(candidate)) || 'user').slice(0, 21)
  for (let number = 2; number < 1000; number += 1) {
    if (!taken.has(`${base}${number}`)) return `${base}${number}`
  }
  return null
}

/**
 * @param {string} value an address or a roster key
 * @param {Map<string, string>} names from teamNames()
 */
function personName(value, names) {
  const address = String(value || '').trim().toLowerCase()
  if (!address) return ''
  const known = names.get(address)
  if (known) return known
  const local = address.split('@')[0]
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : address
}

/** @param {string} value */
function shortDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  return match ? `${Number(match[2])}/${Number(match[3])}` : value
}

/**
 * What a board action says in a card's history, in words.
 * @param {string} operation
 * @param {string|null} value
 * @param {Map<string, string>} names
 */
function describeOperation(operation, value, names) {
  switch (operation) {
    case 'done': return 'marked it done'
    case 'reopen': return 'reopened it'
    case 'assign': return value ? `assigned it to ${personName(value, names)}` : 'cleared the owner'
    case 'snooze': return value ? `snoozed it to ${shortDay(value)}` : 'snoozed it'
    case 'delete': return 'deleted it'
    case 'reorder': return 'moved it'
    case 'useful': return 'said it was worth a card'
    case 'not_useful': return 'said it is not a task'
    case 'nudge': return value ? `asked ${personName(value, names)} for an update` : 'asked for an update'
    case 'prep': return value ? `asked Aries to prep it for ${personName(value, names)}` : 'asked Aries to prep it'
    case 'urgent': return value === 'off' ? 'cleared urgent' : 'marked it urgent'
    default: return operation
  }
}

/**
 * A card's recent history, newest first: board actions from the audit trail, the card's notes
 * (which include notes written on Aries itself), and the latest email on each side of the
 * thread from the brief. "Who was last to work on that task" is the newest entry from our side.
 * @param {any} item
 * @param {any[]} actions audit rows for this card, any order
 * @param {Map<string, string>} names from teamNames()
 */
function cardHistory(item, actions, names) {
  /** @type {Array<{at: string, who: string, what: string, ours: boolean, kind: string}>} */
  const events = []
  for (const row of actions) {
    // Notes are already on the card, with their author, including ones still in the queue.
    if (row.operation === 'note') continue
    events.push({
      at: row.at,
      who: personName(row.actor_email, names),
      what: describeOperation(row.operation, row.value, names),
      ours: true,
      kind: 'action',
    })
  }
  for (const note of Array.isArray(item.notes) ? item.notes : []) {
    if (!note.at) continue
    events.push({
      at: note.at,
      who: personName(note.by, names) || 'Someone',
      what: `wrote: ${note.text}`.slice(0, 240),
      ours: true,
      kind: 'note',
    })
  }
  const brief = item.brief
  if (brief && brief.last_ours) {
    events.push({ at: brief.last_ours.at, who: brief.last_ours.by, what: brief.last_ours.what || 'sent an email', ours: true, kind: 'email' })
  }
  if (brief && brief.last_theirs) {
    events.push({ at: brief.last_theirs.at, who: brief.last_theirs.by, what: brief.last_theirs.what || 'sent an email', ours: false, kind: 'email' })
  }
  return events
    .filter((event) => Number.isFinite(Date.parse(event.at)))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, HISTORY_PER_CARD)
}

async function getBoard(request, env) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const row = /** @type {SnapshotRow|null} */ (await env.DB.prepare(`
    SELECT snapshot_json, published_at
    FROM board_snapshot
    WHERE singleton_id = 1
  `).first())
  const threshold = staleAfterSeconds(env)
  if (!row) {
    return json({
      items: [],
      published_at: null,
      stale: { is_stale: true, age_seconds: null, after_seconds: threshold },
    })
  }

  const team = await loadTeam(env)
  /** @type {BoardSnapshot|null} */
  let snapshot = null
  try {
    snapshot = curateSnapshot(JSON.parse(row.snapshot_json), undefined, briefOwners(team))
  } catch {
    return json({ error: 'Snapshot unavailable' }, 503)
  }
  if (!snapshot) return json({ error: 'Snapshot unavailable' }, 503)
  const names = teamNames(team)
  const viewer = memberFor(team, request.headers.get('Cf-Access-Authenticated-User-Email') || '')
  const publishedMillis = Date.parse(row.published_at)
  const ageSeconds = Number.isFinite(publishedMillis)
    ? Math.max(0, Math.floor((Date.now() - publishedMillis) / 1000))
    : null
  // Which items actually have a readable email chain. Not every card does: some were never
  // made from an email, and for others the mailbox could not be resolved so nothing was
  // rendered. Without this the UI offered "Open email" on every card and a third of them
  // answered "No source email for this item" -- a button that exists only to apologise.
  const threadRows = await env.DB.prepare('SELECT item_id FROM board_threads').all()
  const threadIds = (threadRows.results || []).map((entry) => entry.item_id)

  // Keep a checked-off card checked off while Aries catches up, including the short
  // interval between acknowledgement and the next snapshot. A newer snapshot wins.
  // Everything a teammate has clicked since the last publish is still sitting in the queue.
  // It has to be folded in here, or the board answers every poll with the pre-click state.
  const completionPending = await completionCommands(env, row.published_at)
  const pendingRows = await env.DB.prepare(`
    SELECT operation, item_id, note, value, actor_email, created_at
    FROM command_queue
    WHERE state = 'queued'
    ORDER BY id
  `).all()
  const items = applyPendingCommands(applyCompletionCommands(snapshot.items, completionPending), pendingRows.results || [])

  // Board actions from the audit trail, grouped per card, for each card's history.
  const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString()
  const actionRows = await env.DB.prepare(`
    SELECT item_id, at, actor_email, operation, value
    FROM activity_log
    WHERE source = 'board' AND at >= ?
    ORDER BY at DESC
    LIMIT 5000
  `).bind(since).all()
  /** @type {Map<string, any[]>} */
  const actionsByCard = new Map()
  for (const row of actionRows.results || []) {
    const key = String(row.item_id)
    if (!actionsByCard.has(key)) actionsByCard.set(key, [])
    actionsByCard.get(key)?.push(row)
  }
  for (const item of items) {
    if (item.status === 'done') continue
    const history = cardHistory(item, actionsByCard.get(String(item.id)) || [], names)
    if (history.length) item.history = history
  }

  return json({
    items,
    thread_ids: threadIds,
    activity: isActivityOwner(request, env),
    // Names only: the owner chips and every "Nudge Mark" label read from this.
    team: team.map((member) => ({ key: member.key, name: member.name })),
    // Who is signed in, as a roster key, so the My cards tab can show only their cards.
    me: viewer ? { key: viewer.key, name: viewer.name } : null,
    published_at: row.published_at,
    stale: {
      is_stale: ageSeconds === null || ageSeconds > threshold,
      age_seconds: ageSeconds,
      after_seconds: threshold,
    },
  })
}

/** @param {Env} env @param {string} publishedAt */
async function completionCommands(env, publishedAt) {
  const result = await env.DB.prepare(`
    SELECT id, operation, item_id, actor_email, created_at, state, acked_at
    FROM command_queue
    WHERE operation IN ('done', 'reopen', 'delete')
      AND (state = 'queued' OR (state = 'applied' AND acked_at > ?))
    ORDER BY id
  `).bind(publishedAt).all()
  return /** @type {CompletionCommand[]} */ (result.results || [])
}

/** @param {BoardItem[]} items @param {CompletionCommand[]} commands */
function applyCompletionCommands(items, commands) {
  const effective = new Map(items.map((item) => [item.id, { ...item }]))
  for (const command of commands) {
    const item = effective.get(Number(command.item_id))
    if (!item) continue
    if (command.operation === 'delete') effective.delete(item.id)
    else if (command.operation === 'done') item.status = 'done'
    else if (command.operation === 'reopen') item.status = 'open'
  }
  return [...effective.values()]
}

/** @param {Env} env @param {number} id */
async function completionCard(env, id) {
  const row = /** @type {SnapshotRow|null} */ (await env.DB.prepare(`
    SELECT snapshot_json, published_at FROM board_snapshot WHERE singleton_id = 1
  `).first())
  if (!row) return null
  const snapshot = curateSnapshot(JSON.parse(row.snapshot_json))
  if (!snapshot) throw new Error('Snapshot unavailable')
  const original = snapshot.items.find((item) => item.id === id)
  if (!original) return null
  const commands = await completionCommands(env, row.published_at)
  const item = applyCompletionCommands([original], commands)[0]
  const latest = await env.DB.prepare(`
    SELECT id FROM command_queue
    WHERE item_id = ? AND operation IN ('done', 'reopen', 'delete') AND state <> 'failed'
    ORDER BY id DESC LIMIT 1
  `).bind(id).first()
  const lastCommandId = Number(latest?.id || 0)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(original)))
  const revision = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') + ':' + lastCommandId
  return { item: item || original, state: !item ? 'deleted' : item.status === 'done' ? 'done' : 'open', revision, lastCommandId, snapshotJson: row.snapshot_json }
}

/** @param {Request} request @param {Env} env @param {string} actorEmail */
async function cardRequest(request, env, actorEmail) {
  const url = new URL(request.url)
  const write = url.pathname === '/api/card/done'
  if (request.method !== (write ? 'POST' : 'GET')) return methodNotAllowed(write ? 'POST' : 'GET')
  let id
  let revision
  if (write) {
    if (request.headers.get('origin') !== url.origin) return forbidden()
    if (!hasJsonContentType(request)) return unsupportedMediaType()
    const body = await readJson(request)
    if (!isObject(body)) return badRequest('Invalid card confirmation')
    const action = /** @type {JsonObject} */ (body)
    if (!hasExactKeys(action, ['id', 'revision']) || typeof action.revision !== 'string' || !action.revision.trim() || action.revision.length > 100) return badRequest('Invalid card confirmation')
    id = action.id
    revision = action.revision
  } else {
    const value = url.searchParams.get('id') || ''
    if (!/^[1-9]\d*$/.test(value)) return badRequest('Invalid card id')
    id = Number(value)
  }
  if (!Number.isSafeInteger(id) || /** @type {number} */ (id) <= 0) return badRequest('Invalid card id')
  let card
  try { card = await completionCard(env, /** @type {number} */ (id)) }
  catch { return json({ error: 'Card unavailable. Try again shortly.' }, 503) }
  if (!card) return missing('This card is no longer on the board. Nothing was changed.')
  const view = { item: card.item, state: card.state, revision: card.revision }
  if (!write) return json(view)
  if (card.state === 'deleted') return json({ error: 'This card was removed. Nothing was changed.', ...view }, 410)
  if (card.state === 'done') return json({ ok: true, existing: true, ...view })
  if (revision !== card.revision) return json({ error: 'This card changed. Review it again before marking it done.', ...view }, 409)

  const createdAt = new Date().toISOString()
  // One atomic compare-and-insert: scanner GETs never reach here, simultaneous
  // confirmations cannot enqueue duplicates, and a newer card/state is never closed
  // from an older confirmation. No token or authority is carried in the email URL.
  const inserted = await env.DB.prepare(`
    INSERT INTO command_queue (operation, item_id, note, value, actor_email, state, created_at)
    SELECT 'done', ?, NULL, NULL, ?, 'queued', ?
    WHERE EXISTS (SELECT 1 FROM board_snapshot WHERE singleton_id = 1 AND snapshot_json = ?)
      AND COALESCE((SELECT MAX(id) FROM command_queue
        WHERE item_id = ? AND operation IN ('done', 'reopen', 'delete') AND state <> 'failed'), 0) = ?
  `).bind(id, actorEmail, createdAt, card.snapshotJson, id, card.lastCommandId).run()
  if (inserted.meta.changes !== 1) {
    const current = await completionCard(env, /** @type {number} */ (id))
    if (current?.state === 'done') return json({ ok: true, existing: true, item: current.item, state: current.state, revision: current.revision })
    return json({ error: 'This card changed. Refresh and review it before marking it done.' }, 409)
  }
  const command = { id: inserted.meta.last_row_id, operation: 'done', item_id: id, actor_email: actorEmail, created_at: createdAt }
  return json({ ok: true, saved: true, existing: false, item: { ...card.item, status: 'done' }, state: 'done', command }, 202)
}

/**
 * @param {Env} env
 * @returns {Promise<{catalogue: TodoCatalogue, publishedAt: string|null}|null>}
 */
async function readTodoCatalogue(env) {
  const row = /** @type {TodoCatalogueRow|null} */ (await env.DB.prepare(`
    SELECT catalogue_json, published_at
    FROM todo_catalogue
    WHERE singleton_id = 1
  `).first())
  if (!row) return { catalogue: { items: [] }, publishedAt: null }
  try {
    const catalogue = curateTodoCatalogue(JSON.parse(row.catalogue_json), true)
    return catalogue ? { catalogue, publishedAt: row.published_at } : null
  } catch {
    return null
  }
}

/**
 * @param {unknown} value
 * @returns {JsonObject|null}
 */
function operationFromRow(value) {
  if (!isObject(value)) return null
  const row = /** @type {JsonObject} */ (value)
  if (!Number.isSafeInteger(row.sequence) || /** @type {number} */ (row.sequence) <= 0) return null
  let payload
  try {
    payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload
  } catch {
    return null
  }
  const operation = curateOperation({
    event_id: row.event_id,
    item_id: row.item_id,
    operation: row.operation,
    payload,
    actor_email: row.actor_email,
    actor_name: row.actor_name,
    client_ts: row.client_ts,
  })
  if (!operation || typeof row.server_ts !== 'string') return null
  return { sequence: row.sequence, ...operation, server_ts: row.server_ts }
}

/**
 * @param {Env} env
 * @param {number} after
 * @returns {Promise<JsonObject[]|null>}
 */
async function readTodoOperations(env, after) {
  const rows = await env.DB.prepare(`
    SELECT sequence, event_id, item_id, operation, payload_json,
           actor_email, actor_name, client_ts, server_ts
    FROM todo_operations
    WHERE sequence > ?
    ORDER BY sequence ASC
  `).bind(after).all()
  const operations = rows.results.map(operationFromRow)
  return operations.every(Boolean) ? /** @type {JsonObject[]} */ (operations) : null
}

/** @param {Env} env */
async function latestTodoSequence(env) {
  const row = await env.DB.prepare(`
    SELECT COALESCE(MAX(sequence), 0) AS latest_sequence
    FROM todo_operations
  `).first()
  return row && Number.isSafeInteger(row.latest_sequence) ? Number(row.latest_sequence) : 0
}

/**
 * @param {TodoCatalogue} catalogue
 * @param {JsonObject[]} operations
 */
function replayTodos(catalogue, operations) {
  /** @type {Map<string, JsonObject>} */
  const items = new Map()
  for (const item of catalogue.items) {
    items.set(/** @type {string} */ (item.id), {
      ...item,
      done: item.seedDone,
      attachments: [],
      snoozedUntil: null,
      archived: false,
    })
  }
  for (const operation of operations) {
    const itemId = /** @type {string} */ (operation.item_id)
    const verb = operation.operation
    const payload = /** @type {JsonObject} */ (operation.payload)
    if (verb === 'add') {
      const item = /** @type {JsonObject} */ (payload.item)
      if (!items.has(itemId)) {
        items.set(itemId, { ...item, done: item.seedDone, attachments: [], snoozedUntil: null, archived: false })
      }
      continue
    }
    let item = items.get(itemId)
    if (!item && verb === 'toggle' && payload.done === true && isObject(payload.item)) {
      const snapshot = /** @type {JsonObject} */ (payload.item)
      item = {
        ...snapshot,
        done: false,
        attachments: Array.isArray(snapshot.attachments) ? snapshot.attachments : [],
        snoozedUntil: null,
        archived: false,
      }
      items.set(itemId, item)
    }
    if (!item) continue
    // The board changed the card after this To-Do check-off or owner change, so the catalogue
    // already carries the card's newer state. Replaying the older operation would put back what
    // the board has since changed: an old "Shayan" masking a later hand-off to Katherine.
    if ((verb === 'toggle' || verb === 'assign') && typeof item.sourceUpdatedAt === 'string'
        && Date.parse(item.sourceUpdatedAt) > Date.parse(String(operation.server_ts || ''))) continue
    if (verb === 'toggle') {
      const currentRevision = Number(item.sourceRevision)
      const eventRevision = Number(payload.sourceRevision)
      if (!(payload.done === true && Number.isFinite(currentRevision) && Number.isFinite(eventRevision)
          && eventRevision < currentRevision)) item.done = payload.done
      if (payload.done === false) item.archived = false
    }
    if (verb === 'assign') item.assignee = payload.assignee
    if (verb === 'edit') Object.assign(item, payload.changes)
    if (verb === 'attach') {
      const attachments = /** @type {JsonObject[]} */ (item.attachments)
      const additions = /** @type {JsonObject[]} */ (payload.attachments)
      const additionIds = new Set(additions.map((value) => value.id))
      item.attachments = [...attachments.filter((value) => !additionIds.has(value.id)), ...additions]
    }
    if (verb === 'detach') {
      const removed = new Set(/** @type {string[]} */ (payload.attachmentIds))
      item.attachments = /** @type {JsonObject[]} */ (item.attachments)
        .filter((value) => !removed.has(/** @type {string} */ (value.id)))
    }
    if (verb === 'snooze') item.snoozedUntil = payload.until
    if (verb === 'archive') item.archived = payload.archived
    if (verb === 'delete') item.archived = true
  }
  return [...items.values()]
}

/**
 * @param {Request} request
 * @param {Env} env
 */
async function getTodos(request, env) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const stored = await readTodoCatalogue(env)
  if (!stored) return json({ error: 'Todo catalogue unavailable' }, 503)
  const operations = await readTodoOperations(env, 0)
  if (!operations) return json({ error: 'Todo operations unavailable' }, 503)
  const sequence = operations.length
    ? Number(operations[operations.length - 1]?.sequence)
    : await latestTodoSequence(env)
  const threshold = staleAfterSeconds(env)
  const publishedMillis = stored.publishedAt ? Date.parse(stored.publishedAt) : NaN
  const ageSeconds = Number.isFinite(publishedMillis)
    ? Math.max(0, Math.floor((Date.now() - publishedMillis) / 1000))
    : null
  return json({
    items: replayTodos(stored.catalogue, /** @type {JsonObject[]} */ (operations)),
    published_at: stored.publishedAt,
    sequence,
    stale: {
      is_stale: ageSeconds === null || ageSeconds > threshold,
      age_seconds: ageSeconds,
      after_seconds: threshold,
    },
  })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {string} actorEmail
 * @returns {Promise<Response>}
 */
async function queueAction(request, env, actorEmail) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const payload = await readJson(request)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return badRequest('Invalid action')
  }
  const action = /** @type {Record<string, unknown>} */ (payload)
  if (typeof action.operation !== 'string' || !BOARD_OPERATIONS.includes(action.operation)) {
    return badRequest('Unsupported operation')
  }
  if (!Number.isSafeInteger(action.id) || /** @type {number} */ (action.id) <= 0) {
    return badRequest('Invalid item id')
  }

  // `note` carries the free text of a note; `value` carries the single argument of every
  // other parameterised operation (who to assign to, the date to snooze until, the new
  // position). Keeping them apart means the note CHECK constraint stays exactly as it was.
  let note = null
  let value = null
  if (action.operation === 'note') {
    if (typeof action.note !== 'string') return badRequest('Note is required')
    note = action.note.trim()
    if (!note || note.length > STRING_LIMITS.note) return badRequest('Invalid note')
  } else if (action.operation === 'assign') {
    if (typeof action.value !== 'string') return badRequest('Assignee is required')
    value = action.value.trim().toLowerCase()
    // An empty assignee is how the UI clears an owner. Aries takes a card itself.
    const assignees = (await loadTeam(env)).map((member) => member.key).concat(['aries'])
    if (value && !assignees.includes(value)) return badRequest('Unknown assignee')
  } else if (action.operation === 'urgent') {
    if (action.value !== 'on' && action.value !== 'off') return badRequest('Urgent is on or off')
    value = action.value
  } else if (action.operation === 'prep') {
    if (typeof action.value !== 'string') return badRequest('Prep needs the teammate it is for')
    value = action.value.trim().toLowerCase()
    const teammates = (await loadTeam(env)).map((member) => member.key)
    if (!value || !teammates.includes(value)) return badRequest('Prep needs a teammate who owns the card')
  } else if (action.operation === 'nudge') {
    if (typeof action.value !== 'string') return badRequest('Nudge needs the owner')
    value = action.value.trim().toLowerCase()
    const teammates = (await loadTeam(env)).map((member) => member.key)
    if (!value || !teammates.includes(value)) return badRequest('Nudge needs a teammate who owns the card')
  } else if (action.operation === 'snooze') {
    if (typeof action.value !== 'string') return badRequest('A snooze date is required')
    value = action.value.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) {
      return badRequest('Snooze must be an ISO date')
    }
  } else if (action.operation === 'reorder') {
    if (!Number.isSafeInteger(action.value) || /** @type {number} */ (action.value) <= 0) {
      return badRequest('Invalid position')
    }
    value = String(action.value)
  }

  const createdAt = new Date().toISOString()
  // The command and its audit row land together or not at all.
  const [inserted] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO command_queue (
        operation, item_id, note, value, actor_email, state, created_at
      ) VALUES (?, ?, ?, ?, ?, 'queued', ?)
    `).bind(action.operation, action.id, note, value, actorEmail, createdAt),
    activityStatement(env, request, {
      at: createdAt,
      actorEmail,
      source: 'board',
      operation: String(action.operation),
      itemId: String(action.id),
      value: note ?? value,
    }),
  ])
  const command = {
    id: inserted.meta.last_row_id,
    operation: action.operation,
    item_id: action.id,
    note,
    value,
    actor_email: actorEmail,
    created_at: createdAt,
  }
  return json({ ok: true, command }, 202)
}

/**
 * @param {Env} env
 * @param {JsonObject} operation
 * @returns {Promise<{accepted: boolean, operation: JsonObject}>}
 */
async function insertTodoOperation(env, operation) {
  const serverTs = new Date().toISOString()
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO todo_operations (
      event_id, item_id, operation, payload_json,
      actor_email, actor_name, client_ts, server_ts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    operation.event_id,
    operation.item_id,
    operation.operation,
    JSON.stringify(operation.payload),
    operation.actor_email,
    operation.actor_name,
    operation.client_ts,
    serverTs,
  ).run()
  const row = await env.DB.prepare(`
    SELECT sequence, event_id, item_id, operation, payload_json,
           actor_email, actor_name, client_ts, server_ts
    FROM todo_operations
    WHERE event_id = ?
  `).bind(operation.event_id).first()
  const stored = operationFromRow(row)
  if (!stored) throw new Error('Stored todo operation unavailable')
  return { accepted: inserted.meta.changes === 1, operation: stored }
}

/**
 * Frank, 09/30/2026, from the To-Do audit: a task checked off or handed on in the To-Do list
 * stayed open, or with its old owner, on the board card it came from, so the two lists
 * disagreed. A To-Do task made from board cards (upstreamIds) now queues the same change for
 * those cards, which Aries applies like any board click. Tasks added by hand have no cards.
 * @param {Env} env
 * @param {JsonObject} operation a stored, newly accepted To-Do operation
 * @returns {Promise<D1PreparedStatement[]>}
 */
async function boardCommandsForTodo(env, operation) {
  const verb = operation.operation
  const payload = /** @type {JsonObject} */ (operation.payload || {})
  /** @type {string|null} */
  let boardOperation = null
  /** @type {string|null} */
  let value = null
  if (verb === 'toggle') {
    boardOperation = payload.done === true ? 'done' : 'reopen'
  } else if (verb === 'assign') {
    const team = await loadTeam(env)
    const wanted = String(payload.assignee || '').trim().toLowerCase()
    // The desktop app sends a name ("Steve"), the board a roster key ("steve").
    const member = team.find((person) => person.key === wanted || person.name.toLowerCase() === wanted)
    value = member ? member.key : wanted
    if (value && value !== 'aries' && !member) return []
    boardOperation = 'assign'
  } else {
    return []
  }
  const stored = await readTodoCatalogue(env)
  const item = stored?.catalogue.items.find((entry) => entry.id === operation.item_id)
  const upstream = Array.isArray(item?.upstreamIds) ? /** @type {unknown[]} */ (item.upstreamIds) : []
  const cardIds = [...new Set(upstream.map((id) => {
    const match = /^(?:board:)?(\d+)$/.exec(String(id))
    return match ? Number(match[1]) : 0
  }).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 20)
  const createdAt = new Date().toISOString()
  return cardIds.map((id) => env.DB.prepare(`
    INSERT INTO command_queue (
      operation, item_id, note, value, actor_email, state, created_at
    ) VALUES (?, ?, ?, ?, ?, 'queued', ?)
  `).bind(boardOperation, id, null, value, String(operation.actor_email), createdAt))
}

/**
 * @param {Env} env
 * @param {JsonObject} operation
 */
async function queueBoardCommandsForTodo(env, operation) {
  const statements = await boardCommandsForTodo(env, operation)
  if (statements.length) await env.DB.batch(statements)
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {string} actorEmail
 * @returns {Promise<Response>}
 */
async function saveTodoAction(request, env, actorEmail) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const member = memberFor(await loadTeam(env), actorEmail)
  const actorName = member && TODO_ACTOR_KEYS.includes(member.key) ? member.name : null
  if (!actorName) return forbidden()
  const operation = curateOperation(await readJson(request), { email: actorEmail, name: actorName })
  if (!operation) return badRequest('Invalid todo action')
  const saved = await insertTodoOperation(env, operation)
  if (saved.accepted) {
    await activityStatement(env, request, {
      at: String(saved.operation.server_ts || new Date().toISOString()),
      actorEmail,
      source: 'todo',
      operation: String(operation.operation),
      itemId: String(operation.item_id),
      value: JSON.stringify(operation.payload ?? null).slice(0, 300),
    }).run()
    await queueBoardCommandsForTodo(env, saved.operation)
  }
  return json({ ok: true, accepted: saved.accepted, existing: !saved.accepted, operation: saved.operation }, 202)
}

/**
 * @param {Request} request
 * @param {Env} env
 */
async function publishTodoOperations(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const body = await readJson(request)
  if (!isObject(body)) return badRequest('Invalid todo operations')
  const source = /** @type {JsonObject} */ (body)
  if (!hasExactKeys(source, ['operations']) || !Array.isArray(source.operations)
      || source.operations.length === 0 || source.operations.length > MAX_OPERATION_BATCH) {
    return badRequest('Invalid todo operations')
  }
  const operations = source.operations.map((value) => curateOperation(value))
  if (operations.some((value) => !value)) return badRequest('Invalid todo operation')
  const operationJson = JSON.stringify(operations)
  if (new TextEncoder().encode(operationJson).byteLength > MAX_OPERATION_BYTES) {
    return badRequest('Todo operations too large')
  }

  let accepted = 0
  let existing = 0
  for (const operation of operations) {
    const saved = await insertTodoOperation(env, /** @type {JsonObject} */ (operation))
    if (saved.accepted) {
      accepted += 1
      await queueBoardCommandsForTodo(env, saved.operation)
    } else existing += 1
  }
  return json({ ok: true, accepted, existing, last_sequence: await latestTodoSequence(env) })
}

/** @param {URL} url */
function commandLimit(url) {
  const raw = url.searchParams.get('limit')
  if (raw === null) return 50
  if (!/^\d+$/.test(raw)) return null
  const limit = Number(raw)
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= 100 ? limit : null
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function listCommands(request, env, url) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const limit = commandLimit(url)
  if (limit === null) return badRequest('Invalid limit')
  const queued = await env.DB.prepare(`
    SELECT id, operation, item_id, note, value, actor_email, created_at
    FROM command_queue
    WHERE state = 'queued'
    ORDER BY id ASC
    LIMIT ?
  `).bind(limit).all()
  return json({ commands: queued.results, count: queued.results.length })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function getTodoState(request, env, url) {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const rawAfter = url.searchParams.get('after')
  if (rawAfter !== null && !/^\d+$/.test(rawAfter)) return badRequest('Invalid after sequence')
  const after = rawAfter === null ? 0 : Number(rawAfter)
  if (!Number.isSafeInteger(after) || after < 0) return badRequest('Invalid after sequence')
  const stored = await readTodoCatalogue(env)
  if (!stored) return json({ error: 'Todo catalogue unavailable' }, 503)
  const operations = await readTodoOperations(env, after)
  if (!operations) return json({ error: 'Todo operations unavailable' }, 503)
  return json({
    catalogue: stored.catalogue,
    catalogue_published_at: stored.publishedAt,
    operations,
    latest_sequence: await latestTodoSequence(env),
  })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {number} commandId
 * @returns {Promise<Response>}
 */
async function acknowledgeCommand(request, env, commandId) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const payload = await readJson(request)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return badRequest('Invalid acknowledgement')
  }
  const acknowledgement = /** @type {Record<string, unknown>} */ (payload)
  if (acknowledgement.status !== 'applied' && acknowledgement.status !== 'failed') {
    return badRequest('Invalid acknowledgement')
  }
  let detail = null
  if (acknowledgement.detail !== undefined && acknowledgement.detail !== null) {
    if (typeof acknowledgement.detail !== 'string') return badRequest('Invalid detail')
    detail = acknowledgement.detail.trim()
    if (detail.length > 2000) return badRequest('Invalid detail')
  }
  const ackedAt = new Date().toISOString()
  const updated = await env.DB.prepare(`
    UPDATE command_queue
    SET state = ?, ack_detail = ?, acked_at = ?
    WHERE id = ? AND state = 'queued'
  `).bind(acknowledgement.status, detail, ackedAt, commandId).run()
  if (updated.meta.changes !== 1) return missing('Command not found')
  return json({ ok: true, id: commandId, status: acknowledgement.status, acked_at: ackedAt })
}

/**
 * @param {Env} env
 * @param {URL} url
 */
async function readActivity(env, url) {
  const who = (url.searchParams.get('who') || '').trim().toLowerCase().slice(0, 254)
  const op = (url.searchParams.get('op') || '').trim().slice(0, 40)
  const rows = await env.DB.prepare(`
    SELECT id, at, actor_email, source, operation, item_id, value, title, ip, country, user_agent
    FROM activity_log
    WHERE (? = '' OR lower(actor_email) = ?) AND (? = '' OR operation = ?)
    ORDER BY at DESC, id DESC
    LIMIT ?
  `).bind(who, who, op, op, ACTIVITY_LIMIT).all()
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const recent = await env.DB.prepare(`
    SELECT at, actor_email, operation
    FROM activity_log
    WHERE at >= ?
    ORDER BY at
  `).bind(since).all()
  const choices = await env.DB.prepare(`
    SELECT DISTINCT actor_email, operation FROM activity_log
  `).all()

  /** @type {Map<string, {who: string, op: string, count: number, burst: {count: number, from: string, to: string}|null}>} */
  const summary = new Map()
  /** @type {Map<string, number[]>} */
  const times = new Map()
  for (const row of recent.results || []) {
    const key = `${row.actor_email}\u0000${row.operation}`
    if (!summary.has(key)) summary.set(key, { who: String(row.actor_email), op: String(row.operation), count: 0, burst: null })
    const entry = /** @type {NonNullable<ReturnType<typeof summary.get>>} */ (summary.get(key))
    entry.count += 1
    const list = times.get(key) || []
    list.push(Date.parse(String(row.at)))
    times.set(key, list)
  }
  // Largest count of one action by one person inside any BURST_WINDOW_MS stretch.
  for (const [key, list] of times) {
    let start = 0
    let best = { count: 0, from: 0, to: 0 }
    for (let end = 0; end < list.length; end += 1) {
      while (list[end] - list[start] > BURST_WINDOW_MS) start += 1
      if (end - start + 1 > best.count) best = { count: end - start + 1, from: list[start], to: list[end] }
    }
    const entry = summary.get(key)
    if (entry && best.count > BURST_COUNT) {
      entry.burst = { count: best.count, from: new Date(best.from).toISOString(), to: new Date(best.to).toISOString() }
    }
  }
  const people = [...new Set((choices.results || []).map((row) => String(row.actor_email)))].sort()
  const operations = [...new Set((choices.results || []).map((row) => String(row.operation)))].sort()
  return {
    filter: { who, op },
    summary: [...summary.values()].sort((a, b) => b.count - a.count),
    people,
    operations,
    rows: rows.results || [],
  }
}

/** @param {Env} env @param {URL} url */
async function activityJson(env, url) {
  return json(await readActivity(env, url))
}

/** @param {unknown} value */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch
  ))
}

const ACTIVITY_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
})

/** @param {unknown} value */
function activityTime(value) {
  const millis = Date.parse(String(value))
  return Number.isFinite(millis) ? ACTIVITY_TIME.format(millis).replace(',', '') : String(value ?? '')
}

/** @param {unknown} value */
function shortAgent(value) {
  const ua = String(value || '')
  if (!ua) return ''
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : ua.slice(0, 40)
  return [browser, os].filter(Boolean).join(' · ')
}

/** @param {Env} env @param {URL} url */
async function activityPage(env, url) {
  const data = await readActivity(env, url)
  const option = (/** @type {string} */ value, /** @type {string} */ current) =>
    `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(value || 'Everyone')}</option>`
  const summaryRows = data.summary.map((entry) => `
      <tr class="${entry.burst ? 'burst' : ''}">
        <td>${escapeHtml(entry.who)}</td><td>${escapeHtml(entry.op)}</td><td class="num">${entry.count}</td>
        <td>${entry.burst ? `${entry.burst.count} in 10 min · ${escapeHtml(activityTime(entry.burst.from))} – ${escapeHtml(activityTime(entry.burst.to))}` : ''}</td>
      </tr>`).join('')
  const rows = data.rows.map((row) => `
      <tr class="op-${escapeHtml(row.operation)}">
        <td class="nowrap">${escapeHtml(activityTime(row.at))}</td>
        <td>${escapeHtml(row.actor_email)}</td>
        <td><span class="op">${escapeHtml(row.operation)}</span></td>
        <td><span class="id">#${escapeHtml(row.item_id)}</span> ${escapeHtml(row.title || '')}</td>
        <td class="value">${escapeHtml(row.value || '')}</td>
        <td class="nowrap">${escapeHtml(row.ip || '—')}${row.country ? ` <span class="muted">${escapeHtml(row.country)}</span>` : ''}</td>
        <td class="muted" title="${escapeHtml(row.user_agent || '')}">${escapeHtml(shortAgent(row.user_agent))}</td>
      </tr>`).join('')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aries Activity</title>
<style>
  :root { --ink:#17191f; --muted:#69707d; --paper:#f4f5f7; --card:#fff; --line:#dfe2e7; --warn:#fff1e6; --warn-ink:#9a3b00; }
  @media (prefers-color-scheme: dark) { :root { --ink:#e8eaee; --muted:#9aa1ad; --paper:#14161b; --card:#1d2027; --line:#30343d; --warn:#3a2414; --warn-ink:#ffb27a; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:16px; background:var(--paper); color:var(--ink); font:14px/1.45 system-ui,-apple-system,sans-serif; }
  h1 { margin:0 0 4px; font-size:22px; } h2 { margin:24px 0 8px; font-size:16px; }
  p.lead { margin:0 0 16px; color:var(--muted); }
  a { color:inherit; }
  form { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:0 0 12px; }
  select, button { font:inherit; padding:6px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--ink); }
  .wrap { overflow-x:auto; background:var(--card); border:1px solid var(--line); border-radius:12px; }
  table { border-collapse:collapse; width:100%; }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); position:sticky; top:0; background:var(--card); }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .nowrap { white-space:nowrap; } .muted { color:var(--muted); }
  .id { color:var(--muted); font-variant-numeric:tabular-nums; }
  .value { max-width:260px; overflow-wrap:anywhere; color:var(--muted); }
  .op { font-weight:700; }
  tr.op-done .op, tr.op-delete .op, tr.op-archive .op { color:var(--warn-ink); }
  tr.burst td { background:var(--warn); color:var(--warn-ink); font-weight:600; }
</style></head><body>
<h1>Activity log</h1>
<p class="lead">Every change made on the board and To-Do list, newest first. Only you can see this page. <a href="/">Back to board</a></p>
<h2>Last 24 hours</h2>
<div class="wrap"><table>
  <thead><tr><th>Who</th><th>Action</th><th class="num">Count</th><th>Burst (over ${BURST_COUNT} in 10 min)</th></tr></thead>
  <tbody>${summaryRows || '<tr><td colspan="4" class="muted">No activity in the last 24 hours.</td></tr>'}</tbody>
</table></div>
<h2>All actions</h2>
<form method="get" action="/activity">
  <select name="who" aria-label="Person">${option('', data.filter.who)}${data.people.map((p) => option(p.toLowerCase(), data.filter.who)).join('')}</select>
  <select name="op" aria-label="Action"><option value="">All actions</option>${data.operations.map((o) => option(o, data.filter.op)).join('')}</select>
  <button type="submit">Filter</button>
  <span class="muted">${data.rows.length}${data.rows.length === ACTIVITY_LIMIT ? '+ (latest ' + ACTIVITY_LIMIT + ')' : ''} actions</span>
</form>
<div class="wrap"><table>
  <thead><tr><th>When (Eastern)</th><th>Who</th><th>Action</th><th>Card</th><th>Detail</th><th>IP</th><th>Device</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="7" class="muted">Nothing recorded yet.</td></tr>'}</tbody>
</table></div>
<p class="muted">IP and device are recorded from 09/29/2026 on; older rows show only who and what.</p>
</body></html>`
  return new Response(html, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    },
  })
}

/** @param {TeamMember[]} team */
function teamPayload(team) {
  return {
    team: team.map((member) => ({
      key: member.key,
      name: member.name,
      email: member.email,
      past_emails: member.past_emails,
    })),
    domains: TEAM_DOMAINS,
  }
}

/**
 * Add a person, or change a person's name or email. Owner only. `key` present means edit.
 * @param {Request} request
 * @param {Env} env
 * @param {string} actorEmail
 */
async function saveTeamMember(request, env, actorEmail) {
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const body = await readJson(request)
  if (!isObject(body)) return badRequest('Invalid user')
  const source = /** @type {Record<string, unknown>} */ (body)
  const name = typeof source.name === 'string' ? source.name.trim().replace(/\s+/g, ' ') : ''
  const email = typeof source.email === 'string' ? source.email.trim().toLowerCase() : ''
  if (!name || name.length > TEAM_NAME_LIMIT || !TEAM_NAME.test(name)) {
    return badRequest('Enter a name: letters, spaces, apostrophes or hyphens, up to 40 characters.')
  }
  if (!TEAM_EMAIL.test(email) || email.length > TEAM_EMAIL_LIMIT) return badRequest('Enter a full email address.')
  if (!TEAM_DOMAINS.includes(email.slice(email.lastIndexOf('@') + 1))) {
    return badRequest('Use a company address: @flood.doctor, @flooddoctorva.com or @restorationdoctors.com. Aries only emails company addresses, and only those can sign in.')
  }
  if (email === 'aries@flood.doctor') return badRequest('That is the address Aries sends from.')

  const team = await loadTeam(env)
  const at = new Date().toISOString()
  const isAdd = source.key === undefined || source.key === null || source.key === ''
  const key = isAdd ? newTeamKey(name, team) : String(source.key)
  const member = isAdd ? null : team.find((candidate) => candidate.key === key)
  if (!isAdd && !member) return missing('That user is not on the list.')
  const holder = team.find((candidate) => candidate.email === email && candidate.key !== key)
  if (holder) return json({ error: `${holder.name} already uses ${email}.` }, 409)

  /** @param {string} field @param {string|null} before @param {string} after */
  const change = (field, before, after) => env.DB.prepare(`
    INSERT INTO team_changes (at, actor_email, user_key, field, old_value, new_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(at, actorEmail, key, field, before, after)

  if (!member) {
    if (team.length >= MAX_TEAM) return badRequest(`The list holds at most ${MAX_TEAM} people.`)
    if (!key) return badRequest('Could not make an id from that name. Try adding a last name.')
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO team_users (key, name, email, past_emails, position, updated_at, updated_by)
        VALUES (?, ?, ?, '[]', (SELECT COALESCE(MAX(position), 0) + 1 FROM team_users), ?, ?)
      `).bind(key, name, email, at, actorEmail),
      change('added', null, `${name} <${email}>`),
    ])
    return json({ ok: true, key, ...teamPayload(await loadTeam(env)) }, 201)
  }

  if (member.name === name && member.email === email) {
    return json({ ok: true, key, changed: false, ...teamPayload(team) })
  }
  // The address a person leaves stays theirs in history: newest first, and never the new one.
  const past = member.email === email
    ? member.past_emails.filter((address) => address !== email)
    : [member.email, ...member.past_emails.filter((address) => address !== member.email && address !== email)]
  const statements = [
    env.DB.prepare(`
      UPDATE team_users
      SET name = ?, email = ?, past_emails = ?, updated_at = ?, updated_by = ?
      WHERE key = ?
    `).bind(name, email, JSON.stringify(past.slice(0, MAX_PAST_EMAILS)), at, actorEmail, key),
  ]
  if (member.name !== name) statements.push(change('name', member.name, name))
  if (member.email !== email) statements.push(change('email', member.email, email))
  const [updated] = await env.DB.batch(statements)
  if (!updated.meta.changes) return json({ error: 'The user list is not set up yet.' }, 409)
  return json({ ok: true, key, changed: true, ...teamPayload(await loadTeam(env)) })
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
export async function handleRequest(request, env) {
  const url = new URL(request.url)
  const host = url.hostname

  if (['/mission', '/api/mission', '/api/mission/push', '/api/mission/answer', '/api/mission/answers'].includes(url.pathname)) return missionRequest(request, env, allowedEmail(request, env) || false)

  if (host !== UI_HOST && host !== SYNC_HOST) return notFound()
  if (url.pathname === '/healthz' && request.method === 'GET') {
    return json({ ok: true })
  }

  if (host === UI_HOST) {
    if (ACTIVITY_PATHS.has(url.pathname)) {
      if (!isActivityOwner(request, env) || !allowedEmail(request, env)) return notFound()
      if (request.method !== 'GET') return methodNotAllowed('GET')
      return url.pathname === '/activity' ? activityPage(env, url) : activityJson(env, url)
    }
    if (url.pathname === TEAM_PATH) {
      const ownerEmail = isActivityOwner(request, env) ? allowedEmail(request, env) : null
      if (!ownerEmail) return notFound()
      if (request.method === 'GET') return json(teamPayload(await loadTeam(env)))
      if (request.method === 'POST') return saveTeamMember(request, env, ownerEmail)
      return methodNotAllowed('GET, POST')
    }
    if (!UI_PATHS.has(url.pathname)) return notFound()
    const actorEmail = allowedEmail(request, env)
    if (!actorEmail) return forbidden()
    if (url.pathname === '/') {
      if (request.method !== 'GET') return methodNotAllowed('GET')
      return appHtml()
    }
    if (url.pathname === '/card') {
      if (request.method !== 'GET') return methodNotAllowed('GET')
      return appHtml(CARD_HTML)
    }
    if (url.pathname === '/api/card' || url.pathname === '/api/card/done') return cardRequest(request, env, actorEmail)
    if (url.pathname === '/api/board') return getBoard(request, env)
    if (url.pathname === '/api/action') return queueAction(request, env, actorEmail)
    if (url.pathname === '/api/todos') return getTodos(request, env)
    if (url.pathname === '/api/worklist') return getWorklist(request, env)
    if (url.pathname === '/api/thread') return getThread(request, env, url)
    if (url.pathname === '/api/todo/action') return saveTodoAction(request, env, actorEmail)
    return notFound()
  }

  if (!SYNC_PATH.test(url.pathname)) return notFound()
  if (!(await validPublisher(request, env))) return unauthorized()
  if (url.pathname === '/api/sync/snapshot') return publishSnapshot(request, env)
  if (url.pathname === '/api/sync/worklist') return publishWorklist(request, env)
  if (url.pathname === '/api/sync/threads') return publishThreads(request, env)
  // Aries keeps its own copy of the roster, so its emails go to the address Frank set here.
  if (url.pathname === '/api/sync/team') {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    return json(teamPayload(await loadTeam(env)))
  }
  if (url.pathname === '/api/sync/commands') return listCommands(request, env, url)
  if (url.pathname === '/api/sync/todos/catalogue') return publishTodoCatalogue(request, env)
  if (url.pathname === '/api/sync/todos/operations') return publishTodoOperations(request, env)
  if (url.pathname === '/api/sync/todos/state') return getTodoState(request, env, url)
  const ackMatch = url.pathname.match(/^\/api\/sync\/commands\/(\d+)\/ack$/)
  if (ackMatch) {
    const commandId = Number(ackMatch[1])
    if (!Number.isSafeInteger(commandId) || commandId <= 0) return badRequest('Invalid command id')
    return acknowledgeCommand(request, env, commandId)
  }
  return notFound()
}

/** @type {ExportedHandler<Env>} */
const worker = {
  async scheduled(event, env, ctx) { ctx.waitUntil(checkServices(env,'cron')) },
  async fetch(request, env) {
    return handleRequest(request, env)
  },
}

export default worker
