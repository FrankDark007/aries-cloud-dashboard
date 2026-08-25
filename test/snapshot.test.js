import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'dom@flood.doctor,mark@flood.doctor',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function uiRequest(path) {
  return new Request(`https://${UI_HOST}${path}`, {
    headers: { 'Cf-Access-Authenticated-User-Email': 'mark@flood.doctor' },
  })
}

function syncRequest(path, init = {}) {
  return new Request(`https://${SYNC_HOST}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-publisher-token',
      'content-type': 'application/json',
      ...init.headers,
    },
  })
}

test('publishes a curated snapshot and serves it to an authenticated teammate', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const items = [{
    id: 41,
    title: 'Review carrier estimate',
    summary: 'Coverage decision is ready for review.',
    assignee: 'Mark',
    priority: 1,
    status: 'open',
    due: '2026-08-25',
    kind: 'claim',
    note: 'Confirm depreciation line.',
    updated: '2026-08-24T12:00:00Z',
    msg_id: 'must-not-leave-aries',
    account: 'must-not-leave-aries',
  }]

  const publish = await worker.fetch(syncRequest('/api/sync/snapshot', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }), env, {})
  assert.equal(publish.status, 200)
  const published = await publish.json()
  assert.equal(published.ok, true)
  assert.equal(published.item_count, 1)
  assert.match(published.published_at, /^\d{4}-\d{2}-\d{2}T/)

  const board = await worker.fetch(uiRequest('/api/board'), env, {})
  assert.equal(board.status, 200)
  const payload = await board.json()
  assert.equal(payload.published_at, published.published_at)
  assert.equal(payload.stale.is_stale, false)
  assert.equal(payload.stale.after_seconds, 300)
  assert.deepEqual(payload.items, [{
    id: 41,
    title: 'Review carrier estimate',
    summary: 'Coverage decision is ready for review.',
    assignee: 'Mark',
    priority: 1,
    status: 'open',
    due: '2026-08-25',
    kind: 'claim',
    note: 'Confirm depreciation line.',
    updated: '2026-08-24T12:00:00Z',
  }])
  assert.equal(Object.hasOwn(payload.items[0], 'msg_id'), false)
  assert.equal(Object.hasOwn(payload.items[0], 'account'), false)
})

test('serves a stale last-known snapshot when Aries is offline', async () => {
  const db = new FakeD1Database()
  db.seedSnapshot([{ id: 7, title: 'Last-known assignment' }], '2026-01-01T00:00:00.000Z')

  const board = await worker.fetch(uiRequest('/api/board'), settings(db), {})
  assert.equal(board.status, 200)
  const payload = await board.json()
  assert.deepEqual(payload.items, [{ id: 7, title: 'Last-known assignment' }])
  assert.equal(payload.published_at, '2026-01-01T00:00:00.000Z')
  assert.equal(payload.stale.is_stale, true)
  assert.ok(payload.stale.age_seconds > 300)
})

test('rejects malformed snapshots without replacing the last-known board', async () => {
  const db = new FakeD1Database()
  db.seedSnapshot([{ id: 7, title: 'Keep me' }], '2026-08-24T00:00:00.000Z')

  const invalid = await worker.fetch(syncRequest('/api/sync/snapshot', {
    method: 'POST',
    body: JSON.stringify({ items: [{ id: 'not-a-number', title: '' }] }),
  }), settings(db), {})
  assert.equal(invalid.status, 400)

  const board = await worker.fetch(uiRequest('/api/board'), settings(db), {})
  const payload = await board.json()
  assert.deepEqual(payload.items, [{ id: 7, title: 'Keep me' }])
})

test('fails closed when a snapshot contains a personal item', async () => {
  const db = new FakeD1Database()
  const response = await worker.fetch(syncRequest('/api/sync/snapshot', {
    method: 'POST',
    body: JSON.stringify({ items: [{ id: 19, title: 'Private errand', kind: 'personal' }] }),
  }), settings(db), {})

  assert.equal(response.status, 400)
  assert.equal(db.snapshot, null)
})

test('rejects a curated snapshot before it can exceed the D1 row limit', async () => {
  const db = new FakeD1Database()
  const items = Array.from({ length: 1000 }, (_, index) => ({
    id: index + 1,
    title: `Item ${index + 1}`,
    summary: 's'.repeat(2000),
    note: 'n'.repeat(2000),
  }))
  const response = await worker.fetch(syncRequest('/api/sync/snapshot', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }), settings(db), {})

  assert.equal(response.status, 400)
  assert.equal(db.snapshot, null)
})
