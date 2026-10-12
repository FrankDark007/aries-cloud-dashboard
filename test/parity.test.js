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
    { body: { operation: 'reopen', id: 16 }, value: null },
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

test('a checked-off card can be brought back, and reopen takes no argument', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  // Undo after a mis-click. The queue is what Aries reads, so the reopen has to survive
  // exactly as issued — no note, no value, just the item.
  const undo = await worker.fetch(action({ operation: 'reopen', id: 41 }), env, {})
  assert.equal(undo.status, 202)
  const queued = await worker.fetch(
    new Request(`https://${SYNC_HOST}/api/sync/commands?limit=10`, {
      headers: { authorization: 'Bearer test-publisher-token' },
    }), env, {})
  const payload = await queued.json()
  assert.equal(payload.commands.length, 1)
  assert.equal(payload.commands[0].operation, 'reopen')
  assert.equal(payload.commands[0].item_id, 41)
  assert.equal(payload.commands[0].note, null)
  assert.equal(payload.commands[0].value, null)

  // An argument on reopen is meaningless; accepting one would let a caller smuggle state
  // past the queue's CHECK constraints.
  const withValue = await worker.fetch(action({ operation: 'reopen', id: 42, value: 'open' }), env, {})
  assert.equal(withValue.status, 202)
  const after = await worker.fetch(
    new Request(`https://${SYNC_HOST}/api/sync/commands?limit=10`, {
      headers: { authorization: 'Bearer test-publisher-token' },
    }), env, {})
  const rows = (await after.json()).commands
  assert.equal(rows.length, 1, 'an already received command is not delivered twice')
  assert.equal(rows[0].item_id, 42)
  assert.equal(rows[0].value, null, 'reopen must never carry a value')
})

test('a checked-off card is published so it can be undone, but stays off the open board', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const published = await worker.fetch(publish('/api/sync/snapshot', {
    items: [
      { id: 51, title: 'Still to do', status: 'open' },
      { id: 52, title: 'Checked off by mistake', status: 'done' },
    ],
  }), env, {})
  assert.equal(published.status, 200)

  const board = await worker.fetch(read('/api/board'), env, {})
  const items = (await board.json()).items
  assert.equal(items.length, 2, 'both travel in the snapshot')
  assert.equal(items.filter((item) => item.status === 'done').length, 1, 'the done one is available to undo')
})

test('serves a source email chain to any teammate, whichever mailbox it lives in', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const published = await worker.fetch(publish('/api/sync/threads', {
    threads: [{
      item_id: 61,
      subject: 'Re: claim 00300123752',
      mailbox: 'steve@restorationdoctors.com',
      messages: [
        { from: 'adjuster@carrier.com', to: 'steve@restorationdoctors.com', date: 'Mon, 24 Aug 2026 09:00:00 -0400', body: 'Please send the invoice.', truncated: false },
        { from: 'steve@restorationdoctors.com', to: 'adjuster@carrier.com', date: 'Mon, 24 Aug 2026 09:30:00 -0400', body: 'Attached.', truncated: false },
      ],
    }],
  }), env, {})
  assert.equal(published.status, 200)
  assert.equal((await published.json()).thread_count, 1)

  // Mark owns none of those mailboxes; he must still be able to read the chain.
  const asMark = await worker.fetch(read('/api/thread?id=61', 'mark@flood.doctor'), env, {})
  assert.equal(asMark.status, 200)
  const thread = await asMark.json()
  assert.equal(thread.mailbox, 'steve@restorationdoctors.com')
  assert.equal(thread.messages.length, 2)
  assert.equal(thread.messages[0].body, 'Please send the invoice.')

  const missing = await worker.fetch(read('/api/thread?id=62', 'mark@flood.doctor'), env, {})
  assert.equal(missing.status, 404)

  const anonymous = await worker.fetch(new Request(`https://${UI_HOST}/api/thread?id=61`), env, {})
  assert.equal(anonymous.status, 403, 'an email chain must never be readable without an identity')
})

test('refuses an oversized or malformed thread rather than storing part of it', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const refusals = [
    { threads: [{ item_id: 0, messages: [{ body: 'x' }] }] },
    { threads: [{ item_id: 71, messages: [] }] },
    { threads: [{ item_id: 72, messages: [{ body: 'x'.repeat(4001) }] }] },
    { threads: [{ item_id: 73, messages: Array.from({ length: 21 }, () => ({ body: 'x' })) }] },
    { threads: [{ item_id: 74, messages: [{ body: 'ok' }] }, { item_id: 74, messages: [{ body: 'dupe' }] }] },
  ]
  for (const body of refusals) {
    const response = await worker.fetch(publish('/api/sync/threads', body), env, {})
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 60))
  }
})

test('carries the note history, with its author and time, and refuses a malformed one', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  const notes = [
    { at: '2026-08-24', by: '', text: 'written before notes had an author' },
    { at: '2026-08-25T03:11:02+00:00', by: 'mark@flood.doctor', text: 'called the adjuster back' },
  ]
  const published = await worker.fetch(publish('/api/sync/snapshot', {
    items: [{ id: 91, title: 'Chase the Sedgwick invoice', note: 'called the adjuster back', notes }],
  }), env, {})
  assert.equal(published.status, 200)

  const board = await worker.fetch(read('/api/board'), env, {})
  const item = (await board.json()).items[0]
  assert.deepEqual(item.notes, notes)
  // An unattributed note is expected on older rows and must survive rather than be dropped.
  assert.equal(item.notes[0].by, '')
  assert.equal(item.notes[1].by, 'mark@flood.doctor')

  // A publisher that starts sending something unexpected here should fail loudly.
  const refusals = [
    { id: 92, title: 'x', notes: 'not an array' },
    { id: 93, title: 'x', notes: [{ at: '2026-08-25', by: 'mark@flood.doctor' }] },   // no text
    { id: 94, title: 'x', notes: [{ at: '2026-08-25', by: 12, text: 'ok' }] },
    { id: 95, title: 'x', notes: [{ at: '2026-08-25', by: '', text: 'x'.repeat(2001) }] },
    { id: 96, title: 'x', notes: Array.from({ length: 21 }, () => ({ at: '', by: '', text: 'x' })) },
  ]
  for (const item of refusals) {
    const response = await worker.fetch(publish('/api/sync/snapshot', { items: [item] }), env, {})
    assert.equal(response.status, 400, JSON.stringify(item).slice(0, 70))
  }
})

test('the board says which cards actually have an email chain', async () => {
  const db = new FakeD1Database()
  const env = settings(db)

  await worker.fetch(publish('/api/sync/snapshot', {
    items: [
      { id: 101, title: 'Made from an email' },
      { id: 102, title: 'Never came from an email' },
    ],
  }), env, {})
  await worker.fetch(publish('/api/sync/threads', {
    threads: [{ item_id: 101, subject: 'Re: claim', mailbox: 'steve@restorationdoctors.com',
                messages: [{ from: 'a@b.com', body: 'hello', truncated: false }] }],
  }), env, {})

  const payload = await (await worker.fetch(read('/api/board'), env, {})).json()
  // The UI hides "Open email" on anything absent here. It used to offer the button wherever a
  // link could be BUILT, which is not the same thing: a card whose mailbox could not be
  // resolved got a button whose only job was to say there was no source email.
  assert.deepEqual(payload.thread_ids, [101])
})
