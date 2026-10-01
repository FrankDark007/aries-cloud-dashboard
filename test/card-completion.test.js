import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import worker from '../src/index.js'
import { CARD_HTML } from '../src/card-ui.js'

const UI_ORIGIN = 'https://aries.flood.doctor'
const SNAPSHOT_AT = '2020-01-01T10:00:00.000Z'
const BASE_ITEM = Object.freeze({ id: 41, title: 'TEST: review the next step', status: 'open', assignee: 'Frank' })

// Run the production SQL against SQLite, including conditional INSERT and RETURNING.
// The hook lets a competing request change durable state after the worker has read it,
// immediately before its final write. No production services or credentials are used.
function fixture(t, items = [BASE_ITEM]) {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  t.after(() => db.close())
  let beforeInsert = null
  const execute = (sql, values, mode) => {
    if (/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+command_queue/i.test(sql) && beforeInsert) {
      const hook = beforeInsert
      beforeInsert = null
      hook()
    }
    const statement = db.prepare(sql)
    if (mode === 'all') return { results: statement.all(...values), success: true }
    if (mode === 'first') return statement.get(...values) ?? null
    const result = statement.run(...values)
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
  }
  const env = {
    ALLOWED_EMAILS: 'frank@example.test',
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor',
    PUBLISHER_TOKEN: 'TEST-only-publisher',
    STALE_AFTER_SECONDS: '300',
    DB: {
      prepare(sql) {
        return {
          values: [],
          bind(...values) { this.values = values; return this },
          async all() { return execute(sql, this.values, 'all') },
          async first() { return execute(sql, this.values, 'first') },
          async run() { return execute(sql, this.values, 'run') },
        }
      },
    },
  }
  const call = (path, body, options = {}) => {
    const headers = new Headers({
      'Cf-Access-Authenticated-User-Email': 'frank@example.test',
      Origin: UI_ORIGIN,
      'Content-Type': 'application/json',
      ...options.headers,
    })
    for (const header of options.omitHeaders || []) headers.delete(header)
    return worker.fetch(new Request((options.origin || UI_ORIGIN) + path, {
      method: options.method || (body === undefined ? 'GET' : 'POST'),
      headers,
      ...(body === undefined ? {} : { body: options.raw ? body : JSON.stringify(body) }),
    }), env, {})
  }
  const snapshot = (nextItems, publishedAt = SNAPSHOT_AT) => {
    db.prepare(`INSERT INTO board_snapshot (singleton_id, snapshot_json, published_at)
      VALUES (1, ?, ?) ON CONFLICT(singleton_id) DO UPDATE SET
      snapshot_json = excluded.snapshot_json, published_at = excluded.published_at`)
      .run(JSON.stringify({ items: nextItems }), publishedAt)
  }
  const command = (operation, options = {}) => {
    const result = db.prepare(`INSERT INTO command_queue
      (operation, item_id, note, value, actor_email, state, created_at, acked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      operation, options.itemId ?? 41, options.note ?? null, options.value ?? null,
      options.actor ?? 'mark@flood.doctor', options.state ?? 'queued',
      options.createdAt ?? '2020-01-01T11:00:00.000Z', options.ackedAt ?? null,
    )
    return Number(result.lastInsertRowid)
  }
  const card = async (id = 41) => {
    const response = await call('/api/card?id=' + id)
    assert.equal(response.status, 200)
    return response.json()
  }
  const done = (revision, id = 41, options = {}) => call('/api/card/done', { id, revision }, options)
  const rows = () => db.prepare('SELECT * FROM command_queue ORDER BY id').all()
  snapshot(items)
  return { db, call, card, done, snapshot, command, rows, beforeInsert(hook) { beforeInsert = hook } }
}

test('card page and API are authenticated, host-restricted and not unlocked by publisher bearer tokens', async (t) => {
  const f = fixture(t)
  for (const path of ['/card?id=41', '/api/card?id=41', '/api/card/done']) {
    const body = path.endsWith('/done') ? { id: 41, revision: 'untrusted' } : undefined
    for (const email of ['', 'outsider@evil.test', 'staff@flood.doctor.evil.test']) {
      assert.equal((await f.call(path, body, { headers: { 'Cf-Access-Authenticated-User-Email': email } })).status, 403)
    }
    assert.equal((await f.call(path, body, {
      omitHeaders: ['Cf-Access-Authenticated-User-Email'],
      headers: { Authorization: 'Bearer TEST-only-publisher' },
    })).status, 403)
    for (const origin of ['https://aries-publish.flood.doctor', 'https://attacker.example']) {
      assert.equal((await f.call(path, body, { origin })).status, 404)
    }
  }
  assert.equal((await f.call('/card?id=41', undefined, { headers: { 'Cf-Access-Authenticated-User-Email': 'staff@flood.doctor' } })).status, 200)
  assert.equal((await f.call('/api/card?id=41', undefined, { headers: { 'Cf-Access-Authenticated-User-Email': 'staff@flood.doctor' } })).status, 200)
  assert.equal(f.rows().length, 0)
})

test('scanner GET, prefetch and reload never complete a card', async (t) => {
  const f = fixture(t)
  const initial = f.db.prepare('SELECT * FROM board_snapshot').get()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const page = await f.call('/card?id=41&done=true', undefined, { headers: { Purpose: 'prefetch', 'Sec-Purpose': 'prefetch' } })
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type'), /text\/html/)
    assert.equal(page.headers.get('cache-control'), 'no-store')
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(page.headers.get('x-frame-options'), 'DENY')
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    assert.equal((await f.card()).state, 'open')
    const scanner = await f.call('/api/card/done?id=41')
    assert.equal(scanner.status, 405)
    assert.equal(scanner.headers.get('allow'), 'POST')
  }
  assert.equal(f.rows().length, 0)
  assert.deepEqual(f.db.prepare('SELECT * FROM board_snapshot').get(), initial)
})

test('card reads return only the selected card and an opaque revision without changing the snapshot', async (t) => {
  const f = fixture(t, [BASE_ITEM, { id: 42, title: 'TEST: a different card', status: 'open' }])
  const response = await f.call('/api/card?id=41')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.item.id, 41)
  assert.equal(payload.item.title, BASE_ITEM.title)
  assert.equal(payload.state, 'open')
  assert.equal(typeof payload.revision, 'string')
  assert.ok(payload.revision.length)
  assert.equal(payload.items, undefined)
  assert.equal((await f.card()).revision, payload.revision)
  assert.equal(f.rows().length, 0)
})

test('card reads refuse invalid, missing and unknown identifiers', async (t) => {
  const f = fixture(t)
  for (const id of ['', '0', '-1', '1.5', '1e2', '41junk', '9007199254740992', '../41']) {
    assert.equal((await f.call('/api/card?id=' + encodeURIComponent(id))).status, 400, id)
  }
  assert.equal((await f.call('/api/card')).status, 400)
  assert.equal((await f.call('/api/card?id=999')).status, 404)
  f.db.exec('DELETE FROM board_snapshot')
  assert.equal((await f.call('/api/card?id=41')).status, 404)
  assert.equal(f.rows().length, 0)
})

test('completion requires an explicit same-origin JSON POST', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  for (const origin of ['', 'null', 'https://evil.test', 'https://aries.flood.doctor.evil.test', 'http://aries.flood.doctor']) {
    assert.equal((await f.done(revision, 41, { headers: { Origin: origin } })).status, 403, origin)
  }
  assert.equal((await f.done(revision, 41, { omitHeaders: ['Origin'] })).status, 403)
  for (const contentType of ['', 'text/plain', 'application/x-www-form-urlencoded']) {
    assert.equal((await f.done(revision, 41, { headers: { 'Content-Type': contentType } })).status, 415)
  }
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    assert.equal((await f.done(revision, 41, { method })).status, 405)
  }
  for (const method of ['HEAD', 'OPTIONS']) {
    assert.equal((await f.call('/api/card/done?id=41', undefined, { method })).status, 405)
  }
  assert.equal(f.rows().length, 0)
})

test('completion payload shape is exact and cannot inject actor, timestamp or operation', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  const invalid = [
    null, [], {}, { id: 41 }, { revision }, { id: '41', revision }, { id: 0, revision },
    { id: -1, revision }, { id: 1.5, revision }, { id: Number.MAX_SAFE_INTEGER + 1, revision },
    { id: 41, revision: null }, { id: 41, revision: 12 }, { id: 41, revision: '' },
    { id: 41, revision, actor_email: 'attacker@example.test' },
    { id: 41, revision, created_at: '1900-01-01T00:00:00Z' },
    { id: 41, revision, operation: 'delete' },
  ]
  for (const body of invalid) {
    assert.equal((await f.call('/api/card/done', body)).status, 400, JSON.stringify(body))
  }
  assert.equal((await f.call('/api/card/done', '{invalid', { raw: true })).status, 400)
  assert.equal(f.rows().length, 0)
})

test('successful completion records authenticated actor and server time durably and shows Done immediately', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  const original = f.db.prepare('SELECT * FROM board_snapshot').get()
  const before = Date.now()
  const response = await f.done(revision, 41, { headers: { 'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor', 'Content-Type': 'application/json; charset=UTF-8' } })
  assert.equal(response.status, 202)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.saved, true)
  assert.equal(payload.existing, false)
  assert.equal(payload.state, 'done')
  const [row] = f.rows()
  assert.equal(f.rows().length, 1)
  assert.equal(row.operation, 'done')
  assert.equal(row.item_id, 41)
  assert.equal(row.actor_email, 'dom@flood.doctor')
  assert.equal(row.state, 'queued')
  assert.equal(row.note, null)
  assert.equal(row.value, null)
  assert.ok(Date.parse(row.created_at) >= before)
  assert.ok(Date.parse(row.created_at) <= Date.now())
  assert.deepEqual(payload.command, {
    id: row.id, operation: 'done', item_id: 41,
    actor_email: row.actor_email, created_at: row.created_at,
  })
  assert.deepEqual(f.db.prepare('SELECT * FROM board_snapshot').get(), original)
  assert.equal((await f.card()).state, 'done')
  const board = await (await f.call('/api/board')).json()
  assert.equal(board.items.find(item => item.id === 41).status, 'done')
})

test('repeated completion using the original link revision returns existing without duplicate commands', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  assert.equal((await f.done(revision)).status, 202)
  const first = f.rows()[0]
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await f.done(revision)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).existing, true)
  }
  assert.equal(f.rows().length, 1)
  assert.deepEqual(f.rows()[0], first)
})

test('concurrent same-revision completion POSTs atomically create one command', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.done(revision)))
  assert.equal(responses.filter(response => response.status === 202).length, 1)
  assert.equal(responses.filter(response => response.status === 200).length, 7)
  for (const response of responses.filter(response => response.status === 200)) {
    assert.equal((await response.json()).existing, true)
  }
  assert.equal(f.rows().length, 1)
})

test('a card already Done in the published snapshot returns existing without enqueuing work', async (t) => {
  const f = fixture(t, [{ ...BASE_ITEM, status: 'done' }])
  const card = await f.card()
  assert.equal(card.state, 'done')
  const response = await f.done(card.revision)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).existing, true)
  assert.equal(f.rows().length, 0)
})

test('missing and queued-deleted cards cannot be completed', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  assert.equal((await f.done(original.revision, 999)).status, 404)
  f.command('delete')
  assert.equal((await f.card()).state, 'deleted')
  const response = await f.done(original.revision)
  assert.ok(response.status >= 400 && response.status < 500)
  assert.equal(f.rows().length, 1)
  const board = await (await f.call('/api/board')).json()
  assert.equal(board.items.some(item => item.id === 41), false)
  f.snapshot([])
  assert.equal((await f.done(original.revision)).status, 404)
  assert.equal(f.rows().length, 1)
})

test('changed snapshot invalidates an old open-card revision before completion', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.snapshot([{ ...BASE_ITEM, title: 'TEST: changed instructions' }], '2020-01-01T12:00:00.000Z')
  const next = await f.card()
  assert.notEqual(next.revision, original.revision)
  assert.equal((await f.done(original.revision)).status, 409)
  assert.equal(f.rows().length, 0)
  assert.equal((await f.done(next.revision)).status, 202)
})

test('an arbitrary revision cannot complete an open card', async (t) => {
  const f = fixture(t)
  assert.equal((await f.done('old-or-invented-revision')).status, 409)
  assert.equal(f.rows().length, 0)
})

test('queued completion, reopen and deletion are folded in command order', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.command('done')
  const done = await f.card()
  assert.equal(done.state, 'done')
  assert.notEqual(done.revision, original.revision)
  f.command('reopen')
  const reopened = await f.card()
  assert.equal(reopened.state, 'open')
  assert.notEqual(reopened.revision, done.revision)
  f.command('delete')
  assert.equal((await f.card()).state, 'deleted')
  assert.equal(f.rows().length, 3)
})

test('newly applied completion remains visible while the published snapshot catches up', async (t) => {
  const f = fixture(t)
  f.command('done', { state: 'applied', ackedAt: '2020-01-01T11:30:00.000Z' })
  const card = await f.card()
  assert.equal(card.state, 'done')
  assert.equal((await f.done(card.revision)).status, 200)
  assert.equal(f.rows().length, 1)
  assert.equal((await (await f.call('/api/board')).json()).items[0].status, 'done')
})

test('old applied completion does not overwrite a newer reopened snapshot', async (t) => {
  const f = fixture(t)
  f.command('done', { state: 'applied', createdAt: '2019-12-31T10:00:00.000Z', ackedAt: '2019-12-31T11:30:00.000Z' })
  assert.equal((await f.card()).state, 'open')
  assert.equal((await (await f.call('/api/board')).json()).items[0].status, 'open')
})

test('failed commands and unrelated cards do not change a card state or revision', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.command('done', { state: 'failed', ackedAt: '2020-01-01T11:30:00.000Z' })
  f.command('delete', { state: 'failed' })
  f.command('done', { itemId: 42 })
  f.command('note', { note: 'TEST: unrelated to completion state' })
  const current = await f.card()
  assert.equal(current.state, 'open')
  assert.equal(current.revision, original.revision)
  assert.equal((await f.done(current.revision)).status, 202)
  assert.equal(f.rows().filter(row => row.item_id === 41 && row.operation === 'done' && row.state === 'queued').length, 1)
})

test('reopening prevents stale retries and a fresh revision can complete the card again', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  assert.equal((await f.done(original.revision)).status, 202)
  const reopen = await f.call('/api/action', { operation: 'reopen', id: 41 })
  assert.equal(reopen.status, 202)
  const reopened = await f.card()
  assert.equal(reopened.state, 'open')
  assert.notEqual(reopened.revision, original.revision)
  assert.equal((await f.done(original.revision)).status, 409)
  assert.equal((await f.done(reopened.revision)).status, 202)
  assert.deepEqual(f.rows().map(row => row.operation), ['done', 'reopen', 'done'])
  assert.equal((await f.card()).state, 'done')
})

test('conditional completion refuses a snapshot replacement between validation and INSERT', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.beforeInsert(() => f.snapshot([{ ...BASE_ITEM, title: 'TEST: concurrently changed instructions' }]))
  assert.equal((await f.done(original.revision)).status, 409)
  assert.equal(f.rows().length, 0)
  assert.equal((await f.card()).state, 'open')
})

test('conditional completion refuses concurrent deletion rather than queueing a resurrected completion', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.beforeInsert(() => f.command('delete'))
  const response = await f.done(original.revision)
  assert.ok(response.status >= 400 && response.status < 500)
  assert.deepEqual(f.rows().map(row => row.operation), ['delete'])
  assert.equal((await f.card()).state, 'deleted')
})

test('conditional completion returns existing after a competing completion wins before INSERT', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.beforeInsert(() => f.command('done'))
  const response = await f.done(original.revision)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).existing, true)
  assert.equal(f.rows().length, 1)
  assert.equal(f.rows()[0].actor_email, 'mark@flood.doctor')
})

test('conditional completion refuses a concurrent reopen even when both observed states were open', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  f.beforeInsert(() => f.command('reopen'))
  assert.equal((await f.done(original.revision)).status, 409)
  assert.deepEqual(f.rows().map(row => row.operation), ['reopen'])
  assert.equal((await f.card()).state, 'open')
})

test('unrelated snapshot updates do not invalidate the selected card revision', async (t) => {
  const f = fixture(t, [BASE_ITEM, { id: 42, title: 'TEST: other card' }])
  const original = await f.card()
  f.snapshot([BASE_ITEM, { id: 42, title: 'TEST: changed unrelated card' }], '2020-01-01T12:00:00.000Z')
  assert.equal((await f.card()).revision, original.revision)
  assert.equal((await f.done(original.revision)).status, 202)
})

test('corrupt stored snapshots fail closed without queueing completion', async (t) => {
  const f = fixture(t)
  const original = await f.card()
  for (const snapshotJson of ['not-json', '{"items":null}', '{"items":[{"id":41,"title":"secret","kind":"personal"}]}']) {
    f.db.prepare('UPDATE board_snapshot SET snapshot_json = ?').run(snapshotJson)
    assert.equal((await f.call('/api/card?id=41')).status, 503)
    assert.equal((await f.done(original.revision)).status, 503)
    assert.equal(f.rows().length, 0)
  }
})

test('acknowledged lifecycle commands use receipt time and stop overlaying once the snapshot catches up', async (t) => {
  const f = fixture(t, [{ ...BASE_ITEM, status: 'done' }])
  f.command('reopen', { state: 'applied', createdAt: '2019-12-31T10:00:00.000Z', ackedAt: '2020-01-01T11:30:00.000Z' })
  assert.equal((await f.card()).state, 'open')
  assert.equal((await (await f.call('/api/board')).json()).items[0].status, 'open')
  f.snapshot([{ ...BASE_ITEM, status: 'done' }], '2020-01-01T11:30:00.000Z')
  assert.equal((await f.card()).state, 'done')
  assert.equal((await (await f.call('/api/board')).json()).items[0].status, 'done')
})

// Execute the actual inline page script with a minimal DOM. Deferred fetches let us
// exercise interrupted and repeated flows deterministically without a live endpoint.
function pageFixture(search = '?id=41') {
  const nodes = new Map()
  for (const id of ['card', 'title', 'summary', 'state', 'message', 'confirm', 'refresh', 'number']) {
    const listeners = new Map()
    nodes.set(id, {
      textContent: '', hidden: ['confirm', 'refresh', 'summary'].includes(id), disabled: false,
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value },
      addEventListener(name, listener) { listeners.set(name, listener) },
      trigger(name, event = {}) { return listeners.get(name)?.(event) },
      set innerHTML(_value) { throw new Error('Untrusted card content must never be injected as HTML') },
    })
  }
  const requests = []
  const windowEvents = new Map()
  const script = CARD_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]
  runInNewContext(script, {
    URLSearchParams, location: { search },
    document: { querySelector(selector) { return nodes.get(selector.slice(1)) } },
    window: { addEventListener(name, listener) { windowEvents.set(name, listener) } },
    fetch(url, options = {}) {
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }))
    },
  })
  const flush = () => new Promise(resolve => setImmediate(resolve))
  const reply = async (index, payload, status = 200) => {
    requests[index].resolve(Response.json(payload, { status }))
    await flush()
  }
  const open = (revision = 'test-revision', item = BASE_ITEM) => ({ item, state: 'open', revision })
  return { nodes, requests, windowEvents, flush, reply, open }
}

test('confirmation UI loads read-only, safely renders card text, and POSTs only on an explicit click', async () => {
  const p = pageFixture()
  assert.equal(p.requests.length, 1)
  assert.equal(p.requests[0].url, '/api/card?id=41')
  assert.equal(p.requests[0].options.method, undefined)
  assert.equal(p.nodes.get('confirm').hidden, true)
  const title = '<img src=x onerror=alert(1)>'
  await p.reply(0, p.open('reviewed-revision', { ...BASE_ITEM, title, summary: '<script>unsafe()</script>' }))
  assert.equal(p.nodes.get('title').textContent, title)
  assert.equal(p.nodes.get('summary').textContent, '<script>unsafe()</script>')
  assert.equal(p.nodes.get('confirm').hidden, false)
  assert.equal(p.requests.length, 1)
  const firstClick = p.nodes.get('confirm').trigger('click')
  await p.nodes.get('confirm').trigger('click')
  assert.equal(p.requests.length, 2)
  assert.equal(p.requests[1].url, '/api/card/done')
  assert.equal(p.requests[1].options.method, 'POST')
  assert.equal(p.requests[1].options.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(p.requests[1].options.body), { id: 41, revision: 'reviewed-revision' })
  assert.equal(p.nodes.get('confirm').disabled, true)
  assert.equal(p.nodes.get('refresh').disabled, true)
  await p.reply(1, { item: { ...BASE_ITEM, status: 'done' }, state: 'done', saved: true, existing: false }, 202)
  await firstClick
  assert.equal(p.nodes.get('state').textContent, 'Done')
  assert.equal(p.nodes.get('confirm').hidden, true)
  assert.match(p.nodes.get('message').textContent, /Saved for Aries to sync/)
})

test('confirmation UI does not POST for invalid links or an interrupted Access login', async () => {
  const invalid = pageFixture('?id=0')
  await invalid.flush()
  assert.equal(invalid.requests.length, 0)
  assert.equal(invalid.nodes.get('confirm').hidden, true)
  assert.match(invalid.nodes.get('message').textContent, /invalid/)
  const login = pageFixture()
  login.requests[0].resolve(new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } }))
  await login.flush()
  assert.equal(login.nodes.get('confirm').hidden, true)
  assert.match(login.nodes.get('message').textContent, /sign-in may have expired/)
  await login.nodes.get('confirm').trigger('click')
  assert.equal(login.requests.length, 1)
})

test('a lost completion response requires a fresh read before another POST', async () => {
  const p = pageFixture()
  await p.reply(0, p.open())
  const saving = p.nodes.get('confirm').trigger('click')
  p.requests[1].reject(new Error('TEST: connection interrupted'))
  await saving
  assert.equal(p.nodes.get('confirm').hidden, true)
  assert.equal(p.nodes.get('refresh').hidden, false)
  assert.match(p.nodes.get('message').textContent, /Refresh the card/)
  await p.nodes.get('confirm').trigger('click')
  assert.equal(p.requests.length, 2)
  const refresh = p.nodes.get('refresh').trigger('click')
  assert.equal(p.requests[2].options.method, undefined)
  await p.reply(2, { item: { ...BASE_ITEM, status: 'done' }, state: 'done', revision: 'done-revision' })
  await refresh
  assert.equal(p.nodes.get('state').textContent, 'Done')
  assert.equal(p.nodes.get('confirm').hidden, true)
  assert.equal(p.requests.length, 3)
})

test('stale-revision responses hide completion until the user refreshes and reviews', async () => {
  const p = pageFixture()
  await p.reply(0, p.open('old-revision'))
  const saving = p.nodes.get('confirm').trigger('click')
  await p.reply(1, { error: 'This card changed. Review it again before marking it done.' }, 409)
  await saving
  assert.equal(p.nodes.get('confirm').hidden, true)
  assert.match(p.nodes.get('message').textContent, /Review it again/)
  const refreshing = p.nodes.get('refresh').trigger('click')
  await p.reply(2, p.open('fresh-revision', { ...BASE_ITEM, title: 'TEST: changed task' }))
  await refreshing
  assert.equal(p.nodes.get('title').textContent, 'TEST: changed task')
  assert.equal(p.nodes.get('confirm').hidden, false)
  const resaving = p.nodes.get('confirm').trigger('click')
  assert.equal(JSON.parse(p.requests[3].options.body).revision, 'fresh-revision')
  await p.reply(3, { item: { ...BASE_ITEM, status: 'done' }, state: 'done', existing: true })
  await resaving
})

test('Back/Forward revalidates and delayed old reads cannot restore an older confirmation', async () => {
  const p = pageFixture()
  p.windowEvents.get('pageshow')({ persisted: true })
  assert.equal(p.requests.length, 2)
  await p.reply(1, p.open('newest-revision', { ...BASE_ITEM, title: 'TEST: newest task' }))
  await p.reply(0, { item: { ...BASE_ITEM, title: 'TEST: obsolete task', status: 'done' }, state: 'done', revision: 'older-revision' })
  assert.equal(p.nodes.get('title').textContent, 'TEST: newest task')
  assert.equal(p.nodes.get('state').textContent, 'Open')
  assert.equal(p.nodes.get('confirm').hidden, false)
  const saving = p.nodes.get('confirm').trigger('click')
  assert.equal(JSON.parse(p.requests[2].options.body).revision, 'newest-revision')
  await p.reply(2, { item: { ...BASE_ITEM, status: 'done' }, state: 'done', existing: false }, 202)
  await saving
  p.windowEvents.get('pageshow')({ persisted: true })
  assert.equal(p.nodes.get('confirm').hidden, true)
  await p.reply(3, p.open('reopened-revision'))
  assert.equal(p.nodes.get('confirm').hidden, false)
  assert.equal(p.nodes.get('state').textContent, 'Open')
})
