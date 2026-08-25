// Thumbs up / thumbs down on a card. These do not change the task; they are how the team tells
// Aries whether an email of that shape should have become a card at all. The card identifies the
// sender, and the sender is what Aries learns, so neither verb carries an argument.
//
// The refusals are the part worth testing: a feedback verb that quietly accepted a value would
// let a caller smuggle state past the queue's CHECK constraints, and a thumb that reached Aries
// without an actor would teach the sweep something nobody can be asked about later.

import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'mark@flood.doctor',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function action(body, email = 'mark@flood.doctor') {
  return new Request(`https://${UI_HOST}/api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Cf-Access-Authenticated-User-Email': email },
    body: JSON.stringify(body),
  })
}

function queued(env) {
  return worker.fetch(new Request(`https://${SYNC_HOST}/api/sync/commands?limit=20`, {
    headers: { authorization: 'Bearer test-publisher-token' },
  }), env, {})
}

test('queues a thumb with the teammate who pressed it, and no argument', async () => {
  const env = settings(new FakeD1Database())

  for (const operation of ['useful', 'not_useful']) {
    const response = await worker.fetch(action({ operation, id: 81 }), env, {})
    assert.equal(response.status, 202, `${operation} should be accepted`)
    const payload = await response.json()
    assert.equal(payload.command.operation, operation)
    assert.equal(payload.command.item_id, 81)
    assert.equal(payload.command.value, null, `${operation} must never carry a value`)
    assert.equal(payload.command.note, null)
    // Aries mutes a sender off the back of this, so the row has to say who asked for it.
    assert.equal(payload.command.actor_email, 'mark@flood.doctor')
  }

  const rows = (await (await queued(env)).json()).commands
  assert.deepEqual(rows.map((row) => row.operation), ['useful', 'not_useful'])
})

test('a value on a thumb is discarded rather than stored', async () => {
  const env = settings(new FakeD1Database())
  const response = await worker.fetch(
    action({ operation: 'not_useful', id: 82, value: 'xactanalysis.com' }), env, {})
  assert.equal(response.status, 202)
  const rows = (await (await queued(env)).json()).commands
  assert.equal(rows[0].value, null)
})

test('an unauthenticated visitor cannot teach the inbox sweep', async () => {
  const env = settings(new FakeD1Database())
  const anonymous = new Request(`https://${UI_HOST}/api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'not_useful', id: 83 }),
  })
  const response = await worker.fetch(anonymous, env, {})
  assert.equal(response.status, 403)
})

test('still refuses a verb that was never exposed to the web', async () => {
  const env = settings(new FakeD1Database())
  for (const operation of ['mute', 'thumbs_down', 'archive']) {
    const response = await worker.fetch(action({ operation, id: 84 }), env, {})
    assert.equal(response.status, 400, `${operation} must be refused`)
  }
})
