import { APP_HTML } from './ui.js'

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

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
const UI_PATHS = new Set(['/', '/api/board', '/api/action', '/api/todos', '/api/todo/action', '/api/worklist', '/api/thread'])
const SYNC_PATH = /^\/api\/sync\/(?:snapshot|worklist|threads|commands(?:\/\d+\/ack)?|todos\/(?:catalogue|operations|state))$/
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
const ACTOR_NAMES = Object.freeze({
  'darakhshan.farough@gmail.com': 'Frank',
  'frankd@flooddoctorva.com': 'Frank',
  'dom@flood.doctor': 'Dom',
  'mark@flood.doctor': 'Mark',
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
})
// Teammates the board can be assigned to. An assignment is applied by Aries, so this list
// only has to agree with the roster team-tools.sh accepts.
const BOARD_ASSIGNEES = Object.freeze(['frank', 'mark', 'dom', 'steve', 'shayan', 'katherine', 'aries'])
// `useful` / `not_useful` are the thumbs on a card. They change nothing about the task; they
// are how the team tells Aries whether an email of that shape should have become a card at
// all, so the next inbox sweep stops repeating a mistake. Neither takes an argument -- the
// card already identifies the sender, and the sender is what gets learned.
const BOARD_OPERATIONS = Object.freeze([
  'done', 'reopen', 'note', 'assign', 'snooze', 'reorder', 'delete', 'useful', 'not_useful',
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

function appHtml() {
  return new Response(APP_HTML, {
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
function curateItem(item) {
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
  return /** @type {BoardItem} */ (curated)
}

/**
 * @param {unknown} payload
 * @returns {BoardSnapshot|null}
 */
function curateSnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const source = /** @type {Record<string, unknown>} */ (payload)
  if (!Array.isArray(source.items) || source.items.length > MAX_ITEMS) return null
  /** @type {BoardItem[]} */
  const items = []
  const ids = new Set()
  for (const item of source.items) {
    const curated = curateItem(item)
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
  const snapshot = curateSnapshot(await readJson(request))
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
  return json({ ok: true, published_at: publishedAt, item_count: snapshot.items.length })
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

  /** @type {BoardSnapshot|null} */
  let snapshot = null
  try {
    snapshot = curateSnapshot(JSON.parse(row.snapshot_json))
  } catch {
    return json({ error: 'Snapshot unavailable' }, 503)
  }
  if (!snapshot) return json({ error: 'Snapshot unavailable' }, 503)
  const publishedMillis = Date.parse(row.published_at)
  const ageSeconds = Number.isFinite(publishedMillis)
    ? Math.max(0, Math.floor((Date.now() - publishedMillis) / 1000))
    : null
  return json({
    items: snapshot.items,
    published_at: row.published_at,
    stale: {
      is_stale: ageSeconds === null || ageSeconds > threshold,
      age_seconds: ageSeconds,
      after_seconds: threshold,
    },
  })
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
    // An empty assignee is how the UI clears an owner.
    if (value && !BOARD_ASSIGNEES.includes(value)) return badRequest('Unknown assignee')
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
  const inserted = await env.DB.prepare(`
    INSERT INTO command_queue (
      operation, item_id, note, value, actor_email, state, created_at
    ) VALUES (?, ?, ?, ?, ?, 'queued', ?)
  `).bind(action.operation, action.id, note, value, actorEmail, createdAt).run()
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
 * @param {Request} request
 * @param {Env} env
 * @param {string} actorEmail
 * @returns {Promise<Response>}
 */
async function saveTodoAction(request, env, actorEmail) {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  if (!hasJsonContentType(request)) return unsupportedMediaType()
  const actorName = /** @type {Record<string, string>} */ (ACTOR_NAMES)[actorEmail]
  if (!actorName) return forbidden()
  const operation = curateOperation(await readJson(request), { email: actorEmail, name: actorName })
  if (!operation) return badRequest('Invalid todo action')
  const saved = await insertTodoOperation(env, operation)
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
    if (saved.accepted) accepted += 1
    else existing += 1
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
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
export async function handleRequest(request, env) {
  const url = new URL(request.url)
  const host = url.hostname

  if (host !== UI_HOST && host !== SYNC_HOST) return notFound()
  if (url.pathname === '/healthz' && request.method === 'GET') {
    return json({ ok: true })
  }

  if (host === UI_HOST) {
    if (!UI_PATHS.has(url.pathname)) return notFound()
    const actorEmail = allowedEmail(request, env)
    if (!actorEmail) return forbidden()
    if (url.pathname === '/') {
      if (request.method !== 'GET') return methodNotAllowed('GET')
      return appHtml()
    }
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
  async fetch(request, env) {
    return handleRequest(request, env)
  },
}

export default worker
