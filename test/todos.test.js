import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
const TASK_ID = 'task-0123456789abcd'
const ADDED_ID = 'task-fedcba98765432'

function settings(db, overrides = {}) {
  return {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com,frankd@flooddoctorva.com,dom@flood.doctor,mark@flood.doctor',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
    ...overrides,
  }
}

function ui(path, init = {}, email = 'mark@flood.doctor') {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: {
      'Cf-Access-Authenticated-User-Email': email,
      ...init.headers,
    },
  })
}

function sync(path, init = {}) {
  return new Request(`https://${SYNC_HOST}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-publisher-token',
      'content-type': 'application/json',
      ...init.headers,
    },
  })
}

function catalogueItem(overrides = {}) {
  return {
    id: TASK_ID,
    text: 'Confirm tomorrow\'s crew',
    details: 'Call before 4 PM.',
    client: 'Example Client',
    actionType: 'call',
    notificationDate: '2026-08-24',
    date: '2026-08-24',
    due: '2026-08-25',
    sourceUrl: 'https://mail.google.com/example',
    sourceMessageId: 'message-1',
    sourceAccount: 'shared@example.com',
    sourceRevision: 'rev-1',
    upstreamIds: ['gmail:message-1'],
    assignee: 'Dom',
    who: 'Shoghi',
    section: 'Today',
    seedDone: false,
    ...overrides,
  }
}

async function publishCatalogue(db, items = [catalogueItem()]) {
  return worker.fetch(sync('/api/sync/todos/catalogue', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }), settings(db), {})
}

test('publishes the curated v2 catalogue and serves a stale-aware effective list', async () => {
  const db = new FakeD1Database()
  const source = catalogueItem({ localPath: '/private/fd-todos/items.json' })
  const publish = await publishCatalogue(db, [source])

  assert.equal(publish.status, 200)
  const published = await publish.json()
  assert.equal(published.ok, true)
  assert.equal(published.item_count, 1)
  assert.match(published.published_at, /^\d{4}-\d{2}-\d{2}T/)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.published_at, published.published_at)
  assert.equal(payload.stale.is_stale, false)
  assert.equal(payload.sequence, 0)
  assert.deepEqual(payload.items, [{
    ...catalogueItem(),
    done: false,
    attachments: [],
    snoozedUntil: null,
    archived: false,
  }])
  assert.equal(Object.hasOwn(payload.items[0], 'localPath'), false)
})

test('keeps the last-known v2 list available when the Aries publisher is offline', async () => {
  const db = new FakeD1Database()
  db.seedTodoCatalogue([catalogueItem()], '2026-01-01T00:00:00.000Z')

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.items[0].id, TASK_ID)
  assert.equal(payload.published_at, '2026-01-01T00:00:00.000Z')
  assert.equal(payload.stale.is_stale, true)
  assert.ok(payload.stale.age_seconds > 300)
})

test('refuses empty, personal, duplicate, malformed, overlong, and oversized catalogue replacement', async () => {
  const invalidCatalogues = [
    [],
    [catalogueItem({ id: '1' })],
    [catalogueItem({ text: '' })],
    [catalogueItem({ seedDone: 'no' })],
    [catalogueItem(), catalogueItem({ text: 'duplicate' })],
    [catalogueItem({ kind: 'personal' })],
    [catalogueItem({ personal: true })],
    [catalogueItem({ text: 'x'.repeat(1001) })],
    [catalogueItem({ upstreamIds: Array.from({ length: 51 }, (_, index) => `source:${index}`) })],
  ]

  for (const items of invalidCatalogues) {
    const db = new FakeD1Database()
    db.seedTodoCatalogue([catalogueItem({ text: 'Keep me' })], '2026-08-24T00:00:00.000Z')
    const response = await publishCatalogue(db, items)
    assert.equal(response.status, 400, JSON.stringify(items).slice(0, 180))
    assert.equal(JSON.parse(db.todoCatalogue.catalogue_json).items[0].text, 'Keep me')
  }

  const db = new FakeD1Database()
  const tooLarge = Array.from({ length: 1000 }, (_, index) => catalogueItem({
    id: `task-${index.toString(16).padStart(14, '0')}`,
    text: `Task ${index} ${'x'.repeat(930)}`,
    details: 'd'.repeat(4000),
  }))
  const response = await publishCatalogue(db, tooLarge)
  assert.equal(response.status, 400)
  assert.equal(db.todoCatalogue, null)
})

test('maps the Access identity server-side and replays a durable UI action immediately', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const eventId = 'ui-0123456789abcdef'
  const clientTs = '2026-08-24T12:00:00.000Z'
  const action = await worker.fetch(ui('/api/todo/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId,
      item_id: TASK_ID,
      operation: 'toggle',
      payload: { done: true },
      client_ts: clientTs,
    }),
  }), settings(db), {})

  assert.equal(action.status, 202)
  const saved = await action.json()
  assert.equal(saved.accepted, true)
  assert.equal(saved.operation.actor_email, 'mark@flood.doctor')
  assert.equal(saved.operation.actor_name, 'Mark')
  assert.equal(saved.operation.client_ts, clientTs)
  assert.equal(saved.operation.sequence, 1)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  const current = await response.json()
  assert.equal(current.items[0].done, true)
  assert.equal(current.sequence, 1)
})

test('accepts publisher operations idempotently and returns catalogue plus operations after a D1 sequence', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const operations = [
    {
      event_id: 'event-00000000000001',
      item_id: TASK_ID,
      operation: 'assign',
      payload: { assignee: 'Mark' },
      actor_email: 'aries@flood.doctor',
      actor_name: 'Aries',
      client_ts: '2026-08-24T12:01:00.000Z',
    },
    {
      event_id: 'event-00000000000002',
      item_id: TASK_ID,
      operation: 'snooze',
      payload: { until: '2026-08-27T13:00:00.000Z' },
      actor_email: 'aries@flood.doctor',
      actor_name: 'Aries',
      client_ts: '2026-08-24T12:02:00.000Z',
    },
  ]

  const first = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST',
    body: JSON.stringify({ operations }),
  }), settings(db), {})
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { ok: true, accepted: 2, existing: 0, last_sequence: 2 })

  const replay = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST',
    body: JSON.stringify({ operations }),
  }), settings(db), {})
  assert.deepEqual(await replay.json(), { ok: true, accepted: 0, existing: 2, last_sequence: 2 })

  const state = await worker.fetch(sync('/api/sync/todos/state?after=1'), settings(db), {})
  assert.equal(state.status, 200)
  const pulled = await state.json()
  assert.equal(pulled.catalogue.items[0].id, TASK_ID)
  assert.equal(pulled.catalogue_published_at, db.todoCatalogue.published_at)
  assert.equal(pulled.latest_sequence, 2)
  assert.equal(pulled.operations.length, 1)
  assert.deepEqual({
    sequence: pulled.operations[0].sequence,
    event_id: pulled.operations[0].event_id,
    operation: pulled.operations[0].operation,
    payload: pulled.operations[0].payload,
  }, {
    sequence: 2,
    event_id: 'event-00000000000002',
    operation: 'snooze',
    payload: { until: '2026-08-27T13:00:00.000Z' },
  })
})

test('replays edit, attach, detach, archive, add, and delete operations deterministically', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const operations = [
    ['edit', TASK_ID, { changes: { text: 'Updated task', details: 'Updated details' } }],
    ['attach', TASK_ID, { attachments: [{ id: 'att-1', kind: 'link', name: 'estimate.pdf', url: 'https://files.example/estimate.pdf' }] }],
    ['detach', TASK_ID, { attachmentIds: ['att-1'] }],
    ['archive', TASK_ID, { archived: true }],
    ['add', ADDED_ID, { item: catalogueItem({ id: ADDED_ID, text: 'Added in D1', seedDone: true }) }],
    ['delete', TASK_ID, {}],
  ].map(([operation, item_id, payload], index) => ({
    event_id: `event-${(index + 10).toString().padStart(14, '0')}`,
    item_id,
    operation,
    payload,
    actor_email: 'aries@flood.doctor',
    actor_name: 'Aries',
    client_ts: `2026-08-24T12:${String(index + 10).padStart(2, '0')}:00.000Z`,
  }))

  const save = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST',
    body: JSON.stringify({ operations }),
  }), settings(db), {})
  assert.equal(save.status, 200)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  const current = await response.json()
  assert.equal(current.items.length, 2)
  const deleted = current.items.find((item) => item.id === TASK_ID)
  const added = current.items.find((item) => item.id === ADDED_ID)
  assert.equal(deleted.text, 'Updated task')
  assert.equal(deleted.archived, true)
  assert.equal(added.text, 'Added in D1')
  assert.equal(added.done, true)
})

test('reopening a deleted task restores the native reducer archived state', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const operations = [
    ['delete', {}, 'event-delete'],
    ['toggle', { done: false }, 'event-reopen'],
  ].map(([operation, payload, event_id], index) => ({
    event_id,
    item_id: TASK_ID,
    operation,
    payload,
    actor_email: 'aries@flood.doctor',
    actor_name: 'Aries',
    client_ts: `2026-08-24T12:3${index}:00.000Z`,
  }))
  const save = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST', body: JSON.stringify({ operations }),
  }), settings(db), {})
  assert.equal(save.status, 200)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  const current = await response.json()
  assert.equal(current.items[0].done, false)
  assert.equal(current.items[0].archived, false)
})

test('preserves completion snapshots and revisions when the current catalogue no longer has the item', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const missingId = 'task-11111111111111'
  const save = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST',
    body: JSON.stringify({ operations: [{
      event_id: 'event-completion-snapshot',
      item_id: missingId,
      operation: 'toggle',
      payload: {
        done: true,
        sourceRevision: 7,
        item: {
          id: missingId,
          text: 'Completed historical task',
          details: 'Retained for checked-off history.',
          client: 'Example Client',
          actionType: 'needs_review',
          notificationDate: null,
          sourceUrl: null,
          due: null,
          assignee: 'mark',
          attachments: [],
          sourceRevision: 7,
          historyVisible: true,
        },
      },
      actor_email: 'aries@flood.doctor',
      actor_name: 'Aries',
      client_ts: '2026-08-24T12:20:00.000Z',
    }] }),
  }), settings(db), {})
  assert.equal(save.status, 200)

  const state = await worker.fetch(sync('/api/sync/todos/state?after=0'), settings(db), {})
  const pulled = await state.json()
  assert.equal(pulled.operations[0].payload.sourceRevision, 7)
  assert.equal(pulled.operations[0].payload.item.id, missingId)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  const current = await response.json()
  const historical = current.items.find((item) => item.id === missingId)
  assert.equal(historical.done, true)
  assert.equal(historical.historyVisible, true)
})

test('strictly rejects malformed action envelopes and per-verb payloads', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const base = {
    event_id: 'ui-0123456789abcdef',
    item_id: TASK_ID,
    operation: 'toggle',
    payload: { done: true },
    client_ts: '2026-08-24T12:00:00.000Z',
  }
  const invalid = [
    { ...base, extra: true },
    { ...base, event_id: 'spaces are invalid' },
    { ...base, item_id: 'task-short' },
    { ...base, operation: 'unknown' },
    { ...base, payload: { done: 'true' } },
    { ...base, operation: 'assign', payload: { assignee: 42 } },
    { ...base, operation: 'add', payload: { item: catalogueItem({ id: ADDED_ID }) } },
    { ...base, operation: 'edit', payload: { changes: {} } },
    { ...base, operation: 'attach', payload: { attachments: [{ id: 'a', kind: 'file', name: 'x', bytes: 'secret' }] } },
    { ...base, operation: 'detach', payload: { attachmentIds: [''] } },
    { ...base, operation: 'snooze', payload: { until: 'not-a-date' } },
    { ...base, operation: 'archive', payload: {} },
    { ...base, operation: 'delete', payload: { force: true } },
  ]

  for (const body of invalid) {
    const response = await worker.fetch(ui('/api/todo/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), settings(db), {})
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 220))
  }

  const unknownActor = await worker.fetch(ui('/api/todo/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(base),
  }, 'newhire@flood.doctor'), settings(db, { ALLOWED_EMAILS: 'newhire@flood.doctor' }), {})
  assert.equal(unknownActor.status, 403)
})
