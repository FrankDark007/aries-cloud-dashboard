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

test('queues only teammate-authorized done and note commands with the actor identity', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const done = await worker.fetch(action({ operation: 'done', id: 81 }), env, {})
  assert.equal(done.status, 202)
  const donePayload = await done.json()
  assert.deepEqual({
    id: donePayload.command.id,
    operation: donePayload.command.operation,
    item_id: donePayload.command.item_id,
    note: donePayload.command.note,
    actor_email: donePayload.command.actor_email,
  }, {
    id: 1,
    operation: 'done',
    item_id: 81,
    note: null,
    actor_email: 'dom@flood.doctor',
  })

  const note = await worker.fetch(action({ operation: 'note', id: 82, note: '  Call complete.  ' }), env, {})
  assert.equal(note.status, 202)

  const queued = await worker.fetch(sync('/api/sync/commands?limit=10'), env, {})
  assert.equal(queued.status, 200)
  assert.deepEqual(await queued.json(), {
    commands: [
      {
        id: 1,
        operation: 'done',
        item_id: 81,
        note: null,
        value: null,
        actor_email: 'dom@flood.doctor',
        created_at: donePayload.command.created_at,
      },
      {
        id: 2,
        operation: 'note',
        item_id: 82,
        note: 'Call complete.',
        value: null,
        actor_email: 'dom@flood.doctor',
        created_at: db.commands[1].created_at,
      },
    ],
    count: 2,
  })
})

test('rejects unsafe operations and invalid action payloads without queueing', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const rejected = [
    { operation: 'draft', id: 1 },
    { operation: 'ask', id: 1 },
    { operation: 'todo', id: 1 },
    { operation: 'reorder', id: 1 },
    { operation: 'assign', id: 1 },
    { operation: 'snooze', id: 1 },
    { operation: 'done', id: 0 },
    { operation: 'done', id: '1' },
    { operation: 'note', id: 1, note: '   ' },
    { operation: 'note', id: 1, note: 'x'.repeat(2001) },
  ]

  for (const payload of rejected) {
    const response = await worker.fetch(action(payload), env, {})
    assert.equal(response.status, 400, JSON.stringify(payload))
  }

  const crossSiteSimpleRequest = await worker.fetch(new Request(`https://${UI_HOST}/api/action`, {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor',
    },
    body: JSON.stringify({ operation: 'done', id: 99 }),
  }), env, {})
  assert.equal(crossSiteSimpleRequest.status, 415)
  assert.equal(db.commands.length, 0)
})

test('acknowledges a queued command exactly once and removes it from the pending feed', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  await worker.fetch(action({ operation: 'done', id: 91 }), env, {})

  const ack = await worker.fetch(sync('/api/sync/commands/1/ack', {
    method: 'POST',
    body: JSON.stringify({ status: 'applied', detail: 'board updated' }),
  }), env, {})
  assert.equal(ack.status, 200)
  const ackPayload = await ack.json()
  assert.equal(ackPayload.ok, true)
  assert.equal(ackPayload.id, 1)
  assert.equal(ackPayload.status, 'applied')
  assert.match(ackPayload.acked_at, /^\d{4}-\d{2}-\d{2}T/)

  const secondAck = await worker.fetch(sync('/api/sync/commands/1/ack', {
    method: 'POST',
    body: JSON.stringify({ status: 'applied' }),
  }), env, {})
  assert.equal(secondAck.status, 404)

  const pending = await worker.fetch(sync('/api/sync/commands'), env, {})
  assert.deepEqual(await pending.json(), { commands: [], count: 0 })
})
