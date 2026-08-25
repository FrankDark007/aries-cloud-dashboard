// The cloud board was deliberately built as a two-verb read mirror (done, note). Frank asked
// for parity with the board on his own machine, so it now also queues assign, snooze, reorder
// and delete, carries the source email link, and serves Aries' full working list.
//
// The tests that matter here are the refusals: a widened surface is only safe if every new
// argument is still validated, and if a personal row still cannot reach the web by any route.

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

function action(body, email = 'dom@flood.doctor') {
  return new Request(`https://${UI_HOST}/api/action`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Cf-Access-Authenticated-User-Email': email,
    },
    body: JSON.stringify(body),
  })
}

function publish(path, body) {
  return new Request(`https://${SYNC_HOST}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-publisher-token',
    },
    body: JSON.stringify(body),
  })
}

function read(path, email = 'dom@flood.doctor') {
  return new Request(`https://${UI_HOST}${path}`, {
    headers: { 'Cf-Access-Authenticated-User-Email': email },
  })
}

test('queues every operation the local board supports, with its argument', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const cases = [
    { body: { operation: 'assign', id: 11, value: 'Steve' }, value: 'steve' },
    { body: { operation: 'assign', id: 12, value: '' }, value: '' },
    { body: { operation: 'snooze', id: 13, value: '2026-09-01' }, value: '2026-09-01' },
    { body: { operation: 'reorder', id: 14, value: 3 }, value: '3' },
    { body: { operation: 'delete', id: 15 }, value: null },
  ]

  for (const { body, value } of cases) {
    const response = await worker.fetch(action(body), env, {})
    assert.equal(response.status, 202, `${body.operation} should be accepted`)
    const payload = await response.json()
    assert.equal(payload.command.operation, body.operation)
    assert.equal(payload.command.item_id, body.id)
    assert.equal(payload.command.value, value, `${body.operation} argument`)
    assert.equal(payload.command.actor_email, 'dom@flood.doctor')
  }
})

test('refuses a malformed argument on every widened operation', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const refusals = [
    { operation: 'assign', id: 21, value: 'the-intern' },      // not on the roster
    { operation: 'assign', id: 22 },                            // missing entirely
    { operation: 'snooze', id: 23, value: 'next tuesday' },     // not an ISO date
    { operation: 'snooze', id: 24, value: '2026-13-45' },       // shaped right, not a date
    { operation: 'reorder', id: 25, value: 0 },                 // positions start at 1
    { operation: 'reorder', id: 26, value: 'first' },           // not a number
    { operation: 'archive', id: 27 },                           // never exposed to the web
  ]

  for (const body of refusals) {
    const response = await worker.fetch(action(body), env, {})
    assert.equal(response.status, 400, `${body.operation} ${JSON.stringify(body.value)} must be refused`)
  }
})

test('carries the source email link through to the board', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const sourceUrl = 'https://mail.google.com/mail/u/0/#all/1a03556450dc8149'

  const published = await worker.fetch(publish('/api/sync/snapshot', {
    items: [{ id: 31, title: 'Reply on claim C620015899', source_url: sourceUrl, kind: 'adjuster' }],
  }), env, {})
  assert.equal(published.status, 200)

  const board = await worker.fetch(read('/api/board'), env, {})
  const payload = await board.json()
  assert.equal(payload.items[0].source_url, sourceUrl)
})

test('serves the full working list and refuses a personal row', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const ok = await worker.fetch(publish('/api/sync/worklist', {
    items: [
      { id: 0, text: 'Chase the Sedgwick invoice', who: 'Mark', due: '2026-08-30', done: false },
      { id: 1, text: 'File the SCC annual fee', done: true },
    ],
  }), env, {})
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).item_count, 2)

  const listed = await worker.fetch(read('/api/worklist'), env, {})
  assert.equal(listed.status, 200)
  const payload = await listed.json()
  assert.equal(payload.items.length, 2)
  assert.equal(payload.items[0].who, 'Mark')
  assert.equal(payload.items[1].done, true)
  assert.equal(payload.stale.is_stale, false)

  // A personal row must be refused outright rather than quietly dropped, so a publisher
  // that stops filtering fails loudly instead of leaking one row at a time.
  const leak = await worker.fetch(publish('/api/sync/worklist', {
    items: [{ id: 0, text: 'Chime card PIN changed', personal: true }],
  }), env, {})
  assert.equal(leak.status, 400)
})

test('the full working list is not readable without an Access identity', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const anonymous = new Request(`https://${UI_HOST}/api/worklist`)
  const response = await worker.fetch(anonymous, env, {})
  assert.equal(response.status, 403)
})
