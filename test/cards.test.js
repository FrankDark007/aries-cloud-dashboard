import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

// Frank, 09/29/2026: "I never know what each task needs or who was last to work on that task
// or what I should do about it." These cover the data behind the answer: the brief Aries
// publishes with each card, and the history the worker assembles for it.

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com',
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor,restorationdoctors.com',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function publish(items) {
  return new Request(`https://${SYNC_HOST}/api/sync/snapshot`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-publisher-token', 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  })
}

function as(email, path, init = {}) {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: { 'Cf-Access-Authenticated-User-Email': email, ...(init.headers || {}) },
  })
}

function brief(overrides = {}) {
  return {
    needs: 'Kevin Cigler mailed the lien payoff check on 9/26 and wants us to confirm it arrived.',
    next_step: 'Steve: confirm the Cigler check arrived and reply to Kevin.',
    action: 'reply',
    owner_hint: 'steve',
    waiting_on: 'Kevin Cigler (client)',
    waiting_since: '2026-09-28',
    client: 'Kevin Cigler',
    claim: '',
    amount: '$12,400.00',
    deadline: '2026-10-04',
    deadline_note: 'Lien deadline',
    phone: '',
    counsel_only: false,
    last_ours: { by: 'Steve', at: '2026-09-27T14:05:00Z', what: 'sent Kevin the payoff amount' },
    last_theirs: { by: 'Kevin Cigler (client)', at: '2026-09-28T16:30:00Z', what: 'asked us to confirm the check arrived' },
    messages: 4,
    generated_at: '2026-09-29T23:00:00Z',
    ...overrides,
  }
}

test('a card carries its brief and opening date to the board', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const accepted = await worker.fetch(publish([
    { id: 3612, title: 'Cigler check mailed', status: 'open', created: '2026-09-28', brief: brief() },
  ]), env, {})
  assert.equal(accepted.status, 200)
  assert.equal((await accepted.json()).briefs_dropped, 0)

  const board = await (await worker.fetch(as('steve@restorationdoctors.com', '/api/board'), env, {})).json()
  const [card] = board.items
  assert.equal(card.created, '2026-09-28')
  assert.deepEqual(card.brief, brief())
})

test('an off-contract brief is dropped from its card, counted, and never blocks the board', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  const bad = [
    brief({ action: 'send' }),                       // not an action the card knows
    brief({ owner_hint: 'bob' }),                    // not on the roster
    brief({ needs: 'x'.repeat(401) }),               // over its length limit
    brief({ deadline: '10/04/2026' }),               // not an ISO day
    brief({ counsel_only: 'yes' }),                  // wrong type
    brief({ last_ours: { by: 'Steve', at: 'yesterday', what: 'x' } }),
    brief({ generated_at: undefined }),
  ]
  const items = bad.map((value, index) => ({ id: 100 + index, title: `Card ${index}`, status: 'open', brief: value }))
  items.push({ id: 200, title: 'Good card', status: 'open', brief: brief() })
  const accepted = await worker.fetch(publish(items), env, {})
  assert.equal(accepted.status, 200)
  assert.equal((await accepted.json()).briefs_dropped, bad.length)

  const board = await (await worker.fetch(as('mark@flood.doctor', '/api/board'), env, {})).json()
  assert.equal(board.items.length, bad.length + 1, 'every card is still on the board')
  assert.equal(board.items.filter((item) => item.brief).length, 1)
})

test('a card says who last worked on it: actions, notes and the latest email, newest first', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  await worker.fetch(publish([{
    id: 3612,
    title: 'Cigler check mailed',
    status: 'open',
    notes: [{ at: '2026-09-29T20:10:00-04:00', by: 'aries@flood.doctor', text: 'REOPENED 9/29: confirm the check arrived.' }],
    brief: brief(),
  }]), env, {})
  const assign = await worker.fetch(as('darakhshan.farough@gmail.com', '/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'assign', id: 3612, value: 'steve' }),
  }), env, {})
  assert.equal(assign.status, 202)

  const board = await (await worker.fetch(as('mark@flood.doctor', '/api/board'), env, {})).json()
  const history = board.items[0].history
  assert.deepEqual(history.map((entry) => [entry.who, entry.what, entry.ours]), [
    ['Frank', 'assigned it to Steve', true],
    ['Aries', 'wrote: REOPENED 9/29: confirm the check arrived.', true],
    ['Kevin Cigler (client)', 'asked us to confirm the check arrived', false],
    ['Steve', 'sent Kevin the payoff amount', true],
  ])
})

test('the card layout offers the new controls and still parses', async () => {
  const env = settings(new FakeD1Database())
  const html = await (await worker.fetch(as('mark@flood.doctor', '/'), env, {})).text()
  for (const marker of ['Waiting on', 'Last worked on', 'class="do-this"', 'data-action="more"',
    'data-action="snooze"', 'owner-row', 'Nothing needed', 'Next Monday', "brief.action === 'close'",
    'data-action="nudge"', 'Assign to Aries']) {
    assert.ok(html.includes(marker), marker)
  }
})

test('a nudge is queued with the owner it asks, and the card history says so', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  await worker.fetch(publish([{ id: 3612, title: 'Cigler check mailed', status: 'open', assignee: 'steve' }]), env, {})
  const post = (body) => worker.fetch(as('darakhshan.farough@gmail.com', '/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), env, {})

  const nudged = await post({ operation: 'nudge', id: 3612, value: 'steve' })
  assert.equal(nudged.status, 202)
  assert.equal((await nudged.json()).command.value, 'steve')
  for (const bad of [{ operation: 'nudge', id: 3612 }, { operation: 'nudge', id: 3612, value: 'aries' },
    { operation: 'nudge', id: 3612, value: 'bob' }, { operation: 'nudge', id: 3612, value: '' }]) {
    assert.equal((await post(bad)).status, 400, JSON.stringify(bad))
  }
  const board = await (await worker.fetch(as('mark@flood.doctor', '/api/board'), env, {})).json()
  assert.deepEqual(board.items[0].history.map((entry) => [entry.who, entry.what]), [['Frank', 'asked Steve for an update']])
  assert.equal(board.items[0].assignee, 'steve', 'a nudge changes nothing on the card itself')
})

test('Aries can be given a card like any teammate', async () => {
  const db = new FakeD1Database()
  const env = settings(db)
  await worker.fetch(publish([{ id: 3683, title: 'Lumina Pilates lead', status: 'open' }]), env, {})
  const response = await worker.fetch(as('darakhshan.farough@gmail.com', '/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'assign', id: 3683, value: 'aries' }),
  }), env, {})
  assert.equal(response.status, 202)
  const board = await (await worker.fetch(as('mark@flood.doctor', '/api/board'), env, {})).json()
  assert.equal(board.items[0].assignee, 'aries')
  assert.equal(board.items[0].history[0].what, 'assigned it to Aries')
})
